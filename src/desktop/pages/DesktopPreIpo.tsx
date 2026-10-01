/**
 * Pre-IPO on a laptop (2026-10-01): the Tessera companies as three cards side by side.
 *
 * The same read and the same honesty as the phone's `app/pre-ipo.tsx` — `preIpo.list()`, the pool price AND the
 * issuer's mark on every company with the distance between them, "No route" where nothing would route a buy — with
 * the room to put every figure the read carries on the card: valuation and holders too. The two notes a buyer needs
 * (the mint's transfer fee, and whose valuation the mark is) sit under the cards, word for word as on the phone.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { assetGradient } from '@/design/gradients';
import { AssetMark, EmptyState, ErrorState, Placeholder, Text, alpha, colors, radius, space } from '@/ui';
import { compactMoney, percent, price as fmtPrice } from '@/format';
import { useAsync } from '@/data/useAsync';
import { preIpo, type PreIpoRow } from '@/data/preIpo';
import { DesktopPage } from '../DesktopShell';

const card = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.hairline,
  borderRadius: radius.panel,
  padding: 22,
} as const;

/** A pool this far from the mark, either way, is flagged — the phone's `MarkLine` uses the same line. */
const WIDE_PCT = 10;

export function DesktopPreIpo() {
  const router = useRouter();
  const { data, loading, error, reload } = useAsync(() => preIpo.list(), []);
  const rows = data?.rows ?? [];
  const feeBps = rows[0]?.transferFeeBps ?? null;

  return (
    <DesktopPage>
      <View style={{ gap: space.s6 }}>
        <Text variant="titleLg">Pre-IPO</Text>
        <Text variant="body" color={colors.ink55}>
          Private companies, tokenised by Tessera and traded on Solana pools.
        </Text>
      </View>

      {error ? (
        <View style={card}>
          <ErrorState error={error} onRetry={reload} />
        </View>
      ) : loading && !data ? (
        <View style={{ flexDirection: 'row', gap: 20 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flex: 1 }}>
              <Placeholder height={380} style={{ borderRadius: radius.panel }} />
            </View>
          ))}
        </View>
      ) : rows.length === 0 ? (
        <View style={card}>
          <EmptyState text="No pre-IPO tokens on this network." />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 20, alignItems: 'stretch' }}>
          {rows.map((r) => (
            <CompanyCard key={r.symbol} row={r} onPress={() => router.push(`/asset/${r.symbol}`)} />
          ))}
        </View>
      )}

      {rows.length > 0 ? (
        <View style={{ ...card, gap: space.s12 }}>
          <Text variant="cardTitle">Before you buy</Text>
          {/*
            The two sentences somebody needs before they buy one of these (as on the phone). The fee is on the mint, so
            no route avoids it and it is charged again on the way out. The mark is the issuer's own valuation.
          */}
          {feeBps === null ? null : (
            <Text variant="bodySm" color={colors.ink55}>
              {`Each of these mints charges ${feeBps} bps on every transfer — in and out, so about ${(feeBps * 2) / 100}% over a round trip. It is charged by the token, not by a venue, and no route avoids it.`}
            </Text>
          )}
          <Text variant="bodySm" color={colors.ink55}>
            The mark is Tessera&apos;s own valuation. These companies are private, so there is no exchange price to check
            it against — unlike a tokenised listed share, where the pool can be measured against the real one.
          </Text>
          {data?.note ? (
            <Text variant="secondary" color={colors.ink40}>
              {data.note}
            </Text>
          ) : null}
        </View>
      ) : null}
    </DesktopPage>
  );
}

function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.s12 }}>
      <Text variant="secondary" color={colors.ink45}>
        {label}
      </Text>
      <Text variant="rowPrimary" color={color ?? colors.ink} figure="market" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function CompanyCard({ row, onPress }: { row: PreIpoRow; onPress: () => void }) {
  const wide = row.spreadPct !== null && Math.abs(row.spreadPct) >= WIDE_PCT;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${row.name}, ${row.symbol}`}
      testID={`pre-ipo-${row.symbol}`}
      style={({ hovered }: { hovered?: boolean }) => ({
        ...card,
        flex: 1,
        minWidth: 0,
        gap: space.s20,
        borderColor: hovered ? colors.ghostBorder : colors.hairline,
        backgroundColor: hovered ? alpha('#FFFFFF', 0.03) : colors.surface,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s14 }}>
        <AssetMark gradient={assetGradient(row.symbol)} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="sheetTitle" numberOfLines={1}>
            {row.name}
          </Text>
          <Text variant="secondary" color={colors.ink45} numberOfLines={1}>
            {`${row.symbol} · ${row.sector}`}
          </Text>
        </View>
      </View>

      <View style={{ gap: space.s4 }}>
        <Text variant="eyebrowSm" color={colors.ink40}>
          Pool price
        </Text>
        {row.poolUsd === null ? (
          <Text variant="amountMd" color={colors.ink55}>
            No route
          </Text>
        ) : (
          <Text variant="amountLg" figure="market">
            {fmtPrice(row.poolUsd)}
          </Text>
        )}
      </View>

      <View style={{ gap: space.s10, paddingTop: space.s16, borderTopWidth: 1, borderTopColor: colors.hairline }}>
        <Fact
          label={row.markStale ? 'Tessera mark · last known' : 'Tessera mark'}
          value={row.markUsd === null ? 'Not published' : fmtPrice(row.markUsd)}
          color={row.markUsd === null ? colors.ink55 : undefined}
        />
        {/* Coloured by size, not direction: a pool above the mark is what a buyer pays over it. */}
        <Fact
          label="Pool vs mark"
          value={row.spreadPct === null ? '—' : percent(row.spreadPct, { digits: 1 })}
          color={row.spreadPct === null ? colors.ink55 : wide ? colors.warn : undefined}
        />
        <Fact label="Valuation" value={row.valuationUsd === null ? '—' : compactMoney(row.valuationUsd)} />
        <Fact label="Holders" value={row.holders === null ? '—' : row.holders.toLocaleString('en-US')} />
      </View>

      <View style={{ flex: 1 }} />
      <View
        style={{
          height: 42,
          borderRadius: radius.full,
          backgroundColor: colors.control,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="control">{`View ${row.symbol}`}</Text>
      </View>
    </Pressable>
  );
}
