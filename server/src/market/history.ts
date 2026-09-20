/**
 * Real price history for the xStocks, so a band exists before this deployment has watched for a day.
 *
 * The agent's range strategies need a high and a low to read a percentile against, and until now the
 * only source of those was `price_observations` — which this deployment fills itself, one reading
 * every five minutes, starting from the moment it booted. `observedBand` will not call that a band
 * until the readings span `MIN_SPAN_HOURS` and cover at least `MIN_BAND_FRACTION`, both for good
 * reasons, and the consequence was a property nobody intended:
 *
 *   **A fresh deployment could not trade for twenty-four hours.**
 *
 * Anyone cloning this repo — a judge, a reviewer, a new contributor — started an agent that was
 * armed, funded, permitted, and structurally incapable of taking a setup until the next day. The
 * core claim of the product was unobservable by construction on every first run.
 *
 * The second consequence was narrower but just as real. A day of readings over a weekend, when the
 * underlying exchange is shut, is a very flat day: measured on 2026-09-20 the recorded bands were
 * TSLAx 0.73%, AAPLx 0.70% and SPYx 0.50%, all under the 1% a percentile needs to mean anything. So
 * even at the twenty-four hour mark most of the universe would have gone on standing down, not
 * because there was no setup but because this deployment had only ever seen a quiet Saturday.
 *
 * ## Where the history comes from
 *
 * GeckoTerminal publishes hourly OHLCV for any Solana pool, free and without a key, and every
 * xStock has a deep USDC pool it indexes — NVDAx/USDC at $2.1M, SPYx/USDC at $3.5M. One request
 * returns a thousand hourly bars, six weeks of them, ending at the hour just gone.
 *
 * The migration that created `price_observations` says "no candle source anywhere free", and for
 * the Base build, pricing tokenized equities off a 1inch route, that was true. It is not true for a
 * Solana pool, and this is the same quantity the table already stores: the USD price of that xStock
 * in the pools that hold it. It is recorded under its own `source`, which the table has carried
 * since it was created precisely "so a chart can never silently mix sources".
 *
 * ## What this is not
 *
 * It is not a reconstruction and it is not a stand-in. Every row is a real bar from a real pool at a
 * real time. Nothing is interpolated across a gap, nothing is carried forward into an hour that has
 * no bar, and a symbol GeckoTerminal cannot answer for gets no rows at all rather than a shape
 * borrowed from somewhere else — the same rule the rest of this codebase holds itself to.
 */
import { query } from '../db/index.js';
import { getJson } from '../http/get.js';
import { log } from '../http/request-id.js';
import { XSTOCKS } from '../venues/xstocks.js';

const API = 'https://api.geckoterminal.com/api/v2/networks/solana';

/** Pool lists change slowly; a day is far longer than the history behind them moves. */
const POOL_TTL_MS = 24 * 3_600_000;
/** Bars land on the hour, so asking more often than that returns what we already have. */
const BARS_TTL_MS = 30 * 60_000;

/** The most GeckoTerminal returns in one request — about six weeks of hourly bars. */
const LIMIT = 1000;

type PoolRow = { id: string; attributes: { name?: string; reserve_in_usd?: string | null } };
type PoolsResponse = { data?: PoolRow[] };
type BarsResponse = { data?: { attributes?: { ohlcv_list?: number[][] } } };

/**
 * The deepest `<SYMBOL>/USDC` pool for an xStock, or null when it is not indexed.
 *
 * Depth is the tiebreak because a thin pool's hourly close is one trade's opinion. The name has to
 * start with the symbol as well as contain USDC: a `SI / NVDAx` pool contains both strings and
 * quotes NVDAx in the wrong direction, which would have seeded a band around $0.0000955.
 */
export async function deepestUsdcPool(symbol: string, mint: string): Promise<string | null> {
  const res = await getJson<PoolsResponse>(`${API}/tokens/${mint}/pools?page=1`, POOL_TTL_MS, 20_000).catch(
    () => null,
  );
  let best: { pool: string; liquidity: number } | null = null;
  for (const row of res?.data ?? []) {
    const name = row.attributes?.name ?? '';
    if (!name.startsWith(symbol) || !name.includes('USDC')) continue;
    const liquidity = Number(row.attributes?.reserve_in_usd ?? 0);
    if (!Number.isFinite(liquidity) || liquidity <= 0) continue;
    if (!best || liquidity > best.liquidity) best = { pool: row.id.replace(/^solana_/, ''), liquidity };
  }
  return best?.pool ?? null;
}

