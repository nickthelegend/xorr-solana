/**
 * The bot's permission on Solana, as the chain and the grant record agree on it (2026-09-19).
 *
 * The permission is an SPL delegation on the owner's USDC token account: `delegate` = this executor's delegate key,
 * `delegatedAmount` = what the chain lets it move, ever, until the owner revokes. The chain enforces that ceiling and
 * nothing else — SPL has no notion of a day or an expiry — so the daily cap and the end date the owner chose are held in
 * the grant record, written only after the chain has been read to confirm the grant happened, and enforced by the
 * executor on every spend. Revoking is the owner's own SPL `Revoke`; the record follows the chain, never the reverse.
 *
 * Every read here is of the chain first: a record with no live delegation behind it is not a permission.
 */
import { randomUUID } from 'node:crypto';
import { Connection, PublicKey } from '@solana/web3.js';
import { one, query } from '../db/index.js';
import { THIS_CHAIN } from '../db/chain-scope.js';
import { spentToday } from '../rules/engine.js';
import { connection as defaultConnection } from './connection.js';
import { DEFAULT_MINTS } from './clusters.js';
import { delegateKeypair } from './keys.js';
import { mintsOnCluster } from './settleable.js';
import { tradableTokens } from '../venues/tradable-token.js';
import { readDelegation, usdToBaseUnits, baseUnitsToUsd } from './delegation.js';

/** Where the grant lets the bot trade. Jupiter is the only venue this build routes through. */
export const SOLANA_VENUES = ['jupiter'] as const;

export type SolanaPolicy = {
  owner: string;
  ownerAta: string;
  delegate: string;
  /** Whether the delegate on the chain is this executor's key — a grant to any other key is inert. */
  delegateIsCurrent: boolean;
  /** What the chain still lets the delegate move, in USD (USDC is 1:1). */
  allowanceUsd: number;
  dailyCapUsd: number;
  expiresAt: number;
  grantedAt: number | null;
  revoked: boolean;
  spentTodayUsd: number;
  /** What may still be spent today: never more than the chain allows, the cap leaves, or zero once expired. */
  remainingTodayUsd: number;
};

type GrantRow = {
  id: string;
  daily_cap_usd: string;
  expires_at: Date;
  granted_at: Date | null;
  revoked: boolean;
};

/** The newest grant this wallet recorded on this chain, for the executor's delegate. */
async function latestGrant(walletId: string, delegate: string): Promise<GrantRow | undefined> {
  return one<GrantRow>(
    `SELECT id, daily_cap_usd, expires_at, granted_at, revoked FROM delegations
      WHERE wallet_id = $1 AND chain = ${THIS_CHAIN} AND delegate_pubkey = $2
      ORDER BY created_at DESC LIMIT 1`,
    [walletId, delegate],
  );
}

/**
 * The permission in force, or null when there is none: no delegate on the chain, a delegate that is not ours, nothing
 * left delegated, or no grant record to say what cap the owner chose. Throws when the chain cannot be read — a read that
 * failed is not "no permission".
 */
export async function readSolanaPolicy(
  wallet: { id: string; address: string },
  conn: Connection = defaultConnection,
): Promise<SolanaPolicy | null> {
  const ours = delegateKeypair().publicKey.toBase58();
  const chain = await readDelegation(wallet.address, DEFAULT_MINTS.USDC, conn);
  const record = await latestGrant(wallet.id, ours);
  if (!record) return null;
  const spent = await spentToday(wallet.id);
  const live = chain.delegate === ours && chain.delegatedAmount > 0n;
  const expiresAt = new Date(record.expires_at).getTime();
  const allowanceUsd = live ? baseUnitsToUsd(chain.delegatedAmount) : 0;
  const dailyCapUsd = Number(record.daily_cap_usd);
  // Revoked when the record says so or when the chain no longer names our delegate: the chain is the authority.
  const revoked = record.revoked || !live;
  return {
    owner: wallet.address,
    ownerAta: chain.ownerAta,
    delegate: chain.delegate ?? ours,
    delegateIsCurrent: chain.delegate === ours,
    allowanceUsd,
    dailyCapUsd,
    expiresAt,
    grantedAt: record.granted_at ? new Date(record.granted_at).getTime() : null,
    revoked,
    spentTodayUsd: spent,
    remainingTodayUsd: revoked || expiresAt <= Date.now() ? 0 : Math.max(0, Math.min(allowanceUsd, dailyCapUsd - spent)),
  };
}

export class GrantNotConfirmed extends Error {
  readonly status = 400;
  constructor(detail: string) {
    super(detail);
    this.name = 'GrantNotConfirmed';
  }
}

