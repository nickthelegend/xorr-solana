/**
 * Screen 22 — Position & close. screens.md Group B.
 *
 * Mark + "{symbol} {side}" + leverage chip. Eyebrow + P&L 46/700, "{pct} on {notional} held".
 * Stat card: Entry / Mark / Size / Liquidation (down) / Funding paid (U+2212).
 * Close card: percentage + a 6pt fill bar + 25/50/75/100 pills + "Realises X and frees Y."
 * Edit TP/SL (flex:1) / "Close {n}%" (flex:1.3, white).
 *
 * The close button used to have no `onPress` at all: the primary action on the screen whose
 * entire job is closing a position did nothing. It now calls the executor, which picks the
 * price, splits the cost basis and signs the transfer — see `POST /positions/:id/close`.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { assetGradient } from '@/design/gradients';
import {
  AssetMark,
  BackButton,
  Button,
  ButtonRow,
  EmptyState,
  ErrorState,
  Fill,
  LoadingRows,
  NoteStrip,
  Pill,
  Price,
  Row,
  Screen,
  SheetCard,
  Tag,
  Text,
  colors,
  duration,
  money,
  percent,
  pnlTone,
  price as fmtPrice,
  quantity,
  radius,
  size,
  space,
  timing,
  useReducedMotion,
} from '@/ui';
import { signedMoney } from '@/format';
import { CLOSE_STEPS, closeCta, driftSentence, holdingDrift } from '@/state/derived';
import { useStore } from '@/state/store';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useIntentKeys } from '@/data/useIntentKeys';
import { useLogo } from '@/data/useLogos';
import { errorText } from '@/data/apiError';

/** The close bar. 6pt — a readout, not a control; the pills below it do the setting. */
const BAR_H = 6;
const STAT_ROW = 46;

