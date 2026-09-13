/**
 * Markets search — PLAN.md 10.4 [G14]. The search circle on screen 24 had no destination.
 * Symbol search across all 5 classes, using the same Row the market list uses.
 *
 * The catalog is searchable the moment the screen opens, and prices fill in class by class as each
 * read answers. This waited on `listClasses`, whose slowest read — the share snapshot — measured eight
 * seconds, and said "Loading markets…" over a list of names it already had.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  AssetMark,
  CloseButton,
  EmptyState,
  Fill,
  Placeholder,
  Press,
  Price,
  Row,
  Screen,
  Text,
  border,
  colors,
  radius,
  size,
  space,
  typeScale,
} from '@/ui';
import { logoProps, useLogos } from '@/data/useLogos';
import { useMarketPrices } from '@/markets/useMarketPrices';

const FIELD_H = 46;
/** With no query, show a sample rather than all 45 — the list is a starting point. */
const PREVIEW = 12;

export default function Search() {
  const router = useRouter();
  const goBack = useGoBack();
  const [q, setQ] = useState('');
  const classes = useMarketPrices();

  const results = useMemo(() => {
    const all = classes.flatMap((c) => c.instruments.map((i) => ({ i, state: c.state })));
    if (!q.trim()) return all.slice(0, PREVIEW);
    const needle = q.trim().toLowerCase();
    return all.filter(
      ({ i }) => i.sym.toLowerCase().includes(needle) || i.name.toLowerCase().includes(needle),
    );
  }, [classes, q]);

  // Real logos for whatever the query matched, same as every other list of instruments.
  const symbols = useMemo(() => results.map(({ i }) => i.sym), [results]);
  const logos = useLogos(symbols);

  // Each read that failed, once: the four classes the feed prices share one.
  const retries = useMemo(
    () => [...new Set(classes.filter((c) => c.state === 'failed').map((c) => c.reload))],
    [classes],
  );

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="screenTitle">Search</Text>
        <CloseButton onPress={() => goBack()} accessibilityLabel="Close search" />
      </View>

      <View
        style={[
          {
            marginTop: space.s18,
            height: FIELD_H,
            borderRadius: radius.panel,
            backgroundColor: colors.inputBg,
            paddingHorizontal: space.s16,
            justifyContent: 'center',
          },
          border.input,
        ]}
      >
        <TextInput
          value={q}
          onChangeText={setQ}
          autoFocus
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="Symbol or name"
          placeholderTextColor={colors.ink35}
          style={[typeScale.body, { color: colors.ink }]}
          accessibilityLabel="Search markets"
        />
      </View>

      {retries.length > 0 ? (
        // A price that did not load is not a dash: the rows it left blank say nothing, and this says why.
        <Press
          onPress={() => retries.forEach((retry) => retry())}
          accessibilityRole="button"
          accessibilityLabel="Load prices again"
          hitHeight={size.hit}
          style={{ marginTop: space.s10 }}
        >
          <Text variant="secondary" color={colors.ink55}>
            Some prices did not load. Try again ›
          </Text>
        </Press>
      ) : null}

      <Fill style={{ marginTop: space.s10 }}>
        {results.length === 0 ? (
          <EmptyState text={`Nothing matches "${q}".`} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {results.map(({ i, state }) => (
              <Row
                key={`${i.classId}-${i.sym}`}
                left={<AssetMark gradient={{ c1: i.c1, c2: i.c2 }} {...logoProps(logos, i.sym)} size={32} />}
                title={i.sym}
                secondary={`${i.name} · ${i.tag}`}
                value={
                  state === 'ready' ? (
                    <Price color={i.feed === 'unavailable' ? colors.ink55 : undefined}>{i.px}</Price>
                  ) : state === 'loading' ? (
                    <Placeholder height={12} width={56} />
                  ) : undefined
                }
                delta={state === 'ready' ? i.chg : undefined}
                deltaTone={i.up ? 'up' : 'down'}
                height={62}
                onPress={() => router.replace(`/asset/${i.sym}`)}
              />
            ))}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
