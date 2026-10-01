/**
 * Take profit and stop loss on a symbol, from the exit rules set on it — and nothing when there are none.
 *
 * Moved out of `app/portfolio.tsx` (2026-10-01) so the phone cards and the desktop positions table read a position's
 * levels from one place.
 */
import { price as fmtPrice } from '@/ui/format';
import type { PositionLevel } from '@/ui/PositionCard';
import type { Strategy } from '@/data/types';

export function exitLevels(strategies: readonly Strategy[], symbol: string, entry: number): PositionLevel[] {
  const rule = strategies.find(
    (s) => s.kind === 'exit-rules' && s.symbol === symbol && (s.state === 'live' || s.state === 'watch'),
  );
  if (!rule) return [];
  const levels: PositionLevel[] = [];
  const tp = Math.abs(Number(rule.params.takeProfitPct ?? 0));
  const sl = Math.abs(Number(rule.params.stopLossPct ?? 0));
  if (tp > 0) {
    const value = entry * (1 + tp / 100);
    levels.push({ label: 'TP', value, formatted: fmtPrice(value), tone: 'target' });
  }
  if (sl > 0) {
    const value = entry * (1 - sl / 100);
    levels.push({ label: 'SL', value, formatted: fmtPrice(value), tone: 'stop' });
  }
  return levels;
}
