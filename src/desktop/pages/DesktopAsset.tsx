/**
 * An asset's desk on a laptop (2026-10-01): the chart and what is known about the asset on the left, the trade and
 * what backs it on the right.
 *
 * Every read here is the phone screen's (`app/asset/[symbol].tsx`) — the same `quoteOf` spot, the same
 * `fetchTimedHistory` series, the same fills, catalog row, pre-IPO row and activity trail — gathered in
 * `useAssetDesk` below so the phone file stays exactly as it was. The layout is the only thing that is new: a large
 * chart, the details as a three-column grid, and a trade card that stays in view beside them. Buy and Sell open the
 * same ticket the phone opens (`/xstock/{symbol}?side=…` on Solana, the order ticket elsewhere).
 *
 * "What backs it" is the ticket's own backing read (`fetchBacking`, `fetchBackingDetail`, `fetchReservesHistory`,
 * `fetchYield`) drawn with the ticket's own `BackingBadge` and `BackingDrawer`, for an xStock and a signed-in session
 * only — exactly when the ticket asks.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { isSolana } from '@/chain';
import { assetGradient } from '@/design/gradients';
import {
  AreaChart,
  AssetMark,
  Button,
  Candlestick,
  DeltaChip,
  ErrorState,
  NoteStrip,
  Pill,
  Placeholder,
  Price,
  Segmented,
  Text,
  alpha,
  candleMarks,
  closeLine,
  colors,
  lineMarks,
  markDetail,
  money,
  percent,
  pnlTone,
  price as fmtPrice,
  quantity,
  radius,
  space,
  tightProjection,
  toCandles,
  type MarkedFill,
} from '@/ui';
import { RollingNumber } from '@/ui/RollingNumber';
import { BackingBadge } from '@/ui/BackingBadge';
import { BackingDrawer } from '@/ui/BackingDrawer';
import { compactMoney, signedMoney, when } from '@/format';
import { repos } from '@/data';
import { api } from '@/data/api';
import { NotSignedIn } from '@/data/apiError';
import {
  fetchTimedHistory,
  fillsKnownFrom,
  fillsOf,
  isPreIpoSymbol,
  isXStockSymbol,
  type HistoryRange,
} from '@/data/marketData';
import { walletTokens } from '@/data/walletTokens';
import { system } from '@/data/system';
import { preIpo } from '@/data/preIpo';
import { fetchBacking } from '@/data/backing';
import { fetchBackingDetail } from '@/data/backingDetail';
import { fetchReservesHistory } from '@/data/reservesHistory';
import { fetchYield } from '@/data/dividendYield';
import { useAsync } from '@/data/useAsync';
import { useLogo } from '@/data/useLogos';
import { rangeChange } from '@/state/derived';
import { settlementSymbol } from '@/data/tradable';
import { useSettleable } from '@/data/useSettleable';
import { useSignedOut } from '@/auth/useSignedOut';
import { chartFillsNote, listedFills } from '@/markets/chartFills';
import { quoteOf } from '@/markets/quote';
import { actionSentence, type CorporateActionNotice } from '@/markets/corporateAction';
import { DUST_USD } from '@/markets/ticket';
import { useLiveRead } from '@/markets/useLiveRead';
import { useNow } from '@/state/useNow';
import { DesktopPage } from '../DesktopShell';

/** As on the phone: a Solana share's history is what the executor has recorded since late August, so no `1Y`. */
const RANGES: readonly HistoryRange[] = ['1D', '1W', '1M', '1Y'];
const EQUITY_RANGES: readonly HistoryRange[] = ['1D', '1W', '1M'];
const CHART_VIEWS = [
  { value: 0, label: 'Candles' },
  { value: 1, label: 'Line' },
] as const;
const SIDES = [
  { value: 'buy' as const, label: 'Buy' },
  { value: 'sell' as const, label: 'Sell' },
];

const CHART_H = 380;
const RUNS_WINDOW = 200;
const LISTED_FILLS = 5;

