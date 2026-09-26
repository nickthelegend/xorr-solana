/**
 * GET /wallet/funded-by (2026-09-26), with the connection and the wallet stood in for.
 *
 * The answer is the OLDEST transaction that moved SOL or USDC into the owner's wallet from another wallet that signed
 * it: for USDC the owner of the token account that went down, for SOL the signing account whose lamports went down.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { Keypair, type ParsedTransactionWithMeta } from '@solana/web3.js';

const h = vi.hoisted(() => ({
  conn: { getSignaturesForAddress: vi.fn(), getParsedTransaction: vi.fn() },
  NoWalletError: class extends Error {
    readonly status = 409;
  },
  WrongPrincipalError: class extends Error {},
}));

vi.mock('./wallet-context.js', () => ({ requireWallet: vi.fn(), NoWalletError: h.NoWalletError }));
vi.mock('../auth/middleware.js', () => ({ requireUser: vi.fn(), WrongPrincipalError: h.WrongPrincipalError }));
vi.mock('../solana/connection.js', () => ({ connection: h.conn }));
vi.mock('../solana/clusters.js', () => ({
  ON_SOLANA: true,
  DEFAULT_MINTS: { USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
}));

const { requireWallet } = await import('./wallet-context.js');
const { errorResponse } = await import('../http/errors.js');
const { fundedByRoutes, findFundedBy, fundingIn, PARSED_CAP } = await import('./funded-by.js');

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const OWNER = Keypair.generate().publicKey;
const FUNDER = Keypair.generate().publicKey;
const OTHER = Keypair.generate().publicKey;
const POOL = Keypair.generate().publicKey;

const app = new Hono();
app.route('/', fundedByRoutes);
app.onError(errorResponse);

type Key = { pubkey: typeof OWNER; signer: boolean; writable: boolean };
const key = (pubkey: typeof OWNER, signer = false): Key => ({ pubkey, signer, writable: true });
const tb = (accountIndex: number, owner: string, amount: string) => ({
  accountIndex,
  mint: USDC,
  owner,
  uiTokenAmount: { amount, decimals: 6, uiAmount: Number(amount) / 1e6, uiAmountString: '' },
});

function tx(parts: {
  keys: Key[];
  pre: number[];
  post: number[];
  preTok?: ReturnType<typeof tb>[];
  postTok?: ReturnType<typeof tb>[];
  blockTime?: number;
  err?: unknown;
}): ParsedTransactionWithMeta {
  return {
    slot: 1,
    blockTime: parts.blockTime ?? 1_790_000_000,
    transaction: { signatures: ['x'], message: { accountKeys: parts.keys, instructions: [], recentBlockhash: '' } },
    meta: {
      err: parts.err ?? null,
      fee: 5000,
      preBalances: parts.pre,
      postBalances: parts.post,
      preTokenBalances: parts.preTok ?? [],
      postTokenBalances: parts.postTok ?? [],
    },
  } as unknown as ParsedTransactionWithMeta;
}

/** A SOL transfer FUNDER → OWNER, FUNDER paying the fee. */
const solIn = (lamports: number) =>
  tx({ keys: [key(FUNDER, true), key(OWNER)], pre: [5e9, 0], post: [5e9 - lamports - 5000, lamports] });

/** A USDC transfer FUNDER → OWNER: token accounts at 1 (OWNER's) and 2 (FUNDER's). */
const usdcIn = (raw: string) =>
  tx({
    keys: [key(FUNDER, true), key(Keypair.generate().publicKey), key(Keypair.generate().publicKey)],
    pre: [5e9, 0, 2e6],
    post: [5e9 - 5000, 0, 2e6],
    preTok: [tb(2, FUNDER.toBase58(), '9000000')],
    postTok: [tb(1, OWNER.toBase58(), raw), tb(2, FUNDER.toBase58(), String(9_000_000 - Number(raw)))],
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireWallet).mockResolvedValue({ id: 'w1', address: OWNER.toBase58() } as never);
});

