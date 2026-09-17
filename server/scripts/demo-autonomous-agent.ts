/**
 * The autonomous xStocks agent, driven end to end against a real Solana validator.
 *
 * Run:  npm run demo:autonomous            (from server/, against XORR_CHAIN=solana-fork)
 *
 * ## What this prints, and why it can be trusted
 *
 * Every number here is read from something: the marks come from a live Jupiter route, the reference
 * quotes from the issuer's public feed, the fill signature and slot from `confirmTransaction`, and
 * the slot is then re-read off the chain with `getTransaction` so the line printed is the chain's
 * answer rather than the executor's. Paste any signature into a Solana explorer pointed at the fork
 * and the transaction is there.
 *
 * ## What it used to print
 *
 * `'5K3yDemoJupiterFillSolana' + Math.random().toString(36)`, a slot of `289412948`, and a wallet id
 * of `demo-wallet-solana-01`. Nothing had touched a chain or a database. The output was formatted to
 * be indistinguishable from a real run — "✔ Jupiter swap executed on Solana mainnet-fork" — so the
 * first person to click a signature would have found nothing, and would have been right to disbelieve
 * everything above it too. A demo that fabricates its evidence is worse than no demo (PLAN.md §0.1).
 *
 * ## So it refuses instead
 *
 * Every dependency this needs is checked up front, and a missing one exits non-zero with the command
 * that fixes it. If the validator is not running, this says to start it. If the agent has no route,
 * no delegation or no budget, it prints the refusal the executor produced and stops. There is no
 * path through this file that prints a fill that did not happen.
 */
import { Connection } from '@solana/web3.js';
import { query, one, pool } from '../src/db/index.js';
import { CLUSTER_KEY, rpcUrl } from '../src/solana/clusters.js';
import { CURRENT_FACTS } from '../src/solana/money.js';
import { explorerTx } from '../src/solana/connection.js';
import { readDelegation } from '../src/solana/delegation.js';
import { getUsdcBalance, getXStockBalance } from '../src/solana/balances.js';
import { evaluateBestSetup, runAutonomousCycle } from '../src/bot/autonomous.js';
import { stockPriceUsd, XSTOCKS } from '../src/venues/stocks.js';
import { getNasdaqSession, offHoursGuard } from '../src/market/nasdaq.js';
import { underlyingQuoteUsd } from '../src/market/backed.js';
import { assessCorporateAction, getMultiplier } from '../src/venues/corporate-actions.js';
import { notifyKill } from '../src/notifications/alerts.js';
import type { WalletRow } from '../src/routes/wallet-context.js';

const RPC = rpcUrl();
const SIZE_USD = Number(process.env.DEMO_USD ?? 25);

/** Stop with a sentence someone can act on, rather than a stack trace or a fabricated success. */
function stop(what: string, fix: string): never {
  console.error(`\n✖ ${what}\n\n  ${fix}\n`);
  process.exit(1);
}

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * Everything that has to be true before a single number is printed.
 *
 * Checked in dependency order and each with its own remedy, because "connection refused" three
 * frames deep in a swap is not a message that tells anyone to start a validator.
 */
