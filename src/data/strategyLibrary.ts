/**
 * The research book, as the app reads it.
 *
 * 313 strategies from the first xorr, each put through a walk-forward gauntlet; ten survived. The
 * server holds the book (`server/src/strategies/library.ts`) and this is the shape it answers in.
 *
 * Every number here is out-of-sample unless the field says `inSample`. That distinction is the
 * whole point of the screen: an in-sample return is what a strategy scored on the data it was
 * fitted to, which is not a result. Nothing in this module smooths a null into a zero — a field the
 * research did not measure arrives null and the screen says so.
 */
import { api } from './api';

export type Split = {
  returnPct: number | null;
  maxDdPct: number | null;
  sharpe: number | null;
  sortino?: number | null;
  expectancyR: number | null;
  trades: number | null;
  winRate?: number | null;
  wins?: number | null;
  losses?: number | null;
  profitFactor?: number | null;
  feesUsd?: number | null;
  avgWinUsd?: number | null;
  avgLossUsd?: number | null;
  bestTradePct?: number | null;
  worstTradePct?: number | null;
  avgHoldBars?: number | null;
};

export type StrategySummary = {
  id: string;
  name: string;
  family: string | null;
  survives: boolean;
  returnPct: number | null;
  sharpe: number | null;
  winRate: number | null;
  profitFactor: number | null;
  maxDdPct: number | null;
  trades: number | null;
  hasDetail: boolean;
};

export type StrategyProvenance = {
  source: string;
  method: string;
  universe: number | null;
  interval: string | null;
  bars: number | null;
  sizeUsd: number | null;
  caveat: string;
};

export type StrategyDetail = {
  id: string;
  name: string;
  family: string | null;
  about: string | null;
  aboutSource: 'strategy' | 'family' | null;
  survives: boolean;
  failedOn: string[];
  single: { inSample: Split; outOfSample: Split };
  portfolio: { inSample: Split; outOfSample: Split };
  sensitivity: { label: string | null; expectancyR: (number | null)[] };
  doubleCommission: { expectancyR: number | null; returnPct: number | null };
  crossAsset: { asset: string; expectancyR: number | null }[];
  detail: {
    trades: number | null;
    wins: number | null;
    losses: number | null;
    winRate: number | null;
    totalPnlUsd: number | null;
    expectancyR: number | null;
    avgWinUsd: number | null;
    avgLossUsd: number | null;
    profitFactor: number | null;
    maxDrawdownUsd: number | null;
    totalFeesUsd: number | null;
    avgHoldMinutes: number | null;
  } | null;
};

export type LibraryPage = {
  provenance: StrategyProvenance;
  counts: { total: number; survivors: number; withDetail: number };
  families: { name: string; count: number; survivors: number }[];
  filtered: { survivorsOnly: boolean; q: string | null; family: string | null };
  strategies: StrategySummary[];
};

export const strategyLibrary = {
  /** Survivors unless `all`, because "313 tested, 10 survived" is the headline, not "313 strategies". */
  list: (opts: { all?: boolean; q?: string; family?: string } = {}) => {
    const p = new URLSearchParams();
    if (opts.all) p.set('all', '1');
    if (opts.q) p.set('q', opts.q);
    if (opts.family) p.set('family', opts.family);
    const qs = p.toString();
    return api.get<LibraryPage>(`/strategies/library${qs ? `?${qs}` : ''}`);
  },
  get: (id: string) => api.get<{ provenance: StrategyProvenance; strategy: StrategyDetail }>(`/strategies/library/${id}`),
};
