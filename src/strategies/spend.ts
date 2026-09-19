import type { Cadence } from '@/data/types';

/**
 * What a strategy spends, per its own cadence (2026-09-20).
 *
 * `dailyAllocationUsd` is the amount for ONE run, whatever the cadence, and the agent screen rendered it as "$25.00 a
 * day" over a weekly buy — a statement that it spends seven times what it does. A cadence nobody recorded says "each
 * run" rather than naming a period it cannot know.
 */
export function spendPhrase(usd: string, cadence: Cadence | undefined): string {
  const per =
    cadence === 'daily'
      ? 'a day'
      : cadence === 'weekly'
        ? 'a week'
        : cadence === 'biweekly'
          ? 'every two weeks'
          : cadence === 'monthly'
            ? 'a month'
            : 'each run';
  return `${usd} ${per}`;
}
