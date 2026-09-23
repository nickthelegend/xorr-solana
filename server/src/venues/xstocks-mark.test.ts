/**
 * An xStock's mark is Jupiter's market price for the mint, not a $1,000 buy divided out (2026-09-23).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getJson = vi.fn();
vi.mock('../http/get.js', () => ({ getJson: (...a: unknown[]) => getJson(...a), staleValue: () => undefined }));
const inserted: unknown[][] = [];
vi.mock('../db/index.js', () => ({ query: vi.fn(async (_t: string, p: unknown[]) => { inserted.push(p); return []; }), one: vi.fn() }));
const quote = vi.fn();
vi.mock('./jupiter.js', () => ({ quote: (...a: unknown[]) => quote(...a) }));

const { xStockPriceUsd, clearXStockPriceCache, XSTOCKS } = await import('./xstocks.js');

describe('xStockPriceUsd', () => {
  beforeEach(() => {
    clearXStockPriceCache();
    getJson.mockReset();
    quote.mockReset();
    inserted.splice(0, inserted.length);
  });

  it("reads Jupiter's price for the mint, asks for no quote, and records what it read", async () => {
    getJson.mockResolvedValue({ [XSTOCKS.MSFTx!.address]: { usdPrice: 500.69 } });
    expect(await xStockPriceUsd('MSFTx')).toBe(500.69);
    expect(quote).not.toHaveBeenCalled();
    expect(String(getJson.mock.calls[0]![0])).toContain('/price/v3?ids=');
    await new Promise((r) => setTimeout(r, 0));
    expect(inserted).toContainEqual(['MSFTx', 500.69]);
  });

  it('a mint the price feed does not list has no price, not a remembered one', async () => {
    getJson.mockResolvedValue({});
    expect(await xStockPriceUsd('MSFTx')).toBeNull();
  });

  it('a feed that did not answer is no price either', async () => {
    getJson.mockRejectedValue(new Error('502'));
    expect(await xStockPriceUsd('NVDAx')).toBeNull();
  });
});
