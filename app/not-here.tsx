/**
 * A screen this build does not have (2026-09-19).
 *
 * The Solana build hides the Base-only screens (`src/nav/solanaRoutes.ts`); a link or bookmark that still reaches one
 * lands here, and says what is true — this exists on the Base build and not on this network — rather than drawing a
 * screen that reads the wrong chain.
 */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Fill, HeaderBar, Screen, Text, colors, space } from '@/ui';

export default function NotHere() {
  return (
    <Screen>
      <HeaderBar
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        title={<Text variant="screenTitle">Not on Solana</Text>}
      />
      <Fill style={{ justifyContent: 'center', gap: space.s12 }}>
        <Text variant="onboardingTitle" align="center">
          Not on this network
        </Text>
        <Text variant="body" color={colors.ink55} align="center">
          That screen belongs to the Base build of xorr. On Solana, xorr trades xStocks through Jupiter.
        </Text>
        <View style={{ marginTop: space.s16, gap: space.s10 }}>
          <Button label="Trade xStocks" onPress={() => router.replace('/xstocks')} testID="nothere-xstocks" />
          <Button label="Go to your wallet" variant="ghost" onPress={() => router.replace('/')} testID="nothere-home" />
        </View>
      </Fill>
    </Screen>
  );
}
