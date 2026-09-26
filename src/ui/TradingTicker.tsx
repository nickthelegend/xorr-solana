/**
 * TradingTicker.tsx — what the agents are doing at this moment.
 *
 * The app could say what the bot had done and what it was allowed to do, and never that it was doing something. This is
 * that line, from `strategy_runs.status = 'pending'` — a run that started and has not finished, which is the only
 * honest signal in the system for the present tense. What it may claim, and the two ways that claim could lie, are
 * `src/state/tradingNow.ts`, pure and tested.
 *
 * ## It is not a marquee
 *
 * "Ticker" here means a line that is current, not a line that travels. `animations.md` bans the ambient looping case by
 * name — "a pulsing dot on a bottom tab is a distraction the user can't dismiss" — and a strip scrolling text forever
 * is that with more surface area. It also keeps moving when nothing is happening, which on this particular sentence
 * would be motion implying activity that the data does not support.
 *
 * So the line changes when the answer changes, and holds still otherwise. The one moving thing is the dot beside it,
 * and only while a run is genuinely in flight: a breath on the skeleton's cadence, the app's own way of saying
 * something is still coming. It stops the moment the run does.
 *
 * ## The dot's colour
 *
 * Never green. Green means profit here, and the kill-switch chip holds the app's one sanctioned exception for a
 * different question. Trading is activity, not a gain, so the live dot is plain ink and the stuck one is `warn`.
 */
import React, { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { tradingLine, tradingNow, type RunLike } from '@/state/tradingNow';
import { duration, timing, useReducedMotion } from './motion';
import { Text } from './Text';
import { colors, radius, space } from './tokens';

const DOT = 7;
/** How far the live dot dims. The skeleton's depth, because it means the same thing: still going. */
const DIM = 0.35;

export interface TradingTickerProps {
  /**
   * What the agent's last sweep said for itself, when it is not trading.
   *
   * Its headline replaces "No agent is trading right now": the agent is idle almost always, and an owner cannot tell a
   * working agent from a stopped one unless the idle line says what it looked at.
   */
  lastLook?: { headline: string } | null;

  /** The recorded runs, or undefined while the read is out. */
  runs: readonly RunLike[] | undefined;
  /** The read came back unable to answer. Never resolved into "nothing is happening". */
  failed?: boolean;
  /**
   * How many lines the sentence may take before it is cut (2026-09-25). One by default, as it always was.
   *
   * The last look's sentences run long — what an agent bought and why, or the setup it did not find — and one line cut
   * them off at the part that said anything. Home passes two.
   */
  lines?: number;
  /** For tests and stories; defaults to now. */
  now?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function TradingTicker({ runs, failed = false, now, lastLook, lines = 1, style, testID }: TradingTickerProps) {
  const reduced = useReducedMotion();
  const state = tradingNow(runs, { failed, now });
  const line = tradingLine(state, lastLook);
  const live = state.kind === 'trading';

  /* 1 at full, dimmer at the bottom of the breath. Only ever driven while something is genuinely in flight. */
  const breath = useSharedValue(1);
  useEffect(() => {
    if (!live || reduced) {
      breath.set(withTiming(1, timing(duration.slow, reduced)));
      return;
    }
    // `true` reverses, so it breathes rather than snapping back at the loop boundary — the skeleton's own cadence.
    breath.set(withRepeat(withTiming(DIM, timing(duration.pulse, reduced)), -1, true));
  }, [live, reduced, breath]);
  const breathing = useAnimatedStyle(() => ({ opacity: breath.get() }));

  const tone = live ? colors.ink : state.kind === 'stuck' || state.kind === 'unknown' ? colors.warn : colors.ink30;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={line}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s8,
          paddingHorizontal: space.s12,
          paddingVertical: space.s8,
          borderRadius: radius.card,
          backgroundColor: colors.surfaceAlt,
        },
        style,
      ]}
    >
      <Animated.View
        style={[{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: tone }, breathing]}
      />
      <Text
        variant="footnote"
        color={state.kind === 'idle' ? colors.ink45 : colors.ink65}
        numberOfLines={lines}
        style={{ flex: 1 }}
      >
        {line}
      </Text>
    </View>
  );
}
