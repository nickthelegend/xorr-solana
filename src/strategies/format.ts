/**
 * How a research figure is written down.
 *
 * Out of the screen layer for the reason `src/qa/audit.test.ts` enforces: a screen that calls
 * `toFixed` on money formats it differently from every other screen, and the app has one voice for
 * numbers. These wrap `@/format` so a return here reads the way a return reads anywhere else.
 *
 * The rule the whole module exists for: **a figure the research did not measure is an em dash, not
 * a zero.** Several of these fields are genuinely absent — a strategy with no second split, a
 * profit factor that is undefined because nothing lost. Rendering those as 0.00 would be inventing
 * a measurement, and would put "0.00% return" beside a real one as if they meant the same thing.
 */
import { money, percent, quantity } from '@/format';
import { colors } from '@/ui';

/** A ratio or a count: `null` is "not measured", never zero. */
export function ratio(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined ? '—' : quantity(v, digits);
}

/** A percentage the research measured, signed. */
export function returnPct(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined ? '—' : percent(v, { digits, explicitSign: true });
}

/** A percentage that is a magnitude rather than a change — a drawdown, a win rate. */
export function plainPct(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined ? '—' : percent(v, { digits, explicitSign: false });
}

/** A dollar figure from the book. Fees and average wins run to fractions of a cent. */
export function usd(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined ? '—' : money(v, { fractionDigits: digits });
}

/** A whole count. */
export function count(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : quantity(v, 0);
}

/**
 * Green above zero, red below, neutral at zero — and neutral for "not measured".
 *
 * An absent figure must never take the colour of a good one: grey is the honest answer for a
 * number nobody has.
 */
export function tone(v: number | null | undefined): string {
  if (v === null || v === undefined) return colors.ink55;
  return v > 0 ? colors.up : v < 0 ? colors.down : colors.ink;
}
