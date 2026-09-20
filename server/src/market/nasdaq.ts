/**
 * Nasdaq market hours and the off-hours decoupling guard — PLAN.md §8.4.
 *
 * xStocks trade 24/7 on Solana, but the underlying US equities only trade during Nasdaq regular
 * and extended sessions.
 *
 * Sessions (America/New_York):
 * - Pre-market:    04:00 - 09:30 ET (Mon-Fri)
 * - Regular:       09:30 - 16:00 ET (Mon-Fri)
 * - After-hours:   16:00 - 20:00 ET (Mon-Fri)
 * - Closed:        20:00 - 04:00 ET overnight, and Friday 20:00 - Monday 04:00 ET
 *
 * While the underlying exchange is closed, a Jupiter pool price can drift away from what the share
 * is actually worth, because nothing is arbitraging it back. This module measures that drift and
 * says whether to widen slippage or stand down.
 *
 * ## The reference price, and what happens without one
 *
 * Measuring drift needs a second, independent price for the same underlying, and a table of
 * hard-coded "reference" prices is a fabrication that goes stale the day it is written — the
 * earliest version of this file carried one, and every verdict it produced was measured against
 * numbers nobody had checked since.
 *
 * The reference is Pyth's `Equity.US.<TICKER>/USD` feed, read from its price account on Solana
 * mainnet (`market/pyth.ts`). It is the Nasdaq print: an aggregate of Pyth's equity publishers,
 * carrying its own confidence interval and the timestamp of the print it describes, and it costs
 * nothing to read because it is already on chain. This file used to say no free Nasdaq feed was
 * reachable and fell back to the issuer's own mark; that was wrong, and the issuer's mark is now
 * only what answers when Pyth has nothing usable — which for COIN, today, it does not.
 *
 * Preferring Pyth is not brand loyalty. The issuer's mark arrives on the same response as the pool
 * price, from the same vendor, so a guard measured against it is one source checking itself. Pyth
 * is a different set of publishers reading the actual exchange.
 *
 * When no reference is available at all, this module does not guess. It reports `spreadBps: null`
 * and, outside regular hours, holds: the guard exists to detect decoupling, and "I could not
 * measure it" is not the same answer as "there is none".
 */
import { underlyingTicker } from './edgar.js';
import { pythEquityPrice } from './pyth.js';
import { xStockCatalog } from '../venues/xstocks-catalog.js';

export { underlyingTicker };

export type NasdaqSessionType = 'regular' | 'extended' | 'closed';

export type NasdaqSessionDetail = {
  session: NasdaqSessionType;
  phase: 'pre-market' | 'regular' | 'after-hours' | 'overnight' | 'weekend';
  isExchangeOpen: boolean;
  easternTime: string;
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  hourET: number;
  minuteET: number;
};

export type OffHoursGuardVerdict = {
  session: NasdaqSessionType;
  /** Which second opinion the drift was measured against, or null when there was none. */
  referenceSource: ReferenceSource | null;
  /** Null when no independent reference price was available, so no drift could be measured. */
  spreadBps: number | null;
  spreadPct: number | null;
  action: 'normal' | 'widen_slippage' | 'hold';
  suggestedSlippageBps: number;
  reason: string;
};

/** Above this in an extended session, the pool and the reference are telling different stories. */
const EXTENDED_HOLD_PCT = 0.012;
/** Above this while the exchange is shut. Wider, because nothing is arbitraging the gap closed. */
const CLOSED_HOLD_PCT = 0.015;

/** Where a reference price came from, phrased to drop into a sentence about drift. */
export type ReferenceSource = 'pyth' | 'issuer';

export type Reference = {
  usd: number;
  source: ReferenceSource;
  /** How the verdict should name it, e.g. "Pyth's NVDA feed". */
  label: string;
  /** When the print was made, for Pyth. Null for the issuer's mark, which carries no timestamp. */
  publishedAt: Date | null;
};

/** The default phrasing, kept in one place because four verdict strings interpolate it. */
const ISSUER_LABEL = "the issuer's mark for the share";

