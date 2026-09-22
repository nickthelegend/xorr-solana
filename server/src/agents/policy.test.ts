import { describe, expect, it } from 'vitest';
import { allowsSymbol, policyOf, policySize, policyStop } from './policy.js';

describe('an agent policy', () => {
  it('only narrows: a per-trade limit caps the size, a per-day limit caps what is left', () => {
    expect(policySize({ maxUsdPerTrade: 10 }, 'Scout', 25, 0)).toEqual({ usd: 10 });
    expect(policySize({ maxUsdPerDay: 30 }, 'Scout', 25, 20)).toEqual({ usd: 10 });
    expect(policySize({ maxUsdPerDay: 30 }, 'Scout', 25, 29.5)).toEqual({ refused: expect.stringContaining('$30.00 a day') });
    expect(policySize({}, 'Scout', 25, 1000)).toEqual({ usd: 25 });
  });

  it('an allowlist of stocks is the only thing it may buy; none means every one', () => {
    expect(allowsSymbol({ symbols: ['NVDAx', 'AAPLx'] }, 'nvdax')).toBe(true);
    expect(allowsSymbol({ symbols: ['NVDAx'] }, 'TSLAx')).toBe(false);
    expect(allowsSymbol({}, 'TSLAx')).toBe(true);
  });

  it('a maximum loss tightens a looser stop, and leaves a tighter one', () => {
    expect(policyStop({ maxLossPct: 3 }, 100, 90)).toBe(97);
    expect(policyStop({ maxLossPct: 3 }, 100, 98)).toBe(98);
    expect(policyStop({}, 100, 90)).toBe(90);
  });

  it('reads stored JSON leniently: a bad field is an unset one', () => {
    expect(policyOf({ maxUsdPerTrade: 'ten', symbols: ['NVDAx', 3] })).toEqual({
      maxUsdPerTrade: undefined, maxUsdPerDay: undefined, symbols: ['NVDAx'], maxLossPct: undefined,
    });
  });
});
