import { describe, expect, it } from 'vitest';
import { assetMarkTag } from './sharedTags';

describe('assetMarkTag — both ends must agree exactly', () => {
  /*
   * A shared transition runs only when leaving and arriving carry the SAME tag. A mismatch fails silently — the tap just
   * looks as it always did — so the row and the header must derive it identically from whatever form of the symbol each
   * happens to hold.
   */
  it('matches however the symbol is cased or padded', () => {
    expect(assetMarkTag('NVDAx')).toBe(assetMarkTag('nvdax'));
    expect(assetMarkTag(' NVDAx ')).toBe(assetMarkTag('NVDAx'));
  });

  it('never gives two different symbols the same tag', () => {
    const symbols = ['NVDAx', 'TSLAx', 'AAPLx', 'SPYx', 'QQQx', 'BTC', 'ETH'];
    expect(new Set(symbols.map(assetMarkTag)).size).toBe(symbols.length);
  });

  /* Namespaced, so an asset mark cannot collide with a tag some other shared element uses later. */
  it('is namespaced', () => {
    expect(assetMarkTag('BTC').startsWith('asset-mark:')).toBe(true);
  });
});
