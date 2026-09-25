/**
 * One symbol's spot price, from the source that prices it — or null when nothing does.
 *
 * `usePrice` reads `repos.markets.quotes`, which answers a failed request with no price, so an outage
 * read as "No price feed". Here a failed read throws, and the screen can say it did not load.
 *
 * A tokenized share asks only the share snapshot, and anything else only the crypto feed. The snapshot
 * has taken eight seconds on the hosted executor, and a crypto price has no reason to wait for it.
 */
import { fetchQuotes, fetchStockQuotes, isPreIpoSymbol, isStockSymbol, isXStockSymbol } from '@/data/marketData';
import { preIpo } from '@/data/preIpo';

/** `name` is the source's own name for the asset, where it gave one. */
export type SpotQuote = { price: number; change24h?: number; name?: string };

export async function quoteOf(symbol: string): Promise<SpotQuote | null> {
  /*
   * An xStock is priced by the same snapshot the xStocks list reads (2026-09-25), with the 24h change the executor
   * measured from its own record. It fell through to the crypto feed, which has never heard of NVDAx, so the asset
   * screen said "No price feed" for a share the list beside it was pricing.
   */
  if (isXStockSymbol(symbol)) {
    const row = (await fetchStockQuotes())[symbol];
    if (row?.price == null) return null;
    const quote: SpotQuote = { price: row.price, name: row.name.replace(/ xStock$/, '') };
    if (row.change24h !== undefined && Number.isFinite(row.change24h)) quote.change24h = row.change24h;
    return quote;
  }
  /*
   * A pre-IPO token's price is its pool's (2026-09-25): what a buy would actually pay. The issuer's mark is a separate
   * claim and the pre-IPO list shows both; one number at the top of a trade screen is the one a trade goes through.
   */
  if (isPreIpoSymbol(symbol)) {
    const row = (await preIpo.list()).rows.find((r) => r.symbol === symbol);
    return row?.poolUsd != null ? { price: row.poolUsd, name: row.name } : null;
  }
  if (isStockSymbol(symbol)) {
    const row = (await fetchStockQuotes())[symbol];
    // A share with no route right now has no price. That is an answer, not a failure, and it has no
    // 24h change: a swap quote is one observation.
    return row?.price != null ? { price: row.price } : null;
  }
  const q = (await fetchQuotes([symbol]))[symbol];
  return q ? { price: q.price, change24h: q.change24h } : null;
}
