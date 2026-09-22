/**
 * The tokenized equity a symbol names ON THIS DEPLOYMENT, or undefined.
 *
 * Two families of tokenized equity live in this codebase and never on the same chain: the Base
 * equities (`NVDAc`, in `STOCKS`) and Backed's xStocks on Solana (`NVDAx`, in `XSTOCKS`). The
 * equity routes asked `isStock` alone, so a Solana executor refused `NVDAx` — the equity it
 * actually trades — as "not a tokenized equity", and answered 200 for `NVDAc`, which it cannot
 * price, hold or settle (2026-09-23). The question is which family this deployment trades.
 */
import { stockKey } from './stocks.js';
import { xStockKey } from './xstocks.js';

export function equityKey(symbol: string, solana: boolean): string | undefined {
  return solana ? xStockKey(symbol) : stockKey(symbol);
}
