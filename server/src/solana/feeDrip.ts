/**
 * Test SOL for a new wallet's first fees (2026-09-19) — the Solana twin of `dripGasIfNeeded`.
 *
 * Privy makes the embedded Solana wallet empty, and the first thing the product asks of it is a signature: the grant,
 * an SPL `Approve` whose fee the owner pays. With no SOL that signature can only fail, and every screen after it is
 * unreachable. On a cluster whose money is a copy or test funds, one airdrop fixes it; `airdropSol` refuses on a
 * cluster whose money is real, so this can never touch mainnet.
 */
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { airdropSol } from './faucet.js';
import { connection } from './connection.js';

/** Enough for dozens of transactions at the base fee. */
export const FEE_DRIP_SOL = 0.5;
/** A wallet holding this much already pays its own way. */
const ENOUGH_SOL = 0.05;

export type FeeDrip =
  | { sent: true; amountSol: number; signature: string }
  | { sent: false; reason: string };

export async function dripSolIfNeeded(address: string): Promise<FeeDrip> {
  const owner = new PublicKey(address);
  const held = (await connection.getBalance(owner, 'confirmed')) / LAMPORTS_PER_SOL;
  if (held >= ENOUGH_SOL) return { sent: false, reason: `the wallet already holds ${held.toFixed(4)} SOL` };
  const { signature } = await airdropSol(owner, FEE_DRIP_SOL);
  return { sent: true, amountSol: FEE_DRIP_SOL, signature };
}
