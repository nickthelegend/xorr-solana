/**
 * An agent's own wallet, over HTTP (2026-09-23). See `agents/wallet.ts` for what the wallet is.
 *
 * The app builds and signs the funding and withdrawal transactions itself, as it does the grant, so the owner's wallet
 * always signs a fresh blockhash and the executor never holds a transaction the owner has not seen. The executor reads
 * the result from the chain and records it — never a claimed amount, only the balance change the transaction made.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import bs58 from 'bs58';
import { one, query } from '../db/index.js';
import { append } from '../audit/log.js';
import { requireWallet } from '../routes/wallet-context.js';
import { connection } from '../solana/connection.js';
import { explorerTx, explorerAddress } from '../solana/connection.js';
import { delegateKeypair } from '../solana/keys.js';
import { DEFAULT_MINTS, ON_SOLANA } from '../solana/clusters.js';
import { readAgentWallet } from './wallet.js';
import { policyOf } from './policy.js';

export const agentWalletRoutes = new Hono();

type Row = { id: string; name: string; persona_id: string; hired: boolean; wallet_account: string | null; risk_limits: Record<string, unknown> | null };

async function agentOf(walletId: string, id: string): Promise<Row | undefined> {
  // By the row's id, or by the persona a hired row follows — the roster names an agent either way.
  return one<Row>(
    `SELECT id, name, persona_id, hired, wallet_account, risk_limits FROM agents
      WHERE wallet_id = $1 AND (id = $2 OR persona_id = $2) ORDER BY hired DESC LIMIT 1`,
    [walletId, id],
  );
}

function view(row: Row, w: Awaited<ReturnType<typeof readAgentWallet>>) {
  return {
    agentId: row.id,
    name: row.name,
    address: w.address,
    explorer: explorerAddress(w.address),
    exists: w.exists,
    usdc: w.usdc,
    approved: w.approved,
    /** Whether the agent trades from this wallet — it does once it has been funded through xorr. */
    inUse: !!row.wallet_account,
    delegate: delegateKeypair().publicKey.toBase58(),
    mint: DEFAULT_MINTS.USDC,
    policy: policyOf(row.risk_limits),
  };
}

/** GET /agents/wallets — every agent wallet on this account, read from the chain. */
agentWalletRoutes.get('/agents/wallets', async (c) => {
  if (!ON_SOLANA) return c.json([]);
  const w = await requireWallet(c);
  const rows = await query<Row>(
    `SELECT id, name, persona_id, hired, wallet_account, risk_limits FROM agents WHERE wallet_id = $1 AND wallet_account IS NOT NULL`,
    [w.id],
  );
  const out = await Promise.all(rows.map(async (r) => view(r, await readAgentWallet(w.address, r.id))));
  return c.json(out);
});

/** GET /agents/:id/wallet — one agent's wallet: its address, what it holds, and whether the bot may spend it. */
agentWalletRoutes.get('/agents/:id/wallet', async (c) => {
  if (!ON_SOLANA) return c.json({ error: 'not_solana', message: 'Agent wallets are Solana token accounts.' }, 400);
  const w = await requireWallet(c);
  const row = await agentOf(w.id, c.req.param('id'));
  if (!row) return c.json({ error: 'not_hired', message: 'Hire this agent to give it a wallet.' }, 404);
  return c.json(view(row, await readAgentWallet(w.address, row.id)));
});

const RecordInput = z.object({ signature: z.string().min(64).max(100) }).strict();

/**
 * POST /agents/:id/wallet/record — the owner funded or drew down an agent's wallet. Read from the transaction itself:
 * the owner signed it, it succeeded, and the agent's account changed by some amount — which is what is recorded.
 */
