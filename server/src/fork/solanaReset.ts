/**
 * A Solana fork rebuilt under a running executor (2026-09-23).
 *
 * The hosted fork is re-bootstrapped to refresh its routes, and a new ledger starts with nothing in anybody's wallet
 * but the dev owner's. The executor's book did not know: it kept every holding recorded on the old ledger, and blended
 * the first buys on the new one into them — 0.0439 NVDAx bought at $228.39 showed an entry of $225.54 and +1.3%,
 * averaged with 0.7842 NVDAx that no longer existed anywhere.
 *
 * A fork's identity is its genesis hash, which a new ledger always changes. When it changes, what was recorded on the
 * old one comes out: positions and their sleeves go to zero, the exits guarding them end, and each wallet's trail says
 * so. Only on a fork — on a real cluster the genesis never changes, and this never runs (`CLUSTER_KEY` gate below).
 */
import { connection } from '../solana/connection.js';
import { CLUSTER_KEY } from '../solana/clusters.js';
import { one, query, tx } from '../db/index.js';
import { THIS_CHAIN } from '../db/chain-scope.js';
import { append } from '../audit/log.js';
import { log } from '../http/request-id.js';

const KEY = `fork_genesis:${CLUSTER_KEY}`;

/** Whether this deployment runs on a fork whose ledger can be rebuilt. */
export function isRebuildableFork(): boolean {
  return CLUSTER_KEY === 'solana-fork' || CLUSTER_KEY === 'solana-localnet';
}

/**
 * Compare the fork's genesis to the one last seen, and take the old ledger's holdings out of the book if it changed.
 * The first reading only records; nothing is known about what came before it. Returns the wallets reset.
 */
export async function reconcileForkReset(): Promise<number> {
  if (!isRebuildableFork()) return 0;
  const genesis = await connection.getGenesisHash();
  const seen = await one<{ value: string }>(`SELECT value FROM app_config WHERE key = $1`, [KEY]);
  if (seen?.value === genesis) return 0;
  if (!seen) {
    await query(`INSERT INTO app_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`, [KEY, genesis]);
    return 0;
  }

  const wallets = await tx(async (client) => {
    const held = await client.query<{ wallet_id: string; symbols: string[] }>(
      `SELECT wallet_id, array_agg(symbol ORDER BY symbol) AS symbols FROM positions
        WHERE chain = ${THIS_CHAIN} AND units > 0 GROUP BY wallet_id`,
    );
    await client.query(`UPDATE positions SET units = 0, cost_usd = 0, updated_at = now() WHERE chain = ${THIS_CHAIN} AND units > 0`);
    await client.query(`UPDATE position_sleeves SET units = 0, cost_usd = 0, updated_at = now() WHERE chain = ${THIS_CHAIN} AND units > 0`);
    await client.query(`UPDATE strategies SET state = 'ended' WHERE chain = ${THIS_CHAIN} AND kind = 'exit-rules' AND state = 'live'`);
    await client.query(
      `INSERT INTO app_config (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [KEY, genesis],
    );
    return held.rows;
  });

  for (const w of wallets) {
    await append({
      walletId: w.wallet_id,
      agent: 'xorr',
      action: 'The test network was rebuilt',
      detail: `A new fork ledger started, and nothing held on the old one exists on it. ${w.symbols.join(', ')} came out of your book, with the exits that guarded them. What you hold from here is read from the new chain.`,
      kind: 'risk',
      payload: { genesis, symbols: w.symbols },
    }).catch((e) => log.error('[fork-reset] audit row failed:', e));
  }
  log.info(`[fork-reset] genesis ${seen.value.slice(0, 8)}… → ${genesis.slice(0, 8)}…: reset ${wallets.length} wallet book(s)`);
  return wallets.length;
}
