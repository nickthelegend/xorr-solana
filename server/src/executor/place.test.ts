/**
 * `guardAndSpend` is the only path that moves an owner's USDC. Two properties it must keep whatever goes wrong
 * (TESTPLAN-SOLANA J2, J3): a rules engine that fails refuses the order rather than waving it through, and a quote that
 * fails leaves every unit of USDC where it was — the transfer happens only after a quote has been had.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Keypair } from '@solana/web3.js';

const DELEGATE = Keypair.generate();
const VAULT = Keypair.generate();
const PAYER = Keypair.generate();
const OWNER = Keypair.generate().publicKey.toBase58();

const evaluateMock = vi.fn();
const quoteMock = vi.fn();
const spendMock = vi.fn();
const markBroadcastMock = vi.fn();

vi.mock('../solana/delegation.js', () => ({
  readDelegation: vi.fn(async () => ({
    isRevoked: false,
    delegate: DELEGATE.publicKey.toBase58(),
    delegatedAmount: 1_000_000_000n,
    remainingUsd: 1000,
  })),
  spendAsDelegate: (...a: unknown[]) => spendMock(...a),
  returnToOwner: vi.fn(),
  usdToBaseUnits: (usd: number) => BigInt(Math.round(usd * 1e6)),
  baseUnitsToUsd: (u: bigint) => Number(u) / 1e6,
}));
vi.mock('../http/request-id.js', () => ({ markBroadcast: () => markBroadcastMock() }));
vi.mock('../solana/keys.js', () => ({ delegateKeypair: () => DELEGATE, venueVaultKeypair: () => VAULT, payerKeypair: () => PAYER }));
// The vault's USDC account is made idempotently before a buy moves anything (2026-09-25); here it simply exists.
vi.mock('@solana/spl-token', async (original) => ({
  ...(await original<typeof import('@solana/spl-token')>()),
  getOrCreateAssociatedTokenAccount: vi.fn(async () => ({ address: VAULT.publicKey })),
}));
vi.mock('../solana/balances.js', () => ({
  ataFor: () => Keypair.generate().publicKey,
  tokenProgramForMint: vi.fn(),
  readMintScale: vi.fn(),
  toUiAmount: vi.fn(),
  fromUiAmount: vi.fn(),
}));
vi.mock('../rules/engine.js', () => ({ evaluate: (...a: unknown[]) => evaluateMock(...a), recordSpend: vi.fn() }));
vi.mock('../db/index.js', () => ({ tx: vi.fn() }));
vi.mock('../venues/xstocks.js', () => ({
  XSTOCKS: { NVDAx: { symbol: 'NVDAx', address: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', decimals: 8 } },
  xStockKey: (s: string) => s,
  xStockPriceUsd: vi.fn(async () => 223),
}));
vi.mock('../venues/jupiter.js', () => ({
  quote: (...a: unknown[]) => quoteMock(...a),
  swap: vi.fn(),
  resolveMint: (s: string) => s,
}));
vi.mock('../solana/eligibility.js', () => ({ checkEligibility: vi.fn(async () => ({ eligible: true })) }));
// Every mint these tests name is on the cluster; which are is `settleable.ts`'s question, read from the chain.
const onClusterMock = vi.fn(async (a: string[]) => new Set(a));
vi.mock('../solana/settleable.js', () => ({ mintsOnCluster: (a: string[]) => onClusterMock(a) }));
vi.mock('../solana/grant.js', () => ({
  readSolanaPolicy: vi.fn(async () => ({ dailyCapUsd: 300, expiresAt: Date.now() + 86_400_000, revoked: false })),
}));

const { readDelegation } = await import('../solana/delegation.js');
const { readSolanaPolicy } = await import('../solana/grant.js');
const { guardAndSpend } = await import('./place.js');

const BUY = { walletId: 'w1', ownerPubkey: OWNER, symbol: 'NVDAx', usd: 25 };

describe('guardAndSpend, when something fails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evaluateMock.mockResolvedValue({ allowed: true, spentTodayUsd: 0, remainingUsd: 300 });
  });

  it('refuses — fails closed — when the rules engine throws', async () => {
    evaluateMock.mockRejectedValue(new Error('database unreachable'));

    const out = await guardAndSpend(BUY);
    expect(out).toMatchObject({ placed: false, status: 'blocked', reason: 'rules_unavailable' });
    expect(quoteMock).not.toHaveBeenCalled();
    expect(spendMock).not.toHaveBeenCalled();
  });

  it('refuses a symbol whose mint this cluster does not hold, before reading or moving anything', async () => {
    onClusterMock.mockResolvedValueOnce(new Set());

    expect(await guardAndSpend(BUY)).toMatchObject({ placed: false, reason: 'not_on_cluster' });
    expect(quoteMock).not.toHaveBeenCalled();
    expect(spendMock).not.toHaveBeenCalled();
  });

  it('moves no USDC when the quote fails', async () => {
    quoteMock.mockRejectedValue(new Error('no route'));

    expect(await guardAndSpend(BUY)).toMatchObject({ placed: false, status: 'blocked', reason: 'no_quote' });
    expect(markBroadcastMock).not.toHaveBeenCalled();
    expect(spendMock).not.toHaveBeenCalled();
  });

  it('asks for the quote before the transfer, and marks the broadcast between them', async () => {
    const order: string[] = [];
    quoteMock.mockImplementation(async () => (order.push('quote'), { outAmount: '1' }));
    markBroadcastMock.mockImplementation(async () => void order.push('broadcast'));
    spendMock.mockImplementation(async () => {
      order.push('spend');
      throw new Error('stop here');
    });

    await guardAndSpend(BUY).catch(() => undefined);
    expect(order).toEqual(['quote', 'broadcast', 'spend']);
  });
});

describe('an empty USDC delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evaluateMock.mockResolvedValue({ allowed: true, spentTodayUsd: 0, remainingUsd: 300 });
    vi.mocked(readDelegation).mockResolvedValue({
      isRevoked: true,
      delegate: null,
      delegatedAmount: 0n,
      remainingUsd: 0,
    } as never);
  });

  it('tells someone who never granted to grant, not that they revoked something', async () => {
    vi.mocked(readSolanaPolicy).mockResolvedValue(null as never);

    const out = await guardAndSpend(BUY);
    expect(out).toMatchObject({ placed: false, reason: 'no_permission' });
    expect((out as { detail: string }).detail).not.toMatch(/revoked/i);
    expect(spendMock).not.toHaveBeenCalled();
  });

  it('says revoked when a grant was recorded and the chain no longer names the delegate', async () => {
    vi.mocked(readSolanaPolicy).mockResolvedValue({ dailyCapUsd: 300, expiresAt: Date.now() + 86_400_000, revoked: true } as never);

    const out = await guardAndSpend(BUY);
    expect(out).toMatchObject({ placed: false, reason: 'delegation_revoked' });
    expect(spendMock).not.toHaveBeenCalled();
  });
});

describe("an agent's own wallet (2026-09-23)", () => {
  const WALLET = Keypair.generate().publicKey.toBase58();
  const AGENT = { ...BUY, agentWallet: { address: WALLET, name: 'Momentum Scout' } };

  beforeEach(() => {
    vi.clearAllMocks();
    evaluateMock.mockResolvedValue({ allowed: true, spentTodayUsd: 0, remainingUsd: 300 });
  });

  it('reads and spends the agent wallet, not the owner main account', async () => {
    vi.mocked(readDelegation).mockResolvedValue({
      isRevoked: false,
      delegate: DELEGATE.publicKey.toBase58(),
      delegatedAmount: 2n ** 64n - 1n,
      balanceAmount: 100_000_000n,
      balanceUsd: 100,
      remainingUsd: 1e13,
    } as never);
    quoteMock.mockResolvedValue({ outAmount: '1' });
    spendMock.mockRejectedValue(new Error('stop here'));

    await guardAndSpend(AGENT).catch(() => undefined);
    expect(vi.mocked(readDelegation).mock.calls[0]?.[3]).toBe(WALLET);
    expect(spendMock.mock.calls[0]?.[0]).toMatchObject({ sourceAccount: WALLET });
  });

  it('refuses in words when the wallet holds less than the entry, before quoting or moving anything', async () => {
    vi.mocked(readDelegation).mockResolvedValue({
      isRevoked: false,
      delegate: DELEGATE.publicKey.toBase58(),
      delegatedAmount: 2n ** 64n - 1n,
      balanceAmount: 10_000_000n,
      balanceUsd: 10,
      remainingUsd: 1e13,
    } as never);

    const out = await guardAndSpend(AGENT);
    expect(out).toMatchObject({ placed: false, reason: 'agent_wallet_empty' });
    expect((out as { detail: string }).detail).toContain("Momentum Scout's wallet holds 10.00 USDC");
    expect(quoteMock).not.toHaveBeenCalled();
    expect(spendMock).not.toHaveBeenCalled();
  });
});
