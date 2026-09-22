/**
 * 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 91st.
 *
 * The agent wrote every percentile as `${n}th`, so the hosted Activity read "trading at the 91th
 * percentile" beside a real purchase (2026-09-23). A sentence someone reads before trusting a bot
 * with money should not have a typo a person would not make.
 */
export function ordinal(n: number): string {
  const r100 = Math.abs(n) % 100;
  if (r100 >= 11 && r100 <= 13) return `${n}th`;
  const r10 = Math.abs(n) % 10;
  return `${n}${r10 === 1 ? 'st' : r10 === 2 ? 'nd' : r10 === 3 ? 'rd' : 'th'}`;
}
