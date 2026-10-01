/**
 * A receipt for every trade that actually settled, and nothing else.
 *
 * Two exports already exist and neither is this one. `exportTrail` is the audit trail — every row,
 * including the runs that were blocked, the ones with nothing to do and the strategies someone
 * paused — which is exactly right for a compliance artifact and wrong for "show me what I bought".
 * `/pnl/disposals.csv` is the tax document: sales only, with cost basis, and no purchases at all.
 *
 * This is the third question: what moved, when, at what price, and on which transaction. The answer
 * has to be narrower than either of the other two, because a receipt for something that did not
 * happen is not a weaker receipt — it is a false one.
 *
 * ## What counts as a real recorded fill
 *
 * A `strategy_runs` row that reached `filled` AND carries a signature — or, for a trade that was not
 * a strategy run, the audit trail's signed `trade` row (see `FILLS_SQL`). Both halves matter:
 *
 *   - `status = 'filled'` excludes `pending`, `failed`, `blocked` and `skipped`. A blocked run is a
 *     real and important record — it is the moment a cap did its job — and it belongs on the audit
 *     trail, not on a receipt, because nothing moved.
 *   - `signature IS NOT NULL` excludes anything the executor believed it filled but cannot point at
 *     a transaction for. There should be none; if there ever is, leaving it out of a receipt and
 *     visible on the trail is the safe direction to be wrong in.
 *
 * A run whose units or price the executor did not measure is still INCLUDED, with those cells
 * empty. It settled, the signature proves it, and dropping it would understate what happened —
 * the same reasoning `/pnl/disposals.csv` gives for keeping a disposal with no recorded basis.
 */

/** One settled fill, as the executor recorded it. Every field is read, none is derived. */
export type FillRow = {
  /** The run's own id, or `audit-<seq>` for a trade that was not a run, so a row in the file can be found again in the trail. */
  runId: string;
  /** When it finished, not when it was claimed. */
  at: Date;
  symbol: string;
  /** `buy`, `sell` or `supply`. Null on a row written before the column existed (migration 016). */
  side: string | null;
  /** What the strategy is called, for a human reading the file. */
  strategy: string;
  /** Units filled, as measured. Null when the executor could not measure them. */
  units: string | null;
  /** The price each, as measured. Null for the same reason. */
  price: string | null;
  /** What it cost, or what the sale was worth. */
  usd: string | null;
  /** Where it actually filled. `venue-vault` is not a Jupiter swap and the file must not say it is. */
  venue: string | null;
  /** The on-chain transaction. This is what makes the row a receipt rather than a claim. */
  signature: string;
};

/**
 * The SQL for the rows above, as one string so the route and its test cannot disagree about it.
 *
 * Two sources, because two kinds of trade settle here (2026-10-01).
 *
 *   - A scheduled strategy's run. Scoped to the caller's wallet through the strategy that owns it —
 *     `strategy_runs` has no `wallet_id` of its own, and joining is what keeps one account's receipts
 *     out of another's file.
 *   - Everything else that settled: an autonomous agent's entry, the owner's own buy or sale on the
 *     ticket, a stop or a target firing, a close. None of those is a strategy run. Each writes one
 *     `trade` row to the audit trail with the transaction's signature, and that row is the record.
 *     Before this the file read runs alone, so a wallet whose every trade was an agent's or the
 *     owner's got "no settled fills recorded" beside an Activity list of ten signed trades.
 *
 * From the trail only a row that says it bought or sold something AND carries a signature counts — a
 * deposit, a send to an allowlisted address or a blocked attempt is not a fill. A trail row whose
 * signature a run already accounts for is left out, so a strategy's fill is never on the file twice.
 *
 * Units, price and dollars come from the row's payload where the writer put them there, and otherwise
 * from the figures the same writer printed into the row's detail and amount ("0.104 AAPLx at $252.30",
 * "$26.24"). Where neither has a figure the cell stays empty, as for a run that was not measured.
 *
 * The venue is read from the detail first. The owner's sale on the ticket became a Jupiter swap the owner signs on
 * 2026-09-24 and its detail says so, but its payload kept the fork-era `venue-vault` until 2026-10-01; the trail is
 * append-only, so those rows cannot be corrected, and the file must not call a Jupiter swap a vault settlement.
 */
