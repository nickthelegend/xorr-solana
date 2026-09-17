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
 * When the underlying exchange is closed, Jupiter pool spreads can decouple from Nasdaq close / oracle.
 * This module measures the oracle-vs-Nasdaq spread to dynamically widen slippage or hold execution.
 */

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
  spreadBps: number;
  spreadPct: number;
  action: 'normal' | 'widen_slippage' | 'hold';
  suggestedSlippageBps: number;
  reason: string;
};

/** Reference prices for underlying US equities (used when Nasdaq feed is closed/offline). */
export const NASDAQ_REFERENCE_PRICES: Record<string, number> = {
  NVDA: 216.5,
  TSLA: 360.9,
  AAPL: 334.6,
  MSFT: 496.0,
  // xStocks aliases
  NVDAx: 216.5,
  TSLAx: 360.9,
  AAPLx: 334.6,
  MSFTx: 496.0,
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
 * Evaluates the off-hours slippage guard comparing on-chain price with Nasdaq reference / oracle.
 *
 * Rules:
 * - Regular session: Normal 50 bps slippage, no hold.
 * - Extended session: Normal or slightly widened (75 bps) if spread < 0.5%.
 * - Closed (weekend / overnight):
 *     spread <= 0.5%: Widen slippage to 100 bps (allow trade with buffer).
 *     0.5% < spread <= 1.5%: Widen slippage to 150 bps.
 *     spread > 1.5%: HOLD execution — DEX pool has decoupled from underlying equity value.
 */
export function evaluateOffHoursGuard(params: {
  symbol: string;
  onChainPrice: number;
  now?: Date;
  oraclePrice?: number;
}): OffHoursGuardVerdict {
  const { symbol, onChainPrice, now } = params;
  const session = getNasdaqSession(now);
  const ticker = underlyingTicker(symbol);
  const referencePrice = params.oraclePrice ?? NASDAQ_REFERENCE_PRICES[ticker] ?? onChainPrice;

  const diff = Math.abs(onChainPrice - referencePrice);
  const spreadPct = diff / Math.max(referencePrice, 1e-6);
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
