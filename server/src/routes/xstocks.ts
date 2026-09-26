/**
 * GET /market/xstocks — the tokenized-equity catalog, browsable.
 *
 * The app could trade an xStock by name and could not show you what there was to trade. `XSTOCKS`
 * has been the executor's private list since the Solana work landed: eleven mints, reachable only if
 * you already knew the symbol to type. This publishes it, with the sector of each underlying listing
 * and both prices that exist for it — see `venues/xstocks-catalog.ts` for why there are two.
 *
 * Public, for the same reason the rest of `/market/*` is: a catalog of what is listed and what it
 * costs is not user data, and gating it means a signed-out visitor sees a list of dashes.
 *
 * A row with no price is a row, not an omission. `feed: 'unavailable'` and `price: null` is the
 * honest answer on a cluster where these mints do not exist, and dropping those rows would hide
 * exactly the fact that matters — that the app cannot trade them here.
 */
import { Hono } from 'hono';
import { log } from '../http/request-id.js';
import { requireUser } from '../auth/middleware.js';
import { xStockCatalog, xStockSectors, type XStockCatalogRow } from '../venues/xstocks-catalog.js';
import { xStockQuote, DEFAULT_SLIPPAGE_BPS } from '../venues/xstocks-quote.js';
import { UnpricedError } from '../venues/jupiter.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireWallet } from './wallet-context.js';
import { guardAndSpend } from '../executor/place.js';
import { applyFill } from '../positions/index.js';
import { tx } from '../db/index.js';
import { append } from '../audit/log.js';
import { notifyEntry } from '../notifications/alerts.js';
import { ON_SOLANA } from '../solana/clusters.js';
import { explorerTx } from '../solana/connection.js';
import { SellRefused, prepareUserSell, verifyUserSell } from '../solana/userSell.js';

export const xstockRoutes = new Hono();

export type XStockCatalogResponse = {
  rows: XStockCatalogRow[];
  /** The sectors present, in the order the filter offers them. */
  sectors: string[];
  /** How many rows nothing would price. The screen says this out loud rather than making it countable. */
  unpriced: number;
};

xstockRoutes.get('/market/xstocks', async (c) => {
  const rows = await xStockCatalog();
  const unpriced = rows.filter((r) => r.feed !== 'live').length;

  /*
   * Worth a line in the log when nothing priced.
   *
   * All eleven unavailable means the price endpoint is unreachable or this deployment's mints are
   * not the ones it knows — two different faults, both of which look from the app like a quiet
   * catalog. Silence here is how the first one gets diagnosed as the second.
   */
  if (unpriced === rows.length && rows.length > 0) {
    log.warn(`[xstocks] catalog priced none of ${rows.length} mints`);
  }

  const body: XStockCatalogResponse = { rows, sectors: xStockSectors(), unpriced };
  return c.json(body);
});

/**
 * GET /market/xstocks/quote — what this order costs, before it is placed.
 *
 * Behind a session, unlike the catalog beside it: a catalogue entry is a public fact about a listed
 * asset, and this is a quote for one person's order at one size. It also costs an upstream request
 * per call, which is not something to leave open.
 *
 * A pair nothing will price is a 502 naming the pair, not a breakdown of zeroes — zeroes on this
 * screen read as a free trade.
 */
