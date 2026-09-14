/**
 * Home — the reference video's layout, on this app's theme (2026-09-12).
 *
 * Top to bottom: who is signed in — the Privy wallet, tap for the profile; ONE balance — tap for the
 * portfolio, where your coins, positions, profit, cash and earnings live; for a wallet that cannot trade
 * yet, the three steps it has left (FEATURES.md #14); and a sheet with the agents, today's gainers, and —
 * since 2026-09-13 — tokenized stocks and futures. A single figure on top is deliberate: the breakdown
 * belongs to the portfolio.
 *
 * Everything arrives the way the reference's screens do, through `<Rise>` and `<RollingNumber>`, so
 * reduced motion turns it off.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { agentGradient, assetGradient } from '@/design/gradients';
import { Icon } from '@/design/Icon';
import {
  AgentOrb,
  AssetMark,
  Button,
  Eyebrow,
  IconButton,
  LoadingRows,
  NoteStrip,
  Placeholder,
  Press,
  Price,
  Row,
  Screen,
  SignInPrompt,
  Sparkline,
  Text,
  colors,
  money,
  percent,
  price as fmtPrice,
  radius,
  size,
  space,
  typeScale,
} from '@/ui';
import { Rise } from '@/ui/Rise';
import { RollingNumber } from '@/ui/RollingNumber';
import { STAGGER } from '@/ui/motion';
import { repos } from '@/data';
import { NotSignedIn, isRetryable } from '@/data/apiError';
import { system, type Limits } from '@/data/system';
import { useAsync } from '@/data/useAsync';
import { logoProps, useLogos } from '@/data/useLogos';
import { usePrivyIdentity } from '@/auth/usePrivyIdentity';
import { useSignedOut } from '@/auth/useSignedOut';
import { useHasHydrated, useStore } from '@/state/store';
import { useNow } from '@/state/useNow';
import type { Agent, Instrument } from '@/data/types';
import { nothingSettles, setupSteps, type SetupStep, type SetupStepKey, type SetupStepState } from '@/state/derived';

type SheetTab = 'agents' | 'gainers' | 'stocks' | 'futures';

const TABS: readonly { key: SheetTab; label: string }[] = [
  { key: 'agents', label: 'Agents' },
  { key: 'gainers', label: 'Gainers' },
  { key: 'stocks', label: 'Stocks' },
  { key: 'futures', label: 'Futures' },
];

const AVATAR = 40;
const DOT = 7;
const GRABBER_W = 36;
const GRABBER_H = 4;
const TAB_RULE = 2;
const SPARK_W = 56;
const SPARK_H = 22;
/** The agents are tiles, not rows: a medium orb with its name under it, four across. */
const ORB = 56 as const;
const TILE_W = '25%' as const;
/** Placeholder tiles while the roster loads — the same shape it will arrive in. */
const AGENT_SLOTS = 4;
/** How many of today's gainers the sheet lists. */
const GAINERS = 8;
/** How many futures contracts the sheet lists before handing over to Futures. */
const FUTURES = 8;
/** Arrival order: header, balance, sheet — then each row after the sheet. */
const ROWS_FROM = 3;

