/**
 * Decision gate for autonomous trades — PLAN.md §8.6.
 *
 * Verifies on-chain SPL delegation and limits, executes through guardAndSpend,
 * arms exits, and dispatches notifications.
 */
import { runAutonomousCycle, evaluateBestSetup, type CandidateSetup, type AutonomousTradeResult } from './autonomous.js';

export async function decideAndExecute(
  walletId: string,
  options: {
    fixedUsd?: number;
    setup?: CandidateSetup;
  } = {},
): Promise<AutonomousTradeResult> {
  return await runAutonomousCycle(walletId, options);
}
