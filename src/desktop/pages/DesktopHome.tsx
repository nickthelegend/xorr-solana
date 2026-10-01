/**
 * Home on a laptop (2026-10-01): the phone's Home, laid out as a dashboard.
 *
 * The phone stacks one balance over a sheet of tabs, because a phone shows one list at a time. A laptop has room for all
 * of them at once, and a tab bar on a 1300px page hides three lists behind a click for no reason. So the same reads the
 * phone's Home makes — the balance, the agents' last look, the roster with its trades and P&L, the xStocks and the three
 * pre-IPO tokens, the permission as the chain holds it — are drawn side by side, in rows of cards:
 *
 *   1. the portfolio (the one figure, what the agents are doing, and the three things to do next) beside whether they
 *      can trade at all;
 *   2. the agents at work beside today's gainers;
 *   3. every xStock as a table beside the pre-IPO tokens.
 *
 * Nothing here asks the executor anything the phone's Home, the xStocks screen or the Pre-IPO screen does not already
 * ask, and every rule those screens state — armed only on a live chain read, no change where none was measured, a pool
 * price shown with its mark — holds here for the same reason. The rows wrap below their basis, so the narrowest desktop
 * window (1080 less the sidebar) stacks a row's second card rather than squeezing it.
 */
import React, { useEffect, useMemo } from 'react';
import { AccessibilityInfo, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import type { Address } from 'viem';
import { agentGradient, assetGradient } from '@/design/gradients';
import { Icon, type IconName } from '@/design/Icon';
import { useMadeAgents } from '@/chat/agents';
import { solanaStandingOnChain } from '@/wallet/solanaStanding';
import {
  AgentOrb,
  AssetMark,
  Eyebrow,
  LoadingRows,
  NoteStrip,
  Placeholder,
  Price,
  Sparkline,
  Text,
  alpha,
  colors,
  money,
  percent,
  price as fmtPrice,
  radius,
  size,
  space,
} from '@/ui';
import { KillSwitchChip } from '@/ui/KillSwitchChip';
import { TradingTicker } from '@/ui/TradingTicker';
import { selectionTick } from '@/ui/haptics';
import { compactMoney } from '@/format';
import { repos } from '@/data';
import { api } from '@/data/api';
import { NotSignedIn, isRetryable } from '@/data/apiError';
import { system, limitsView, type XStockRow } from '@/data/system';
import { preIpo, type PreIpoRow } from '@/data/preIpo';
import { useAsync } from '@/data/useAsync';
import { usePoll } from '@/data/usePoll';
import { freshness } from '@/data/staleness';
import { useFreshOnReturn } from '@/data/useFreshOnReturn';
import { logoProps, useLogos } from '@/data/useLogos';
import { useExecutorReachable } from '@/net/Reachability';
import { useSignedOut } from '@/auth/useSignedOut';
import { useHasHydrated, useStore } from '@/state/store';
import { useNow } from '@/state/useNow';
import { expiryState, nothingSettles, timeLeft, type SetupStanding } from '@/state/derived';
import { killSwitchChip } from '@/state/killSwitch';
import { lastLookHeadline } from '@/state/tradingNow';
import { isSolana, pinnedDelegation } from '@/chain';
import { xStockGainers } from '@/markets/xstockClass';
import { chainAccess } from '@/wallet/chainAccess';
import { standingOnChain } from '@/wallet/delegationChain';
import type { Agent, Instrument } from '@/data/types';
import { DesktopPage } from '../DesktopShell';
import { Card } from '../parts/Card';

/** The same clock the phone's present-tense line keeps. */
const TICKER_EVERY_MS = 15_000;
/** Top movers: as many as the phone's Gainers tab lists. */
const GAINERS = 8;
const SPARK_W = 64;
const SPARK_H = 22;
/** The gap between cards, across and down. */
const GAP = space.s20;
/** A row in a card's list. Taller than a phone row's text, shorter than `rowLg`: a mouse needs less than a thumb. */
const ROW_H = 56;
/** A pre-IPO spread this wide is said in amber, as the Pre-IPO screen says it: wide is a warning whichever way it points. */
const WIDE_SPREAD_PCT = 10;

/** `Instrument.chg` is formatted for display; this reads its size back out, for sorting (as the phone's Home does). */
function magnitude(chg: string): number {
  const n = Number(chg.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function tone(v: number | null | undefined): string {
  return v == null || v === 0 ? colors.ink55 : v > 0 ? colors.up : colors.down;
}

function count(n: number, one: string): string {
  return `${n} ${n === 1 ? one : `${one}s`}`;
}

/** What the pool asks over the listed share's own mark, in percent; null where either is missing. */
function premiumPct(row: XStockRow): number | null {
  if (row.price === null || row.underlyingPrice === null || row.underlyingPrice <= 0) return null;
  return (row.price / row.underlyingPrice - 1) * 100;
}

type HoverState = { hovered?: boolean; pressed: boolean };

/**
 * A row a mouse can find (2026-10-01). On a phone a row answers a press; on a laptop it has to answer the pointer
 * first, or a table of twenty rows gives no hint which of them open anything.
 */
function HoverRow({
  onPress,
  label,
  children,
  style,
  divider = true,
  testID,
}: {
  onPress: () => void;
  label: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  divider?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      testID={testID}
      style={({ hovered, pressed }: HoverState) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s12,
          minHeight: ROW_H,
          paddingHorizontal: space.s10,
          marginHorizontal: -space.s10,
          borderRadius: radius.square,
          borderBottomWidth: divider ? 1 : 0,
          borderBottomColor: colors.hairline,
          backgroundColor: hovered ? alpha('#FFFFFF', 0.035) : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** A quiet link in a card's header: "Explore agents ›". */
function CardLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={({ hovered }: HoverState) => ({ flexDirection: 'row', alignItems: 'center', gap: space.s4, opacity: hovered ? 1 : 0.8 })}
    >
      <Text variant="control" color={colors.ink65}>
        {label}
      </Text>
      <Icon name="chevron" size={11} color={colors.ink40} />
    </Pressable>
  );
}

/** One of the portfolio card's actions. White for the one most people come to do; the rest on the control grey. */
function Action({
  icon,
  label,
  onPress,
  primary,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ hovered, pressed }: HoverState) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s8,
        height: 42,
        paddingHorizontal: space.s18,
        borderRadius: radius.full,
        backgroundColor: primary ? colors.ink : hovered ? colors.controlPress : colors.control,
        opacity: pressed ? 0.75 : primary && hovered ? 0.9 : 1,
      })}
    >
      <Icon name={icon} size={16} color={primary ? colors.bg : colors.ink70} />
      <Text variant="control" color={primary ? colors.bg : colors.ink}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A read that failed, said as a failure, with a retry where asking again could answer differently (as the phone's `TabFailed`). */
function Failed({ what, error, onRetry }: { what: string; error: Error; onRetry: () => void }) {
  if (error instanceof NotSignedIn) return null;
  return (
    <View style={{ gap: space.s10, paddingVertical: space.s8 }}>
      <Text variant="body" color={colors.ink55}>
        {`Couldn’t load ${what}.`}
      </Text>
      {isRetryable(error) ? <CardLink label="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

/** A column heading in the markets table. */
function Th({ children, flex, right }: { children: string; flex: number; right?: boolean }) {
  return (
    <Text variant="eyebrowSm" color={colors.ink40} align={right ? 'right' : 'left'} style={{ flex, minWidth: 0 }}>
      {children}
    </Text>
  );
}

/** The markets table's column widths, shared by the heading and every row so they line up. */
const COL = { name: 2.4, price: 1.1, change: 0.9, premium: 1, liquidity: 1 } as const;

export function DesktopHome() {
  const router = useRouter();
  const hydrated = useHasHydrated();
  const wallet = useStore((s) => s.wallet);
  const walletChecked = useStore((s) => s.walletChecked);
  const signedOut = useSignedOut();
  const now = useNow();

  /* The phone's Home reads, one for one. */
  const balance = useAsync(() => repos.portfolio.balance(), []);
  const limits = useAsync(() => system.limits(), []);
  const agents = useAsync(() => repos.bot.listAgents(), []);
  const rememberAgents = useMadeAgents((st) => st.remember);
  useEffect(() => {
    if (agents.data) rememberAgents(agents.data);
  }, [agents.data, rememberAgents]);
  /*
   * On Solana the gainers rank the xStocks from `/market/stocks`, as the phone's do; elsewhere the catalogue's live
   * feeds. A laptop shows the list without a tab to open first, so it is read up front rather than on the first look.
   */
  const stocks = useAsync(async () => (isSolana ? system.stocks() : null), []);
  const classes = useAsync(async () => (isSolana ? null : repos.markets.listClasses()), []);
  /* The whole xStocks catalog, with the listed share's mark and the pool's depth — what the xStocks screen reads. */
  const catalog = useAsync(() => system.xstocks(), []);
  /* Tessera's three, with the issuer's mark beside the pool — what the Pre-IPO screen reads. */
  const pre = useAsync(() => preIpo.list(), []);
  const tradable = useAsync(() => system.tradable(), []);
  const watchable = useAsync(() => system.watchable(), []);
  const permission = useAsync(() => repos.wallet.delegation(), []);
  /* Armed or not, from the chain and nothing else — see the phone's Home and `state/killSwitch.ts`. */
  const standing = useAsync<SetupStanding>(async () => {
    const owner = wallet?.address as Address | undefined;
    if (!owner) return 'none';
    if (isSolana) return solanaStandingOnChain(owner, Date.now());
    return (await standingOnChain(chainAccess, owner, pinnedDelegation, Date.now())).kind;
  }, [wallet?.address]);
  const agentFunds = useAsync(() => (isSolana && !signedOut ? system.agentWallets() : Promise.resolve([])), [signedOut]);
  useFreshOnReturn(balance, limits, agents, stocks, classes, catalog, pre, permission, standing, agentFunds);

  const liveRuns = usePoll(() => system.runs(20), TICKER_EVERY_MS);
  const lastLook = usePoll(() => system.agentLastLook(), TICKER_EVERY_MS);
  const look = lastLook.data?.looked ? lastLook.data : null;
  const inCooldown = look?.outcome === 'cooldown';
  const cooldown = useAsync(
    async () => (inCooldown ? api.get<{ wallet: { cooldownUntil: number | null } }>('/agents/preview') : null),
    [inCooldown],
  );

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

  const catalogRows = useMemo(() => catalog.data?.rows ?? [], [catalog.data]);
  const markSyms = useMemo(() => [...gainerSyms, ...catalogRows.map((r) => r.symbol)], [gainerSyms, catalogRows]);
  const logos = useLogos(markSyms);

  const roster = useMemo<Agent[]>(
    () => [...(agents.data ?? [])].sort((a, b) => Number(!!b.hired) - Number(!!a.hired)),
    [agents.data],
  );
  const hired = roster.filter((a) => a.hired);
  const fundsOf = (id: string) => agentFunds.data?.find((w) => w.agentId === id && w.exists);

  const reachable = useExecutorReachable();
  const balanceAge = freshness({ hasData: balance.data !== undefined, settledAt: balance.settledAt, reachable, now });

  const balancesHidden = useStore((s) => s.balancesHidden);
  const toggleBalancesHidden = useStore((s) => s.toggleBalancesHidden);
  function toggleHidden() {
    selectionTick();
    toggleBalancesHidden();
    AccessibilityInfo.announceForAccessibility(useStore.getState().balancesHidden ? 'Balance hidden' : 'Balance shown');
  }

  // The phone's entry gate, kept here: "/" with no wallet is onboarding's, whichever layout is drawing it.
  if (hydrated && walletChecked && !wallet) return <Redirect href="/welcome" />;

  const total = balance.data?.total ?? null;
  const held = balance.data ? balance.data.holdings.reduce((n, h) => n + h.usd, 0) : null;
  const fillsNothing = nothingSettles(tradable.data, watchable.data);

  const chip = killSwitchChip(standing.data, standing.error !== undefined);
  const expiresAt = permission.data?.expiresAt ?? limits.data?.expiresAt;
  const ended = expiryState(expiresAt, now) === 'expired';
  const cap = limits.data ? limitsView(limits.data, ended) : null;
  const capUsd = limits.data ? Math.max(0, limits.data.dailyCapUsd) : 0;

  const trades = hired.reduce((n, a) => n + (a.trades ?? 0), 0);
  const pnl = hired.reduce((n, a) => n + (a.pnl30d ?? 0), 0);

  const preRows = pre.data?.rows ?? [];

  return (
    <DesktopPage>
      {/*
        Watch-only is said first, as it is on the phone (PLAN.md 4.3): before anything on this page offers a permission.
      */}
      {fillsNothing ? <NoteStrip kind="blocked">Watch-only here: strategies are tracked, not traded.</NoteStrip> : null}

      {/* ─── Row 1: the portfolio, and whether the agents can trade ─── */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
        <Card style={{ flexGrow: 2, flexBasis: 520 }} testID="desktop-home-portfolio">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s12 }}>
            <Pressable
              onPress={() => router.push('/portfolio')}
              accessibilityRole="link"
              accessibilityLabel="Total balance. Opens your portfolio."
              style={({ hovered }: HoverState) => ({ flexDirection: 'row', alignItems: 'center', gap: space.s6, opacity: hovered ? 1 : 0.85 })}
            >
              <Eyebrow>Portfolio</Eyebrow>
              <Icon name="chevron" size={11} color={colors.ink40} />
            </Pressable>
          </View>

          {/* The figure hides and shows every amount, as the phone's does (FEATURES.md #47). */}
          <Pressable
            onPress={toggleHidden}
            accessibilityRole="button"
            accessibilityLabel={balancesHidden ? 'Balance hidden' : `Balance shown, ${total !== null ? money(total) : 'not available'}`}
            accessibilityHint={balancesHidden ? 'Shows every amount.' : 'Hides every amount.'}
            style={{ alignSelf: 'flex-start', marginTop: space.s10 }}
          >
            {total !== null ? (
              <Text variant="heroBalance" figure="own">
                {money(total)}
              </Text>
            ) : balance.loading ? (
              <Placeholder width={220} height={50} style={{ borderRadius: radius.tile }} />
            ) : (
              <Price variant="heroBalance">—</Price>
            )}
          </Pressable>

          {/*
            No change on the day: the executor's balance is the chain's holding now, with no record of this morning's, and
            a "today" figure worked out from positions would be a different source disagreeing with the one above. What
            the figure is made of is said instead — the breakdown the portfolio opens on.
          */}
          {balance.data ? (
            <Text variant="secondary" color={colors.ink55} figure="own" style={{ marginTop: space.s6 }}>
              {`Cash ${money(balance.data.cash)} · Holdings ${money(held ?? 0)}${
                balance.data.agents > 0 ? ` · In agent wallets ${money(balance.data.agents)}` : ''
              }`}
            </Text>
          ) : null}
          {balanceAge.state === 'last-known' ? (
            <Text variant="footnote" color={colors.warn} style={{ marginTop: space.s6 }} accessibilityLiveRegion="polite">
              {balanceAge.label}
            </Text>
          ) : null}

          {/* What the agents are doing right now, and what they saw on their last look — the phone's ticker, verbatim. */}
          {signedOut ? null : (
            <View
              style={{
                marginTop: space.s18,
                paddingVertical: space.s12,
                paddingHorizontal: space.s14,
                borderRadius: radius.tile,
                backgroundColor: colors.surfaceAlt,
              }}
            >
              <TradingTicker
                runs={liveRuns.data}
                failed={liveRuns.error !== undefined}
                lastLook={
                  look ? { headline: lastLookHeadline(look, { cooldownUntil: cooldown.data?.wallet.cooldownUntil, now }) } : null
                }
                lines={2}
              />
            </View>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s10, marginTop: space.s18 }}>
            <Action icon="plus" label="Deposit" primary onPress={() => router.push('/deposit')} />
            {/* The permission step's own screen, as the phone's setup card opens it. */}
            <Action icon="bot" label="Let the bot trade" onPress={() => router.push('/delegate')} />
            <Action icon="shield" label={chip.armed ? 'Stop trading' : 'Safety'} onPress={() => router.push('/safety')} />
          </View>
        </Card>

        <Card
          title="Trading status"
          right={<CardLink label="Safety" onPress={() => router.push('/safety')} />}
          style={{ flexGrow: 1, flexBasis: 300 }}
          testID="desktop-home-status"
        >
          {/* From the chain, never the stored flag: armed only where the chain said live (`state/killSwitch.ts`). */}
          <Pressable
            onPress={() => router.push('/safety')}
            accessibilityRole="link"
            accessibilityLabel={`${chip.detail} Open Safety.`}
            style={{ alignSelf: 'flex-start' }}
          >
            <KillSwitchChip standing={standing.data} failed={standing.error !== undefined} />
          </Pressable>
          <Text variant="bodySm" color={colors.ink55} style={{ marginTop: space.s12 }}>
            {chip.detail}
          </Text>

          {/*
            Today's spend against the cap, from the one basis `limitsView` draws it from, and the time the permission has
            left — both already read for the phone, so they cost nothing more here. Only for a permission that exists: a
            never-granted one has no cap worth drawing as used.
          */}
          {cap && capUsd > 0 && limits.data?.granted !== false ? (
            <View style={{ marginTop: space.s20, gap: space.s8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text variant="secondary" color={colors.ink55} style={{ flex: 1 }}>
                  Cap used today
                </Text>
                <Text variant="rowPrimary" figure="own">
                  {`${money(cap.spent)} of ${money(capUsd)}`}
                </Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.control, overflow: 'hidden' }}>
                <View
                  style={{
                    width: `${Math.round(cap.fraction * 100)}%`,
                    height: '100%',
                    borderRadius: 3,
                    backgroundColor: colors.ink70,
                  }}
                />
              </View>
              {!cap.agree ? (
                <Text variant="footnote" color={colors.warn}>
                  The chain and the executor count today’s spend differently; the stricter is shown.
                </Text>
              ) : null}
            </View>
          ) : limits.loading && !limits.data ? (
            <Placeholder height={40} style={{ marginTop: space.s20, borderRadius: radius.tileSm }} />
          ) : null}

          {chip.armed && expiresAt ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: space.s14 }}>
              <Text variant="secondary" color={colors.ink55} style={{ flex: 1 }}>
                Permission ends in
              </Text>
              <Text variant="rowPrimary" accessibilityLabel={`Permission ends in ${timeLeft(expiresAt, now).words}`}>
                {timeLeft(expiresAt, now).figure}
              </Text>
            </View>
          ) : null}
        </Card>
      </View>

      {/* ─── Row 2: the agents at work, and today's gainers ─── */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
        <Card
          title="Agents at work"
          right={<CardLink label="Explore agents" onPress={() => router.push('/bot/roster')} />}
          style={{ flexGrow: 1, flexBasis: 420 }}
          testID="desktop-home-agents"
        >
          {agents.loading && !agents.data ? (
            <LoadingRows count={3} height={ROW_H} />
          ) : agents.error ? (
            <Failed what="agents" error={agents.error} onRetry={agents.reload} />
          ) : hired.length === 0 ? (
            <View style={{ gap: space.s12 }}>
              <Text variant="body" color={colors.ink55}>
                No agent is hired yet. Hire one and it trades from a wallet of its own, inside your limits.
              </Text>
              <View style={{ flexDirection: 'row' }}>
                <Action icon="bot" label="Explore agents" onPress={() => router.push('/bot/roster')} />
              </View>
            </View>
          ) : (
            <>
              <Text variant="body" color={colors.ink55} figure="own" style={{ marginBottom: space.s8 }}>
                {trades === 0
                  ? `${count(hired.length, 'agent')} · no trades yet`
                  : `${count(hired.length, 'agent')} · ${count(trades, 'trade')} · ${money(pnl, { signed: true })} this month`}
              </Text>
              {hired.map((a, i) => {
                const funds = fundsOf(a.id)?.usdc;
                return (
                  <HoverRow
                    key={a.id}
                    onPress={() => router.push(`/agent/${a.id}`)}
                    label={`${a.name}, ${a.trades > 0 ? `${count(a.trades, 'trade')}, ${a.win}% win` : 'no trades yet'}`}
                    divider={i < hired.length - 1}
                    style={{ minHeight: 68 }}
                  >
                    <AgentOrb gradient={agentGradient(a.name)} size={52} face />
                    <View style={{ flex: 1, minWidth: 0, gap: space.s2 }}>
                      <Text variant="rowPrimary" numberOfLines={1}>
                        {a.name}
                      </Text>
                      <Text variant="secondary" color={colors.ink55} numberOfLines={1}>
                        {a.trades > 0 ? `${count(a.trades, 'trade')} · ${a.win}% win` : 'No trades yet'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: space.s2 }}>
                      <Text variant="rowPrimary" color={tone(a.pnl30d)} figure="own">
                        {money(a.pnl30d, { signed: true })}
                      </Text>
                      {funds !== undefined ? (
                        <Text variant="secondary" color={colors.ink55} figure="own">
                          {`${money(funds)} to trade`}
                        </Text>
                      ) : null}
                    </View>
                  </HoverRow>
                );
              })}
            </>
          )}
        </Card>

        <Card
          title="Top movers"
          right={<CardLink label="All markets" onPress={() => router.push('/xstocks')} />}
          style={{ flexGrow: 1, flexBasis: 380 }}
          testID="desktop-home-movers"
        >
          {(isSolana ? stocks.loading && !stocks.data : classes.loading && !classes.data) ? (
            <LoadingRows count={4} height={ROW_H} spark />
          ) : isSolana && stocks.error ? (
            <Failed what="prices" error={stocks.error} onRetry={stocks.reload} />
          ) : !isSolana && classes.error ? (
            <Failed what="prices" error={classes.error} onRetry={classes.reload} />
          ) : gainers.length === 0 ? (
            <Text variant="body" color={colors.ink55}>
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
                <HoverRow
                  key={g.sym}
                  onPress={() => router.push(`/asset/${g.sym}`)}
                  label={`${g.sym}, ${g.name}, ${g.px}, ${g.chg}`}
                  divider={i < gainers.length - 1}
                >
                  <AssetMark gradient={{ c1: g.c1, c2: g.c2 }} {...logoProps(logos, g.sym)} size={size.mark} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="rowPrimary" numberOfLines={1}>
                      {g.sym}
                    </Text>
                    <Text variant="secondary" color={colors.ink55} numberOfLines={1}>
                      {g.name}
                    </Text>
                  </View>
                  {/* No glyph without a series — a flat line would claim the price never moved. */}
                  {series && series.length > 1 ? (
                    <Sparkline data={series} width={SPARK_W} height={SPARK_H} />
                  ) : sparks.loading && !sparks.data ? (
                    <Placeholder width={SPARK_W} height={SPARK_H} />
                  ) : null}
                  <View style={{ alignItems: 'flex-end', minWidth: 84 }}>
                    <Price variant="rowPrimary" figure="market">
                      {g.px}
                    </Price>
                    <Text variant="delta" color={colors.up}>
                      {g.chg}
                    </Text>
                  </View>
                </HoverRow>
              );
            })
          )}
        </Card>
      </View>

      {/* ─── Row 3: every xStock, and the pre-IPO tokens ─── */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
        <Card
          title="Markets"
          right={<CardLink label="Open xStocks" onPress={() => router.push('/xstocks')} />}
          style={{ flexGrow: 2, flexBasis: 560 }}
          testID="desktop-home-markets"
        >
          {catalog.error ? (
            <Failed what="markets" error={catalog.error} onRetry={catalog.reload} />
          ) : catalog.loading && !catalog.data ? (
            <LoadingRows count={6} height={ROW_H} />
          ) : catalogRows.length === 0 ? (
            <Text variant="body" color={colors.ink55}>
              No stocks yet.
            </Text>
          ) : (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  gap: space.s12,
                  paddingBottom: space.s10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.hairline,
                }}
              >
                <Th flex={COL.name}>Name</Th>
                <Th flex={COL.price} right>
                  Price
                </Th>
                <Th flex={COL.change} right>
                  24h
                </Th>
                <Th flex={COL.premium} right>
                  vs share
                </Th>
                <Th flex={COL.liquidity} right>
                  Liquidity
                </Th>
              </View>
              {catalogRows.map((r, i) => {
                const premium = premiumPct(r);
                return (
                  <HoverRow
                    key={r.symbol}
                    onPress={() => router.push(`/asset/${r.symbol}`)}
                    label={`${r.symbol}, ${r.name}, ${r.price === null ? 'no price' : fmtPrice(r.price)}`}
                    divider={i < catalogRows.length - 1}
                    testID={`desktop-home-market-${r.symbol}`}
                  >
                    <View style={{ flex: COL.name, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.s12 }}>
                      <AssetMark gradient={assetGradient(r.symbol)} {...logoProps(logos, r.symbol)} size={size.markSm} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="rowPrimary" numberOfLines={1}>
                          {r.symbol}
                        </Text>
                        <Text variant="secondarySm" color={colors.ink55} numberOfLines={1}>
                          {`${r.name.replace(/ xStock$/, '')} · ${r.sector}`}
                        </Text>
                      </View>
                    </View>
                    {/* The pool price, which is what a buy pays; "No price" is a state the row is in, not a zero. */}
                    <Text
                      variant="rowPrimary"
                      align="right"
                      figure="market"
                      color={r.price === null ? colors.ink55 : colors.ink}
                      style={{ flex: COL.price }}
                    >
                      {r.price === null ? 'No price' : fmtPrice(r.price)}
                    </Text>
                    {/* Null is "not reported", zero is "did not move": a dash for one, a grey 0.00% for the other. */}
                    <Text variant="delta" align="right" color={tone(r.change24hPct)} style={{ flex: COL.change }}>
                      {r.change24hPct === null ? '—' : percent(r.change24hPct, 2)}
                    </Text>
                    {/* The pool against the listed share's own mark — the spread a buy pays over the share. */}
                    <Text variant="delta" align="right" color={colors.ink55} style={{ flex: COL.premium }}>
                      {premium === null ? '—' : percent(premium, 2)}
                    </Text>
                    <Text variant="delta" align="right" color={colors.ink55} style={{ flex: COL.liquidity }}>
                      {r.liquidityUsd === null ? '—' : compactMoney(r.liquidityUsd)}
                    </Text>
                  </HoverRow>
                );
              })}
            </>
          )}
        </Card>

        <Card
          title="Pre-IPO"
          right={<CardLink label="All" onPress={() => router.push('/pre-ipo')} />}
          style={{ flexGrow: 1, flexBasis: 320, alignSelf: 'flex-start' }}
          testID="desktop-home-pre-ipo"
        >
          {pre.error ? (
            <Failed what="pre-IPO tokens" error={pre.error} onRetry={pre.reload} />
          ) : pre.loading && !pre.data ? (
            <LoadingRows count={3} height={ROW_H} />
          ) : preRows.length === 0 ? (
            <Text variant="body" color={colors.ink55}>
              No pre-IPO tokens on this network.
            </Text>
          ) : (
            <>
              {preRows.map((r, i) => (
                <PreIpoLine
                  key={r.symbol}
                  row={r}
                  divider={i < preRows.length - 1}
                  onPress={() => router.push(`/asset/${r.symbol}`)}
                />
              ))}
              {/* The one sentence the Pre-IPO screen will not let a buyer miss: whose number the mark is. */}
              <Text variant="footnote" color={colors.ink40} style={{ marginTop: space.s14 }}>
                Marks are Tessera’s own valuations of private companies; there is no exchange price to check them against.
              </Text>
            </>
          )}
        </Card>
      </View>
    </DesktopPage>
  );
}

