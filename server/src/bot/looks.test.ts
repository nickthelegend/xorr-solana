/**
 * The sentence a sweep that took nothing says for itself.
 *
 * "Nothing qualified" leaves an owner — or anyone judging this — unable to tell an agent that is working from one that
 * is broken. These pin the order the reasons are given in: a setup held back by pacing first, because that one most
 * looks like a fault; then the nearest miss, which is the number somebody will want; then the structural reasons.
 */
import { describe, expect, it } from 'vitest';
import { nothingQualifiedDetail, type SymbolLook } from './autonomous.js';

const between = (symbol: string, position: number): SymbolLook => ({
  symbol,
  verdict: 'between_bands',
  detail: `${symbol} sits at the ${Math.round(position * 100)}th percentile of its $1.00-$2.00 band; this profile buys a breakout at the 75th or a dip below the 40th.`,
  position,
});

describe('what the agent says when it takes nothing', () => {
  it('leads with a setup held back by pacing, because that looks most like a fault', () => {
    const looks: SymbolLook[] = [
      between('NVDAx', 0.5),
      { symbol: 'TSLAx', verdict: 'paced', detail: 'TSLAx reads as a setup, but this wallet has already entered it today.' },
    ];
    expect(nothingQualifiedDetail(looks)).toBe('TSLAx reads as a setup, but this wallet has already entered it today.');
  });

  it('otherwise names the nearest miss and how many it looked at', () => {
    const out = nothingQualifiedDetail([between('NVDAx', 0.4), between('TSLAx', 0.62), between('AAPLx', 0.1)]);
    expect(out).toMatch(/Looked at 3 xStocks and took none/);
    expect(out).toContain('TSLAx');
    expect(out).toContain('62th percentile');
  });

  it('says the market is shut when that is what stopped most of them', () => {
    const held: SymbolLook[] = ['NVDAx', 'TSLAx'].map((s) => ({
      symbol: s,
      verdict: 'held_off_hours' as const,
      detail: `${s}: the Nasdaq is shut and the price has moved away from the last close.`,
    }));
    expect(nothingQualifiedDetail(held)).toMatch(/the Nasdaq is shut/);
  });

  it('says it has no band yet rather than implying a judgement it has not made', () => {
    const out = nothingQualifiedDetail([
      { symbol: 'NVDAx', verdict: 'no_band', detail: 'NVDAx has no band yet: this app needs 6 readings over a day before it will judge a move.' },
    ]);
    expect(out).toContain('no band yet');
  });

  it('never claims to have looked at something when it looked at nothing', () => {
    expect(nothingQualifiedDetail([])).toBe('Nothing in the xStocks universe reads as a setup right now.');
  });
});
