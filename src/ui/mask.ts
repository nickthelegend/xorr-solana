/**
 * mask.ts — what a figure shows while balances are hidden (FEATURES.md #47).
 *
 * One tap on Home's balance hides every amount on every screen, so the rule lives where figures are drawn — `Price` and
 * `RollingNumber` apply it — rather than in each screen that formats money. Pure, so it is tested where it is written.
 *
 * A figure reaches `Price` as a formatted string, and a quote is written exactly as a holding is, so every dollar figure
 * is masked, prices included: a balance left showing is the one failure a privacy switch cannot have, and showing them
 * all again is one tap away. Counts, units, percentages and dashes are not money and stay as they are. The one dollar
 * figure never masked is the keypad's (`heroAmount`): it is the amount being typed, and an order its author cannot read
 * is not private, it is unusable.
 */
import type { ReactNode } from 'react';
import type { TypeVariant } from './type';

/** Four dots, whatever the figure. A mask as long as the number it covers would say roughly how big that number is. */
export const MASK = '••••';

/** What a figure hides: nothing, every dollar figure in it, or all of it. */
export type MaskMode = 'none' | 'dollars' | 'whole';

/**
 * A dollar figure as this app writes one — `money`, `price`, `signedMoney`, `compactMoney` — taking its sign and the "<"
 * in front of dust with it, so the mask does not leave "−" saying which way it went or "< " saying how small it is.
 */
const DOLLARS = /(?:<\s?)?[+−-]?\$\d[\d,]*(?:\.\d+)?[KMB]?/g;

/**
 * How a figure hides. `mask` is the caller's word for it: `true` for money written without a dollar sign, like a USDC
 * balance as a quantity; `false` for a figure already masked as a whole, like one character of a rolling number. Unsaid,
 * the dollar figures in it are masked — except on the keypad.
 */
export function maskMode(hidden: boolean, variant: TypeVariant | undefined, mask: boolean | undefined): MaskMode {
  if (!hidden || mask === false) return 'none';
  if (mask === true) return 'whole';
  return variant === 'heroAmount' ? 'none' : 'dollars';
}

/** The figure as it shows. A dash or a placeholder stays as it is: an unknown value masked would pass for a known one. */
export function maskFigure(text: string, mode: MaskMode): string {
  if (mode === 'none') return text;
  if (mode === 'whole') return /\d/.test(text) ? MASK : text;
  return text.replace(DOLLARS, MASK);
}

/**
 * A figure's text, when its children are nothing but text: `{money(x)}`, or a `$` beside `{amount}`, which JSX hands over
 * as two. Undefined when an element is among them — that is not a figure this can read, and it is drawn as it came.
 */
export function figureText(children: ReactNode): string | undefined {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (!Array.isArray(children)) return undefined;
  let text = '';
  for (const child of children) {
    if (child === null || child === undefined || typeof child === 'boolean') continue;
    const part = figureText(child);
    if (part === undefined) return undefined;
    text += part;
  }
  return text;
}

/** A masked figure as a screen reader says it. The dots would otherwise be read out as "bullet", four times. */
export function spokenFigure(text: string): string {
  return text.split(MASK).join('hidden');
}