/** The confirmed transaction behind a signature, and that the owner signed it — or a refusal that says why not. */
async function ownerSigned(conn: Connection, signature: string, owner: string): Promise<{ blockTime: number | null }> {
  const tx = await conn.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!tx) throw new GrantNotConfirmed('That transaction is not on the chain (yet). Try again in a moment.');
  if (tx.meta?.err) throw new GrantNotConfirmed('That transaction failed on the chain, so it changed nothing.');
  const signers = tx.transaction.message.staticAccountKeys.slice(0, tx.transaction.message.header.numRequiredSignatures);
  if (!signers.some((k) => k.toBase58() === owner)) {
    throw new GrantNotConfirmed('That transaction was not signed by this wallet.');
  }
  return { blockTime: tx.blockTime ?? null };
}

/**
 * Record a grant the owner signed, after reading the chain: the transaction confirmed without error, the owner signed
 * it, and the owner's USDC account now names our delegate for at least the daily cap.
 */
export async function recordSolanaGrant(
  wallet: { id: string; address: string },
  input: { signature: string; dailyCapUsd: number; expiresAt: number },
  conn: Connection = defaultConnection,
): Promise<SolanaPolicy> {
  if (!(input.dailyCapUsd > 0)) throw new GrantNotConfirmed('A daily cap above zero is needed.');
  if (!(input.expiresAt > Date.now())) throw new GrantNotConfirmed('The end date has to be in the future.');
  const { blockTime } = await ownerSigned(conn, input.signature, wallet.address);
  const ours = delegateKeypair().publicKey.toBase58();
  const chain = await readDelegation(wallet.address, DEFAULT_MINTS.USDC, conn);
  if (chain.delegate !== ours) {
    throw new GrantNotConfirmed('Your USDC account does not name this bot as its delegate, so nothing was granted.');
  }
  if (chain.delegatedAmount < usdToBaseUnits(input.dailyCapUsd)) {
    throw new GrantNotConfirmed('The amount delegated on the chain is below the daily cap you chose.');
  }
  await query(
    `INSERT INTO delegations
       (id, wallet_id, owner_pubkey, delegate_pubkey, daily_cap_usd, expires_at, venue_allowlist, withdrawal_allowlist,
        revoked, grant_signature, granted_at, chain)
     VALUES ($1, $2, $3, $4, $5, $6, $7, '{}', false, $8, $9, ${THIS_CHAIN})`,
    [
      randomUUID(),
      wallet.id,
      wallet.address,
      ours,
      input.dailyCapUsd,
      new Date(input.expiresAt),
      [...SOLANA_VENUES],
      input.signature,
      blockTime ? new Date(blockTime * 1000) : new Date(),
    ],
  );
  const policy = await readSolanaPolicy(wallet, conn);
  if (!policy) throw new GrantNotConfirmed('The grant was recorded but could not be read back.');
  return policy;
}

/** Record a revoke the owner signed, once the chain shows no delegate of ours on the account. */
export async function recordSolanaRevoke(
  wallet: { id: string; address: string },
  signature: string,
  conn: Connection = defaultConnection,
): Promise<void> {
  await ownerSigned(conn, signature, wallet.address);
  const chain = await readDelegation(wallet.address, DEFAULT_MINTS.USDC, conn);
  if (chain.delegate === delegateKeypair().publicKey.toBase58() && chain.delegatedAmount > 0n) {
    throw new GrantNotConfirmed('The chain still shows this bot as your delegate, so nothing was revoked.');
  }
  await query(
    `UPDATE delegations SET revoked = true, revoke_signature = $2
      WHERE wallet_id = $1 AND chain = ${THIS_CHAIN} AND revoked = false`,
    [wallet.id, signature],
  );
}

/**
 * What the app needs to build the grant: whom to delegate to, the token and program it applies to, and the tokens the
 * grant also lets the bot SELL (2026-09-19) — those whose mint is on this cluster. An agent's stop-loss fires with nobody
 * present to sign, so the one grant transaction approves the delegate on each of those accounts too; revoking drops
 * them all.
 *
 * Both classes this executor can buy belong here, not the xStocks alone. A Tessera T-Token left out was still
 * buyable — the spend is USDC, which the cap already approves — and then unsellable forever: the stop-loss, the
 * take-profit and the panic close all pull the held token, and the chain has no delegate on that account to pull it
 * with. The list that decides what may be bought (`tradableTokens`) is therefore the list that decides what may be
 * approved.
 */
export async function solanaGrantParams() {
  const all = tradableTokens();
  const here = await mintsOnCluster(all.map((x) => x.address));
  return {
    chain: 'solana' as const,
    delegate: delegateKeypair().publicKey.toBase58(),
    token: new PublicKey(DEFAULT_MINTS.USDC).toBase58(),
    decimals: 6,
    venues: [...SOLANA_VENUES],
    sellable: all.filter((x) => here.has(x.address)).map((x) => ({ symbol: x.symbol, mint: x.address, decimals: x.decimals })),
  };
}
