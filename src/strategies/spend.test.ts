import { describe, expect, it } from 'vitest';
import { spendPhrase } from './spend';

describe('spendPhrase', () => {
  it('names the period the strategy actually runs on', () => {
    expect(spendPhrase('$25.00', 'weekly')).toBe('$25.00 a week');
    expect(spendPhrase('$25.00', 'daily')).toBe('$25.00 a day');
    expect(spendPhrase('$25.00', 'biweekly')).toBe('$25.00 every two weeks');
    expect(spendPhrase('$25.00', 'monthly')).toBe('$25.00 a month');
  });

  it('says "each run" when no cadence was recorded, rather than naming a period', () => {
    expect(spendPhrase('$25.00', undefined)).toBe('$25.00 each run');
  });
});
