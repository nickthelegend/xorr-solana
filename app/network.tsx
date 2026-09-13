/**
 * Which chain this build is actually pointed at.
 *
 * More useful than it sounds, because this app runs against three: Base mainnet, Base Sepolia, and
 * a mainnet fork. They look identical from every other screen and behave completely differently —
 * 1inch cannot settle on Sepolia, the tokenized equities do not function on the fork, and a block
 * explorer link means nothing on either. Someone reading a price should be able to find out which
 * of those they are looking at without reading the source.
 *
 * The block height comes from the RPC dependency's own detail string in `/health`, which is where
 * the executor already reports it. Parsing it here rather than adding a route keeps one source of
 * truth for "what block are we on".
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  ErrorState,
  Fill,
  HeaderBar,
  Placeholder,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  space,
} from '@/ui';
import { shortAddress } from '@/format';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';

/**
 * What each chain key means for what the app can actually do, in one line each.
 *
 * Sepolia cannot fill a swap because no aggregator is deployed there; a fork fills against copied liquidity that no
 * public explorer has seen. The reasons live here, not on the screen.
 */
const CHAIN_NOTE: Record<string, string> = {
  base: 'Base mainnet. Real money, real fills.',
  'base-sepolia': 'A test network. Transactions settle; swaps cannot fill.',
  'base-fork': 'A fork of Base. Fills are real here and nowhere else.',
  localnet: 'A local chain. Nothing leaves this machine.',
};

export default function Network() {
  const goBack = useGoBack();
  const router = useRouter();
  const { data, loading, error, reload } = useAsync(() => system.health(), []);

  const rpc = data?.dependencies.find((d) => d.name === 'rpc');
  const gas = data?.dependencies.find((d) => d.name === 'gas');
  const block = /block (\d+)/.exec(rpc?.detail ?? '')?.[1];

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Network</Text>} />
      </View>

      <Fill style={{ marginTop: space.s16 }}>
        {error ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <ErrorState error={error} onRetry={reload} />
          </View>
        ) : loading && !data ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <Placeholder height={150} />
          </View>
        ) : !data ? null : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: space.gutter,
              paddingBottom: space.s30,
              gap: space.s10,
            }}
          >
            <SheetCard bordered borderRadius={radius.panel} padding={space.s18}>
              <Text variant="footnote" color={colors.ink55}>
                CHAIN
              </Text>
              <Text variant="screenTitle" style={{ marginTop: space.s6 }}>
                {data.chain}
              </Text>
              <Text variant="secondary" color={colors.ink65} style={{ marginTop: space.s10 }}>
                {/*
                  The consequence, not just the name. "base-fork" tells a reader nothing about why
                  their explorer link is missing.
                */}
                {CHAIN_NOTE[data.chain] ?? 'An unrecognised chain key. Treat everything here with suspicion.'}
              </Text>
            </SheetCard>

            {block ? (
              <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
                <Text variant="footnote" color={colors.ink55}>
                  BLOCK
                </Text>
                <Text variant="rowPrimary" style={{ marginTop: space.s4 }}>
                  {Number(block).toLocaleString('en-US')}
                </Text>
                {rpc?.ms === undefined ? null : (
                  <Text variant="footnote" color={colors.ink55} style={{ marginTop: space.s4 }}>
                    RPC answered in {rpc.ms}ms
                  </Text>
                )}
              </SheetCard>
            ) : null}

            <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
              <Text variant="footnote" color={colors.ink55}>
                DELEGATION CONTRACT
              </Text>
              <Text variant="rowPrimary" style={{ marginTop: space.s4 }}>
                {shortAddress(data.delegation)}
              </Text>
              <Text variant="footnoteSm" color={colors.ink55} style={{ marginTop: space.s4 }}>
                {data.delegation}
              </Text>
            </SheetCard>

            {gas ? (
              <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
                <Text variant="footnote" color={colors.ink55}>
                  GAS WALLET
                </Text>
                <Text variant="secondary" color={colors.ink65} style={{ marginTop: space.s6 }}>
                  {/*
                    Worth its own card: the bot pays its own gas and never touches the user's ETH,
                    which is a claim `/verify` checks and this is where the balance behind it lives.
                  */}
                  {gas.detail ?? '—'}
                </Text>
              </SheetCard>
            ) : null}

            <Button label="Everything the system needs" variant="ghost" onPress={() => router.push('/system')} />
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