/** `Instrument.chg` is formatted for display; this reads its size back out, for sorting. */
function magnitude(chg: string): number {
  const n = Number(chg.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Whether the bot may place an order right now: a permission that exists, is live, and is not stopped. */
function isLive(limits: Limits | undefined, killed: boolean): boolean {
  if (!limits || killed || limits.revoked || limits.dailyCapUsd <= 0) return false;
  return limits.expiresAt === undefined || limits.expiresAt > Date.now();
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function isSheetTab(value: string | undefined): value is SheetTab {
  return TABS.some((t) => t.key === value);
}

/**
 * A tab whose read failed, said as a failure — with a way to ask again where asking again could answer differently.
 *
 * An outage used to pass for a quiet day here: a price read that never came back said "No gainers today.", and a
 * roster that could not load had nothing behind "Couldn’t load agents." but a dead end. The retry follows the rule
 * `ErrorState` follows, so a refusal that will answer the same way is not offered as something to keep pressing; its
 * `testID` keys the press guard, since pressing it unmounts it.
 */
function TabFailed({ what, error, onRetry }: { what: string; error: Error; onRetry: () => void }) {
  // Signed out, nothing failed — nobody had been asked about.
  if (error instanceof NotSignedIn) return <SignInPrompt />;
  return (
    <View style={{ marginTop: space.s16, gap: space.s10 }}>
      <Text variant="body" color={colors.ink55}>
        {`Couldn’t load ${what}.`}
      </Text>
      {isRetryable(error) ? (
        <Button label="Try again" variant="ghost" onPress={onRetry} testID={`home-${what}-retry`} />
      ) : null}
    </View>
  );
}

/** The box a step's mark sits in. The tick, the ring and the dash share it, so the three names line up. */
const STEP_MARK = 14;
const STEP_RING = 1.5;

/** What a screen reader hears after a step's name. */
const STEP_SAID: Readonly<Record<SetupStepState, string>> = {
  done: 'done',
  todo: 'not done yet',
  unknown: 'couldn’t check',
};

/** Where each step goes, said to a screen reader. */
const STEP_OPENS: Readonly<Record<SetupStepKey, string>> = {
  fund: 'Deposit',
  permit: 'the limits',
  strategy: 'Strategies',
};

/**
 * What a new wallet has left before the bot can trade for it (FEATURES.md #14): three steps across, each opening the
 * screen it is taken on.
 *
 * Done is a quiet tick, never green — green is profit, and a finished step is not a gain. Still to do is a ring, its name
 * in full ink because it is the one to look at. A step whose read failed is a dash, as every unknown value is.
 */
function SetupCard({ steps, onOpen }: { steps: readonly SetupStep[]; onOpen: (href: SetupStep['href']) => void }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        backgroundColor: colors.surface,
      }}
    >
      {steps.map((step, i) => (
        <Press
          key={step.key}
          onPress={() => onOpen(step.href)}
          accessibilityRole="button"
          accessibilityLabel={`${step.label}, ${STEP_SAID[step.state]}. Opens ${STEP_OPENS[step.key]}.`}
          style={{
            flex: 1,
            alignItems: 'center',
            gap: space.s6,
            paddingVertical: space.s12,
            paddingHorizontal: space.s4,
            borderLeftWidth: i > 0 ? 1 : 0,
            borderLeftColor: colors.hairline,
          }}
        >
          <View style={{ width: STEP_MARK, height: STEP_MARK, alignItems: 'center', justifyContent: 'center' }}>
            {step.state === 'done' ? (
              <Icon name="check" size={STEP_MARK} color={colors.ink55} />
            ) : step.state === 'todo' ? (
              <View
                style={{
                  width: STEP_MARK,
                  height: STEP_MARK,
                  borderRadius: STEP_MARK / 2,
                  borderWidth: STEP_RING,
                  borderColor: colors.ink40,
                }}
              />
            ) : (
              <Text variant="secondarySm" color={colors.ink55}>
                —
              </Text>
            )}
          </View>
          <Text variant="secondarySm" color={step.state === 'todo' ? colors.ink : colors.ink55} numberOfLines={1}>
            {step.label}
          </Text>
        </Press>
      ))}
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const hydrated = useHasHydrated();
  const wallet = useStore((s) => s.wallet);
  const walletChecked = useStore((s) => s.walletChecked);
  const killed = useStore((s) => s.killed);
  const { email } = usePrivyIdentity();
  /* `/?tab=futures` opens straight onto a tab — for links from elsewhere in the app. */
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<SheetTab>(() => (isSheetTab(params.tab) ? params.tab : 'agents'));
  /* Stocks and futures load the first time their tab opens: Home does not pay for a tab nobody looked at. */
  const [opened, setOpened] = useState<ReadonlySet<SheetTab>>(() => new Set([tab]));
  const openTab = (key: SheetTab) => {
    setTab(key);
    setOpened((prev) => (prev.has(key) ? prev : new Set([...prev, key])));
  };

  const balance = useAsync(() => repos.portfolio.balance(), []);
  const limits = useAsync(() => system.limits(), []);
  const agents = useAsync(() => repos.bot.listAgents(), []);
  const classes = useAsync(() => repos.markets.listClasses(), []);
  const stocksOpened = opened.has('stocks');
  const futuresOpened = opened.has('futures');
  const stocks = useAsync(async () => (stocksOpened ? system.stocks() : null), [stocksOpened]);
  const futures = useAsync(async () => (futuresOpened ? repos.perps.markets() : null), [futuresOpened]);
  /* What this deployment trades and watches: nothing to trade beside things to watch is a chain that fills nothing. */
  const tradable = useAsync(() => system.tradable(), []);
  const watchable = useAsync(() => system.watchable(), []);

  /*
   * Today's gainers: instruments on a LIVE feed whose change is up, largest first.
   *
   * Only live feeds — an instrument with no feed behind it has no change to rank, and ranking the
   * design prototype's numbers is how an app ends up recommending a move that never happened.
   */
  const gainers = useMemo<Instrument[]>(() => {
    const seen = new Set<string>();
    return (classes.data ?? [])
      .flatMap((c) => c.instruments)
      .filter((i) => {
        if (seen.has(i.sym) || i.feed !== 'live' || !i.up || i.chg.trim() === '') return false;
        seen.add(i.sym);
        return true;
      })
      .sort((a, b) => magnitude(b.chg) - magnitude(a.chg))
      .slice(0, GAINERS);
  }, [classes.data]);
  const gainerSyms = useMemo(() => gainers.map((g) => g.sym), [gainers]);
  const sparks = useAsync(() => repos.markets.sparklines(gainerSyms), [gainerSyms.join(',')]);

  const stockRows = useMemo(() => stocks.data ?? [], [stocks.data]);
  const perpRows = useMemo(() => (futures.data?.markets ?? []).slice(0, FUTURES), [futures.data]);
  const markSyms = useMemo(
    () => [...gainerSyms, ...stockRows.map((s) => s.symbol), ...perpRows.map((m) => m.symbol)],
    [gainerSyms, stockRows, perpRows],
  );
  const logos = useLogos(markSyms);

  /* Hired agents first — the ones actually allowed to act on this wallet. */
  const roster = useMemo<Agent[]>(
    () => [...(agents.data ?? [])].sort((a, b) => Number(!!b.hired) - Number(!!a.hired)),
    [agents.data],
  );

  const total = balance.data?.total ?? null;
  const live = isLive(limits.data ?? undefined, killed);
  const fillsNothing = nothingSettles(tradable.data, watchable.data);

  /*
   * What a new wallet still has to do before the bot can trade for it (FEATURES.md #14): the balance above, the permission
   * as the chain holds it, and the strategies. The permission is read here rather than taken from the store, which holds
   * `null` both before its read and after one that found nothing, and keeps no failure at all.
   */
  const permission = useAsync(() => repos.wallet.delegation(), []);
  const strategies = useAsync(() => repos.strategies.list(), []);
  const signedOut = useSignedOut();
  const now = useNow();
  const setup = setupSteps({
    // Refused for want of a session is not a failed read: nobody's wallet was asked about.
    signedOut:
      signedOut || [balance.error, permission.error, strategies.error].some((e) => e instanceof NotSignedIn),
    balance,
    permission,
    strategies,
    now,
  });

  /*
   * Back from Deposit, the limits or Strategies, the steps are read again. Home is a tab and is not mounted afresh, so the
   * step just taken would go on saying it is still to do. Only while the card shows, so a wallet that is set up is not
   * re-read on every return; and not on the first focus, which is the mount and has its own reads. The limits come too,
   * or the dot beside the tabs would go on saying "Not trading" beside a permission the card has just ticked.
   */
  const settingUp = setup !== null;
  const setupShowing = useRef(settingUp);
  useEffect(() => {
    setupShowing.current = settingUp;
  }, [settingUp]);
  const firstFocus = useRef(true);
  const { reload: reloadBalance } = balance;
  const { reload: reloadLimits } = limits;
  const { reload: reloadPermission } = permission;
  const { reload: reloadStrategies } = strategies;
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      if (!setupShowing.current) return;
      reloadBalance();
      reloadLimits();
      reloadPermission();
      reloadStrategies();
    }, [reloadBalance, reloadLimits, reloadPermission, reloadStrategies]),
  );

  /* The Privy account, named by its email when Privy has one, and by its wallet otherwise. */
  const address = wallet?.address;
  const title = email ?? (address ? shortAddress(address) : 'Wallet');
  const subtitle = email && address ? shortAddress(address) : 'Wallet';
  const initial = (email ?? address?.replace(/^0x/i, '') ?? 'x').charAt(0).toUpperCase();

  /*
   * The entry gate — PLAN.md 2.7. "/" belongs to the tab shell; a user without a wallet is sent to
   * onboarding from here. It waits for the persisted store AND the executor's answer, so a signed-in
   * user on a fresh device is not bounced back through sign-up.
   */
  if (hydrated && walletChecked && !wallet) return <Redirect href="/welcome" />;

  return (
    <Screen tabBar gutter="none">
      <Rise
        index={0}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.s10, paddingHorizontal: space.gutter }}
      >
        <Press
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel={`Your profile, ${title}`}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.s12 }}
        >
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
            <Text variant="rowPrimary" color={colors.sheet.ink}>
              {initial}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="rowPrimary" numberOfLines={1}>
              {title}
            </Text>
            <Text variant="secondarySm" color={colors.ink55} numberOfLines={1} style={{ marginTop: space.s2 }}>
              {subtitle}
            </Text>
          </View>
        </Press>
        <IconButton name="bell" accessibilityLabel="Notifications" onPress={() => router.push('/inbox')} />
      </Rise>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        <Rise index={1} style={{ marginTop: space.s26, paddingHorizontal: space.gutter }}>
          <Press
            onPress={() => router.push('/portfolio')}
            accessibilityRole="button"
            accessibilityLabel={`Total balance ${total !== null ? money(total) : 'not available'}. Opens your portfolio.`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s6 }}>
              <Eyebrow>Total balance</Eyebrow>
              <Icon name="chevron" size={11} color={colors.ink40} />
            </View>
            {/* Rolls in once it is real. Dots while on its way, a dash when unreadable — never animated. */}
            {total !== null ? (
              <RollingNumber
                value={money(total)}
                variant="heroBalance"
                delay={STAGGER}
                containerStyle={{ marginTop: space.s6 }}
              />
            ) : balance.loading ? (
              <Placeholder width={190} height={46} style={{ marginTop: space.s8, borderRadius: radius.tile }} />
            ) : (
              <Price variant="heroBalance" style={{ marginTop: space.s6 }}>
                —
              </Price>
            )}
          </Press>
        </Rise>

        {/*
          Said on Home, before anything asks for a permission (PLAN.md 4.3). Where nothing settles — Base Sepolia, where
          1inch has no deployment — a strategy is watched and never filled, and a person who grants a permission and waits
          for a fill should not have to find that out three taps away.
        */}
        {fillsNothing ? (
          <View style={{ marginTop: space.s16, paddingHorizontal: space.gutter }}>
            <NoteStrip kind="blocked">
              Watch-only here: strategies are tracked, not traded.
            </NoteStrip>
          </View>
        ) : null}

        {/*
          What is left before the bot can trade. Under the watch-only note, because Permit asks for a permission and PLAN.md
          4.3 wants that note said first. Nothing until every read has answered; gone once the last step is done.
        */}
        {setup ? (
          <Rise index={2} style={{ marginTop: space.s16, paddingHorizontal: space.gutter }}>
            <SetupCard steps={setup} onOpen={(href) => router.push(href)} />
          </Rise>
        ) : null}

        {/* The sheet: a grabber, a rounded top, and it runs to the bottom — the reference's watchlist. */}
        <Rise
          index={2}
          style={{
            flexGrow: 1,
            marginTop: space.s26,
            paddingTop: space.s10,
            paddingBottom: space.s26,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            backgroundColor: colors.surfaceAlt,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: GRABBER_W,
              height: GRABBER_H,
              borderRadius: GRABBER_H / 2,
              backgroundColor: colors.ink28,
            }}
          />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: space.s14,
              borderBottomWidth: 1,
              borderBottomColor: colors.hairline,
            }}
          >
            {/* Four tabs scroll sideways on a narrow phone rather than crowding the Live dot out. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, flexShrink: 1 }}
              contentContainerStyle={{ gap: space.s22, paddingLeft: space.gutter, paddingRight: space.s14 }}
            >
              {TABS.map((t) => {
                const selected = t.key === tab;
                return (
                  <Press
                    key={t.key}
                    onPress={() => openTab(t.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    aria-selected={selected}
                    accessibilityLabel={t.label}
                    style={{
                      paddingBottom: space.s10,
                      borderBottomWidth: TAB_RULE,
                      borderBottomColor: selected ? colors.ink : colors.surfaceAlt,
                    }}
                  >
                    <Text variant="cardTitle" color={selected ? colors.ink : colors.ink40}>
                      {t.label}
                    </Text>
                  </Press>
                );
              })}
            </ScrollView>
            {/*
              Whether the agents can act right now, and the way to Safety — a dot, not a card. A limits read that failed
              is a dash: "Not trading" said about a permission nobody read is the claim Safety was rebuilt to stop making.
            */}
            <Press
              onPress={() => router.push('/safety')}
              accessibilityRole="button"
              accessibilityLabel={
                live
                  ? 'Trading is live. Open Safety.'
                  : limits.data
                    ? 'Not trading right now. Open Safety.'
                    : 'Couldn’t read whether anything can trade. Open Safety.'
              }
              style={{
                marginLeft: 'auto',
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.s6,
                paddingBottom: space.s10,
                paddingRight: space.gutter,
              }}
            >
              <View
                style={{
                  width: DOT,
                  height: DOT,
                  borderRadius: DOT / 2,
                  backgroundColor: live ? colors.up : colors.ink30,
                }}
              />
              {limits.loading && !limits.data ? (
                <Placeholder width={44} height={12} />
              ) : (
                <Text variant="secondarySm" color={colors.ink55}>
                  {!limits.data ? '—' : live ? 'Live' : killed ? 'Stopped' : 'Not trading'}
                </Text>
              )}
            </Press>
          </View>

          <View style={{ paddingHorizontal: space.gutter, marginTop: space.s4 }}>
            {tab === 'agents' ? (
              agents.loading && !agents.data ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.s18 }}>
                  {Array.from({ length: AGENT_SLOTS }, (_, i) => (
                    <View key={i} style={{ width: TILE_W, alignItems: 'center', gap: space.s8 }}>
                      <Placeholder width={ORB} height={ORB} style={{ borderRadius: radius.full }} />
                      <Placeholder width={ORB} height={space.s10} />
                    </View>
                  ))}
                </View>
              ) : agents.error ? (
                <TabFailed what="agents" error={agents.error} onRetry={agents.reload} />
              ) : roster.length === 0 ? (
                <Text variant="body" color={colors.ink55} style={{ marginTop: space.s16 }}>
                  No agents yet.
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.s18, marginTop: space.s18 }}>
                  {roster.map((a, i) => (
                    <Rise key={a.id} index={ROWS_FROM + i} style={{ width: TILE_W }}>
                      <Press
                        onPress={() => router.push(`/agent/${a.id}`)}
                        accessibilityRole="button"
                        accessibilityLabel={`${a.name}, ${a.hired ? 'hired' : 'not hired'}. ${a.role}`}
                        style={{ alignItems: 'center', gap: space.s8, paddingHorizontal: space.s4 }}
                      >
                        <AgentOrb gradient={agentGradient(a.name)} size={ORB} face />
                        {/* Two lines reserved for every name, so a short one does not lift its status line. */}
                        <Text
                          variant="orbName"
                          align="center"
                          numberOfLines={2}
                          style={{ minHeight: typeScale.orbName.lineHeight * 2 }}
                        >
                          {a.name}
                        </Text>
                        {/* Grey, never green: hired is a fact about the roster, not a profit. */}
                        <Text variant="orbStatus" color={a.hired ? colors.ink55 : colors.ink30}>
                          {a.hired ? 'Hired' : 'Not hired'}
                        </Text>
                      </Press>
                    </Rise>
                  ))}
                </View>
              )
            ) : tab === 'gainers' ? (
              classes.loading && !classes.data ? (
                <LoadingRows count={4} height={size.rowLg} spark />
              ) : classes.error ? (
                <TabFailed what="prices" error={classes.error} onRetry={classes.reload} />
              ) : gainers.length === 0 ? (
                <Text variant="body" color={colors.ink55} style={{ marginTop: space.s16 }}>
                  No gainers today.
                </Text>
              ) : (
                gainers.map((g, i) => {
                  const series = sparks.data?.[g.sym];
                  return (
                    <Rise key={g.sym} index={ROWS_FROM + i}>
                      <Row
                        height={size.rowLg}
                        divider={i < gainers.length - 1}
                        onPress={() => router.push(`/asset/${g.sym}`)}
                        left={<AssetMark gradient={{ c1: g.c1, c2: g.c2 }} {...logoProps(logos, g.sym)} size={size.mark} />}
                        title={g.sym}
                        secondary={g.name}
                        value={
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s10 }}>
                            {/* No glyph without a series — a flat line would claim the price never moved. */}
                            {series && series.length > 1 ? (
                              <Sparkline data={series} width={SPARK_W} height={SPARK_H} />
                            ) : sparks.loading && !sparks.data ? (
                              <Placeholder width={SPARK_W} height={SPARK_H} />
                            ) : null}
                            <Price variant="rowPrimary">{g.px}</Price>
                          </View>
                        }
                        delta={g.chg}
                        deltaTone="up"
                      />
                    </Rise>
                  );
                })
              )
            ) : tab === 'stocks' ? (
              !stocks.data ? (
                stocks.error ? (
                  <TabFailed what="stocks" error={stocks.error} onRetry={stocks.reload} />
                ) : (
                  <LoadingRows count={4} height={size.rowLg} />
                )
              ) : stockRows.length === 0 ? (
                <Text variant="body" color={colors.ink55} style={{ marginTop: space.s16 }}>
                  No stocks yet.
                </Text>
              ) : (
                stockRows.map((s, i) => (
                  <Rise key={s.symbol} index={ROWS_FROM + i}>
                    <Row
                      height={size.rowLg}
                      divider={i < stockRows.length - 1}
                      onPress={() => router.push(`/oracle/${s.symbol}`)}
                      left={<AssetMark gradient={assetGradient(s.symbol)} {...logoProps(logos, s.symbol)} size={size.mark} />}
                      title={s.symbol}
                      secondary={s.name}
                      value={
                        s.price === null ? (
                          <Text variant="rowPrimary" color={colors.ink55}>
                            No price
                          </Text>
                        ) : (
                          fmtPrice(s.price)
                        )
                      }
                    />
                  </Rise>
                ))
              )
            ) : !futures.data ? (
              futures.error ? (
                <TabFailed what="futures" error={futures.error} onRetry={futures.reload} />
              ) : (
                <LoadingRows count={4} height={size.rowLg} />
              )
            ) : perpRows.length === 0 ? (
              /* The venue answered with no live contracts: a sentence, not an empty sheet over an "All futures" of nothing. */
              <Text variant="body" color={colors.ink55} style={{ marginTop: space.s16 }}>
                No futures right now.
              </Text>
            ) : (
              <>
                {perpRows.map((m, i) => (
                  <Rise key={m.symbol} index={ROWS_FROM + i}>
                    <Row
                      height={size.rowLg}
                      onPress={() => router.push(`/perp/${m.symbol}`)}
                      left={<AssetMark gradient={assetGradient(m.symbol)} {...logoProps(logos, m.symbol)} size={size.mark} />}
                      title={m.symbol}
                      secondary={`Up to ${m.maxLeverage}x`}
                      value={fmtPrice(m.markPx)}
                      delta={m.change24hPct === null ? undefined : percent(m.change24hPct, 2)}
                      deltaTone={
                        m.change24hPct === null || m.change24hPct === 0 ? 'neutral' : m.change24hPct > 0 ? 'up' : 'down'
                      }
                    />
                  </Rise>
                ))}
                <Button
                  label="All futures"
                  variant="ghost"
                  onPress={() => router.push('/futures')}
                  style={{ marginTop: space.s16 }}
                />
              </>
            )}
          </View>
        </Rise>
      </ScrollView>
    </Screen>
  );
}
