/**
 * Portfolio, on a laptop (2026-10-01).
 *
 * The phone sheet stacks the balance, its history, the allocation and a card per position. On a wide screen the top
 * becomes two cards side by side — what the wallet is worth and where the money sits, and what the positions are made
 * of — and the positions become a table: one row each, every figure in its own column, so a book of ten positions can
 * be read in one look instead of ten scrolls.
 *
 * Every figure comes from the reads the phone screen makes (`repos.portfolio`, `/portfolio/history`, the exit rules);
 * the levels from the same `exitLevels`. A row opens the same position screen a card does.
 */
import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { isSolana } from '@/chain';
import { shownHere } from '@/nav/solanaRoutes';
import {
  AssetMark,
  Button,
  NoteStrip,
  Placeholder,
  Price,
  SignInPrompt,
  Text,
  alpha,
  colors,
  money,
  percent,
  pnlTone,
  price as fmtPrice,
  quantity,
  radius,
  space,
} from '@/ui';
import { assetGradient } from '@/design/gradients';
import { logoProps, useLogos } from '@/data/useLogos';
import { useSignedOut } from '@/auth/useSignedOut';
import { AllocationDonut } from '@/ui/charts/AllocationDonut';
import { TimelineNotYet, ValueTimeline } from '@/ui/charts/ValueTimeline';
import { continuityWindowMs, netInvestedSteps, observedRuns, recordedCount } from '@/ui/charts/timeline';
import { useMeasuredBox } from '@/ui/charts/useMeasuredBox';
import { allocationBySector } from '@/ui/charts/allocation';
import { signedMoney } from '@/format';
import { repos } from '@/data';
import { system, type SectorClassification } from '@/data/system';
import { useAsync } from '@/data/useAsync';
import { useFreshOnReturn } from '@/data/useFreshOnReturn';
import { driftSentence, holdingDrift } from '@/state/derived';
import { exitLevels } from '@/strategies/exitLevels';
import type { Position } from '@/data/types';
import { DesktopPage } from '../DesktopShell';
import { Card } from '../parts/Card';

/** Below a cent, a holding is left over from a sale rather than held. */
const DUST_USD = 0.01;
const GRAPH_H = 170;
const ROW_H = 64;

/** The table's columns: a width for the fixed ones, a share of what is left for the rest. */
const COLS = {
  asset: { flex: 1.4 },
  units: { flex: 1, align: 'right' },
  cost: { flex: 1, align: 'right' },
  price: { flex: 1, align: 'right' },
  value: { flex: 1, align: 'right' },
  pnl: { flex: 1.3, align: 'right' },
  levels: { flex: 1.3, align: 'right' },
  trades: { width: 64, align: 'right' },
} as const;
type Col = { flex?: number; width?: number; align?: 'right' };

/** Where the money sits, as the segments of one bar. Categories, not outcomes: no green, no red. */
type Part = { key: string; label: string; usd: number; color: string; onPress?: () => void };

