/**
 * The person's own signature on a Solana transaction — iOS and Android (2026-09-19). See `solanaSigner.web.ts`.
 *
 * Privy's Expo SDK keeps the embedded Solana wallet in its secure enclave flow; its provider signs a web3.js
 * `Transaction` and hands it back signed. The app broadcasts it to the cluster this build settles on.
 */
import { useCallback } from 'react';
import { PublicKey, type Transaction } from '@solana/web3.js';
import { useEmbeddedSolanaWallet } from '@privy-io/expo';
import { isStaleBlockhash, broadcastSigned, prepareForSigning, solanaConnection, type Prepared } from './solanaTx';

export type SolanaSigner = {
  address?: string;
  ready: boolean;
  /** Pass `prepared` for a transaction the executor built and co-signed; see solanaSigner.web.ts. */
  signAndSend: (tx: Transaction, prepared?: Prepared) => Promise<string>;
};

export function useSolanaSigner(): SolanaSigner {
  const solana = useEmbeddedSolanaWallet();
  const wallet = solana.wallets?.[0];
  const address = wallet?.address;

  const signAndSend = useCallback(
    async (tx: Transaction, already?: Prepared) => {
      if (!wallet || !address) throw new Error('Your wallet is not ready yet. Give it a moment.');
      const conn = solanaConnection();
      const once = async () => {
        const prepared = already ?? (await prepareForSigning(conn, tx, new PublicKey(address)));
        const provider = await wallet.getProvider();
        const { signedTransaction } = await provider.request({ method: 'signTransaction', params: { transaction: tx } });
        return broadcastSigned(conn, new Uint8Array(signedTransaction.serialize()), prepared);
      };
      try {
        return await once();
      } catch (e) {
        /* One more go with a fresh blockhash — see the web signer for why. Never for a prepared
         * transaction: that one is the executor's and re-stamping would void its signature. */
        if (already || !isStaleBlockhash(e)) throw e;
        return await once();
      }
    },
    [wallet, address],
  );

  return { address, ready: solana.status === 'connected' && !!wallet, signAndSend };
}