const card = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.hairline,
  borderRadius: radius.panel,
  padding: 22,
} as const;

/**
 * The phone screen's reads, in one place (2026-10-01). Each line mirrors `app/asset/[symbol].tsx`; the comments there
 * say why each one is read the way it is.
 */
function useAssetDesk(symbol: string, range: HistoryRange, candleView: boolean) {
  const equity = isSolana && (isXStockSymbol(symbol) || isPreIpoSymbol(symbol));
  const xstock = isSolana && isXStockSymbol(symbol);
  const preIpoToken = isPreIpoSymbol(symbol);

  const logo = useLogo(symbol);
  const inst = useAsync(() => repos.markets.getInstrument(symbol), [symbol]);
  const positions = useAsync(() => repos.portfolio.positions(), []);
  const held = (positions.data ?? []).find((p) => p.symbol === symbol && p.notional >= DUST_USD);
  const positionUnread = positions.error !== undefined && !(positions.error instanceof NotSignedIn);
  const wallet = useAsync(() => (equity ? walletTokens() : Promise.resolve(null)), [equity]);
  const inWallet = equity
    ? wallet.data?.tokens.find((t) => t.symbol === symbol && t.units > 0 && (t.usd === null || t.usd >= DUST_USD))
    : undefined;

  const spotRead = useLiveRead(() => quoteOf(symbol), [symbol]);
  const history = useLiveRead(
    async () => ({ symbol, range, candles: await fetchTimedHistory(symbol, range) }),
    [symbol, range],
  );
  const answer = history.data;
  const current = answer?.symbol === symbol && answer.range === range ? answer : undefined;
  const drawn = current ?? (history.loading && answer?.symbol === symbol ? answer : undefined);
  const pending = drawn !== undefined && current === undefined;
  const series = useMemo(() => toCandles((drawn?.candles ?? []).map((c) => c.bar)), [drawn]);
  const spans = useMemo(() => (drawn?.candles ?? []).map(({ start, end }) => ({ start, end })), [drawn]);
  const line = useMemo(() => closeLine(series, spans), [series, spans]);
  const hasSeries = series.length > 0;
  const lone = series.length === 1;
  const seriesPct = hasSeries ? ((series.at(-1)!.close - series[0]!.open) / series[0]!.open) * 100 : 0;

  const quote = spotRead.data ?? undefined;
  const { pct: changePct, label: changeLabel } = rangeChange(range, seriesPct, quote?.change24h);
  const lineUp = drawn ? rangeChange(drawn.range, seriesPct, quote?.change24h).pct >= 0 : changePct >= 0;

  const runs = useAsync(() => system.runs(RUNS_WINDOW), []);
  const activity = useAsync(() => repos.activity.list(), []);
  const fills = useMemo(() => fillsOf(runs.data ?? [], settlementSymbol(symbol)), [runs.data, symbol]);
  const onLine = useMemo(() => lineMarks(fills, line.times), [fills, line]);
  const inCandles = useMemo(() => candleMarks(fills, spans), [fills, spans]);
  const candlesShown = candleView && !lone;
  const marked: readonly MarkedFill[] = candlesShown ? inCandles : onLine;
  const listed = useMemo(() => listedFills(marked, LISTED_FILLS), [marked]);
  const runsUnread = runs.error !== undefined && !(runs.error instanceof NotSignedIn);
  const fillsNote = chartFillsNote({
    unread: runsUnread,
    knownFrom: runs.data ? fillsKnownFrom(runs.data, RUNS_WINDOW) : null,
    windowStart: hasSeries ? line.times[0] : undefined,
    marked: marked.length,
    ofToken: fills.length,
  });

  const corporate = useAsync(
    () => api.get<CorporateActionNotice>(`/market/corporate-action?symbol=${encodeURIComponent(symbol)}`),
    [symbol],
  );
  const now = useNow();
  const action = actionSentence(corporate.data, now);
  const cross = useAsync(
    () =>
      equity
        ? Promise.resolve(null)
        : api.get<{ agree: boolean; note: string }>(`/market/crosscheck?symbol=${encodeURIComponent(symbol)}`),
    [symbol, equity],
  );

  const dayRead = useAsync(() => fetchTimedHistory(symbol, '1D'), [symbol]);
  const dayBars = (dayRead.data ?? []).map((c) => c.bar);
  const dayLow = dayBars.length ? Math.min(...dayBars.map((b) => b[2])) : undefined;
  const dayHigh = dayBars.length ? Math.max(...dayBars.map((b) => b[1])) : undefined;
  const catalogRow = useAsync(
    () => (xstock ? system.xstocks().then((c) => c.rows.find((r) => r.symbol === symbol) ?? null) : Promise.resolve(null)),
    [symbol, xstock],
  );
  const preIpoRead = useAsync(
    () =>
      preIpoToken
        ? preIpo.list().then((p) => ({ row: p.rows.find((r) => r.symbol === symbol) ?? null, note: p.note }))
        : Promise.resolve(null),
    [symbol, preIpoToken],
  );
  const stats: { label: string; value: string; tone?: string }[] = [];
  if (dayLow !== undefined && dayHigh !== undefined) {
    stats.push({ label: 'Day range', value: `${fmtPrice(dayLow)} – ${fmtPrice(dayHigh)}` });
  }
  if (current && hasSeries) stats.push({ label: `Change · ${range}`, value: percent(seriesPct, 2) });
  const cat = catalogRow.data;
  if (cat?.price != null && cat.underlyingPrice != null && cat.underlyingPrice > 0) {
    stats.push({ label: 'Pool vs share', value: `${fmtPrice(cat.price)} · ${fmtPrice(cat.underlyingPrice)}` });
    stats.push({ label: 'Pool premium', value: percent(((cat.price - cat.underlyingPrice) / cat.underlyingPrice) * 100, 2) });
  }
  if (cat?.liquidityUsd != null) stats.push({ label: 'Liquidity', value: compactMoney(cat.liquidityUsd) });
  if (xstock) stats.push({ label: 'Backed', value: '1:1 by the share' });
  const pre = preIpoRead.data?.row ?? null;
  if (pre?.poolUsd != null && pre.markUsd != null) {
    stats.push({ label: 'Pool vs mark', value: `${fmtPrice(pre.poolUsd)} · ${fmtPrice(pre.markUsd)}` });
  }
  if (pre?.spreadPct != null) {
    stats.push({
      label: 'Premium to mark',
      value: percent(pre.spreadPct, 1),
      tone: Math.abs(pre.spreadPct) >= 10 ? colors.warn : undefined,
    });
  }
  if (pre?.valuationUsd != null) stats.push({ label: 'Valuation', value: compactMoney(pre.valuationUsd) });
  if (pre?.holders != null) stats.push({ label: 'Holders', value: pre.holders.toLocaleString('en-US') });

  const agentTrades = useMemo(() => {
    const token = settlementSymbol(symbol).toUpperCase();
    return (activity.data ?? [])
      .filter((r) => r.kind === 'trade' && r.agent !== 'You' && r.agent !== 'xorr' && r.action.toUpperCase().includes(token))
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
      .slice(0, 5);
  }, [activity.data, symbol]);

  const spot = quote && quote.price > 0 ? quote.price : undefined;
  const priceLoading = spotRead.loading && spotRead.data === undefined;
  const historyLoading = history.loading && !current;

  const settleable = useSettleable(symbol);
  const tradable = equity || settleable !== 'no';
  const checking = !equity && settleable === 'checking';
  const ticket = (side: 'buy' | 'sell') =>
    equity ? `/xstock/${symbol}?side=${side}` : `/order/${settlementSymbol(symbol)}?side=${side}`;

  // What backs it: the ticket's own reads, asked when the ticket asks them — an xStock, and a session.
  const signedOut = useSignedOut();
  const readBacking = xstock && !signedOut;
  const backing = useAsync(() => (readBacking ? fetchBacking(symbol) : Promise.resolve(undefined)), [symbol, readBacking]);
  const detail = useAsync(() => (readBacking ? fetchBackingDetail(symbol) : Promise.resolve(null)), [symbol, readBacking]);
  const reserves = useAsync(() => (readBacking ? fetchReservesHistory(symbol) : Promise.resolve(null)), [symbol, readBacking]);
  const income = useAsync(() => (readBacking ? fetchYield(symbol) : Promise.resolve(undefined)), [symbol, readBacking]);

  return {
    equity, xstock, logo, inst, positions, held, positionUnread, inWallet, spotRead, history, current, drawn, pending,
    series, line, hasSeries, lone, seriesPct, changePct, changeLabel, lineUp, runs, onLine, inCandles, candlesShown,
    listed, fillsNote, action, cross, stats, pre, preIpoNote: preIpoRead.data?.note ?? null, agentTrades, spot,
    priceLoading, historyLoading, tradable, checking, ticket, signedOut, backing, detail, reserves, income,
  };
}

