import { describe, expect, it } from 'vitest';
import { sharePriced } from './useSpotPrices';

describe('sharePriced', () => {
  it('prices the Base shares from the snapshot on either build', () => {
    expect(sharePriced('NVDAc', false)).toBe(true);
    expect(sharePriced('NVDAc', true)).toBe(true);
  });

  it('prices xStocks from the snapshot on Solana, where the crypto feed has none', () => {
    expect(sharePriced('NVDAx', true)).toBe(true);
    expect(sharePriced('SPYx', true)).toBe(true);
  });

  it('leaves SPYx to the feed on Base, where it is an index row', () => {
    expect(sharePriced('SPYx', false)).toBe(false);
  });

  it('never sends crypto or cash to the snapshot', () => {
    for (const s of ['SOL', 'BTC', 'USDC', 'XAUT']) expect(sharePriced(s, true)).toBe(false);
  });
});
