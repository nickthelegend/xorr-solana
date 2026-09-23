import { describe, expect, it } from 'vitest';
import { listedTicker, parseRss, pickBriefing, relativeTime, relevant, type Headline } from './feed.js';

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Solana staking yield ticks up]]></title><link>https://x/1</link><pubDate>Sat, 05 Sep 2026 12:00:00 GMT</pubDate></item>
<item><title>Fed holds, signals one more cut</title><link>https://x/2</link><pubDate>Sat, 05 Sep 2026 10:00:00 GMT</pubDate></item>
<item><title>Bitcoin &amp; friends rally</title><link>https://x/3</link></item>
</channel></rss>`;

describe('12.24 news ingestion [G34]', () => {
  it('parses titles, links and dates out of real RSS shapes', () => {
    const items = parseRss(RSS, 'MACRO');
    expect(items).toHaveLength(3);
    expect(items[0]!.title).toBe('Solana staking yield ticks up'); // CDATA unwrapped
    expect(items[0]!.link).toBe('https://x/1');
    expect(items[2]!.title).toBe('Bitcoin & friends rally'); // entity decoded
    expect(items[0]!.at).toBeGreaterThan(0);
  });

  it('filters to the user’s book — screen 23 promises exactly that', () => {
    const items = parseRss(RSS, 'MACRO');
    const forSol = relevant(items, ['SOL']);
    expect(forSol.map((h) => h.symbol)).toEqual(['SOL']);
    expect(forSol[0]!.title).toContain('Solana');

    const forBtc = relevant(items, ['BTC']);
    expect(forBtc[0]!.title).toContain('Bitcoin');

    // A headline about nothing you hold is not your briefing.
    expect(relevant(items, ['DOGE'])).toHaveLength(0);
  });

  it('matches on the asset name as well as the ticker', () => {
    const items: Headline[] = [
      { tag: 'MACRO', title: 'Ethereum upgrade lands', at: Date.now(), link: '' },
    ];
    expect(relevant(items, ['ETH'])).toHaveLength(1);
  });

  it('formats relative times the way screen 23 shows them', () => {
    const now = Date.parse('2026-09-05T12:00:00Z');
    expect(relativeTime(now - 18 * 60_000, now)).toBe('18m');
    expect(relativeTime(now - 2 * 3600_000, now)).toBe('2h');
    expect(relativeTime(now - 50 * 3600_000, now)).toBe('2d');
  });

  it('asks a stock feed for the share an xStock tracks, and nothing else', () => {
    expect(listedTicker('NVDAx')).toBe('NVDA');
    expect(listedTicker('GOOGLx')).toBe('GOOGL');
    expect(listedTicker('T-OpenAI')).toBeUndefined();
    expect(listedTicker('BTC')).toBeUndefined();
  });

  it('finds a pre-IPO holding by its company name', () => {
    const items: Headline[] = [{ tag: 'STOCKS', title: 'OpenAI weighs a new funding round', at: 1, link: 'l' }];
    expect(relevant(items, ['T-OpenAI']).map((h) => h.symbol)).toEqual(['T-OpenAI']);
  });

  it('never briefs a book on news about something else (2026-09-23)', () => {
    const general: Headline[] = [{ tag: 'ON-CHAIN', title: 'Bitcoin slips under $86,000', at: 3, link: 'b' }];
    // Holding NVDAx with no NVDAx news: an empty briefing, not the freshest crypto headline.
    expect(pickBriefing(['NVDAx'], [], general)).toEqual([]);
    // Holding nothing: the freshest general news stands in.
    expect(pickBriefing([], [], general).map((h) => h.title)).toEqual(['Bitcoin slips under $86,000']);
  });

  it('gives each holding a headline before any gets a second', () => {
    const about = [
      { tag: 'STOCKS', title: 'n1', at: 5, link: 'n1', symbol: 'NVDAx' },
      { tag: 'STOCKS', title: 'n2', at: 4, link: 'n2', symbol: 'NVDAx' },
      { tag: 'STOCKS', title: 'n3', at: 3, link: 'n3', symbol: 'NVDAx' },
      { tag: 'STOCKS', title: 't1', at: 2, link: 't1', symbol: 'TSLAx' },
    ];
    expect(pickBriefing(['NVDAx', 'TSLAx'], about, []).map((h) => h.title)).toEqual(['n1', 't1', 'n2']);
  });
});