export const FILLS_SQL = `
  WITH runs AS (
  SELECT r.id            AS "runId",
         r.finished_at   AS at,
         s.symbol        AS symbol,
         r.side          AS side,
         s.label         AS strategy,
         r.units::text   AS units,
         r.price::text   AS price,
         r.usd::text     AS usd,
         r.venue         AS venue,
         r.signature     AS signature
    FROM strategy_runs r
    JOIN strategies s ON s.id = r.strategy_id
   WHERE s.wallet_id = $1
     AND r.status = 'filled'
     AND r.signature IS NOT NULL
     AND r.finished_at IS NOT NULL
  ),
  trail AS (
  SELECT 'audit-' || a.seq AS "runId",
         a.at            AS at,
         COALESCE(a.payload->>'symbol', substring(a.action from '^(?:Bought|Sold)(?: all)? ([^ ]+)')) AS symbol,
         COALESCE(a.payload->>'side', CASE WHEN a.action LIKE 'Sold %' THEN 'sell' ELSE 'buy' END) AS side,
         a.agent         AS strategy,
         COALESCE(a.payload->>'units', substring(a.detail from '([0-9]+[.][0-9]+) [^ ]+ (?:at|for) ')) AS units,
         COALESCE(a.payload->>'price', substring(a.detail from ' at [$]([0-9]+(?:[.][0-9]+)?)')) AS price,
         COALESCE(a.payload->>'usd',
                  NULLIF(replace(substring(a.amount from '[$]([0-9.,]+)'), ',', ''), ''),
                  substring(a.detail from ' for [$]([0-9]+(?:[.][0-9]+)?)')) AS usd,
         CASE WHEN a.detail LIKE '%through Jupiter%' THEN 'jupiter-route'
              WHEN a.detail LIKE '%through the venue vault%' THEN 'venue-vault'
              ELSE a.payload->>'venue' END AS venue,
         a.signature     AS signature
    FROM audit_log a
   WHERE a.wallet_id = $1
     AND a.kind = 'trade'
     AND a.signature IS NOT NULL
     AND (a.action LIKE 'Bought %' OR a.action LIKE 'Sold %')
     AND NOT EXISTS (SELECT 1 FROM runs WHERE runs.signature = a.signature)
  )
  SELECT * FROM runs
  UNION ALL
  SELECT * FROM trail
   ORDER BY at ASC`;

const COLUMNS = [
  'date',
  'symbol',
  'side',
  'units',
  'price_usd',
  'usd',
  'venue',
  'strategy',
  'signature',
  'run_id',
] as const;

/**
 * A cell, escaped for CSV.
 *
 * A strategy's label is user-written and can contain a comma, a quote or a newline — "Weekly WETH,
 * big" would otherwise shift every column after it by one and silently corrupt the file for
 * whoever opened it next. Null becomes empty, never the string "null" and never a zero: an
 * unmeasured quantity is blank, and a blank cell is the only honest way to write "not recorded".
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The file.
 *
 * No total row. Buys and sales are different signs of different things and a column that added them
 * together would be a number with no meaning — `/pnl/disposals.csv` totals because every row there
 * is a realised gain, which is one quantity.
 */
export function fillsCsv(rows: readonly FillRow[]): string {
  const header = COLUMNS.join(',');
  const body = rows.map((r) =>
    [
      csvCell(r.at),
      csvCell(r.symbol),
      csvCell(r.side),
      csvCell(r.units),
      csvCell(r.price),
      csvCell(r.usd),
      csvCell(r.venue),
      csvCell(r.strategy),
      csvCell(r.signature),
      csvCell(r.runId),
    ].join(','),
  );

  /*
   * An empty file says so in words.
   *
   * A header row on its own is indistinguishable from an export that failed, and someone who has
   * genuinely never had a fill is entitled to know that is what they are looking at.
   */
  if (rows.length === 0) return `${header}\n# no settled fills recorded`;
  return `${header}\n${body.join('\n')}`;
}
