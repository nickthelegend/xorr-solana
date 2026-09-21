/**
 * Home — the reference video's layout, on this app's theme (2026-09-12).
 *
 * Top to bottom: who is signed in — the Privy wallet, tap for the profile; ONE balance — its name opens
 * the portfolio, where your coins, positions, profit, cash and earnings live, and a tap on the figure
 * hides every amount in the app (FEATURES.md #47); for a wallet that cannot trade yet, the three steps it
 * has left (FEATURES.md #14); and a sheet with the agents, today's gainers, and — since 2026-09-13 —
 * tokenized stocks and futures. A single figure on top is deliberate: the breakdown belongs to the
 * portfolio.
 *
 * Everything arrives the way the reference's screens do, through `<Rise>` and `<RollingNumber>`, so
 * reduced motion turns it off.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { AccessibilityInfo, Pressable, ScrollView, View } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { agentGradient, assetGradient } from '@/design/gradients';
import { Icon } from '@/design/Icon';
import { useMadeAgents } from '@/chat/agents';
import { solanaStandingOnChain } from '@/wallet/solanaStanding';
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
import { selectionTick } from '@/ui/haptics';
import { repos } from '@/data';
import { NotSignedIn, isRetryable } from '@/data/apiError';
import { system } from '@/data/system';
import { useAsync } from '@/data/useAsync';
import { freshness } from '@/data/staleness';
import { useExecutorReachable } from '@/net/Reachability';
import { useFreshOnReturn } from '@/data/useFreshOnReturn';
import { logoProps, perpLogoProps, useLogos } from '@/data/useLogos';
import { usePrivyIdentity } from '@/auth/usePrivyIdentity';
import { useSignedOut } from '@/auth/useSignedOut';
import { useHasHydrated, useStore } from '@/state/store';
import { useNow } from '@/state/useNow';
import type { Agent, Instrument } from '@/data/types';
import {
  nothingSettles,
  setupComplete,
  setupSteps,
  type SetupStanding,
  type SetupStep,
  type SetupStepKey,
  type SetupStepState,
} from '@/state/derived';
import type { Address } from 'viem';
import { isSolana, pinnedDelegation } from '@/chain';
import { xStockGainers } from '@/markets/xstockClass';
import { chainAccess } from '@/wallet/chainAccess';
import { standingOnChain } from '@/wallet/delegationChain';
import { killSwitchChip } from '@/state/killSwitch';
import { KillSwitchChip } from '@/ui/KillSwitchChip';
import { TradingTicker } from '@/ui/TradingTicker';
import { usePoll } from '@/data/usePoll';
import { strategyLibrary } from '@/data/strategyLibrary';
import { StrategyRows } from '@/ui/StrategyRows';

type SheetTab = 'agents' | 'gainers' | 'stocks' | 'strategies' | 'futures';

const ALL_TABS: readonly { key: SheetTab; label: string }[] = [
  { key: 'agents', label: 'Agents' },
  { key: 'gainers', label: 'Gainers' },
  { key: 'stocks', label: 'Stocks' },
  { key: 'strategies', label: 'Strategies' },
  { key: 'futures', label: 'Futures' },
];
/** Futures are Hyperliquid data with nothing tradable on Solana, so the Solana build has no Futures tab. */
const TABS = isSolana ? ALL_TABS.filter((t) => t.key !== 'futures') : ALL_TABS;

const AVATAR = 40;
const GRABBER_W = 36;
const GRABBER_H = 4;
const TAB_RULE = 2;

/** How often the present-tense line asks again. A run is seconds of work, so this is often enough to catch one. */
const TICKER_EVERY_MS = 15_000;
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
/** A sideways drag this far, or this fast, moves to the next tab; under the slop it is still a tap or a scroll. */
const SWIPE_SLOP = 16;
const SWIPE_AFTER = 56;
const SWIPE_VELOCITY = 600;
/** Arrival order: header, balance, sheet — then each row after the sheet. */
const ROWS_FROM = 3;

