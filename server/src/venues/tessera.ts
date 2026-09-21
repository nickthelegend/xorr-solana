/**
 * Tessera's pre-IPO tokens: companies with no exchange behind them at all.
 *
 * SpaceX, OpenAI and Kalshi are private. There is no closing bell, no ticker, and no price anybody
 * is obliged to publish — which makes them the opposite end of the same problem this app already
 * works on. An xStock tracks a listed share that stops trading at four o'clock; a T-Token tracks a
 * company that never trades at all, and whose "price" is whatever the pool last cleared at.
 *
 * ## Why these need no new venue code
 *
 * They are Token-2022 mints on Solana and Jupiter routes all three, verified against the live
 * aggregator. So a buy is the same `guardAndSpend` path as an xStock: the same delegate, the same
 * cap, the same refusal when the permission is gone. Nothing about the money path is special.
 *
 * ## The two things that ARE different, and are not decoration
 *
 * **A transfer fee.** Every one of these mints carries `transferFeeConfig` at 20 basis points,
 * uncapped. Unlike the xStocks' Scaled UI multiplier, which restates what you hold, this takes a
 * cut of every movement — so what arrives is less than what was sent, on the way in AND on the way
 * out. A quote that ignores it is wrong by 40 bps over a round trip, and this file publishes the
 * rate so a screen can say so rather than a holder finding out from the balance.
 *
 * **A mark with no market behind it.** Tessera publishes `markPrice`, and it is the only
 * independent number these tokens have — there is no Pyth feed for a private company. Measured on
 * 2026-09-21 the pools cleared 8% to 34% ABOVE that mark. That gap is the single most important
 * fact about this asset class and the reason the catalogue carries both numbers, never one.
 *
 * The API is intermittent — it answered 200, then 500, then 200 again inside two minutes — so every
 * read goes through `getJson`, which caches and falls back to the last good answer, and a token it
 * cannot price says so rather than showing a stale number as current.
 */
import { getJson, staleValue } from '../http/get.js';

/** Public, no key. Confirmed against the endpoint Tessera's own bounty brief points at. */
const DETAILS_URL = 'https://rest-api.tessera.pe/v1/public/token-details';

/** Marks move slowly — these are private-company valuations, not a tape. */
const TTL_MS = 60_000;
/** Beyond this a cached mark is not "the last price", it is an old one. */
const STALE_MAX_MS = 30 * 60_000;

/**
 * The transfer fee every T-Token mint carries, read off the mints on 2026-09-21.
 *
 * Hard-coded as documentation rather than as a source of truth: `transferFeeBasisPoints` lives on
 * the mint and `feeBps()` reads it from the chain. This is what to expect, so a surprise is
 * visible as a surprise.
 */
export const EXPECTED_TRANSFER_FEE_BPS = 20;

export type TesseraToken = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  sector: string;
};

/**
 * The three, with their mints.
 *
 * Pinned rather than taken from the API response, for the same reason the xStock mints are: a mint
 * is what the money moves to, and a list of those arriving over HTTP means an endpoint having a bad
 * afternoon can point a buy at an address nobody checked.
 */
export const TESSERA: Record<string, TesseraToken> = {
  'T-SpaceX': {
    symbol: 'T-SpaceX',
    name: 'SpaceX',
    address: 'TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v',
    decimals: 9,
    sector: 'Aerospace',
  },
  'T-OpenAI': {
    symbol: 'T-OpenAI',
    name: 'OpenAI',
    address: 'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ',
    decimals: 9,
    sector: 'Artificial Intelligence',
  },
  'T-Kalshi': {
    symbol: 'T-Kalshi',
    name: 'Kalshi',
    address: 'TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ',
    decimals: 9,
    sector: 'Prediction Markets',
  },
};

export function isTessera(symbol: string): boolean {
  return Object.hasOwn(TESSERA, symbol);
}

export function tesseraByMint(mint: string): TesseraToken | undefined {
  return Object.values(TESSERA).find((t) => t.address === mint);
}

type DetailRow = {
  symbol?: string;
  mint?: string;
  markPrice?: number;
  holders?: number;
  markValuation?: number;
  sector?: string;
};

export type TesseraMark = {
  symbol: string;
  /** Tessera's own valuation mark, per token. */
  markUsd: number;
  /** How many wallets hold it — the only liquidity-adjacent figure the API gives. */
  holders: number | null;
  /** What the whole company is marked at. */
  valuationUsd: number | null;
  /** True when this came from cache because the endpoint did not answer. */
  stale: boolean;
};

/**
 * Every mark Tessera will give us right now, keyed by symbol.
 *
 * A row whose mint does not match the pinned one is dropped: two different tokens sharing a symbol
 * is exactly the confusion a price is worst at surviving.
 */
