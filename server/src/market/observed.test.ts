import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ query: vi.fn() }));
const { dayChangePct, hourlyCloses } = await import('./observed.js');

const H = 60 * 60_000;
const T0 = Date.UTC(2026, 8, 19, 0, 0, 0);

describe('hourlyCloses', () => {
  it('keeps the last reading in each hour, oldest hour first', () => {
    expect(
      hourlyCloses([
        { at: T0 + 2 * H + 5, usd: 12 },
        { at: T0 + 10, usd: 1 },
        { at: T0 + 50 * 60_000, usd: 2 },
        { at: T0 + H + 1, usd: 3 },
      ]),
    ).toEqual([2, 3, 12]);
  });
});

describe('dayChangePct', () => {
  it('is the change against the price a day before the newest point', () => {
    const rows = [
      { at: T0, usd: 100 },
      { at: T0 + 12 * H, usd: 104 },
      { at: T0 + 24 * H, usd: 110 },
    ];
    expect(dayChangePct(rows)).toBeCloseTo(10, 9);
  });

  it('says nothing when the series is shorter than a day', () => {
    expect(dayChangePct([{ at: T0, usd: 100 }, { at: T0 + 6 * H, usd: 120 }])).toBeUndefined();
  });
});

describe('ohlcRows', () => {
  it('folds readings into open/high/low/close per bucket, skipping empty buckets', async () => {
    const { ohlcRows } = await import('./observed.js');
    const M = 60_000;
    const rows = ohlcRows(
      [
        { at: T0 + 5 * M, usd: 10 },
        { at: T0 + 10 * M, usd: 12 },
        { at: T0 + 20 * M, usd: 9 },
        { at: T0 + 25 * M, usd: 11 },
        { at: T0 + 95 * M, usd: 20 },
      ],
      30 * M,
    );
    expect(rows).toEqual([
      [T0, 10, 12, 9, 11],
      [T0 + 90 * M, 20, 20, 20, 20],
    ]);
  });
});