/** `Instrument.chg` is formatted for display; this reads its size back out, for sorting. */
function magnitude(chg: string): number {
  const n = Number(chg.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
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
  checking: 'checking',
  unknown: 'couldn’t check',
};

/** Where each step goes, said to a screen reader. */
const STEP_OPENS: Readonly<Record<SetupStepKey, string>> = {
  fund: 'Deposit',
  permit: 'the limits',
  trade: 'Strategies',
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
            ) : step.state === 'checking' ? (
              /*
                Still being read. The skeleton's own block, at the mark's size: it is the app's one way of saying "still
                coming", and this is that — not a step that is unknown, and certainly not one that is still to do.
              */
              <Placeholder
                width={STEP_MARK}
                height={STEP_MARK}
                color={colors.switchOff}
                style={{ borderRadius: STEP_MARK / 2 }}
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
  const { email } = usePrivyIdentity();
  /* `/?tab=futures` opens straight onto a tab — for links from elsewhere in the app. */
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<SheetTab>(() => (isSheetTab(params.tab) ? params.tab : 'agents'));
  /* Stocks and futures load the first time their tab opens: Home does not pay for a tab nobody looked at. */
  const [opened, setOpened] = useState<ReadonlySet<SheetTab>>(() => new Set([tab]));
  const tabsRef = useRef<ScrollView>(null);
  const openTab = (key: SheetTab) => {
    setTab(key);
    setOpened((prev) => (prev.has(key) ? prev : new Set([...prev, key])));
  };
  /*
   * A link that names a tab opens it, even when Home is already mounted (2026-09-20).
   *
   * `tab` was seeded from the param once, in `useState`, so `xorr:///?tab=strategies` did nothing
   * to a Home that was already on screen — which is every time but the first. A deep link that
   * silently lands you on the tab you were already looking at is worse than one that fails.
   */
  const wantedTab = isSheetTab(params.tab) ? params.tab : undefined;
  useEffect(() => {
    if (wantedTab) openTab(wantedTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedTab]);
  // The row of tabs scrolls sideways on a narrow phone, so the one opened — by a swipe too — is brought into view.
  useEffect(() => {
    if (TABS.findIndex((t) => t.key === tab) >= TABS.length / 2) tabsRef.current?.scrollToEnd({ animated: false });
    else tabsRef.current?.scrollTo({ x: 0, animated: false });
  }, [tab]);
  /*
   * Swiping the sheet sideways moves to the next tab or the one before (2026-09-16).
   *
   * Horizontal only: `failOffsetY` hands a vertical drag back to the page's scroll before this claims it, and the row of
   * tabs keeps its own sideways scroll because the gesture is on the content under it. Nothing animates; the tab changes
   * as a tap on it would.
   */
  const swipeTabs = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-SWIPE_SLOP, SWIPE_SLOP])
    .failOffsetY([-SWIPE_SLOP, SWIPE_SLOP])
    .onEnd((e) => {
      const toNext = e.translationX < -SWIPE_AFTER || e.velocityX < -SWIPE_VELOCITY;
      const toPrevious = e.translationX > SWIPE_AFTER || e.velocityX > SWIPE_VELOCITY;
      const next = TABS[TABS.findIndex((t) => t.key === tab) + (toNext ? 1 : toPrevious ? -1 : 0)];
      if ((toNext || toPrevious) && next) openTab(next.key);
    });

  const balance = useAsync(() => repos.portfolio.balance(), []);
  const limits = useAsync(() => system.limits(), []);
  const agents = useAsync(() => repos.bot.listAgents(), []);
  const rememberAgents = useMadeAgents((st) => st.remember);
  useEffect(() => {
    if (agents.data) rememberAgents(agents.data);
  }, [agents.data, rememberAgents]);
  const classes = useAsync(() => repos.markets.listClasses(), []);
  const stocksOpened = opened.has('stocks');
  const futuresOpened = opened.has('futures');
  // On Solana, Gainers ranks the xStocks, so it reads the same snapshot as the Stocks tab.
  const stocksWanted = stocksOpened || (isSolana && opened.has('gainers'));
  const stocks = useAsync(async () => (stocksWanted ? system.stocks() : null), [stocksWanted]);
  const futures = useAsync(async () => (futuresOpened ? repos.perps.markets() : null), [futuresOpened]);
  /*
   * The research book, fetched only once the tab is opened.
   *
   * Survivors by default — the server decides that, not the screen, so every caller of the endpoint
   * gets the same honest default. `showAllStrategies` is the reader asking to see the 303 that were
   * cut, which is evidence for the ten rather than noise beside them.
   */
  const strategiesOpened = opened.has('strategies');
  const [showAllStrategies, setShowAllStrategies] = useState(false);
  const library = useAsync(
    async () => (strategiesOpened ? strategyLibrary.list({ all: showAllStrategies }) : null),
    [strategiesOpened, showAllStrategies],
  );
  /* What this deployment trades and watches: nothing to trade beside things to watch is a chain that fills nothing. */
  const tradable = useAsync(() => system.tradable(), []);
  const watchable = useAsync(() => system.watchable(), []);
  // Coming back to Home reads its figures again (FEATURES.md #27): a sale, a deposit or a stop elsewhere moves every one.
  useFreshOnReturn(balance, limits, agents, classes, stocks, futures);

  /*
   * Today's gainers: instruments on a LIVE feed whose change is up, largest first.
   *
   * Only live feeds — an instrument with no feed behind it has no change to rank, and ranking the
   * design prototype's numbers is how an app ends up recommending a move that never happened.
   */
  const xGainers = useMemo(
    () => (isSolana ? xStockGainers(stocks.data ?? [], GAINERS, { price: fmtPrice, percent: (n) => percent(n, 2) }) : null),
    [stocks.data],
  );
  const gainers = useMemo<Instrument[]>(() => {
    if (xGainers) return xGainers.gainers;
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
  }, [classes.data, xGainers]);
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

  const fillsNothing = nothingSettles(tradable.data, watchable.data);

  /*
   * What a new wallet still has to do before the bot can trade for it (FEATURES.md #14): the balance above, the permission
   * as the chain holds it, and the strategies. The permission is read here rather than taken from the store, which holds
   * `null` both before its read and after one that found nothing, and keeps no failure at all.
   */
  const permission = useAsync(() => repos.wallet.delegation(), []);
  /*
   * The chain's own account of the permission, which is what the Permit step is decided from.
   *
   * Not the executor's record and not the stored flag. Both drift the moment anything happens elsewhere — another
   * device, a reload after site data is cleared — and this app has already shipped a green LIVE badge over a permission
   * the contract said was revoked. `standingOnChain` answers `unreadable` where it could not ask, which the step shows
   * as unknown rather than quietly falling back to something that is not the chain.
   */
  const standing = useAsync<SetupStanding>(async () => {
    const owner = wallet?.address as Address | undefined;
    if (!owner) return 'none';
    // Solana: the delegate on the owner's USDC account (2026-09-19). The EVM contract read answered "none" there.
    if (isSolana) return solanaStandingOnChain(owner, Date.now());
    return (await standingOnChain(chainAccess, owner, pinnedDelegation, Date.now())).kind;
  }, [wallet?.address]);
  /*
   * The trade step is a fill the executor recorded, not a strategy somebody created. A strategy's run is one kind; a
   * position is the other — the ledger is written only by a fill — and a buy from the ticket or by a hired agent opens
   * one without a run, so this wallet had five confirmed fills and a step still reading "not done yet" (2026-09-19).
   */
  const recordedRuns = useAsync(async () => {
    const [runs, held] = await Promise.all([system.runs(50), repos.portfolio.positions()]);
    return [...runs, ...held.map(() => ({ status: 'filled' }))];
  }, []);
  /*
   * The same runs, asked again on a clock, for the present-tense line (`TradingTicker`). `usePoll` only runs while this
   * screen is focused and never stacks a read behind itself, so a tab nobody is looking at asks nothing.
   */
  const liveRuns = usePoll(() => system.runs(20), TICKER_EVERY_MS);
  /*
   * What the agent saw on its last sweep, on the same clock as the runs. Home is where somebody looks to find out
   * whether the thing they hired is doing anything, and until this line existed the answer was always the same
   * sentence whether an agent was hired or not.
   */
  const lastLook = usePoll(() => system.agentLastLook(), TICKER_EVERY_MS);
  const signedOut = useSignedOut();
  const now = useNow();

  /*
   * Whether the balance above is current, or the last one read before the connection dropped.
   *
   * `reachable` decides it rather than the read itself: a read that succeeded a second before the
   * drop has no idea it is now stale, and only the heartbeat does. It shares the screen's existing
   * minute clock, so the age stays true as an outage runs on without adding a second timer.
   */
  const reachable = useExecutorReachable();
  const balanceAge = freshness({
    hasData: balance.data !== undefined,
    settledAt: balance.settledAt,
    reachable,
    now,
  });

  const setup = setupSteps({
    // Refused for want of a session is not a failed read: nobody's wallet was asked about.
    signedOut:
      signedOut || [balance.error, permission.error, recordedRuns.error].some((e) => e instanceof NotSignedIn),
    balance,
    standing,
    permission,
    fills: recordedRuns,
    now,
  });

  /*
   * Back from Deposit, the limits or Strategies, the steps are read again. Home is a tab and is not mounted afresh, so the
   * step just taken would go on saying it is still to do. Only while the card shows, so a wallet that is set up is not
   * re-read on every return; and not on the first focus, which is the mount and has its own reads. The limits come too,
   * or the dot beside the tabs would go on saying "Not trading" beside a permission the card has just ticked.
   */
  const settingUp = setup !== null && !setupComplete(setup);
  const setupShowing = useRef(settingUp);
  useEffect(() => {
    setupShowing.current = settingUp;
  }, [settingUp]);
  const firstFocus = useRef(true);
  const { reload: reloadBalance } = balance;
  const { reload: reloadLimits } = limits;
  const { reload: reloadPermission } = permission;
  const { reload: reloadRuns } = recordedRuns;
  const { reload: reloadStanding } = standing;
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
      reloadStanding();
      reloadRuns();
    }, [reloadBalance, reloadLimits, reloadPermission, reloadStanding, reloadRuns]),
  );

  /*
   * A tap on the figure hides every amount in the app, and the next tap shows them (FEATURES.md #47). The choice is the
   * device's and outlives a sign-out; `Price` and `RollingNumber` read it wherever a figure is drawn.
   */
  const balancesHidden = useStore((s) => s.balancesHidden);
  const toggleBalancesHidden = useStore((s) => s.toggleBalancesHidden);
  function toggleHidden() {
    selectionTick();
    toggleBalancesHidden();
    // Said as well as shown: the figure only turns to dots, and a screen reader cannot see that happen.
    AccessibilityInfo.announceForAccessibility(useStore.getState().balancesHidden ? 'Balance hidden' : 'Balance shown');
  }

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
          {/*
            Two targets since the figure became the switch that hides every amount (FEATURES.md #47): the name and its
            chevron still open the portfolio, and the figure hides and shows.
          */}
          <Press
            onPress={() => router.push('/portfolio')}
            accessibilityRole="button"
            accessibilityLabel="Total balance. Opens your portfolio."
            hitHeight={typeScale.eyebrow.lineHeight}
            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space.s6 }}
          >
            <Eyebrow>Total balance</Eyebrow>
            <Icon name="chevron" size={11} color={colors.ink40} />
          </Press>
          <Press
            onPress={toggleHidden}
            accessibilityRole="button"
            accessibilityLabel={
              balancesHidden ? 'Balance hidden' : `Balance shown, ${total !== null ? money(total) : 'not available'}`
            }
            accessibilityHint={balancesHidden ? 'Shows every amount.' : 'Hides every amount.'}
          >
            {/*
              Rolls in once it is real, a placeholder while on its way, a dash when unreadable. `roll` hands each
              changed character over to the next when the balance moves — the person's own money, where a change is an
              event; a market quote still snaps. Hidden, it is four dots, as every amount is, and dots do not roll.
            */}
            {total !== null ? (
              <RollingNumber
                value={money(total)}
                variant="heroBalance"
                delay={STAGGER}
                roll
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

          {/*
            A figure from before the outage says so, and says when.

            Keeping the last good read rather than emptying the screen avoids one lie — an account
            that looks empty because the connection dropped — and introduces the opposite one: a
            balance from twenty minutes ago drawn exactly like a live one, on the screen someone
            reads to decide whether to intervene. There is no third option: it is live, or it is
            dated (`data/staleness.ts`).
          */}
          {balanceAge.state === 'last-known' ? (
            <Text
              variant="footnote"
              color={colors.warn}
              style={{ marginTop: space.s6 }}
              accessibilityLiveRegion="polite"
            >
              {balanceAge.label}
            </Text>
          ) : null}
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
        {setup && !setupComplete(setup) ? (
          <Rise index={2} style={{ marginTop: space.s16, paddingHorizontal: space.gutter }}>
            <SetupCard steps={setup} onOpen={(href) => router.push(href)} />
          </Rise>
        ) : null}

        {/*
          What the agents are doing at this moment, from runs the executor recorded as still open (FEATURES.md #33).
          The app could say what the bot HAD done and what it was ALLOWED to do, and never that it was doing something.

          Polled rather than read once, because the claim is present-tense — and only while this screen is focused, so
          a tab nobody is looking at is not asking. A run left open by a crash is reported as stuck rather than as
          trading; a read that failed says so rather than resolving into "nothing is happening", which is itself a
          claim somebody might act on.
        */}
        {signedOut ? null : (
          <Rise index={2} style={{ marginTop: space.s12, paddingHorizontal: space.gutter }}>
            <TradingTicker
              runs={liveRuns.data}
              failed={liveRuns.error !== undefined}
              lastLook={lastLook.data?.looked ? lastLook.data : null}
            />
          </Rise>
        )}

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
              ref={tabsRef}
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
              Whether the agents can act right now, and the way to Safety.

              From THE CHAIN (`standing`), not from `store.killed` and not from the executor's `/limits`. The stored
              flag is a boolean this browser wrote when someone pressed the button here, and it drifts the moment
              anything happens anywhere else — a revoke from another device, a permission that expired on its own, a
              reload after site data was cleared. This app has already shipped a green LIVE badge over a permission the
              contract reported revoked, and that is exactly this bug.

              Armed is claimed only where the chain said `live`. A chain that could not be read says so, in amber: a
              grey dot would read as a settled, harmless "off", and rounding "could not ask" down to "stopped" tells
              someone the agents are off when they may be trading.
            */}
            <Press
              onPress={() => router.push('/safety')}
              accessibilityRole="button"
              accessibilityLabel={`${killSwitchChip(standing.data, standing.error !== undefined).detail} Open Safety.`}
              style={{
                marginLeft: 'auto',
                flexDirection: 'row',
                alignItems: 'center',
                paddingBottom: space.s10,
                paddingRight: space.gutter,
              }}
            >
              <KillSwitchChip standing={standing.data} failed={standing.error !== undefined} />
            </Press>
          </View>

          <GestureDetector gesture={swipeTabs}>
            <View style={{ flexGrow: 1, paddingHorizontal: space.gutter, marginTop: space.s4 }}>
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
                    {/* Making one of your own, where the agents are (2026-09-16). */}
                    <Rise index={ROWS_FROM + roster.length} style={{ width: TILE_W }}>
                      <Press
                        onPress={() => router.push('/agent/new')}
                        accessibilityRole="button"
                        accessibilityLabel="New agent. Make one of your own"
                        style={{ alignItems: 'center', gap: space.s8, paddingHorizontal: space.s4 }}
                      >
                        <View
                          style={{
                            width: ORB,
                            height: ORB,
                            borderRadius: ORB / 2,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1.5,
                            borderStyle: 'dashed',
                            borderColor: colors.ink28,
                          }}
                        >
                          <Icon name="plus" size={26} color={colors.ink55} strokeWidth={2} />
                        </View>
                        <Text
                          variant="orbName"
                          align="center"
                          numberOfLines={2}
                          style={{ minHeight: typeScale.orbName.lineHeight * 2 }}
                        >
                          New agent
                        </Text>
                        <Text variant="orbStatus" color={colors.ink30}>
                          Make one
                        </Text>
                      </Press>
                    </Rise>
                  </View>
                )
              ) : tab === 'gainers' ? (
                (isSolana ? stocks.loading && !stocks.data : classes.loading && !classes.data) ? (
                  <LoadingRows count={4} height={size.rowLg} spark />
                ) : isSolana && stocks.error ? (
                  <TabFailed what="prices" error={stocks.error} onRetry={stocks.reload} />
                ) : !isSolana && classes.error ? (
                  <TabFailed what="prices" error={classes.error} onRetry={classes.reload} />
                ) : gainers.length === 0 ? (
                  <Text variant="body" color={colors.ink55} style={{ marginTop: space.s16 }}>
                    {xGainers && !xGainers.measured
                      ? 'Gainers show once a full day of xStock prices is recorded.'
                      : isSolana
                        ? 'No xStock is up over the last day.'
                        : 'No gainers today.'}
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
                              <Price variant="rowPrimary" figure="market">
                                {g.px}
                              </Price>
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
                  <>
                    {/*
                      * Pre-IPO sits above the listed names, not among them.
                      *
                      * A T-Token tracks a company with no exchange behind it, so nothing about it
                      * can be compared to the rows below on the numbers those rows show. Its own
                      * entry keeps that difference visible instead of burying three private
                      * companies in a list of listed ones.
                      */}
                    <Rise index={ROWS_FROM}>
                      <Row
                        height={size.rowLg}
                        divider
                        onPress={() => router.push('/pre-ipo')}
                        left={<AssetMark gradient={assetGradient('T-SpaceX')} size={size.mark} />}
                        title="Pre-IPO"
                        secondary="SpaceX, OpenAI and Kalshi, tokenised by Tessera"
                        value={
                          <Text variant="rowPrimary" color={colors.ink55}>
                            3
                          </Text>
                        }
                        figure="market"
                      />
                    </Rise>
                    {stockRows.map((s, i) => (
                    <Rise key={s.symbol} index={ROWS_FROM + i}>
                      <Row
                        height={size.rowLg}
                        divider={i < stockRows.length - 1}
                        onPress={() => router.push(isSolana ? `/xstock/${s.symbol}` : `/oracle/${s.symbol}`)}
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
                        figure="market"
                      />
                    </Rise>
                    ))}
                  </>
                )
              ) : tab === 'strategies' ? (
                !library.data ? (
                  library.error ? (
                    <TabFailed what="strategies" error={library.error} onRetry={library.reload} />
                  ) : (
                    <LoadingRows count={4} height={size.rowLg} />
                  )
                ) : (
                  <>
                    {/*
                      * The headline is the ratio, not the count. "313 strategies" sounds like an
                      * asset; "313 tested, 10 survived" is what the research actually found, and
                      * it is the sentence the whole screen is built to support.
                      */}
                    <Text variant="bodySm" color={colors.ink55} style={{ marginBottom: space.s8 }}>
                      {library.data.counts.total} tested against a walk-forward gauntlet ·{' '}
                      <Text variant="bodySm" color={colors.up}>
                        {library.data.counts.survivors} survived
                      </Text>
                      . Backtests, not a live record.
                    </Text>
                    <StrategyRows
                      rows={library.data.strategies}
                      from={ROWS_FROM}
                      onOpen={(id) => router.push(`/strategy-library/${id}`)}
                    />
                    <Pressable
                      onPress={() => setShowAllStrategies((v) => !v)}
                      style={{ paddingVertical: space.s12 }}
                      accessibilityRole="button"
                      accessibilityLabel={showAllStrategies ? 'Show only strategies that survived' : 'Show every strategy tested'}
                      testID="strategies-toggle-all"
                    >
                      <Text variant="body" color={colors.ink55}>
                        {showAllStrategies
                          ? 'Show only what survived'
                          : `Show all ${library.data.counts.total}, including the ${library.data.counts.total - library.data.counts.survivors} that were cut`}
                      </Text>
                    </Pressable>
                  </>
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
                        left={<AssetMark gradient={assetGradient(m.symbol)} {...perpLogoProps(logos, m.symbol)} size={size.mark} />}
                        title={m.symbol}
                        secondary={`Up to ${m.maxLeverage}x`}
                        value={fmtPrice(m.markPx)}
                        figure="market"
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
          </GestureDetector>
        </Rise>
      </ScrollView>
    </Screen>
  );
}
