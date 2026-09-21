/**
 * Pre-IPO: companies that have not listed, as tokens that already trade.
 *
 * Its own screen rather than a sector inside xStocks, because the rules are different in the way
 * that matters. An xStock tracks a listed share, so there is an exchange price to check the pool
 * against and a closing bell that explains when the two drift. A T-Token tracks a private company:
 * there is no exchange, no bell, and the "mark" is a valuation its issuer publishes.
 *
 * So each row carries BOTH numbers and the distance between them, which on the day this shipped ran
 * from 8% to 34%. One number would be choosing which of two true things to tell somebody who is
 * about to spend money, and the choice that flatters the app is the pool price.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  AssetMark,
  EmptyState,
  ErrorState,
  Fill,
  HeaderBar,
  LoadingRows,
  Row,
  Screen,
  Text,
  colors,
  size,
  space,
} from '@/ui';
import { assetGradient } from '@/design/gradients';
import { price as fmtPrice, percent } from '@/format';
import { useAsync } from '@/data/useAsync';
import { prestocks, type PreStockRow } from '@/data/prestocks';

/** What the pool asks, or the plain fact that nothing would route it. */
function PoolPrice({ row }: { row: PreStockRow }) {
  if (row.poolUsd === null) {
    return (
      <Text variant="rowPrimary" color={colors.ink55}>
        No route
      </Text>
    );
  }
  return <Text variant="rowPrimary">{fmtPrice(row.poolUsd)}</Text>;
}

/**
 * The line under the name: the issuer's mark and how far the pool sits from it.
 *
 * Coloured by size rather than by direction. A pool above the mark is not "good" — it is what a
 * buyer pays over the number the issuer publishes, so wide is a warning whichever way it points.
 */
function MarkLine({ row }: { row: PreStockRow }) {
  if (row.markUsd === null) {
    return (
      <Text variant="bodySm" color={colors.ink55}>
        {row.sector} · no mark published right now
      </Text>
    );
  }
  const wide = row.spreadPct !== null && Math.abs(row.spreadPct) >= 10;
  return (
    <Text variant="bodySm" color={colors.ink55}>
      {row.sector} · mark {fmtPrice(row.markUsd)}
      {row.spreadPct === null ? null : (
        <Text variant="bodySm" color={wide ? colors.warn : colors.ink55}>
          {'  '}
          {percent(row.spreadPct, { digits: 1 })} vs pool
        </Text>
      )}
      {row.markStale ? ' · last known' : ''}
    </Text>
  );
}

export default function PreStocks() {
  const goBack = useGoBack();
  const { data, loading, error, reload } = useAsync(() => prestocks.list(), []);
  const rows = data?.rows ?? [];
  const feeBps = rows[0]?.transferFeeBps ?? null;

  return (
    <Screen gutter="none" testID="prestocks">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Pre-IPO</Text>} />
        <Text variant="secondary" color={colors.ink55} style={{ marginTop: space.s8 }}>
          Private companies, tokenised by Tessera and traded on Solana pools.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s12, paddingHorizontal: space.gutter }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingRows count={3} height={size.rowLg} />
        ) : rows.length === 0 ? (
          <EmptyState text="No pre-IPO tokens on this network." />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.s30 }}>
            {rows.map((r, i) => (
              <Row
                key={r.symbol}
                height={size.rowLg}
                divider={i < rows.length - 1}
                left={<AssetMark gradient={assetGradient(r.symbol)} size={size.mark} />}
                title={r.name}
                secondary={<MarkLine row={r} />}
                value={<PoolPrice row={r} />}
                figure="market"
              />
            ))}

            {/*
              * The two sentences somebody needs before they buy one of these.
              *
              * The fee is on the mint, so no route avoids it and it is charged again on the way
              * out. The mark is the issuer's own valuation of a company with no market price —
              * saying "mark" without saying whose would imply an independence it does not have.
              */}
            <Text variant="bodySm" color={colors.ink55} style={{ marginTop: space.s20 }}>
              {feeBps === null
                ? null
                : `Each of these mints charges ${feeBps} bps on every transfer — in and out, so about ${(feeBps * 2) / 100}% over a round trip. It is charged by the token, not by a venue, and no route avoids it.`}
            </Text>
            <Text variant="bodySm" color={colors.ink55} style={{ marginTop: space.s12 }}>
              The mark is Tessera&apos;s own valuation. These companies are private, so there is no exchange price to
              check it against — unlike a tokenised listed share, where the pool can be measured against the real one.
            </Text>
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
