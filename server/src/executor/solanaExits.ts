/**
 * Exits on Solana: a stop-loss or take-profit that actually sells (2026-09-19).
 *
 * The agent armed an `exit-rules` strategy after every buy ("Exit set: sells your NVDAx if it falls to …"), and on
 * Solana nothing could fire it: the strategy runner is the Base one, and it read a Solidity delegation that does not
 * exist here. The promise on the receipt was never kept.
 *
 * Here an exit is checked on every scheduler tick, not once a day — a stop that looks at the market daily is not a
 * stop. When the live Jupiter price crosses the stop or the target, the exit is claimed (one atomic state change, so
 * two ticks can never both sell), and the owner's whole holding of that xStock is sold through `guardAndSpend`, which
 * moves the owner's shares only under the sell approval they granted. A refusal puts the exit back and backs off for
 * an hour, so a missing approval is said once an hour, not every thirty seconds.
 */
import { randomUUID } from 'node:crypto';
import { one, query, tx } from '../db/index.js';
import { THIS_CHAIN } from '../db/chain-scope.js';
import { append } from '../audit/log.js';
import { applyFill } from '../positions/index.js';
import { send } from '../notifications/push.js';
import { log } from '../http/request-id.js';
import { guardAndSpend } from './place.js';
import { tradablePriceUsd, tradableToken } from '../venues/tradable-token.js';
import { readDelegation } from '../solana/delegation.js';
import { readMintScale, toUiAmount } from '../solana/balances.js';

export type ExitParams = {
  entryPrice: number;
  takeProfitPct: number;
  stopLossPct: number;
  /** When a refused exit may be tried again, epoch ms. */
  retryAfter?: number;
  /** The agent that armed it, and that agent's wallet, which the sale pays into (2026-09-23). */
  armedBy?: string;
  proceedsTo?: string;
};

export type ExitTrigger = { kind: 'stop' | 'target'; level: number } | null;

/** Whether `price` crosses the stop or the target the exit was armed with. Pure. */
export function exitTrigger(p: ExitParams, price: number): ExitTrigger {
  if (!(p.entryPrice > 0) || !(price > 0)) return null;
  const stop = p.entryPrice * (1 - p.stopLossPct / 100);
  const target = p.entryPrice * (1 + p.takeProfitPct / 100);
  // A hair of tolerance: 200 × 1.1 is 220.00000000000003, and a price of exactly 220 has reached a 10% target.
  const eps = 1e-9 * p.entryPrice;
  if (p.stopLossPct > 0 && price <= stop + eps) return { kind: 'stop', level: stop };
  if (p.takeProfitPct > 0 && price >= target - eps) return { kind: 'target', level: target };
  return null;
}

type ExitRow = { id: string; wallet_id: string; label: string; symbol: string; params: ExitParams; address: string; agents_stopped: boolean | null };

const BACKOFF_MS = 60 * 60_000;

/** Check every live exit on this chain against the live price; sell the ones that crossed. Returns how many fired. */
export async function solanaExitSweep(now: Date = new Date(), priceOf = tradablePriceUsd): Promise<number> {
  const rows = await query<ExitRow>(
    `SELECT s.id, s.wallet_id, s.label, s.symbol, s.params, w.address, w.agents_stopped
       FROM strategies s JOIN wallets w ON w.id = s.wallet_id
      WHERE s.kind = 'exit-rules' AND s.state = 'live' AND s.chain = ${THIS_CHAIN}`,
  );
  const prices = new Map<string, number | null>();
  let fired = 0;
  for (const row of rows) {
    if (row.agents_stopped) continue; // "Stops all trading, stop-losses too."
    if (row.params.retryAfter && row.params.retryAfter > now.getTime()) continue;
    /*
     * Every class this executor can buy, not the xStocks alone (2026-09-22).
     *
     * A Tessera position fell through this `continue` without a log or an audit row, so a
     * stop-loss set on one was not refused — it simply never fired, and the screen went on showing
     * it as live. `tradableToken` is the same set the spend path admits, so a stop can only exist
     * for something this sweep will actually check.
     */
    const token = tradableToken(row.symbol);
    if (!token) continue;
    const key = token.symbol;
    /*
     * An exit with nothing to guard ends now, and says so (2026-09-23). It used to wait for its level: Strategies listed
     * "live" stops on SPYx, TSLAx and AAPLx for a wallet that held none of them — sold, or gone with a rebuilt fork —
     * each promising to sell something that was not there.
     */
    const holding = await readDelegation(row.address, token.address).catch(() => null);
    if (holding && holding.balanceAmount === 0n) {
      const ended = await one<{ id: string }>(
        `UPDATE strategies SET state = 'ended' WHERE id = $1 AND state = 'live' RETURNING id`,
        [row.id],
      );
      if (ended) {
        try {
          await append({
            walletId: row.wallet_id,
            agent: 'xorr',
            action: `Exit on ${key} ended`,
            detail: `You no longer hold any ${key}, so there is nothing for "${row.label}" to sell.`,
            kind: 'risk',
            payload: { strategyId: row.id },
          });
        } catch (e) {
          log.error('[exits] could not write the ended exit to the trail:', e instanceof Error ? e.message : e);
        }
      }
      continue;
    }
    if (!prices.has(key)) prices.set(key, await priceOf(key).catch(() => null));
    const price = prices.get(key);
    if (!price) continue;
    const trigger = exitTrigger(row.params, price);
    if (!trigger) continue;
    try {
      if (await fireExit(row, key, price, trigger, now)) fired += 1;
    } catch (e) {
      log.error(`[exits] ${row.label} threw:`, e instanceof Error ? e.message : e);
    }
  }
  return fired;
}

