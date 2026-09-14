/**
 * RollingNumber.tsx — a figure whose digits rise into place.
 *
 * The reference video's balances arrive with their digits sliding up. This does that WITHOUT counting:
 * each digit rises into the slot it keeps, already showing its true value, so no frame ever displays a
 * number the wallet or the market did not produce — the price rule, kept. The row is clipped to its own
 * box, which is what makes a rise read as a roll.
 *
 * Every character rises, the sign and separators with the digits, in one quick left-to-right ripple.
 * Moving only the digits was tried first and looked broken on a real device: for the moment before
 * the digits started, the line read "$ ," — punctuation waiting alone for a number.
 *
 * It rolls ONCE — when the figure first appears. A live price that ticks every few seconds changes in
 * place afterwards: a roll on every update would turn a quiet market into a flickering one.
 *
 * One clock drives the ripple (2026-09-12). Each character used to carry its own staggered
 * `FadeInDown`, chosen per render from a ref that flipped after the first commit, so the next render
 * handed the same mounted characters `entering={undefined}`. A character still waiting out its stagger
 * could be left where its animation starts — below the clip, invisible, still taking its width: the
 * Aave sheet read "$12" for a price of $126.48. A shared value runs on the UI thread and no render can
 * interrupt it, and a character that mounts after the ripple — a wider figure — reads a finished clock
 * and is simply there.
 *
 * While balances are hidden (FEATURES.md #47) the figure is masked whole before it is split, and the mask
 * is what rolls. Masked a character at a time, no character would hold a dollar figure to mask.
 */
import React, { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { maskFigure, maskMode, spokenFigure } from './mask';
import { easeOut, useReducedMotion } from './motion';
import { Price, useBalancesHidden, type PriceProps } from './Text';
import { duration } from './tokens';

/** Between one character starting and the next — a left-to-right ripple across the figure. */
const DIGIT_STAGGER = 28;
/** How far below its slot a character starts — the rise `FadeInDown` makes, so it matches `<Rise>`. */
const RISE = 25;

export interface RollingNumberProps extends Omit<PriceProps, 'children'> {
  /** The formatted figure — exactly the string `<Price>` would take. */
  value: string;
  /** Hold the roll this long first, in ms, so it lands with the section around it. */
  delay?: number;
  containerStyle?: StyleProp<ViewStyle>;
}

export function RollingNumber({ value, delay = 0, containerStyle, ...price }: RollingNumberProps) {
  const reduced = useReducedMotion();
  const hidden = useBalancesHidden();
  const shown = maskFigure(value, maskMode(hidden, price.variant, price.mask));
  /* The ripple's length is set by the figure first shown; `slot` covers a wider one later. */
  const [last] = useState(() => Math.max(0, Array.from(shown).length - 1));
  const span = duration.enter + last * DIGIT_STAGGER;
  /* Milliseconds along the ripple. */
  const clock = useSharedValue(0);

  useEffect(() => {
    // Once, on mount. `ReduceMotion.System` asks the OS as it runs; `useReducedMotion` answers late.
    clock.set(
      withDelay(
        delay,
        withTiming(span, { duration: span, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
        ReduceMotion.System,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // The setting answered after mount: land the figure now rather than finish the ripple.
    if (reduced) clock.set(span);
  }, [reduced, clock, span]);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={shown === value ? value : spokenFigure(shown)}
      style={[{ flexDirection: 'row', overflow: 'hidden' }, containerStyle]}
    >
      {Array.from(shown).map((ch, i) => (
        // Keyed by position: a ticking price changes a character in place instead of remounting it.
        <RollChar key={i} clock={clock} slot={Math.min(i, last)} price={price}>
          {ch}
        </RollChar>
      ))}
    </View>
  );
}

function RollChar({
  clock,
  slot,
  price,
  children,
}: {
  clock: SharedValue<number>;
  /** Where in the ripple this character starts. Past the first figure's width, the last slot. */
  slot: number;
  price: Omit<PriceProps, 'children'>;
  children: string;
}) {
  const style = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, (clock.get() - slot * DIGIT_STAGGER) / duration.enter));
    const eased = easeOut(t);
    return { opacity: eased, transform: [{ translateY: (1 - eased) * RISE }] };
  });
  return (
    <Animated.View style={style}>
      {/* Masked with the whole figure already, if it is to be: one character on its own is never masked again. */}
      <Price {...price} mask={false} accessible={false}>
        {children}
      </Price>
    </Animated.View>
  );
}
