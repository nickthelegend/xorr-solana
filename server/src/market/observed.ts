/**
 * A day of an xStock's price, from the executor's own observations (2026-09-20).
 *
 * The xStocks have no candle feed: CoinGecko has no series for `NVDAx`, so the watchlist rows had no sparkline and no
 * 24h change. The executor records every Jupiter price it reads (`price_observations`, source `jupiter`), which is a real
 * series that starts when this executor started watching. Here it becomes the same two things the crypto rows get: a
 * glyph of hourly closes, and a 24h change — the latter only once the series actually reaches back a day, because a
 * change over three hours labelled "24h" would be an invented figure.
 */
import { query } from '../db/index.js';

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
/** How much short of a full day the oldest point may be and still anchor a 24h change. */
const DAY_SLACK_MS = HOUR_MS;

export type Observation = { at: number; usd: number };

/** The last observation in each hour of the window, oldest first. Pure. */
export function hourlyCloses(rows: readonly Observation[]): number[] {
  const byHour = new Map<number, Observation>();
  for (const r of rows) {
    const h = Math.floor(r.at / HOUR_MS);
    const kept = byHour.get(h);
    if (!kept || r.at > kept.at) byHour.set(h, r);
  }
  return [...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r.usd);
}

/** Percent change from the price a day before the newest point, or undefined when the series does not reach back a day. Pure. */
export function dayChangePct(rows: readonly Observation[]): number | undefined {
  if (rows.length < 2) return undefined;
  const sorted = [...rows].sort((a, b) => a.at - b.at);
  const last = sorted.at(-1)!;
  const first = sorted[0]!;
  if (last.at - first.at < DAY_MS - DAY_SLACK_MS) return undefined;
  // The newest point at least a day older than the last one, or the oldest there is.
  const anchor = [...sorted].reverse().find((r) => last.at - r.at >= DAY_MS) ?? first;
  return anchor.usd > 0 ? ((last.usd - anchor.usd) / anchor.usd) * 100 : undefined;
}

/** Held a minute: the snapshot and the sparklines are polled, and an hourly glyph does not move faster than that. */
const HELD_MS = 60_000;
const held = new Map<string, { at: number; rows: Promise<Observation[]> }>();

/** The last 25 hours of observations for `symbol` (a day, plus room to anchor the change). */
export function observedDay(symbol: string): Promise<Observation[]> {
  const hit = held.get(symbol);
  if (hit && Date.now() - hit.at < HELD_MS) return hit.rows;
  const rows = query<{ at: Date; usd: string }>(
    `SELECT at, usd FROM price_observations WHERE symbol = $1 AND at > now() - interval '25 hours' ORDER BY at`,
    [symbol],
  ).then((r) => r.map((o) => ({ at: new Date(o.at).getTime(), usd: Number(o.usd) })));
  // A failed read is not held, so the next ask tries again.
  rows.catch(() => held.delete(symbol));
  held.set(symbol, { at: Date.now(), rows });
  return rows;
}

/** One OHLC row, `[start ms, open, high, low, close]`, as `/market/ohlc` answers for the crypto feed. */
export type OhlcRow = [number, number, number, number, number];

/**
 * Observations folded into rows of `bucketMs`, oldest first; an empty bucket is absent, never filled in. Pure.
 *
 * The same row lengths the crypto feed answers with (thirty minutes over a day, four hours beyond), so the client cuts
 * xStock candles exactly as it cuts BTC's.
 */
export function ohlcRows(rows: readonly Observation[], bucketMs: number): OhlcRow[] {
  const out = new Map<number, OhlcRow>();
  for (const r of [...rows].sort((a, b) => a.at - b.at)) {
    const start = Math.floor(r.at / bucketMs) * bucketMs;
    const row = out.get(start);
    if (!row) out.set(start, [start, r.usd, r.usd, r.usd, r.usd]);
    else {
      row[2] = Math.max(row[2], r.usd);
      row[3] = Math.min(row[3], r.usd);
      row[4] = r.usd;
    }
  }
  return [...out.values()].sort((a, b) => a[0] - b[0]);
}

/** The row length the crypto feed uses for a window of `days`. */
export function bucketFor(days: number): number {
  return days <= 1 ? 30 * 60_000 : 4 * HOUR_MS;
}

/** Every observation of `symbol` in the last `days`. */
export async function observedSince(symbol: string, days: number): Promise<Observation[]> {
  const rows = await query<{ at: Date; usd: string }>(
    `SELECT at, usd FROM price_observations WHERE symbol = $1 AND at > now() - ($2 || ' days')::interval ORDER BY at`,
    [symbol, String(days)],
  );
  return rows.map((o) => ({ at: new Date(o.at).getTime(), usd: Number(o.usd) }));
}
