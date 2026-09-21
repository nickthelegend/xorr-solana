/**
 * Where every number on screen comes from.
 *
 * The product's claim is that it does not invent figures. That claim is only checkable if someone
 * can find out which upstream produced which number — and until now that lived in code comments.
 *
 * Each row names a real dependency and what it is authoritative for, and the live ones are probed
 * rather than asserted: the chain row reads the executor's RPC probe, the database row its Postgres
 * probe, the subgraph row reads `_meta`. A page that listed its sources without checking any of them
 * would be making the same unfalsifiable claim it exists to replace.
 *
 * Our own database is one of them, and says so. The header read "None of them are us" and the chain
 * card "Nothing about your money is taken from our database" — while positions, their cost basis,
 * realised profit, runs, alerts and the stock readings are the executor's own records, and the
 * futures figures came from a venue the list never named. A sources page that hides one of its
 * sources is the thing it was written against.
 *
 * Deliberately not exhaustive about libraries. This is about where DATA comes from, not what the
 * app is built with.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  Fill,
  HeaderBar,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  space,
} from '@/ui';
import { NotSignedIn } from '@/data/apiError';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';
import { isSolana } from '@/chain';

type Source = {
  name: string;
  /** What it is the authority for. */
  owns: string;
  /** How the app reaches it. */
  how: string;
};

/** Base's sources: the aggregator, the perps feed, the lending pool and the subgraph over the delegation contract. */
const BASE_SOURCES: Source[] = [
  {
    name: '1inch',
    owns: 'Swap routes, fill prices, stock prices, limit orders and cross-chain quotes',
    how: 'Routes from its aggregator; the stocks are priced by quoting a real buy, because they have no feed.',
  },
  {
    name: 'Hyperliquid',
    owns: 'Futures prices, funding rates, open interest and volume',
    how: 'Its public market data. xorr does not trade futures.',
  },
  {
    name: 'Aave v3',
    owns: 'The rate idle cash earns',
    how: '`currentLiquidityRate`, read from the lending pool. It floats; it is not a promise.',
  },
  {
    name: 'The Graph',
    owns: 'Spend history, independently of our records',
    how: 'A subgraph over the delegation contract — a second account of the same money, kept by someone else.',
  },
];

/**
 * Solana's own (2026-09-20). This screen listed Base's four on the Solana build — an aggregator, a perps feed, a
 * lending pool and a subgraph none of which this executor calls — while naming neither Jupiter, which prices and fills
 * every trade here, nor the issuer's proof of reserves behind each xStock. A screen whose whole purpose is saying
 * where a number came from must not name the wrong source.
 */
const SOLANA_SOURCES: Source[] = [
  {
    name: 'Jupiter',
    owns: 'Swap routes, fill prices and every xStock price',
    how: 'Its quote and swap API. An xStock has no market-data feed, so its price is a real route for a real size.',
  },
  {
    name: 'Backed',
    owns: 'What backs each xStock, and the issuer controls on it',
    how: 'The issuer’s proof-of-reserves feed, carried with its age; the token’s own controls are read from the chain.',
  },
  {
    name: 'Pyth',
    owns: 'The independent price of the share behind each xStock',
    how: 'Its Equity.US feed, read from the price account on Solana mainnet. The agent measures the pool against it before entering, and holds when the two have come apart.',
  },
  {
    name: 'Tessera',
    owns: 'The issuer’s valuation of each pre-IPO company',
    how: 'Its public token endpoint. A private company has no exchange price, so this mark is the only independent number these tokens have — and the pool can sit a long way from it.',
  },
];

const SOURCES: Source[] = [
  {
    name: 'The chain',
    owns: 'Balances, the permission, approvals, names and every transaction',
    how: 'Read directly over RPC.',
  },
  {
    name: 'xorr',
    owns: 'Positions and their cost, realised profit, runs, alerts, stock readings and the audit trail',
    how: 'The executor’s own database. The audit trail in it is hash-chained and anchored on the chain.',
  },
  ...(isSolana ? SOLANA_SOURCES : BASE_SOURCES),
  {
    name: 'CoinGecko',
    owns: 'Crypto prices and charts',
    how: 'One batched request per refresh, cached — the public tier rate-limits hard.',
  },
  {
    name: 'EDGAR',
    owns: 'Earnings dates for the tokenized equities',
    how: "The regulator's own filing record. The next date is a projection from the cadence, and says so.",
  },
  {
    name: 'Privy',
    owns: 'Keys, signing, and the policy that refuses a bad destination',
    how: 'Enforced by their signer. A compromised executor cannot widen it.',
  },
];

export default function Sources() {
  const goBack = useGoBack();
  const router = useRouter();
  /* Probed, not asserted. A list of sources that checked none of them would be the same
     unfalsifiable claim this screen exists to replace. */
  const health = useAsync(() => system.health(), []);
  const graph = useAsync(() => system.graphHealth(), []);

  /* Undefined until `/health` answers: a probe nobody has read is not a dependency that is down. */
  const up = (name: string): boolean | undefined =>
    health.data ? health.data.dependencies.find((d) => d.name === name)?.status === 'up' : undefined;

  /*
   * The index needs a session to ask about. Signed out it was never asked, which is no label at all —
   * not "not answering", which is what a request that failed earns.
   */
  const graphLive: boolean | undefined = graph.error
    ? graph.error instanceof NotSignedIn
      ? undefined
      : false
    : graph.data?.healthy;

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Sources</Text>} />
        <Text variant="secondary" color={colors.ink55} style={{ marginTop: space.s8 }}>
          Where every number comes from.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s16, paddingHorizontal: space.gutter }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.s30, gap: space.s10 }}
        >
          {SOURCES.map((s) => {
            /* Only the ones the app can actually probe get a live state. Claiming to know
               CoinGecko is up because a price rendered ten minutes ago would be a guess. The
               executor not answering `/health` at all is its database not answering us.

               Pyth and Tessera joined that list once `/health` began probing them (2026-09-22):
               the oracle the agent refuses trades on was the one dependency this screen could not
               tell you about, on the screen built to tell you where numbers come from. */
            const live =
              s.name === 'The chain'
                ? up('rpc')
                : s.name === 'xorr'
                  ? health.error
                    ? false
                    : up('postgres')
                  : s.name === 'The Graph'
                    ? graphLive
                    : s.name === 'Pyth'
                      ? up('pyth')
                      : s.name === 'Tessera'
                        ? up('tessera')
                        : undefined;

            return (
              <SheetCard key={s.name} bordered borderRadius={radius.panel} padding={space.s16}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <Text variant="rowPrimary">{s.name}</Text>
                  {live === undefined ? null : (
                    <Text variant="footnote" color={live ? colors.up : colors.down}>
                      {live ? 'reachable' : 'not answering'}
                    </Text>
                  )}
                </View>
                <Text variant="secondary" color={colors.ink65} style={{ marginTop: space.s8 }}>
                  {s.owns}
                </Text>
                <Text variant="footnote" color={colors.ink55} style={{ marginTop: space.s8 }}>
                  {s.how}
                </Text>
              </SheetCard>
            );
          })}

          <Button
            label="Check every claim"
            variant="ghost"
            style={{ marginTop: space.s6 }}
            onPress={() => router.push('/verify')}
          />
        </ScrollView>
      </Fill>
    </Screen>
  );
}
