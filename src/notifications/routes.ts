/**
 * The routing half of notifications, split out so it is testable on Node without the native
 * expo-notifications module. PLAN.md 12.19 / 10.10.
 */
export type AlertKind =
  | 'price'
  | 'earnings'
  | 'daily-cap'
  | 'drawdown'
  | 'staking-unlock'
  | 'proposal-awaiting'
  | 'dca-executed'
  | 'strategy-blocked'
  /*
   * The executor's own names for three pushes it sends that the design's list never had: an alert you
   * set went off, a flatten you asked for finished, a withdrawal address was added or removed
   * (`server/src/notifications/push.ts`, `server/src/withdrawals/allowlist.ts`).
   */
  | 'alert-fired'
  | 'panic-flatten'
  | 'allowlist-changed';

/**
 * Which alerts are INTERRUPTIONS the user may mute.
 *
 * All of them but one — because screens.md screen 18 draws the line elsewhere: "Circuit breakers stay
 * on even when notifications are muted. They stop trading, not just your phone." The breaker lives in
 * the server's rule engine and is deliberately not represented in this file.
 *
 * The one is an allowlist change, which the executor sends whatever the settings say and offers no
 * switch for: a new address waits out its cooling-off so that this arrives while it can still be removed.
 */
export const MUTABLE: Record<Exclude<AlertKind, 'allowlist-changed'>, boolean> = {
  price: true,
  earnings: true,
  'daily-cap': true,
  drawdown: true,
  'staking-unlock': true,
  'proposal-awaiting': true,
  'dca-executed': true,
  'strategy-blocked': true,
  'alert-fired': true,
  'panic-flatten': true,
};

export function routeFor(kind: AlertKind): string {
  switch (kind) {
    case 'proposal-awaiting':
      return '/bot';
    case 'dca-executed':
    case 'strategy-blocked':
    case 'panic-flatten':
      return '/activity';
    case 'daily-cap':
    case 'drawdown':
      return '/safety';
    case 'staking-unlock':
      return '/strategies';
    case 'price':
    case 'earnings':
    case 'alert-fired':
      return '/alerts';
    case 'allowlist-changed':
      return '/allowlist';
  }
}

/** One row of the audit trail as `/activity` returns it: the executor's words, not ours. */
export type TrailRow = { action: string; detail: string; kind: string; agent: string };

/**
 * The push an audit row went out with, or null when the row is a record rather than an interruption.
 *
 * The trail holds everything — a strategy created, a run with nothing to do, a watched run that "would
 * have" bought — and the inbox listed all of it as flagged for you, sending whatever it could not place to
 * Alerts. What interrupts is narrower, and the executor says exactly what: a push goes out beside six kinds
 * of row. `/activity` does not carry a row's payload, so the sender's own wording is the evidence, and each
 * rule names the file that writes it.
 */
export function interruptionFor(row: TrailRow): AlertKind | null {
  const { action, detail, kind, agent } = row;
  // executor/run.ts: a proposal waiting for a yes — "Asked before buying WETH".
  if (kind === 'risk' && action.startsWith('Asked before buying ')) return 'proposal-awaiting';
  // executor/run.ts: a run a limit refused — "Skipped WETH".
  if (kind === 'block' && action.startsWith('Skipped ')) return 'strategy-blocked';
  // routes/panic.ts: each leg of a flatten you asked for, or "Nothing to sell". An agent's own close also
  // writes "Sold all WETH", without this sentence, and sends nothing.
  if (detail.includes('You asked to be flattened')) return 'panic-flatten';
  // executor/run.ts: a fill — "Bought 0.1234 WETH", "Sold 0.1234 WETH", units always to four places — or cash moved
  // into savings. Your own close from the order ticket is "Sold 50% of WETH", and sends nothing.
  if ((kind === 'trade' && /^(Bought|Sold) \d+\.\d{4} /.test(action)) || (kind === 'yield' && action.startsWith('Supplied '))) {
    return 'dca-executed';
  }
  // withdrawals/allowlist.ts.
  if (action === 'Withdrawal address added' || action === 'Withdrawal address removed') return 'allowlist-changed';
  // alerts/evaluate.ts: the alert's own name, as Drawdown Guard, filed as risk. The other risk rows that
  // agent writes are a run with nothing to do, a watched run and an empty flatten, all named here.
  if (kind === 'risk' && agent === 'Drawdown Guard' && !/^(Nothing to do for |Would have |Nothing to sell)/.test(action)) {
    return 'alert-fired';
  }
  return null;
}
