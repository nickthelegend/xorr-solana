/**
 * What the underlying share is worth, from the issuer that mints the token.
 *
 * The off-hours guard in `nasdaq.ts` compares the Solana pool price against the equity's own value,
 * and that comparison is only worth making if the second number comes from somewhere the first one
 * did not. Backed Finance issues every xStock, and publishes the price its own issuance and
 * redemption run at on a public endpoint that needs no account and no key:
 *
 *   GET https://api.backed.fi/api/v2/public/assets/{symbol}/price-data  ->  {"quote": 215.36}
 *
 * That number is sourced from on-chain oracles during the session and from Nasdaq's extended-hours
 * feed outside it, which is exactly the coverage a 24/7 token trading against a 09:30–16:00 listing
 * needs. Verified live against NVDAx, TSLAx, AAPLx and MSFTx.
 *
 * **`null` is the answer when the feed has none.** A table of four reference prices typed into a
 * source file stood here before, described as what to use "when the Nasdaq feed is closed/offline".
 * Typed-in numbers do not go stale gracefully — they go stale silently, and an equity quote that is
 * confidently wrong is the one output this project refuses to produce (PLAN.md §0.1: no fallbacks).
 * Every caller has to handle "no reference price", so this returns that state rather than inventing
 * one to spare them.
 */
import { getJson } from '../http/get.js';

const BASE_URL = process.env.BACKED_PUBLIC_API ?? 'https://api.backed.fi/api/v2';

/**
 * Long enough that one scheduler tick pricing four stocks is four requests rather than forty,
 * short enough that a quote is still the minute it is read in. The endpoint advertises a 1000-call
 * window and `http/get.ts` already serialises per host on top of this.
 */
const TTL_MS = 30_000;

/** The endpoint answers in well under a second; a guard inside a tick should not wait longer. */
const TIMEOUT_MS = 8_000;

type PriceData = { quote?: unknown };

/**
 * Backed names its instruments `{TICKER}x` — `NVDA` is issued as `NVDAx`. Both the Solana xStocks
 * (`NVDAx`) and the Base equities (`NVDAc`) track the same listing, so both resolve through the
 * underlying ticker.
 */
export function backedSymbol(ticker: string): string | null {
  const bare = ticker.trim().toUpperCase();
  return /^[A-Z]{1,8}$/.test(bare) ? `${bare}x` : null;
}

/**
 * The issuer's price for one share of `ticker` in USD, or `null` if it has none to give.
 *
 * `null` covers every way this can come up empty — an unlisted ticker (the endpoint answers 404), a
 * rate limit, a timeout, a body without a usable `quote`. The caller cannot tell those apart and
 * does not need to: in all of them there is no second opinion to check a pool price against, and
 * the guard has to say so rather than guess.
 */
export async function underlyingQuoteUsd(ticker: string): Promise<number | null> {
  const symbol = backedSymbol(ticker);
  if (!symbol) return null;

  try {
    const data = await getJson<PriceData>(
      `${BASE_URL}/public/assets/${symbol}/price-data`,
      TTL_MS,
      TIMEOUT_MS,
    );
    const quote = data?.quote;
    return typeof quote === 'number' && Number.isFinite(quote) && quote > 0 ? quote : null;
  } catch {
    // A feed that did not answer has no price in it. Saying so IS the answer.
    return null;
  }
}
