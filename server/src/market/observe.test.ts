import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const priceMock = vi.fn<(symbol: string) => Promise<number | null>>();
const tesseraMock = vi.fn<(symbol: string) => Promise<number | null>>();
const recordMock = vi.fn<(symbol: string, usd: number) => void>();

vi.mock('../venues/xstocks.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../venues/xstocks.js')>()),
  xStockPriceUsd: (s: string) => priceMock(s),
  recordObservation: (s: string, usd: number) => recordMock(s, usd),
}));

vi.mock('../venues/tessera.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../venues/tessera.js')>()),
  tesseraPriceUsd: (s: string) => tesseraMock(s),
}));

const { observeSweep, resetObserveClock, OBSERVE_EVERY_MS } = await import('./observe.js');
const { tradableTokens } = await import('../venues/tradable-token.js');

/** The whole universe the sweep is responsible for: both classes, not just the xStocks. */
const UNIVERSE = tradableTokens().length;
const EQUITIES = tradableTokens().filter((t) => t.kind === 'equity').length;
const PRE_IPO = tradableTokens().filter((t) => t.kind === 'pre-ipo').length;

const T0 = new Date('2026-09-17T12:00:00Z');
const later = (ms: number) => new Date(T0.getTime() + ms);

describe('recording what the tradable tokens cost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetObserveClock();
    priceMock.mockResolvedValue(216.5);
    tesseraMock.mockResolvedValue(978.43);
  });

  afterEach(() => resetObserveClock());

  it('prices every symbol in the universe, both classes', async () => {
    const out = await observeSweep(T0);
    expect(out).toEqual({ asked: UNIVERSE, recorded: UNIVERSE, unpriced: [] });
    expect(priceMock).toHaveBeenCalledTimes(EQUITIES);
    expect(tesseraMock).toHaveBeenCalledTimes(PRE_IPO);
  });

  /*
   * The read is the write for an xStock and is NOT for a T-Token, because `tesseraPriceUsd` is on
   * the hot path of every quote screen and a row per call would be write amplification rather than
   * a series. So the sweep — the thing that decides the record's resolution — records that class.
   */
  it('records a T-Token reading itself, and does not double-record an xStock', async () => {
    await observeSweep(T0);
    expect(recordMock).toHaveBeenCalledTimes(PRE_IPO);
    for (const t of tradableTokens().filter((x) => x.kind === 'pre-ipo')) {
      expect(recordMock).toHaveBeenCalledWith(t.symbol, 978.43);
    }
  });

  it('does not record a T-Token the venue could not price', async () => {
    tesseraMock.mockResolvedValue(null);
    const out = await observeSweep(T0);
    expect(recordMock).not.toHaveBeenCalled();
    expect(out?.recorded).toBe(EQUITIES);
  });

  /*
   * The scheduler ticks every thirty seconds; eleven symbols at that rate is more than thirty
   * thousand quotes a day to build a series whose own window is a month.
   */
  it('does nothing when the last pass was recent', async () => {
    await observeSweep(T0);
    priceMock.mockClear();

    expect(await observeSweep(later(OBSERVE_EVERY_MS - 1))).toBeNull();
    expect(priceMock).not.toHaveBeenCalled();
  });

  it('runs again once the interval has passed', async () => {
    await observeSweep(T0);
    priceMock.mockClear();

    const out = await observeSweep(later(OBSERVE_EVERY_MS));
    expect(out).not.toBeNull();
    expect(priceMock).toHaveBeenCalledTimes(EQUITIES);
  });

  /*
   * A gap in the series is the honest record of a gap in what was knowable — which is exactly why
   * the range logic counts observations rather than assuming a shape.
   */
  it('reports a symbol it could not price rather than inventing a reading', async () => {
    priceMock.mockImplementation(async (s) => (s === 'TSLAx' ? null : 216.5));

    const out = await observeSweep(T0);
    expect(out?.unpriced).toEqual(['TSLAx']);
    expect(out?.recorded).toBe(UNIVERSE - 1);
  });

  it('treats a throw as unpriced rather than ending the sweep', async () => {
    priceMock.mockImplementation(async (s) => {
      if (s === 'NVDAx') throw new Error('venue down');
      return 216.5;
    });

    const out = await observeSweep(T0);
    expect(out?.unpriced).toContain('NVDAx');
    // Every other symbol still got asked: one venue failure is not the whole sweep's.
    expect(priceMock).toHaveBeenCalledTimes(EQUITIES);
    expect(tesseraMock).toHaveBeenCalledTimes(PRE_IPO);
  });

  it('does not count a zero or negative price as a reading', async () => {
    priceMock.mockResolvedValue(0);
    tesseraMock.mockResolvedValue(0);
    const out = await observeSweep(T0);
    expect(out?.recorded).toBe(0);
    expect(out?.unpriced).toHaveLength(UNIVERSE);
    expect(recordMock).not.toHaveBeenCalled();
  });
});
