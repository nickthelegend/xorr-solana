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
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { BackButton, Button, colors, LoadingRows, PnlBars, radius, Ring, Row, Screen, size, space, StatTile, Text } from '@/ui';
import { useGoBack } from '@/nav/useGoBack';
import { count, plainPct, ratio, returnPct, tone, usd } from '@/strategies/format';
import { pnlStructure, pnlStructureFromDetail } from '@/strategies/pnl';
import { seedFromStrategy } from '@/strategies/seedAgent';
import { repos } from '@/data';
import { useRouter } from 'expo-router';
import { useAsync } from '@/data/useAsync';
import { strategyLibrary, type Split, type StrategyDetail } from '@/data/strategyLibrary';

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
    { label: 'Return', a: returnPct(inSample.returnPct), b: returnPct(outOfSample.returnPct), tone: tone(outOfSample.returnPct) },
    { label: 'Max drawdown', a: plainPct(inSample.maxDdPct), b: plainPct(outOfSample.maxDdPct), tone: colors.down },
    { label: 'Sharpe', a: ratio(inSample.sharpe, 3), b: ratio(outOfSample.sharpe, 3), tone: tone(outOfSample.sharpe) },
    { label: 'Expectancy (R)', a: ratio(inSample.expectancyR, 4), b: ratio(outOfSample.expectancyR, 4), tone: tone(outOfSample.expectancyR) },
    { label: 'Trades', a: count(inSample.trades), b: count(outOfSample.trades), tone: colors.ink },
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
                {ratio(v, 3)}
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
  const router = useRouter();
  const [aboutOpen, setAboutOpen] = React.useState(false);
  const [hiring, setHiring] = React.useState(false);
  const [hireError, setHireError] = React.useState<string | null>(null);
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
  /*
   * The deeper book where a strategy has one, the out-of-sample split otherwise.
   *
   * Never the fitted split: a P&L drawn from the data a strategy was tuned on is the number that
   * flatters it, and putting it under a heading that says "profit" would undo the point of the
   * comparison above.
   */
  const pnl = s.detail ? pnlStructureFromDetail(s.detail) : pnlStructure(o);
  const pnlBasis = s.detail ? 'the deeper book across the full universe' : 'the out-of-sample split';
  const seed = seedFromStrategy(s);

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
        <>
          {/*
            * Clamped, and tappable to open.
            *
            * These are module docstrings written for a reader with the source open — the Liquidation
            * Flow one runs to a full page and pushed every number below the fold on a phone. Four
            * lines is enough to know what the idea is; the rest is there for anyone who wants it.
            */}
          <Text
            variant="body"
            color={colors.ink70}
            numberOfLines={aboutOpen ? undefined : 4}
            style={{ marginTop: space.s12 }}
          >
            {s.about}
          </Text>
          <Pressable
            onPress={() => setAboutOpen((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={aboutOpen ? 'Show less of the description' : 'Show the full description'}
          >
            <Text variant="bodySm" color={colors.ink55} style={{ marginTop: space.s4 }}>
              {aboutOpen ? 'Less' : 'More'}
              {s.aboutSource === 'family' ? ' · describes the family, not this variant' : ''}
            </Text>
          </Pressable>
        </>
      ) : null}

      {/* The headline five, all out of sample. */}
      {/*
        * Three to a row. Five across a phone cut every label to "RET…" and wrapped "+2.48%" onto
        * two lines, which is a worse way to show a number than not showing it.
        */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s8, marginTop: space.s16 }}>
        {[
          { label: 'Return', value: returnPct(o.returnPct), color: tone(o.returnPct) },
          { label: 'Drawdown', value: plainPct(o.maxDdPct), color: colors.down },
          { label: 'Trades', value: count(o.trades), color: undefined },
          { label: 'Win rate', value: plainPct(o.winRate, 1), color: undefined },
          { label: 'PF', value: ratio(o.profitFactor, 2), color: tone((o.profitFactor ?? 1) - 1) },
          { label: 'Sharpe', value: ratio(o.sharpe, 2), color: tone(o.sharpe) },
        ].map((t) => (
          <View key={t.label} style={{ flexBasis: '31.5%', flexGrow: 1 }}>
            <StatTile label={t.label} value={t.value} color={t.color} figure="market" compact />
          </View>
        ))}
      </View>
      <Text variant="bodySm" color={colors.ink30} style={{ marginTop: space.s8 }}>
        All six measured out of sample. PF is the profit factor: gross profit over gross loss.
      </Text>

      <Panel
        title="Fitted vs out of sample"
        note="The gap between these two columns is the result. A strategy that only works on the left learned the data, not the market."
      >
        <SplitCompare inSample={s.portfolio.inSample} outOfSample={s.portfolio.outOfSample} />
      </Panel>

      {pnl ? (
        <Panel title="Profit and loss" note={`Where the money came from and went, over ${pnlBasis}.`}>
          <PnlBars pnl={pnl} />
        </Panel>
      ) : null}

      {pnl ? (
        <Panel
          title="Win rate"
          /*
           * The basis, said again.
           *
           * The tiles at the top count the out-of-sample split and this counts the deeper book, so
           * the two trade counts differ — 80 against 26 on Liq Absorption. Both are true and a
           * reader who spots the gap without being told which is which is right to distrust the page.
           */
          note={`Over ${pnlBasis}.`}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.s20,
              backgroundColor: colors.surface,
              borderRadius: radius.panel,
              padding: space.s16,
            }}
          >
            <Ring
              fraction={pnl.winRate}
              value={plainPct(pnl.winRate * 100, 1)}
              label="Won"
              accessibilityLabel={`Win rate ${plainPct(pnl.winRate * 100, 1)}`}
            />
            <View style={{ flex: 1, gap: space.s6 }}>
              <Text variant="body" color={colors.up}>
                {count(pnl.wins)} won{'  '}
                <Text variant="bodySm" color={colors.ink55}>
                  avg {usd(pnl.grossProfitUsd / Math.max(1, pnl.wins), 4)}
                </Text>
              </Text>
              <Text variant="body" color={colors.down}>
                {count(pnl.losses)} lost{'  '}
                <Text variant="bodySm" color={colors.ink55}>
                  avg {usd(pnl.grossLossUsd / Math.max(1, pnl.losses), 4)}
                </Text>
              </Text>
              {/*
                * The sentence a win rate needs beside it. Several survivors here win under half
                * their trades and still make money, and a bare "40%" reads as failure without it.
                */}
              <Text variant="bodySm" color={colors.ink55}>
                {pnl.winRate < 0.5
                  ? 'It loses more often than it wins, and makes it back on the size of the wins.'
                  : 'It wins more often than it loses.'}
              </Text>
            </View>
          </View>
        </Panel>
      ) : null}

      <Panel title="Parameter sweep">
        <Sensitivity values={s.sensitivity.expectancyR} label={s.sensitivity.label} />
      </Panel>

      <Panel title="At double commission" note="The test that kills most of them: the same book, with the fees doubled.">
        <Line label="Expectancy (R)" value={ratio(s.doubleCommission.expectancyR, 4)} tone={tone(s.doubleCommission.expectancyR)} />
        <Line label="Return" value={returnPct(s.doubleCommission.returnPct)} tone={tone(s.doubleCommission.returnPct)} />
      </Panel>

      {s.crossAsset.length > 0 ? (
        <Panel title="Assets it was not tuned on">
          {s.crossAsset.map((a) => (
            <Line key={a.asset} label={a.asset} value={ratio(a.expectancyR, 4)} tone={tone(a.expectancyR)} />
          ))}
        </Panel>
      ) : null}

      <Panel title="Risk-adjusted">
        <Line label="Sharpe" value={ratio(o.sharpe, 3)} tone={tone(o.sharpe)} />
        <Line label="Profit factor" value={ratio(o.profitFactor, 3)} tone={tone((o.profitFactor ?? 1) - 1)} />
        <Line label="Sortino" value={ratio(o.sortino, 3)} tone={tone(o.sortino)} />
        <Line label="Expectancy (R)" value={ratio(o.expectancyR, 4)} tone={tone(o.expectancyR)} />
        <Line label="Avg hold" value={o.avgHoldBars === null || o.avgHoldBars === undefined ? '—' : `${ratio(o.avgHoldBars, 1)} bars`} />
      </Panel>

      <Panel title="Wins and losses">
        <Line label="Wins" value={count(o.wins)} tone={colors.up} />
        <Line label="Losses" value={count(o.losses)} tone={colors.down} />
        <Line label="Average win" value={usd(o.avgWinUsd, 4)} tone={colors.up} />
        <Line label="Average loss" value={usd(o.avgLossUsd, 4)} tone={colors.down} />
        <Line label="Best trade" value={returnPct(o.bestTradePct)} tone={colors.up} />
        <Line label="Worst trade" value={returnPct(o.worstTradePct)} tone={colors.down} />
        <Line label="Fees" value={usd(o.feesUsd)} tone={colors.ink55} />
      </Panel>

      {s.detail ? (
        <Panel title="The deeper book" note="A longer run over the full universe, for the 35 strategies that have one.">
          <Line label="Trades" value={count(s.detail.trades)} />
          <Line label="Win rate" value={plainPct(s.detail.winRate === null ? null : s.detail.winRate * 100, 1)} />
          <Line label="Net P&L" value={usd(s.detail.totalPnlUsd)} tone={tone(s.detail.totalPnlUsd)} />
          <Line label="Fees paid" value={usd(s.detail.totalFeesUsd)} tone={colors.down} />
          <Line label="Profit factor" value={ratio(s.detail.profitFactor, 3)} />
          <Line label="Max drawdown" value={usd(s.detail.maxDrawdownUsd)} tone={colors.down} />
          <Line label="Average win" value={usd(s.detail.avgWinUsd)} tone={colors.up} />
          <Line label="Average loss" value={usd(s.detail.avgLossUsd)} tone={colors.down} />
          <Line label="Average hold" value={s.detail.avgHoldMinutes === null ? '—' : `${count(Math.round(s.detail.avgHoldMinutes))} min`} />
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

      {/*
        * Hiring an agent that follows this.
        *
        * The seed fills in what the measurements support and recommends the rest with its reason,
        * because 313 researched strategies do not map onto four fixed personas and quietly choosing
        * one would be the dishonest half of this feature. The persona is editable on the agent
        * afterwards; nothing here is irreversible except the agent existing, which Fire undoes.
        */}
      <Panel
        title="Put it to work"
        note="Hires an agent on this wallet that follows the persona below. It trades inside the permission you already granted — the same cap, the same kill switch — and nothing about this strategy's past is a promise about its future."
      >
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.panel, padding: space.s16 }}>
          <Text variant="rowPrimary" color={colors.ink}>
            {seed.name}
          </Text>
          <Text variant="bodySm" color={colors.ink55} style={{ marginTop: space.s4 }}>
            {seed.role}
          </Text>
          <Text variant="bodySm" color={colors.ink70} style={{ marginTop: space.s12 }}>
            {seed.why}
          </Text>
          {hireError ? (
            <Text variant="bodySm" color={colors.down} style={{ marginTop: space.s12 }}>
              {hireError}
            </Text>
          ) : null}
          <View style={{ marginTop: space.s16 }}>
            <Button
              label={hiring ? 'Hiring…' : 'Hire an agent for this'}
              loading={hiring}
              disabled={hiring}
              testID="strategy-seed-agent"
              onPress={async () => {
                setHireError(null);
                setHiring(true);
                try {
                  const existing = await repos.bot.listAgents().catch(() => []);
                  const fresh = seedFromStrategy(s, existing.map((a) => a.name));
                  const agent = await repos.bot.createAgent({
                    name: fresh.name,
                    role: fresh.role,
                    style: fresh.style,
                  });
                  router.push(`/agent/${agent.id}`);
                } catch (e) {
                  /* The executor's own words: it knows why it refused and the screen does not. */
                  setHireError(e instanceof Error ? e.message : 'That did not go through.');
                } finally {
                  setHiring(false);
                }
              }}
            />
          </View>
        </View>
      </Panel>

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
