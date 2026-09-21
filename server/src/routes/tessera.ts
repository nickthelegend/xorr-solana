/**
 * `/market/preipo` — the pre-IPO catalogue, public like the rest of `/market/*`.
 *
 * A mint address, a pool price and a published mark are all public facts about public tokens. The
 * route is named for what the asset is rather than for the issuer, because the screen it feeds is
 * "companies that have not listed", and Tessera is who publishes the mark, not what the thing is.
 *
 * NOT `prestocks`, which it was called for an afternoon (2026-09-21). PreStocks is a different
 * company issuing a different set of pre-IPO tokens, and naming a Tessera surface after them reads
 * as a claim to an integration this project does not have. A route name is not a private detail —
 * it is in the network tab of anyone who looks.
 */
import { Hono } from 'hono';
import { tesseraCatalog } from '../venues/tessera.js';

export const tesseraRoutes = new Hono();

tesseraRoutes.get('/market/preipo', async (c) => {
  const rows = await tesseraCatalog();
  return c.json({
    venue: 'tessera',
    /* Said once here so no screen has to decide how to phrase the thing that matters most. */
    note: 'These track private companies. There is no exchange behind them, so the pool price and the issuer mark can sit a long way apart — both are shown. Every transfer is charged a fee by the mint.',
    rows,
  });
});
