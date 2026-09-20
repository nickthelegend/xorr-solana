/**
 * One strategy from the research book, and everything the gauntlet did to it.
 *
 * The reference for this screen was a backtest report showing a single equity curve climbing to
 * +19,972%. That shape is the most persuasive and least honest thing a strategy screen can draw:
 * it is one split, fitted, with no statement of what happens off it. The engine that produced this
 * book recorded two strategies that looked exactly like that and inverted to -0.37% and -6.07%
 * once tested properly.
 *
 * So the hero here is not a curve. It is the pair — in-sample beside out-of-sample — because the
 * distance between them IS the result. Everything below it is the rest of the gauntlet: the
 * parameter sweep, the same book at double commission, and assets it was never tuned on.
 *
 * ## What is not drawn
 *
 * No equity curve and no trade list, because the source has neither per strategy and inventing one
 * is the thing this product refuses to do. A figure the research did not measure reads "Not
 * measured" and never zero.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Row } from '@/ui/Row';
import { StatTile } from '@/ui/StatTile';
import { BackButton } from '@/ui/IconButton';
import { useGoBack } from '@/nav/useGoBack';
import { LoadingRows } from '@/ui/States';
import { colors, space, radius, size } from '@/ui/tokens';
import { useAsync } from '@/data/useAsync';
import { strategyLibrary, type Split, type StrategyDetail } from '@/data/strategyLibrary';

/* ------------------------------------------------------------------ format */

/** A number the research measured, or the plain fact that it did not. */
function num(v: number | null | undefined, digits = 2, suffix = ''): string {
  return v === null || v === undefined ? '—' : `${v.toFixed(digits)}${suffix}`;
}
function pct(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}
function toneOf(v: number | null | undefined): string {
  if (v === null || v === undefined) return colors.ink55;
  return v > 0 ? colors.up : v < 0 ? colors.down : colors.ink;
}

/* ------------------------------------------------------------------ panels */

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.s22 }}>
      <Text variant="eyebrow" color={colors.ink30}>
        {title.toUpperCase()}
      </Text>
      {note ? (
        <Text variant="bodySm" color={colors.ink55} style={{ marginTop: space.s4 }}>
          {note}
        </Text>
      ) : null}
      <View style={{ marginTop: space.s12 }}>{children}</View>
    </View>
  );
}

/**
 * The two splits, side by side.
 *
 * In-sample is drawn deliberately grey and labelled "fitted". It is not a result and the screen
 * should never let it read like one — but hiding it would be worse, because the gap between the
 * columns is exactly what tells a reader whether the strategy learned anything or just memorised.
 */
function SplitCompare({ inSample, outOfSample }: { inSample: Split; outOfSample: Split }) {
  const rows: { label: string; a: string; b: string; tone: string }[] = [
    { label: 'Return', a: pct(inSample.returnPct), b: pct(outOfSample.returnPct), tone: toneOf(outOfSample.returnPct) },
    { label: 'Max drawdown', a: num(inSample.maxDdPct, 2, '%'), b: num(outOfSample.maxDdPct, 2, '%'), tone: colors.down },
    { label: 'Sharpe', a: num(inSample.sharpe, 3), b: num(outOfSample.sharpe, 3), tone: toneOf(outOfSample.sharpe) },
    { label: 'Expectancy (R)', a: num(inSample.expectancyR, 4), b: num(outOfSample.expectancyR, 4), tone: toneOf(outOfSample.expectancyR) },
    { label: 'Trades', a: num(inSample.trades, 0), b: num(outOfSample.trades, 0), tone: colors.ink },
  ];
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.panel, padding: space.s16 }}>
      <View style={{ flexDirection: 'row', marginBottom: space.s8 }}>
        <View style={{ flex: 1.2 }} />
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text variant="eyebrowSm" color={colors.ink30}>
            FITTED
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text variant="eyebrowSm" color={colors.up}>
            OUT OF SAMPLE
          </Text>
        </View>
      </View>
      {rows.map((r, i) => (
        <View
          key={r.label}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: space.s8,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: colors.hairline,
          }}
        >
          <Text variant="body" color={colors.ink70} style={{ flex: 1.2 }}>
            {r.label}
          </Text>
          <Text variant="body" color={colors.ink30} style={{ flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
            {r.a}
          </Text>
          <Text variant="body" color={r.tone} style={{ flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
            {r.b}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The parameter sweep, drawn as bars.
 *
 * Five settings of the same idea, the edge measured at each. A flat row of bars is a strategy whose
 * result does not depend on getting one number exactly right; a single tall bar beside four flat
 * ones is a fit, and the shape says so faster than the label "3/5" does.
 */
function Sensitivity({ values, label }: { values: (number | null)[]; label: string | null }) {
  const real = values.filter((v): v is number => v !== null);
  if (real.length === 0) {
    return (
      <Text variant="body" color={colors.ink55}>
        The sweep was not recorded for this one.
      </Text>
    );
  }
  const max = Math.max(...real.map(Math.abs), 0.0001);
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.panel, padding: space.s16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 96, gap: space.s8 }}>
        {values.map((v, i) => {
          const h = v === null ? 0 : Math.max(3, (Math.abs(v) / max) * 84);
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
              <Text variant="eyebrowSm" color={colors.ink55} style={{ marginBottom: space.s4, fontVariant: ['tabular-nums'] }}>
                {v === null ? '—' : v.toFixed(3)}
              </Text>
              <View
                style={{
                  width: '100%',
                  height: h,
                  borderRadius: radius.glyph,
                  backgroundColor: v === null ? colors.surfaceAlt : v > 0 ? colors.up : colors.down,
                  opacity: v === null ? 0.4 : 0.9,
                }}
              />
            </View>
          );
        })}
      </View>
      <Text variant="bodySm" color={colors.ink55} style={{ marginTop: space.s12 }}>
        Expectancy in R at five parameter settings{label ? ` · ${label} held up` : ''}. Flat is robust; one tall bar is a fit.
      </Text>
    </View>
  );
}

/** Label / value, for the tables that carry the rest of the book. */
function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Row
      height={size.row}
      title={label}
      value={
        <Text variant="rowPrimary" color={tone ?? colors.ink} style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </Text>
      }
      figure="market"
    />
  );
}

