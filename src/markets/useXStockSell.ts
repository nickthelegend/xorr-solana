/**
 * Selling an xStock, signed by the owner (2026-09-19) — the ticket's Sell and a position's Close share this one path.
 *
 * The executor builds one transaction (the owner's shares into the venue vault, the vault's USDC to the owner at
 * Jupiter's live quote) and co-signs its leg; the owner signs theirs in Privy and it is broadcast here; the executor then
 * reads it back from the chain before booking it. A refusal at either end comes back as `blocked` with its sentence.
 */
import { useCallback, useState } from 'react';
import { Transaction } from '@solana/web3.js';
import { system, type XStockSellOutcome } from '@/data/system';
import { useSolanaSigner } from '@/wallet/solanaSigner';

export function useXStockSell() {
  const signer = useSolanaSigner();
  const [selling, setSelling] = useState(false);

  const sell = useCallback(
    async (symbol: string, units: number): Promise<XStockSellOutcome> => {
      setSelling(true);
      try {
        const prepared = await system.xstockSellPrepare({ symbol, units: Number(units.toFixed(8)) });
        if ('status' in prepared) return prepared;
        const tx = Transaction.from(Buffer.from(prepared.transaction, 'base64'));
        const signature = await signer.signAndSend(tx, {
          blockhash: prepared.blockhash,
          lastValidBlockHeight: prepared.lastValidBlockHeight,
        });
        return await system.xstockSellRecord({ symbol, signature });
      } finally {
        setSelling(false);
      }
    },
    [signer],
  );

  return { sell, selling, ready: signer.ready };
}
