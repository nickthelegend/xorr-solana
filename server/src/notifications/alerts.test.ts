import { describe, expect, it, vi, beforeEach } from 'vitest';

const sendMock = vi.fn();
const queryMock = vi.fn();

vi.mock('./push.js', () => ({
  send: (...args: unknown[]) => sendMock(...args),
}));

vi.mock('../db/index.js', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

const { notifyEntry, notifyExit, notifyKill } = await import('./alerts.js');

describe('notifications alerts', () => {
  beforeEach(() => {
    sendMock.mockReset();
    queryMock.mockReset();
    queryMock.mockResolvedValue([]);
  });

  it('notifyEntry sends push notification and saves chat drawer message', async () => {
    await notifyEntry({
      walletId: 'wallet-123',
      symbol: 'NVDAx',
      strategyKind: 'momentum',
      notionalUsd: 50,
      units: 0.2309,
      price: 216.5,
      signature: '5K3yTestSignatureSolanaEntry',
      rationale: 'Breakout above 20-day high with strong volume.',
      agentName: 'Momentum Scout',
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [walletId, pushMsg] = sendMock.mock.calls[0];
    expect(walletId).toBe('wallet-123');
    expect(pushMsg.title).toContain('Momentum Scout Traded');
    expect(pushMsg.body).toContain('NVDAx');
    expect(pushMsg.body).toContain('$50.00');
    expect(pushMsg.body).toContain('$216.50');
    expect(pushMsg.data).toMatchObject({
      action: 'entry',
      symbol: 'NVDAx',
      strategyKind: 'momentum',
      notionalUsd: 50,
      signature: '5K3yTestSignatureSolanaEntry',
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('INSERT INTO messages');
    expect(params[1]).toBe('wallet-123');
    expect(params[2]).toBe('Momentum Scout');
    const parsedBody = JSON.parse(params[3]);
    expect(parsedBody.symbol).toBe('NVDAx');
    expect(parsedBody.notionalUsd).toBe(50);
  });

  it('notifyExit sends exit notification with pnl and proceeds', async () => {
    await notifyExit({
      walletId: 'wallet-123',
      symbol: 'TSLAx',
      reason: 'Take-profit target triggered at $420.00',
      units: 0.5,
      price: 420.0,
      proceedsUsd: 210.0,
      pnlUsd: 15.0,
      signature: '5K3yTestSignatureSolanaExit',
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [walletId, pushMsg] = sendMock.mock.calls[0];
    expect(walletId).toBe('wallet-123');
    expect(pushMsg.title).toBe('xorr: Position Closed');
    expect(pushMsg.body).toContain('TSLAx');
    expect(pushMsg.body).toContain('$210.00');
    expect(pushMsg.body).toContain('+$15.00');
    expect(pushMsg.data).toMatchObject({
      action: 'exit',
      symbol: 'TSLAx',
      proceedsUsd: 210.0,
      pnlUsd: 15.0,
      signature: '5K3yTestSignatureSolanaExit',
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('INSERT INTO messages');
    expect(params[1]).toBe('wallet-123');
  });

  it('notifyKill sends kill switch alert and persists to chat drawer', async () => {
    await notifyKill({
      walletId: 'wallet-123',
      reason: 'Delegation permission revoked on-chain.',
      signature: '5K3yTestSignatureSolanaKill',
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [walletId, pushMsg] = sendMock.mock.calls[0];
    expect(walletId).toBe('wallet-123');
    expect(pushMsg.title).toBe('xorr: Trading Stopped');
    expect(pushMsg.body).toContain('Delegation permission revoked');
    expect(pushMsg.data).toMatchObject({
      action: 'kill',
      signature: '5K3yTestSignatureSolanaKill',
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('INSERT INTO messages');
    expect(params[1]).toBe('wallet-123');
  });
});
