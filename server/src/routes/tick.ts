/**
 * The scheduler, one tick at a time, for a host without a long-running process (2026-10-25).
 *
 * On Vercel nothing stays alive to run `startScheduler()`'s interval, so an external clock (a scheduled GitHub Action)
 * calls this instead. Operator-only: the tick sends transactions from the delegate key. `guardedTick` already skips a
 * tick while the previous one is running, so two overlapping calls cannot both trade.
 */
import { Hono } from 'hono';
import { guardedTick } from '../executor/scheduler.js';
import { warmMarketCache } from './market.js';

export const tickRoutes = new Hono();

tickRoutes.post('/ops/tick', async (c) => {
  const principal = c.get('principal');
  if (principal?.kind !== 'operator') {
    return c.json({ error: 'forbidden', detail: 'The tick is the operator’s.' }, 403);
  }
  const started = Date.now();
  warmMarketCache();
  const ran = await guardedTick();
  return c.json({ ran, ms: Date.now() - started });
});
