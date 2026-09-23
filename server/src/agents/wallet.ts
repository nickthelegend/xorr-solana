/**
 * An agent's own wallet (2026-09-23).
 *
 * Every agent can hold its own money: a USDC token account at its own address, OWNED BY THE OWNER — derived from the
 * owner's key and the agent's id with `createWithSeed`, so it needs no extra signer and nobody but the owner can close
 * it or move its funds except as the owner approves. The owner funds it in one signature (create, transfer in, approve
 * the bot's delegate), and from then on that agent spends from it alone: the chain caps the agent at what the account
 * holds, the agent's sales pay back into it, and its balance is its record. Revoking in Safety drops its approval with
 * every other, and withdrawing moves the USDC back to the owner's main account.
 *
 * Custody does not change. The bot still holds only a delegate key; the account is the owner's.
 */
import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAccount, TokenAccountNotFoundError, TokenInvalidAccountOwnerError } from '@solana/spl-token';
import { connection as defaultConnection } from '../solana/connection.js';
import { DEFAULT_MINTS } from '../solana/clusters.js';
import { delegateKeypair } from '../solana/keys.js';

/** At most 32 characters, as `createWithSeed` requires: a prefix and the first 24 hex digits of the agent's id. */
export function agentSeed(agentId: string): string {
  return `xorr-${agentId.replace(/-/g, '').slice(0, 24)}`;
}

/** The address of an agent's wallet: the owner's key, the agent's seed, owned by the token program. */
export async function agentWalletAddress(owner: string, agentId: string): Promise<PublicKey> {
  return PublicKey.createWithSeed(new PublicKey(owner), agentSeed(agentId), TOKEN_PROGRAM_ID);
}

export type AgentWallet = {
  address: string;
  /** Whether the account exists on this chain at all. */
  exists: boolean;
  /** USDC in it, as a holder sees it. */
  usdc: number;
  /** Raw base units, for the spend path. */
  amount: bigint;
  /** Whether the bot's current delegate is approved on it — false after a revoke, until it is funded or resumed. */
  approved: boolean;
};

/** An agent's wallet, read from the chain. An account that is not there is an empty, unapproved wallet. */
export async function readAgentWallet(owner: string, agentId: string, conn = defaultConnection): Promise<AgentWallet> {
  const address = await agentWalletAddress(owner, agentId);
  try {
    const acc = await getAccount(conn, address, 'confirmed', TOKEN_PROGRAM_ID);
    // An account at this address that is not the owner's USDC is not this agent's wallet, whatever it holds.
    if (!acc.owner.equals(new PublicKey(owner)) || acc.mint.toBase58() !== DEFAULT_MINTS.USDC) {
      return { address: address.toBase58(), exists: false, usdc: 0, amount: 0n, approved: false };
    }
    const approved = !!acc.delegate && acc.delegate.equals(delegateKeypair().publicKey) && acc.delegatedAmount > 0n;
    return { address: address.toBase58(), exists: true, usdc: Number(acc.amount) / 1e6, amount: acc.amount, approved };
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError || e instanceof TokenInvalidAccountOwnerError) {
      return { address: address.toBase58(), exists: false, usdc: 0, amount: 0n, approved: false };
    }
    throw e;
  }
}
