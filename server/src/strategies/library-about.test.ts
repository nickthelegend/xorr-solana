import { describe, expect, it } from 'vitest';
import { getStrategy, plainAbout } from './library.js';

describe('a library description is prose', () => {
  it('keeps the words before the first table and drops the marks', () => {
    expect(plainAbout('Ten families. `breadth100.py` covered *ideas* and **more**. | family | n | |---|---|')).toBe(
      'Ten families. breadth100.py covered ideas and more.',
    );
    expect(plainAbout(null)).toBeNull();
  });

  it('no entry in the book carries a pipe or a code mark', () => {
    for (const id of ['b200_sess_8', 'b100_volume_5', 'deep_liq_dryup']) {
      const about = getStrategy(id)?.about ?? '';
      expect(about).not.toMatch(/[|`*]/);
      expect(about.length).toBeGreaterThan(40);
    }
  });
});
