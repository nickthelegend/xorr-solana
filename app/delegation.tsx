/**
 * The permission itself: what was granted, to whom, until when.
 *
 * `/safety` shows whether the bot is on and gives you the switch. This is the underlying grant —
 * the contract, the key it names, the venues it may reach, the cap and the expiry. Two different
 * questions, and the second one had no screen.
 *
 * `delegateIsCurrent` is the field that earns this screen its place. A permission granted to a key
 * the executor no longer signs with is unusable and reads as perfectly healthy: not revoked, cap
 * intact, unexpired. Saying LIVE in that state is the one mistake this surface must never make.
 *
 * One grant, laid out as one (2026-09-25). It was six bordered cards stacked — STATE, Daily cap,
 * Expiry, Owner, Delegate, VENUES IT MAY REACH — each a label over a single value, so five facts
 * ran the screen to its foot and read as unfinished. Now the state is Safety's chip and one sentence
 * saying what the grant allows, the facts are rows in one card, and under them is the way to stop
 * it. The stop itself stays on Safety, where it is held and signed: this button only takes you
 * there, so the app has one switch and not two that could disagree.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  ErrorState,
  Fill,
  HeaderBar,
  Placeholder,
  Row,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  size,
  space,
  type FigureKind,
} from '@/ui';
import { money, shortAddress, when } from '@/format';
import { useAsync } from '@/data/useAsync';
import { repos } from '@/data';
import { useNow } from '@/state/useNow';

/** The state chip's dot — Safety's, so the chip reads the same on both screens. */
const DOT = 7;

/**
 * How far off the expiry is, in words — and in the past tense once it has passed.
 *
 * This was a signed day count, so an expired grant read "· -3 days": an ASCII hyphen standing in for
 * a minus, on a duration nobody says with a sign. Days are floored, hours take over on the last day,
 * and a passed expiry says how long ago.
 */
function expiryPhrase(expiresAt: number, now: number): string {
  const ms = Math.abs(expiresAt - now);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor(ms / 3_600_000);
  const span =
    days >= 1
      ? `${days} ${days === 1 ? 'day' : 'days'}`
      : hours >= 1
        ? `${hours} ${hours === 1 ? 'hour' : 'hours'}`
        : undefined;
  if (expiresAt > now) return span ? `In ${span}` : 'In under an hour';
  return span ? `Expired ${span} ago` : 'Expired just now';
}

/** Dollars without cents they do not have: a $100 cap reads "$100", what is left of it "$71.37". */
function dollars(n: number): string {
  return money(n, { fractionDigits: Number.isInteger(n) ? 0 : 2 });
}

/**
 * A venue as a person reads it (2026-09-25).
 *
 * The grant names venues by key — `jupiter` on Solana, a router address on Base — and the card printed the key: a
 * lower-case "jupiter" under a heading in capitals. A venue this build knows is spelled the way its owner spells it
 * and an address is shortened; anything else is shown as it came, as `fillVenue.ts` does, rather than guessed at.
 */
const VENUE_NAMES: Readonly<Record<string, string>> = { jupiter: 'Jupiter' };
function venueName(venue: string): string {
  const known = VENUE_NAMES[venue.trim().toLowerCase()];
  if (known) return known;
  return venue.length > 20 ? shortAddress(venue) : venue;
}

