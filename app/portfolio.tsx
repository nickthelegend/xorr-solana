/**
 * Portfolio — what the wallet is worth, what the bot holds, and what it made (2026-09-12).
 *
 * Opened from the balance on Home. The balance with its week drawn under it, money in and out, then
 * every open position as a card — the recent price with its entry, target and stop, the trades that
 * built it and why — then profit, cash and earning.
 *
 * The graph is arithmetic on real data, not a stored history: each open position's units times that
 * coin's four-hour closes over the last week, summed. It shows how what is held NOW moved — it does not
 * replay buys and sells, and its caption says exactly that.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  AreaChart,
  BackButton,
  Button,
  Eyebrow,
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
  toCandles,
  NoteStrip,
} from '@/ui';
import { PositionCard, PositionCardSkeleton, type PositionLevel } from '@/ui/PositionCard';
import { Rise } from '@/ui/Rise';
import { RollingNumber } from '@/ui/RollingNumber';
import { STAGGER } from '@/ui/motion';
import { signedMoney } from '@/format';
import { repos } from '@/data';
import { system } from '@/data/system';
import { useAsync } from '@/data/useAsync';
import type { Strategy } from '@/data/types';
import { driftSentence, holdingDrift } from '@/state/derived';

const GRAPH_H = 150;
/** A week of four-hour closes for the graph; two days of hourly closes on each card. */
const GRAPH_TF = '4H' as const;
const CARD_TF = '1H' as const;
const CARD_POINTS = 48;

const card = {
  marginTop: space.s14,
  marginHorizontal: space.gutter,
  padding: space.s16,
  borderRadius: radius.panel,
  backgroundColor: colors.surfaceAlt,
} as const;

/**
 * Closes per symbol, each arriving on its own.
 *
 * One `Promise.all` made every card wait for the slowest coin: CBBTC's history answered 503 after
 * eight seconds while WETH's took half of one, and WETH's chart sat as a skeleton the whole time. Each
 * symbol now lands in the map as soon as it answers — `undefined` while in flight, `null` when it
 * could not be read, and never a guessed series.
 */
function useClosesBySymbol(symbolsKey: string, timeframe: '1H' | '4H'): Record<string, number[] | null> {
  /*
   * Tagged with the question it answers, so a new set of symbols reads as empty until its own answers
   * arrive — rather than clearing state synchronously inside the effect, which re-rendered for nothing.
   */
  const key = `${timeframe}:${symbolsKey}`;
  const [answered, setAnswered] = useState<{ key: string; closes: Record<string, number[] | null> }>({
    key: '',
    closes: NO_CLOSES,
  });
  useEffect(() => {
    let alive = true;
    for (const symbol of symbolsKey ? symbolsKey.split(',') : []) {
      repos.markets
        .candles(symbol, timeframe)
        .then((candles) => toCandles(candles.bars).map((c) => c.close))
        .catch(() => null)
        .then((value) => {
          if (!alive) return;
          setAnswered((prev) => ({
            key,
            closes: { ...(prev.key === key ? prev.closes : NO_CLOSES), [symbol]: value },
          }));
        });
    }
    return () => {
      alive = false;
    };
  }, [key, symbolsKey, timeframe]);
  return answered.key === key ? answered.closes : NO_CLOSES;
}

/** One empty map, so "nothing answered yet" keeps the same identity across renders. */
const NO_CLOSES: Record<string, number[] | null> = {};

/** Take profit and stop loss on a symbol, from the exit rules set on it — and nothing when there are none. */
function exitLevels(strategies: readonly Strategy[], symbol: string, entry: number): PositionLevel[] {
  const rule = strategies.find(
    (s) => s.kind === 'exit-rules' && s.symbol === symbol && (s.state === 'live' || s.state === 'watch'),
  );
  if (!rule) return [];
  const levels: PositionLevel[] = [];
  const tp = Math.abs(Number(rule.params.takeProfitPct ?? 0));
  const sl = Math.abs(Number(rule.params.stopLossPct ?? 0));
  if (tp > 0) {
    const value = entry * (1 + tp / 100);
    levels.push({ label: 'TP', value, formatted: fmtPrice(value), tone: 'target' });
  }
  if (sl > 0) {
    const value = entry * (1 - sl / 100);
    levels.push({ label: 'SL', value, formatted: fmtPrice(value), tone: 'stop' });
  }
  return levels;
}