export function DesktopPortfolio() {
  const router = useRouter();
  const signedOut = useSignedOut();
  const balance = useAsync(() => repos.portfolio.balance(), []);
  const positions = useAsync(() => repos.portfolio.positions(), []);
  const realised = useAsync(() => repos.portfolio.realised(), []);
  const strategies = useAsync(() => repos.strategies.list(), []);
  const runs = useAsync(() => system.runs(200), []);
  const history = useAsync(() => system.portfolioHistory('1W'), []);
  // Read again when someone comes back from a sale, a deposit or a send (FEATURES.md #27).
  useFreshOnReturn(balance, positions, realised, strategies, runs, history);

  // Dust a sale left behind is not a position: it would read as an open trade worth $0.00.
  const book = useMemo(() => (positions.data ?? []).filter((p) => p.notional >= DUST_USD), [positions.data]);
  const symbols = useMemo(() => [...new Set(book.map((p) => p.symbol))].sort(), [book]);
  const logos = useLogos(symbols);

  const sectors = useAsync<Record<string, SectorClassification | null>>(
    () => (symbols.length === 0 ? Promise.resolve({}) : system.classification(symbols)),
    [symbols.join(',')],
  );
  const allocation = useMemo(
    () =>
      allocationBySector(
        book.map((p) => ({ symbol: p.symbol, valueUsd: p.notional, sector: sectors.data?.[p.symbol]?.sector ?? null })),
      ),
    [book, sectors.data],
  );

  // The history as the things actually recorded — see `app/portfolio.tsx` for why neither series is interpolated.
  const investedSteps = useMemo(
    () =>
      netInvestedSteps(
        (runs.data ?? [])
          .filter((r) => r.status === 'filled' && r.usd !== null)
          .map((r) => ({ at: Date.parse(r.finishedAt ?? r.at), usd: r.usd as number, side: r.side ?? null })),
      ),
    [runs.data],
  );
  const valueRuns = useMemo(
    () => observedRuns(history.data?.points ?? [], continuityWindowMs(history.data?.everyMinutes)),
    [history.data],
  );
  const recorded = recordedCount(investedSteps, valueRuns);
  const [graphBox, onGraphLayout] = useMeasuredBox();

  /* Fills per symbol — how many trades built each position. */
  const trades = useMemo(() => {
    if (!runs.data) return undefined;
    const by: Record<string, number> = {};
    for (const r of runs.data) if (r.status === 'filled') by[r.symbol] = (by[r.symbol] ?? 0) + 1;
    return by;
  }, [runs.data]);

  const unrealised = book.reduce((sum, p) => sum + p.unrealised, 0);
  const cost = book.reduce((sum, p) => sum + (p.notional - p.unrealised), 0);
  const unrealisedPct = cost > 0 ? (unrealised / cost) * 100 : undefined;
  const invested = book.reduce((sum, p) => sum + p.notional, 0);
  const b = balance.data;

  const parts: Part[] = b
    ? [
        { key: 'invested', label: 'Invested', usd: invested, color: colors.agent.momentum.c1 },
        ...(isSolana
          ? [{ key: 'agents', label: 'With your agents', usd: b.agents, color: colors.agent.drawdown.c1, onPress: () => router.push('/bot/roster') }]
          : []),
        ...(shownHere('/yield')
          ? [{ key: 'earning', label: 'Earning', usd: b.supplied, color: colors.agent.earnings.c1, onPress: () => router.push('/yield') }]
          : []),
        { key: 'cash', label: 'Cash', usd: b.cash, color: colors.ink40 },
      ]
    : [];

  return (
    <DesktopPage>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.s20 }}>
        <View style={{ flex: 1, gap: space.s6 }}>
          <Text variant="titleLg">Portfolio</Text>
          <Text variant="body" color={colors.ink55}>
            What your wallet holds, where the money sits, and what it made
          </Text>
        </View>
        {signedOut ? null : (
          <View style={{ flexDirection: 'row', gap: space.s10 }}>
            <View style={{ width: 130 }}>
              <Button label="Deposit" height={40} onPress={() => router.push('/deposit')} />
            </View>
            <View style={{ width: 130 }}>
              <Button label="Withdraw" variant="ghost" height={40} onPress={() => router.push('/send')} />
            </View>
          </View>
        )}
      </View>

      {signedOut ? (
        <SignInPrompt />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 20, alignItems: 'stretch' }}>
            {/* What it is worth, and where the money sits. */}
            <Card style={{ flex: 1.55, gap: space.s18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s20 }}>
                <View style={{ flex: 1, gap: space.s6 }}>
                  <Text variant="eyebrowSm" color={colors.ink45}>
                    Total balance
                  </Text>
                  {b ? (
                    <Price variant="heroBalance">{money(b.total)}</Price>
                  ) : balance.loading ? (
                    <Placeholder width={220} height={50} />
                  ) : (
                    <Price variant="heroBalance">—</Price>
                  )}
                  {unrealisedPct !== undefined && Math.abs(unrealised) >= 0.005 ? (
                    <Price variant="secondary" tone={pnlTone(unrealised)}>
                      {`${signedMoney(unrealised)} · ${percent(unrealisedPct)} open`}
                    </Price>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', gap: space.s26 }}>
                  <Profit label="Open P&L" value={positions.data ? unrealised : undefined} failed={!!positions.error} />
                  <Profit
                    label="Closed P&L"
                    value={realised.data ? realised.data.total : undefined}
                    failed={!!realised.error && !realised.data}
                  />
                </View>
              </View>

              {b ? <SplitBar parts={parts} /> : <Placeholder height={60} />}

              <View>
                {history.loading && !history.data ? (
                  <Placeholder height={GRAPH_H} style={{ borderRadius: radius.tile }} />
                ) : history.error ? (
                  <Text variant="footnote" color={colors.ink55}>
                    Couldn’t load the past week.
                  </Text>
                ) : recorded < 2 ? (
                  <TimelineNotYet count={recorded} />
                ) : (
                  <View onLayout={onGraphLayout}>
                    <ValueTimeline steps={investedSteps} runs={valueRuns} width={graphBox.width} height={GRAPH_H} />
                    <View style={{ flexDirection: 'row', gap: space.s14, marginTop: space.s8 }}>
                      <Text variant="footnote" color={colors.ink55}>
                        Value when recorded
                      </Text>
                      <Text variant="footnote" color={colors.ink45}>
                        Net invested
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </Card>

            {/*
              By sector — the SEC's own classification of each company, never a mapping of ours. Nothing is drawn until
              the classifications have answered: a ring of Unclassified while the read is in flight tells a story about
              the read rather than the portfolio.
            */}
            <Card title="Allocation" style={{ flex: 1 }}>
              {book.length === 0 ? (
                <Text variant="body" color={colors.ink55}>
                  {positions.loading && !positions.data ? '' : 'Nothing held yet, so there is nothing to split.'}
                </Text>
              ) : sectors.loading && !sectors.data ? (
                <Placeholder height={240} style={{ borderRadius: radius.panel }} />
              ) : sectors.error ? (
                <Text variant="body" color={colors.ink55}>
                  Couldn’t read what these companies do, so the split by sector isn’t shown.
                </Text>
              ) : (
                <AllocationDonut slices={allocation.slices} total={money(allocation.totalUsd)} totalLabel="In positions" />
              )}
            </Card>
          </View>

          <Card style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 22, marginBottom: space.s12 }}>
              <Text variant="cardTitleLg">Positions</Text>
              <View style={{ flex: 1 }} />
              {positions.data ? (
                <Text variant="secondary" color={colors.ink55}>
                  {book.length === 1 ? '1 open' : `${book.length} open`}
                </Text>
              ) : null}
            </View>
            <HeaderRow />
            {positions.loading && !positions.data ? (
              <View style={{ padding: 22, gap: space.s10 }}>
                <Placeholder height={44} />
                <Placeholder height={44} />
                <Placeholder height={44} />
              </View>
            ) : book.length === 0 ? (
              <View style={{ padding: 22, gap: space.s14, alignItems: 'flex-start' }}>
                <Text variant="body" color={colors.ink55}>
                  {positions.error ? 'Couldn’t load positions.' : 'No open positions yet.'}
                </Text>
                {!positions.error ? (
                  <View style={{ width: 240 }}>
                    <Button label="Start a recurring buy" variant="ghost" height={42} onPress={() => router.push('/strategy/dca')} />
                  </View>
                ) : null}
              </View>
            ) : (
              book.map((p, i) => (
                <PositionRow
                  key={p.id}
                  position={p}
                  logo={logoProps(logos, p.symbol)}
                  levels={exitLevels(strategies.data ?? [], p.symbol, p.entry)}
                  trades={trades?.[p.symbol]}
                  last={i === book.length - 1}
                  onPress={() => router.push(`/position/${p.id}`)}
                />
              ))
            )}
          </Card>

          {/* Where the ledger and the wallet disagree, said beside the rows it changes (PLAN.md 2.7). */}
          {book.map((p) => {
            const drift = holdingDrift(p);
            return drift ? (
              <NoteStrip key={`drift-${p.id}`} kind="risk">
                {driftSentence(p.symbol, drift)}
              </NoteStrip>
            ) : null;
          })}
        </>
      )}
    </DesktopPage>
  );
}

