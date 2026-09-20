import { describe, it, expect } from 'vitest';
import { pnlStructure, pnlStructureFromDetail } from './pnl';
import type { Split } from '@/data/strategyLibrary';

const split = (over: Partial<Split> = {}): Split => ({
  returnPct: 2.48, maxDdPct: 2.67, sharpe: 0.84, expectancyR: 0.09, trades: 107,
  winRate: 53.27, wins: 57, losses: 50, profitFactor: 1.461, feesUsd: 1.3,
  avgWinUsd: 0.1741, avgLossUsd: -0.1358, ...over,
});

describe('pnlStructure', () => {
  it('derives gross profit and loss from the means, which is exact', () => {
    const p = pnlStructure(split())!;
    expect(p.grossProfitUsd).toBeCloseTo(57 * 0.1741, 6);
    expect(p.grossLossUsd).toBeCloseTo(50 * -0.1358, 6);
    expect(p.netUsd).toBeCloseTo(p.grossProfitUsd + p.grossLossUsd, 6);
    expect(p.winRate).toBeCloseTo(57 / 107, 6);
  });

  /*
   * The whole reason this module exists. The familiar report draws commission as a fourth bar
   * under gross profit and gross loss; here the net already includes it, so subtracting again
   * would put the net out by the fee total and the bars would not add up.
   */
  it('does not subtract fees from the net — they are already inside it', () => {
    const p = pnlStructure(split())!;
    expect(p.netUsd).toBeCloseTo(p.grossProfitUsd + p.grossLossUsd, 6);
    expect(p.netUsd).not.toBeCloseTo(p.grossProfitUsd + p.grossLossUsd - 1.3, 6);
    expect(p.feesUsd).toBe(1.3);
  });

  it('is null when the split did not record the pieces, rather than zero', () => {
    expect(pnlStructure(split({ avgWinUsd: null }))).toBeNull();
    expect(pnlStructure(split({ wins: null }))).toBeNull();
    expect(pnlStructure(split({ wins: 0, losses: 0 }))).toBeNull();
  });

  it('keeps the loss negative, so a bar can take its direction from the data', () => {
    expect(pnlStructure(split())!.grossLossUsd).toBeLessThan(0);
  });
});

describe('pnlStructureFromDetail', () => {
  /* Reconciles on real rows: liq_absorption is gross +168.70 / -264.48 against a recorded -95.80. */
  it('prefers the recorded net over the derived one', () => {
    const p = pnlStructureFromDetail({
      wins: 43, losses: 48, avgWinUsd: 3.9233, avgLossUsd: -5.51, totalPnlUsd: -95.8, totalFeesUsd: 51.93,
    })!;
    expect(p.netUsd).toBe(-95.8);
    expect(p.grossProfitUsd + p.grossLossUsd).toBeCloseTo(-95.8, 0);
    expect(p.feesUsd).toBe(51.93);
  });

  it('is null without the counts', () => {
    expect(pnlStructureFromDetail({ wins: null, losses: 4, avgWinUsd: 1, avgLossUsd: -1, totalPnlUsd: 0, totalFeesUsd: 0 })).toBeNull();
  });
});
