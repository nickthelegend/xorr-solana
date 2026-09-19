/**
 * Spot prices for a list of symbols, each waiting only for its own source.
 *
 * `usePrices` prices every symbol in one request, and a request that includes a share waits for the
 * share snapshot — eight seconds on the hosted executor, signed in or not — so on the watchlist SOL and
 * HYPE sat at "· · ·" behind TSLAc. It also answers a failed request with no prices. Here the crypto
 * feed and the snapshot are separate reads, and a failure is reported.
 */
import {
  fetchQuotes,
  fetchStockQuotes,
  isStockSymbol,
  type Quote,
  type StockQuote,
} from '@/data/marketData';
import { isSolana } from '@/chain';
import type { SpotQuote } from './quote';
import { useLiveRead } from './useLiveRead';

/**
 * Whether the share snapshot (`/market/stocks`) prices `symbol`, rather than the crypto feed.
 *
 * `isStockSymbol` knows the Base shares (`NVDAc`). On Solana the snapshot answers with xStocks (`NVDAx`), which the
 * crypto feed has never priced, so the watchlist asked the feed for them and drew a dash on every one (2026-09-19). The
 * suffix is not added to `isStockSymbol` itself: the Base catalogue files `SPYx` under indices, and that is kept.
 */
export function sharePriced(symbol: string, solana: boolean = isSolana): boolean {
  return isStockSymbol(symbol) || (solana && /^[A-Z]{1,6}x$/.test(symbol));
}

export type SpotPrice = { loading: true } | { loading: false; quote: SpotQuote | null };

export function useSpotPrices(symbols: readonly string[]) {
  const feedKey = symbols.filter((s) => !sharePriced(s)).join(',');
  const hasShares = symbols.some((s) => sharePriced(s));

  const feed = useLiveRead(
    () => (feedKey ? fetchQuotes(feedKey.split(',')) : Promise.resolve({} as Record<string, Quote>)),
    [feedKey],
  );
  const shares = useLiveRead(
    () => (hasShares ? fetchStockQuotes() : Promise.resolve({} as Record<string, StockQuote>)),
    [hasShares],
  );

  /** A read still out, or one answering an earlier list, is loading — never "no price". */
  function priceOf(symbol: string): SpotPrice {
    if (sharePriced(symbol)) {
      if (shares.loading || !shares.data) return { loading: true };
      const row = shares.data[symbol];
      return { loading: false, quote: row?.price != null ? { price: row.price } : null };
    }
    if (feed.loading || !feed.data) return { loading: true };
    const q = feed.data[symbol];
    return { loading: false, quote: q ? { price: q.price, change24h: q.change24h } : null };
  }

  return {
    priceOf,
    error: feed.error ?? shares.error,
    reload: () => {
      if (feed.error) feed.reload();
      if (shares.error) shares.reload();
    },
  };
}
