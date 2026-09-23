/**
 * Withdraw everything, on Solana (2026-09-19).
 *
 * The Base run sells through the delegation contract, takes USDC out of Aave, and sends — none of which exists here, so
 * the screen crashed on Solana. Here it is the two paths already proven on the fork, one after the other: every xStock
 * sold by the owner's own signed sale (`useXStockSell`), then every USDC sent to the chosen allowlisted address by the
 * owner's signed transfer (`useWithdraw`), which the executor checks against the cooling-off first. There is no savings
 * step: this build has no yield. SOL stays, for network fees.
 */
import { useCallback, useState } from 'react';
import { walletTokens } from '@/data/walletTokens';
import { errorText } from '@/data/apiError';
import { useXStockSell } from '@/markets/useXStockSell';
import { useWithdraw } from './useWithdraw';
import { system } from '@/data/system';
import { useAgentWallet } from '@/agents/useAgentWallet';
import { money } from '@/format';
import type { AllowlistEntry } from './allowlist';
import type { Step } from './withdrawEverything';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function initial(): Step[] {
  return [
    { key: 'sell', title: 'Sell every position', status: 'waiting', lines: [] },
    // Every agent's own wallet, back into the main account first (2026-09-23): "everything" includes what they hold.
    { key: 'agents', title: 'Bring your agents’ USDC home', status: 'waiting', lines: [] },
    { key: 'send', title: 'Send your USDC', status: 'waiting', lines: [] },
  ];
}

export function useWithdrawEverythingSolana() {
  const { sell } = useXStockSell();
  const { withdraw } = useWithdraw();
  const agentWallet = useAgentWallet();
  const [steps, setSteps] = useState<Step[]>(initial);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState<boolean>();

  const run = useCallback(
    async (entry: AllowlistEntry, allowlist: AllowlistEntry[]) => {
      setRunning(true);
      setFinished(undefined);
      let now = initial();
      const update = (key: Step['key'], patch: Partial<Step>, line?: Step['lines'][number]) => {
        now = now.map((s) => (s.key === key ? { ...s, ...patch, lines: line ? [...s.lines, line] : s.lines } : s));
        setSteps(now);
      };
      try {
        update('sell', { status: 'running' });
        const held = (await walletTokens()).tokens.filter(
          (t) => t.address !== USDC_MINT && !('native' in t && t.native) && t.units > 0,
        );
        if (held.length === 0) update('sell', {}, { tone: 'left', text: 'Nothing to sell.' });
        for (const t of held) {
          const res = await sell(t.symbol, t.units);
          if (res.status !== 'filled') {
            update('sell', { status: 'failed', detail: res.message }, { tone: 'failed', text: `${t.symbol}: ${res.message}` });
            setFinished(false);
            return { ok: false };
          }
          update('sell', {}, { tone: 'done', text: `Sold ${res.units.toFixed(4)} ${res.symbol} for $${res.usd.toFixed(2)}`, txHash: res.signature });
        }
        update('sell', { status: 'done' });

        update('agents', { status: 'running' });
        const funded = (await system.agentWallets().catch(() => [])).filter((w) => w.exists && w.usdc > 0);
        if (funded.length === 0) update('agents', {}, { tone: 'left', text: 'No agent holds any USDC.' });
        for (const w of funded) {
          const after = await agentWallet.run('withdraw', w, Math.floor(w.usdc * 100) / 100);
          update('agents', {}, { tone: 'done', text: `${money(-(after.delta ?? 0))} back from ${w.name}`, txHash: after.signature });
        }
        update('agents', { status: 'done' });

        update('send', { status: 'running' });
        const cash = (await walletTokens()).tokens.find((t) => t.address === USDC_MINT)?.units ?? 0;
        if (!(cash > 0)) {
          update('send', { status: 'done' }, { tone: 'left', text: 'No USDC to send.' });
        } else {
          const amount = (Math.floor(cash * 1e6) / 1e6).toFixed(6);
          const hash = await withdraw({ token: { symbol: 'USDC', address: USDC_MINT, decimals: 6 }, entry, allowlist, amount });
          update('send', { status: 'done' }, { tone: 'done', text: `Sent ${amount} USDC to ${entry.label}`, txHash: hash });
        }
        setFinished(true);
        return { ok: true };
      } catch (e) {
        const which = now.find((s) => s.status === 'running')?.key ?? 'send';
        update(which, { status: 'failed', detail: errorText(e) }, { tone: 'failed', text: errorText(e) });
        setFinished(false);
        return { ok: false };
      } finally {
        setRunning(false);
      }
    },
    [sell, withdraw, agentWallet],
  );

  return { steps, running, finished, run };
}
