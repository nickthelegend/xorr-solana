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
import type { AssetClass } from '@/data/types';

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
