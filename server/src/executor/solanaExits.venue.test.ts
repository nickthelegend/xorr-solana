/**
 * What an exit writes down about its own sale (2026-09-20).
 *
 * The sweep recorded the run with no venue, side or class, so a stop that sold through Jupiter counted as
 * `unrecorded` in `/metrics` and in fill quality — the executor's own answer to "where do the bot's sales fill" was
 * blind to the sales it makes unattended, which are the ones nobody watched.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const captured: { text: string; params: unknown[] }[] = [];
const client = { query: (text: string, params: unknown[]) => { captured.push({ text, params }); return Promise.resolve({ rows: [] }); } };

vi.mock('../db/index.js', () => ({
  one: vi.fn(async () => ({ id: 's1' })),
  query: vi.fn(async (text: string) => (/FROM strategies/.test(text)
    ? [{ id: 's1', wallet_id: 'w1', label: 'Exit NVDAx', symbol: 'NVDAx', params: { entryPrice: 200, takeProfitPct: 10, stopLossPct: 5 }, address: 'owner', agents_stopped: false }]
    : [])),
  tx: vi.fn(async (fn: (c: unknown) => Promise<void>) => fn(client)),
}));
vi.mock('../audit/log.js', () => ({ append: vi.fn() }));
vi.mock('../positions/index.js', () => ({ applyFill: vi.fn() }));
vi.mock('../notifications/push.js', () => ({ send: vi.fn(async () => undefined) }));
vi.mock('../solana/delegation.js', () => ({ readDelegation: vi.fn(async () => ({ balanceAmount: 100_000_000n })) }));
vi.mock('../solana/balances.js', () => ({ readMintScale: vi.fn(async () => ({ decimals: 8, multiplier: 1 })), toUiAmount: () => 1 }));
vi.mock('../venues/xstocks.js', () => ({
  XSTOCKS: { NVDAx: { symbol: 'NVDAx', address: 'Xsc9', decimals: 8 } },
  xStockKey: (s: string) => s,
  xStockPriceUsd: vi.fn(async () => 230),
}));
const guard = vi.fn(async (_intent?: unknown) => ({ placed: true, usd: 230, filledUnits: 1, fillPrice: 230, signature: 'sig', venue: 'jupiter-route', slot: 9 }));
vi.mock('./place.js', () => ({ guardAndSpend: (a: unknown) => guard(a) }));

const { solanaExitSweep } = await import('./solanaExits.js');

describe('the run an exit records', () => {
  beforeEach(() => captured.splice(0, captured.length));

  it('carries the venue it filled at, the side and the asset class', async () => {
    const fired = await solanaExitSweep(new Date());
    expect(fired).toBe(1);

    const insert = captured.find((q) => /INSERT INTO strategy_runs/.test(q.text));
    expect(insert, 'the exit records a run').toBeTruthy();
    expect(insert!.text).toMatch(/venue/);
    expect(insert!.params).toContain('jupiter-route');
    expect(insert!.text).toMatch(/'sell'/);
    expect(insert!.text).toMatch(/'equity'/);
  });

  it('ends every other exit on the holding it sold, so none fires later on shares bought after', async () => {
    await solanaExitSweep(new Date());
    const siblings = captured.find((q) => /UPDATE strategies SET state = 'ended'/.test(q.text) && /id <> \$3/.test(q.text));
    expect(siblings, 'the sibling exits are ended').toBeTruthy();
    expect(siblings!.params).toEqual(['w1', 'NVDAx', 's1']);
  });
});
