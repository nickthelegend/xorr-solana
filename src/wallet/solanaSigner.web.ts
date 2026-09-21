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
import { CANCELLED, isUserCancel } from './walletError';
import {
  SIGN_ATTEMPTS,
  broadcastSigned,
  isStaleBlockhash,
  prepareForSigning,
  solanaConnection,
  unsignedBytes,
  untilFresh,
  type Prepared,
} from './solanaTx';

export type SolanaSigner = {
  /** The owner's base58 address, once Privy has made the wallet. */
  address?: string;
  /** The wallet can sign right now. */
  ready: boolean;
  /**
   * Sign as the owner and broadcast; resolves to the confirmed signature. Pass `prepared` for a transaction the executor
   * built and co-signed (a sale against the venue vault): its blockhash and fee payer are already set, and re-stamping
   * them would void the executor's signature.
   */
  signAndSend: (tx: Transaction, prepared?: Prepared) => Promise<string>;
};

export function useSolanaSigner(): SolanaSigner {
  const { address } = useAuth();
  const { ready, wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const wallet = address ? wallets.find((w) => w.address === address) : undefined;

  const signAndSend = useCallback(
    async (tx: Transaction, already?: Prepared) => {
      if (!address || !wallet) throw new Error('Your wallet is not ready yet. Give it a moment.');
      const conn = solanaConnection();
      const once = async () => {
        const prepared = already ?? (await prepareForSigning(conn, tx, new PublicKey(address)));
        const signed = await signTransaction({ transaction: unsignedBytes(tx), wallet }).catch((e: unknown) => {
          // Privy reports a closed sheet as "Failed to connect to wallet"; every caller shows this message as it is.
          throw isUserCancel(e) ? new Error(CANCELLED, { cause: e }) : e;
        });
        return broadcastSigned(conn, signed.signedTransaction, prepared);
      };
      /*
       * Again with a fresh blockhash while the cluster says the old one aged out (2026-09-22).
       *
       * The blockhash is stamped before the wallet sheet opens, because the signature covers it,
       * and it lives about a minute — 64s, measured on this cluster. Reading the permission screen
       * — which is six paragraphs we want read — takes longer than that often enough that the
       * grant failed on the hosted build with "Blockhash not found", and so did the stop. Each
       * retry costs one more tap on a sheet the person has already decided to approve, and the
       * later taps are quick because the reading is done.
       *
       * Never for a `prepared` transaction: that one is the executor's, co-signed, and re-stamping
       * the blockhash would void its signature. A cancel is the person's answer, not a fault.
       */
      return await untilFresh(
        once,
        (e) => isStaleBlockhash(e) && !(e instanceof Error && e.message === CANCELLED),
        already ? 1 : SIGN_ATTEMPTS,
      )
    },
    [address, wallet, signTransaction],
  );

  return { address, ready: ready && !!wallet, signAndSend };
}