export default function DelegationDetail() {
  const router = useRouter();
  const goBack = useGoBack();
  const { data, loading, error, reload } = useAsync(() => repos.wallet.delegation(), []);
  /*
   * A minute, not a second. This screen compares against an expiry days away; the one-second tick
   * the proposal countdown uses would be a wakeup per second for a number that changes daily.
   */
  const now = useNow();

  const stale = data?.delegateIsCurrent === false;
  const expired = data ? data.expiresAt <= now : false;
  /** The bot can spend under this grant right now. Anything else is red, whichever way it stopped. */
  const live = !!data && !data.revoked && !expired && !stale;

  // Safety's words for the same four states, so the two screens never describe one grant differently.
  const state = !data
    ? '—'
    : data.revoked
      ? 'Stopped'
      : expired
        ? 'Expired'
        : stale
          ? 'Disconnected'
          : 'Live';

  const tone = live ? colors.up : colors.down;

  /*
   * What is left of today's cap, only where `/delegation` already says what was spent — an executor older than
   * `spentTodayUsd` leaves the row out rather than implying the whole cap is free. Nothing is left under a grant that
   * has stopped or run out, so it is not offered there either.
   */
  const leftToday =
    data && !data.revoked && !expired && typeof data.spentTodayUsd === 'number' && Number.isFinite(data.spentTodayUsd)
      ? Math.max(0, data.dailyCapUsd - data.spentTodayUsd)
      : undefined;

  /** The grant in one sentence. Its cap is the person's money and hides while balances are hidden; the date does not. */
  const summary = !data
    ? ''
    : data.revoked
      ? 'Stopped. The bot can’t spend anything under this permission.'
      : expired
        ? `Ended ${when(data.expiresAt, now)}. The bot can’t spend anything under it.`
        : stale
          ? /*
             * The whole reason this state is rendered. Everything else about this grant looks healthy, and it
             * cannot be used.
             */
            'It names a key the bot no longer signs with, so every order it tries is refused. Nothing else about it is wrong.'
          : `The bot may spend up to ${dollars(data.dailyCapUsd)} a day until ${when(data.expiresAt, now)}.`;

  const venues = data?.venueAllowlist ?? [];

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Permission</Text>} />
      </View>

      <Fill style={{ marginTop: space.s16 }}>
        {error ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <ErrorState error={error} onRetry={reload} />
          </View>
        ) : loading && !data ? (
          <View style={{ paddingHorizontal: space.gutter, gap: space.s12 }}>
            <Placeholder width={72} height={24} style={{ borderRadius: radius.card }} />
            <Placeholder width={260} height={20} />
            <Placeholder height={300} style={{ borderRadius: radius.panel, marginTop: space.s8 }} />
          </View>
        ) : !data ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <Text variant="body" color={colors.ink55}>
              Nothing has been granted. The bot cannot place an order.
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.s30 }}
          >
            <StateChip label={state} color={tone} />
            <Text
              variant="bodyLg"
              color={live ? colors.ink : colors.ink70}
              style={{ marginTop: space.s12 }}
              figure="own"
            >
              {summary}
            </Text>

            <SheetCard borderRadius={radius.panel} padding={space.s16} style={{ marginTop: space.s20 }}>
              <Row title="Daily cap" value={<Fact figure="own">{dollars(data.dailyCapUsd)}</Fact>} height={size.row} />
              {leftToday !== undefined ? (
                <Row title="Left today" value={<Fact figure="own">{dollars(leftToday)}</Fact>} height={size.row} />
              ) : null}
              <Row
                title={expired ? 'Ended' : 'Ends'}
                secondary={expiryPhrase(data.expiresAt, now)}
                value={<Fact>{when(data.expiresAt, now)}</Fact>}
                height={size.row}
              />
              <Row
                title="Your wallet"
                secondary={data.ownerName ? shortAddress(data.ownerPubkey) : undefined}
                value={<Fact selectable>{data.ownerName ?? shortAddress(data.ownerPubkey)}</Fact>}
                height={size.row}
              />
              <Row
                title="Bot key"
                secondary={data.delegateName ? shortAddress(data.delegatePubkey) : undefined}
                value={<Fact selectable>{data.delegateName ?? shortAddress(data.delegatePubkey)}</Fact>}
                height={size.row}
              />
              <Row
                title={venues.length > 1 ? 'Venues' : 'Venue'}
                secondary={venues.length === 0 ? 'Every route is refused' : undefined}
                value={
                  <Fact>
                    {venues.length === 0
                      ? 'None'
                      : venues.length === 1
                        ? venueName(venues[0]!)
                        : `${venues.length} venues`}
                  </Fact>
                }
                // More than one does not fit a row; the venues screen lists them in full.
                onPress={venues.length > 1 ? () => router.push('/venues') : undefined}
                height={size.row}
                divider={false}
              />
            </SheetCard>
          </ScrollView>
        )}
      </Fill>

      {data && !error ? (
        <View style={{ paddingHorizontal: space.gutter, paddingTop: space.s12 }}>
          {live ? (
            <>
              <Button label="Stop all trading" variant="destructive" onPress={() => router.push('/safety')} />
              <Text variant="footnote" color={colors.ink55} align="center" style={{ marginTop: space.s12 }}>
                Opens Safety, where you hold to stop.
              </Text>
            </>
          ) : (
            // Resuming, reconnecting and granting again all live on Safety beside the stop.
            <Button label="Open Safety" variant="secondary" onPress={() => router.push('/safety')} />
          )}
        </View>
      ) : null}
    </Screen>
  );
}

/** The state, as Safety draws it: a dot and a word on a chip. */
function StateChip({ label, color }: { label: string; color: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s8,
        alignSelf: 'flex-start',
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.card,
        paddingHorizontal: space.s12,
        paddingVertical: space.s6,
      }}
    >
      <View style={{ width: DOT, height: DOT, borderRadius: radius.full, backgroundColor: color }} />
      <Text variant="tagSm" color={color}>
        {label}
      </Text>
    </View>
  );
}

/** One fact's value, in the row's muted ink. The cap is the person's money; the rest are not figures. */
function Fact({ children, figure, selectable }: { children: string; figure?: FigureKind; selectable?: boolean }) {
  return (
    <Text variant="rowPrimary" color={colors.ink55} numberOfLines={1} figure={figure} selectable={selectable}>
      {children}
    </Text>
  );
}
