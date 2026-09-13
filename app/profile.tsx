/**
 * Profile — who you are, and where everything else lives (2026-09-13).
 *
 * Opened from the wallet header on Home, as a sheet. It used to be a dashboard — three counts, the full
 * address in a card, the last five audit events and two more buttons — and the product owner found it
 * too much. It is now the identity, the address one tap from the clipboard, and four rows to the
 * screens that carry the detail: Activity, Permissions, Approvals and Settings.
 *
 * The identity still comes from two places, each the authority on its half: Privy for the email the
 * account was made with, the executor for the wallet the app is using, with its Basename when it has
 * one. The address is shortened on screen and copied whole.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  BackButton,
  ErrorState,
  Placeholder,
  Press,
  Row,
  Screen,
  Text,
  colors,
  radius,
  size,
  space,
} from '@/ui';
import { Icon, type IconName } from '@/design/Icon';
import { Rise } from '@/ui/Rise';
import { usePrivyIdentity } from '@/auth/usePrivyIdentity';
import { useAsync } from '@/data/useAsync';
import { repos } from '@/data';
import { system } from '@/data/system';
import { chainLabel } from '@/chain';

const AVATAR = 84;
const LINK_GLYPH = 18;

/** Where the detail went. Each row is a screen that already exists. */
const LINKS: readonly { label: string; icon: IconName; href: string }[] = [
  { label: 'Activity', icon: 'activity', href: '/activity' },
  { label: 'Permissions', icon: 'shield', href: '/delegation' },
  { label: 'Approvals', icon: 'check', href: '/approvals' },
  { label: 'Settings', icon: 'gear', href: '/settings' },
];

export default function Profile() {
  const goBack = useGoBack();
  const router = useRouter();
  const { email } = usePrivyIdentity();
  const wallet = useAsync(() => repos.wallet.current(), []);
  const address = wallet.data?.address;
  /* Only once there is an address to resolve; most addresses have no Basename and answer null. */
  const name = useAsync(
    async () => (address ? (await system.basenameOf(address)).name : null),
    [address],
  );
  const [copied, setCopied] = useState(false);

  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : undefined;
  const display = name.data ?? email ?? short;
  const initial = (display ?? 'x').replace(/^0x/i, '').charAt(0).toUpperCase();

  async function copy() {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setCopied(true);
  }

  return (
    <Screen gutter="none" sheet>
      <View style={{ flexDirection: 'row', paddingHorizontal: space.gutter }}>
        <BackButton onPress={goBack} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.s30 }}>
        <Rise index={0} style={{ alignItems: 'center', marginTop: space.s6, paddingHorizontal: space.gutter }}>
          {wallet.error ? (
            <ErrorState error={wallet.error} onRetry={wallet.reload} />
          ) : (
            <>
              <View
                style={{
                  width: AVATAR,
                  height: AVATAR,
                  borderRadius: AVATAR / 2,
                  backgroundColor: colors.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {display ? (
                  <Text variant="screenTitle" color={colors.sheet.ink}>
                    {initial}
                  </Text>
                ) : null}
              </View>

              {display ? (
                <Text variant="screenTitle" align="center" numberOfLines={1} style={{ marginTop: space.s16 }}>
                  {display}
                </Text>
              ) : wallet.loading ? (
                <Placeholder width={180} height={26} style={{ marginTop: space.s16 }} />
              ) : (
                /*
                  Nothing to call this account by: the executor has no wallet on file and Privy gave no email. This
                  was a placeholder that never stopped pulsing, which reads as a name still on its way.
                */
                <Text variant="screenTitle" align="center" color={colors.ink55} style={{ marginTop: space.s16 }}>
                  No wallet yet
                </Text>
              )}

              {address && short ? (
                <Press
                  onPress={() => void copy()}
                  accessibilityRole="button"
                  accessibilityLabel={copied ? 'Address copied' : `Copy address ${address}`}
                  hitHeight={size.hit}
                  style={{
                    marginTop: space.s12,
                    height: size.pillH,
                    paddingHorizontal: size.pillPadX,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.s8,
                    borderRadius: radius.full,
                    backgroundColor: colors.control,
                  }}
                >
                  <Text variant="secondarySm" color={colors.ink65}>
                    {copied ? 'Copied' : short}
                  </Text>
                  <Icon name={copied ? 'check' : 'copy'} size={15} color={colors.ink55} />
                </Press>
              ) : wallet.loading ? (
                <Placeholder width={150} height={size.pillH} style={{ marginTop: space.s12, borderRadius: radius.full }} />
              ) : null}
            </>
          )}
        </Rise>

        <Rise
          index={1}
          style={{
            marginTop: space.s26,
            marginHorizontal: space.gutter,
            paddingHorizontal: space.s16,
            borderRadius: radius.panel,
            backgroundColor: colors.surfaceAlt,
          }}
        >
          {LINKS.map((link, i) => (
            <Row
              key={link.href}
              divider={i < LINKS.length - 1}
              onPress={() => router.push(link.href as never)}
              left={
                <View
                  style={{
                    width: size.mark,
                    height: size.mark,
                    borderRadius: radius.full,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.control,
                  }}
                >
                  <Icon name={link.icon} size={LINK_GLYPH} color={colors.ink65} />
                </View>
              }
              title={link.label}
              right={<Icon name="chevron" size={16} color={colors.ink28} />}
            />
          ))}
        </Rise>

        {wallet.data ? (
          <Rise index={2}>
            <Text variant="footnote" color={colors.ink55} align="center" style={{ marginTop: space.s18 }}>
              {`Privy ${wallet.data.kind} wallet · ${chainLabel}`}
            </Text>
          </Rise>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
