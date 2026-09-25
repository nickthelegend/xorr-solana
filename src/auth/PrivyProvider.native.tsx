/**
 * Privy — identity and the embedded wallet, in one object.
 *
 * The user logs in with a code sent to their email and gets a wallet they own — the only login built; passkeys
 * need Privy's dashboard and the app's associated domains first (PLAN.md 4.11, 8.9). There is no separate
 * account system to keep in sync with a wallet, which is what makes "your keys, your wallet"
 * true rather than a slogan: xorr never sees the private key, and the bot's authority over that
 * wallet is a separate on-chain permission the user signs and can revoke.
 */
import React from 'react';
import { PrivyProvider as Provider } from '@privy-io/expo';
// PrivyElements ships from the /ui subpath, not the package root.
import { PrivyElements } from '@privy-io/expo/ui';
import { colors } from '@/ui';
import { isSolana } from '@/chain';

const APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID;
/** The app client this build signs in through (2026-09-25): Privy's per-platform settings — allowed apps, login methods. */
const CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID;

if (!APP_ID) {
  throw new Error(
    'EXPO_PUBLIC_PRIVY_APP_ID is required. The app has no offline login path by design — an ' +
      'unauthenticated build would talk to an executor that rejects it anyway.',
  );
}

export function AppPrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <Provider
      appId={APP_ID!}
      {...(CLIENT_ID ? { clientId: CLIENT_ID } : {})}
      config={{
        // One wallet, on the chain this build settles on (2026-09-19): a Solana build makes the Solana one.
        embedded: {
          ethereum: { createOnLogin: isSolana ? 'off' : 'users-without-wallets' },
          solana: { createOnLogin: isSolana ? 'users-without-wallets' : 'off' },
        },
      }}
    >
      {children}
      {/* Privy's own login sheet, themed to match the app's true-black surface. */}
      <PrivyElements config={{ appearance: { colorScheme: 'dark', accentColor: colors.ink } }} />
    </Provider>
  );
}

export const PRIVY_APP_ID = APP_ID;
export const SURFACE = colors.bg;
