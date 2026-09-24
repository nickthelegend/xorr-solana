/**
 * Selling an xStock, signed by the owner (2026-09-19) — the ticket's Sell and a position's Close share this one path.
 *
 * The executor builds Jupiter's own swap for the owner's wallet from a live quote (2026-09-24; it was a settlement against
 * the venue vault); the owner signs it in Privy as its only signer and it is broadcast here; the executor then reads it
 * back from the chain before booking it. A refusal at either end comes back as `blocked` with its sentence.
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
