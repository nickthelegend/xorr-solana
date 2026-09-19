import { describe, expect, it, vi } from 'vitest';

vi.mock('@/chain', () => ({ isSolana: true }));
const { hiddenOn, shownHere, solanaRedirect } = await import('./solanaRoutes');

describe('the Solana build hides the Base-only screens', () => {
  it('hides a Base route and everything under it, and only on Solana', () => {
    expect(hiddenOn('/perp/BTC', true)).toBe(true);
    expect(hiddenOn('/yield', true)).toBe(true);
    expect(hiddenOn('/approvals?x=1', true)).toBe(true);
    expect(hiddenOn('/perp/BTC', false)).toBe(false);
  });

  it('keeps the Solana screens', () => {
    for (const p of ['/', '/xstocks', '/xstock/NVDAx', '/safety', '/deposit', '/send', '/activity', '/agent/momentum-scout', '/strategies']) {
      expect(hiddenOn(p, true)).toBe(false);
    }
  });

  it('sends the Base doors to their Solana counterparts', () => {
    expect(solanaRedirect('/swap')).toBe('/xstocks');
    expect(solanaRedirect('/oracle/NVDAx')).toBe('/xstock/NVDAx');
    expect(solanaRedirect('/asset/TSLAx')).toBe('/xstock/TSLAx');
    expect(solanaRedirect('/asset/SOL')).toBeNull();
    expect(solanaRedirect('/futures')).toBe('/not-here?from=%2Ffutures');
    expect(solanaRedirect('/xstocks')).toBeNull();
  });

  it('sends Markets and Search to the xStocks market, and draws no link to either', () => {
    expect(solanaRedirect('/markets')).toBe('/xstocks');
    expect(solanaRedirect('/search?q=nv')).toBe('/xstocks');
    expect(shownHere('/markets')).toBe(false);
    expect(shownHere('/search')).toBe(false);
    expect(shownHere('/xstocks')).toBe(true);
  });

  it('hides the perp movers', () => {
    expect(solanaRedirect('/movers')).toBe('/not-here?from=%2Fmovers');
  });
});