/* ------------------------------------------------------------------ screen */

export default function StrategyLibraryDetail() {
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const page = useAsync(() => strategyLibrary.get(String(id)), [id]);

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
      <BackButton onPress={goBack} />
      <Text variant="screenTitle" style={{ flex: 1 }} numberOfLines={1}>
        {page.data?.strategy.name ?? 'Strategy'}
      </Text>
    </View>
  );

  if (!page.data) {
    return (
      <Screen>
        {header}
        {page.error ? (
          <Text variant="body" color={colors.ink55} style={{ marginTop: space.s16 }}>
            {String(page.error)}
          </Text>
        ) : (
          <LoadingRows count={5} height={size.rowLg} />
        )}
      </Screen>
    );
  }

  const s: StrategyDetail = page.data.strategy;
  const o = s.portfolio.outOfSample;
  const prov = page.data.provenance;

  return (
    <Screen testID={`strategy-library-${s.id}`}>
      {header}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.s34 }}>

      {/* Verdict first. It is the one thing a reader must not have to infer from the numbers. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8, marginTop: space.s12 }}>
        <View
          style={{
            paddingHorizontal: space.s12,
            paddingVertical: space.s4,
            borderRadius: radius.glyph,
            backgroundColor: s.survives ? 'rgba(43,216,122,0.14)' : colors.surfaceAlt,
          }}
        >
          <Text variant="eyebrowSm" color={s.survives ? colors.up : colors.ink55}>
            {s.survives ? 'SURVIVED THE GAUNTLET' : 'CUT BY THE GAUNTLET'}
          </Text>
        </View>
        {s.family ? (
          <Text variant="bodySm" color={colors.ink55}>
            {s.family}
          </Text>
        ) : null}
      </View>

      {s.about ? (
        <Text variant="body" color={colors.ink70} style={{ marginTop: space.s12 }}>
          {s.about}
          {s.aboutSource === 'family' ? (
            <Text variant="bodySm" color={colors.ink30}>
              {'  '}— describes the family, not this variant.
            </Text>
          ) : null}
        </Text>
      ) : null}

      {/* The headline five, all out of sample. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s8, marginTop: space.s16 }}>
        <StatTile label="Return (OOS)" value={pct(o.returnPct)} color={toneOf(o.returnPct)} figure="market" compact />
        <StatTile label="Max drawdown" value={num(o.maxDdPct, 2, '%')} color={colors.down} figure="market" compact />
        <StatTile label="Trades" value={num(o.trades, 0)} figure="market" compact />
        <StatTile label="Win rate" value={num(o.winRate, 1, '%')} figure="market" compact />
        <StatTile label="Profit factor" value={num(o.profitFactor, 3)} color={toneOf((o.profitFactor ?? 1) - 1)} figure="market" compact />
      </View>

      <Panel
        title="Fitted vs out of sample"
        note="The gap between these two columns is the result. A strategy that only works on the left learned the data, not the market."
      >
        <SplitCompare inSample={s.portfolio.inSample} outOfSample={s.portfolio.outOfSample} />
      </Panel>

      <Panel title="Parameter sweep">
        <Sensitivity values={s.sensitivity.expectancyR} label={s.sensitivity.label} />
      </Panel>

      <Panel title="At double commission" note="The test that kills most of them: the same book, with the fees doubled.">
        <Line label="Expectancy (R)" value={num(s.doubleCommission.expectancyR, 4)} tone={toneOf(s.doubleCommission.expectancyR)} />
        <Line label="Return" value={pct(s.doubleCommission.returnPct)} tone={toneOf(s.doubleCommission.returnPct)} />
      </Panel>

      {s.crossAsset.length > 0 ? (
        <Panel title="Assets it was not tuned on">
          {s.crossAsset.map((a) => (
            <Line key={a.asset} label={a.asset} value={num(a.expectancyR, 4)} tone={toneOf(a.expectancyR)} />
          ))}
        </Panel>
      ) : null}

      <Panel title="Risk-adjusted">
        <Line label="Sharpe" value={num(o.sharpe, 3)} tone={toneOf(o.sharpe)} />
        <Line label="Sortino" value={num(o.sortino, 3)} tone={toneOf(o.sortino)} />
        <Line label="Expectancy (R)" value={num(o.expectancyR, 4)} tone={toneOf(o.expectancyR)} />
        <Line label="Avg hold" value={o.avgHoldBars === null || o.avgHoldBars === undefined ? '—' : `${o.avgHoldBars.toFixed(1)} bars`} />
      </Panel>

      <Panel title="Wins and losses">
        <Line label="Wins" value={num(o.wins, 0)} tone={colors.up} />
        <Line label="Losses" value={num(o.losses, 0)} tone={colors.down} />
        <Line label="Average win" value={o.avgWinUsd === null || o.avgWinUsd === undefined ? '—' : `$${o.avgWinUsd.toFixed(4)}`} tone={colors.up} />
        <Line label="Average loss" value={o.avgLossUsd === null || o.avgLossUsd === undefined ? '—' : `$${o.avgLossUsd.toFixed(4)}`} tone={colors.down} />
        <Line label="Best trade" value={pct(o.bestTradePct)} tone={colors.up} />
        <Line label="Worst trade" value={pct(o.worstTradePct)} tone={colors.down} />
        <Line label="Fees" value={o.feesUsd === null || o.feesUsd === undefined ? '—' : `$${o.feesUsd.toFixed(2)}`} tone={colors.ink55} />
      </Panel>

      {s.detail ? (
        <Panel title="The deeper book" note="A longer run over the full universe, for the 35 strategies that have one.">
          <Line label="Trades" value={num(s.detail.trades, 0)} />
          <Line label="Win rate" value={s.detail.winRate === null ? '—' : `${(s.detail.winRate * 100).toFixed(1)}%`} />
          <Line label="Net P&L" value={s.detail.totalPnlUsd === null ? '—' : `$${s.detail.totalPnlUsd.toFixed(2)}`} tone={toneOf(s.detail.totalPnlUsd)} />
          <Line label="Fees paid" value={s.detail.totalFeesUsd === null ? '—' : `$${s.detail.totalFeesUsd.toFixed(2)}`} tone={colors.down} />
          <Line label="Profit factor" value={num(s.detail.profitFactor, 3)} />
          <Line label="Max drawdown" value={s.detail.maxDrawdownUsd === null ? '—' : `$${s.detail.maxDrawdownUsd.toFixed(2)}`} tone={colors.down} />
          <Line label="Average win" value={s.detail.avgWinUsd === null ? '—' : `$${s.detail.avgWinUsd.toFixed(2)}`} tone={colors.up} />
          <Line label="Average loss" value={s.detail.avgLossUsd === null ? '—' : `$${s.detail.avgLossUsd.toFixed(2)}`} tone={colors.down} />
          <Line label="Average hold" value={s.detail.avgHoldMinutes === null ? '—' : `${Math.round(s.detail.avgHoldMinutes)} min`} />
        </Panel>
      ) : null}

      {s.failedOn.length > 0 ? (
        <Panel title={s.survives ? 'Noted against it' : 'Why it was cut'}>
          {s.failedOn.map((f, i) => (
            <Text key={i} variant="body" color={colors.ink70} style={{ marginBottom: space.s4 }}>
              • {f}
            </Text>
          ))}
        </Panel>
      ) : null}

      <Panel title="Where these come from">
        <Text variant="bodySm" color={colors.ink55}>
          {prov.source}. {prov.method}.
          {prov.universe ? ` ${prov.universe} symbols` : ''}
          {prov.interval ? ` · ${prov.interval} bars` : ''}
          {prov.bars ? ` · ${prov.bars} per symbol` : ''}
          {prov.sizeUsd ? ` · $${prov.sizeUsd} a position` : ''}.
        </Text>
        <Text variant="bodySm" color={colors.ink55} style={{ marginTop: space.s8 }}>
          {prov.caveat}
        </Text>
      </Panel>

      </ScrollView>
    </Screen>
  );
}
