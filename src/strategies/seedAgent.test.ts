import { describe, it, expect } from 'vitest';
import { seedFromStrategy } from './seedAgent';
import type { StrategyDetail, Split } from '@/data/strategyLibrary';

const split = (o: Partial<Split> = {}): Split => ({
  returnPct: 2.48, maxDdPct: 2.67, sharpe: 0.84, expectancyR: 0.09, trades: 107,
  winRate: 53.27, wins: 57, losses: 50, profitFactor: 1.461, feesUsd: 1.3,
  avgWinUsd: 0.1741, avgLossUsd: -0.1358, ...o,
});
const strat = (o: Partial<StrategyDetail> = {}): StrategyDetail => ({
  id: 'liq_squeeze_break_perp', name: 'Liq Squeeze Break', family: 'Liquidation Flow',
  about: null, aboutSource: null, survives: true, failedOn: [],
  single: { inSample: split(), outOfSample: split() },
  portfolio: { inSample: split(), outOfSample: split() },
  sensitivity: { label: '5/5', expectancyR: [] },
  doubleCommission: { expectancyR: 0.07, returnPct: 1.17 },
  crossAsset: [], detail: null, ...o,
});

describe('seedFromStrategy', () => {
  it('builds the role from what was measured, not from adjectives', () => {
    const s = seedFromStrategy(strat());
    expect(s.role).toContain('53% win rate');
    expect(s.role).toContain('1.46 profit factor');
    expect(s.role).toContain('Survived the gauntlet');
    expect(s.role.length).toBeLessThanOrEqual(80);
  });

  it('says a cut strategy was cut', () => {
    expect(seedFromStrategy(strat({ survives: false })).role).toContain('Cut by the gauntlet');
  });

  /*
   * The one rule with a measurement behind it: something that fell further than it made is a
   * drawdown problem, so it goes to the agent whose job is cutting risk.
   */
  it('recommends Drawdown Guard when it fell further than it made', () => {
    const s = seedFromStrategy(strat({
      portfolio: { inSample: split(), outOfSample: split({ returnPct: 0.19, maxDdPct: 3.0 }) },
    }));
    expect(s.style).toBe('drawdown-guard');
    expect(s.why).toContain('fell further than it made');
  });

  /*
   * The default fixture is Liq Squeeze Break's real numbers, and it genuinely fell 2.67% against a
   * 2.48% return — so it earns Drawdown Guard. Momentum Scout needs a strategy that made more than
   * it gave back, which is b200_sess_8: +2.50% against 1.86%.
   */
  it('recommends Momentum Scout when it made more than it gave back', () => {
    const s = seedFromStrategy(strat({
      portfolio: { inSample: split(), outOfSample: split({ returnPct: 2.5, maxDdPct: 1.86 }) },
    }));
    expect(s.style).toBe('momentum-scout');
    expect(s.why).toContain('2.50%');
  });

  /* Neither of these trades an earnings calendar or manages cash; suggesting them would be a label. */
  it('never suggests the two personas nothing in the book does', () => {
    for (const dd of [0.1, 3, 50]) {
      const s = seedFromStrategy(strat({ portfolio: { inSample: split(), outOfSample: split({ maxDdPct: dd }) } }));
      expect(['momentum-scout', 'drawdown-guard']).toContain(s.style);
    }
  });

  it('keeps the name inside the route limit and sidesteps one already taken', () => {
    const s = seedFromStrategy(strat({ name: 'Adaptive Percentile Reversion Perp' }));
    expect(s.name.length).toBeLessThanOrEqual(24);
    const dup = seedFromStrategy(strat(), ['liq squeeze break']);
    expect(dup.name.toLowerCase()).not.toBe('liq squeeze break');
    expect(dup.name.length).toBeLessThanOrEqual(24);
  });

  it('carries no risk limits — the research sized at $1,000, which is nobody here', () => {
    expect(Object.keys(seedFromStrategy(strat()))).toEqual(['name', 'role', 'style', 'why']);
  });
});