export async function tesseraMarks(): Promise<Map<string, TesseraMark>> {
  const out = new Map<string, TesseraMark>();
  let rows: DetailRow[] | undefined;
  let stale = false;
  try {
    rows = await getJson<DetailRow[]>(DETAILS_URL, TTL_MS, 15_000);
  } catch {
    rows = staleValue<DetailRow[]>(DETAILS_URL, STALE_MAX_MS);
    stale = true;
  }
  if (!Array.isArray(rows)) return out;

  for (const row of rows) {
    const symbol = row.symbol;
    if (!symbol) continue;
    const known = TESSERA[symbol];
    if (!known) continue;
    if (row.mint && row.mint !== known.address) continue;
    const markUsd = Number(row.markPrice);
    if (!Number.isFinite(markUsd) || markUsd <= 0) continue;
    out.set(symbol, {
      symbol,
      markUsd,
      holders: Number.isFinite(Number(row.holders)) ? Number(row.holders) : null,
      valuationUsd: Number.isFinite(Number(row.markValuation)) ? Number(row.markValuation) : null,
      stale,
    });
  }
  return out;
}

/** One mark, or null when Tessera has none to give. */
export async function tesseraMark(symbol: string): Promise<TesseraMark | null> {
  return (await tesseraMarks()).get(symbol) ?? null;
}

/**
 * What a T-Token costs in the pools, probed the way an xStock is.
 *
 * A quote for a meaningful size rather than a unit, because these pools are thin and a one-dollar
 * probe reads a price nobody could trade. Null when Jupiter will not route it — never a mark
 * standing in for a pool price, which is the substitution this whole module exists to prevent.
 */
const PROBE_USD = 100;
const PRICE_TTL_MS = 30_000;
const priceCache = new Map<string, { at: number; price: number }>();

export async function tesseraPriceUsd(symbol: string): Promise<number | null> {
  const token = TESSERA[symbol];
  if (!token) return null;

  const hit = priceCache.get(symbol);
  if (hit && Date.now() - hit.at < PRICE_TTL_MS) return hit.price;

  const { quote } = await import('./jupiter.js');
  const q = await quote({
    inSymbolOrMint: 'USDC',
    outSymbolOrMint: token.address,
    amountUnits: PROBE_USD * 1e6,
  }).catch(() => null);
  if (!q || !(Number(q.outAmount) > 0)) return null;

  const outTokens = Number(q.outAmount) / 10 ** token.decimals;
  const price = PROBE_USD / outTokens;
  priceCache.set(symbol, { at: Date.now(), price });
  return price;
}

/** Testing only — the module-level cache would otherwise carry one case into the next. */
export function clearTesseraPriceCache(): void {
  priceCache.clear();
}

export type TesseraRow = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  sector: string;
  /** What a buy costs in the pools right now, or null when nothing routes it. */
  poolUsd: number | null;
  /** Tessera's own valuation mark, or null when the API would not answer. */
  markUsd: number | null;
  /** Pool against mark, in percent. Null unless BOTH are real — a spread needs two numbers. */
  spreadPct: number | null;
  markStale: boolean;
  holders: number | null;
  valuationUsd: number | null;
  /** Charged on every transfer, in and out. */
  transferFeeBps: number;
};

/**
 * The catalogue: both numbers for each token, and the distance between them.
 *
 * Deliberately shaped like the xStock catalogue, which carries a pool price beside the issuer's
 * mark for the same reason. Here the gap is far wider — measured at 8% to 34% — and a screen that
 * showed one number would be picking which of two true things to tell somebody spending money.
 */
export async function tesseraCatalog(): Promise<TesseraRow[]> {
  const marks = await tesseraMarks();
  const rows: TesseraRow[] = [];
  for (const t of Object.values(TESSERA)) {
    const poolUsd = await tesseraPriceUsd(t.symbol).catch(() => null);
    const mark = marks.get(t.symbol) ?? null;
    const markUsd = mark?.markUsd ?? null;
    rows.push({
      symbol: t.symbol,
      name: t.name,
      address: t.address,
      decimals: t.decimals,
      sector: t.sector,
      poolUsd,
      markUsd,
      spreadPct: poolUsd !== null && markUsd !== null && markUsd > 0 ? ((poolUsd - markUsd) / markUsd) * 100 : null,
      markStale: mark?.stale ?? false,
      holders: mark?.holders ?? null,
      valuationUsd: mark?.valuationUsd ?? null,
      transferFeeBps: EXPECTED_TRANSFER_FEE_BPS,
    });
  }
  return rows;
}
