/**
 * Leaderboard — PLAN.md 12.23, closing [G33].
 *
 * The handoff shipped four agents with hardcoded pnl30d / win / trades. This computes all three
 * from the REAL trade record: filled runs valued at the current price against what was paid.
 *
 * An agent with no trades gets zeros and says so, rather than borrowing a flattering number.
 */
import { PERSONAS } from '../bot/personas.js';
import { XSTOCKS, xStockKey, xStockPriceUsd } from '../venues/xstocks.js';
import { query } from '../db/index.js';
import { THIS_CHAIN } from '../db/chain-scope.js';
import { priceOf } from '../market/prices.js';
import { personaForKind } from './attribution.js';

/**
 * `AGENT_DECISION` in `bot/autonomous.ts`, the decision an autonomous entry's proposal is written with (2026-09-26).
 * Restated rather than imported: that module pulls the whole executor and the Solana client in with it.
 */
const AGENT_DECISION = 'approve';

export type LeaderboardRow = {
  id: string;
  name: string;
  role: string;
  metric: string;
  pnl30d: number;
  win: number;
  trades: number;
  c1: string;
  c2: string;
};

/** One agent's record over the window, whoever the agent is — one of the four or one a person made. */
export type AgentRecord = Pick<LeaderboardRow, 'pnl30d' | 'win' | 'trades' | 'metric'>;

/** No trades means no record. Saying "no trades yet" is honest; a win rate is not. */
export const NO_TRADES: AgentRecord = { pnl30d: 0, win: 0, trades: 0, metric: 'No trades yet' };

const AGENTS = [
  { id: 'momentum-scout', name: 'Momentum Scout', role: PERSONAS['momentum-scout'].role, c1: '#5B93FF', c2: '#1B44CE' },
  { id: 'earnings-desk', name: 'Earnings Desk', role: PERSONAS['earnings-desk'].role, c1: '#F0BE55', c2: '#C98518' },
  { id: 'yield-keeper', name: 'Yield Keeper', role: PERSONAS['yield-keeper'].role, c1: '#49E39B', c2: '#12A45F' },
  { id: 'drawdown-guard', name: 'Drawdown Guard', role: PERSONAS['drawdown-guard'].role, c1: '#B58CFF', c2: '#7A45E0' },
];

/** One autonomous entry: its proposal, what the wallet still holds of the symbol, and the first sale of it after. */
type AgentEntryRow = {
  agent: string;
  persona: string | null;
  symbol: string;
  usd: string;
  units: string | null;
  price: string | null;
  held_units: string;
  sold_amount: string | null;
};

type RunRow = { kind: string; persona_id: string | null; symbol: string; usd: string; units: string; price: string };

/**
 * Every agent's record on this wallet, by persona id: the four always, and every agent a person made that has traded
 * (`custom:<id>`), credited through the strategies it owns.
 */