/**
 * A second opinion on what the underlying share is worth, or null when there is not one.
 *
 * Pyth first (2026-09-20): `Equity.US.<TICKER>/USD` off its Solana price account, which is a real
 * exchange print from publishers unrelated to the pool we are checking. The issuer's own
 * `stockData` mark — published by Jupiter on the same response as the pool price — is the fallback,
 * because one vendor grading its own homework still beats no reference at all outside regular
 * hours, where the alternative is to hold every symbol forever.
 *
 * A symbol with neither is null: held, never guessed.
 */
export async function referenceFor(symbol: string, now: Date = new Date()): Promise<Reference | null> {
  const mark = await pythEquityPrice(symbol, now).catch(() => null);
  if (mark) {
    return {
      usd: mark.usd,
      source: 'pyth',
      label: `Pyth's ${mark.ticker} feed`,
      publishedAt: mark.publishedAt,
    };
  }
  const rows = await xStockCatalog().catch(() => null);
  const row = rows?.find((r) => r.symbol.toLowerCase() === symbol.toLowerCase());
  const usd = row?.underlyingPrice ?? null;
  if (usd === null || !(usd > 0)) return null;
  return { usd, source: 'issuer', label: ISSUER_LABEL, publishedAt: null };
}

/** The number alone, for callers that do not name their source. */
export async function referencePriceUsd(symbol: string): Promise<number | null> {
  return (await referenceFor(symbol))?.usd ?? null;
}

/**
 * Computes current Nasdaq session state based on the America/New_York clock.
 */
export function getNasdaqSession(now: Date = new Date()): NasdaqSessionDetail {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const parts = formatter.formatToParts(now);
  let weekdayStr = 'Mon';
  let hourET = 12;
  let minuteET = 0;

  for (const p of parts) {
    if (p.type === 'weekday') weekdayStr = p.value;
    if (p.type === 'hour') hourET = parseInt(p.value, 10);
    if (p.type === 'minute') minuteET = parseInt(p.value, 10);
  }

  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[weekdayStr] ?? 1;
  const timeInMinutes = hourET * 60 + minuteET;
  const easternTime = `${String(hourET).padStart(2, '0')}:${String(minuteET).padStart(2, '0')} ET`;
  const base = { easternTime, dayOfWeek, hourET, minuteET };

  const isWeekend =
    dayOfWeek === 6 ||
    dayOfWeek === 0 ||
    (dayOfWeek === 5 && timeInMinutes >= 20 * 60) ||
    (dayOfWeek === 1 && timeInMinutes < 4 * 60);

  if (isWeekend) {
    return { session: 'closed', phase: 'weekend', isExchangeOpen: false, ...base };
  }

  // Pre-market: 04:00 to 09:30 ET
  if (timeInMinutes >= 4 * 60 && timeInMinutes < 9 * 60 + 30) {
    return { session: 'extended', phase: 'pre-market', isExchangeOpen: true, ...base };
  }

  // Regular market: 09:30 to 16:00 ET
  if (timeInMinutes >= 9 * 60 + 30 && timeInMinutes < 16 * 60) {
    return { session: 'regular', phase: 'regular', isExchangeOpen: true, ...base };
  }

  // After-hours: 16:00 to 20:00 ET
  if (timeInMinutes >= 16 * 60 && timeInMinutes < 20 * 60) {
    return { session: 'extended', phase: 'after-hours', isExchangeOpen: true, ...base };
  }

  // Overnight: 20:00 to 04:00 ET
  return { session: 'closed', phase: 'overnight', isExchangeOpen: false, ...base };
}