/**
 * One pre-IPO token: its pool price and the issuer's mark, and how far apart they sit — both numbers, as the Pre-IPO
 * screen insists, because on a private company they are two different claims rather than two readings of one.
 */
function PreIpoLine({ row, divider, onPress }: { row: PreIpoRow; divider: boolean; onPress: () => void }) {
  const wide = row.spreadPct !== null && Math.abs(row.spreadPct) >= WIDE_SPREAD_PCT;
  return (
    <HoverRow
      onPress={onPress}
      label={`${row.name}, pool ${row.poolUsd === null ? 'no route' : fmtPrice(row.poolUsd)}`}
      divider={divider}
      style={{ minHeight: 64 }}
      testID={`desktop-home-pre-${row.symbol}`}
    >
      <AssetMark gradient={assetGradient(row.symbol)} size={size.mark} />
      <View style={{ flex: 1, minWidth: 0, gap: space.s2 }}>
        <Text variant="rowPrimary" numberOfLines={1}>
          {row.name}
        </Text>
        <Text variant="secondarySm" color={colors.ink55} numberOfLines={1}>
          {row.markUsd === null ? 'No mark published' : `Mark ${fmtPrice(row.markUsd)}${row.markStale ? ' · last known' : ''}`}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: space.s2 }}>
        <Text variant="rowPrimary" figure="market" color={row.poolUsd === null ? colors.ink55 : colors.ink}>
          {row.poolUsd === null ? 'No route' : fmtPrice(row.poolUsd)}
        </Text>
        {row.spreadPct !== null ? (
          <Text variant="secondarySm" color={wide ? colors.warn : colors.ink55}>
            {`${percent(row.spreadPct, 1)} vs mark`}
          </Text>
        ) : null}
      </View>
    </HoverRow>
  );
}
