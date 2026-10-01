/**
 * What one agent's page does and reads, shared by the phone screen and the desktop page (2026-10-01).
 *
 * `app/agent/[id].tsx` held these inline. The desktop layout of the same page draws them differently but must do exactly
 * the same thing — the same hire call, the same look-now call, the same answer to "which strategies are this agent's" —
 * so they live here, once, and both layouts call them. A second copy would be the one that drifts.
 */
import { useState } from 'react';
import { repos } from '@/data';
import { system, type AgentLookOutcome, type AgentPolicy } from '@/data/system';
import { errorText } from '@/data/apiError';
import type { Agent, Strategy, StrategyKind } from '@/data/types';
import { CHAT_AGENTS } from '@/chat/agents';

/**
 * The strategy kind each agent's mandate covers.
 *
 * Strategies are not tagged by agent in the data, so this reads the strategy kind each agent's mandate covers —
 * breakouts for Momentum Scout, earnings events for Earnings Desk, idle cash for Yield Keeper, exits for Drawdown
 * Guard. The mapping is the mandate, written down; it attributes no run to anyone.
 */
export const MANDATE_KINDS: Readonly<Record<string, readonly StrategyKind[]>> = {
  'Momentum Scout': ['momentum'],
  'Earnings Desk': ['event-driven'],
  'Yield Keeper': ['yield-rotation'],
  'Drawdown Guard': ['exit-rules'],
};

export const STATE_LABEL: Readonly<Record<string, string>> = {
  live: 'Live',
  watch: 'Watching',
  paused: 'Paused',
  draft: 'Draft',
  ended: 'Ended',
};

/** The strategy kinds this agent's mandate covers. An agent someone made runs the kind the one it works like does. */
export function agentKinds(agent: Agent | undefined): readonly StrategyKind[] {
  const mandateOf = agent?.custom ? CHAT_AGENTS.find((a) => a.id === agent.style)?.name : agent?.name;
  return mandateOf ? (MANDATE_KINDS[mandateOf] ?? []) : [];
}

/**
 * The strategies that are this agent's.
 *
 * An exit an agent armed on its own entry is that agent's, whatever the kind mandate says (2026-09-23): Momentum Scout
 * read "Nothing running yet" beside ten trades and five live exits, which were drawn under Drawdown Guard — an agent
 * nobody had hired. `params.armedBy` is the executor's record of who armed it; the kind mapping decides the rest.
 */
export function agentStrategiesOf(agent: Agent | undefined, strategies: readonly Strategy[]): Strategy[] {
  const kinds = agentKinds(agent);
  return strategies.filter((s) => {
    if (s.state === 'ended') return false;
    if (agent?.custom) return s.agentId === agent.id;
    const armedBy = typeof s.params?.armedBy === 'string' ? s.params.armedBy : undefined;
    return armedBy ? armedBy === agent?.name : kinds.includes(s.kind);
  });
}

/** An agent's rules, in words. Empty when it has none of its own. */
export function policyLines(policy: AgentPolicy): string[] {
  return [
    policy.maxUsdPerTrade ? `Up to $${policy.maxUsdPerTrade} a trade` : null,
    policy.maxUsdPerDay ? `Up to $${policy.maxUsdPerDay} a day` : null,
    policy.symbols?.length ? `Only ${policy.symbols.join(', ')}` : null,
    policy.allowOffHours === false ? 'Only while Nasdaq is open' : null,
    policy.maxLossPct ? `Stop no more than ${policy.maxLossPct}% under the fill` : null,
  ].filter((l): l is string => l !== null);
}

/**
 * Hire this agent: the server's call, then a reload of the roster the caller reads it from.
 *
 * `justHired` is a hire that went through ON THIS VISIT, for the orb's `filled` beat. Not `agent.hired`: that is true
 * for every visit afterwards, and an orb that pops every time the page opens is celebrating something that happened
 * last week. The beat belongs to the moment it lands.
 */
export function useHireAgent(agent: Agent | undefined, reload: () => void) {
  const [hiring, setHiring] = useState(false);
  const [hireError, setHireError] = useState<string>();
  const [justHired, setJustHired] = useState(false);

  const hire = async () => {
    if (!agent) return;
    setHiring(true);
    setHireError(undefined);
    try {
      await repos.bot.hire(agent.personaId ?? agent.id);
      setJustHired(true);
      reload();
    } catch (e) {
      /*
       * The server's sentence, under the button that asked.
       *
       * There was no catch: a refused hire stopped the spinner and changed nothing else, which reads
       * as a hire that went through — until the chip still says NOT HIRED.
       */
      setHireError(errorText(e));
    } finally {
      setHiring(false);
    }
  };

  return { hire, hiring, hireError, justHired };
}

/**
 * Ask it to look now (2026-09-23): the sweep's own cycle for this agent alone, through every gate. What comes back is
 * either the fill — symbol, size, price, where it filled, the transaction — or the reason it took nothing.
 */
export function useLookNow(agentId: string) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<AgentLookOutcome>();
  const [error, setError] = useState<string>();
  async function look() {
    setBusy(true);
    setError(undefined);
    setOut(undefined);
    try {
      setOut(await system.agentLook(agentId));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return { look, busy, out, error };
}
