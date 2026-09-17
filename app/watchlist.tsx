/**
 * Watchlist — what the bot can follow here, priced. screens.md Group B, screen 5.
 *
 * This listed three groups from the design fixtures — TSLAc, SOL, HYPE / NVDAc, AAPLc, MSTRc / AAVE —
 * as though someone had built them, under the title "Markets", with a header promising five tabs. The
 * executor keeps no saved watchlist. What it does keep is `/market/watchable`: the tokens a strategy can
 * follow on this network. That is the list, split into crypto and shares only when both are there.
 *
 * The prices sat at "· · ·" for as long as the share snapshot took, signed in or out: TSLAc was in the
 * first group and one request priced every row, so SOL waited eight seconds for Tesla. Each row now
 * waits only for its own source (`useSpotPrices`), and a failed read says so.
 *
 * The sparkline is the day's closes from the one request the Markets list already makes. A symbol
 * without a series gets no line rather than someone else's, and never the fixtures' hand-drawn ones.
 */
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import { assetGradient } from '@/design/gradients';
import {
  AssetMark,
  EmptyList,
  ErrorState,
  Eyebrow,
  Fill,
  HeaderBar,
  LoadingRows,
  Pill,
  PillRow,
  Placeholder,
  Price,
  Row,
  Screen,
  Sparkline,
  Text,
  colors,
  percent,
  pnlTone,
  price as fmtPrice,
  space,
} from '@/ui';
import { repos } from '@/data';
import { isStockSymbol } from '@/data/marketData';
import { system } from '@/data/system';
import { useAsync } from '@/data/useAsync';
import { logoProps, useLogos } from '@/data/useLogos';
import { useSpotPrices } from '@/markets/useSpotPrices';
import { useStore } from '@/state/store';

const ROW_H = 64;
const NONE: readonly string[] = [];

/** The watchable tokens as tabs — crypto, then shares — keeping only the tabs with something in them. */
function groupsOf(symbols: readonly string[]): { label: string; symbols: string[] }[] {
  return [
    { label: 'Crypto', symbols: symbols.filter((s) => !isStockSymbol(s)) },
    { label: 'Stocks', symbols: symbols.filter((s) => isStockSymbol(s)) },
  ].filter((g) => g.symbols.length > 0);
}

export default function Watchlist() {
  const router = useRouter();
  const goBack = useGoBack();
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);

  const watchable = useAsync(() => system.watchable(), []);
  const groups = useMemo(() => groupsOf((watchable.data ?? []).map((t) => t.symbol)), [watchable.data]);
  const group = groups[tab] ?? groups[0];
  const symbols = group?.symbols ?? NONE;
  const key = symbols.join(',');

  const prices = useSpotPrices(symbols);
  const logos = useLogos(symbols);
  // A day of closes per row. A decoration: a row without its glyph is still a row.
  const sparks = useAsync(() => repos.markets.sparklines(key ? key.split(',') : []), [key]);

  return (
    <Screen>
      <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Watchlist</Text>} />
      <Text variant="secondary" color={colors.ink55} style={{ marginTop: space.s8 }}>
        What the bot can follow here.
      </Text>

      {groups.length > 1 ? (
        <PillRow style={{ marginTop: space.s16, flexGrow: 0 }}>
          {groups.map((g, i) => (
            <Pill key={g.label} label={g.label} selected={g === group} onPress={() => setTab(i)} />
          ))}
        </PillRow>
      ) : null}

      {group ? (
        <Eyebrow small style={{ marginTop: space.s22 }}>
          {`${symbols.length} ${symbols.length === 1 ? 'market' : 'markets'} · 24h`}
        </Eyebrow>
      ) : null}

      <Fill style={{ marginTop: space.s6 }}>
        {watchable.error ? (
          <ErrorState error={watchable.error} onRetry={watchable.reload} />
        ) : prices.error ? (
          <ErrorState error={prices.error} onRetry={prices.reload} />
        ) : watchable.loading && !watchable.data ? (
          <LoadingRows count={4} height={ROW_H} spark />
        ) : !group ? (
          <EmptyList list="watchlist" />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {symbols.map((sym) => {
              const price = prices.priceOf(sym);
              const q = price.loading ? undefined : price.quote;
              const closes = sparks.data?.[sym] ?? [];
              return (
                <Row
                  key={sym}
                  left={<AssetMark gradient={assetGradient(sym)} {...logoProps(logos, sym)} size={32} />}
                  title={sym}
                  middle={
                    closes.length > 1 ? (
                      <View style={{ marginHorizontal: space.s10 }}>
                        <Sparkline data={closes} />
                      </View>
                    ) : undefined
                  }
                  /*
                    A dash means "nothing prices this". It must not also mean "the price has not
                    arrived yet", so a price still on its way is a placeholder, and quiet.
                  */
                  value={
                    price.loading ? (
                      <Placeholder height={12} width={64} />
                    ) : q ? (
                      fmtPrice(q.price)
                    ) : (
                      <Price variant="rowPrimary" color={colors.ink55} figure="market">
                        —
                      </Price>
                    )
                  }
                  figure="market"
                  delta={q?.change24h !== undefined ? percent(q.change24h, 2) : undefined}
                  deltaTone={q?.change24h !== undefined ? pnlTone(q.change24h) : 'neutral'}
                  height={ROW_H}
                  onPress={() => router.push(`/asset/${sym}`)}
                />
              );
            })}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