async function fireExit(row: ExitRow, symbol: string, price: number, trigger: NonNullable<ExitTrigger>, now: Date): Promise<boolean> {
  // Claimed first: two ticks, or two executors, can never both sell the same holding.
  const claimed = await one<{ id: string }>(
    `UPDATE strategies SET state = 'ended' WHERE id = $1 AND state = 'live' RETURNING id`,
    [row.id],
  );
  if (!claimed) return false;

  const stock = tradableToken(symbol)!;
  const held = await readDelegation(row.address, stock.address);
  const scale = await readMintScale(stock.address);
  const units = toUiAmount(held.balanceAmount, scale);
  const why = trigger.kind === 'stop' ? `fell to the stop at $${trigger.level.toFixed(2)}` : `reached the target at $${trigger.level.toFixed(2)}`;

  if (!(units > 0)) {
    // Nothing left to sell: the position was closed another way. The exit is done, and says why.
    await append({
      walletId: row.wallet_id,
      agent: 'xorr',
      action: `Exit on ${symbol} closed`,
      detail: `${symbol} ${why}, but you no longer hold any, so there was nothing to sell.`,
      kind: 'risk',
      payload: { strategyId: row.id, trigger: trigger.kind },
    });
    return false;
  }

  const outcome = await guardAndSpend({
    walletId: row.wallet_id,
    ownerPubkey: row.address,
    symbol,
    usd: units * price,
    units,
    side: 'sell',
    skipRulesEngine: true, // a close only reduces risk; the daily cap is a limit on spending
    agentWallet: row.params.proceedsTo ? { address: row.params.proceedsTo, name: row.params.armedBy ?? 'The agent' } : undefined,
  });

  if (!outcome.placed) {
    // Put it back, and try again in an hour rather than every tick.
    await query(`UPDATE strategies SET state = 'live', params = params || $2::jsonb WHERE id = $1`, [
      row.id,
      JSON.stringify({ retryAfter: now.getTime() + BACKOFF_MS }),
    ]);
    await append({
      walletId: row.wallet_id,
      agent: 'xorr',
      action: `Exit on ${symbol} could not sell`,
      detail: `${symbol} ${why}. ${outcome.detail} I will try again in an hour.`,
      kind: 'block',
      payload: { strategyId: row.id, reason: outcome.reason },
    });
    void send(row.wallet_id, { title: `Your ${symbol} exit did not sell`, body: outcome.detail, route: '/activity', kind: 'strategy-blocked' }).catch(() => undefined);
    return false;
  }

  const runId = randomUUID();
  await tx(async (client) => {
    await client.query(
      /*
       * With the venue, the side and the class the rest of the executor records (2026-09-20). This row carried none of
       * them, so an exit that sold through Jupiter counted as `unrecorded` in `/metrics` and in fill quality — the one
       * place that answers "where did the bot's sales actually fill", blind to the sales it makes unattended.
       */
      `INSERT INTO strategy_runs
         (id, strategy_id, period_key, status, usd, units, price, signature, venue, side, asset_class, quoted_units, quoted_usd, finished_at)
       VALUES ($1, $2, $3, 'filled', $4, $5, $6, $7, $8, 'sell', 'equity', $5, $4, now())`,
      [runId, row.id, `exit:${row.id}`, outcome.usd, outcome.filledUnits, outcome.fillPrice, outcome.signature, outcome.venue],
    );
    await applyFill(client, {
      walletId: row.wallet_id,
      symbol,
      units: -outcome.filledUnits,
      usd: outcome.usd,
      attribution: { source: 'strategy', id: row.id, label: row.label },
    });
    /*
     * The holding this exit guarded is sold, all of it, so every other exit on it is done too (2026-09-23). Left live,
     * one would fire later on shares bought after, at levels written for an entry that no longer exists.
     */
    await client.query(
      `UPDATE strategies SET state = 'ended'
        WHERE wallet_id = $1 AND kind = 'exit-rules' AND symbol = $2 AND state = 'live' AND id <> $3`,
      [row.wallet_id, symbol, row.id],
    );
    await append(
      {
        walletId: row.wallet_id,
        agent: 'xorr',
        action: `Sold ${symbol}`,
        detail: `${symbol} ${why}: sold ${outcome.filledUnits.toFixed(6)} at $${outcome.fillPrice.toFixed(2)} through ${outcome.venue === 'jupiter-route' ? 'Jupiter' : 'the venue vault'}.`,
        amount: `$${outcome.usd.toFixed(2)}`,
        kind: 'trade',
        signature: outcome.signature,
        payload: { strategyId: row.id, runId, trigger: trigger.kind, venue: outcome.venue, slot: outcome.slot, side: 'sell' },
      },
      client,
    );
  });
  void send(row.wallet_id, {
    title: trigger.kind === 'stop' ? `Stop-loss sold your ${symbol}` : `Take-profit sold your ${symbol}`,
    body: `${outcome.filledUnits.toFixed(4)} ${symbol} for $${outcome.usd.toFixed(2)}.`,
    route: '/activity',
    kind: 'dca-executed',
  }).catch(() => undefined);
  return true;
}
