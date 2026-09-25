/**
 * What both halves of `CoinHero` share: where the subject sits, and the fades that sink the art into the screen.
 *
 * A file of its own, with no `.web` variant, because on the web `./CoinHero` resolves to `CoinHero.web.tsx` itself: the
 * web half importing these from there imported itself, and the welcome screen died with "Maximum call stack size
 * exceeded" while TypeScript, which resolves the plain file, saw nothing wrong.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, colors } from '@/ui';

/**
 * Where the subject sits in the frame, so a portrait crop keeps it: the janitor on the closed trading floor, a little
 * right of centre (2026-09-25). It was 30% for the coin render the night-shift film replaced, which on a phone would
 * crop him out and keep an empty row of desks.
 */
export const COIN_FOCUS = { left: '53%', top: '45%' } as const;

/** Black in from the top for the wordmark, and down into the screen at the bottom for the headline. */
export function HeroFades() {
  return (
    <>
      <LinearGradient
        colors={[colors.bg, alpha(colors.bg, 0)]}
        locations={[0, 0.24]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[alpha(colors.bg, 0), colors.bg]}
        locations={[0.52, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </>
  );
}