xstockRoutes.get('/market/xstocks/quote', async (c) => {
  requireUser(c);

  const symbol = c.req.query('symbol') ?? '';
  const sideParam = c.req.query('side') ?? 'buy';
  const usd = Number(c.req.query('usd'));

  if (sideParam !== 'buy' && sideParam !== 'sell') {
    return c.json({ error: 'invalid_side', detail: 'side is buy or sell.' }, 400);
  }
  if (!(Number.isFinite(usd) && usd > 0)) {
    return c.json({ error: 'invalid_amount', detail: 'usd is the size of the order, above zero.' }, 400);
  }

  /*
   * The tolerance, bounded where `/swap/quote` bounds its own.
   *
   * Out of range is refused rather than clamped: a ticket that asked for 0.1% and was quoted at 3%
   * would show a floor nobody agreed to, and the person reading it has no way to tell.
   */
  const asked = c.req.query('slippageBps');
  const slippageBps = asked === undefined ? DEFAULT_SLIPPAGE_BPS : Number(asked);
  if (!(Number.isInteger(slippageBps) && slippageBps >= 5 && slippageBps <= 300)) {
    return c.json(
      { error: 'invalid_slippage', detail: 'slippageBps is a whole number between 5 and 300.' },
      400,
    );
  }

  try {
    return c.json(await xStockQuote({ symbol, side: sideParam, usd, slippageBps }));
  } catch (e) {
    /*
     * No quote is a real answer and the ticket renders it as one. It is distinguished from a fault
     * so the screen can say "nobody would price this right now" instead of offering a retry for
     * something retrying will not fix.
     */
    if (e instanceof UnpricedError) {
      return c.json({ error: 'no_quote', detail: e.message }, 502);
    }
    throw e;
  }
});


/**
 * Buy an xStock from the phone (2026-09-19).
 *
 * The one path that can spend is `guardAndSpend`: the owner's recorded permission (cap, end date, not revoked), the
 * rules engine, the on-chain delegation, the issuer's transfer gates, a live quote — and only then the delegate moves
 * the owner's USDC and Jupiter routes it. This route adds nothing that can spend; it is the door to that path the phone
 * never had, so an xStock could be bought only by the agent. What it adds is what a fill needs afterwards, exactly as the
 * agent's own fills get it: the position booked (attributed to the person), the trail, and the notification.
 *
 * Idempotent by the request's `Idempotency-Key`: `guardAndSpend` marks the key before its first broadcast, so a retry
 * after a lost answer replays this one instead of buying again.
 */
const BuyInput = z.object({ symbol: z.string().min(1).max(20), usd: z.number().positive().max(100_000) }).strict();

xstockRoutes.post('/xstocks/buy', async (c) => {
  if (!ON_SOLANA) return c.json({ error: 'not_solana', message: 'xStocks are bought on a Solana executor.' }, 400);
  const body = BuyInput.parse(await c.req.json());
  const w = await requireWallet(c);
  const outcome = await guardAndSpend({ walletId: w.id, ownerPubkey: w.address, symbol: body.symbol, usd: body.usd, side: 'buy' });
  if (!outcome.placed) {
    return c.json({ status: 'blocked', reason: outcome.reason, message: outcome.detail }, 409);
  }

  // Booked, so Holdings and P&L know about it. Not fatal: the money has moved, and a bookkeeping failure is logged.
  const orderId = randomUUID();
  await tx((client) =>
    applyFill(client, {
      walletId: w.id,
      symbol: outcome.symbol,
      units: outcome.filledUnits,
      usd: outcome.usd,
      attribution: { source: 'manual', id: orderId, label: 'You' },
    }),
  ).catch((e) => log.error('[xstocks/buy] failed to book the fill:', e));

  const venue = outcome.venue === 'jupiter-route' ? 'Jupiter' : 'the venue vault';
  await append({
    walletId: w.id,
    agent: 'You',
    action: `Bought ${outcome.symbol}`,
    detail: `${outcome.filledUnits.toFixed(6)} ${outcome.symbol} at $${outcome.fillPrice.toFixed(2)} through ${venue}.`,
    amount: `$${outcome.usd.toFixed(2)}`,
    kind: 'trade',
    signature: outcome.signature,
    payload: { orderId, venue: outcome.venue, slot: outcome.slot },
  }).catch((e) => log.error('[xstocks/buy] failed to write the audit row:', e));

  await notifyEntry({
    walletId: w.id,
    symbol: outcome.symbol,
    strategyKind: 'manual',
    notionalUsd: outcome.usd,
    units: outcome.filledUnits,
    price: outcome.fillPrice,
    signature: outcome.signature,
    agentName: 'You',
  }).catch((e) => log.error('[xstocks/buy] failed to notify:', e));

  return c.json({
    status: 'filled',
    orderId,
    symbol: outcome.symbol,
    usd: outcome.usd,
    units: outcome.filledUnits,
    price: outcome.fillPrice,
    venue: outcome.venue,
    signature: outcome.signature,
    slot: outcome.slot,
    explorer: explorerTx(outcome.signature),
  });
});

