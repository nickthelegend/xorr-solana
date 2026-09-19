/**
 * The web half of `useKeyExport`: Privy's own export window, for this wallet and no other (PLAN.md 4.10).
 */
import { useExportWallet } from '@privy-io/react-auth';
import { useExportWallet as useExportSolanaWallet } from '@privy-io/react-auth/solana';
import { isSolana } from '@/chain';
import { EXPORT_NEEDS_WALLET, type KeyExport } from './keyExport';

export function useKeyExport(address: string | undefined): KeyExport {
  const evm = useExportWallet();
  // The Solana wallet's own export (2026-09-19): the EVM hook looks for an Ethereum wallet this account does not have.
  const solana = useExportSolanaWallet();
  const exportWallet = isSolana ? solana.exportWallet : evm.exportWallet;
  if (!address) return { supported: false, reason: EXPORT_NEEDS_WALLET };
  // Privy shows the key in its frame; the promise settles when the person closes that window.
  return { supported: true, exportKey: () => exportWallet({ address }) };
}
