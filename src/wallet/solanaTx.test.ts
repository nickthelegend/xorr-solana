/**
 * What the owner is asked to sign for a withdrawal, built against a real mint's program as the chain reports it.
 *
 * The connection is a small in-memory stand-in for three RPC reads — which program owns the mint, and whether the
 * destination's token account exists — so the instruction list can be checked without a validator. The chain suite
 * signs and settles the same transaction for real (`tools/prove-solana-deposit-withdraw.ts`).
 */
import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey, type Connection } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { buildSplTransfer, unsignedBytes, prepareForSigning } from './solanaTx';

const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const NVDAX = new PublicKey('Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh');

function chain(opts: { program: PublicKey; destExists: boolean; mint: PublicKey; destination: PublicKey }) {
  const destAta = getAssociatedTokenAddressSync(opts.mint, opts.destination, true, opts.program);
  return {
    async getAccountInfo(key: PublicKey) {
      if (key.equals(opts.mint)) return { owner: opts.program };
      if (key.equals(destAta)) return opts.destExists ? { owner: opts.program } : null;
      return null;
    },
    async getLatestBlockhash() {
      return { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 };
    },
  } as unknown as Connection;
}

describe('buildSplTransfer', () => {
  const owner = Keypair.generate().publicKey;
  const destination = Keypair.generate().publicKey;

  it('USDC to an existing account: one transferChecked under the classic token program', async () => {
    const tx = await buildSplTransfer({
      conn: chain({ program: TOKEN_PROGRAM_ID, destExists: true, mint: USDC, destination }),
      owner,
      mint: USDC,
      destination,
      amountRaw: 50_000_000n,
      decimals: 6,
    });
    expect(tx.instructions).toHaveLength(1);
    expect(tx.instructions[0]!.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    // The owner is the transfer's authority — the person signs, never the executor.
    expect(tx.instructions[0]!.keys.some((k) => k.pubkey.equals(owner) && k.isSigner)).toBe(true);
  });

  it('a Token-2022 xStock to a new account: creates it, then transfers under Token-2022', async () => {
    const tx = await buildSplTransfer({
      conn: chain({ program: TOKEN_2022_PROGRAM_ID, destExists: false, mint: NVDAX, destination }),
      owner,
      mint: NVDAX,
      destination,
      amountRaw: 1_00000000n,
      decimals: 8,
    });
    expect(tx.instructions.map((i) => i.programId.toBase58())).toEqual([
      ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
      TOKEN_2022_PROGRAM_ID.toBase58(),
    ]);
  });

  it('is prepared with the owner as fee payer and serialises unsigned for the wallet', async () => {
    const conn = chain({ program: TOKEN_PROGRAM_ID, destExists: true, mint: USDC, destination });
    const tx = await buildSplTransfer({ conn, owner, mint: USDC, destination, amountRaw: 1n, decimals: 6 });
    await prepareForSigning(conn, tx, owner);
    expect(tx.feePayer?.equals(owner)).toBe(true);
    expect(unsignedBytes(tx).length).toBeGreaterThan(100);
  });
});
