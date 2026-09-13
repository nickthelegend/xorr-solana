/**
 * What runs next, and when.
 *
 * Strategies carry a `nextRunAt` and the app has only ever shown it inside a strategy's own row.
 * The question people actually have is the other way round — "what is about to happen" — and that
 * is a list across every strategy, ordered by time.
 *
 * Overdue is its own state. A strategy whose next run is in the past is either about to fire on the
 * next tick or is not firing at all, and the difference between "in two hours" and "four hours ago"
 * is the difference between waiting and investigating.
 */
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
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
import { useAsync } from '@/data/useAsync';
import { useNow } from '@/state/useNow';
import { repos } from '@/data';
import { kindLabel } from '@/strategies/ladder';

/** Relative time, in the coarsest unit that still says something useful. */
function when(at: number, now: number): { label: string; overdue: boolean } {
  const ms = at - now;
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  if (mins < 60) return { label: `${mins}m`, overdue };
  const hours = Math.round(mins / 60);
  if (hours < 48) return { label: `${hours}h`, overdue };
  return { label: `${Math.round(hours / 24)}d`, overdue };
}

export default function Schedule() {
  const goBack = useGoBack();
  const router = useRouter();
  const now = useNow();
  const { data, loading, error, reload } = useAsync(() => repos.strategies.list(), []);

  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((s) => s.state === 'live' || s.state === 'watch')
        .filter((s) => typeof s.nextRunAt === 'number')
        .sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0)),
    [data],
  );

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">What runs next</Text>} />
      </View>

      <Fill style={{ marginTop: space.s16, paddingHorizontal: space.gutter }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingRows count={5} height={size.rowLg} />
        ) : rows.length === 0 ? (
          <EmptyState text="Nothing is scheduled." />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s30 }}
          >
            {rows.map((s) => {
              const t = when(s.nextRunAt!, now);
              return (
                <Row
                  key={s.id}
                  height={size.rowLg}
                  onPress={() => router.push(`/strategy/${s.id}`)}
                  title={s.label}
                  // The kind as the library names it — "Recurring buy", not `dca`.
                  secondary={`${s.symbol} · ${kindLabel(s.kind)}`}
                  value={
                    <Text variant="rowPrimary" color={t.overdue ? colors.warn : colors.ink}>
                      {/*
                        "Due" rather than a negative duration. A strategy past its time is either
                        about to fire or is stuck, and neither is well described by "−4h".
                      */}
                      {t.overdue ? `Due ${t.label} ago` : `in ${t.label}`}
                    </Text>
                  }
                />
              );
            })}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
