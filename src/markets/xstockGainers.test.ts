import { describe, expect, it } from 'vitest';
import { xStockGainers } from './xstockClass';

const fmt = { price: (n: number) => `$${n.toFixed(2)}`, percent: (n: number) => `+${n.toFixed(2)}%` };
const row = (symbol: string, change24h?: number, price: number | null = 100) => ({
  symbol,
  name: `${symbol} Inc. xStock`,
  price,
  feed: 'live' as const,
  ...(change24h === undefined ? {} : { change24h }),
});

describe('xStockGainers', () => {
  it('ranks the xStocks that are up, largest first, and leaves out the ones down', () => {
    const { gainers, measured } = xStockGainers([row('AAPLx', -0.9), row('COINx', 13.7), row('NVDAx', 0.4)], 5, fmt);
    expect(measured).toBe(true);
    expect(gainers.map((g) => g.sym)).toEqual(['COINx', 'NVDAx']);
    expect(gainers[0]).toMatchObject({ name: 'COINx Inc.', chg: '+13.70%', px: '$100.00', up: true });
  });

  it('says when no xStock has a day of recorded prices yet', () => {
    expect(xStockGainers([row('NVDAx'), row('TSLAx')], 5, fmt)).toEqual({ gainers: [], measured: false });
  });
});
