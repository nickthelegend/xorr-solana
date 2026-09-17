/**
 * Nasdaq market hours & off-hours oracle spread monitoring — PLAN.md §8.4 / grounding audit.
 *
 * xStocks trade 24/7 on Solana, but the underlying US equities (NVDA, TSLA, AAPL, MSFT)
 * only trade during Nasdaq regular and extended sessions.
 *
 * Sessions (America/New_York):
 * - Pre-market:    04:00 - 09:30 ET (Mon-Fri)
 * - Regular:       09:30 - 16:00 ET (Mon-Fri)
 * - After-hours:   16:00 - 20:00 ET (Mon-Fri)
 * - Closed:        20:00 - 04:00 ET (Overnight) & Friday 20:00 - Monday 04:00 ET (Weekend)
 *
 * Off-hours slippage guard:
 * When the underlying exchange is closed, Jupiter pool spreads can decouple from the underlying
 * equity's value. This module measures that spread to widen slippage or hold execution.
 *
 * The session half needs no network — it is a clock and a calendar. The spread half needs a price
 * for the underlying share from somewhere OTHER than the pool being checked, and that comes from
 * the issuer's own public feed (`market/backed.ts`). The two are deliberately separate functions:
 * `evaluateOffHoursGuard` is pure and takes the reference price it was given, `offHoursGuard`
 * fetches it. A table of hardcoded "reference prices" used to stand in for the feed here; see
 * `backed.ts` for why four numbers in a source file are worse than no number at all.
 */

import { underlyingQuoteUsd } from './backed.js';

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
  /**
   * How far the pool has drifted from the underlying share, or `null` when there was no reference
   * price to measure against. `0` would read as "the two agree exactly", which is a claim nobody
   * made, so the unmeasured case gets its own value.
   */
  spreadBps: number | null;
  spreadPct: number | null;
  action: 'normal' | 'widen_slippage' | 'hold';
  suggestedSlippageBps: number;
  reason: string;
};

/**
 * Computes current Nasdaq session state based on America/New_York clock.
 */
export function getNasdaqSession(now: Date = new Date()): NasdaqSessionDetail {
  // Format in America/New_York
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

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = dayMap[weekdayStr] ?? 1;
  const timeInMinutes = hourET * 60 + minuteET;

  // Weekend check: Friday after 20:00 (1200 mins), Saturday all day, Sunday until 04:00 (or all day)
  const isWeekend =
    dayOfWeek === 6 || // Saturday
    dayOfWeek === 0 || // Sunday
    (dayOfWeek === 5 && timeInMinutes >= 20 * 60) || // Friday night after 8pm ET
    (dayOfWeek === 1 && timeInMinutes < 4 * 60); // Monday pre-dawn before 4am ET

  if (isWeekend) {
    return {
      session: 'closed',
      phase: 'weekend',
      isExchangeOpen: false,
      easternTime: `${String(hourET).padStart(2, '0')}:${String(minuteET).padStart(2, '0')} ET`,
      dayOfWeek,
      hourET,
      minuteET,
    };
  }

  // Pre-market: 04:00 to 09:30 ET
  if (timeInMinutes >= 4 * 60 && timeInMinutes < 9 * 60 + 30) {
    return {
      session: 'extended',
      phase: 'pre-market',
      isExchangeOpen: true,
      easternTime: `${String(hourET).padStart(2, '0')}:${String(minuteET).padStart(2, '0')} ET`,
      dayOfWeek,
      hourET,
      minuteET,
    };
  }

  // Regular market: 09:30 to 16:00 ET
  if (timeInMinutes >= 9 * 60 + 30 && timeInMinutes < 16 * 60) {
    return {
      session: 'regular',
      phase: 'regular',
      isExchangeOpen: true,
      easternTime: `${String(hourET).padStart(2, '0')}:${String(minuteET).padStart(2, '0')} ET`,
      dayOfWeek,
      hourET,
      minuteET,
    };
  }

  // After-hours: 16:00 to 20:00 ET
  if (timeInMinutes >= 16 * 60 && timeInMinutes < 20 * 60) {
    return {
      session: 'extended',
      phase: 'after-hours',
      isExchangeOpen: true,
      easternTime: `${String(hourET).padStart(2, '0')}:${String(minuteET).padStart(2, '0')} ET`,
      dayOfWeek,
      hourET,
      minuteET,
    };
  }

  // Overnight: 20:00 to 04:00 ET
  return {
    session: 'closed',
    phase: 'overnight',
    isExchangeOpen: false,
    easternTime: `${String(hourET).padStart(2, '0')}:${String(minuteET).padStart(2, '0')} ET`,
    dayOfWeek,
    hourET,
    minuteET,
  };
}

/**
 * Strips 'x' or 'c' suffix to get the underlying ticker (e.g. NVDAx -> NVDA).
 */
export function underlyingTicker(symbol: string): string {
  const s = symbol.trim();
  if (s.endsWith('x') || s.endsWith('X') || s.endsWith('c') || s.endsWith('C')) {
    return s.slice(0, -1).toUpperCase();
  }
  return s.toUpperCase();
}