export function DesktopAsset() {
  const params = useLocalSearchParams<{ symbol: string }>();
  const symbol = params.symbol ?? '';
  const router = useRouter();
  const [range, setRange] = useState<HistoryRange>('1D');
  const [candleView, setCandleView] = useState(true);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const d = useAssetDesk(symbol, range, candleView);
  const ranges = d.equity ? EQUITY_RANGES : RANGES;
  const name = d.inst.data?.name ?? d.spotRead.data?.name ?? symbol;
  const up = d.changePct >= 0;

  return (
    <DesktopPage>
      <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
        {/* ----------------------------------------------------------------- LEFT */}
        <View style={{ flex: 2, minWidth: 0, gap: 20 }}>
          <View style={{ ...card, gap: space.s16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s14 }}>
              <AssetMark
                gradient={d.inst.data ? { c1: d.inst.data.c1, c2: d.inst.data.c2 } : assetGradient(symbol)}
                {...d.logo}
                size={48}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="screenTitle" numberOfLines={1}>
                  {name}
                </Text>
                <Text variant="secondary" color={colors.ink45}>
                  {symbol}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.s16, flexWrap: 'wrap' }}>
              {d.spotRead.error ? (
                <ErrorState error={d.spotRead.error} onRetry={d.spotRead.reload} />
              ) : (
                <>
                  {d.spot !== undefined ? (
                    <RollingNumber value={fmtPrice(d.spot)} variant="priceLg" figure="market" />
                  ) : d.priceLoading ? (
                    <Placeholder width={180} height={44} style={{ borderRadius: radius.tile }} />
                  ) : (
                    <Price variant="priceLg" color={colors.ink55} figure="market">
                      —
                    </Price>
                  )}
                  <View style={{ paddingBottom: space.s8 }}>
                    {d.current && d.hasSeries ? (
                      <DeltaChip
                        label={`${up ? 'up' : 'down'} ${percent(Math.abs(d.changePct)).replace('+', '')} ${d.changeLabel}`}
                        tone={pnlTone(d.changePct)}
                      />
                    ) : d.priceLoading || d.historyLoading ? (
                      <Text variant="body" color={colors.ink55}>
                        Loading…
                      </Text>
                    ) : d.spot === undefined ? (
                      <Text variant="body" color={colors.ink55}>
                        No price feed.
                      </Text>
                    ) : null}
                  </View>
                </>
              )}
            </View>
            {/* A second opinion, shown only when it disagrees (as on the phone). */}
            {d.cross.data && !d.cross.data.agree ? (
              <Text variant="secondary" color={colors.warn}>
                {d.cross.data.note}
              </Text>
            ) : null}
            {d.action ? <NoteStrip kind={d.action.kind}>{d.action.text}</NoteStrip> : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s12 }}>
              <View style={{ flexDirection: 'row', gap: space.s8 }}>
                {ranges.map((r) => (
                  <Pill key={r} label={r} selected={r === range} onPress={() => setRange(r)} />
                ))}
              </View>
              {d.hasSeries || d.history.loading ? (
                <Segmented
                  options={CHART_VIEWS}
                  value={candleView ? 0 : 1}
                  onChange={(v) => setCandleView(v === 0)}
                  height={34}
                  style={{ width: 176 }}
                />
              ) : null}
            </View>

            <View style={{ minHeight: CHART_H, justifyContent: 'center' }}>
              {d.hasSeries && d.drawn ? (
                candleView && !d.lone ? (
                  <Candlestick
                    series={d.series}
                    projection={tightProjection(d.series, d.inCandles.map((m) => m.price))}
                    marks={d.inCandles}
                    seriesKey={`${symbol}:${d.drawn.range}`}
                    pending={d.pending}
                    height={CHART_H}
                    lastPrice={{ value: d.series.at(-1)!.close, label: fmtPrice(d.series.at(-1)!.close) }}
                    drawIn
                  />
                ) : (
                  <AreaChart
                    data={d.line.values}
                    times={d.line.times}
                    formatValue={fmtPrice}
                    figure="market"
                    marks={d.onLine}
                    seriesKey={`${symbol}:${d.drawn.range}`}
                    pending={d.pending}
                    height={CHART_H}
                    color={d.lineUp ? colors.up : colors.down}
                    endDot
                    drawIn
                  />
                )
              ) : d.history.error ? (
                <ErrorState error={d.history.error} onRetry={d.history.reload} />
              ) : d.history.loading ? (
                <Placeholder height={CHART_H} style={{ borderRadius: radius.tile }} />
              ) : d.spot !== undefined ? (
                <Text variant="body" color={colors.ink55} align="center">
                  No chart yet.
                </Text>
              ) : null}
            </View>
            {d.hasSeries && d.lone ? (
              <Text variant="footnote" color={colors.ink45} align="center">
                One reading in this range. There is no trend to draw until there is a second.
              </Text>
            ) : null}

            <FillsList d={d} symbol={symbol} onOpenRun={(id) => router.push(`/runs/${id}`)} />
          </View>

          {d.stats.length > 0 ? (
            <View style={card}>
              <Text variant="cardTitle" style={{ marginBottom: space.s14 }}>
                Details
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s10 }}>
                {d.stats.map((st) => (
                  <View
                    key={st.label}
                    style={{
                      flexBasis: '31%',
                      flexGrow: 1,
                      paddingVertical: space.s12,
                      paddingHorizontal: space.s14,
                      borderRadius: radius.tile,
                      backgroundColor: colors.surfaceAlt,
                      borderWidth: 1,
                      borderColor: colors.cardBorder,
                    }}
                  >
                    <Text variant="footnote" color={colors.ink45}>
                      {st.label}
                    </Text>
                    <Text variant="rowPrimary" color={st.tone ?? colors.ink} numberOfLines={1} style={{ marginTop: space.s4 }}>
                      {st.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
            {d.runs.data ? (
              <View style={{ ...card, flex: 1, minWidth: 0 }}>
                <Text variant="cardTitle" style={{ marginBottom: space.s10 }}>
                  {`Agents on ${symbol}`}
                </Text>
                {d.agentTrades.length === 0 ? (
                  <Text variant="secondary" color={colors.ink45}>
                    {`No agent has traded ${symbol} yet.`}
                  </Text>
                ) : (
                  d.agentTrades.map((r, i) => (
                    <HoverRow
                      key={r.id}
                      title={`${r.agent} · ${r.action}${r.amount ? ` ${r.amount.replace(/^[+\-−]\s*/, '')}` : ''}`}
                      secondary={r.at ? when(r.at) : r.t}
                      divider={i < d.agentTrades.length - 1}
                      onPress={() => router.push('/activity')}
                    />
                  ))
                )}
              </View>
            ) : null}
            {d.pre ? (
              // Only what `/market/preipo` says of it — nothing here is written by the app (as on the phone).
              <View style={{ ...card, flex: 1, minWidth: 0, gap: space.s8 }}>
                <Text variant="cardTitle">About</Text>
                <Text variant="body" color={colors.ink}>
                  {d.pre.sector ? `${d.pre.name} · ${d.pre.sector}` : d.pre.name}
                </Text>
                {d.preIpoNote ? (
                  <Text variant="secondary" color={colors.ink45}>
                    {d.preIpoNote}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* ---------------------------------------------------------------- RIGHT */}
        <View style={{ flex: 1, minWidth: 320, gap: 20, position: 'sticky', top: 0 } as never}>
          <View style={{ ...card, gap: space.s16 }}>
            <Text variant="cardTitle">Trade</Text>
            <Segmented options={SIDES} value={side} onChange={setSide} height={38} />

            <Position d={d} symbol={symbol} />

            {d.tradable ? (
              <View style={{ gap: space.s10 }}>
                <Button
                  label={`Buy ${symbol}`}
                  variant={side === 'buy' ? 'primary' : 'secondary'}
                  disabled={d.checking}
                  onPress={() => router.push(d.ticket('buy') as never)}
                  testID="desk-buy"
                />
                <Button
                  label={`Sell ${symbol}`}
                  variant={side === 'sell' ? 'primary' : 'secondary'}
                  disabled={d.checking}
                  onPress={() => router.push(d.ticket('sell') as never)}
                  testID="desk-sell"
                />
              </View>
            ) : (
              <Text variant="secondary" align="center" style={{ paddingVertical: space.s10 }}>
                Not tradable here
              </Text>
            )}
            <Text variant="footnote" color={colors.ink40}>
              The ticket shows the pool&apos;s quote for your amount, every fee, and the worst case, before anything is
              signed.
            </Text>
          </View>

          {d.xstock ? (
            <View style={{ ...card, gap: space.s12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s10 }}>
                <Text variant="cardTitle">What backs it</Text>
                {d.signedOut ? null : <BackingBadge backing={d.backing.data ?? undefined} />}
              </View>
              {d.signedOut ? (
                <Text variant="secondary" color={colors.ink55}>
                  Sign in to check backing.
                </Text>
              ) : (
                <BackingDrawer
                  detail={d.detail.loading ? undefined : d.detail.data ?? null}
                  history={d.reserves.loading ? undefined : d.reserves.data ?? null}
                  income={d.income.data ?? undefined}
                />
              )}
            </View>
          ) : d.pre ? (
            <View style={{ ...card, gap: space.s8 }}>
              <Text variant="cardTitle">What backs it</Text>
              <Text variant="secondary" color={colors.ink55}>
                A private company has no exchange price: the mark is Tessera&apos;s own valuation, and the mint charges
                {` ${d.pre.transferFeeBps} bps `}on every transfer, in and out.
              </Text>
              <Pressable onPress={() => router.push(d.ticket('buy') as never)} accessibilityRole="link">
                <Text variant="control" color={colors.ink70}>
                  Open the ticket for the full facts ›
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </DesktopPage>
  );
}

type Desk = ReturnType<typeof useAssetDesk>;

function Position({ d, symbol }: { d: Desk; symbol: string }) {
  if (d.held) {
    const held = d.held;
    return (
      <View style={{ gap: space.s10, paddingVertical: space.s4 }}>
        <Line label="Units" value={<Price figure="units">{`${quantity(held.units)} ${symbol}`}</Price>} />
        <Line label="Value" value={<Price figure="own">{money(held.notional)}</Price>} />
        <Line label="Avg cost" value={<Price figure="market">{fmtPrice(held.entry)}</Price>} />
        <Line
          label="Unrealised P&L"
          value={
            <Price tone={pnlTone(held.unrealised)}>{`${signedMoney(held.unrealised)} (${percent(held.unrealisedPct)})`}</Price>
          }
        />
      </View>
    );
  }
  if (d.inWallet) {
    return (
      <View style={{ gap: space.s10, paddingVertical: space.s4 }}>
        <Line label="Units" value={<Price figure="units">{`${quantity(d.inWallet.units)} ${symbol}`}</Price>} />
        {d.inWallet.usd === null ? null : <Line label="Value" value={<Price figure="own">{money(d.inWallet.usd)}</Price>} />}
      </View>
    );
  }
  if (d.positionUnread) {
    return (
      <Pressable onPress={d.positions.reload} accessibilityRole="button" accessibilityLabel="Read your position again">
        <Text variant="secondary" color={colors.ink55}>
          Your position did not load. Try again ›
        </Text>
      </Pressable>
    );
  }
  return (
    <Text variant="secondary" color={colors.ink45}>
      {`You don’t hold ${symbol} yet.`}
    </Text>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.s12 }}>
      <Text variant="secondary" color={colors.ink45}>
        {label}
      </Text>
      {value}
    </View>
  );
}

function HoverRow({
  title,
  secondary,
  divider,
  onPress,
}: {
  title: string;
  secondary?: string;
  divider?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ hovered }: { hovered?: boolean }) => ({
        paddingVertical: space.s10,
        paddingHorizontal: space.s10,
        marginHorizontal: -space.s10,
        borderRadius: radius.square,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: colors.hairline,
        backgroundColor: hovered && onPress ? alpha('#FFFFFF', 0.04) : 'transparent',
      })}
    >
      <Text variant="rowPrimary" numberOfLines={1}>
        {title}
      </Text>
      {secondary ? (
        <Text variant="secondary" color={colors.ink45}>
          {secondary}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** The fills the chart in view drew, each with its time, price and venue (FEATURES.md #77), as on the phone. */
function FillsList({ d, symbol, onOpenRun }: { d: Desk; symbol: string; onOpenRun: (id: string) => void }) {
  if (!d.hasSeries || !d.drawn || (d.listed.shown.length === 0 && d.fillsNote === null)) return null;
  const note = d.fillsNote;
  return (
    <View style={{ gap: space.s4 }}>
      {d.listed.shown.length > 0 ? (
        <Text variant="secondarySm" color={colors.ink55}>
          {d.candlesShown ? 'Your fills on these candles' : 'Your fills on this line'}
        </Text>
      ) : null}
      {d.listed.shown.map((m, i) => {
        const detail = markDetail(m);
        const id = m.id;
        return (
          <HoverRow
            key={id ?? `${m.at}:${m.side}:${m.price}`}
            title={`${detail.action} at ${fmtPrice(m.price)}`}
            secondary={`${when(m.at)} · ${detail.venue}`}
            divider={i < d.listed.shown.length - 1}
            onPress={id === undefined ? undefined : () => onOpenRun(String(id))}
          />
        );
      })}
      {d.listed.more > 0 ? (
        <Text variant="footnote" color={colors.ink45}>
          {`${d.listed.more} earlier ${d.listed.more === 1 ? 'fill is' : 'fills are'} marked on the chart but not listed.`}
        </Text>
      ) : null}
      {note?.kind === 'unread' ? (
        <Pressable onPress={d.runs.reload} accessibilityRole="button" accessibilityLabel="Read your fills again">
          <Text variant="footnote" color={colors.ink55}>
            Your fills did not load, so none are marked. Try again ›
          </Text>
        </Pressable>
      ) : note?.kind === 'partial' ? (
        <Text variant="footnote" color={colors.ink45}>
          {`Only your latest ${RUNS_WINDOW} runs were read, back to ${when(note.since)}. Fills before then are not marked.`}
        </Text>
      ) : note?.kind === 'outside' ? (
        <Text variant="footnote" color={colors.ink45}>
          {`None of your ${note.count} ${note.count === 1 ? 'fill' : 'fills'} of ${symbol} ${note.count === 1 ? 'is' : 'are'} in this range.`}
        </Text>
      ) : null}
    </View>
  );
}
