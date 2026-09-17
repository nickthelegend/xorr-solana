/**
 * The issuer's price feed, and the one thing it must never do: answer with a number nobody sent.
 *
 * What stood here before was a `Record<string, number>` of four equity prices — NVDA at 216.5,
 * TSLA at 360.9 — used "when the Nasdaq feed is closed/offline". Those are the tests for the
 * replacement, and most of them are about the empty cases, because that table's whole failure mode
 * was looking successful.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const getJsonMock = vi.fn<(url: string, ttlMs?: number, timeoutMs?: number) => Promise<unknown>>();
vi.mock('../http/get.js', () => ({
  getJson: (url: string, ttlMs?: number, timeoutMs?: number) => getJsonMock(url, ttlMs, timeoutMs),
}));

const { underlyingQuoteUsd, backedSymbol } = await import('./backed.js');

beforeEach(() => {
  getJsonMock.mockReset();
});

describe('backedSymbol', () => {
  it('names the instrument the issuer mints for a ticker', () => {
    expect(backedSymbol('NVDA')).toBe('NVDAx');
    expect(backedSymbol('tsla')).toBe('TSLAx');
  });

  it('refuses anything that is not a bare ticker', () => {
    expect(backedSymbol('')).toBeNull();
    expect(backedSymbol('NVDA/USD')).toBeNull();
    expect(backedSymbol('../../etc/passwd')).toBeNull();
  });
});

describe('underlyingQuoteUsd', () => {
  it('asks the public price-data endpoint for the issuer instrument', async () => {
    getJsonMock.mockResolvedValue({ quote: 215.36 });

    expect(await underlyingQuoteUsd('NVDA')).toBe(215.36);
    expect(getJsonMock).toHaveBeenCalledTimes(1);
    const [url] = getJsonMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.backed.fi/api/v2/public/assets/NVDAx/price-data');
  });

  it('says there is no price rather than inventing one when the feed is down', async () => {
    getJsonMock.mockRejectedValue(new Error('503 Service Unavailable'));
    expect(await underlyingQuoteUsd('NVDA')).toBeNull();
  });

  it('says the same for a ticker the issuer does not list', async () => {
    // The endpoint answers 404, which `getJson` raises.
    getJsonMock.mockRejectedValue(new Error('404 Not Found'));
    expect(await underlyingQuoteUsd('ZZZZ')).toBeNull();
  });

  it('rejects a body whose quote is not a usable number', async () => {
    for (const quote of [undefined, null, 0, -5, NaN, '215.36']) {
      getJsonMock.mockResolvedValue({ quote });
      expect(await underlyingQuoteUsd('NVDA')).toBeNull();
    }
  });

  it('never reaches the network for a symbol it cannot name', async () => {
    expect(await underlyingQuoteUsd('NVDA USD')).toBeNull();
    expect(getJsonMock).not.toHaveBeenCalled();
  });
});