export async function agentRecords(walletId: string): Promise<Map<string, AgentRecord>> {
  const runs = await query<RunRow>(
    /*
     * Credited by the rule the trail itself records (PLAN.md 2.2): the agent that owns the strategy
     * when it has one, otherwise the persona that runs its kind (`personaForKind`). It was found by
     * searching the wallet's audit log for each run's id inside JSON — a scan of the trail per run —
     * and a run that search missed was credited to Yield Keeper by default.
     *
     * Buys only (PLAN.md 2.15). A sale's `usd` is what it paid, so valuing it as units at today's mark
     * minus that amount scored every profitable exit as a loss of roughly its own proceeds.
     */
    `SELECT s.kind, ag.persona_id, s.symbol, r.usd, r.units, r.price
     FROM strategy_runs r
     JOIN strategies s ON s.id = r.strategy_id
     LEFT JOIN agents ag ON ag.id = s.agent_id
     WHERE s.wallet_id = $1 AND s.chain = ${THIS_CHAIN}
       AND r.status = 'filled' AND r.side = 'buy' AND r.started_at > now() - interval '30 days'`,
    [walletId],
  );

  /*
   * The autonomous agent's own entries (2026-09-26). Every entry `bot/autonomous.ts` made in the window, open or closed,
   * read from the proposal it writes for each fill (`decision = AGENT_DECISION`, the payload is its `DecisionRecord`:
   * symbol, usd, units, price, persona). It read open `position_sleeves` rows before, so an entry the owner later sold,
   * or one whose sleeve never got booked, left the agent at "0 Trades · $0.00" on the night it had traded twice.
   * The proposal is the one row per entry, so an entry that also has a sleeve is counted once.
   *
   * Still held → units at today's mark less what it paid. Sold since → the first "Sold <symbol>" on the trail after it,
   * when that sale is plausibly this entry's (within half and double what was paid); otherwise marked like a held one.
   */
  const entries = await query<AgentEntryRow>(
    `SELECT p.agent, p.payload->>'persona' AS persona, p.payload->>'symbol' AS symbol,
            p.payload->>'usd' AS usd, p.payload->>'units' AS units, p.payload->>'price' AS price,
            COALESCE(pos.units, 0) AS held_units, sale.amount AS sold_amount
       FROM proposals p
       LEFT JOIN positions pos
         ON pos.wallet_id = p.wallet_id AND pos.chain = ${THIS_CHAIN} AND pos.side = 'long'
        AND pos.symbol = p.payload->>'symbol'
       LEFT JOIN LATERAL (
         SELECT a.amount FROM audit_log a
          WHERE a.wallet_id = p.wallet_id AND a.action = 'Sold ' || (p.payload->>'symbol') AND a.at > p.decided_at
          ORDER BY a.at ASC LIMIT 1
       ) sale ON true
      WHERE p.wallet_id = $1 AND p.decision = $2 AND p.decided_at > now() - interval '30 days'
        AND p.payload ? 'symbol' AND p.payload ? 'usd' AND p.payload ? 'personaName' AND p.payload ? 'signature'`,
    [walletId, AGENT_DECISION],
  ).catch(() => [] as AgentEntryRow[]);
  const personaByName = new Map(AGENTS.map((a) => [a.name, a.id]));
  const personaIds = new Set(AGENTS.map((a) => a.id));

  // One price lookup per symbol, not per run — and all of them at once, not one after another.
  const symbols = [
    ...new Set([...runs.map((r) => r.symbol), ...entries.map((e) => e.symbol).filter(Boolean)]),
  ];
  const marks = new Map<string, number>();
  await Promise.all(
    symbols.map(async (s) => {
      try {
        // A screen, so a short deadline: an unpriced symbol is excluded, not waited for.
        // An xStock is priced where it trades, Jupiter; the feed table has none of them.
        const x = XSTOCKS[xStockKey(s) ?? s];
        const mark = x ? await xStockPriceUsd(x.symbol) : await priceOf(s, 3_000);
        if (mark !== null && mark > 0) marks.set(s, mark);
      } catch {
        // No feed for this symbol — its runs are excluded rather than valued at a guess.
      }
    }),
  );

  const byAgent = new Map<string, { pnl: number; wins: number; trades: number }>();
  for (const r of runs) {
    const mark = marks.get(r.symbol);
    if (mark === undefined) continue;
    // A run no persona ran — a recurring buy, a rebalance — is on nobody's record.
    const agent = r.persona_id ?? personaForKind(r.kind);
    if (!agent) continue;
    const value = Number(r.units) * mark;
    const paid = Number(r.usd);
    const pnl = value - paid;
    const acc = byAgent.get(agent) ?? { pnl: 0, wins: 0, trades: 0 };
    acc.pnl += pnl;
    acc.trades += 1;
    if (pnl > 0) acc.wins += 1;
    byAgent.set(agent, acc);
  }

  // The autonomous entries (2026-09-26). Counted even when unpriced — valued at their own fill then — because the trade
  // happened whether or not a feed answers this minute.
  for (const e of entries) {
    const agent = e.persona && personaIds.has(e.persona) ? e.persona : personaByName.get(e.agent);
    if (!agent || !e.symbol) continue;
    const paid = Number(e.usd);
    const units = Number(e.units);
    if (!Number.isFinite(paid) || paid <= 0) continue;
    const mark = marks.get(e.symbol) ?? (Number(e.price) > 0 ? Number(e.price) : undefined);
    const marked = mark !== undefined && Number.isFinite(units) ? units * mark : paid;
    const proceeds = Number(String(e.sold_amount ?? '').replace(/[^0-9.]/g, ''));
    const held = Number(e.held_units) > 0.000001;
    const realized = !held && proceeds > 0 && proceeds >= paid / 2 && proceeds <= paid * 2;
    const pnl = (realized ? proceeds : marked) - paid;
    const acc = byAgent.get(agent) ?? { pnl: 0, wins: 0, trades: 0 };
    acc.pnl += pnl;
    acc.trades += 1;
    if (pnl > 0) acc.wins += 1;
    byAgent.set(agent, acc);
  }

  const records = new Map<string, AgentRecord>(AGENTS.map((a) => [a.id, NO_TRADES]));
  for (const [agent, acc] of byAgent) {
    const win = acc.trades > 0 ? Math.round((acc.wins / acc.trades) * 100) : 0;
    records.set(agent, {
      pnl30d: Number(acc.pnl.toFixed(2)),
      win,
      trades: acc.trades,
      metric: acc.trades === 0 ? NO_TRADES.metric : `${win}% win rate`,
    });
  }
  return records;
}

/** The four personas, each with its record: the leaderboard's rows. */
export async function leaderboard(walletId: string): Promise<LeaderboardRow[]> {
  const records = await agentRecords(walletId);
  return AGENTS.map((a) => ({ ...a, ...(records.get(a.id) ?? NO_TRADES) }));
}
