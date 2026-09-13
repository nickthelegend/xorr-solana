/**
 * Screen 1 — Splash. screens.md Group B.
 *
 * Lives at /welcome, NOT at the group index: both (onboarding) and (tabs) previously
 * declared an index route, so expo-router resolved "/" to whichever it found first and the
 * Home tab rendered the splash. The tabs group owns "/" now.
 *
 * Wordmark 42/800, tagline, a card previewing the wallet, blue CTA + terms line.
 *
 * "The only screen using blue — it's pre-account, before the P&L color law applies." The
 * figures in the preview card are the prototype's own, and they are labelled as a preview
 * rather than dressed up as the user's: there is no account yet to have a balance.
 *
 * [G11] The handoff's three grey placeholder pills are replaced with the three things the
 * bot actually does, which is what a pre-account preview should show.
 */
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { brand } from '@/design/brand';
import { agentGradients } from '@/design/gradients';
import {
  AgentOrb,
  Button,
  Fill,
  Press,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  size,
  space,
  DISPLAY_FONT,
} from '@/ui';

const PREVIEW = ['Recurring buys', 'Stops that hold', 'One-tap stop'] as const;

/**
 * The wordmark is the one place the design uses a DISPLAY face.
 *
 * `ui/mobile-ui/reference` sets `font-family:'Baloo 2'` at weight 800 here and nowhere else.
 * design.md's original "no custom font" note described the body text and missed it, so the
 * wordmark had been rendering in whatever the platform happened to supply.
 */
const WORDMARK = {
  fontFamily: DISPLAY_FONT,
  fontWeight: '800',
  fontSize: 42,
  letterSpacing: 2,
} as const;

export default function Splash() {
  const router = useRouter();
  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: space.s18, gap: space.s10 }}>
        <Text style={WORDMARK}>{brand.WORDMARK}</Text>
        <Text variant="body" color={colors.ink55} align="center">
          {brand.TAGLINE}
        </Text>
      </View>

      <Fill style={{ justifyContent: 'center' }}>
        <SheetCard borderRadius={radius.sheetLg} padding={space.s22}>
          {/*
            No balance here, invented or otherwise.

            This card carried an eyebrow reading "Total value", a hero-sized $63.28 and a red
            −1.4% chip — on the splash, before anyone has signed in or funded anything. It is the
            first screen a person sees and it opened with a portfolio that does not exist, in the
            exact typography the real one uses on the home screen. "Every price on screen is real
            or it is labelled" does not have a marketing exemption, and the app's own route sweep
            asserts this string is gone.

            What the card is actually for is showing what the product does, so it shows it: the
            three things, and the agents that do them. It no longer repeats the tagline printed
            directly above it under a "What it does" eyebrow (2026-09-14, PLAN.md O3).
          */}
          <View
            style={{
              flexDirection: 'row',
              gap: space.s6,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            {PREVIEW.map((p) => (
              <View
                key={p}
                style={{
                  backgroundColor: colors.surfaceAlt,
                  borderRadius: radius.card,
                  paddingHorizontal: space.s12,
                  paddingVertical: space.s6,
                }}
              >
                <Text variant="footnote" color={colors.ink55}>
                  {p}
                </Text>
              </View>
            ))}
          </View>

          <View
            style={{
              flexDirection: 'row',
              gap: space.s18,
              marginTop: space.s26,
              justifyContent: 'center',
            }}
          >
            <AgentOrb gradient={agentGradients['Momentum Scout']} identity="Momentum Scout" size={size.orb56} face specular />
            <AgentOrb gradient={agentGradients['Yield Keeper']} identity="Yield Keeper" size={size.orb56} face specular />
            <AgentOrb gradient={agentGradients['Drawdown Guard']} identity="Drawdown Guard" size={size.orb56} face specular />
          </View>
        </SheetCard>
      </Fill>

      <Button
        label="Get started"
        backgroundColor={colors.preAccount}
        color={colors.ink}
        onPress={() => router.push('/goals')}
      />
      {/*
        The two documents the sentence names, as links. It was plain text, so the first screen asked for agreement to
        documents it gave no way to read. Each link keeps a full-size touch area without growing the line.
      */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginTop: space.s12,
        }}
      >
        <Text variant="footnote" color={colors.ink55}>
          {'By continuing you agree to the '}
        </Text>
        <Press
          onPress={() => router.push('/legal/terms')}
          accessibilityRole="link"
          accessibilityLabel="Read the Terms"
          hitHeight={size.hit}
        >
          <Text variant="footnote" color={colors.ink}>
            Terms
          </Text>
        </Press>
        <Text variant="footnote" color={colors.ink55}>
          {' and '}
        </Text>
        <Press
          onPress={() => router.push('/legal/privacy')}
          accessibilityRole="link"
          accessibilityLabel="Read the Privacy Policy"
          hitHeight={size.hit}
        >
          <Text variant="footnote" color={colors.ink}>
            Privacy Policy
          </Text>
        </Press>
        <Text variant="footnote" color={colors.ink55}>
          .
        </Text>
      </View>
    </Screen>
  );
}
