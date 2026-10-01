/**
 * GET /wallet/funded-by — the wallet that first put money into this one (2026-09-26).
 *
 * The Return funds screen sends everything back where it came from, so it has to know where that was. The chain says:
 * the owner's oldest transactions are read, oldest first, until one moved SOL or USDC INTO the owner's wallet from
 * another wallet that signed it. That wallet is the answer. Nothing here moves anything — it is a read, and the app
 * still asks the person to add the address to their allowlist and tap Send themselves.
 *
 * "Another wallet that signed it" is deliberate: a balance that went down in a transaction nobody from outside signed
 * (a swap pool's vault, a program's PDA) is not a wallet anyone could be paid back at. A USDC sender is the OWNER of the
 * token account that went down, never the token account itself — sending USDC to a token account's address would
 * open a second token account for an address no one holds the key to.
 *
 * Answers `{ address, signature, asset, amount, at }`, or `{ address: null }` when nothing in the history qualifies.
 */
import { Hono } from 'hono';
import { PublicKey, type Connection, type ParsedTransactionWithMeta } from '@solana/web3.js';
import { readChain } from '../http/chain-read.js';
import { requireWallet } from './wallet-context.js';
import { ON_SOLANA, DEFAULT_MINTS } from '../solana/clusters.js';
import { connection } from '../solana/connection.js';

export type FundedBy =
  | { address: string; signature: string; asset: 'SOL' | 'USDC'; amount: number; at: number | null }
  | { address: null };

/** How far back the history is paged. One RPC page is 1000, so a wallet with more is read to its 1000th-newest. */
export const SIGNATURE_CAP = 1000;
/** How many of the oldest transactions are opened before giving up. Each is one `getParsedTransaction`. */
export const PARSED_CAP = 10;

type Conn = Pick<Connection, 'getSignaturesForAddress' | 'getParsedTransaction'>;

/** The owner's signatures, oldest first, paged back until the history ends or the cap is reached. */
async function oldestFirst(conn: Conn, owner: string): Promise<{ signature: string; blockTime?: number | null }[]> {
  const key = new PublicKey(owner);
  const all: { signature: string; blockTime?: number | null; err: unknown }[] = [];
  let before: string | undefined;
  while (all.length < SIGNATURE_CAP) {
    const limit = Math.min(1000, SIGNATURE_CAP - all.length);
    const page = await conn.getSignaturesForAddress(key, { limit, before }, 'confirmed');
    all.push(...page);
    if (page.length < limit) break;
    before = page[page.length - 1]!.signature;
  }
  // Newest first from the RPC; a failed transaction moved nothing.
  return all.filter((s) => !s.err).reverse();
}

function raw(amount: string | undefined): bigint {
  try {
    return BigInt(amount ?? '0');
  } catch {
    return 0n;
  }
}

/** One transaction, read for money arriving at `owner` from a signing wallet. */
export function fundingIn(
  tx: ParsedTransactionWithMeta,
  owner: string,
  usdcMint: string,
): { address: string; asset: 'SOL' | 'USDC'; amount: number } | null {
  const meta = tx.meta;
  if (!meta || meta.err) return null;
  const keys = tx.transaction.message.accountKeys;
  const signers = new Set(keys.filter((k) => k.signer).map((k) => k.pubkey.toBase58()));

  // USDC: the owner's USDC token account went up, and a signer's went down.
  const pre = meta.preTokenBalances ?? [];
  const post = meta.postTokenBalances ?? [];
  const usdcIndexes = new Set([...pre, ...post].filter((b) => b.mint === usdcMint).map((b) => b.accountIndex));
  let received = 0n;
  let decimals = 6;
  let sender: { owner: string; drop: bigint } | undefined;
  for (const i of usdcIndexes) {
    const before = pre.find((b) => b.accountIndex === i);
    const after = post.find((b) => b.accountIndex === i);
    const holder = after?.owner ?? before?.owner;
    const delta = raw(after?.uiTokenAmount.amount) - raw(before?.uiTokenAmount.amount);
    decimals = after?.uiTokenAmount.decimals ?? before?.uiTokenAmount.decimals ?? decimals;
    if (holder === owner) {
      if (delta > 0n) received += delta;
    } else if (holder && delta < 0n && signers.has(holder) && (!sender || -delta > sender.drop)) {
      sender = { owner: holder, drop: -delta };
    }
  }
  if (received > 0n && sender) {
    return { address: sender.owner, asset: 'USDC', amount: Number(received) / 10 ** decimals };
  }

  // SOL: the owner's lamports went up, and a signing account other than the owner paid them.
  const me = keys.findIndex((k) => k.pubkey.toBase58() === owner);
  if (me < 0) return null;
  const gained = (meta.postBalances[me] ?? 0) - (meta.preBalances[me] ?? 0);
  if (!(gained > 0)) return null;
  let payer: { address: string; drop: number } | undefined;
  keys.forEach((k, i) => {
    if (i === me || !k.signer) return;
    const drop = (meta.preBalances[i] ?? 0) - (meta.postBalances[i] ?? 0);
    const address = k.pubkey.toBase58();
    if (drop > 0 && address !== owner && (!payer || drop > payer.drop)) payer = { address, drop };
  });
  return payer ? { address: payer.address, asset: 'SOL', amount: gained / 1e9 } : null;
}

/** The oldest transaction that funded `owner` from another wallet, read from the chain. */
export async function findFundedBy(conn: Conn, owner: string, usdcMint: string = DEFAULT_MINTS.USDC): Promise<FundedBy> {
  const sigs = await oldestFirst(conn, owner);
  for (const s of sigs.slice(0, PARSED_CAP)) {
    const tx = await conn.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
    if (!tx) continue;
    const found = fundingIn(tx, owner, usdcMint);
    if (found) {
      const t = tx.blockTime ?? s.blockTime ?? null;
      return { ...found, signature: s.signature, at: t === null ? null : t * 1000 };
    }
  }
  return { address: null };
}

/*
 * A found answer never changes — the first funding transaction is history — so it is kept for the life of the process.
 * "Nothing found" can change the moment money arrives, so it is kept for a minute: long enough that a screen re-read on
 * focus does not page a thousand signatures again, short enough that a first deposit shows up.
 */
const NOTHING_TTL_MS = 60_000;
const cache = new Map<string, { value: FundedBy; at: number }>();

export const fundedByRoutes = new Hono();

fundedByRoutes.get('/wallet/funded-by', async (c) => {
  if (!ON_SOLANA) return c.json({ error: 'solana_only', detail: 'Only the Solana build reads where a wallet was funded from.' }, 404);
  const w = await requireWallet(c);
  const hit = cache.get(w.address);
  if (hit && (hit.value.address !== null || Date.now() - hit.at < NOTHING_TTL_MS)) return c.json(hit.value);
  const value = await readChain('the wallet that funded this one', () => findFundedBy(connection, w.address));
  if (cache.size > 5_000) cache.clear();
  cache.set(w.address, { value, at: Date.now() });
  return c.json(value);
});
