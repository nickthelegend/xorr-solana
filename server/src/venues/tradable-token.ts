/**
 * One lookup for everything this executor can actually move.
 *
 * Two asset classes settle through the same spend path now: Backed's xStocks, which track listed
 * shares, and Tessera's T-Tokens, which track private companies. They differ in what they
 * represent and in which AMM fills them — Orca for the xStocks, Meteora DLMM for every T-Token —
 * but nothing about the money path differs: same delegate, same cap, same approval, same refusal.
 *
 * So the spend path should not know the difference, and before this it did: `place.ts` gated on
 * `XSTOCKS` alone, which meant a T-Token was refused as "not a tradable xStock" — true, and
 * useless. A second `if` beside the first would have worked and would have put the question "which
 * class is this" into a file whose whole job is "may this spend happen". This is the one place that
 * answers it.
 */
import { XSTOCKS, xStockKey } from './xstocks.js';
import { TESSERA } from './tessera.js';

export type AssetKind = 'equity' | 'pre-ipo';

export type TradableToken = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  kind: AssetKind;
};

/**
 * The token this symbol names, whichever class it belongs to, or undefined.
 *
 * xStock symbols are matched case-insensitively through `xStockKey`, which is what the rest of the
 * executor already does. T-Token symbols are matched exactly: `T-OpenAI` is how Tessera writes it
 * and a case-folded match there would also accept `t-openai`, which is not a symbol anybody issued.
 */
export function tradableToken(symbol: string): TradableToken | undefined {
  const key = xStockKey(symbol) ?? symbol;
  const stock = XSTOCKS[key];
  if (stock) {
    return { symbol: stock.symbol, name: stock.name, address: stock.address, decimals: stock.decimals, kind: 'equity' };
  }
  const t = TESSERA[symbol];
  if (t) {
    return { symbol: t.symbol, name: t.name, address: t.address, decimals: t.decimals, kind: 'pre-ipo' };
  }
  return undefined;
}

/**
 * Every token this executor would attempt, both classes.
 *
 * The grant reads this to decide which accounts the owner approves the delegate on, so a class
 * missing here is a class an agent can buy and then never sell — no stop-loss, no panic close.
 */
export function tradableTokens(): TradableToken[] {
  return [
    ...Object.values(XSTOCKS).map((x) => ({
      symbol: x.symbol,
      name: x.name,
      address: x.address,
      decimals: x.decimals,
      kind: 'equity' as const,
    })),
    ...Object.values(TESSERA).map((t) => ({
      symbol: t.symbol,
      name: t.name,
      address: t.address,
      decimals: t.decimals,
      kind: 'pre-ipo' as const,
    })),
  ];
}

/** Every symbol this executor would attempt, both classes. */
export function tradableSymbols(): string[] {
  return [...Object.keys(XSTOCKS), ...Object.keys(TESSERA)];
}

/**
 * What this token costs right now, from whichever venue prices its class.
 *
 * Both probe Jupiter with a meaningful size and divide; they differ only in which module owns the
 * cache. Callers in the spend path should not have to know which, because "what does it cost" is
 * the same question either way.
 */
export async function tradablePriceUsd(symbol: string): Promise<number | null> {
  const token = tradableToken(symbol);
  if (!token) return null;
  if (token.kind === 'pre-ipo') {
    const { tesseraPriceUsd } = await import('./tessera.js');
    return tesseraPriceUsd(token.symbol);
  }
  const { xStockPriceUsd } = await import('./xstocks.js');
  return xStockPriceUsd(token.symbol);
}
