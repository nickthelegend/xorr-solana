/**
 * Text.tsx — the one text primitive.
 *
 * Nothing in the app renders RN's `Text` directly. Every string goes through here so that
 * `includeFontPadding: false`, tabular figures and a family-name-selected weight are not
 * things a screen can forget.
 *
 * `<Value>` and `<Price>` are the numeric wrappers. They re-assert `fontVariant` *after*
 * the caller's style, so a stray `fontVariant: []` further up can't turn proportional
 * figures back on in a price column.
 *
 * Two accessibility defaults live here for the same reason (FEATURES.md #74, #86, PLAN.md 5.11): a screen's title is
 * announced as a heading, and each role has a ceiling on how far the phone's text size may grow it.
 */
import React from 'react';
import {
  Text as RNText,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';
import { type as typeScale, variantColor, type TypeVariant } from './type';
import { colors } from './tokens';
import { figureText, maskFigure, maskMode, spokenFigure } from './mask';
/*
 * App state, read by the design system in this one place: whether balances are hidden (FEATURES.md #47). A tap on Home
 * has to reach every figure on every screen at once, and figures are drawn here. A provider would need the root layout,
 * and a prop would need every screen that shows money.
 */
import { useStore } from '@/state/store';

/** Forced tabular figures. Applied last so a caller's style cannot drop them. */
const lockTabular: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * How far each role may grow with the phone's text size.
 *
 * Unbounded, a hero balance at the largest accessibility size runs off its line, and a pill's label clips inside a
 * fixed 34pt control. So reading text grows the most, because rows wrap; titles and figures grow less, because they
 * hold one line; and the words inside a fixed-height control grow least. A `Record` over every variant, so a new role
 * cannot ship without a ceiling. The web ignores this and follows the browser's zoom.
 */
const FONT_SCALE_CAP: Readonly<Record<TypeVariant, number>> = {
  heroAmount: 1.15,
  heroBalance: 1.15,
  pnlHero: 1.15,
  priceLg: 1.15,
  priceMd: 1.2,
  priceSm: 1.3,
  amountLg: 1.15,
  amountMd: 1.2,
  onboardingTitle: 1.3,
  titleLg: 1.3,
  screenTitle: 1.3,
  sheetTitle: 1.3,
  cardTitleLg: 1.4,
  cardTitle: 1.4,
  rowPrimaryLg: 1.5,
  rowPrimary: 1.5,
  value: 1.4,
  bodyLg: 1.6,
  body: 1.6,
  bodySm: 1.6,
  secondary: 1.6,
  secondarySm: 1.6,
  delta: 1.3,
  control: 1.2,
  button: 1.2,
  orbName: 1.3,
  orbStatus: 1.3,
  chipSm: 1.2,
  chip: 1.2,
  chipLg: 1.2,
  chipDelta: 1.2,
  eyebrow: 1.3,
  eyebrowSm: 1.3,
  tag: 1.2,
  tagSm: 1.2,
  tabLabel: 1.2,
  footnote: 1.6,
  footnoteSm: 1.6,
};

/** The roles that title a screen or a sheet. Announced as headings, so a screen reader can move between screens' parts. */
const HEADINGS: ReadonlySet<TypeVariant> = new Set<TypeVariant>(['onboardingTitle', 'titleLg', 'screenTitle', 'sheetTitle']);

export type PriceTone = 'neutral' | 'up' | 'down';

const toneColor: Readonly<Record<PriceTone, string | undefined>> = {
  neutral: undefined,
  up: colors.up,
  down: colors.down,
};

export interface TextProps extends Omit<RNTextProps, 'style'> {
  /** Which role in design.md §2 this string plays. */
  variant?: TypeVariant;
  /** Overrides the variant's default ink. */
  color?: string;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

export const Text = React.forwardRef<RNText, TextProps>(function Text(
  { variant = 'body', color, align, style, accessibilityRole, maxFontSizeMultiplier, ...rest },
  ref,
) {
  return (
    <RNText
      ref={ref}
      accessibilityRole={accessibilityRole ?? (HEADINGS.has(variant) ? 'header' : undefined)}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? FONT_SCALE_CAP[variant]}
      {...rest}
      style={[
        typeScale[variant],
        { color: color ?? variantColor[variant] },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
});

export type ValueProps = TextProps;

/**
 * A number the user reads as a quantity — stepper values, stat tiles, notionals.
 * design.md §5 puts these at 14.5/700; a taller variant can be passed explicitly.
 */
export const Value = React.forwardRef<RNText, ValueProps>(function Value(
  { variant = 'value', style, ...rest },
  ref,
) {
  return <Text ref={ref} variant={variant} {...rest} style={[style, lockTabular]} />;
});

export interface PriceProps extends TextProps {
  /** P&L tone. Green and red mean profit and loss — nothing else ever sets this. */
  tone?: PriceTone;
  /**
   * How this figure hides while balances are hidden (FEATURES.md #47, `mask.ts`). Unsaid, the dollar figures in it are
   * masked; `true` masks all of it, for money written without a dollar sign; `false` masks none of it.
   */
  mask?: boolean;
}

/**
 * The tone a P&L figure takes. Green means profit, red means loss, and **zero is neither**
 * — a flat position rendered in profit-green reads as a win that did not happen, which is
 * the one thing the colour law exists to prevent.
 *
 * Every screen that colours a signed figure goes through here, so "what does zero look
 * like" is answered once instead of per screen.
 */
export function pnlTone(value: number): PriceTone {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'neutral';
}

/** Whether balances are hidden — for a figure drawn outside `Price` that has to hide along with it. */
export function useBalancesHidden(): boolean {
  return useStore((s) => s.balancesHidden);
}

/**
 * A price or a P&L figure. `tone` is the only sanctioned way to colour text green or red.
 *
 * Pass an already-formatted string: state.md requires `toLocaleString('en-US')` with
 * explicit fraction digits, and U+2212 rather than a hyphen for negatives. This component
 * does not format — it would have to guess the fraction digits, and a guess in a price
 * column is worse than no help at all.
 *
 * While balances are hidden its dollar figures are masked, and a screen reader hears "hidden"
 * where they were (FEATURES.md #47). Children with an element among them are drawn as they
 * came: there is no figure in them to read.
 */
export const Price = React.forwardRef<RNText, PriceProps>(function Price(
  { variant = 'rowPrimary', tone = 'neutral', color, style, mask, children, accessibilityLabel, ...rest },
  ref,
) {
  const hidden = useBalancesHidden();
  const mode = maskMode(hidden, variant, mask);
  const text = mode === 'none' ? undefined : figureText(children);
  const shown = text === undefined ? undefined : maskFigure(text, mode);
  /* Only what the mask changed. Anything else is drawn exactly as it was passed. */
  const masked = shown !== text ? shown : undefined;
  return (
    <Text
      ref={ref}
      variant={variant}
      color={color ?? toneColor[tone]}
      accessibilityLabel={accessibilityLabel ?? (masked === undefined ? undefined : spokenFigure(masked))}
      {...rest}
      style={[style, lockTabular]}
    >
      {masked ?? children}
    </Text>
  );
});