const SellPrepareInput = z.object({ symbol: z.string().min(1).max(16), units: z.number().positive() });
const SellRecordInput = z.object({ symbol: z.string().min(1).max(16), signature: z.string().min(64).max(100) });

/**
 * POST /xstocks/sell/prepare — the sale the owner will sign (2026-09-19): their shares into the venue vault and the
 * vault's USDC to them, in one transaction at a live Jupiter quote, with the vault's leg already signed. Nothing moves
 * until the owner signs and broadcasts it.
 */
xstockRoutes.post('/xstocks/sell/prepare', async (c) => {
  if (!ON_SOLANA) return c.json({ error: 'not_solana', message: 'xStocks are sold on a Solana executor.' }, 400);
  const body = SellPrepareInput.parse(await c.req.json());
  const w = await requireWallet(c);
  try {
    return c.json(await prepareUserSell({ owner: w.address, symbol: body.symbol, units: body.units }));
  } catch (e) {
    if (e instanceof SellRefused) return c.json({ status: 'blocked', reason: e.reason, message: e.message }, 409);
    throw e;
  }
});

/**
 * POST /xstocks/sell/record — a sale the owner signed and broadcast, read back from the chain before it is booked:
 * the disposal in the position ledger, the audit row, the notification. Recording the same signature twice is a no-op.
 */
xstockRoutes.post('/xstocks/sell/record', async (c) => {
  if (!ON_SOLANA) return c.json({ error: 'not_solana', message: 'xStocks are sold on a Solana executor.' }, 400);
  const body = SellRecordInput.parse(await c.req.json());
  const w = await requireWallet(c);
  let sold: Awaited<ReturnType<typeof verifyUserSell>>;
  try {
    sold = await verifyUserSell({ owner: w.address, signature: body.signature, symbol: body.symbol });
  } catch (e) {
    if (e instanceof SellRefused) return c.json({ status: 'blocked', reason: e.reason, message: e.message }, 409);
    throw e;
  }
  const orderId = randomUUID();
  const duplicate = await tx(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [w.id]);
    const seen = await client.query('SELECT 1 FROM audit_log WHERE wallet_id = $1 AND signature = $2 LIMIT 1', [w.id, body.signature]);
    if ((seen.rowCount ?? 0) > 0) return true;
    await applyFill(client, {
      walletId: w.id,
      symbol: sold.symbol,
      units: -sold.units,
      usd: sold.usd,
      attribution: { source: 'manual', id: orderId, label: 'You' },
    });
    await append(
      {
        walletId: w.id,
        agent: 'You',
        action: `Sold ${sold.symbol}`,
        // A Jupiter swap the owner signs (2026-09-24); "against the venue vault" was the fork-era settlement.
        detail: `${sold.units.toFixed(6)} ${sold.symbol} at $${sold.price.toFixed(2)}, swapped through Jupiter. You signed it.`,
        amount: `$${sold.usd.toFixed(2)}`,
        kind: 'trade',
        signature: body.signature,
        payload: { orderId, venue: 'venue-vault', slot: sold.slot, side: 'sell' },
      },
      client,
    );
    return false;
  });
  return c.json({
    status: 'filled',
    duplicate,
    orderId,
    symbol: sold.symbol,
    units: sold.units,
    usd: sold.usd,
    price: sold.price,
    venue: 'venue-vault',
    signature: body.signature,
    slot: sold.slot,
    explorer: explorerTx(body.signature),
  });
});