function Profit({ label, value, failed }: { label: string; value: number | undefined; failed: boolean }) {
  return (
    <View style={{ alignItems: 'flex-end', gap: space.s4 }}>
      <Text variant="eyebrowSm" color={colors.ink45}>
        {label}
      </Text>
      {value !== undefined ? (
        <Price variant="cardTitleLg" tone={pnlTone(value)}>
          {signedMoney(value)}
        </Price>
      ) : failed ? (
        // A read that failed is a dash: a placeholder that never resolves reads as still coming.
        <Price variant="cardTitleLg">—</Price>
      ) : (
        <Placeholder width={90} height={20} />
      )}
    </View>
  );
}

/** Cash, invested and with your agents, as one bar and a legend under it. */
function SplitBar({ parts }: { parts: Part[] }) {
  const sum = parts.reduce((n, p) => n + Math.max(0, p.usd), 0);
  return (
    <View style={{ gap: space.s12 }}>
      <View
        style={{
          flexDirection: 'row',
          height: 10,
          borderRadius: 5,
          overflow: 'hidden',
          gap: 2,
          backgroundColor: colors.control,
        }}
      >
        {sum > 0
          ? parts
              .filter((p) => p.usd > 0)
              .map((p) => <View key={p.key} style={{ flexGrow: p.usd / sum, flexBasis: 0, backgroundColor: p.color }} />)
          : null}
      </View>
      <View style={{ flexDirection: 'row', gap: space.s10 }}>
        {parts.map((p) => (
          <Pressable
            key={p.key}
            onPress={p.onPress}
            disabled={!p.onPress}
            accessibilityRole={p.onPress ? 'link' : 'text'}
            accessibilityLabel={p.label}
            style={({ hovered }: { hovered?: boolean }) => ({
              flex: 1,
              gap: space.s4,
              padding: space.s10,
              marginHorizontal: -space.s10,
              borderRadius: radius.tileSm,
              backgroundColor: hovered && p.onPress ? alpha('#FFFFFF', 0.035) : 'transparent',
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color }} />
              <Text variant="secondarySm" color={colors.ink55}>
                {p.onPress ? `${p.label} ›` : p.label}
              </Text>
            </View>
            <Price variant="rowPrimaryLg">{money(p.usd)}</Price>
            <Text variant="footnote" color={colors.ink40}>
              {sum > 0 ? `${Math.round((Math.max(0, p.usd) / sum) * 100)}%` : '—'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Cell({ col, children }: { col: Col; children: React.ReactNode }) {
  return (
    <View
      style={{
        flex: col.flex,
        width: col.width,
        flexShrink: col.width ? 0 : 1,
        minWidth: 0,
        alignItems: col.align === 'right' ? 'flex-end' : 'flex-start',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}

function HeaderRow() {
  const h = (label: string) => (
    <Text variant="eyebrowSm" color={colors.ink40}>
      {label}
    </Text>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: space.s16,
        paddingHorizontal: 22,
        height: 40,
        borderTopWidth: 1,
        borderTopColor: colors.hairline,
        borderBottomWidth: 1,
        borderBottomColor: colors.hairline,
      }}
    >
      <Cell col={COLS.asset}>{h('Asset')}</Cell>
      <Cell col={COLS.units}>{h('Units')}</Cell>
      <Cell col={COLS.cost}>{h('Avg cost')}</Cell>
      <Cell col={COLS.price}>{h('Price')}</Cell>
      <Cell col={COLS.value}>{h('Value')}</Cell>
      <Cell col={COLS.pnl}>{h('Unrealised')}</Cell>
      <Cell col={COLS.levels}>{h('Stop / target')}</Cell>
      <Cell col={COLS.trades}>{h('Trades')}</Cell>
    </View>
  );
}

function PositionRow({
  position: p,
  logo,
  levels,
  trades,
  last,
  onPress,
}: {
  position: Position;
  logo: ReturnType<typeof logoProps>;
  levels: ReturnType<typeof exitLevels>;
  trades: number | undefined;
  last: boolean;
  onPress: () => void;
}) {
  const stop = levels.find((l) => l.tone === 'stop');
  const target = levels.find((l) => l.tone === 'target');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${p.symbol} position`}
      testID={`portfolio-row-${p.symbol}`}
      style={({ hovered }: { hovered?: boolean }) => ({
        flexDirection: 'row',
        gap: space.s16,
        height: ROW_H,
        paddingHorizontal: 22,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.hairline,
        backgroundColor: hovered ? alpha('#FFFFFF', 0.035) : 'transparent',
        borderBottomLeftRadius: last ? radius.panel : 0,
        borderBottomRightRadius: last ? radius.panel : 0,
      })}
    >
      <Cell col={COLS.asset}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s12, minWidth: 0 }}>
          <AssetMark gradient={assetGradient(p.symbol)} {...logo} size={32} />
          <View style={{ minWidth: 0, flexShrink: 1 }}>
            <Text variant="rowPrimary" numberOfLines={1}>
              {p.symbol}
            </Text>
            {p.side === 'short' ? (
              <Text variant="secondarySm" color={colors.ink45}>
                Short
              </Text>
            ) : null}
          </View>
        </View>
      </Cell>
      <Cell col={COLS.units}>
        <Price variant="body" figure="units" color={colors.ink70}>
          {quantity(p.units)}
        </Price>
      </Cell>
      <Cell col={COLS.cost}>
        <Text variant="body" figure="market" color={colors.ink70}>
          {fmtPrice(p.entry)}
        </Text>
      </Cell>
      <Cell col={COLS.price}>
        <Text variant="body" figure="market">
          {p.feed === 'live' ? fmtPrice(p.mark) : '—'}
        </Text>
      </Cell>
      <Cell col={COLS.value}>
        <Price variant="value">{money(p.notional)}</Price>
      </Cell>
      <Cell col={COLS.pnl}>
        <Price variant="value" tone={pnlTone(p.unrealised)}>
          {signedMoney(p.unrealised)}
        </Price>
        <Text variant="footnote" color={colors.ink45}>
          {percent(p.unrealisedPct)}
        </Text>
      </Cell>
      <Cell col={COLS.levels}>
        {stop || target ? (
          <Text variant="secondary" figure="market" color={colors.ink70} numberOfLines={1}>
            {`${stop ? stop.formatted : '—'} / ${target ? target.formatted : '—'}`}
          </Text>
        ) : (
          <Text variant="secondary" color={colors.ink40}>
            None set
          </Text>
        )}
      </Cell>
      <Cell col={COLS.trades}>
        <Text variant="body" color={colors.ink55}>
          {trades === undefined ? '—' : String(trades)}
        </Text>
      </Cell>
    </Pressable>
  );
}
