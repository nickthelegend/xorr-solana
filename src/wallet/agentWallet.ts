/**
 * An agent's own wallet, as the app builds its transactions (2026-09-23). What the wallet is: `server/src/agents/wallet.ts`.
 *
 * A USDC token account the owner owns, at an address derived from the owner's key and the agent's id — so creating it
 * needs no key but the owner's. Funding is one transaction the owner signs: create the account the first time,
 * move USDC into it, and approve the bot's delegate on it. The bot can then spend what it holds and nothing more.
 * Withdrawing is the owner moving it back. The address MUST match the executor's derivation (pinned by both tests).
 */
import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import {
  ACCOUNT_SIZE,
  TOKEN_PROGRAM_ID,
  createApproveCheckedInstruction,
  createInitializeAccount3Instruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

const USDC_DECIMALS = 6;
/** Approve up to the account's whole balance, whatever it becomes: the account's contents are the agent's budget. */
const ANY_AMOUNT = 2n ** 64n - 1n;

export function agentSeed(agentId: string): string {
  return `xorr-${agentId.replace(/-/g, '').slice(0, 24)}`;
}

export function agentWalletAddress(owner: PublicKey, agentId: string): Promise<PublicKey> {
  return PublicKey.createWithSeed(owner, agentSeed(agentId), TOKEN_PROGRAM_ID);
}

/** Whole cents to USDC base units, never through a float that rounds 0.1 + 0.2. */
export function usdcUnits(usd: number): bigint {
  return BigInt(Math.round(usd * 100)) * 10n ** BigInt(USDC_DECIMALS - 2);
}

/** Create (the first time), fund and approve the agent's wallet — one transaction, signed by the owner. */
export async function buildFundAgentTx(p: {
  conn: Connection;
  owner: PublicKey;
  agentId: string;
  usd: number;
  mint: PublicKey;
  delegate: PublicKey;
}): Promise<Transaction> {
  const seed = agentSeed(p.agentId);
  const account = await agentWalletAddress(p.owner, p.agentId);
  const tx = new Transaction();
  if (!(await p.conn.getAccountInfo(account, 'confirmed'))) {
    const lamports = await p.conn.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);
    tx.add(
      SystemProgram.createAccountWithSeed({
        fromPubkey: p.owner,
        basePubkey: p.owner,
        seed,
        newAccountPubkey: account,
        lamports,
        space: ACCOUNT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeAccount3Instruction(account, p.mint, p.owner, TOKEN_PROGRAM_ID),
    );
  }
  const main = getAssociatedTokenAddressSync(p.mint, p.owner, false, TOKEN_PROGRAM_ID);
  if (p.usd > 0) {
    tx.add(createTransferCheckedInstruction(main, p.mint, account, p.owner, usdcUnits(p.usd), USDC_DECIMALS, [], TOKEN_PROGRAM_ID));
  }
  tx.add(createApproveCheckedInstruction(account, p.mint, p.delegate, p.owner, ANY_AMOUNT, USDC_DECIMALS, [], TOKEN_PROGRAM_ID));
  return tx;
}

/** Move USDC from the agent's wallet back to the owner's main account. Only the owner can sign it. */
export async function buildWithdrawAgentTx(p: { owner: PublicKey; agentId: string; usd: number; mint: PublicKey }): Promise<Transaction> {
  const account = await agentWalletAddress(p.owner, p.agentId);
  const main = getAssociatedTokenAddressSync(p.mint, p.owner, false, TOKEN_PROGRAM_ID);
  return new Transaction().add(
    createTransferCheckedInstruction(account, p.mint, main, p.owner, usdcUnits(p.usd), USDC_DECIMALS, [], TOKEN_PROGRAM_ID),
  );
}
