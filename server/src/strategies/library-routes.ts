/**
 * `/strategies/library` — the research book, public.
 *
 * Public for the same reason `/verify` is: a catalogue of backtests is not somebody's money, and
 * making a judge or a curious reader sign in to look at it would be theatre. It is read-only and
 * holds no wallet.
 *
 * Mounted under `/strategies/library` and not `/strategies`, which already means something else on
 * this server — the caller's own live strategies, which are private and scoped to their wallet.
 */
import { Hono } from 'hono';
import { families, getStrategy, libraryCounts, libraryProvenance, listStrategies } from './library.js';

export const libraryRoutes = new Hono();

libraryRoutes.get('/strategies/library', (c) => {
  const q = c.req.query('q')?.trim() || undefined;
  const family = c.req.query('family')?.trim() || undefined;
  /*
   * Survivors by default, and the caller has to ask for the rest.
   *
   * Ten of three hundred and thirteen cleared the gauntlet. Opening on all of them would bury that
   * result in the noise the gauntlet exists to remove — and would read as "313 strategies" when the
   * honest headline is "313 tested, 10 survived".
   */
  const survivorsOnly = c.req.query('all') !== '1';
  return c.json({
    provenance: libraryProvenance(),
    counts: libraryCounts(),
    families: families(),
    filtered: { survivorsOnly, q: q ?? null, family: family ?? null },
    strategies: listStrategies({ survivorsOnly, q, family }),
  });
});

libraryRoutes.get('/strategies/library/:id', (c) => {
  const s = getStrategy(c.req.param('id'));
  if (!s) return c.json({ error: 'not_found', detail: `No strategy called ${c.req.param('id')} in the book.` }, 404);
  return c.json({ provenance: libraryProvenance(), strategy: s });
});