export default function Portfolio() {
  const goBack = useGoBack();
  const router = useRouter();
  const balance = useAsync(() => repos.portfolio.balance(), []);
  const positions = useAsync(() => repos.portfolio.positions(), []);
  const realised = useAsync(() => repos.portfolio.realised(), []);
  const strategies = useAsync(() => repos.strategies.list(), []);
  const runs = useAsync(() => system.runs(200), []);
  const activity = useAsync(() => repos.activity.list(), []);

  const book = useMemo(() => positions.data ?? [], [positions.data]);
  const symbolsKey = book.map((p) => p.symbol).join(',');
  const weekly = useClosesBySymbol(symbolsKey, GRAPH_TF);
  const daily = useClosesBySymbol(symbolsKey, CARD_TF);

  /*
   * The week, summed across the positions whose history arrived. Undefined until every coin has
   * answered one way or the other. A coin whose history could not be read is left out of the sum AND
   * out of the caption, rather than silently counted as flat.
   */
  const graph = useMemo<{ points: number[]; symbols: string[] } | undefined>(() => {
    if (positions.data === undefined) return undefined;
    if (book.length === 0) return { points: [], symbols: [] };
    if (book.some((p) => weekly[p.symbol] === undefined)) return undefined;
    const lines = book
      .map((p) => ({ symbol: p.symbol, units: p.units, closes: weekly[p.symbol] ?? [] }))
      .filter((l) => l.closes.length > 1);
    if (lines.length === 0) return { points: [], symbols: [] };
    const n = Math.min(...lines.map((l) => l.closes.length));
    return {
      points: Array.from({ length: n }, (_, i) =>
        lines.reduce((sum, l) => sum + l.units * l.closes[l.closes.length - n + i]!, 0),
      ),
      symbols: lines.map((l) => l.symbol),
    };
  }, [positions.data, book, weekly]);
  const points = graph?.points ?? [];
  const graphDelta = points.length > 1 ? points[points.length - 1]! - points[0]! : 0;
  const graphPct = points.length > 1 && points[0]! > 0 ? (graphDelta / points[0]!) * 100 : 0;

  /* Fills per symbol — how many trades built each position. */
  const trades = useMemo(() => {
    if (!runs.data) return undefined;
    const by: Record<string, number> = {};
    for (const r of runs.data) if (r.status === 'filled') by[r.symbol] = (by[r.symbol] ?? 0) + 1;
    return by;
  }, [runs.data]);

  /* The bot's own words for its latest trade in a symbol, from the audit trail. */
  const whyFor = (symbol: string): string | undefined => {
    const event = (activity.data ?? []).find((e) => e.kind === 'trade' && e.action.includes(symbol));
    return event ? [event.action, event.detail].filter(Boolean).join('. ') : undefined;
  };

  const unrealised = book.reduce((sum, p) => sum + p.unrealised, 0);
  const cost = book.reduce((sum, p) => sum + (p.notional - p.unrealised), 0);
  const unrealisedPct = cost > 0 ? (unrealised / cost) * 100 : undefined;
  const total = balance.data?.total ?? null;

  return (
    <Screen gutter="none" sheet>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.gutter }}>
        <BackButton onPress={goBack} />
        <Text variant="cardTitle" align="center" style={{ flex: 1 }}>
          Portfolio
        </Text>
        {/* Balances the back button, so the title sits in the true centre. */}
        <View style={{ width: size.hit }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.s30 }}>
        <Rise index={0} style={{ alignItems: 'center', marginTop: space.s14 }}>
          <Eyebrow>Total balance</Eyebrow>
          {total !== null ? (
            <RollingNumber
              value={money(total)}
              variant="heroBalance"
              delay={STAGGER}
              containerStyle={{ marginTop: space.s6 }}
            />
          ) : balance.loading ? (
            <Placeholder width={200} height={46} style={{ marginTop: space.s8, borderRadius: radius.tile }} />
          ) : (
            <Price variant="heroBalance" style={{ marginTop: space.s6 }}>
              —
            </Price>
          )}
          {positions.loading && !positions.data ? (
            <Placeholder width={160} height={14} style={{ marginTop: space.s10 }} />
          ) : unrealisedPct !== undefined ? (
            <Price variant="secondarySm" tone={pnlTone(unrealised)} style={{ marginTop: space.s6 }}>
              {`${signedMoney(unrealised)} · ${percent(unrealisedPct)} open`}
            </Price>
          ) : null}
        </Rise>

        <Rise index={1} style={{ marginTop: space.s18, paddingHorizontal: space.gutter }}>
          {graph === undefined ? (
            <Placeholder height={GRAPH_H} style={{ borderRadius: radius.tile }} />
          ) : graph.points.length > 1 ? (
            <>
              <AreaChart
                data={graph.points}
                height={GRAPH_H}
                color={graphDelta < 0 ? colors.down : colors.up}
                grid
                drawIn
              />
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.s8 }}
              >
                <Text variant="footnote" color={colors.ink40}>
                  {`${graph.symbols.join(' + ')}, over the last week`}
                </Text>
                <Price variant="footnote" tone={pnlTone(graphDelta)}>
                  {`${signedMoney(graphDelta)} · ${percent(graphPct)}`}
                </Price>
              </View>
            </>
          ) : null}
        </Rise>

        <Rise
          index={2}
          style={{ flexDirection: 'row', gap: space.s10, marginTop: space.s18, paddingHorizontal: space.gutter }}
        >
          <View style={{ flex: 1 }}>
            <Button label="Deposit" onPress={() => router.push('/deposit')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Withdraw" variant="ghost" onPress={() => router.push('/send')} />
          </View>
        </Rise>

        <Rise index={3} style={{ marginTop: space.s26, paddingHorizontal: space.gutter, gap: space.s12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text variant="cardTitle">Positions</Text>
            {positions.data ? (
              <Text variant="secondarySm" color={colors.ink40}>
                {book.length === 1 ? '1 open' : `${book.length} open`}
              </Text>
            ) : null}
          </View>
          {positions.loading && !positions.data ? (
            <>
              <PositionCardSkeleton />
              <PositionCardSkeleton />
            </>
          ) : book.length === 0 ? (
            <View style={{ padding: space.s16, gap: space.s12, borderRadius: radius.panel, backgroundColor: colors.surfaceAlt }}>
              <Text variant="body" color={colors.ink40}>
                {positions.error ? 'Positions could not be loaded.' : 'No open positions yet.'}
              </Text>
              {!positions.error ? (
                <Button label="Start a recurring buy" variant="ghost" onPress={() => router.push('/strategy/dca')} />
              ) : null}
            </View>
          ) : (
            book.map((p) => (
              <PositionCard
                key={p.id}
                symbol={p.symbol}
                side={p.side}
                price={fmtPrice(p.mark)}
                pnl={signedMoney(p.unrealised)}
                pnlPct={percent(p.unrealisedPct)}
                pnlValue={p.unrealised}
                series={daily[p.symbol] === undefined ? undefined : (daily[p.symbol] ?? []).slice(-CARD_POINTS)}
                levels={[
                  { label: 'ENTRY', value: p.entry, formatted: fmtPrice(p.entry), tone: 'entry' },
                  ...exitLevels(strategies.data ?? [], p.symbol, p.entry),
                ]}
                stats={[
                  { label: 'SIZE', value: quantity(p.units) },
                  { label: 'VALUE', value: money(p.notional) },
                  { label: 'P&L', value: signedMoney(p.unrealised), value2: p.unrealised },
                ]}
                trades={trades?.[p.symbol]}
                why={whyFor(p.symbol)}
                onPress={() => router.push(`/position/${p.id}`)}
              />
            ))
          )}
          {/* Where the ledger and the wallet disagree, said beside the cards it changes (PLAN.md 2.7). */}
          {book.map((p) => {
            const drift = holdingDrift(p);
            return drift ? (
              <NoteStrip key={`drift-${p.id}`} kind="risk" style={{ marginTop: space.s10 }}>
                {driftSentence(p.symbol, drift)}
              </NoteStrip>
            ) : null;
          })}
        </Rise>

        <Rise index={4} style={card}>
          <Text variant="cardTitle">Profit</Text>
          <Row
            height={size.rowSm}
            title="Open"
            secondary="On what the bot still holds"
            value={
              positions.data ? (
                <Price tone={pnlTone(unrealised)}>{signedMoney(unrealised)}</Price>
              ) : (
                <Placeholder width={80} height={18} />
              )
            }
          />
          <Row
            height={size.rowSm}
            divider={false}
            title="Taken"
            secondary="On what it sold"
            value={
              realised.data ? (
                <Price tone={pnlTone(realised.data.total)}>{signedMoney(realised.data.total)}</Price>
              ) : realised.loading ? (
                <Placeholder width={80} height={18} />
              ) : (
                <Price>—</Price>
              )
            }
          />
        </Rise>

        <Rise index={5} style={[card, { flexDirection: 'row', gap: space.s12 }]}>
          <View style={{ flex: 1, gap: space.s4 }}>
            <Text variant="eyebrowSm">Cash</Text>
            {balance.data ? (
              <Price variant="rowPrimary">{money(balance.data.cash)}</Price>
            ) : balance.loading ? (
              <Placeholder width={70} height={18} />
            ) : (
              <Price variant="rowPrimary">—</Price>
            )}
          </View>
          <Press
            onPress={() => router.push('/yield')}
            accessibilityRole="button"
            accessibilityLabel="Earning, supplied to Aave. Opens yield."
            style={{ flex: 1, gap: space.s4 }}
          >
            <Text variant="eyebrowSm">Earning</Text>
            {balance.data ? (
              <Price variant="rowPrimary">{money(balance.data.supplied)}</Price>
            ) : balance.loading ? (
              <Placeholder width={70} height={18} />
            ) : (
              <Price variant="rowPrimary">—</Price>
            )}
          </Press>
        </Rise>
      </ScrollView>
    </Screen>
  );
}
