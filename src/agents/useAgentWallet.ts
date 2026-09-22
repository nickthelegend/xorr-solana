/**
 * Fund an agent's wallet, or take money back from it — built here, signed by the owner, recorded by the executor from
 * the chain (2026-09-23). See `src/wallet/agentWallet.ts`.
 */
import { useCallback, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { system, type AgentWalletView } from '@/data/system';
import { useSolanaSigner } from '@/wallet/solanaSigner';
import { solanaConnection } from '@/wallet/solanaTx';
import { buildFundAgentTx, buildWithdrawAgentTx } from '@/wallet/agentWallet';

export function useAgentWallet() {
  const signer = useSolanaSigner();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (mode: 'fund' | 'withdraw', wallet: AgentWalletView, usd: number): Promise<AgentWalletView> => {
      if (!signer.address) throw new Error('Your wallet is not connected yet.');
      setBusy(true);
      try {
        const owner = new PublicKey(signer.address);
        const mint = new PublicKey(wallet.mint);
        const tx =
          mode === 'fund'
            ? await buildFundAgentTx({
                conn: solanaConnection(),
                owner,
                agentId: wallet.agentId,
                usd,
                mint,
                delegate: new PublicKey(wallet.delegate),
              })
            : await buildWithdrawAgentTx({ owner, agentId: wallet.agentId, usd, mint });
        const signature = await signer.signAndSend(tx);
        return await system.agentWalletRecord(wallet.agentId, signature);
      } finally {
        setBusy(false);
      }
    },
    [signer],
  );

  return { run, busy, ready: signer.ready };
}
