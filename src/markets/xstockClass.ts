/**
 * The Stocks class on Solana: the xStocks this executor prices, not the Base catalogue (2026-09-19).
 *
 * The catalogue's share rows are the Base tokenized shares — `NVDAc`, `AAPLc` — which do not exist on Solana. On a
 * Solana build `/market/stocks` answers with xStocks, so none of those symbols matched and every row drew a dash: eight
 * names that looked listed and could never be priced or bought. The class's rows are instead the xStocks the executor
 * returned, each with its own price or "no price", and there are none until it has answered.
 */
import { assetGradient } from '@/design/gradients';
import type { StockQuote } from '@/data/marketData';
import type { AssetClass, Instrument } from '@/data/types';

export function withXStocks(
  classes: readonly AssetClass[],
  stocks: Readonly<Record<string, StockQuote>> | undefined,
): AssetClass[] {
  return classes.map((cls) => {
    if (cls.id !== 'stocks') return cls;
    const rows = Object.values(stocks ?? {});
    return {
      ...cls,
      note: 'xStocks, tokenized shares on Solana',
      more: 'All xStocks',
      instruments: rows.map((r) => {
        // The share's own colours: `NVDAx` is the catalogue's `NVDAc` on another chain.
        const { c1, c2 } = assetGradient(r.symbol.replace(/x$/, 'c'));
        return {
          sym: r.symbol,
          name: r.name.replace(/ xStock$/, ''),
          tag: 'xStock',
          px: '—',
          chg: '',
          up: true,
          c1,
          c2,
          classId: 'stocks' as const,
          feed: 'live' as const,
          mint: r.address,
        };
      }),
    };
  });
}

/**
 * Home's Gainers on Solana (2026-09-20): the xStocks that are up over 24h, largest first.
 *
 * It ranked the crypto feed (AAVE, TON, DOGE…), none of which trades on this build. A change exists only where the
 * executor's record of that xStock reaches back a day, so `measured` says whether any did: "nothing is up" and "not a
 * day of prices yet" are different sentences.
 */
export function xStockGainers(
  rows: readonly { symbol: string; name: string; price: number | null; feed: 'live' | 'unavailable'; change24h?: number }[],
  count: number,
  fmt: { price: (n: number) => string; percent: (n: number) => string },
): { gainers: Instrument[]; measured: boolean } {
  const measured = rows.some((r) => r.change24h !== undefined);
  const gainers = rows
    .filter((r) => r.feed === 'live' && r.price != null && r.change24h !== undefined && r.change24h > 0)
    .sort((a, b) => b.change24h! - a.change24h!)
    .slice(0, count)
    .map((r) => ({
      ...assetGradient(r.symbol),
      sym: r.symbol,
      name: r.name.replace(/ xStock$/, ''),
      tag: 'xStock',
      px: fmt.price(r.price!),
      chg: fmt.percent(r.change24h!),
      up: true,
      classId: 'stocks' as const,
      feed: 'live' as const,
    }));
  return { gainers, measured };
}
