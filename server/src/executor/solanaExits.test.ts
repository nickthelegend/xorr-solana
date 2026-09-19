import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ one: vi.fn(), query: vi.fn(), tx: vi.fn() }));
const { exitTrigger } = await import('./solanaExits.js');

const armed = { entryPrice: 200, takeProfitPct: 10, stopLossPct: 5 };

describe('when an exit fires', () => {
  it('fires the stop at or below entry × (1 − stop%)', () => {
    expect(exitTrigger(armed, 190)).toEqual({ kind: 'stop', level: 190 });
    expect(exitTrigger(armed, 150)?.kind).toBe('stop');
  });
  it('fires the target at or above entry × (1 + target%)', () => {
    expect(exitTrigger(armed, 220)?.kind).toBe('target');
  });
  it('does nothing in between, or without a price', () => {
    expect(exitTrigger(armed, 205)).toBeNull();
    expect(exitTrigger(armed, 0)).toBeNull();
    expect(exitTrigger({ ...armed, entryPrice: 0 }, 150)).toBeNull();
  });
});
