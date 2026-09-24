/**
 * "It works with our server down" (README, Stop everything) — pinned (2026-09-24).
 *
 * The stop is the one control that must not depend on xorr: every executor call below fails, and the stop must still
 * revoke every account the chain says names a delegate — the USDC account, an xStock's sell approval, and an agent's
 * own wallet — signed by the owner and nothing else.
 */
import { describe, expect, it, vi } from 'vitest';
import { Keypair, PublicKey, type Transaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';

const down = () => Promise.reject(new TypeError('Failed to fetch'));
vi.mock('@/data/api', () => ({ api: { get: vi.fn(down), post: vi.fn(down) } }));

const owner = Keypair.generate().publicKey;
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const usdcAta = getAssociatedTokenAddressSync(USDC, owner, false, TOKEN_PROGRAM_ID);
const agentWallet = Keypair.generate().publicKey;
const xstockAccount = Keypair.generate().publicKey;
const bot = Keypair.generate().publicKey.toBase58();

const parsed = (delegate?: string) => ({ data: { parsed: { info: delegate ? { delegate } : {} } } });
vi.mock('./solanaTx', () => ({
  solanaConnection: () => ({
    getParsedTokenAccountsByOwner: async (_owner: PublicKey, { programId }: { programId: PublicKey }) => ({
      value: programId.equals(TOKEN_PROGRAM_ID)
        ? [
            { pubkey: usdcAta, account: parsed(bot) },
            { pubkey: agentWallet, account: parsed(bot) },
            { pubkey: Keypair.generate().publicKey, account: parsed() },
          ]
        : [{ pubkey: xstockAccount, account: parsed(bot) }],
    }),
  }),
}));

const { revokeOnSolana } = await import('./solanaGrant');

describe('the stop, with the executor unreachable', () => {
  it('still revokes every delegated account the chain reports, the agent wallet included', async () => {
    let signed: Transaction | undefined;
    const signature = await revokeOnSolana({
      owner: owner.toBase58(),
      signAndSend: async (tx) => {
        signed = tx;
        return 'sig';
      },
    });
    expect(signature).toBe('sig');
    const revoked = signed!.instructions.map((ix) => ({ account: ix.keys[0]!.pubkey.toBase58(), program: ix.programId }));
    expect(revoked).toEqual([
      { account: usdcAta.toBase58(), program: TOKEN_PROGRAM_ID },
      { account: agentWallet.toBase58(), program: TOKEN_PROGRAM_ID },
      { account: xstockAccount.toBase58(), program: TOKEN_2022_PROGRAM_ID },
    ]);
    // The owner authorises each revoke; no key of xorr's is asked for.
    expect(signed!.instructions.every((ix) => ix.keys[1]!.pubkey.equals(owner) && ix.keys[1]!.isSigner)).toBe(true);
  });
});
