/**
 * Screen 13 — Asset detail. screens.md Group B.
 *
 * Back / mark + name. Price at `priceLg` with a delta chip that names its window. A chart — candles by
 * default, tapping switches to the line — over the real series for the selected range. Range
 * pills. The position rows, from the real book. Sell / Buy.
 *
 * Rebuilt on `src/ui`. Everything that used to be invented is gone: the position rows were
 * hardcoded (1,750.30 SOL, avg cost $81.14, +$12,566), and the chart fell back to
 * `areaSeries.SOL`, drawing Solana's shape under whatever symbol you had opened.
 *
 * The price and the history are read through `src/markets`, where a failed read throws. Through the
 * repository both failures came back as "no feed", so the error state this screen carried could never show.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import { assetGradient } from '@/design/gradients';
import {
  AreaChart,
  AssetMark,
  BackButton,
  Button,
  ButtonPair,
  Candlestick,
  DeltaChip,
  ErrorState,
  Pill,
  PillRow,
  Segmented,
  Placeholder,
  Press,
  Price,
  Row,
  Screen,
  Text,
  colors,
  money,
  percent,
  pnlTone,
  price as fmtPrice,
  quantity,
  radius,
  size,
  space,
  tightProjection,
  toCandles,
} from '@/ui';
import { RollingNumber } from '@/ui/RollingNumber';
import { signedMoney } from '@/format';
import { repos } from '@/data';
import { api } from '@/data/api';
import { NotSignedIn } from '@/data/apiError';
import type { HistoryRange } from '@/data/marketData';
import { useAsync } from '@/data/useAsync';
import { useLogo } from '@/data/useLogos';
import { rangeChange } from '@/state/derived';
import { settlementSymbol } from '@/data/tradable';
import { useSettleable } from '@/data/useSettleable';
import { quoteOf } from '@/markets/quote';
import { historySeries, stillWarming } from '@/markets/series';
import { DUST_USD } from '@/markets/ticket';
import { useLiveRead } from '@/markets/useLiveRead';

/**
 * The ranges, each as long as its label.
 *
 * `1Y` fetched ninety days, and so did `All`, under "past year" and "all time". A year is a year now.
 * `All` is gone: the price feed keeps no more than a year of history, so there is no all time to draw.
 */
const RANGES: readonly HistoryRange[] = ['1D', '1W', '1M', '1Y'];
/**
 * Candles or line, as a visible control.
 *
 * Words, not glyphs. This shipped as `▮` and `∿` on the theory that two shapes read faster than
 * two words and cost less width — but at the 13px the control type is set in, `▮` is a two-pixel
 * mark and `∿` is barely a dot, and neither says anything to a screen reader, which gets the raw
 * character. A control nobody can read is not a compact control.
 */
const CHART_VIEWS: { value: number; label: string }[] = [
  { value: 0, label: 'Candles' },
  { value: 1, label: 'Line' },
];

/** Wide enough for "Candles" at 13/600, and comfortably past the 44pt minimum target. */
const CHART_VIEW_SEGMENT = 58;
const CHART_VIEW_W = CHART_VIEW_SEGMENT * 2 + space.s4 + size.segPad * 2;

const CHART_H = 170;
const ROW_H = 52;

