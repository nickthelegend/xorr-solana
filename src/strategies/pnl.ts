/**
 * The shape of a strategy's profit, derived from what the research measured.
 *
 * The book records wins, losses and the mean size of each, not a gross-profit line. Those are the
 * same fact: a mean is a sum over a count, so `wins × avgWin` IS the gross profit — exact, not an
 * estimate. Checked against every strategy that carries a deeper book: it reconciles with the
 * recorded net to the cent.
 *
 * ## The trap this module exists to avoid
 *
 * A familiar backtest report draws four bars — gross profit, gross loss, commission, net — as if
 * commission were a fourth deduction. **Here it is not.** `grossProfit + grossLoss` already equals
 * the recorded net exactly, which means the fees are inside the per-trade figures the averages came
 * from. Drawing them as a further subtraction would produce bars that do not add up and a net that
 * is wrong by the fee total, so `feesUsd` comes back separately and labelled as already included.
 *
 * Returns null rather than zeroes when the split did not record the pieces. A P&L chart of nothing
 * is a strategy that made nothing, which is a different claim.
 */
import type { Split } from '@/data/strategyLibrary';

export type PnlStructure = {
  grossProfitUsd: number;
  /** Negative. */
  grossLossUsd: number;
  netUsd: number;
  /** Already reflected in the three figures above — never subtract it again. */
  feesUsd: number | null;
  wins: number;
  losses: number;
  /** 0–1. */
  winRate: number;
};

/** The pieces, or null when the split did not carry them. */
export function pnlStructure(split: Split): PnlStructure | null {
  const { wins, losses, avgWinUsd, avgLossUsd } = split;
  if (wins === null || wins === undefined || losses === null || losses === undefined) return null;
  if (avgWinUsd === null || avgWinUsd === undefined || avgLossUsd === null || avgLossUsd === undefined) return null;
  const trades = wins + losses;
  if (trades <= 0) return null;

  const grossProfitUsd = wins * avgWinUsd;
  /* `avgLossUsd` is already negative in the source; keeping the sign makes the bar's direction data. */
  const grossLossUsd = losses * avgLossUsd;
  return {
    grossProfitUsd,
    grossLossUsd,
    netUsd: grossProfitUsd + grossLossUsd,
    feesUsd: split.feesUsd ?? null,
    wins,
    losses,
    winRate: wins / trades,
  };
}

/**
 * The same, from the deeper book's own fields.
 *
 * Those 35 strategies record the net and the fees directly, so the net is taken rather than derived
 * — if the two ever disagreed, the recorded one is the measurement and the derivation is the guess.
 */
export function pnlStructureFromDetail(d: {
  wins: number | null; losses: number | null; avgWinUsd: number | null; avgLossUsd: number | null;
  totalPnlUsd: number | null; totalFeesUsd: number | null;
}): PnlStructure | null {
  if (d.wins === null || d.losses === null || d.avgWinUsd === null || d.avgLossUsd === null) return null;
  const trades = d.wins + d.losses;
  if (trades <= 0) return null;
  const grossProfitUsd = d.wins * d.avgWinUsd;
  const grossLossUsd = d.losses * d.avgLossUsd;
  return {
    grossProfitUsd,
    grossLossUsd,
    netUsd: d.totalPnlUsd ?? grossProfitUsd + grossLossUsd,
    feesUsd: d.totalFeesUsd,
    wins: d.wins,
    losses: d.losses,
    winRate: d.wins / trades,
  };
}