export type Bar = { at: Date; usd: number };

/**
 * Hourly closes for a pool, oldest first.
 *
 * A bar is `[unixSeconds, open, high, low, close]`. The close is the price the pool last traded at
 * inside that hour, which is the same kind of number `xStockPriceUsd` records live, so the two can
 * sit in one series without either misrepresenting the other.
 */
export async function poolCloses(pool: string): Promise<Bar[]> {
  const res = await getJson<BarsResponse>(
    `${API}/pools/${pool}/ohlcv/hour?aggregate=1&limit=${LIMIT}`,
    BARS_TTL_MS,
    25_000,
  ).catch(() => null);
  const rows = res?.data?.attributes?.ohlcv_list ?? [];
  const bars: Bar[] = [];
  for (const row of rows) {
    const seconds = Number(row[0]);
    const close = Number(row[4]);
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    if (!Number.isFinite(close) || close <= 0) continue;
    bars.push({ at: new Date(seconds * 1000), usd: close });
  }
  return bars.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * Write a symbol's bars into `price_observations`, skipping the ones already there.
 *
 * `ON CONFLICT DO NOTHING` against the `(symbol, at)` primary key is what makes this safe to run on
 * every boot: a redeploy re-reads the same six weeks and inserts only the hours that have happened
 * since. It never overwrites a live Jupiter reading with a GeckoTerminal bar.
 */
async function record(symbol: string, bars: Bar[]): Promise<number> {
  if (bars.length === 0) return 0;
  const rows = await query<{ symbol: string }>(
    `INSERT INTO price_observations (symbol, at, usd, source)
     SELECT $1, t.at, t.usd, 'geckoterminal'
       FROM unnest($2::timestamptz[], $3::numeric[]) AS t(at, usd)
     ON CONFLICT DO NOTHING
     RETURNING symbol`,
    [symbol, bars.map((b) => b.at), bars.map((b) => b.usd)],
  );
  return rows.length;
}

export type SeedResult = { symbol: string; inserted: number; bars: number; pool: string | null };

let seeded = false;

/** Testing only — the module-level latch would otherwise carry one case into the next. */
export function resetSeedLatch(): void {
  seeded = false;
}

/**
 * Backfill every xStock's history once.
 *
 * Sequential on purpose. The free tier allows about thirty requests a minute and answers a burst
 * with 429s; `getJson` already spaces per host and honours `Retry-After`, and going one at a time
 * keeps the whole sweep inside that budget rather than fighting it.
 *
 * A symbol that fails is logged and skipped. One unindexed pool is not a reason to leave the other
 * ten without a band.
 */
export async function seedHistory(force = false): Promise<SeedResult[]> {
  if (seeded && !force) return [];
  seeded = true;

  const out: SeedResult[] = [];
  for (const token of Object.values(XSTOCKS)) {
    try {
      const pool = await deepestUsdcPool(token.symbol, token.address);
      if (!pool) {
        out.push({ symbol: token.symbol, inserted: 0, bars: 0, pool: null });
        continue;
      }
      const bars = await poolCloses(pool);
      const inserted = await record(token.symbol, bars);
      out.push({ symbol: token.symbol, inserted, bars: bars.length, pool });
    } catch (e) {
      log.info(`[history] ${token.symbol}: ${e instanceof Error ? e.message : e}`);
      out.push({ symbol: token.symbol, inserted: 0, bars: 0, pool: null });
    }
  }

  const total = out.reduce((n, r) => n + r.inserted, 0);
  const missing = out.filter((r) => r.pool === null).map((r) => r.symbol);
  log.info(
    `[history] seeded ${total} hourly closes across ${out.filter((r) => r.inserted > 0).length} symbols` +
      (missing.length > 0 ? `; no indexed pool for ${missing.join(', ')}` : ''),
  );
  return out;
}
