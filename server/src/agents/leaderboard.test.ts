/**
 * The leaderboard's credit and its speed (PLAN.md 2.2).
 *
 * Runs were credited by searching the wallet's audit log for each run's id inside JSON, and priced
 * one symbol after another. These drive the real `leaderboard` with the database and the price feed
 * replaced by recorders.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  entries: [] as Record<string, unknown>[],
  sql: [] as string[],
}));

vi.mock('../db/index.js', () => ({
  query: vi.fn(async (text: string) => {
    h.sql.push(text);
    // The autonomous entries are read from proposals (2026-09-26); everything else is the strategy runs.
    return /FROM proposals/.test(text) ? h.entries : h.rows;
  }),
}));
vi.mock('../market/prices.js', () => ({ priceOf: vi.fn() }));

const { priceOf } = await import('../market/prices.js');
const { leaderboard } = await import('./leaderboard.js');

const run = (over: Record<string, unknown>) => ({
  kind: 'dca',
  persona_id: null,
  symbol: 'WETH',
  usd: '100',
  units: '0.05',
  price: '2000',
  ...over,
});

const entry = (board: Awaited<ReturnType<typeof leaderboard>>, id: string) =>
  board.find((b) => b.id === id)!;

beforeEach(() => {
  h.rows = [];
  h.entries = [];
  h.sql.length = 0;
  vi.mocked(priceOf).mockReset();
});

describe('credit', () => {
  it('goes to the agent that owns the strategy, else to the persona that runs its kind', async () => {
    vi.mocked(priceOf).mockResolvedValue(2_500);
    h.rows = [
      run({ kind: 'dca', persona_id: 'earnings-desk' }),
      run({ kind: 'momentum' }),
      run({ kind: 'exit-rules', units: '0.01' }),
    ];
    const board = await leaderboard('wallet-1');
    // 0.05 × 2,500 − 100 = +25 each; 0.01 × 2,500 − 100 = −75.
    expect(entry(board, 'earnings-desk')).toMatchObject({ trades: 1, pnl30d: 25, win: 100 });
    expect(entry(board, 'momentum-scout')).toMatchObject({ trades: 1, pnl30d: 25 });
    expect(entry(board, 'drawdown-guard')).toMatchObject({
      trades: 1,
      pnl30d: -75,
      win: 0,
      metric: '0% win rate',
    });
  });

  it('a run no persona ran is on nobody’s record — not Yield Keeper’s', async () => {
    vi.mocked(priceOf).mockResolvedValue(2_500);
    h.rows = [run({ kind: 'dca' }), run({ kind: 'rebalance' })];
    const board = await leaderboard('wallet-1');
    expect(board.every((b) => b.trades === 0)).toBe(true);
    expect(entry(board, 'yield-keeper').metric).toBe('No trades yet');
  });

  it('is found with a join, not by searching the audit log', async () => {
    await leaderboard('wallet-1');
    expect(h.sql[0]).not.toMatch(/audit_log/);
    expect(h.sql[0]).toMatch(/LEFT JOIN agents/);
  });
});

describe('pricing', () => {
  it('asks once per symbol, all at once, and leaves out what it cannot price', async () => {
    let inFlight = 0;
    let peak = 0;
    vi.mocked(priceOf).mockImplementation(async (symbol: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      if (symbol === 'NOFEED') throw new Error('No price feed for NOFEED');
      return symbol === 'WETH' ? 2_500 : 60_000;
    });
    h.rows = [
      run({ kind: 'momentum', symbol: 'WETH' }),
      run({ kind: 'momentum', symbol: 'WETH' }),
      run({ kind: 'momentum', symbol: 'cbBTC', units: '0.002' }),
      run({ kind: 'momentum', symbol: 'NOFEED' }),
    ];
    const board = await leaderboard('wallet-1');
    expect(
      vi
        .mocked(priceOf)
        .mock.calls.map((c) => c[0])
        .sort(),
    ).toEqual(['NOFEED', 'WETH', 'cbBTC']);
    expect(peak).toBe(3);
    // 25 + 25 + (0.002 × 60,000 − 100 = 20); the unpriced run is not counted at all.
    expect(entry(board, 'momentum-scout')).toMatchObject({ trades: 3, pnl30d: 70 });
  });
});

describe('autonomous entries (2026-09-26)', () => {
  const proposal = (over: Record<string, unknown>) => ({
    agent: 'Momentum Scout',
    persona: 'momentum-scout',
    symbol: 'WETH',
    usd: '10',
    units: '0.005',
    price: '2000',
    held_units: '0',
    sold_amount: null,
    ...over,
  });

  it('counts every entry in the window, open or closed — not only open sleeves', async () => {
    vi.mocked(priceOf).mockResolvedValue(2_010);
    h.entries = [
      // Still held: 0.005 × 2,010 − 10 = +0.05.
      proposal({ agent: 'Yield Keeper', persona: 'yield-keeper', held_units: '0.005' }),
      // Sold by the owner for $9.98: realized −0.02.
      proposal({ sold_amount: '$9.98' }),
    ];
    const board = await leaderboard('wallet-1');
    expect(entry(board, 'yield-keeper')).toMatchObject({
      trades: 1,
      pnl30d: 0.05,
      win: 100,
      metric: '100% win rate',
    });
    expect(entry(board, 'momentum-scout')).toMatchObject({ trades: 1, pnl30d: -0.02, win: 0 });
    const sql = h.sql.find((q) => /FROM proposals/.test(q))!;
    expect(sql).toMatch(/decision = \$2/);
    expect(sql).not.toMatch(/position_sleeves/);
  });

  it('an unpriced entry is still a trade, valued at its own fill', async () => {
    vi.mocked(priceOf).mockRejectedValue(new Error('no feed'));
    h.entries = [proposal({ held_units: '0.005' })];
    const board = await leaderboard('wallet-1');
    expect(entry(board, 'momentum-scout')).toMatchObject({ trades: 1, pnl30d: 0 });
  });

  it('credits by name when the payload has no persona id, and ignores a sale that cannot be this entry', async () => {
    vi.mocked(priceOf).mockResolvedValue(2_000);
    h.entries = [proposal({ persona: null, agent: 'Drawdown Guard', sold_amount: '$500.00' })];
    const board = await leaderboard('wallet-1');
    // $500 is not this $10 entry's sale, so it is marked instead: 0.005 × 2,000 − 10 = 0.
    expect(entry(board, 'drawdown-guard')).toMatchObject({ trades: 1, pnl30d: 0 });
  });
});
