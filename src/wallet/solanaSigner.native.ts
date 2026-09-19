/**
 * The person's own signature on a Solana transaction — iOS and Android (2026-09-19). See `solanaSigner.web.ts`.
 *
 * Privy's Expo SDK keeps the embedded Solana wallet in its secure enclave flow; its provider signs a web3.js
 * `Transaction` and hands it back signed. The app broadcasts it to the cluster this build settles on.
 */
import { useCallback } from 'react';
import { PublicKey, type Transaction } from '@solana/web3.js';
import { useEmbeddedSolanaWallet } from '@privy-io/expo';
import { broadcastSigned, prepareForSigning, solanaConnection } from './solanaTx';

export type SolanaSigner = {
  address?: string;
  ready: boolean;
  signAndSend: (tx: Transaction) => Promise<string>;
};

export function useSolanaSigner(): SolanaSigner {
  const solana = useEmbeddedSolanaWallet();
  const wallet = solana.wallets?.[0];
  const address = wallet?.address;

  const signAndSend = useCallback(
    async (tx: Transaction) => {
      if (!wallet || !address) throw new Error('Your wallet is not ready yet. Give it a moment.');
      const conn = solanaConnection();
      const prepared = await prepareForSigning(conn, tx, new PublicKey(address));
      const provider = await wallet.getProvider();
      const { signedTransaction } = await provider.request({ method: 'signTransaction', params: { transaction: tx } });
      return broadcastSigned(conn, new Uint8Array(signedTransaction.serialize()), prepared);
    },
    [wallet, address],
  );

  return { address, ready: solana.status === 'connected' && !!wallet, signAndSend };
}
