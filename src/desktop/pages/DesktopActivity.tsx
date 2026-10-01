/**
 * Activity, on a laptop (2026-10-01).
 *
 * The phone trail is a feed: one row per event, the agent and the time folded under the action. On a wide screen the
 * same trail is a table — When, Agent, What, Amount, Transaction — so a column can be read down, and the three files
 * sit in the page header rather than at the end of the feed, because on a desktop the header is where a download is
 * looked for.
 *
 * The same filter (the stored one the phone screen uses), the same rows, the same colours for money, and the same
 * export code (`src/export/activityExports.ts`). Every row opens the event's own explanation, as it does on the phone.
 */
import React from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { agentGradient } from '@/design/gradients';
import {
  EmptyList,
  ErrorState,
  Placeholder,
  Price,
  Text,
  alpha,
  colors,
  noteDotColor,
  radius,
  space,
} from '@/ui';
import {
  ACTIVITY_FILTERS,
  activityAmountIsCredit,
  activityAmountIsTransfer,
  activityDot,
  filterActivity,
} from '@/state/derived';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useFreshOnReturn } from '@/data/useFreshOnReturn';
import { useStore } from '@/state/store';
import { plainAction, plainDetail } from '@/format/activity';
import { stamp } from '@/format';
import { EXPORTS, EXPORT_ORDER, useActivityExports } from '@/export/activityExports';
import type { ActivityEvent } from '@/data/types';
import { DesktopPage } from '../DesktopShell';
import { Card } from '../parts/Card';

/** What an empty filter says while the trail itself has rows, by the index of `ACTIVITY_FILTERS`. */
const NONE_UNDER: Readonly<Record<number, string>> = {
  1: 'No trades yet.',
  2: 'Nothing flagged as risk.',
  3: 'Nothing blocked.',
};

const COLS = {
  when: { width: 132 },
  agent: { width: 180 },
  what: { flex: 1 },
  amount: { width: 150, align: 'right' },
  tx: { width: 130, align: 'right' },
} as const;
type Col = { flex?: number; width?: number; align?: 'right' };

export function DesktopActivity() {
  const router = useRouter();
  const actFilter = useStore((s) => s.actFilter);
  const setActFilter = useStore((s) => s.setActFilter);
  const trail = useAsync(() => repos.activity.list(), []);
  const { data, loading, error, reload } = trail;
  // The agents go on acting while nobody is looking: read the trail again on return (FEATURES.md #27).
  useFreshOnReturn(trail);
  const { exportingWhich, exportNote, exportFile } = useActivityExports();

  /*
   * The row a notification asked for, marked; and, as on the phone, a filter it is not under widens to All while it is
   * marked — derived, so the first deliberate click on a tab takes the choice back.
   */
  const { row: askedFor } = useLocalSearchParams<{ row?: string }>();
  const [released, setReleased] = React.useState<string>();
  const marked = askedFor && released !== askedFor ? askedFor : undefined;
  const addressedIsHidden =
    marked !== undefined &&
    data !== undefined &&
    data.some((r) => r.id === marked) &&
    !filterActivity(data, actFilter).some((r) => r.id === marked);
  const showing = addressedIsHidden ? 0 : actFilter;
  const rows = filterActivity(data ?? [], showing);

  return (
    <DesktopPage>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.s20 }}>
        <View style={{ flex: 1, gap: space.s6 }}>
          <Text variant="titleLg">Activity</Text>
          <Text variant="body" color={colors.ink55}>
            What agents did, and didn’t
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: space.s10 }}>
          {EXPORT_ORDER.map((kind) => (
            <ExportButton
              key={kind}
              label={EXPORTS[kind].label}
              what={EXPORTS[kind].what}
              busy={exportingWhich === kind}
              // While one is on its way the others wait: a second click would overwrite the first one's note.
              disabled={exportingWhich !== undefined}
              onPress={() => void exportFile(kind)}
            />
          ))}
        </View>
      </View>
      {exportNote ? (
        <Text variant="secondary" color={exportNote.failed ? colors.down : colors.warn} align="right">
          {exportNote.text}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.s8 }}>
        {ACTIVITY_FILTERS.map((f, i) => (
          <Tab
            key={f}
            label={f}
            count={data ? filterActivity(data, i).length : undefined}
            selected={i === showing}
            onPress={() => {
              if (askedFor) setReleased(askedFor);
              setActFilter(i);
            }}
          />
        ))}
      </View>

      <Card style={{ paddingHorizontal: 0, paddingVertical: 0, overflow: 'hidden' }}>
        <HeaderRow />
        {loading && !data ? (
          <View style={{ padding: 22, gap: space.s10 }}>
            {Array.from({ length: 6 }, (_, i) => (
              <Placeholder key={i} height={44} />
            ))}
          </View>
        ) : error ? (
          <View style={{ padding: 22 }}>
            <ErrorState error={error} onRetry={reload} />
          </View>
        ) : (data ?? []).length === 0 ? (
          <View style={{ padding: 22 }}>
            <EmptyList list="activity" />
          </View>
        ) : rows.length === 0 ? (
          <View style={{ padding: 22 }}>
            {/* The trail has rows, just none of this kind. */}
            <EmptyList list="activity" text={NONE_UNDER[showing] ?? 'Nothing here.'} />
          </View>
        ) : (
          rows.map((r, i) => (
            <EventRow
              key={r.id}
              event={r}
              marked={r.id === marked}
              last={i === rows.length - 1}
              onPress={() => router.push(`/explain/${r.id}`)}
            />
          ))
        )}
      </Card>
    </DesktopPage>
  );
}

