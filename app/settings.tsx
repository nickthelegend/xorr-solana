/**
 * Settings — PLAN.md 10.3 [G14]. The Home gear had no destination.
 * Wallet, delegation status + revoke, security, notifications, the TONE DIAL, legal.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import { useAuth } from '@/auth/useAuth';
import {
  CloseButton,
  Eyebrow,
  Fill,
  Price,
  Row,
  Screen,
  Segmented,
  SheetCard,
  Text,
  colors,
  radius,
  size,
  space,
} from '@/ui';
import { capLabel } from '@/state/derived';
import { useStore } from '@/state/store';
import { useAllowlist } from '@/wallet/allowlist';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { TONES, useTone } from '@/bot/tone';
import { errorText } from '@/data/apiError';

const SETTING_ROW = 54;
const TONE_OPTIONS = TONES.map((t) => ({ value: t.id, label: t.label }));

export default function Settings() {
  const router = useRouter();
  const goBack = useGoBack();
  // The store's `wallet` is only ever set by the onboarding screen, so deep-linking here —
  // or opening Settings in a session that did not run onboarding — showed "Address: None"
  // and "Network: —" for a user who has a wallet. Read the source of truth, like every
  // other screen does, and fall back to the store only while that request is in flight.
  const stored = useStore((s) => s.wallet);
  const { data: fetched, error: walletError } = useAsync(() => repos.wallet.current(), []);
  const wallet = fetched ?? stored;
  // "None" and "—" are claims about the wallet. If we could not reach the executor we have
  // no claim to make, so say that instead.
  const unreachable = walletError !== undefined && !wallet;
  const delegation = useStore((s) => s.delegation);
  const killed = useStore((s) => s.killed);
  const recoveryBackedUp = useStore((s) => s.recoveryBackedUp);
  const { addresses, loading: allowlistLoading, error: allowlistError } = useAllowlist();
  const { tone, setTone } = useTone();

  const stopped = killed || delegation?.revoked;

  /*
   * Sign out. There was no way to.
   *
   * `useAuth` has exposed `logout` since it was written and not one screen called it, so a
   * signed-in session could only be ended by deleting the app — which does not even work, because
   * Privy keeps the session in the iOS keychain and it survives a reinstall. On a shared or lost
   * phone that is the whole account, and for anyone testing it means one account, forever.
   *
   * Two taps rather than a dialog: the app has no modal confirm of its own, and the row saying
   * what the second tap does is clearer than inventing one. Biometrics gate what the BOT may do —
   * signing out changes none of that, and the on-chain permission is untouched by it, which the
   * row says out loud so nobody reads this as a kill switch.
   */
  const { logout } = useAuth();
  const setWallet = useStore((s) => s.setWallet);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();

  async function signOut() {
    if (!confirmingSignOut) {
      setConfirmingSignOut(true);
      return;
    }
    setSignOutError(undefined);
    try {
      await logout();
      // The persisted store outlives the session, and the entry gate reads `wallet` to choose
      // between onboarding and the tab shell. Leaving it set signs you out into a signed-in shell.
      setWallet(null);
      router.replace('/welcome');
    } catch (e) {
      setConfirmingSignOut(false);
      setSignOutError(errorText(e));
    }
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="screenTitle">Settings</Text>
        <CloseButton onPress={() => goBack()} />
      </View>

      <Fill style={{ marginTop: space.s20 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Eyebrow small>Wallet</Eyebrow>
          <Row
            title="Address"
            value={
              <Price color={colors.ink55}>
                {wallet
                  ? `${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}`
                  : unreachable
                    ? 'Could not reach the executor'
                    : 'None'}
              </Price>
            }
            height={SETTING_ROW}
          />
          <Row
            title="Network"
            value={<Text variant="rowPrimary" color={colors.ink55}>{wallet?.cluster ?? '—'}</Text>}
            height={SETTING_ROW}
          />
          <Row
            title="Recovery"
            value={
              <Text variant="rowPrimary" color={recoveryBackedUp ? colors.ink55 : colors.warn}>
                {recoveryBackedUp ? 'Acknowledged' : 'Read this'}
              </Text>
            }
            height={SETTING_ROW}
            onPress={() => router.push('/recovery')}
          />

          {/*
            One door to everything the app can show about itself — the verification report, the
            approvals, the runs, the subgraph. Thirty-odd surfaces cannot each earn a row here, and
            a screen nobody can reach is worse than no screen.
          */}
          <Row
            title="Explore"
            value={
              <Text variant="rowPrimary" color={colors.ink55}>
                Everything else
              </Text>
            }
            height={SETTING_ROW}
            onPress={() => router.push('/explore')}
          />

          <Eyebrow small style={{ marginTop: space.s26 }}>
            What the bot may do
          </Eyebrow>
          {/*
            "Live · $1,600/day" for a wallet that has granted nothing.

            `cap` is the value the SLIDER is sitting on — a preference the user has not signed —
            and `stopped` is only true once a delegation exists and is revoked. So before any
            grant this section read "Status Live, Daily cap $1,600/day" under a heading that says
            "What the bot may do". The bot may do nothing; there is no permission. Same mistake as
            the two dashes on Safety, in the opposite direction: there it said too little, here it
            claimed something that was not true.
          */}
          <Row
            title="Status"
            value={
              <Text
                variant="rowPrimary"
                color={!delegation ? colors.ink55 : stopped ? colors.ink55 : colors.up}
              >
                {!delegation ? 'Not granted' : stopped ? 'Stopped' : 'Live'}
              </Text>
            }
            height={SETTING_ROW}
            onPress={() => router.push('/safety')}
          />
          <Row
            title="Daily cap"
            value={
              delegation ? (
                /*
                  The cap that was SIGNED, not the one the slider is sitting on.

                  `cap` is a local preference the user can move without granting anything, so this
                  row reported a number the chain had never seen — on the row whose whole job is to
                  say how much the bot may spend. `dailyCapUsd` comes off the delegation itself.
                */
                <Price color={colors.ink55}>{capLabel(delegation.dailyCapUsd)}</Price>
              ) : (
                <Text variant="rowPrimary" color={colors.ink38}>
                  —
                </Text>
              )
            }
            height={SETTING_ROW}
          />
          <Row
            title="Withdrawal allowlist"
            value={
              <Text variant="rowPrimary" color={colors.ink55}>
                {/* The executor holds the list: a count it has not given is not zero addresses. */}
                {allowlistError
                  ? '—'
                  : allowlistLoading
                    ? '· · ·'
                    : addresses.length === 1
                      ? '1 address'
                      : `${addresses.length} addresses`}
              </Text>
            }
            height={SETTING_ROW}
            onPress={() => router.push('/allowlist')}
          />

          <Eyebrow small style={{ marginTop: space.s26 }}>
            How the bot talks
          </Eyebrow>
          <SheetCard
            borderRadius={radius.panel}
            padding={space.s16}
            style={{ marginTop: space.s10 }}
          >
            <Segmented
              options={TONE_OPTIONS}
              value={tone}
              onChange={setTone}
              height={size.segThumbSm}
            />
            <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s12 }}>
              {TONES.find((t) => t.id === tone)?.description}
            </Text>
            <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s10 }}>
              This changes how the bot writes, never what it reports. Prices, sizes and
              limits read the same on every setting.
            </Text>
          </SheetCard>

          <Eyebrow small style={{ marginTop: space.s26 }}>
            Alerts
          </Eyebrow>
          <Row
            title="Notifications"
            value={<Text variant="rowPrimary" color={colors.ink55}>Manage</Text>}
            height={SETTING_ROW}
            onPress={() => router.push('/alerts')}
          />

          <Eyebrow small style={{ marginTop: space.s26 }}>
            Legal
          </Eyebrow>
          <Row title="Terms" height={SETTING_ROW} onPress={() => router.push('/legal/terms')} />
          <Row
            title="Privacy policy"
            height={SETTING_ROW}
            onPress={() => router.push('/legal/privacy')}
          />
          <Row
            title="Risk disclosure"
            height={SETTING_ROW}
            divider={false}
            onPress={() => router.push('/legal/risk')}
          />

          <Eyebrow small style={{ marginTop: space.s26 }}>
            Session
          </Eyebrow>
          <Row
            title={
              confirmingSignOut ? (
                <Text variant="rowPrimary" color={colors.down}>
                  Tap again to sign out
                </Text>
              ) : (
                'Sign out'
              )
            }
            secondary={
              confirmingSignOut
                ? 'You will need your email code to get back in.'
                : 'Ends this session on this device. The bot keeps whatever permission you granted it on-chain — stop that on Safety.'
            }
            height={SETTING_ROW}
            divider={false}
            onPress={() => void signOut()}
          />
          {signOutError ? (
            <Text variant="secondarySm" color={colors.down} style={{ marginTop: space.s10 }}>
              {signOutError}
            </Text>
          ) : null}
          <View style={{ height: space.s30 }} />
        </ScrollView>
      </Fill>
    </Screen>
  );
}
