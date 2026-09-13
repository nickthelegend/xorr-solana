/**
 * "Withdraw everything", wired to the executor and to the owner's own wallet (PLAN.md 4.9).
 *
 * The order, the checks on what gets signed and where it stops are `withdrawEverything.ts`. This holds
 * each step's state for the screen and hands the sequence the real calls: the executor's routes, and
 * the same `sendTransaction` the grant and a single send are signed with.
 */
import { useCallback, useState } from 'react';
import type { Address } from 'viem';
import { useAuth } from '@/auth/useAuth';
import { useGrantDelegation } from '@/auth/useGrantDelegation';
import { withdrawals } from '@/data/withdrawals';
import { initialSteps, withdrawEverything, type Step } from './withdrawEverything';

export function useWithdrawEverything() {
  const { sendTransaction } = useGrantDelegation();
  // The address the wallet itself reports, which is what every call it signs has to pay back to.
  const { address } = useAuth();
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [running, setRunning] = useState(false);
  /** Undefined until a run has ended; then whether all three steps finished. */
  const [finished, setFinished] = useState<boolean>();

  const run = useCallback(
    async (destination: { address: string; label: string }) => {
      if (!address) throw new Error('No wallet yet. Finish sign-in first.');
      setRunning(true);
      setFinished(undefined);
      setSteps(initialSteps());
      try {
        const out = await withdrawEverything(
          {
            owner: address as Address,
            destination,
            sellPreview: withdrawals.sellPreview,
            close: withdrawals.close,
            aavePosition: withdrawals.aavePosition,
            aaveWithdrawCall: withdrawals.aaveWithdrawCall,
            prepareAll: withdrawals.prepareAll,
            sign: sendTransaction,
            record: withdrawals.record,
          },
          setSteps,
        );
        setFinished(out.ok);
        return out;
      } finally {
        setRunning(false);
      }
    },
    [address, sendTransaction],
  );

  return { steps, running, finished, run };
}
