/**
 * The Graph — the agent's source of truth about what has actually happened on-chain.
 *
 * The prize requires The Graph to be LOAD-BEARING: "reasoning, decisions, automation, not just
 * printing a raw query result." So this is not a history feed for a screen. The bot queries it
 * before it acts, and the answers change what it does:
 *
 *   - it will not re-ship a book it can see is already open,
 *   - it sizes a trade against spend the CHAIN recorded, not against our own database,
 *   - it backs off a book whose realised flow is one-sided, because that is what being run over
 *     by an informed trader looks like from the outside.
 *
 * Reading our own Postgres for any of that would be circular: our database records what we
 * INTENDED. The subgraph records what settled.
 */
import 'dotenv/config';

const ENDPOINT =
  process.env.SUBGRAPH_URL ?? 'https://api.studio.thegraph.com/query/1758741/xorr/v0.0.2';

/**
 * The contract this index is about.
 *
 * A subgraph indexes one address on one network. Running the executor against a Base mainnet fork
 * while the index still describes the Sepolia deployment produced a decision that read as
 * authoritative and was about a different contract entirely — it reported a $1,600 cap for a
 * wallet that had no policy on the fork at all.
 *
 * So the index is only consulted when it is describing the contract we are actually spending
 * through. When it is not, `indexesThisDeployment()` is false, the agent says so, and the contract
 * itself remains the authority — which it always was.
 */
/*
 * The contract the subgraph indexes, as the deployment states it — never a default.
 *
 * This defaulted to the first Sepolia delegation, `0xb14C…0a4e`. When the contract was redeployed and the
 * subgraph moved to `0x6c55…540e` (PLAN.md 1.5) the variable was never set, so every executor compared its
 * live contract with the stale default, decided the index was about another deployment, and the Graph
 * decision stood aside on every run. The `/health` subgraph probe found it (2.11). An address that goes stale
 * in code is worse than one plainly missing: unset now reads as unknown, and says so.
 */
const INDEXED_DELEGATION = (process.env.SUBGRAPH_DELEGATION_ADDRESS ?? '').toLowerCase();

/** What the index is, for a screen that has to say whether it applies here. */
export function indexDescription(): {
  endpoint: string;
  indexedDelegation: string;
  activeDelegation: string;
  indexesThisDeployment: boolean;
} {
  return {
    endpoint: ENDPOINT,
    indexedDelegation: INDEXED_DELEGATION,
    activeDelegation: (process.env.DELEGATION_ADDRESS ?? '').toLowerCase(),
    indexesThisDeployment: indexesThisDeployment(),
  };
}

export function indexesThisDeployment(): boolean {
  const active = (process.env.DELEGATION_ADDRESS ?? '').toLowerCase();
  return active.length > 0 && INDEXED_DELEGATION.length > 0 && active === INDEXED_DELEGATION;
}

export type Policy = {
  id: string;
  owner: string;
  delegate: string;
  dailyCap: string;
  expiresAt: string;
  revoked: boolean;
  totalSpent: string;
};

export type Spend = {
  id: string;
  amount: string;
  spentToday: string;
  venue: string;
  token: string;
  txHash: string;
  timestamp: string;
};

export type DailySpend = { day: string; total: string; tradeCount: number };

export class SubgraphUnavailable extends Error {
  constructor(detail: string) {
    super(`The Graph is unreachable: ${detail}`);
    this.name = 'SubgraphUnavailable';
  }
}

/**
 * How long a subgraph query may take (PLAN.md 2.13).
 *
 * `fetch` had no deadline, so a gateway that accepted the connection and never answered held the run
 * that asked — and the scheduler tick behind it — open indefinitely. A timeout is the same fact as any
 * other unreachable index, and says so in the same error.
 */
let timeoutMs = 5_000;

/** Testing only. */
export function setSubgraphTimeoutForTests(ms: number): void {
  timeoutMs = ms;
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const unreachable = (e: unknown) => {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return new SubgraphUnavailable(timedOut ? `no answer in ${timeoutMs}ms` : e instanceof Error ? e.message : String(e));
  };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.GRAPH_API_KEY
        ? { authorization: `Bearer ${process.env.GRAPH_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((e: unknown) => {
    throw unreachable(e);
  });
  if (!res.ok) throw new SubgraphUnavailable(`${res.status}`);
  /*
   * The deadline covers the body too, and says so in the same words.
   *
   * A gateway that sends its headers and then goes quiet aborted the body read with a bare `TimeoutError`, which is not
   * `SubgraphUnavailable` — so `/graph/decision` answered the one outage this error exists to name with an unnamed 502.
   */
  const json = (await res.json().catch((e: unknown) => {
    throw unreachable(e);
  })) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new SubgraphUnavailable(json.errors[0]!.message);
  if (!json.data) throw new SubgraphUnavailable('no data');
  return json.data;
}

export function unitsToUsd(units: string, decimals = 6): number {
  return Number(units) / 10 ** decimals;
}

export async function health(): Promise<{ block: number; healthy: boolean }> {
  const d = await gql<{ _meta: { block: { number: number }; hasIndexingErrors: boolean } }>(
    `{ _meta { block { number } hasIndexingErrors } }`,
  );
  return { block: d._meta.block.number, healthy: !d._meta.hasIndexingErrors };
}

export async function policyFor(owner: string): Promise<Policy | null> {
  const d = await gql<{ policy: Policy | null }>(
    `query P($id: ID!) { policy(id: $id) { id owner delegate dailyCap expiresAt revoked totalSpent } }`,
    { id: owner.toLowerCase() },
  );
  return d.policy;
}

/**
 * Any policy the index currently considers live — not revoked, not expired.
 *
 * For tests that need a permitted owner to reason about. Hardcoding one made the suite depend on
 * a grant staying unexpired forever: `decide` began answering "The permission has expired", which
 * is the CORRECT answer, and two live tests reported it as a defect in the agent.
 *
 * Asking the index for a live one instead keeps the test as real as it was — same subgraph, same
 * indexed chain data — and lets it stay true as grants come and go.
 */
export async function anyLivePolicy(): Promise<Policy | null> {
  const d = await gql<{ policies: Policy[] }>(
    `query L($now: BigInt!) {
      policies(
        where: { revoked: false, expiresAt_gt: $now }
        orderBy: expiresAt
        orderDirection: desc
        first: 1
      ) { id owner delegate dailyCap expiresAt revoked totalSpent }
    }`,
    { now: String(Math.floor(Date.now() / 1000)) },
  );
  return d.policies[0] ?? null;
}

export async function spendsFor(owner: string, first = 100): Promise<Spend[]> {
  const d = await gql<{ spends: Spend[] }>(
    `query S($owner: Bytes!, $first: Int!) {
      spends(where: { owner: $owner }, orderBy: timestamp, orderDirection: desc, first: $first) {
        id amount spentToday venue token txHash timestamp
      }
    }`,
    { owner: owner.toLowerCase(), first },
  );
  return d.spends;
}

export async function dailySpendFor(owner: string, first = 14): Promise<DailySpend[]> {
  const d = await gql<{ dailySpends: DailySpend[] }>(
    `query D($owner: Bytes!, $first: Int!) {
      dailySpends(where: { owner: $owner }, orderBy: day, orderDirection: desc, first: $first) {
        day total tradeCount
      }
    }`,
    { owner: owner.toLowerCase(), first },
  );
  return d.dailySpends;
}
