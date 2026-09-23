import { describe, expect, it } from 'vitest';
import { ordinal } from './ordinal.js';

describe('ordinal', () => {
  it('writes the suffix a person would', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 50, 91, 99, 100, 101, 111].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '50th', '91st', '99th', '100th', '101st', '111th',
    ]);
  });
});
