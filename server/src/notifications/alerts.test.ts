import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PushMessage } from './push.js';

/*
 * Typed to the signatures they stand in for, rather than `(...args: unknown[])`.
 *
 * `unknown[]` made every read of a recorded call `any`, which is how destructuring the first call
 * straight out of the array came to be written here: under `noUncheckedIndexedAccess` that index
 * is possibly-undefined and does not compile. With real parameter types the recorded calls carry
 * their own shape, so `pushMsg.title` is checked rather than merely assumed.
 */
const sendMock = vi.fn<(walletId: string, msg: PushMessage) => Promise<void>>();
const queryMock = vi.fn<(sql: string, params: unknown[]) => Promise<unknown[]>>();

vi.mock('./push.js', () => ({
  send: (walletId: string, msg: PushMessage) => sendMock(walletId, msg),
}));

vi.mock('../db/index.js', () => ({
  query: (sql: string, params: unknown[]) => queryMock(sql, params),
}));

/**
 * The arguments of a call that must have happened, or a sentence saying it did not.
 *
 * Reaching through a possibly-undefined index with `!` asserts the very thing the assertion on the
 * next line is there to check. This states it once, and fails legibly when it is wrong.
 */
function firstCall<Args extends unknown[]>(fn: { mock: { calls: Args[] } }, what: string): Args {
  const [call] = fn.mock.calls;
  if (!call) throw new Error(`${what} was never called`);
  return call;
}

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
    const [walletId, pushMsg] = firstCall(sendMock, 'send');
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
    const [sql, params] = firstCall(queryMock, 'query');
    expect(sql).toContain('INSERT INTO messages');
    expect(params[1]).toBe('wallet-123');
    expect(params[2]).toBe('Momentum Scout');
    const parsedBody: unknown = JSON.parse(String(params[3]));
    expect(parsedBody).toMatchObject({ symbol: 'NVDAx', notionalUsd: 50 });
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
    const [walletId, pushMsg] = firstCall(sendMock, 'send');
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
    const [sql, params] = firstCall(queryMock, 'query');
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
    const [walletId, pushMsg] = firstCall(sendMock, 'send');
    expect(walletId).toBe('wallet-123');
    expect(pushMsg.title).toBe('xorr: Trading Stopped');
    expect(pushMsg.body).toContain('Delegation permission revoked');
    expect(pushMsg.data).toMatchObject({
      action: 'kill',
      signature: '5K3yTestSignatureSolanaKill',
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = firstCall(queryMock, 'query');
    expect(sql).toContain('INSERT INTO messages');
    expect(params[1]).toBe('wallet-123');
  });
});