describe('fundingIn', () => {
  it('names the signing wallet a SOL transfer came from', () => {
    expect(fundingIn(solIn(20_000_000), OWNER.toBase58(), USDC)).toEqual({
      address: FUNDER.toBase58(),
      asset: 'SOL',
      amount: 0.02,
    });
  });

  it('names the OWNER of the USDC token account that went down, not the token account', () => {
    expect(fundingIn(usdcIn('5000000'), OWNER.toBase58(), USDC)).toEqual({
      address: FUNDER.toBase58(),
      asset: 'USDC',
      amount: 5,
    });
  });

  it('does not name an account that did not sign — a pool vault is not a wallet to pay back', () => {
    const swap = tx({
      keys: [key(OWNER, true), key(POOL)],
      pre: [1e9, 5e9],
      post: [1e9 + 1e8 - 5000, 5e9 - 1e8],
    });
    expect(fundingIn(swap, OWNER.toBase58(), USDC)).toBeNull();
  });

  it('never names the owner, and ignores money leaving', () => {
    const out = tx({ keys: [key(OWNER, true), key(OTHER)], pre: [1e9, 0], post: [9e8 - 5000, 1e8] });
    expect(fundingIn(out, OWNER.toBase58(), USDC)).toBeNull();
  });

  it('ignores a failed transaction', () => {
    const failed = tx({ keys: [key(FUNDER, true), key(OWNER)], pre: [5e9, 0], post: [5e9 - 5000, 1e8], err: { x: 1 } });
    expect(fundingIn(failed, OWNER.toBase58(), USDC)).toBeNull();
  });
});

describe('findFundedBy', () => {
  it('pages back to the oldest and answers the first that funded the wallet', async () => {
    // Newest first, as the RPC answers. The oldest is a failed one, then an outgoing one, then the funding.
    h.conn.getSignaturesForAddress.mockResolvedValueOnce([
      { signature: 'newest', err: null, blockTime: 30 },
      { signature: 'funding', err: null, blockTime: 20 },
      { signature: 'outgoing', err: null, blockTime: 15 },
      { signature: 'failed', err: { x: 1 }, blockTime: 10 },
    ]);
    const byId: Record<string, ParsedTransactionWithMeta> = {
      outgoing: tx({ keys: [key(OWNER, true), key(OTHER)], pre: [1e9, 0], post: [9e8 - 5000, 1e8] }),
      funding: tx({ ...{ keys: [key(FUNDER, true), key(OWNER)], pre: [5e9, 0], post: [4.9e9 - 5000, 1e8] }, blockTime: 1_790_000_000 }),
      newest: solIn(1),
    };
    h.conn.getParsedTransaction.mockImplementation(async (sig: string) => byId[sig] ?? null);

    const out = await findFundedBy(h.conn as never, OWNER.toBase58(), USDC);
    expect(out).toEqual({ address: FUNDER.toBase58(), signature: 'funding', asset: 'SOL', amount: 0.1, at: 1_790_000_000_000 });
    // The failed one was never opened; the newest was never reached.
    expect(h.conn.getParsedTransaction.mock.calls.map((c) => c[0])).toEqual(['outgoing', 'funding']);
  });

  it('follows `before` while pages come back full', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ signature: `s${i}`, err: null }));
    h.conn.getSignaturesForAddress.mockResolvedValueOnce(full);
    h.conn.getParsedTransaction.mockResolvedValue(null);
    await findFundedBy(h.conn as never, OWNER.toBase58(), USDC);
    // One page of 1000 is the cap; a second page is not asked for.
    expect(h.conn.getSignaturesForAddress).toHaveBeenCalledTimes(1);
    expect(h.conn.getParsedTransaction).toHaveBeenCalledTimes(PARSED_CAP);
    // Oldest first.
    expect(h.conn.getParsedTransaction.mock.calls[0]![0]).toBe('s999');
  });

  it('answers null when nothing in the history qualifies', async () => {
    h.conn.getSignaturesForAddress.mockResolvedValueOnce([]);
    expect(await findFundedBy(h.conn as never, OWNER.toBase58(), USDC)).toEqual({ address: null });
  });
});

describe('GET /wallet/funded-by', () => {
  it('answers the signed-in wallet’s funder', async () => {
    h.conn.getSignaturesForAddress.mockResolvedValueOnce([{ signature: 'u1', err: null, blockTime: 5 }]);
    h.conn.getParsedTransaction.mockResolvedValueOnce(usdcIn('1500000'));
    const res = await app.request('/wallet/funded-by');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ address: FUNDER.toBase58(), signature: 'u1', asset: 'USDC', amount: 1.5 });
  });

  it('is a 502, never a null, when the chain cannot be read', async () => {
    vi.mocked(requireWallet).mockResolvedValue({ id: 'w2', address: OTHER.toBase58() } as never);
    h.conn.getSignaturesForAddress.mockRejectedValueOnce(new Error('rpc down'));
    const res = await app.request('/wallet/funded-by');
    expect(res.status).toBe(502);
  });
});
