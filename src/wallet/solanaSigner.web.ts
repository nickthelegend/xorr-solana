/**
 * The person's own signature on a Solana transaction — web (2026-09-19).
 *
 * The user's Privy Solana embedded wallet signs; Privy shows its own confirmation sheet, and the key never leaves
 * Privy's isolated frame. The app prepares the transaction (blockhash, the owner as fee payer), hands Privy the bytes,
 * and broadcasts what comes back to the cluster this build settles on — Privy is not asked to know a fork exists.
 */
import { useCallback } from 'react';
import { PublicKey, type Transaction } from '@solana/web3.js';
import { useSignTransaction, useWallets } from '@privy-io/react-auth/solana';
import { useAuth } from '@/auth/useAuth';
import { broadcastSigned, prepareForSigning, solanaConnection, unsignedBytes } from './solanaTx';

export type SolanaSigner = {
  /** The owner's base58 address, once Privy has made the wallet. */
  address?: string;
  /** The wallet can sign right now. */
  ready: boolean;
  /** Sign as the owner and broadcast; resolves to the confirmed signature. */
  signAndSend: (tx: Transaction) => Promise<string>;
};

export function useSolanaSigner(): SolanaSigner {
  const { address } = useAuth();
  const { ready, wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const wallet = address ? wallets.find((w) => w.address === address) : undefined;

  const signAndSend = useCallback(
    async (tx: Transaction) => {
      if (!address || !wallet) throw new Error('Your wallet is not ready yet. Give it a moment.');
      const conn = solanaConnection();
      const prepared = await prepareForSigning(conn, tx, new PublicKey(address));
      const { signedTransaction } = await signTransaction({ transaction: unsignedBytes(tx), wallet });
      return broadcastSigned(conn, signedTransaction, prepared);
    },
    [address, wallet, signTransaction],
  );

  return { address, ready: ready && !!wallet, signAndSend };
}