/**
 * Evaluates the off-hours slippage guard: the pool price against the underlying share.
 *
 * Pure and synchronous. `referencePrice` is passed IN rather than fetched here, so the rules below
 * are testable against an exact spread and so the one network read this guard needs lives in one
 * place (`offHoursGuard`).
 *
 * Rules, with a reference price to compare against:
 * - Regular session: normal 50 bps. The listing is open; the pool has something to track.
 * - Extended session: 75 bps, or HOLD above a 1.2% spread.
 * - Closed (weekend / overnight): 120 bps, or HOLD above a 1.5% spread — beyond that the pool has
 *   decoupled from the equity it is supposed to represent and a fill would be at a made-up price.
 *
 * Without one (`referencePrice: null` — the feed did not answer):
 * - Regular session: normal 50 bps. Nothing is being checked, and nothing needs to be: the
 *   exchange itself is open and arbitrage is holding the pool to it.
 * - Extended or closed: HOLD. The whole purpose of the guard outside regular hours is to catch a
 *   pool that has drifted, and it cannot do that blind. Refusing to trade is the honest response;
 *   substituting a number and calling the spread 0% is not.
 */
export type OffHoursGuardInput = {
  symbol: string;
  /** What a fill would actually get, derived from the pool it would touch. */
  onChainPrice: number;
  /**
   * What one underlying share is worth according to something other than that pool — the issuer's
   * own feed, in production (`underlyingQuoteUsd`). `null` when it had no answer.
   */
  referencePrice: number | null;
  now?: Date;
};

export function evaluateOffHoursGuard(params: OffHoursGuardInput): OffHoursGuardVerdict {
  const { onChainPrice, referencePrice, now } = params;
  const session = getNasdaqSession(now);

  if (referencePrice === null || !(referencePrice > 0)) {
    if (session.session === 'regular') {
      return {
        session: 'regular',
        spreadBps: null,
        spreadPct: null,
        action: 'normal',
        suggestedSlippageBps: 50,
        reason: `Nasdaq regular hours active (${session.easternTime}). No reference quote for ${params.symbol}, but the listing is open and pricing the pool.`,
      };
    }
    return {
      session: session.session,
      spreadBps: null,
      spreadPct: null,
      action: 'hold',
      suggestedSlippageBps: 50,
      reason: `Nasdaq is ${session.phase} and there is no reference quote for ${params.symbol} to check the pool against. Holding rather than trading against an unverified off-hours price.`,
    };
  }

  const diff = Math.abs(onChainPrice - referencePrice);
  const spreadPct = diff / referencePrice;
  const spreadBps = Math.round(spreadPct * 10_000);

  if (session.session === 'regular') {
    return {
      session: 'regular',
      spreadBps,
      spreadPct,
      action: 'normal',
      suggestedSlippageBps: 50,
      reason: `Nasdaq regular hours active (${session.easternTime}). Liquidity optimal.`,
    };
  }

  if (session.session === 'extended') {
    if (spreadPct > 0.012) {
      return {
        session: 'extended',
        spreadBps,
        spreadPct,
        action: 'hold',
        suggestedSlippageBps: 100,
        reason: `Nasdaq ${session.phase} spread is wide (${(spreadPct * 100).toFixed(2)}% > 1.2%). Holding until regular session.`,
      };
    }
    return {
      session: 'extended',
      spreadBps,
      spreadPct,
      action: 'widen_slippage',
      suggestedSlippageBps: 75,
      reason: `Nasdaq ${session.phase} active (${session.easternTime}). Mild spread (${(spreadPct * 100).toFixed(2)}%), slippage adjusted to 75 bps.`,
    };
  }

  // Closed session (weekend or overnight)
  if (spreadPct > 0.015) {
    return {
      session: 'closed',
      spreadBps,
      spreadPct,
      action: 'hold',
      suggestedSlippageBps: 150,
      reason: `Nasdaq is closed (${session.phase}) and on-chain oracle spread is elevated (${(spreadPct * 100).toFixed(2)}% > 1.5%). Holding to protect against off-hours slippage.`,
    };
  }

  return {
    session: 'closed',
    spreadBps,
    spreadPct,
    action: 'widen_slippage',
    suggestedSlippageBps: 120,
    reason: `Nasdaq is closed (${session.phase}). Operating 24/7 on Solana with adjusted 120 bps slippage guard (spread ${(spreadPct * 100).toFixed(2)}%).`,
  };
}

/**
 * The guard as the executor uses it: the same rules, with the reference price read from the issuer.
 *
 * One network read, cached for 30s by `http/get.ts`, and `null` on any failure — which the rules
 * above turn into a HOLD outside regular hours rather than into a fabricated agreement.
 */
export async function offHoursGuard(params: {
  symbol: string;
  onChainPrice: number;
  now?: Date;
}): Promise<OffHoursGuardVerdict> {
  const referencePrice = await underlyingQuoteUsd(underlyingTicker(params.symbol));
  return evaluateOffHoursGuard({ ...params, referencePrice });
}
