import { beforeEach, describe, expect, it, vi } from 'vitest';

let genesis = 'G2';
let stored: string | null = null;
const writes: string[] = [];
const appended: { walletId: string; detail: string }[] = [];

vi.mock('../solana/clusters.js', () => ({ CLUSTER_KEY: 'solana-fork' }));
vi.mock('../db/chain-scope.js', () => ({ THIS_CHAIN: "'solana-fork'" }));
vi.mock('../solana/connection.js', () => ({ connection: { getGenesisHash: async () => genesis } }));
vi.mock('../db/index.js', () => ({
  one: vi.fn(async () => (stored ? { value: stored } : null)),
  query: vi.fn(async (text: string) => { writes.push(text); return []; }),
  tx: vi.fn(async (fn: (c: unknown) => unknown) =>
    fn({
      query: async (text: string) => {
        writes.push(text);
        return /SELECT wallet_id/.test(text) ? { rows: [{ wallet_id: 'w1', symbols: ['NVDAx', 'SPYx'] }] } : { rows: [] };
      },
    }),
  ),
}));
vi.mock('../audit/log.js', () => ({ append: vi.fn(async (row: { walletId: string; detail: string }) => void appended.push(row)) }));

const { reconcileForkReset } = await import('./solanaReset.js');

describe('a Solana fork rebuilt under the executor', () => {
  beforeEach(() => {
    writes.splice(0, writes.length);
    appended.splice(0, appended.length);
  });

  it('only records the genesis the first time, and touches no book', async () => {
    stored = null;
    expect(await reconcileForkReset()).toBe(0);
    expect(writes.some((w) => /UPDATE positions/.test(w))).toBe(false);
    expect(writes.some((w) => /INSERT INTO app_config/.test(w))).toBe(true);
  });

  it('does nothing while the genesis is the one it saw', async () => {
    stored = 'G2';
    genesis = 'G2';
    expect(await reconcileForkReset()).toBe(0);
    expect(writes).toEqual([]);
  });

  it('takes the old ledger out of the book when the genesis changes, and says so', async () => {
    stored = 'G1';
    genesis = 'G2';
    expect(await reconcileForkReset()).toBe(1);
    expect(writes.some((w) => /UPDATE positions SET units = 0/.test(w))).toBe(true);
    expect(writes.some((w) => /UPDATE position_sleeves SET units = 0/.test(w))).toBe(true);
    expect(writes.some((w) => /kind = 'exit-rules'/.test(w))).toBe(true);
    expect(appended[0]).toMatchObject({ walletId: 'w1' });
    expect(appended[0]!.detail).toContain('NVDAx, SPYx');
  });
});
