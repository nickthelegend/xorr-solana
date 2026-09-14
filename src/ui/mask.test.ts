/**
 * Hidden balances (FEATURES.md #47): what a figure shows while they are hidden.
 *
 * The figures are the formatters' own output rather than hand-typed strings, so a change to how money is written that
 * the mask no longer recognises fails here instead of leaving an amount on screen.
 */
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { compactMoney, money, percent, price, quantity, signedMoney } from '@/format';
import { MASK, figureText, maskFigure, maskMode, spokenFigure } from './mask';

describe('maskMode', () => {
  it('masks nothing while balances are shown, whatever the figure says of itself', () => {
    expect(maskMode(false, 'rowPrimary', undefined)).toBe('none');
    expect(maskMode(false, 'rowPrimary', true)).toBe('none');
  });

  it('masks the dollar figures in a figure unless told otherwise', () => {
    expect(maskMode(true, 'rowPrimary', undefined)).toBe('dollars');
    expect(maskMode(true, 'heroBalance', undefined)).toBe('dollars');
    expect(maskMode(true, undefined, undefined)).toBe('dollars');
  });

  it('masks all of a figure said to be money, and none of one already masked as a whole', () => {
    expect(maskMode(true, 'rowPrimary', true)).toBe('whole');
    expect(maskMode(true, 'rowPrimary', false)).toBe('none');
  });

  it('never masks the keypad, where the amount is being typed', () => {
    expect(maskMode(true, 'heroAmount', undefined)).toBe('none');
  });
});

describe('maskFigure', () => {
  it('hides every dollar figure the formatters write, sign and all', () => {
    const figures = [
      money(4862.18),
      money(-4.22),
      money(1600, { fractionDigits: 0 }),
      signedMoney(590),
      signedMoney(-96),
      price(66560),
      price(0.1842),
      compactMoney(182_400_000),
    ];
    for (const figure of figures) expect(maskFigure(figure, 'dollars'), figure).toBe(MASK);
  });

  it('keeps the words and percentages beside a figure', () => {
    expect(maskFigure(`${signedMoney(12.4)} · ${percent(0.5)} open`, 'dollars')).toBe(`${MASK} · +0.5% open`);
    expect(maskFigure(`${money(1600, { fractionDigits: 0 })}/day`, 'dollars')).toBe(`${MASK}/day`);
    expect(maskFigure(`≈ ${money(0.01)}`, 'dollars')).toBe(`≈ ${MASK}`);
    expect(maskFigure(`Added ${money(100)}.`, 'dollars')).toBe(`Added ${MASK}.`);
  });

  it('does not say how small dust is', () => {
    expect(maskFigure(`< ${money(0.01)}`, 'dollars')).toBe(MASK);
  });

  it('leaves counts, units, percentages and unknowns alone', () => {
    const figures = [quantity(0.489), `${quantity(1.5)} WETH`, percent(-5.4), '12 trades', '3/9', '55%', '—', '· · ·'];
    for (const figure of figures) expect(maskFigure(figure, 'dollars'), figure).toBe(figure);
  });

  it('masks all of a figure said to be money, and never a dash or a placeholder', () => {
    expect(maskFigure(quantity(1234.5, 2), 'whole')).toBe(MASK);
    expect(maskFigure('—', 'whole')).toBe('—');
    expect(maskFigure('· · ·', 'whole')).toBe('· · ·');
  });

  it('changes nothing when there is nothing to mask', () => {
    expect(maskFigure(money(4862.18), 'none')).toBe('$4,862.18');
  });
});

describe('figureText', () => {
  it('reads a figure JSX hands over in parts', () => {
    expect(figureText('$4,862.18')).toBe('$4,862.18');
    expect(figureText(42)).toBe('42');
    expect(figureText(['$', '250'])).toBe('$250');
    expect(figureText([55, '%'])).toBe('55%');
    expect(figureText(['a', null, false, undefined, 'b'])).toBe('ab');
  });

  it('refuses a figure with an element in it, and an absent one', () => {
    expect(figureText(['$', createElement('span', null, '250')])).toBeUndefined();
    expect(figureText(undefined)).toBeUndefined();
  });
});

describe('spokenFigure', () => {
  it('says the mask as a word', () => {
    expect(spokenFigure(MASK)).toBe('hidden');
    expect(spokenFigure(`${MASK} · +0.5% open`)).toBe('hidden · +0.5% open');
  });
});
