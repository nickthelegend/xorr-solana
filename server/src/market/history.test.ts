import { describe, it, expect, vi, beforeEach } from 'vitest';

const getJsonMock = vi.fn();
const queryMock = vi.fn();

vi.mock('../http/get.js', () => ({ getJson: (...a: unknown[]) => getJsonMock(...a) }));
vi.mock('../db/index.js', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock('../http/request-id.js', () => ({ log: { info: () => {}, error: () => {} } }));

const { deepestUsdcPool, poolCloses } = await import('./history.js');

const pools = (rows: { name: string; liq: string; id: string }[]) => ({
  data: rows.map((r) => ({ id: `solana_${r.id}`, attributes: { name: r.name, reserve_in_usd: r.liq } })),
});

beforeEach(() => {
  getJsonMock.mockReset();
  queryMock.mockReset();
  queryMock.mockResolvedValue([]);
});

describe('deepestUsdcPool', () => {
  it('takes the deepest pool, because a thin pool close is one trade opinion', async () => {
    getJsonMock.mockResolvedValue(
      pools([
        { name: 'NVDAx / USDC', liq: '134731.20', id: 'thin' },
        { name: 'NVDAx / USDC', liq: '2147864.19', id: 'deep' },
      ]),
    );
    expect(await deepestUsdcPool('NVDAx', 'Xsc9')).toBe('deep');
  });

  /*
   * The pool that would have seeded a band around $0.0000955. `SI / NVDAx` contains both "NVDAx"
   * and — in other rows like it — "USDC", but it quotes NVDAx as the QUOTE asset, so its price is
   * the inverse. Requiring the name to START with the symbol is what rejects it.
   */
  it('rejects a pool that quotes the xStock in the wrong direction', async () => {
    getJsonMock.mockResolvedValue(pools([{ name: 'SI / NVDAx USDC', liq: '29789.79', id: 'inverted' }]));
    expect(await deepestUsdcPool('NVDAx', 'Xsc9')).toBeNull();
  });

  it('rejects a pool quoted in something other than USDC', async () => {
    getJsonMock.mockResolvedValue(pools([{ name: 'NVDAx / SOL', liq: '999999', id: 'sol' }]));
    expect(await deepestUsdcPool('NVDAx', 'Xsc9')).toBeNull();
  });

  it('returns null rather than throwing when the index is unreachable', async () => {
    getJsonMock.mockRejectedValue(new Error('429'));
    expect(await deepestUsdcPool('NVDAx', 'Xsc9')).toBeNull();
  });
});

describe('poolCloses', () => {
  const bars = (list: number[][]) => ({ data: { attributes: { ohlcv_list: list } } });

  it('reads the close, and returns bars oldest first', async () => {
    getJsonMock.mockResolvedValue(
      bars([
        [1789876800, 222.0, 223.0, 221.0, 222.5],
        [1789790400, 223.4, 223.6, 223.3, 223.43],
      ]),
    );
    const got = await poolCloses('deep');
    expect(got.map((b) => b.usd)).toEqual([223.43, 222.5]);
    expect(got[0]!.at.toISOString()).toBe('2026-09-19T04:00:00.000Z');
  });

  /*
   * A gap stays a gap. Nothing here interpolates across a missing hour or carries a price forward,
   * because a band computed over invented rows is exactly the failure the range logic exists to
   * avoid — it would read as evidence and be arithmetic.
   */
  it('drops unusable bars instead of repairing them', async () => {
    getJsonMock.mockResolvedValue(
      bars([
        [1789790400, 1, 1, 1, 0],
        [1789794000, 1, 1, 1, -5],
        [0, 1, 1, 1, 10],
        [1789797600, 1, 1, 1, 222.5],
      ]),
    );
    const got = await poolCloses('deep');
    expect(got).toHaveLength(1);
    expect(got[0]!.usd).toBe(222.5);
  });

  it('returns nothing rather than guessing when the pool is unknown', async () => {
    getJsonMock.mockRejectedValue(new Error('404'));
    expect(await poolCloses('nope')).toEqual([]);
  });
});
