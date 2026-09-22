/**
 * What the grant approves has to be what the executor is willing to buy.
 *
 * `solanaGrantParams` listed `XSTOCKS` alone, and once Tessera's T-Tokens became buyable that left a
 * one-way door on the chain: the buy spends USDC, which the cap already approves, so it went
 * through — and every exit pulls the held token from the owner's account, which named no delegate.
 * An agent could open a pre-IPO position and then had no way out of it. Neither the stop-loss, nor
 * the take-profit, nor the panic close could sign for it, and nothing refused the buy that created it.
 *
 * So the invariant is not "the xStocks are approved" but "everything `tradableTokens` admits is
 * approved". These cases pin that, and pin the cluster filter that is allowed to drop a mint.
 */
import { describe, expect, it, vi } from 'vitest';

process.env.XORR_CHAIN ??= 'solana-fork';

const onCluster = vi.fn(async (addresses: readonly string[]) => new Set(addresses));

vi.mock('../db/index.js', () => ({ query: vi.fn(), one: vi.fn(), tx: vi.fn(), pool: {} }));
vi.mock('./settleable.js', () => ({ mintsOnCluster: (a: readonly string[]) => onCluster(a) }));
vi.mock('./keys.js', () => ({
  delegateKeypair: () => ({ publicKey: { toBase58: () => 'ACikuhfPnynwUs9yYzGmNybAdRK2AtfMLLovWzdkcSEL' } }),
}));

const { solanaGrantParams } = await import('./grant.js');
const { tradableTokens } = await import('../venues/tradable-token.js');

describe('the grant approves every class the executor can buy', () => {
  it('covers each tradable mint, both classes', async () => {
    const params = await solanaGrantParams();
    const approved = new Set(params.sellable.map((s) => s.mint));
    for (const token of tradableTokens()) {
      expect(approved.has(token.address), `${token.symbol} (${token.kind}) is buyable but not approved`).toBe(true);
    }
  });

  it('includes the pre-IPO tokens by name', async () => {
    const params = await solanaGrantParams();
    const symbols = params.sellable.map((s) => s.symbol);
    const preIpo = tradableTokens().filter((t) => t.kind === 'pre-ipo');
    expect(preIpo.length).toBeGreaterThan(0);
    for (const t of preIpo) expect(symbols).toContain(t.symbol);
  });

  it('carries the mint\u2019s own decimals, so ApproveChecked matches it', async () => {
    const params = await solanaGrantParams();
    const decimals = new Map(tradableTokens().map((t) => [t.address, t.decimals]));
    for (const s of params.sellable) expect(s.decimals).toBe(decimals.get(s.mint));
  });

  it('drops a mint this cluster does not carry, and nothing else', async () => {
    const absent = tradableTokens()[0]!;
    onCluster.mockImplementationOnce(
      async (addresses) => new Set([...addresses].filter((a) => a !== absent.address)),
    );
    const params = await solanaGrantParams();
    expect(params.sellable.map((s) => s.mint)).not.toContain(absent.address);
    expect(params.sellable).toHaveLength(tradableTokens().length - 1);
  });
});
