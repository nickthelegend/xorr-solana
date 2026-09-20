import { describe, it, expect } from 'vitest';
import { priceAccount, decodePriceUpdate, markIsUsable, EQUITY_FEEDS } from './pyth.js';

/**
 * One real `PriceUpdateV2` account body, so the decoder is tested against the layout rather than
 * against itself. Header is 8 (discriminator) + 32 (write authority) + 1 (`VerificationLevel::Full`).
 */
function account(feedId: string, price: bigint, conf: bigint, expo: number, publishTime: number): Buffer {
  const d = Buffer.alloc(134);
  Buffer.from(feedId, 'hex').copy(d, 41);
  let p = 73;
  d.writeBigInt64LE(price, p); p += 8;
  d.writeBigUInt64LE(conf, p); p += 8;
  d.writeInt32LE(expo, p); p += 4;
  d.writeBigInt64LE(BigInt(publishTime), p);
  return d;
}

const NVDA = EQUITY_FEEDS.NVDA!;

describe('pyth equity marks', () => {
  /*
   * The addresses on the right are the ones the live push oracle actually writes, read off mainnet
   * on 2026-09-20. Asserting against them is the only way this test can catch the derivation being
   * seeded under the receiver program — which is the obvious wrong turn, compiles fine, and yields
   * addresses that simply do not exist.
   */
  it('derives the addresses the push oracle really writes', () => {
    expect(priceAccount(NVDA, 0).toBase58()).toBe('2w1Tg1XTZbUib7srfRoStJ4v5JXVsK7roQEGMsMaGZFC');
    expect(priceAccount(NVDA, 1).toBase58()).toBe('5VETJ8h3p4JrESYrzhjTDAWPEjDjfcnduqe9CjxgqBNd');
    expect(priceAccount(EQUITY_FEEDS.TSLA!, 1).toBase58()).toBe('FQB8c4zB8Emrp9W8bmyk6GanCLq4aRytHYPDAnaEpq9z');
  });

  it('covers every xStock in the universe', () => {
    for (const t of ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'MSTR', 'COIN', 'SPY', 'QQQ']) {
      expect(EQUITY_FEEDS[t], t).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('decodes price, confidence and publish time', () => {
    const at = Math.floor(Date.parse('2026-09-19T00:10:00Z') / 1000);
    const got = decodePriceUpdate(account(NVDA, 22252000000n, 4450000n, -8, at), NVDA);
    expect(got?.usd).toBeCloseTo(222.52, 2);
    expect(got?.confBps).toBeCloseTo(2.0, 1);
    expect(got?.publishedAt.toISOString()).toBe('2026-09-19T00:10:00.000Z');
  });

  /*
   * The feed id is located by searching, because the struct's header is one byte wider when the
   * update was only partially verified. Requiring the hit to land where a header would put it is
   * what keeps that search from matching a run of bytes deeper in the account.
   */
  it('refuses an account whose feed id is not where a header would put it', () => {
    const d = account(NVDA, 1n, 1n, -8, 1);
    const moved = Buffer.alloc(134);
    d.copy(moved, 0);
    Buffer.from(NVDA, 'hex').copy(moved, 41, 0, 32);
    moved.fill(0, 41, 73);
    Buffer.from(NVDA, 'hex').copy(moved, 60);
    expect(decodePriceUpdate(moved, NVDA)).toBeNull();
  });

  it('refuses an account for a different feed', () => {
    expect(decodePriceUpdate(account(NVDA, 1n, 1n, -8, 1), EQUITY_FEEDS.TSLA!)).toBeNull();
  });

  it('refuses a non-positive price', () => {
    expect(decodePriceUpdate(account(NVDA, 0n, 1n, -8, 1), NVDA)).toBeNull();
  });
});

describe('markIsUsable', () => {
  const fresh = (at: Date, ageMs: number, confBps = 2) => ({ confBps, publishedAt: new Date(at.getTime() - ageMs) });

  /* A Saturday. The exchange is shut, and Friday's close is exactly the number the guard wants. */
  const weekend = new Date('2026-09-19T18:00:00Z');
  /* A Wednesday, 15:00 UTC — 11:00 ET, mid regular session. */
  const trading = new Date('2026-09-16T15:00:00Z');

  it('accepts the last close while the exchange is shut', () => {
    const mark = { confBps: 2, publishedAt: new Date('2026-09-19T00:10:00Z') };
    expect(markIsUsable(mark, weekend)).toBe(true);
  });

  it('refuses a print from before the last few days — an abandoned shard, not a weekend', () => {
    const mark = { confBps: 2, publishedAt: new Date('2026-08-26T15:54:00Z') };
    expect(markIsUsable(mark, weekend)).toBe(false);
  });

  /*
   * The case that separates "quiet" from "broken". Overnight, a sixteen-hour-old print is the
   * close. During the session it means the publishers stopped, and yesterday's price is not what
   * the share is worth now.
   */
  it('requires a recent print while the session is live', () => {
    const stale = { confBps: 2, publishedAt: new Date('2026-09-16T12:00:00Z') };
    expect(markIsUsable(stale, trading)).toBe(false);
    expect(markIsUsable({ confBps: 2, publishedAt: new Date('2026-09-16T14:55:00Z') }, trading)).toBe(true);
  });

  it('refuses a feed too unsure of itself to measure a decoupling against', () => {
    expect(markIsUsable(fresh(weekend, 1_000, 300), weekend)).toBe(false);
    expect(markIsUsable(fresh(weekend, 1_000, 99), weekend)).toBe(true);
  });

  it('refuses a print from the future', () => {
    expect(markIsUsable({ confBps: 2, publishedAt: new Date(weekend.getTime() + 60_000) }, weekend)).toBe(false);
  });
});
