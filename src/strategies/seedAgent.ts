/**
 * Turning a strategy from the research book into an agent you can hire.
 *
 * The book holds 313 measured strategies; this app hires agents that follow one of four fixed
 * personas. Those do not map onto each other, and pretending they do would be the dishonest part of
 * this feature — a screen that silently picked "Momentum Scout" for a mean-reversion strategy is
 * worse than one that asks.
 *
 * So this fills in what the measurements actually support and RECOMMENDS the rest with its reason
 * written out. The name and the role come from the research. The persona is a recommendation the
 * person can change before anything is created. And the risk limits are deliberately left unset:
 * the research sized every position at $1,000, which is not anybody's daily cap here, and carrying
 * that number across as though it were a limit somebody chose would be inventing a decision.
 */
import type { StrategyDetail } from '@/data/strategyLibrary';

export type PersonaId = 'momentum-scout' | 'earnings-desk' | 'yield-keeper' | 'drawdown-guard';

export type AgentSeed = {
  /** `POST /agents/custom` caps this at 24 characters. */
  name: string;
  /** What it is, in the 80 characters that route allows. Measured, never adjectival. */
  role: string;
  style: PersonaId;
  /** Why that persona, in the screen's words, so the recommendation can be argued with. */
  why: string;
};

const NAME_MAX = 24;
const ROLE_MAX = 80;

/** Trim to a limit without cutting mid-word where it can be helped. */
function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trim();
}

/**
 * Which of the four to suggest, and why.
 *
 * One rule, from one measurement: a strategy whose worst peak-to-trough drop was deeper than
 * everything it made is a strategy whose problem is the drawdown, so it is handed to the agent
 * whose whole job is cutting risk when the book bleeds. Everything else goes to the breakout
 * persona, which is the only one of the four that enters on its own read of price.
 *
 * `earnings-desk` and `yield-keeper` are never suggested: nothing in this book trades an earnings
 * calendar, and none of it is a cash-management rule. Recommending either would be a label, not a
 * finding.
 */
function recommend(s: StrategyDetail): { style: PersonaId; why: string } {
  const o = s.portfolio.outOfSample;
  const ret = o.returnPct;
  const dd = o.maxDdPct;
  if (ret !== null && dd !== null && dd > Math.abs(ret)) {
    return {
      style: 'drawdown-guard',
      why: `Out of sample it drew down ${dd.toFixed(2)}% against a ${ret.toFixed(2)}% return — it fell further than it made, so Drawdown Guard, whose job is cutting risk when the book bleeds.`,
    };
  }
  return {
    style: 'momentum-scout',
    why:
      ret === null || dd === null
        ? 'The book did not record enough of this one to argue for a particular persona, so Momentum Scout — the only one of the four that enters on its own read of price.'
        : `It returned ${ret.toFixed(2)}% out of sample against a ${dd.toFixed(2)}% drawdown, so Momentum Scout, the one of the four that enters on its own read of price.`,
  };
}

/**
 * The seed, or null when the strategy has nothing measured to build a role from.
 *
 * `taken` is every name already on the wallet, lowercased — the route rejects a duplicate, and an
 * agent named after a strategy you already hired is the likeliest collision there is.
 */
export function seedFromStrategy(s: StrategyDetail, taken: string[] = []): AgentSeed {
  const o = s.portfolio.outOfSample;
  const { style, why } = recommend(s);

  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  let name = fit(s.name, NAME_MAX);
  if (used.has(name.toLowerCase())) {
    for (let n = 2; n < 50; n += 1) {
      const candidate = `${fit(s.name, NAME_MAX - 3)} ${n}`;
      if (!used.has(candidate.toLowerCase())) {
        name = candidate;
        break;
      }
    }
  }

  /* The role is the measurement, not a description of the idea: what it did is what it is. */
  const bits: string[] = [];
  if (o.winRate !== null && o.winRate !== undefined) bits.push(`${o.winRate.toFixed(0)}% win rate`);
  if (o.profitFactor !== null && o.profitFactor !== undefined) bits.push(`${o.profitFactor.toFixed(2)} profit factor`);
  if (o.trades !== null && o.trades !== undefined) bits.push(`${o.trades} trades`);
  const measured = bits.length > 0 ? bits.join(', ') : 'measured out of sample';
  const role = fit(
    s.survives ? `Survived the gauntlet: ${measured}` : `Cut by the gauntlet: ${measured}`,
    ROLE_MAX,
  );

  return { name, role, style, why };
}
