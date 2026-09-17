/**
 * Corporate Action Schedule & Scaled UI Multipliers for Backed Finance xStocks — PLAN.md §8.4 / grounding audit.
 *
 * xStocks (Token-2022) reflect real underlying equities which undergo corporate actions:
 * - Stock splits (adjusts token multiplier / supply)
 * - Cash dividends (ex-dividend price drop on underlying)
 * - Spinoffs / mergers
 *
 * Invariant:
 * Balances on Token-2022 are Scaled UI (raw x multiplier).
 * Reading uiAmount directly from the RPC prevents splits from looking like a P&L crash.
 */
import { underlyingTicker } from '../market/nasdaq.js';

export type CorporateActionKind = 'split' | 'dividend' | 'spinoff' | 'merger';

export type CorporateAction = {
  id: string;
  symbol: string;
  kind: CorporateActionKind;
  title: string;
  exDate: string; // ISO date string YYYY-MM-DD
  recordDate?: string;
  ratio?: number; // e.g. 2 for 2-for-1 split
  cashAmountUsd?: number;
  notes?: string;
};

export type CorporateActionAssessment = {
  symbol: string;
  multiplier: number;
  imminentAction: CorporateAction | null;
  daysUntil: number | null;
  recommendation: 'avoid_entry' | 'hold_exits' | 'position_dca' | 'normal';
  scoreAdjustment: number;
  reason: string;
};

/** Current known token multipliers for xStocks (Token-2022 Scaled UI factor). */
const MULTIPLIERS: Record<string, number> = {
  NVDAx: 1.0,
  TSLAx: 1.0,
  AAPLx: 1.0,
  MSFTx: 1.0,
};

/**
 * Known schedule of upcoming corporate actions for xStocks.
 * Ex-dividend and split dates require careful timing:
 * - Ex-dividend: Underlying stock drops by dividend amount on open of ex-date.
 * - Split: Multipliers and balances scale; trading volume concentrates.
 */
const SCHEDULE: CorporateAction[] = [
  {
    id: 'ca-nvda-div-q3',
    symbol: 'NVDAx',
    kind: 'dividend',
    title: 'NVIDIA Quarterly Cash Dividend',
    exDate: '2026-12-04',
    cashAmountUsd: 0.1,
    notes: 'Regular cash dividend $0.10 per share equivalent.',
  },
  {
    id: 'ca-aapl-div-q3',
    symbol: 'AAPLx',
    kind: 'dividend',
    title: 'Apple Quarterly Dividend',
    exDate: '2026-11-07',
    cashAmountUsd: 0.25,
    notes: 'Regular cash dividend $0.25 per share equivalent.',
  },
  {
    id: 'ca-msft-div-q3',
    symbol: 'MSFTx',
    kind: 'dividend',
    title: 'Microsoft Quarterly Dividend',
    exDate: '2026-11-19',
    cashAmountUsd: 0.83,
    notes: 'Regular cash dividend $0.83 per share equivalent.',
  },
  {
    id: 'ca-tsla-split-sample',
    symbol: 'TSLAx',
    kind: 'split',
    title: 'Tesla Forward Stock Split',
    exDate: '2026-12-28',
    ratio: 2,
    notes: '2-for-1 forward split. Token-2022 multiplier will update 1.0 -> 2.0.',
  },
];

/**
 * Returns current token multiplier for a given xStock.
 * Raw token units multiplied by this multiplier equals share equivalent.
 */
export async function getMultiplier(symbol: string): Promise<number> {
  const norm = symbol.trim();
  const key = Object.keys(MULTIPLIERS).find((k) => k.toUpperCase() === norm.toUpperCase());
  return key ? MULTIPLIERS[key]! : 1.0;
}

/**
 * Fetches the corporate actions schedule for an xStock.
 */
export async function getCorporateActions(symbol: string): Promise<CorporateAction[]> {
  const ticker = underlyingTicker(symbol);
  return SCHEDULE.filter((ca) => underlyingTicker(ca.symbol) === ticker);
}

/**
 * Evaluates the corporate-action proximity signal for autonomous strategy selection.
 *
 * Signal rules:
 * 1. Imminent Stock Split (< 48 hours):
 *    Avoid aggressive momentum entries (score -40) to protect against sudden split rebalancing and exchange volatility.
 * 2. Imminent Ex-Dividend Date (< 48 hours):
 *    Avoid momentum breakout entries (score -25) to avoid entering right before the ex-date dividend drop.
 * 3. Moderate horizon (3 - 10 days):
 *    Normal operations; dividend runup can be positive for DCA accumulation (+10).
 * 4. Outside window (> 10 days or none scheduled):
 *    Normal operations (score adjustment 0).
 */
export async function assessCorporateAction(
  symbol: string,
  now: Date = new Date(),
): Promise<CorporateActionAssessment> {
  const multiplier = await getMultiplier(symbol);
  const actions = await getCorporateActions(symbol);
  const todayMs = now.getTime();

  let closestAction: CorporateAction | null = null;
  let minDaysUntil: number | null = null;

  for (const action of actions) {
    const exDateMs = new Date(action.exDate).getTime();
    const diffDays = Math.round((exDateMs - todayMs) / 86_400_000);

    // Only consider upcoming actions (today or future)
    if (diffDays >= 0) {
      if (minDaysUntil === null || diffDays < minDaysUntil) {
        minDaysUntil = diffDays;
        closestAction = action;
      }
    }
  }

  if (!closestAction || minDaysUntil === null) {
    return {
      symbol,
      multiplier,
      imminentAction: null,
      daysUntil: null,
      recommendation: 'normal',
      scoreAdjustment: 0,
      reason: 'No upcoming corporate actions scheduled.',
    };
  }

  // Split within 48 hours
  if (closestAction.kind === 'split' && minDaysUntil <= 2) {
    return {
      symbol,
      multiplier,
      imminentAction: closestAction,
      daysUntil: minDaysUntil,
      recommendation: 'avoid_entry',
      scoreAdjustment: -40,
      reason: `Stock split (${closestAction.ratio}:1) scheduled in ${minDaysUntil} day(s) on ${closestAction.exDate}. Avoiding new entries to prevent split volatility.`,
    };
  }

  // Ex-dividend within 48 hours
  if (closestAction.kind === 'dividend' && minDaysUntil <= 2) {
    return {
      symbol,
      multiplier,
      imminentAction: closestAction,
      daysUntil: minDaysUntil,
      recommendation: 'avoid_entry',
      scoreAdjustment: -25,
      reason: `Ex-dividend date in ${minDaysUntil} day(s) ($${closestAction.cashAmountUsd ?? 0}/sh). Avoiding momentum buy before ex-dividend price adjustment.`,
    };
  }

  // Dividend runup window (3 to 7 days away)
  if (closestAction.kind === 'dividend' && minDaysUntil >= 3 && minDaysUntil <= 7) {
    return {
      symbol,
      multiplier,
      imminentAction: closestAction,
      daysUntil: minDaysUntil,
      recommendation: 'position_dca',
      scoreAdjustment: 10,
      reason: `Dividend record date approaching in ${minDaysUntil} days. Favorable window for dividend capture DCA accumulation.`,
    };
  }

  return {
    symbol,
    multiplier,
    imminentAction: closestAction,
    daysUntil: minDaysUntil,
    recommendation: 'normal',
    scoreAdjustment: 0,
    reason: `Corporate action (${closestAction.kind}) scheduled in ${minDaysUntil} days (${closestAction.exDate}). Within normal risk tolerance.`,
  };
}
