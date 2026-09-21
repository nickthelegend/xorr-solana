/**
 * Building, preparing and broadcasting the Solana transactions the PERSON signs (2026-09-19).
 *
 * The signature itself comes from the user's Privy Solana wallet (`useSolanaSigner`); nothing here holds or sees a key.
 * What is here is everything around it: the connection to the cluster this build settles on, a fresh blockhash and the
 * owner as fee payer, the broadcast of the signed bytes, and confirmation — so a signature the chain never accepted is
 * never reported as one it did.
 *
 * This replaced `solanaWallet.ts`'s locally generated keypair, which stored the raw secret key in `localStorage` on the
 * web and was not the wallet the executor knew about at all.
 */
import { Connection, PublicKey, Transaction, type TransactionInstruction } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

/** The RPC of the cluster this build settles on — the same variable the rest of the app reads for its chain. */
export function solanaRpcUrl(): string {
  return process.env.EXPO_PUBLIC_CHAIN_RPC ?? process.env.EXPO_PUBLIC_SOLANA_RPC ?? 'http://127.0.0.1:8899';
}

/**
 * The cluster's websocket endpoint: the RPC's host on ws/wss, one port up where the RPC names a port — the
 * convention `solana-test-validator` and a local fork follow (8899 → 8900).
 */
export function solanaWsUrl(rpc: string = solanaRpcUrl()): string {
  const u = new URL(rpc);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  if (u.port) u.port = String(Number(u.port) + 1);
  return u.toString().replace(/\/$/, '');
}

export function solanaConnection(): Connection {
  return new Connection(solanaRpcUrl(), 'confirmed');
}

export type Prepared = { blockhash: string; lastValidBlockHeight: number };

/** A fresh blockhash and the owner as fee payer: the owner pays for what the owner signs. */
export async function prepareForSigning(conn: Connection, tx: Transaction, owner: PublicKey): Promise<Prepared> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;
  return { blockhash, lastValidBlockHeight };
}

/** The unsigned transaction as bytes, for a wallet that signs bytes. */
export function unsignedBytes(tx: Transaction): Uint8Array {
  return new Uint8Array(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
}

/**
 * Broadcast signed bytes and wait for the cluster to confirm them. Throws with the chain's own error when the
 * transaction failed — a signature is returned only for a transaction the ledger holds without an error.
 */
export async function broadcastSigned(conn: Connection, signed: Uint8Array, prepared: Prepared): Promise<string> {
  const signature = await conn.sendRawTransaction(signed, { skipPreflight: false, preflightCommitment: 'confirmed' });
  const result = await conn.confirmTransaction({ signature, ...prepared }, 'confirmed');
  if (result.value.err) throw new Error(`The transaction failed on chain: ${JSON.stringify(result.value.err)}`);
  return signature;
}


/**
 * Whether a send failed because the blockhash it carried had aged out.
 *
 * A blockhash lives about 150 slots — on this cluster, measured, roughly fifty-five seconds. The
 * app has to fetch one BEFORE the wallet's confirmation sheet opens, because the signature covers
 * it, so the clock runs while the person reads what they are about to approve. On the permission
 * screen that is exactly what we ask them to do: six paragraphs about what the bot may and may not
 * touch. Reading them carefully is enough to lose the grant, and the failure arrives as
 * "Transaction simulation failed: Blockhash not found", which tells them nothing.
 *
 * The cure is to notice this one error and go round again with a fresh blockhash, which costs a
 * second signature and saves the flow.
 */
export function isStaleBlockhash(err: unknown): boolean {
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /blockhash not found|block ?height exceeded|BlockhashNotFound|TransactionExpired/i.test(text);
}

/** The token program that owns a mint: classic SPL for USDC, Token-2022 for xStocks. Read from the chain. */
export async function tokenProgramOf(conn: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await conn.getAccountInfo(mint, 'confirmed');
  if (!info) throw new Error(`No mint at ${mint.toBase58()} on this cluster.`);
  return info.owner;
}

/**
 * An SPL transfer from the owner's token account to the destination's, creating the destination's account (paid by
 * the owner) when it does not exist yet. `transferChecked`, so the mint and decimals are part of what is signed.
 */
export async function buildSplTransfer(params: {
  conn: Connection;
  owner: PublicKey;
  mint: PublicKey;
  destination: PublicKey;
  amountRaw: bigint;
  decimals: number;
}): Promise<Transaction> {
  const { conn, owner, mint, destination, amountRaw, decimals } = params;
  const program = await tokenProgramOf(conn, mint);
  const source = getAssociatedTokenAddressSync(mint, owner, false, program);
  const dest = getAssociatedTokenAddressSync(mint, destination, true, program);
  const ixs: TransactionInstruction[] = [];
  if (!(await conn.getAccountInfo(dest, 'confirmed'))) {
    ixs.push(createAssociatedTokenAccountInstruction(owner, dest, destination, mint, program));
  }
  ixs.push(createTransferCheckedInstruction(source, mint, dest, owner, amountRaw, decimals, [], program));
  return new Transaction().add(...ixs);
}

export { TOKEN_2022_PROGRAM_ID };