export default function PositionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const closePct = useStore((s) => s.closePct);
  const setClosePct = useStore((s) => s.setClosePct);
  const reduced = useReducedMotion();

  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string>();
  const [closed, setClosed] = useState<{ proceeds: number; units: number } | undefined>();

  // Every figure below comes from the position book, valued at the live mark. The handoff's
  // entry $63,880 / mark $66,560 / liquidation $58,110 were design values with nothing
  // behind them.
  const { data: p, loading, error, reload } = useAsync(() => repos.portfolio.position(id!), [id]);
  const logo = useLogo(p?.symbol);

  const realise = p ? (p.unrealised * closePct) / 100 : 0;
  const free = p ? (p.margin * closePct) / 100 : 0;

  const pct = useSharedValue(closePct / 100);
  useEffect(() => {
    pct.value = withTiming(closePct / 100, timing(duration.base, reduced));
  }, [closePct, reduced, pct]);
  const fill = useAnimatedStyle(() => ({ width: `${pct.value * 100}%` }));

  /*
   * The close's Idempotency-Key (FEATURES.md #29): Close tapped again after a timeout is the same close. Another
   * percentage is another close, and so is the same one once the first has answered.
   */
  const keys = useIntentKeys();

  const close = useCallback(async () => {
    if (!p || closing) return;
    setClosing(true);
    setCloseError(undefined);
    try {
      const ask = { symbol: p.symbol, fraction: closePct / 100 };
      const res = await keys.send(ask, (idempotencyKey) => repos.portfolio.close(ask, { idempotencyKey }));
      if (res.status === 'closed') {
        setClosed({ proceeds: res.usd ?? 0, units: res.units ?? 0 });
        reload();
      } else {
        // A blocked or failed close is not a success. Say which, in the server's own words.
        setCloseError(res.detail ?? res.error ?? `The close came back "${res.status}".`);
      }
    } catch (e) {
      setCloseError(errorText(e));
    } finally {
      setClosing(false);
    }
  }, [p, closePct, closing, reload, keys]);

  const header = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s10,
        justifyContent: 'space-between',
      }}
    >
      {/* The identity group carries the flex, so the feed tag sits at the right edge
          without a bare spacer between them — design.md §4. */}
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.s10, flex: 1, minWidth: 0 }}
      >
        <BackButton onPress={() => goBack()} />
        {p ? <AssetMark gradient={assetGradient(p.symbol)} {...logo} size={26} /> : null}
        <Text variant="cardTitle" numberOfLines={1}>
          {p ? `${p.symbol} ${p.side}` : 'Position'}
        </Text>
        {p && p.leverage > 1 ? <Tag label={`${p.leverage}x lev`} small /> : null}
      </View>
      {p?.feed === 'unavailable' ? <Tag label="No feed" small tone="warn" /> : null}
    </View>
  );

  if (loading && !p) {
    return (
      <Screen>
        {header}
        <LoadingRows count={4} height={size.row} />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen>
        {header}
        <ErrorState error={error} onRetry={reload} />
      </Screen>
    );
  }
  if (!p) {
    return (
      <Screen>
        {header}
        {/* copy.md: plain and specific. This screen is reached with an id; the honest
            statement is that *this* position is gone, not that the book is empty — the
            user may well hold others. */}
        <EmptyState text="This position is no longer open." />
      </Screen>
    );
  }

  const flat = p.units <= 0;
  const drift = holdingDrift(p);

  return (
    <Screen>
      {header}

      <View style={{ marginTop: space.s26, gap: space.s6 }}>
        <Text variant="eyebrowSm">Unrealised</Text>
        <Price variant="pnlHero" tone={pnlTone(p.unrealised)}>
          {signedMoney(p.unrealised)}
        </Price>
        <Text variant="body" color={colors.ink55}>
          {percent(p.unrealisedPct)} on {money(p.notional)} held
        </Text>
      </View>

      <Fill style={{ marginTop: space.s20 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <SheetCard borderRadius={radius.panel} padding={space.s16}>
            <Row title="Entry" value={fmtPrice(p.entry)} height={STAT_ROW} />
            <Row title="Mark" value={fmtPrice(p.mark)} height={STAT_ROW} />
            <Row title="Size" value={`${quantity(p.units)} ${p.symbol}`} height={STAT_ROW} />
            {p.liquidation > 0 ? (
              <Row
                title="Liquidation"
                value={<Price tone="down">{fmtPrice(p.liquidation)}</Price>}
                height={STAT_ROW}
              />
            ) : null}
            <Row
              title="Funding paid"
              value={
                <Price color={colors.ink55}>
                  {p.fundingPaid === 0 ? 'None — spot' : signedMoney(-p.fundingPaid)}
                </Price>
              }
              height={STAT_ROW}
              divider={false}
            />
          </SheetCard>

          {drift ? (
            <NoteStrip kind="risk" style={{ marginTop: space.s14 }}>
              {driftSentence(p.symbol, drift)}
            </NoteStrip>
          ) : null}

          {closed ? (
            <NoteStrip kind="acted" style={{ marginTop: space.s14 }}>
              {`Sold ${quantity(closed.units)} ${p.symbol} for ${money(closed.proceeds)}.`}
            </NoteStrip>
          ) : null}

          {flat ? null : (
            <SheetCard
              borderRadius={radius.panel}
              padding={space.s16}
              style={{ marginTop: space.s14 }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                }}
              >
                <Text variant="cardTitle">Close</Text>
                <Price variant="screenTitle">{closePct}%</Price>
              </View>

              <View
                style={{
                  height: BAR_H,
                  borderRadius: BAR_H / 2,
                  backgroundColor: colors.control,
                  marginTop: space.s12,
                  overflow: 'hidden',
                }}
              >
                <Animated.View
                  style={[
                    { height: BAR_H, borderRadius: BAR_H / 2, backgroundColor: colors.ink },
                    fill,
                  ]}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: space.s8, marginTop: space.s14 }}>
                {CLOSE_STEPS.map((step) => (
                  <View key={step} style={{ flex: 1 }}>
                    <Pill
                      label={`${step}%`}
                      selected={step === closePct}
                      onPress={() => setClosePct(step)}
                      style={{ flexGrow: 1 }}
                    />
                  </View>
                ))}
              </View>

              <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s14 }}>
                Realises{' '}
                <Text variant="secondarySm" color={colors.ink}>
                  {signedMoney(realise)}
                </Text>{' '}
                and frees{' '}
                <Text variant="secondarySm" color={colors.ink}>
                  {money(free)}
                </Text>
                .
              </Text>

              {closeError ? (
                <Text variant="secondarySm" color={colors.down} style={{ marginTop: space.s10 }}>
                  {closeError}
                </Text>
              ) : null}
            </SheetCard>
          )}
        </ScrollView>
      </Fill>

      {flat ? (
        <Button label="Done" onPress={() => goBack()} />
      ) : (
        <ButtonRow
          style={{ marginTop: space.s14 }}
          secondary={
            <Button
              label="Edit TP/SL"
              variant="secondary"
              onPress={() => router.push(`/auto-close/${p.id}`)}
            />
          }
          primary={<Button label={closeCta(closePct)} loading={closing} onPress={close} />}
        />
      )}
    </Screen>
  );
}