/**
 * Decides how much slippage an entry deserves right now, or whether to stand down.
 *
 * - Regular session: 50 bps and no drift question — the underlying is trading and the pool tracks it.
 * - Extended session: 75 bps, unless the measured drift exceeds 1.2%, which holds.
 * - Closed: 120 bps, unless the measured drift exceeds 1.5%, which holds.
 * - Outside regular hours with no reference price: hold. Unmeasured is not the same as fine.
 *
 * `reference` is the caller's — `referenceFor` fetches one, and passing null is the honest way to
 * say there was none. Every verdict names the source it measured against, because "drifted 1.4%
 * from Pyth's NVDA feed" and "drifted 1.4% from the issuer's own mark" are different claims and an
 * owner reading the agent's account of itself is entitled to know which one they are being told.
 */
export function evaluateOffHoursGuard(params: {
  symbol: string;
  onChainPrice: number;
  reference?: Reference | null;
  /** Deprecated shape, kept so a caller with only a number still gets a verdict. */
  referencePrice?: number | null;
  now?: Date;
}): OffHoursGuardVerdict {
  const { onChainPrice, now } = params;
  const reference: Reference | null =
    params.reference ??
    (params.referencePrice !== null && params.referencePrice !== undefined
      ? { usd: params.referencePrice, source: 'issuer', label: ISSUER_LABEL, publishedAt: null }
      : null);
  const referencePrice = reference?.usd ?? null;
  const against = reference?.label ?? ISSUER_LABEL;
  const referenceSource = reference?.source ?? null;
  const session = getNasdaqSession(now);

  const measurable = referencePrice !== null && referencePrice > 0 && onChainPrice > 0;
  const spreadPct = measurable
    ? Math.abs(onChainPrice - referencePrice) / referencePrice
    : null;
  const spreadBps = spreadPct === null ? null : Math.round(spreadPct * 10_000);
  const drift = spreadPct === null ? '' : ` Drift against ${against} is ${(spreadPct * 100).toFixed(2)}%.`;

  if (session.session === 'regular') {
    return {
      session: 'regular',
      referenceSource,
      spreadBps,
      spreadPct,
      action: 'normal',
      suggestedSlippageBps: 50,
      reason: `Nasdaq regular hours (${session.easternTime}), so the underlying is trading and the pool is being arbitraged against it.${drift}`,
    };
  }

  if (spreadPct === null) {
    return {
      session: session.session,
      referenceSource: null,
      spreadBps: null,
      spreadPct: null,
      action: 'hold',
      suggestedSlippageBps: session.session === 'closed' ? 120 : 75,
      reason: `Nasdaq ${session.phase} and no independent price for ${params.symbol} to measure the pool against. Holding rather than entering on an unchecked price.`,
    };
  }

  if (session.session === 'extended') {
    if (spreadPct > EXTENDED_HOLD_PCT) {
      return {
        session: 'extended',
        referenceSource,
        spreadBps,
        spreadPct,
        action: 'hold',
        suggestedSlippageBps: 100,
        reason: `Nasdaq ${session.phase} and the pool has drifted ${(spreadPct * 100).toFixed(2)}% from ${against}, past 1.2%. Holding until the regular session.`,
      };
    }
    return {
      session: 'extended',
      referenceSource,
      spreadBps,
      spreadPct,
      action: 'widen_slippage',
      suggestedSlippageBps: 75,
      reason: `Nasdaq ${session.phase} (${session.easternTime}).${drift} Thinner book, so slippage is set to 75 bps.`,
    };
  }

  if (spreadPct > CLOSED_HOLD_PCT) {
    return {
      session: 'closed',
      referenceSource,
      spreadBps,
      spreadPct,
      action: 'hold',
      suggestedSlippageBps: 150,
      reason: `Nasdaq is closed (${session.phase}) and the pool has drifted ${(spreadPct * 100).toFixed(2)}% from ${against}, past 1.5%. Holding to protect against off-hours slippage.`,
    };
  }

  return {
    session: 'closed',
    referenceSource,
    spreadBps,
    spreadPct,
    action: 'widen_slippage',
    suggestedSlippageBps: 120,
    reason: `Nasdaq is closed (${session.phase}), and the pool is still tracking ${against} to within ${(spreadPct * 100).toFixed(2)}%. Trading 24/7 with a 120 bps slippage guard.`,
  };
}
