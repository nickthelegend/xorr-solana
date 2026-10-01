/**
 * Markets on a laptop (2026-10-01): the xStocks catalog as a table.
 *
 * The same read and the same rules as the phone's `app/xstocks.tsx` — `system.xstocks()`, the sector filter from
 * `src/markets/catalog`, "No price" as a row and never a placeholder number, an unpriced row that leads nowhere — laid
 * out with the room a desktop has: every number the catalog carries gets its own column, so the pool price and the
 * listed share's price sit side by side and the premium between them is stated rather than left to be worked out.
 *
 * The search box filters the rows already read. It asks nothing of the server.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '@/design/Icon';
import { assetGradient } from '@/design/gradients';
import {
  AssetMark,
  EmptyState,
  ErrorState,
  LoadingRows,
  Pill,
  Text,
  alpha,
  colors,
  pnlTone,
  radius,
  space,
} from '@/ui';
import { compactMoney, percent, price as fmtPrice } from '@/format';
import { useAsync } from '@/data/useAsync';
import { logoProps, useLogos } from '@/data/useLogos';
import { system, type XStockRow } from '@/data/system';
import { ALL_SECTORS, bySector, isTradable, sectorOptions, unpricedNote } from '@/markets/catalog';
import { DesktopPage } from '../DesktopShell';

/** The table's columns, left to right. Numbers are right-aligned so their digits line up down the column. */
const COLS = {
  company: { flex: 2.4 },
  price: { flex: 1, align: 'right' as const },
  change: { flex: 0.9, align: 'right' as const },
  share: { flex: 1, align: 'right' as const },
  premium: { flex: 0.9, align: 'right' as const },
  liquidity: { flex: 1, align: 'right' as const },
  action: { width: 96, align: 'right' as const },
};

const ROW_H = 68;

/** P&L colours for a move; a move of nothing is neither. */
const TONE_INK = { up: colors.up, down: colors.down, neutral: colors.ink55 } as const;

const card = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.hairline,
  borderRadius: radius.panel,
} as const;

/** The pool's premium over the listed share, in percent — null where either side is missing. */
function premiumPct(row: XStockRow): number | null {
  if (row.price === null || row.underlyingPrice === null || row.underlyingPrice <= 0) return null;
  return ((row.price - row.underlyingPrice) / row.underlyingPrice) * 100;
}

/** Client-side search over what the catalog already returned: symbol, company name, sector. */
function matches(row: XStockRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.symbol.toLowerCase().includes(q) || row.name.toLowerCase().includes(q) || row.sector.toLowerCase().includes(q)
  );
}

export function DesktopMarkets() {
  const router = useRouter();
  const { data, loading, error, reload } = useAsync(() => system.xstocks(), []);
  const [sector, setSector] = useState<string>(ALL_SECTORS);
  const [query, setQuery] = useState('');
  /** The top bar's search button lands here with `?focus=search` and the box ready to type in (2026-10-01). */
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const searchRef = useRef<TextInput>(null);
  useEffect(() => {
    if (focus === 'search') searchRef.current?.focus();
  }, [focus]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const sectors = useMemo(() => sectorOptions(data?.sectors ?? []), [data]);
  const shown = useMemo(() => bySector(rows, sector).filter((r) => matches(r, query)), [rows, sector, query]);
  const symbols = useMemo(() => rows.map((r) => r.symbol), [rows]);
  const logos = useLogos(symbols);
  const note = unpricedNote(shown);

  return (
    <DesktopPage>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.s20 }}>
        <View style={{ flex: 1, gap: space.s6 }}>
          <Text variant="titleLg">Markets</Text>
          <Text variant="body" color={colors.ink55}>
            Tokenized US stocks on Solana, backed 1:1
          </Text>
        </View>
        {data ? (
          <Text variant="secondary" color={colors.ink45}>
            {`${rows.length} listed · ${rows.length - data.unpriced} priced`}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s16, flexWrap: 'wrap' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.s10,
            width: 340,
            height: 42,
            paddingHorizontal: space.s14,
            ...card,
            borderRadius: 12,
          }}
        >
          <Icon name="search" size={16} color={colors.ink45} />
          <TextInput
            ref={searchRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Filter by name, symbol or sector"
            placeholderTextColor={colors.ink40}
            autoCorrect={false}
            autoCapitalize="none"
            style={{ flex: 1, color: colors.ink, fontSize: 14, height: 40, outlineStyle: 'none' } as never}
            testID="markets-filter"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear filter" hitSlop={8}>
              <Icon name="close" size={14} color={colors.ink45} />
            </Pressable>
          ) : null}
        </View>
        {sectors.length > 1 ? (
          <View style={{ flexDirection: 'row', gap: space.s8, flexWrap: 'wrap' }}>
            {sectors.map((s) => (
              <Pill key={s} label={s} selected={s === sector} onPress={() => setSector(s)} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ ...card, overflow: 'hidden' }}>
        <HeaderRow />
        {error ? (
          <View style={{ padding: 22 }}>
            <ErrorState error={error} onRetry={reload} />
          </View>
        ) : loading && !data ? (
          <View style={{ padding: 22 }}>
            <LoadingRows count={8} height={ROW_H - 12} />
          </View>
        ) : rows.length === 0 ? (
          <View style={{ padding: 22 }}>
            <EmptyState text="No tokenized shares on this network." />
          </View>
        ) : shown.length === 0 ? (
          <View style={{ padding: 22 }}>
            <EmptyState text={query ? `Nothing matches “${query.trim()}”.` : `Nothing listed under ${sector}.`} />
          </View>
        ) : (
          <>
            {note ? (
              // Said out loud rather than left to be counted, as on the phone.
              <Text variant="secondary" color={colors.warn} style={{ paddingHorizontal: 22, paddingVertical: space.s10 }}>
                {note}
              </Text>
            ) : null}
            {shown.map((r, i) => (
              <MarketRow
                key={r.address}
                row={r}
                logo={logoProps(logos, r.symbol)}
                last={i === shown.length - 1}
                onOpen={() => router.push(`/asset/${r.symbol}`)}
                onTrade={() => router.push(`/xstock/${r.symbol}?side=buy`)}
              />
            ))}
          </>
        )}
      </View>

      <Text variant="secondarySm" color={colors.ink40}>
        Price is what a buy pays in the Solana pools. Share price is the issuer&apos;s mark for the listed share; the
        premium is the distance between them.
      </Text>
    </DesktopPage>
  );
}

function Cell({
  col,
  children,
}: {
  col: { flex?: number; width?: number; align?: 'right' };
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        flex: col.flex,
        width: col.width,
        flexShrink: col.width ? 0 : 1,
        minWidth: 0,
        alignItems: col.align === 'right' ? 'flex-end' : 'flex-start',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}

function HeaderRow() {
  const h = (label: string) => (
    <Text variant="eyebrowSm" color={colors.ink40}>
      {label}
    </Text>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: space.s16,
        paddingHorizontal: 22,
        height: 44,
        borderBottomWidth: 1,
        borderBottomColor: colors.hairline,
      }}
    >
      <Cell col={COLS.company}>{h('Company')}</Cell>
      <Cell col={COLS.price}>{h('Price')}</Cell>
      <Cell col={COLS.change}>{h('24h')}</Cell>
      <Cell col={COLS.share}>{h('Share price')}</Cell>
      <Cell col={COLS.premium}>{h('Pool premium')}</Cell>
      <Cell col={COLS.liquidity}>{h('Liquidity')}</Cell>
      <Cell col={COLS.action}>{null}</Cell>
    </View>
  );
}