async function preflight(): Promise<{ conn: Connection; wallet: WalletRow }> {
  console.log(`cluster ${CLUSTER_KEY}  rpc ${RPC}  money ${CURRENT_FACTS.class}\n`);

  /*
   * Copy or test money only.
   *
   * This places a real market order with no confirmation step. On mainnet-beta that is someone's
   * actual money, and a demo is never the reason to spend it.
   */
  if (CURRENT_FACTS.class === 'real') {
    stop(
      `${CLUSTER_KEY} settles in real funds, and this script trades without asking.`,
      'Run it against the fork: XORR_CHAIN=solana-fork npm run demo:autonomous',
    );
  }

  const conn = new Connection(RPC, 'confirmed');
  let slot: number;
  try {
    const version = await conn.getVersion();
    slot = await conn.getSlot();
    console.log(`validator solana-core ${version['solana-core']}  slot ${slot}`);
  } catch (e) {
    stop(
      `No Solana validator is answering at ${RPC} (${e instanceof Error ? e.message : String(e)}).`,
      'Start the fork first, then re-run this:\n' +
        '    solana-test-validator --url https://api.mainnet-beta.solana.com \\\n' +
        '      --clone-upgradeable-program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 \\\n' +
        '      --clone EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \\\n' +
        '      --clone Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh\n' +
        `  Or point FORK_RPC at a validator that is already up (currently ${RPC}).`,
    );
  }

  try {
    await query('SELECT 1');
  } catch (e) {
    stop(
      `Postgres is not reachable (${e instanceof Error ? e.message : String(e)}).`,
      'Start it and run the migrations: cd server && npm run migrate\n' +
        '  DATABASE_URL selects the database.',
    );
  }

  /*
   * A real wallet row, because the agent's whole job is to act inside one wallet's permissions.
   * `demo-wallet-solana-01` was a string; a notification written against it belonged to nobody and
   * the kill switch below would have had nothing to switch.
   */
  const asked = process.argv[2] ?? process.env.DEMO_WALLET_ID;
  const wallet = asked
    ? await one<WalletRow>(`SELECT * FROM wallets WHERE id = $1`, [asked])
    : await one<WalletRow>(
        `SELECT * FROM wallets WHERE address IS NOT NULL ORDER BY active_at DESC NULLS LAST, created_at DESC, id DESC LIMIT 1`,
      );
  if (!wallet) {
    stop(
      asked ? `No wallet ${asked} in this database.` : 'No wallet rows in this database.',
      'Register one through the app against this cluster, or pass an id:\n' +
        '    npm run demo:autonomous -- <wallet-id>',
    );
  }
  console.log(`wallet   ${wallet.id}  ${wallet.address}`);

  if (wallet.agents_stopped === true) {
    stop(
      'That wallet has the agent kill switch engaged, so the executor will refuse every entry.',
      'Resume the agents on the Safety screen, or:\n' +
        `    psql "$DATABASE_URL" -c "UPDATE wallets SET agents_stopped = false WHERE id = '${wallet.id}'"`,
    );
  }

  /*
   * The on-chain grant, read from the chain. This is the thing that makes the trade below
   * non-custodial, so it is checked against the chain rather than against a DB row.
   */
  const del = await readDelegation(wallet.address).catch(() => null);
  if (!del || del.revoked || del.delegatedUsd <= 0) {
    stop(
      `No live SPL delegation on ${wallet.address}, so there is nothing the agent is permitted to spend.`,
      'Grant one on this fork: cd server && npm run rebuild:fork',
    );
  }
  const usdc = await getUsdcBalance(wallet.address);
  console.log(
    `grant    delegate ${del.delegate}  delegated ${money(del.delegatedUsd)}  wallet USDC ${money(usdc)}`,
  );
  if (del.delegatedUsd < SIZE_USD) {
    stop(
      `The grant covers ${money(del.delegatedUsd)} but this demo wants to spend ${money(SIZE_USD)}.`,
      `Raise the delegation, or set DEMO_USD to at most ${del.delegatedUsd.toFixed(2)}.`,
    );
  }
  if (usdc < SIZE_USD) {
    stop(
      `The wallet holds ${money(usdc)} USDC and this demo wants to spend ${money(SIZE_USD)}.`,
      'Fund it from the fork: cd server && npm run rebuild:fork',
    );
  }

  return { conn, wallet };
}

