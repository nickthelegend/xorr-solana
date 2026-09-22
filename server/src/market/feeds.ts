/**
 * What prices a symbol, if anything does.
 *
 * One definition, read by both the thing that FETCHES a price (`priceOf`) and the thing that
 * refuses an alert nothing could ever price (`routes/alerts.ts#unevaluableReason`). That is the
 * whole point of the file.
 *
 * Those two were separate lists, and the comment in `unevaluableReason` already warned why that is
 * dangerous: "a second, looser definition of valid here is how the two drift apart and the check
 * stops meaning anything." They then drifted in the other direction — the executor grew a Solana
 * price for xStocks and the alert route never heard about it, so `POST /alerts` refused a price
 * alert on NVDAx saying nothing could price it while `venues/xstocks.ts` was pricing it all day.
 *
 * A refusal that is WRONG is worse than the bug it was written to prevent: the original fault was
 * an alert that sat in the list and never fired, and this was an alert the user was not allowed to
 * make at all, for a reason that was not true.
 *
 * `feeds.test.ts` holds this to `priceOf` in both directions.
 */
import { canonicalSymbol } from '../venues/oneinch.js';
import { isStock } from '../venues/stocks.js';
import { isTessera } from '../venues/tessera.js';
import { isXStock } from '../venues/xstocks.js';
import { COINGECKO_IDS } from './ids.js';

/**
 * Which source answers for a symbol.
 *
 *   crypto — CoinGecko's table, the market-data feed.
 *   equity — a tokenized equity on an EVM chain, priced by the venue that would fill it.
 *   xstock — a tokenized equity on Solana, priced by the Jupiter route that would fill it.
 *   pre-ipo — a Tessera T-Token, a private company, priced by its issuer's mark.
 *
 * The equity cases are not one case: they are different chains, different venues and different
 * registries, and a symbol that is an equity here is not necessarily one there. `pre-ipo` is
 * further apart still — a private company has no exchange to route against, so its mark comes from
 * the issuer rather than from a venue that would fill it.
 */
export type Feed = 'crypto' | 'equity' | 'xstock' | 'pre-ipo';

/**
 * The feed that can price `symbol`, or null when nothing can.
 *
 * Resolved through `canonicalSymbol` rather than uppercased — rule 3 in `oneinch.ts`, which three
 * separate production bugs came from breaking. It leaves an xStock's own spelling alone (`NVDAx`
 * has no entry in the EVM registry, so it comes back unchanged), which is what lets the check below
 * tell `NVDAx` from `NVDAc`.
 */
export function feedFor(raw: string): Feed | null {
  const symbol = canonicalSymbol(raw);
  /*
   * xStocks first, and deliberately.
   *
   * `NVDAx` and `NVDAc` are the same company on two chains under two registries. Asking the EVM
   * list first would be fine today — it does not contain `NVDAx` — but the order states which
   * registry owns the spelling rather than relying on the other one staying incomplete.
   */
  if (isXStock(symbol)) return 'xstock';
  /*
   * A T-Token is priced, and until now this file said it was not (2026-09-22).
   *
   * `tesseraPriceUsd` has answered for these all along; nothing routed to it. So `feedFor` returned
   * null for `T-OpenAI`, `priceOf` threw `No price feed for T-OpenAI`, and every holding of the one
   * asset class XORR is built around came back `feed: 'unavailable'` with `mark: 0`. That is not a
   * cosmetic gap: `notional` is `units * mark`, and the Portfolio screen drops anything under
   * `DUST_USD`, so a real position the wallet actually held disappeared from the book entirely —
   * measured on the hosted build as an $18.75 T-OpenAI holding that rendered nowhere at all.
   *
   * It also refused a price alert on any T-Token, for a reason that was not true.
   */
  if (isTessera(symbol)) return 'pre-ipo';
  if (isStock(symbol)) return 'equity';
  if (COINGECKO_IDS[symbol]) return 'crypto';
  return null;
}

/** Can anything price this symbol? */
export function priceable(raw: string): boolean {
  return feedFor(raw) !== null;
}
