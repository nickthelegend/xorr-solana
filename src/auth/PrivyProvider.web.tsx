/**
 * Privy on web.
 *
 * `@privy-io/expo` is a native-only SDK — it reads the app's bundle identifier and throws on
 * react-native-web. The web SDK is a separate package, so the provider is platform-split rather
 * than forced into one implementation. Metro picks `.web.tsx` for web and `.native.tsx` for
 * iOS/Android automatically; nothing else in the app knows the difference.
 */
import React from 'react';
import { PrivyProvider as WebProvider, type PrivyClientConfig } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { solanaRpcUrl, solanaWsUrl } from '@/wallet/solanaTx';
import { activeChain, isSolana, supportedChains } from '@/chain';
import { colors } from '@/ui';

const APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID;
/** The app client this build signs in through (2026-09-25), when one is configured; see PrivyProvider.native.tsx. */
const CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID;

if (!APP_ID) {
  throw new Error('EXPO_PUBLIC_PRIVY_APP_ID is required — the app has no offline login path.');
}

/**
 * A Solana build (2026-09-19): the embedded wallet made at sign-in is a SOLANA wallet, "Continue with a wallet" lists
 * Solana wallets (Phantom, Solflare, Backpack…), and no Ethereum wallet is made or offered. Before this the Solana
 * build still created an Ethereum wallet the executor could not use, and loaded the Coinbase EVM SDK for nothing.
 */
const SOLANA_CONFIG: PrivyClientConfig = {
  embeddedWallets: {
    ethereum: { createOnLogin: 'off' },
    solana: { createOnLogin: 'users-without-wallets' },
  },
  loginMethods: ['email', 'google', 'twitter', 'github', 'wallet'],
  externalWallets: { solana: { connectors: toSolanaWalletConnectors() } },
  /*
   * The RPC Privy's signing sheet previews a transaction against (2026-09-19). With none configured, signing threw
   * "No RPC configuration found for chain solana:mainnet" and took the grant screen down. This build's mainnet IS the
   * cluster it settles on — the fork clones mainnet's accounts — so the preview simulates against the same chain the app
   * then broadcasts to, never against real mainnet, where this wallet holds nothing.
   */
  solana: {
    rpcs: {
      'solana:mainnet': {
        rpc: createSolanaRpc(solanaRpcUrl()),
        rpcSubscriptions: createSolanaRpcSubscriptions(solanaWsUrl()),
      },
    },
  },
  appearance: {
    theme: 'dark',
    accentColor: colors.ink,
    showWalletLoginFirst: false,
    walletChainType: 'solana-only',
  },
};

export function AppPrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <WebProvider
      appId={APP_ID!}
      {...(CLIENT_ID ? { clientId: CLIENT_ID } : {})}
      config={isSolana ? SOLANA_CONFIG : {
        // A wallet is created on login for anyone who does not already have one, which is what
        // makes "sign in and you own a wallet" a single step rather than two.
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        // The same ways in as the onboarding screen offers (`src/auth/socialLogins.ts`); each is switched on per app in
        // Privy's dashboard, and one that is not simply does not appear here.
        loginMethods: ['email', 'google', 'twitter', 'github', 'wallet'],
        // Follows EXPO_PUBLIC_XORR_CHAIN — see src/chain.ts for what hardcoding this cost.
        defaultChain: activeChain,
        supportedChains,
        appearance: {
          theme: 'dark',
          accentColor: colors.ink,
          showWalletLoginFirst: false,
        },
      }}
    >
      {children}
    </WebProvider>
  );
}

export const PRIVY_APP_ID = APP_ID;
export const SURFACE = colors.bg;
