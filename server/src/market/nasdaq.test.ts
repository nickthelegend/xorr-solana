import { describe, expect, it, vi } from 'vitest';

const quoteMock = vi.fn<(ticker: string) => Promise<number | null>>();
vi.mock('./backed.js', () => ({
  underlyingQuoteUsd: (ticker: string) => quoteMock(ticker),
}));

const { getNasdaqSession, underlyingTicker, evaluateOffHoursGuard, offHoursGuard } = await import(
  './nasdaq.js'
);

describe('nasdaq session and off-hours slippage guard', () => {
  it('underlyingTicker normalizes token symbols', () => {
    expect(underlyingTicker('NVDAx')).toBe('NVDA');
    expect(underlyingTicker('TSLAc')).toBe('TSLA');
    expect(underlyingTicker('AAPL')).toBe('AAPL');
    expect(underlyingTicker('msftx')).toBe('MSFT');
  });

  it('identifies regular market session (e.g. Wednesday 11:00 AM ET)', () => {
    // 2026-10-14 15:00 UTC = 11:00 AM ET (EDT, UTC-4) on a Wednesday
    const wednesdayRegular = new Date('2026-10-14T15:00:00Z');
    const session = getNasdaqSession(wednesdayRegular);

    expect(session.session).toBe('regular');
    expect(session.isExchangeOpen).toBe(true);
    expect(session.phase).toBe('regular');
  });

  it('identifies pre-market extended session (e.g. Wednesday 07:00 AM ET)', () => {
    // 2026-10-14 11:00 UTC = 07:00 AM ET on Wednesday
    const wednesdayPreMarket = new Date('2026-10-14T11:00:00Z');
    const session = getNasdaqSession(wednesdayPreMarket);

    expect(session.session).toBe('extended');
    expect(session.phase).toBe('pre-market');
    expect(session.isExchangeOpen).toBe(true);
  });

  it('identifies weekend closed session (e.g. Saturday 14:00 ET)', () => {
    // 2026-10-17 18:00 UTC = Saturday 14:00 ET
    const saturday = new Date('2026-10-17T18:00:00Z');
    const session = getNasdaqSession(saturday);

    expect(session.session).toBe('closed');
    expect(session.phase).toBe('weekend');
    expect(session.isExchangeOpen).toBe(false);
  });

  describe('evaluateOffHoursGuard', () => {
    it('returns normal 50 bps slippage during regular hours', () => {
      const wednesdayRegular = new Date('2026-10-14T15:00:00Z');
      const verdict = evaluateOffHoursGuard({
        symbol: 'NVDAx',
        onChainPrice: 216.5,
        now: wednesdayRegular,
        referencePrice: 216.5,
      });

      expect(verdict.session).toBe('regular');
      expect(verdict.action).toBe('normal');
      expect(verdict.suggestedSlippageBps).toBe(50);
    });

    it('widens slippage tolerance during closed off-hours if spread is mild', () => {
      const saturday = new Date('2026-10-17T18:00:00Z');
      const verdict = evaluateOffHoursGuard({
        symbol: 'NVDAx',
        onChainPrice: 217.2, // ~0.3% spread from $216.50
        now: saturday,
        referencePrice: 216.5,
      });

      expect(verdict.session).toBe('closed');
      expect(verdict.action).toBe('widen_slippage');
      expect(verdict.suggestedSlippageBps).toBe(120);
    });

    it('triggers HOLD when off-hours spread exceeds 1.5%', () => {
      const saturday = new Date('2026-10-17T18:00:00Z');
      const verdict = evaluateOffHoursGuard({
        symbol: 'NVDAx',
        onChainPrice: 221.0, // > 2.0% spread from $216.50
        now: saturday,
        referencePrice: 216.5,
      });

      expect(verdict.session).toBe('closed');
      expect(verdict.action).toBe('hold');
      expect(verdict.reason).toContain('Holding to protect against off-hours slippage');
    });
  
    /*
     * The reference price is not always there to be had, and that used to be papered over: a table
     * of four hardcoded equity prices sat in nasdaq.ts, so a missing feed looked exactly like a
     * pool that agreed with the market. These two cases are the whole reason for the rewrite.
     */
    it('holds off-hours when there is no reference quote to check the pool against', () => {
      const saturday = new Date('2026-10-17T18:00:00Z');
      const verdict = evaluateOffHoursGuard({
        symbol: 'NVDAx',
        onChainPrice: 217.2,
        now: saturday,
        referencePrice: null,
      });

      expect(verdict.session).toBe('closed');
      expect(verdict.action).toBe('hold');
      expect(verdict.spreadBps).toBeNull();
      expect(verdict.spreadPct).toBeNull();
      expect(verdict.reason).toContain('no reference quote');
    });

    it('trades on during regular hours without a reference quote — the listing itself is open', () => {
      const wednesdayRegular = new Date('2026-10-14T15:00:00Z');
      const verdict = evaluateOffHoursGuard({
        symbol: 'NVDAx',
        onChainPrice: 217.2,
        now: wednesdayRegular,
        referencePrice: null,
      });

      expect(verdict.session).toBe('regular');
      expect(verdict.action).toBe('normal');
      expect(verdict.suggestedSlippageBps).toBe(50);
      expect(verdict.spreadBps).toBeNull();
    });

    it('never reports a spread of zero when nothing was compared', () => {
      const saturday = new Date('2026-10-17T18:00:00Z');
      for (const referencePrice of [null, 0, -1]) {
        const verdict = evaluateOffHoursGuard({
          symbol: 'NVDAx',
          onChainPrice: 217.2,
          now: saturday,
          referencePrice,
        });
        expect(verdict.spreadBps).toBeNull();
        expect(verdict.action).toBe('hold');
      }
    });
  });

  describe('offHoursGuard reads the reference price from the issuer', () => {
    it('measures the spread against the quote the feed returned', async () => {
      quoteMock.mockResolvedValue(216.5);
      const verdict = await offHoursGuard({
        symbol: 'NVDAx',
        onChainPrice: 217.2,
        now: new Date('2026-10-17T18:00:00Z'),
      });

      expect(quoteMock).toHaveBeenCalledWith('NVDA');
      expect(verdict.action).toBe('widen_slippage');
      expect(verdict.spreadBps).toBe(32);
    });

    it('holds when the issuer feed has no quote', async () => {
      quoteMock.mockResolvedValue(null);
      const verdict = await offHoursGuard({
        symbol: 'NVDAx',
        onChainPrice: 217.2,
        now: new Date('2026-10-17T18:00:00Z'),
      });

      expect(verdict.action).toBe('hold');
      expect(verdict.spreadBps).toBeNull();
    });
  });
});