async function main() {
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('  XORR AUTONOMOUS AI AGENT — BACKED FINANCE xSTOCKS ON SOLANA   ');
  console.log('═════════════════════════════════════════════════════════════════\n');

  const { conn, wallet } = await preflight();

  console.log('\n1. SCANNING xSTOCKS UNIVERSE (Token-2022 Backed Finance Equities)...');
  for (const [symbol, info] of Object.entries(XSTOCKS)) {
    const [mark, multiplier, held] = await Promise.all([
      stockPriceUsd(symbol),
      getMultiplier(symbol),
      getXStockBalance(wallet.address, symbol),
    ]);
    // `no price` is a real state — nothing routes right now — and it is printed as one.
    console.log(
      `   • ${symbol.padEnd(6)}: Mint=${info.mint.slice(0, 8)}... | ` +
        `Live Mark=${mark === null ? 'no price (no route)' : money(mark)} | ` +
        `Scaled Multiplier=${multiplier.toFixed(1)}x | Held=${held?.uiAmountString ?? 'n/a'}`,
    );
  }

  console.log('\n2. GROUNDING SIGNALS (CORPORATE ACTIONS & NASDAQ SESSION)...');
  const session = getNasdaqSession();
  console.log(
    `   [Nasdaq Session]: ${session.session.toUpperCase()} (${session.phase} - ${session.easternTime}) | Exchange Open: ${session.isExchangeOpen}`,
  );

  for (const symbol of Object.keys(XSTOCKS)) {
    const mark = await stockPriceUsd(symbol);
    console.log(`   • ${symbol}:`);
    if (mark === null) {
      console.log('     - No route, so no mark and nothing to compare against. Skipped.');
      continue;
    }
    const [ca, guard, reference] = await Promise.all([
      assessCorporateAction(symbol),
      offHoursGuard({ symbol, onChainPrice: mark }),
      underlyingQuoteUsd(symbol.replace(/x$/, '')),
    ]);
    console.log(
      `     - Corporate Actions: ${ca.imminentAction ? `${ca.imminentAction.kind.toUpperCase()} (${ca.imminentAction.title}) in ${ca.daysUntil}d [${ca.recommendation}]` : 'None imminent'}`,
    );
    console.log(
      `     - Issuer Quote:      ${reference === null ? 'unavailable' : money(reference)} (api.backed.fi price-data)`,
    );
    console.log(
      `     - Off-Hours Guard:   Spread=${guard.spreadPct === null ? 'not measured' : `${(guard.spreadPct * 100).toFixed(2)}%`} | ` +
        `Action=${guard.action.toUpperCase()} | Suggested Slippage=${guard.suggestedSlippageBps} bps`,
    );
  }

  console.log('\n3. EVALUATING CANDIDATE STRATEGIES (Propose & Decide Layer)...');
  const bestSetup = await evaluateBestSetup();
  if (!bestSetup) {
    stop(
      'No viable xStocks setup in current market conditions — every candidate was refused or unpriced.',
      'That is a real answer, not a failure. Re-run during Nasdaq hours, or check the guard output above.',
    );
  }
  console.log('   Selected Optimal Setup:');
  console.log(`   - Symbol:              ${bestSetup.symbol}`);
  console.log(`   - Strategy:            ${bestSetup.strategyKind.toUpperCase()}`);
  console.log(`   - Persona:             ${bestSetup.personaName} (${bestSetup.persona})`);
  console.log(`   - Score:               ${bestSetup.score}/100`);
  console.log(`   - Market Condition:    ${bestSetup.marketCondition}`);
  console.log(`   - Rationale:           ${bestSetup.reason}`);
  console.log(`   - Entry Price:         ${money(bestSetup.currentPrice)}`);
  console.log(
    `   - Target Price:        ${money(bestSetup.targetPrice)} (+${(((bestSetup.targetPrice - bestSetup.currentPrice) / bestSetup.currentPrice) * 100).toFixed(1)}%)`,
  );
  console.log(
    `   - Stop-Loss Price:     ${money(bestSetup.stopPrice)} (-${(((bestSetup.currentPrice - bestSetup.stopPrice) / bestSetup.currentPrice) * 100).toFixed(1)}%)`,
  );
  console.log(`   - Dynamic Slippage:    ${bestSetup.suggestedSlippageBps ?? 50} bps`);

  /*
   * 4. The real thing.
   *
   * `runAutonomousCycle` is what the scheduler tick calls. It re-reads the delegation, runs the
   * rules engine, sizes against the remaining daily allowance, spends through `guardAndSpend` —
   * the one chokepoint — arms the exits, writes the proposal row and dispatches the entry
   * notification. This script adds nothing to that path and takes nothing away from it.
   */
  console.log('\n4. AUTONOMOUS EXECUTION (scheduler tick -> guardAndSpend -> Jupiter)...');
  const result = await runAutonomousCycle(wallet.id, { fixedUsd: SIZE_USD });
  if (!result.executed) {
    stop(
      `The executor refused: ${result.reason} — ${result.detail}`,
      'Nothing was spent and nothing was recorded. Fix the condition above and re-run.',
    );
  }

  const { receipt } = result;
  console.log('   ✔ Jupiter swap confirmed on-chain:');
  console.log(`     • Transaction Signature: ${receipt.signature}`);
  console.log(`     • Slot (from confirmTransaction): ${receipt.slot}`);
  console.log(
    `     • Swapped: ${money(receipt.usd)} USDC -> ${receipt.units.toFixed(6)} ${receipt.symbol} @ ${money(receipt.price)}`,
  );
  console.log(`     • Explorer: ${explorerTx(receipt.signature)}`);

  /*
   * Read it back off the chain.
   *
   * The lines above are the executor's account of what it did. This one is the validator's, fetched
   * by signature, and it is the line that makes the demo checkable: if the transaction were not
   * really there, this prints "NOT FOUND" and the run exits non-zero.
   */
  const onChain = await conn
    .getTransaction(receipt.signature, { maxSupportedTransactionVersion: 0 })
    .catch(() => null);
  if (!onChain) {
    stop(
      `The executor returned signature ${receipt.signature}, but the validator at ${RPC} does not have it.`,
      'That is a bug, not a demo result. Do not present this run.',
    );
  }
  console.log(
    `     • Verified on chain: slot ${onChain.slot}, fee ${onChain.meta?.fee ?? 0} lamports, err ${String(onChain.meta?.err ?? 'none')}`,
  );

  /*
   * 5. The exits are armed, not fired.
   *
   * A take-profit fires when the price reaches the target, and no demo can make that happen on
   * demand. What is real and checkable is the strategy row holding the levels — the same row the
   * Auto Close screen creates — so that is what gets printed. The previous version of this script
   * printed an exit fill with a `'5K3yDemoExitSig' + Math.random()` signature and a P&L to match.
   */
  console.log('\n5. EXITS ARMED (they fire on price, so nothing is shown as filled here)...');
  if (result.exitStrategyId) {
    const exit = await one<{ id: string; label: string; state: string; params: unknown }>(
      `SELECT id, label, state, params FROM strategies WHERE id = $1`,
      [result.exitStrategyId],
    );
    console.log(`   ✔ strategies row ${result.exitStrategyId} (${exit?.state ?? 'unknown'}): ${exit?.label ?? ''}`);
    console.log(
      `     Stop-loss ${money(bestSetup.stopPrice)} / take-profit ${money(bestSetup.targetPrice)}, checked on every tick.`,
    );
  } else {
    console.log('   • No exit was armed — an exit on this symbol was already live, or the fill landed outside the range.');
  }

  console.log(`   ✔ Entry notification dispatched to wallet ${wallet.id} (push + messages row).`);
  const messages = await query<{ type: string; agent: string }>(
    `SELECT type, agent FROM messages WHERE wallet_id = $1 ORDER BY at DESC LIMIT 1`,
    [wallet.id],
  );
  const latest = messages[0];
  if (latest) console.log(`     messages: latest is type='${latest.type}' from '${latest.agent}'`);

  /*
   * 6. The kill switch, proved rather than described.
   *
   * Engage it, ask the agent to trade again, and show the refusal — then put it back. The previous
   * version sent a kill notification with an invented signature and called that a demonstration;
   * this one changes real state, is refused by the real rules engine, and restores what it found.
   *
   * No signature is printed because none exists: the agent stop is a database flag the executor
   * reads (`evaluate`'s `killed`). The on-chain revoke is the separate, stronger stop on the Safety
   * screen, and it needs the owner's key, which a non-custodial server does not hold.
   */
  console.log('\n6. KILL SWITCH (engage -> refuse -> restore)...');
  await query(
    `UPDATE wallets SET agents_stopped = true, agents_stopped_at = now() WHERE id = $1`,
    [wallet.id],
  );
  await notifyKill({ walletId: wallet.id, reason: 'Kill switch engaged from the autonomous agent demo.' });
  console.log('   ✔ agents_stopped = true; kill notification dispatched (no signature: nothing was signed).');

  const refused = await runAutonomousCycle(wallet.id, { fixedUsd: SIZE_USD });
  if (refused.executed) {
    stop(
      'The agent traded while the kill switch was engaged. That is the one thing it must never do.',
      'Do not present this run. The refusal path in bot/autonomous.ts is broken.',
    );
  }
  console.log(`   ✔ Next cycle refused: ${refused.reason} — ${refused.detail}`);

  await query(
    `UPDATE wallets SET agents_stopped = false, agents_stopped_at = NULL WHERE id = $1`,
    [wallet.id],
  );
  console.log('   ✔ Restored agents_stopped = false (the state this run found).');

  console.log('\n═════════════════════════════════════════════════════════════════');
  console.log('  DEMO COMPLETE — every signature above resolves on this cluster  ');
  console.log('═════════════════════════════════════════════════════════════════');
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('\nDemo error:', err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