agentWalletRoutes.post('/agents/:id/wallet/record', async (c) => {
  if (!ON_SOLANA) return c.json({ error: 'not_solana' }, 400);
  const w = await requireWallet(c);
  const row = await agentOf(w.id, c.req.param('id'));
  if (!row) return c.json({ error: 'not_hired', message: 'Hire this agent to give it a wallet.' }, 404);
  const { signature } = RecordInput.parse(await c.req.json());

  // A signature is 64 bytes in base58; anything else is the caller's to fix, not a fault to report as one.
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature) || bs58.decode(signature).length !== 64) {
    return c.json({ error: 'invalid_signature', message: 'That is not a Solana transaction signature.' }, 400);
  }
  const wallet = await readAgentWallet(w.address, row.id);
  const tx = await connection
    .getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
    .catch(() => null);
  if (!tx || tx.meta?.err) {
    return c.json({ error: 'not_confirmed', message: 'That transaction is not confirmed on this chain, so nothing was recorded.' }, 409);
  }
  const keys = tx.transaction.message.getAccountKeys().staticAccountKeys.map((k) => k.toBase58());
  if (keys[0] !== w.address) {
    return c.json({ error: 'not_yours', message: 'That transaction was not signed by this wallet.' }, 409);
  }
  const index = keys.indexOf(wallet.address);
  if (index < 0) {
    return c.json({ error: 'wrong_account', message: `That transaction does not touch ${row.name}'s wallet.` }, 409);
  }
  const amountAt = (list: { accountIndex: number; uiTokenAmount: { uiAmountString?: string } }[] | null | undefined) =>
    Number(list?.find((b) => b.accountIndex === index)?.uiTokenAmount.uiAmountString ?? '0');
  const delta = amountAt(tx.meta?.postTokenBalances) - amountAt(tx.meta?.preTokenBalances);

  await query(`UPDATE agents SET wallet_account = $2 WHERE id = $1`, [row.id, wallet.address]);
  const funded = delta > 0;
  await append({
    walletId: w.id,
    agent: row.name,
    action: funded ? `Funded ${row.name}'s wallet` : delta < 0 ? `Took money back from ${row.name}'s wallet` : `${row.name}'s wallet approved`,
    detail: funded
      ? `${delta.toFixed(2)} USDC into its own account, ${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}. It trades from this alone, and only you can move it out.`
      : delta < 0
        ? `${(-delta).toFixed(2)} USDC back to your main account. ${wallet.usdc.toFixed(2)} USDC stays with ${row.name}.`
        : `The bot may spend what ${row.name}'s wallet holds, and nothing else.`,
    amount: delta === 0 ? '' : `$${Math.abs(delta).toFixed(2)}`,
    kind: 'risk',
    signature,
    payload: { agentId: row.id, account: wallet.address, delta },
  });
  return c.json({ ...view({ ...row, wallet_account: wallet.address }, wallet), delta, signature, explorerTx: explorerTx(signature) });
});

/**
 * POST /agents/:id/look — ask one hired agent to look now (`bot/autonomous.ts` `lookNow`). It trades only if the sweep
 * would have; otherwise it says why, symbol by symbol. Only the four personas scan; an agent someone made runs its own
 * strategies instead.
 */
agentWalletRoutes.post('/agents/:id/look', async (c) => {
  if (!ON_SOLANA) return c.json({ error: 'not_solana' }, 400);
  const w = await requireWallet(c);
  const row = await agentOf(w.id, c.req.param('id'));
  if (!row || !row.hired) return c.json({ error: 'not_hired', message: 'Hire this agent first.' }, 404);
  if (row.persona_id.startsWith('custom:')) {
    return c.json({ error: 'runs_strategies', message: `${row.name} runs the strategies you gave it, on their own schedule.` }, 409);
  }
  const { lookNow } = await import('../bot/autonomous.js');
  const res = await lookNow(w.id, row.persona_id);
  if (res.executed) {
    return c.json({
      executed: true,
      symbol: res.receipt.symbol,
      usd: res.receipt.usd,
      units: res.receipt.filledUnits,
      price: res.receipt.fillPrice,
      venue: res.receipt.venue,
      signature: res.receipt.signature,
      explorer: explorerTx(res.receipt.signature),
      reason: res.setup.reason,
    });
  }
  return c.json({ executed: false, reason: res.reason, detail: res.detail, looks: res.looks ?? [] });
});
