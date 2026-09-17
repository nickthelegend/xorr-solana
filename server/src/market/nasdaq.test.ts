import { describe, expect, it } from 'vitest';
import {
  getNasdaqSession,
  underlyingTicker,
  evaluateOffHoursGuard,
} from './nasdaq.js';

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
        oraclePrice: 216.5,
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
        oraclePrice: 216.5,
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
        oraclePrice: 216.5,
      });

      expect(verdict.session).toBe('closed');
      expect(verdict.action).toBe('hold');
      expect(verdict.reason).toContain('Holding to protect against off-hours slippage');
    });
  });
});
