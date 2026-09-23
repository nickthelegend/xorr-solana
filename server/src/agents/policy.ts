/**
 * What an owner allows each agent to do (2026-09-23).
 *
 * The permission the owner signed bounds the bot as a whole: a daily cap, an end date, the chain's allowance. Inside it,
 * each agent carries its own policy, and the executor holds the agent to it on every entry it makes on its own:
 *
 *   - `maxUsdPerTrade`  the most one entry may be
 *   - `maxUsdPerDay`    the most its entries may add up to in a UTC day
 *   - `symbols`         the only stocks it may buy; absent means every one this deployment settles
 *   - `allowOffHours`   whether it may enter while Nasdaq is shut — when the pool drifts from the share behind it
 *   - `maxLossPct`      the furthest its stop may sit below the fill; a looser stop it would set is tightened to this
 *
 * Every field only narrows. A policy cannot raise the daily cap, lengthen the grant or reach an account the owner did
 * not approve, because none of those are read from here.
 */
import { z } from 'zod';

export const AgentPolicySchema = z
  .object({
    maxUsdPerTrade: z.number().positive().optional(),
    maxUsdPerDay: z.number().positive().optional(),
    symbols: z.array(z.string().min(1).max(20)).max(40).optional(),
    allowOffHours: z.boolean().optional(),
    maxLossPct: z.number().min(0.5).max(50).optional(),
  })
  .strict();

export type AgentPolicy = z.infer<typeof AgentPolicySchema>;

/** The stored JSON, read leniently: a field that does not parse is a field that is not set. */
export function policyOf(raw: Record<string, unknown> | null | undefined): AgentPolicy {
  const parsed = AgentPolicySchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  const out: AgentPolicy = {};
  const r = raw ?? {};
  const pos = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
  out.maxUsdPerTrade = pos(r.maxUsdPerTrade);
  out.maxUsdPerDay = pos(r.maxUsdPerDay);
  if (Array.isArray(r.symbols)) out.symbols = r.symbols.filter((s): s is string => typeof s === 'string');
  if (typeof r.allowOffHours === 'boolean') out.allowOffHours = r.allowOffHours;
  out.maxLossPct = pos(r.maxLossPct);
  return out;
}

/** Whether the policy lets this agent buy `symbol` at all. */
export function allowsSymbol(policy: AgentPolicy, symbol: string): boolean {
  return !policy.symbols || policy.symbols.length === 0 || policy.symbols.some((s) => s.toUpperCase() === symbol.toUpperCase());
}

/** The stop the agent actually sets: its own, or the policy's, whichever is tighter. */
export function policyStop(policy: AgentPolicy, fill: number, stop: number): number {
  if (!policy.maxLossPct || !(fill > 0)) return stop;
  return Math.max(stop, fill * (1 - policy.maxLossPct / 100));
}

/**
 * The size an entry may be under the policy, given what the agent has already placed today — or the reason it may
 * place nothing. `wanted` is what the agent's risk profile would have taken.
 */
export function policySize(
  policy: AgentPolicy,
  name: string,
  wanted: number,
  spentToday: number,
): { usd: number } | { refused: string } {
  let usd = wanted;
  if (policy.maxUsdPerTrade) usd = Math.min(usd, policy.maxUsdPerTrade);
  if (policy.maxUsdPerDay) {
    const left = policy.maxUsdPerDay - spentToday;
    if (left < 1) return { refused: `${name} has placed $${spentToday.toFixed(2)} today, its limit of $${policy.maxUsdPerDay.toFixed(2)} a day.` };
    usd = Math.min(usd, left);
  }
  return { usd: Math.floor(usd * 100) / 100 };
}