export default function AssetDetail() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const [range, setRange] = useState<HistoryRange>('1D');
  // design.md calls the candlestick the centrepiece, and the bars are already fetched — the
  // area chart was only ever a summary of the same data. Both are offered; candles are the
  // default wherever there are real ones to draw.
  const [candleView, setCandleView] = useState(true);

  const logo = useLogo(symbol);
  const inst = useAsync(() => repos.markets.getInstrument(symbol!), [symbol]);
  const positions = useAsync(() => repos.portfolio.positions(), []);
  // Dust a sale left behind is not a position (as on Portfolio): a cent or more is held.
  const held = (positions.data ?? []).find((p) => p.symbol === symbol && p.notional >= DUST_USD);
  // Signed out there is no position to show, which is not a failure. Anything else that stopped the read is.
  const positionUnread = positions.error !== undefined && !(positions.error instanceof NotSignedIn);

  // Tokenized equities have a real spot price and no history: they are priced off the route
  // that would fill them, not a candle feed. A real price with no chart is a true state to show.
  const spotRead = useLiveRead(() => quoteOf(symbol!), [symbol]);
  const history = useLiveRead(() => historySeries(symbol!, range), [symbol, range], stillWarming);

  // The answer for this symbol and range — not the last range's candles under the new label while this one loads.
  const shown = history.data?.symbol === symbol && history.data.window === range ? history.data : undefined;
  const series = useMemo(() => toCandles(shown?.bars ?? []), [shown]);
  const closes = series.map((c) => c.close);
  const hasSeries = closes.length > 1;
  // From the window's first open, so the change covers the whole range its label names.
  const seriesPct = hasSeries ? ((closes.at(-1)! - series[0]!.open) / series[0]!.open) * 100 : 0;

  const quote = spotRead.data ?? undefined;

  /*
   * The percentage names the window it measured.
   *
   * It said "today" whatever the pills were set to, so 1M read "up 38.4% today" — false about a
   * real asset, on the screen someone opens to decide whether to buy. The day itself now comes
   * from the quote's 24h change, the same field the market list and the search rows read, because
   * deriving it a second way from the candles is what made one asset show 2.1% here and 2.55%
   * there at the same moment.
   */
  const { pct: changePct, label: changeLabel } = rangeChange(range, seriesPct, quote?.change24h);
  const up = changePct >= 0;

  /*
   * The same asset, priced a second way.
   *
   * Every number in this app came from one feed, and one feed is one point of being wrong.
   * The on-chain spot price is derived from the liquidity a fill would actually go through,
   * which makes it the right second opinion rather than just another API: when the two
   * disagree, the one that decides what a trade costs is the on-chain one.
   */
  const cross = useAsync(
    () =>
      api.get<{ agree: boolean; note: string }>(
        `/market/crosscheck?symbol=${encodeURIComponent(symbol ?? '')}`,
      ),
    [symbol],
  );

  // The hero reads live SPOT, not the last candle close — a candle series is a history and
  // the number at the top of this screen is a price.
  const spot = quote && quote.price > 0 ? quote.price : undefined;

  /*
   * Still arriving, in any of the ways it can be.
   *
   * The screen only knew "have data" and "have none", so during the very first fetch it said
   * "No live price for this market" and "No chart for this market yet" — a confident claim
   * about a market it had not finished asking about. Loading, warming and empty are different
   * states and only the last one is news; a warming answer is asked again by `useLiveRead`.
   */
  const priceLoading = spotRead.loading && spotRead.data === undefined;
  const historyLoading = history.loading && !shown;

  /*
   * Asked of the executor, like the order ticket. A Buy button that leads to a ticket the chain
   * cannot settle is the same lie one screen earlier.
   */
  // 'checking' is rendered, not guessed through — see useSettleable.
  const settleable = useSettleable(symbol ?? '');
  const tradable = settleable !== 'no';

  return (
    <Screen gutter="none" sheet>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space.gutter,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s10, flex: 1 }}>
          <BackButton onPress={() => goBack()} />
          {/*
            The mark does not depend on the instrument being in a market class.

            It used to: `i ? <AssetMark …>` meant the header was bare for anything the market list
            does not carry — including WETH, which is the app's own default buy, sits on Home and in
            Holdings wearing its real logo, and lost it on the one screen dedicated to it. The
            instrument only ever supplied two gradient colours, and `assetGradient` derives those
            from the symbol, so there is nothing to wait for.
          */}
          <AssetMark
            gradient={inst.data ? { c1: inst.data.c1, c2: inst.data.c2 } : assetGradient(symbol ?? '')}
            {...logo}
            size={26}
          />
          <Text variant="cardTitleLg" numberOfLines={1}>
            {inst.data?.name ?? symbol}
          </Text>
        </View>
      </View>

      {/*
        Everything between the header and the footer scrolls.
        The design canvas is 874 tall and an iPhone SE is 667. Price, chart, range pills, the
        chart-type control, the position rows and the note come to more than that, so on a short
        device the bottom of it was simply unreachable — `Fill` anchors height, it does not give
        you a way to reach what overflows. The Sell/Buy pair stays pinned outside, because the
        action must not scroll away.
      */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: space.s14 }}
        showsVerticalScrollIndicator={false}
      >
      <View style={{ alignItems: 'center', marginTop: space.s22, gap: space.s6 }}>
        {spotRead.error ? (
          <ErrorState error={spotRead.error} onRetry={spotRead.reload} />
        ) : (
          <>
            {/* The price rolls in when it first arrives; live ticks after that change in place. */}
            {spot !== undefined ? (
              <RollingNumber value={fmtPrice(spot)} variant="priceLg" />
            ) : priceLoading ? (
              <Placeholder width={150} height={34} style={{ borderRadius: radius.tile }} />
            ) : (
              <Price variant="priceLg" color={colors.ink55}>
                —
              </Price>
            )}
            {hasSeries ? (
              <DeltaChip
                label={`${up ? 'up' : 'down'} ${percent(Math.abs(changePct)).replace('+', '')} ${changeLabel}`}
                tone={pnlTone(changePct)}
                style={{ alignSelf: 'center' }}
              />
            ) : priceLoading || historyLoading ? (
              <Text variant="body" color={colors.ink55}>
                Loading…
              </Text>
            ) : spot === undefined ? (
              // One quiet line, not a warning tag beside it saying the same thing again.
              <Text variant="body" color={colors.ink55}>
                No price feed.
              </Text>
            ) : null}
          </>
        )}

        {/*
          A second opinion, from the pools a fill would actually touch.

          Shown only when it DISAGREES. A line saying "two sources agree" on every asset every
          day is noise that trains people to stop reading — the whole value is that it appears
          when something is wrong, and the number the executor would trade at is the one that
          matters when they diverge.
        */}
        {cross.data && !cross.data.agree ? (
          <Text
            variant="secondarySm"
            color={colors.warn}
            align="center"
            style={{ marginTop: space.s6, paddingHorizontal: space.gutter }}
          >
            {cross.data.note}
          </Text>
        ) : null}
      </View>

      {/*
        The chart type, visibly.

        Both charts have been here since the beginning and the only way to swap them was to tap the
        chart itself — an affordance with nothing on screen to suggest it existed, so the line view
        may as well not have shipped. The tap still works; this is what says so.

        Above the chart rather than beside the range pills, which is where it went first: the range
        pills and a two-word control do not fit one 402pt row, and what that shipped was "All"
        sliced in half by the control's left edge. They also answer different questions — the pills
        pick a period, this picks a rendering — and the one that belongs to the chart sits with it.
      */}
      {hasSeries ? (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            marginTop: space.s12,
            paddingHorizontal: space.gutter,
          }}
        >
          <Segmented
            options={CHART_VIEWS}
            value={candleView ? 0 : 1}
            onChange={(v) => setCandleView(v === 0)}
            height={size.segThumbSm}
            /*
             * An explicit width, because `Segmented` has no intrinsic one: design.md §5 gives the
             * thumb `flex: 1`, which is right for the full-width control it usually is and means
             * that anywhere else it collapses to its own 4pt padding — which is exactly what
             * shipped first, a two-pixel white sliver against the bezel.
             */
            style={{ width: CHART_VIEW_W }}
          />
        </View>
      ) : null}

      {hasSeries ? (
        <Press
          onPress={() => setCandleView((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={`${inst.data?.name ?? symbol} ${candleView ? 'candlestick' : 'price'} chart, ${range}. Switch to the ${candleView ? 'line' : 'candle'} view.`}
          style={{ marginTop: space.s10, paddingHorizontal: space.gutter }}
        >
          {candleView ? (
            <Candlestick
              series={series}
              projection={tightProjection(series)}
              height={CHART_H}
              lastPrice={{ value: closes.at(-1)!, label: fmtPrice(closes.at(-1)!) }}
              drawIn
            />
          ) : (
            <AreaChart
              data={closes}
              height={CHART_H}
              color={up ? colors.up : colors.down}
              endDot
              drawIn
            />
          )}
        </Press>
      ) : (
        <View
          style={{
            height: CHART_H,
            marginTop: space.s18,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {history.error ? (
            // The pills stay below it, so another range is still one tap away.
            <ErrorState error={history.error} onRetry={history.reload} />
          ) : historyLoading ? (
            <Placeholder height={CHART_H} style={{ borderRadius: radius.tile }} />
          ) : spot !== undefined ? (
            <Text variant="body" color={colors.ink55}>
              No chart yet.
            </Text>
          ) : null}
        </View>
      )}

      <PillRow style={{ marginTop: space.s16 }} contentPadding={space.gutter}>
        {RANGES.map((r) => (
          <Pill key={r} label={r} selected={r === range} onPress={() => setRange(r)} />
        ))}
      </PillRow>

      <View style={{ marginTop: space.s14, paddingHorizontal: space.gutter }}>
        {held ? (
          <>
            <Row
              title="Your position"
              value={<Price>{`${quantity(held.units)} ${symbol}`}</Price>}
              secondary={money(held.notional)}
              height={ROW_H}
            />
            <Row title="Avg cost" value={<Price>{fmtPrice(held.entry)}</Price>} height={ROW_H} />
            <Row
              title="Unrealised"
              value={<Price tone={pnlTone(held.unrealised)}>{signedMoney(held.unrealised)}</Price>}
              delta={percent(held.unrealisedPct)}
              deltaTone={pnlTone(held.unrealised)}
              height={ROW_H}
              divider={false}
            />
          </>
        ) : positionUnread ? (
          // Not "you hold none": the book did not answer, so this screen cannot say either way.
          <Press
            onPress={positions.reload}
            accessibilityRole="button"
            accessibilityLabel="Read your position again"
            hitHeight={size.hit}
          >
            <Text variant="secondary" color={colors.ink55}>
              Your position did not load. Try again ›
            </Text>
          </Press>
        ) : null}
      </View>
      </ScrollView>

      {/*
        A Buy button on a market this chain cannot settle is a promise the app cannot keep.
        These instruments are real markets, but nothing prices them on this build and none carries
        a price here; what does not exist is a token on Base to route into. Saying so is better than a button that
        leads to an order ticket which can never be filled.
      */}
      <View style={{ paddingHorizontal: space.gutter }}>
        {tradable ? (
          <ButtonPair
            style={{ marginTop: space.s14 }}
            left={
              <Button
                label="Sell"
                variant="secondary"
                disabled={settleable === 'checking'}
                onPress={() => router.push(`/order/${settlementSymbol(symbol ?? '')}?side=sell`)}
              />
            }
            right={
              <Button
                label="Buy"
                disabled={settleable === 'checking'}
                onPress={() => router.push(`/order/${settlementSymbol(symbol ?? '')}?side=buy`)}
              />
            }
          />
        ) : (
          <View style={{ marginTop: space.s14, paddingVertical: space.s14, alignItems: 'center' }}>
            <Text variant="secondary" align="center">
              {/* "Here", not a chain's name: an equity trades on Base and not on a fork of it, and no network is named off the money screens. */}
              Not tradable here
            </Text>
          </View>
        )}
      </View>
    </Screen>
  );
}