function MarketRow({
  row,
  logo,
  last,
  onOpen,
  onTrade,
}: {
  row: XStockRow;
  logo: { uri: string | null; pending: boolean };
  last: boolean;
  onOpen: () => void;
  onTrade: () => void;
}) {
  // An unpriced row is listed but leads nowhere: a ticket on it would have no number to show (catalog.ts).
  const tradable = isTradable(row);
  const prem = premiumPct(row);
  const dim = <Text variant="rowPrimary" color={colors.ink40}>—</Text>;
  return (
    <Pressable
      onPress={tradable ? onOpen : undefined}
      disabled={!tradable}
      accessibilityRole="link"
      accessibilityLabel={`${row.name}, ${row.symbol}`}
      testID={`markets-row-${row.symbol}`}
      style={({ hovered }: { hovered?: boolean }) => ({
        flexDirection: 'row',
        gap: space.s16,
        height: ROW_H,
        paddingHorizontal: 22,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.hairline,
        backgroundColor: hovered && tradable ? alpha('#FFFFFF', 0.035) : 'transparent',
      })}
    >
      <Cell col={COLS.company}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s12, minWidth: 0 }}>
          <AssetMark gradient={assetGradient(row.symbol)} {...logo} size={36} />
          <View style={{ minWidth: 0, flexShrink: 1 }}>
            <Text variant="rowPrimary" numberOfLines={1}>
              {row.name}
            </Text>
            <Text variant="secondary" color={colors.ink45} numberOfLines={1}>
              {`${row.symbol} · ${row.sector}`}
            </Text>
          </View>
        </View>
      </Cell>
      <Cell col={COLS.price}>
        {row.price === null ? (
          <Text variant="rowPrimary" color={colors.ink55}>
            No price
          </Text>
        ) : (
          <Text variant="value" figure="market">
            {fmtPrice(row.price)}
          </Text>
        )}
      </Cell>
      <Cell col={COLS.change}>
        {/* Null is "not reported", zero is "did not move": only the second gets a figure. */}
        {row.price !== null && row.change24hPct !== null ? (
          <Text
            variant="value"
            figure="market"
            color={TONE_INK[pnlTone(row.change24hPct)]}
          >
            {percent(row.change24hPct, { digits: 2 })}
          </Text>
        ) : (
          dim
        )}
      </Cell>
      <Cell col={COLS.share}>
        {row.underlyingPrice !== null ? (
          <Text variant="body" color={colors.ink70} figure="market">
            {fmtPrice(row.underlyingPrice)}
          </Text>
        ) : (
          dim
        )}
      </Cell>
      <Cell col={COLS.premium}>
        {prem !== null ? (
          // Neutral ink: a premium is what a buyer pays over the share, not a gain or a loss.
          <Text variant="body" figure="market" color={colors.ink70}>
            {percent(prem, { digits: 2 })}
          </Text>
        ) : (
          dim
        )}
      </Cell>
      <Cell col={COLS.liquidity}>
        {row.liquidityUsd !== null ? (
          <Text variant="body" color={colors.ink70} figure="market">
            {compactMoney(row.liquidityUsd)}
          </Text>
        ) : (
          dim
        )}
      </Cell>
      <Cell col={COLS.action}>
        {tradable ? <TradeButton onPress={onTrade} symbol={row.symbol} /> : null}
      </Cell>
    </Pressable>
  );
}

function TradeButton({ onPress, symbol }: { onPress: () => void; symbol: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Trade ${symbol}`}
      testID={`markets-trade-${symbol}`}
      style={({ hovered }: { hovered?: boolean }) => ({
        height: 34,
        paddingHorizontal: 18,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: hovered ? colors.ink : colors.control,
      })}
    >
      {({ hovered }: { hovered?: boolean }) => (
        <Text variant="control" color={hovered ? colors.bg : colors.ink}>
          Trade
        </Text>
      )}
    </Pressable>
  );
}
