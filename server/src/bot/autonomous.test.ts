import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Keypair } from '@solana/web3.js';

const oneMock = vi.fn();
const queryMock = vi.fn();
const evaluateMock = vi.fn();
const readDelegationMock = vi.fn();
const guardAndSpendMock = vi.fn();
const armExitsMock = vi.fn();
const notifyEntryMock = vi.fn();
const earningsCalendarMock = vi.fn();

vi.mock('../db/index.js', () => ({
  one: (...args: unknown[]) => oneMock(...args),
  query: (...args: unknown[]) => queryMock(...args),
  tx: vi.fn((cb: (c: unknown) => unknown) => cb({})),
}));

vi.mock('../rules/engine.js', () => ({
  evaluate: (...args: unknown[]) => evaluateMock(...args),
}));

vi.mock('../solana/delegation.js', () => ({
  readDelegation: (...args: unknown[]) => readDelegationMock(...args),
}));

vi.mock('../executor/place.js', () => ({
  guardAndSpend: (...args: unknown[]) => guardAndSpendMock(...args),
}));

vi.mock('../executor/order.js', () => ({
  armExits: (...args: unknown[]) => armExitsMock(...args),
}));

vi.mock('../notifications/alerts.js', () => ({
  notifyEntry: (...args: unknown[]) => notifyEntryMock(...args),
}));

vi.mock('../market/edgar.js', () => ({
  earningsCalendar: (...args: unknown[]) => earningsCalendarMock(...args),
}));

vi.mock('./llm.js', () => ({
  speak: vi.fn(async () => ({ ok: true, text: 'Optimal entry setup.' })),
}));

const { evaluateBestSetup, runAutonomousCycle, autonomousAgentSweep } = await import('./autonomous.js');

const MOCK_SOLANA_OWNER = Keypair.generate().publicKey.toBase58();

describe('autonomous xStocks trading agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue([]);
    oneMock.mockResolvedValue(null);
    earningsCalendarMock.mockResolvedValue(null);
  });

  describe('evaluateBestSetup', () => {
    it('analyzes xStocks universe and selects highest scoring strategy setup', async () => {
      // Mock NVDA having earnings in 6 days (peak event-driven score)
      earningsCalendarMock.mockImplementation(async (symbol: string) => {
        if (symbol === 'NVDAx') {
          return {
            symbol: 'NVDAx',
            nextAt: Date.now() + 6 * 86_400_000,
            confirmed: true,
          };
        }
        return null;
      });

      const best = await evaluateBestSetup();
      expect(best).not.toBeNull();
      expect(best!.symbol).toBe('NVDAx');
      expect(best!.strategyKind).toBe('event-driven');
      expect(best!.persona).toBe('earnings-desk');
      expect(best!.score).toBeGreaterThanOrEqual(90);
      expect(best!.stopPrice).toBeLessThan(best!.currentPrice);
      expect(best!.targetPrice).toBeGreaterThan(best!.currentPrice);
    });
  });

  describe('runAutonomousCycle', () => {
    it('refuses execution if wallet has agents stopped by kill switch', async () => {
      oneMock.mockResolvedValue({
        id: 'wallet-1',
        address: MOCK_SOLANA_OWNER,
        agents_stopped: true,
      });

      const result = await runAutonomousCycle('wallet-1');
      expect(result.executed).toBe(false);
      if (!result.executed) {
        expect(result.reason).toBe('agents_stopped');
      }
      expect(guardAndSpendMock).not.toHaveBeenCalled();
    });

    it('refuses execution if on-chain SPL delegation is revoked', async () => {
      oneMock.mockResolvedValue({
        id: 'wallet-1',
        address: MOCK_SOLANA_OWNER,
        agents_stopped: false,
      });
      readDelegationMock.mockResolvedValue({
        delegatedUsd: 500,
        revoked: true,
      });

      const result = await runAutonomousCycle('wallet-1');
      expect(result.executed).toBe(false);
      if (!result.executed) {
        expect(result.reason).toBe('delegation_revoked');
      }
      expect(guardAndSpendMock).not.toHaveBeenCalled();
    });

    it('executes trade through guardAndSpend, arms exits, writes proposal, and sends notification', async () => {
      oneMock.mockResolvedValue({
        id: 'wallet-1',
        address: MOCK_SOLANA_OWNER,
        agents_stopped: false,
      });
      readDelegationMock.mockResolvedValue({
        delegatedUsd: 1000,
        revoked: false,
      });
      evaluateMock.mockResolvedValue({
        allowed: true,
        remainingUsd: 800,
      });
      guardAndSpendMock.mockResolvedValue({
        signature: '5K3yTestAutonomousEntrySignature',
        slot: 289412950,
        symbol: 'NVDAx',
        units: 0.1154,
        price: 216.5,
        usd: 25,
      });
      armExitsMock.mockResolvedValue({
        strategyId: 'strat-exit-123',
        sentence: 'Exit set',
      });

      const result = await runAutonomousCycle('wallet-1', { fixedUsd: 25 });
      expect(result.executed).toBe(true);
      if (result.executed) {
        expect(result.receipt.signature).toBe('5K3yTestAutonomousEntrySignature');
        expect(result.exitStrategyId).toBe('strat-exit-123');
        expect(result.proposalId).toBeDefined();
      }

      // Check guardAndSpend called with sizing
      expect(guardAndSpendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: 'wallet-1',
          ownerAddress: MOCK_SOLANA_OWNER,
          usd: 25,
          venue: 'jupiter',
        }),
      );

      // Check armExits called
      expect(armExitsMock).toHaveBeenCalledTimes(1);

      // Check proposal record written
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO proposals'),
        expect.arrayContaining(['wallet-1', 'Momentum Scout']),
      );

      // Check notification dispatched
      expect(notifyEntryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: 'wallet-1',
          notionalUsd: 25,
          signature: '5K3yTestAutonomousEntrySignature',
        }),
      );
    });
  });

  describe('autonomousAgentSweep', () => {
    it('iterates eligible wallets and triggers cycle execution with cooldown protection', async () => {
      // 2 wallets in DB
      queryMock.mockResolvedValueOnce([
        { id: 'wallet-active-1' },
        { id: 'wallet-active-2' },
      ]);

      // wallet-active-1 traded recently (cooldown)
      oneMock.mockImplementation(async (sql: string, params: unknown[]) => {
        if (sql.includes('FROM proposals') && Array.isArray(params) && params[0] === 'wallet-active-1') {
          return { id: 'recent-prop-id' };
        }
        if (sql.includes('FROM wallets') && Array.isArray(params) && params[0] === 'wallet-active-2') {
          return { id: 'wallet-active-2', address: MOCK_SOLANA_OWNER, agents_stopped: false };
        }
        return null;
      });

      readDelegationMock.mockResolvedValue({ delegatedUsd: 1000, revoked: false });
      evaluateMock.mockResolvedValue({ allowed: true, remainingUsd: 500 });
      guardAndSpendMock.mockResolvedValue({
        signature: '5K3ySweepSig',
        slot: 12345,
        symbol: 'TSLAx',
        units: 0.1,
        price: 395.2,
        usd: 25,
      });
      armExitsMock.mockResolvedValue({ strategyId: 'exit-1' });

      const count = await autonomousAgentSweep();
      // wallet-active-1 was skipped due to cooldown; wallet-active-2 executed
      expect(count).toBe(1);
    });
  });
});
