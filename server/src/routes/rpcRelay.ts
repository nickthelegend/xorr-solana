/**
 * A JSON-RPC relay for the app's own chain calls (2026-09-25).
 *
 * On mainnet the app has nowhere to send them. Solana's public endpoint refuses a request from a web page (measured:
 * 403/415 whenever an Origin header is present), a public node that allows browsers refuses the indexed read the kill
 * switch depends on (`getTokenAccountsByOwner`: "requires a personal token"), and the paid RPC's key cannot ship in an
 * app bundle, where anyone could lift it. So the app sends its reads and its signed transactions here, and this
 * forwards them to the executor's own RPC (`SOLANA_RPC_URL`) with the key kept on the server.
 *
 * It is not an open proxy: only the methods the app calls pass, a body is capped, and each caller gets a small budget.
 * Nothing here signs or alters anything — a transaction arrives signed by its owner and is forwarded as it came.
 * The app falls back to a public node when this cannot answer (`src/wallet/solanaTx.ts`), so the stop still works
 * with the executor down.
 */
import { Hono } from 'hono';
import { rpcUrl } from '../solana/clusters.js';

export const rpcRelay = new Hono();

/** What the app's own `Connection` and Privy's signing preview actually call. Anything else is refused. */
export const RELAYED_METHODS = new Set([
  'getAccountInfo',
  'getBalance',
  'getBlockHeight',
  'getEpochInfo',
  'getFeeForMessage',
  'getGenesisHash',
  'getHealth',
  'getLatestBlockhash',
  'getMinimumBalanceForRentExemption',
  'getMultipleAccounts',
  'getRecentPrioritizationFees',
  'getSignatureStatuses',
  'getSlot',
  'getTokenAccountBalance',
  'getTokenAccountsByOwner',
  'getTransaction',
  'getVersion',
  'isBlockhashValid',
  'sendTransaction',
  'simulateTransaction',
]);

const MAX_BODY_BYTES = 64 * 1024;
const MAX_BATCH = 20;
const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 60;
const hits = new Map<string, { count: number; resetAt: number }>();

type RpcCall = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown };

/** Which calls in a body are refused, as a JSON-RPC error each; null when every call may pass. */
export function refusedCalls(body: unknown): { id: unknown; error: { code: number; message: string } }[] | null {
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > MAX_BATCH) {
    return [{ id: null, error: { code: -32600, message: `A batch holds 1 to ${MAX_BATCH} calls.` } }];
  }
  const refused = (calls as RpcCall[])
    .filter((c) => !c || typeof c.method !== 'string' || !RELAYED_METHODS.has(c.method))
    .map((c) => ({
      id: c?.id ?? null,
      error: { code: -32601, message: `${String(c?.method)} is not relayed; this relay carries only the app's own calls.` },
    }));
  return refused.length ? refused : null;
}

rpcRelay.post('/rpc', async (c) => {
  const who = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'local';
  const now = Date.now();
  const row = hits.get(who);
  if (!row || now > row.resetAt) hits.set(who, { count: 1, resetAt: now + WINDOW_MS });
  else if (++row.count > MAX_PER_WINDOW) {
    c.header('retry-after', String(Math.ceil((row.resetAt - now) / 1000)));
    return c.json({ jsonrpc: '2.0', id: null, error: { code: 429, message: 'Too many requests; try again shortly.' } }, 429);
  }

  const raw = await c.req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return c.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large.' } }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error.' } }, 400);
  }
  const refused = refusedCalls(body);
  if (refused) {
    const out = refused.map((r) => ({ jsonrpc: '2.0', ...r }));
    return c.json(Array.isArray(body) ? out : out[0], 400);
  }

  try {
    const upstream = await fetch(rpcUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw,
      signal: AbortSignal.timeout(25_000),
    });
    const text = await upstream.text();
    return c.body(text, upstream.status as 200, { 'content-type': 'application/json' });
  } catch (e) {
    return c.json(
      { jsonrpc: '2.0', id: null, error: { code: -32000, message: `The chain did not answer (${e instanceof Error ? e.message : String(e)}).` } },
      502,
    );
  }
});
