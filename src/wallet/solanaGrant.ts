/**
 * The bot's permission on Solana, as the owner signs it (2026-09-19).
 *
 * Granting is one transaction the owner's own wallet signs: create their USDC token account if it does not exist yet,
 * then an SPL `ApproveChecked` naming the executor's delegate key for the whole allowance — the daily cap for every day
 * the grant runs. That allowance is the ceiling the chain itself enforces; the daily cap and the end date are held and
 * enforced by the executor, which records them only after reading the chain (`server/src/solana/grant.ts`).
 *
 * Stopping is the owner's SPL `Revoke` on the same account: the chain drops the delegate, and from that block the bot
 * can move nothing, whatever the executor thinks.
 */
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createApproveCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createRevokeInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { parseUnits } from 'viem';
import { api } from '@/data/api';
import { solanaConnection } from './solanaTx';

const DAY_MS = 86_400_000;

/** What `/delegation/params` answers on a Solana executor. */
export type SolanaGrantParams = {
  chain: 'solana';
  delegate: string;
  token: string;
  decimals: number;
  venues: string[];
  /** The xStocks on this cluster the grant also lets the bot sell (Token-2022). Absent on an older executor. */
  sellable?: { symbol: string; mint: string; decimals: number }[];
};

/**
 * The most an SPL approval can name. A sell approval is not a spending allowance: it lets the bot sell whatever of that
 * xStock the owner comes to hold (an agent's stop-loss on shares it bought an hour ago), and the executor only ever
 * moves it into a sale that pays the owner. Revoke drops it with the rest.
 */
const ANY_AMOUNT = 2n ** 64n - 1n;

/** The allowance a grant delegates: the daily cap for each day it runs, in the token's base units. */
export function grantAllowance(dailyCapUsd: number, durationMs: number, decimals: number): bigint {
  const days = Math.max(1, Math.ceil(durationMs / DAY_MS));
  return parseUnits(dailyCapUsd.toFixed(decimals), decimals) * BigInt(days);
}

/** The grant transaction, unsigned. USDC is a classic SPL token, so the classic token program owns its account. */
export function buildGrantTx(params: {
  owner: PublicKey;
  grant: SolanaGrantParams;
  dailyCapUsd: number;
  durationMs: number;
}): Transaction {
  const mint = new PublicKey(params.grant.token);
  const delegate = new PublicKey(params.grant.delegate);
  const ata = getAssociatedTokenAddressSync(mint, params.owner, false, TOKEN_PROGRAM_ID);
  return new Transaction().add(
    // Idempotent: a no-op for an account that already exists, so a first grant and a re-grant are the same transaction.
    createAssociatedTokenAccountIdempotentInstruction(params.owner, ata, params.owner, mint, TOKEN_PROGRAM_ID),
    createApproveCheckedInstruction(
      ata,
      mint,
      delegate,
      params.owner,
      grantAllowance(params.dailyCapUsd, params.durationMs, params.grant.decimals),
      params.grant.decimals,
      [],
      TOKEN_PROGRAM_ID,
    ),
    // Selling: one approval per xStock this cluster holds, on the owner's Token-2022 account (created if absent).
    ...(params.grant.sellable ?? []).flatMap((x) => {
      const xMint = new PublicKey(x.mint);
      const xAta = getAssociatedTokenAddressSync(xMint, params.owner, false, TOKEN_2022_PROGRAM_ID);
      return [
        createAssociatedTokenAccountIdempotentInstruction(params.owner, xAta, params.owner, xMint, TOKEN_2022_PROGRAM_ID),
        createApproveCheckedInstruction(xAta, xMint, delegate, params.owner, ANY_AMOUNT, x.decimals, [], TOKEN_2022_PROGRAM_ID),
      ];
    }),
  );
}

/** A token account of the owner's that names a delegate, and the program that owns it. */
export type DelegatedAccount = { account: PublicKey; programId: PublicKey };

/**
 * The kill switch, unsigned: the owner revokes the delegate on their USDC account and on every other account that
 * names one (the xStock sell approvals). The USDC revoke is always included, so the stop works even when the chain
 * read of the other accounts comes back empty.
 */
export function buildRevokeTx(params: { owner: PublicKey; token: string; delegated?: DelegatedAccount[] }): Transaction {
  const ata = getAssociatedTokenAddressSync(new PublicKey(params.token), params.owner, false, TOKEN_PROGRAM_ID);
  const others = (params.delegated ?? []).filter((d) => !d.account.equals(ata));
  return new Transaction().add(
    createRevokeInstruction(ata, params.owner, [], TOKEN_PROGRAM_ID),
    ...others.map((d) => createRevokeInstruction(d.account, params.owner, [], d.programId)),
  );
}

/** Every token account of `owner`, under both token programs, that names a delegate — read from the chain. */
export async function delegatedAccounts(conn: Connection, owner: PublicKey): Promise<DelegatedAccount[]> {
  const out: DelegatedAccount[] = [];
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const res = await conn.getParsedTokenAccountsByOwner(owner, { programId }, 'confirmed');
    for (const { pubkey, account } of res.value) {
      const info = (account.data as { parsed?: { info?: { delegate?: string } } }).parsed?.info;
      if (info?.delegate) out.push({ account: pubkey, programId });
    }
  }
  return out;
}

/**
 * Grant, sign, and have the executor record it. `signAndSend` is the owner's wallet (`useSolanaSigner`), which
 * returns only a signature the chain confirmed; the executor then reads the chain before recording anything.
 */
export async function grantOnSolana(params: {
  owner: string;
  dailyCapUsd: number;
  durationMs: number;
  signAndSend: (tx: Transaction) => Promise<string>;
}): Promise<string> {
  const grant = await api.get<SolanaGrantParams>('/delegation/params');
  if (grant.chain !== 'solana') throw new Error('The executor is not on Solana, so this build cannot grant on it.');
  const expiresAt = Date.now() + params.durationMs;
  const signature = await params.signAndSend(
    buildGrantTx({ owner: new PublicKey(params.owner), grant, dailyCapUsd: params.dailyCapUsd, durationMs: params.durationMs }),
  );
  await api.post('/delegation/record', { signature, dailyCapUsd: params.dailyCapUsd, expiresAt });
  return signature;
}

/**
 * Revoke, sign, and tell the executor. The token comes from the executor when it answers and from the chain's own
 * USDC mint otherwise, so the stop can be pressed with the executor down; its record is best-effort — the chain has
 * already refused the bot either way.
 */
export async function revokeOnSolana(params: {
  owner: string;
  signAndSend: (tx: Transaction) => Promise<string>;
}): Promise<string> {
  const token = await api
    .get<SolanaGrantParams>('/delegation/params')
    .then((p) => p.token, () => USDC_MINT);
  const owner = new PublicKey(params.owner);
  // Read from the chain, not the executor, so the stop drops every approval even with the executor down.
  const delegated = await delegatedAccounts(solanaConnection(), owner).catch(() => []);
  const signature = await params.signAndSend(buildRevokeTx({ owner, token, delegated }));
  await api.post('/delegation/revoke', { signature }).catch(() => undefined);
  return signature;
}

/** Mainnet USDC — the mint the fork clones, so the same on every cluster this build runs on. */
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
