import { serve } from '@hono/node-server';
import 'dotenv/config';
import { app } from './app.js';
import { ON_SOLANA, activeClusterKey } from './solana/clusters.js';
import { connection as solanaConnection } from './solana/connection.js';
import { delegateKeypair } from './solana/keys.js';
import { warmMarketCache } from './routes/market.js';
import { startMirrorSchedule } from './routes/mirror.js';
import { log } from './http/request-id.js';
import { startScheduler } from './executor/scheduler.js';
import { inFlightRuns } from './executor/run.js';
import { reconcileInterruptedRuns } from './executor/reconcile.js';
import { CHAIN_KEY, rpcUrl } from './evm/chains.js';
import { DELEGATION_ADDRESS, delegatePublicKey } from './evm/delegation.js';
import { DATABASE_URL, pool } from './db/index.js';
import { withoutPassword } from './db/redact.js';

/** The executor as a long-running Node process: the app from `app.ts`, plus the scheduler and the cache warm-up. */
const port = Number(process.env.PORT ?? 8787);
const server = serve({ fetch: app.fetch, port });

/**
 * Shut down without abandoning work.
 *
 * A SIGTERM in the middle of a run left the `strategy_runs` row claimed and never finished — the
 * period key means that period can never be retried, so the strategy silently skips a day and the
 * row sits `pending` forever. Draining first is the difference between a deploy costing nothing
 * and a deploy costing a user their scheduled buy.
 *
 * Bounded: a drain that never finishes is a process that never dies, and an orchestrator will kill
 * it less politely. Ten seconds is longer than any single fill has taken and shorter than the
 * grace period every scheduler gives.
 */
const DRAIN_MS = 10_000;
let shuttingDown = false;
/** The MongoDB copy's schedule, when this deployment has one (routes/mirror.ts). Declared here so shutdown can stop it. */
let stopMirror: (() => void) | undefined;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`${signal} — draining for up to ${DRAIN_MS}ms`);

  if (scheduler) clearInterval(scheduler);
  stopMirror?.();
  server.close();

  const deadline = Date.now() + DRAIN_MS;
  while (inFlightRuns() > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }
  const stranded = inFlightRuns();
  if (stranded > 0) {
    log.warn(`${stranded} run(s) still in flight after ${DRAIN_MS}ms — exiting anyway`);
  }

  await pool.end().catch(() => undefined);
  log.info('stopped cleanly');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
console.log(`xorr executor on :${port}`);
console.log(`  db      ${withoutPassword(DATABASE_URL)}`);
if (ON_SOLANA) {
  // The EVM lines described a chain this process is not on (2026-09-19): the cluster and the SPL delegate key.
  console.log(`  chain    ${activeClusterKey()} ${solanaConnection.rpcEndpoint}`);
  console.log(`  delegate ${delegateKeypair().publicKey.toBase58()} (SPL)`);
} else {
  console.log(`  chain    ${CHAIN_KEY} ${rpcUrl}`);
  console.log(`  contract ${DELEGATION_ADDRESS}`);
  console.log(`  delegate ${delegatePublicKey}`);
}
console.log('  auth     Privy (every route except /health)');

/*
 * Heal anything the last shutdown could not.
 *
 * Before the scheduler starts, so a tick cannot race a row that is about to be closed. Failures
 * here are logged and not fatal: an executor that refuses to start because it could not tidy up
 * is worse than one that starts with a few rows still untidy.
 */
await reconcileInterruptedRuns().catch((e: unknown) =>
  log.error('reconcile failed:', e instanceof Error ? e.message : e),
);

/** Held so shutdown can stop it before draining; otherwise a tick starts a run mid-drain. */
const scheduler = process.env.SCHEDULER !== 'off' ? startScheduler() : undefined;

// Populate the price and chart caches before anyone opens a screen.
warmMarketCache();

// Copy the database into MongoDB Atlas on a schedule, where a destination is configured.
stopMirror = startMirrorSchedule();