function Tab({ label, count, selected, onPress }: { label: string; count?: number; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ hovered }: { hovered?: boolean }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s8,
        height: 36,
        paddingHorizontal: space.s16,
        borderRadius: 18,
        // Selection is white-on-dark, never a P&L colour.
        backgroundColor: selected ? colors.ink : hovered ? colors.control : colors.surface,
        borderWidth: selected ? 0 : 1,
        borderColor: colors.cardBorder,
      })}
    >
      <Text variant="control" color={selected ? colors.bg : colors.ink70}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text variant="secondarySm" color={selected ? alpha('#000000', 0.55) : colors.ink40}>
          {String(count)}
        </Text>
      ) : null}
    </Pressable>
  );
}

function ExportButton({
  label,
  what,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  what: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Export ${label} as CSV. ${what}`}
      accessibilityState={{ busy, disabled }}
      style={({ hovered }: { hovered?: boolean }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s8,
        height: 40,
        paddingHorizontal: space.s16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        backgroundColor: hovered && !disabled ? colors.control : colors.surface,
        opacity: disabled && !busy ? 0.5 : 1,
      })}
    >
      {busy ? <ActivityIndicator size="small" color={colors.ink55} /> : null}
      <Text variant="control" color={colors.ink70}>
        {`${label} CSV`}
      </Text>
    </Pressable>
  );
}

function Cell({ col, children }: { col: Col; children: React.ReactNode }) {
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
      <Cell col={COLS.when}>{h('When')}</Cell>
      <Cell col={COLS.agent}>{h('Agent')}</Cell>
      <Cell col={COLS.what}>{h('What')}</Cell>
      <Cell col={COLS.amount}>{h('Amount')}</Cell>
      <Cell col={COLS.tx}>{h('Transaction')}</Cell>
    </View>
  );
}

function EventRow({ event: r, marked, last, onPress }: { event: ActivityEvent; marked: boolean; last: boolean; onPress: () => void }) {
  /*
    Green for a trade's money only (2026-09-25). Funding an agent's wallet, or taking money back from it, moves money
    between your own accounts: those amounts are plain ink. A trade keeps the credit/debit colours it always had.
  */
  const amountColor = activityAmountIsTransfer(r.kind)
    ? colors.ink
    : activityAmountIsCredit(r.amount)
      ? colors.up
      : colors.ink55;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Why: ${plainAction(r.action)}`}
      testID={`activity-row-${r.id}`}
      style={({ hovered }: { hovered?: boolean }) => ({
        flexDirection: 'row',
        gap: space.s16,
        minHeight: 64,
        paddingVertical: space.s12,
        paddingHorizontal: 22,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.hairline,
        // The row a notification was about takes the design system's own "this one"; hover a lighter wash of it.
        backgroundColor: marked ? colors.surfaceAlt : hovered ? alpha('#FFFFFF', 0.035) : 'transparent',
      })}
    >
      <Cell col={COLS.when}>
        <Text variant="secondary" color={colors.ink55} numberOfLines={1}>
          {r.at ? stamp(r.at) : r.t}
        </Text>
      </Cell>
      <Cell col={COLS.agent}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8, minWidth: 0 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: agentGradient(r.agent).c1 }} />
          <Text variant="rowPrimary" color={colors.ink70} numberOfLines={1} style={{ flexShrink: 1 }}>
            {r.agent}
          </Text>
        </View>
      </Cell>
      <Cell col={COLS.what}>
        <View style={{ flexDirection: 'row', gap: space.s10, minWidth: 0, alignSelf: 'stretch' }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: radius.full,
              marginTop: 6,
              backgroundColor: noteDotColor[activityDot(r.kind)],
            }}
          />
          <View style={{ flex: 1, minWidth: 0, gap: space.s2 }}>
            <Text variant="rowPrimary">{plainAction(r.action)}</Text>
            {r.detail ? (
              <Text variant="secondarySm" color={colors.ink55} numberOfLines={2}>
                {plainDetail(r.detail)}
              </Text>
            ) : null}
          </View>
        </View>
      </Cell>
      <Cell col={COLS.amount}>
        {r.amount ? (
          // What moved, in dollars or in a token's units — hides while balances are hidden.
          <Price color={amountColor} figure="units" numberOfLines={1}>
            {r.amount}
          </Price>
        ) : (
          <Text variant="body" color={colors.ink28}>
            —
          </Text>
        )}
      </Cell>
      <Cell col={COLS.tx}>
        <TxLink event={r} />
      </Cell>
    </Pressable>
  );
}

/**
 * The receipt, where there is one: a link on a public chain, the bare hash on a fork or a local node — a link to an
 * explorer that has never seen the transaction reads as the transaction not being real.
 */
function TxLink({ event }: { event: ActivityEvent }) {
  const explorer = event.explorer;
  if (!explorer) {
    return (
      <Text variant="body" color={colors.ink28}>
        —
      </Text>
    );
  }
  const ref = event.signature ?? (explorer.startsWith('http') ? explorer.split('/').pop()?.split('?')[0] : explorer.split(':')[1]);
  const short = ref ? `${ref.slice(0, 4)}…${ref.slice(-4)}` : 'View';
  if (!explorer.startsWith('http')) {
    return (
      <Text variant="secondary" color={colors.ink45}>
        {short}
      </Text>
    );
  }
  return (
    <Pressable
      onPress={() => void Linking.openURL(explorer)}
      accessibilityRole="link"
      accessibilityLabel="View this transaction"
    >
      {({ hovered }: { hovered?: boolean }) => (
        <Text variant="secondary" color={hovered ? colors.ink : colors.ink55} style={hovered ? { textDecorationLine: 'underline' } : null}>
          {`${short} ›`}
        </Text>
      )}
    </Pressable>
  );
}
