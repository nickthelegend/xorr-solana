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
import { Connection, PublicKey, Transaction, VersionedTransaction, type TransactionInstruction } from '@solana/web3.js';
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
 * Where chain calls go when the primary RPC cannot answer (2026-09-25).
 *
 * On mainnet the primary is the executor's relay (`server/src/routes/rpcRelay.ts`), which keeps the paid RPC's key on the
 * server. If the executor is down, the app must still be able to read, sign and send — above all the stop — so it falls
 * back to a public node that serves browsers. That node refuses indexed reads; `revokeOnSolana` covers that case.
 */
export function solanaFallbackRpcUrl(): string | undefined {
  return process.env.EXPO_PUBLIC_CHAIN_RPC_FALLBACK || undefined;
}

/**
 * The cluster's websocket endpoint: named outright when the build says (a relay has no websocket; a public node does),
 * else the RPC's host on ws/wss, one port up where the RPC names a port — the convention `solana-test-validator` and a
 * local fork follow (8899 → 8900).
 */
export function solanaWsUrl(rpc: string = solanaRpcUrl()): string {
  if (process.env.EXPO_PUBLIC_CHAIN_WS) return process.env.EXPO_PUBLIC_CHAIN_WS;
  const u = new URL(rpc);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  if (u.port) u.port = String(Number(u.port) + 1);
  return u.toString().replace(/\/$/, '');
}

/** The primary RPC, and the fallback when it is unreachable, rate-limited or failing. */
export async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const fallback = solanaFallbackRpcUrl();
  try {
    const res = await fetch(input, init);
    if (fallback && (res.status >= 500 || res.status === 429)) throw new Error(`RPC answered ${res.status}`);
    return res;
  } catch (e) {
    if (!fallback || String(input) === fallback) throw e;
    return fetch(fallback, init);
  }
}

export function solanaConnection(): Connection {
  return new Connection(solanaRpcUrl(), { commitment: 'confirmed', wsEndpoint: solanaWsUrl(), fetch: resilientFetch });
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


/** The blockhash inside signed bytes, or null when they cannot be read as a transaction. */
export function blockhashOf(signed: Uint8Array): string | null {
  try {
    return Transaction.from(signed).recentBlockhash ?? null;
  } catch {
    try {
      return VersionedTransaction.deserialize(signed).message.recentBlockhash ?? null;
    } catch {
      return null;
    }
  }
}

/**
 * Broadcast signed bytes and wait for the cluster to confirm them. Throws with the chain's own error when the
 * transaction failed — a signature is returned only for a transaction the ledger holds without an error.
 */
/**
 * Whatever the wallet handed back, as bytes.
 *
 * The declared type is `Uint8Array`, and that is not always what arrives: a wallet SDK may return
 * base64, an array of numbers, or an `ArrayBuffer`. `sendRawTransaction` accepts none of those
 * quietly — it mangles them into a body the cluster cannot parse, which comes back as an error
 * about the transaction rather than about its encoding, and that sent this debugging in entirely
 * the wrong direction for an afternoon.
 *
 * Normalising here is one function and removes the whole class.
 */
export function asBytes(signed: unknown): Uint8Array {
  if (signed instanceof Uint8Array) return signed;
  if (signed instanceof ArrayBuffer) return new Uint8Array(signed);
  if (Array.isArray(signed)) return Uint8Array.from(signed as number[]);
  if (typeof signed === 'string') {
    const binary = atob(signed);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  }
  if (signed && typeof signed === 'object') {
    /* Some SDKs wrap the bytes in a record keyed by index, which spreads into an object. */
    const values = Object.values(signed as Record<string, unknown>);
    if (values.length > 0 && values.every((v) => typeof v === 'number')) return Uint8Array.from(values as number[]);
  }
  throw new Error('The wallet returned a signed transaction in a form this app cannot broadcast.');
}

export async function broadcastSigned(conn: Connection, signedRaw: Uint8Array, prepared: Prepared): Promise<string> {
  const signed = asBytes(signedRaw);
  /*
   * The wallet must hand back the transaction we gave it (2026-09-22).
   *
   * A wallet that re-stamps the blockhash returns something we never prepared, and the cluster then
   * rejects it as "Blockhash not found" — an error that reads like ours and is not. That failure
   * cost an afternoon on the hosted build, because the wallet's own sheet says "Transaction
   * signed!" either way and the only symptom is a grant that never lands.
   *
   * Comparing costs one deserialize and turns an hour of guessing into a sentence.
   */
  const carried = blockhashOf(signed);
  /*
   * Unparseable bytes are their own failure, and a loud one.
   *
   * The guard below was silently skipped whenever `blockhashOf` returned null, so a wallet handing
   * back something that is not a transaction looked exactly like a wallet handing back a correct
   * one — right up until the cluster refused it for reasons of its own.
   */
  if (carried === null) {
    throw new Error(
      'The wallet returned bytes that are not a readable Solana transaction, so there is nothing to broadcast.',
    );
  }
  if (carried !== prepared.blockhash) {
    throw new Error(
      `The wallet returned a transaction stamped with a different blockhash than the one it was given ` +
        `(${carried.slice(0, 8)}… instead of ${prepared.blockhash.slice(0, 8)}…), so this cluster will not accept it.`,
    );
  }
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
/**
 * How many signatures one action may cost before it gives up.
 *
 * Each attempt is another wallet sheet, so this is a small number; the point is that a person who
 * loses the first blockhash to reading the screen is not then required to be quick, which is what
 * a single retry asked of them. The second sheet is fast because they have already read it.
 */
export const SIGN_ATTEMPTS = 3;

/**
 * Run `attempt`, and run it again with a fresh blockhash for as long as the cluster refuses the
 * signature for having aged out.
 *
 * `worthRetrying` is the caller's, because only it knows what must never be signed twice: a
 * transaction the executor prepared and co-signed cannot be re-stamped without voiding its
 * signature, and a cancel is the person's answer rather than a fault.
 */
export async function untilFresh<T>(
  attempt: () => Promise<T>,
  worthRetrying: (e: unknown) => boolean,
  attempts: number = SIGN_ATTEMPTS,
): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await attempt();
    } catch (e) {
      if (n >= attempts || !worthRetrying(e)) throw e;
    }
  }
}

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
