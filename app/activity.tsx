/**
 * Screen 15 — Activity / audit log. screens.md Group D.
 *
 * Filter pills All / Trades / Risk / Blocked. Rows: an 8pt classification dot (up acted /
 * warn risk / down blocked), action + detail + "{agent} · {time}", the on-chain receipt
 * where there is one, and a right-aligned amount (up for credits, ink55 for debits, plain ink
 * for money moved between your own accounts).
 *
 * "The structured trail is the compliance artifact, so it stays a first-class action" — the
 * exports really export (PLAN.md 12.11); they are not decorative buttons. They sit at the end
 * of the trail, not pinned under it (`ExportSection`).
 *
 * [G41] The `yield` row was orphaned by the original filter map; state/derived.ts folds it
 * into Trades so every row is reachable from a tab.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BackButton,
  EmptyList,
  ErrorState,
  Eyebrow,
  Fill,
  LoadingRows,
  Pill,
  PillRow,
  Press,
  Price,
  Row,
  Screen,
  Text,
  colors,
  divider,
  noteDotColor,
  radius,
  size,
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
import { EXPORTS, EXPORT_ORDER, useActivityExports, type ExportKind } from '@/export/activityExports';
import { useDesktop } from '@/desktop/useDesktop';
import { DesktopActivity } from '@/desktop/pages/DesktopActivity';
import { useRefreshControl } from '@/ui/useRefreshControl';
import { useStore } from '@/state/store';
import { useGoBack } from '@/nav/useGoBack';
import { plainAction, plainDetail } from '@/format/activity';
import { stamp } from '@/format';

const DOT = 8;

/** What an empty filter says while the trail itself has rows, by the index of `ACTIVITY_FILTERS`. */
const NONE_UNDER: Readonly<Record<number, string>> = {
  1: 'No trades yet.',
  2: 'Nothing flagged as risk.',
  3: 'Nothing blocked.',
};

/**
 * "Check it on chain" — when there is a chain to check it on.
 *
 * `explorerTx` returns a real URL on a public network and a `fork:`/`local:` label
 * otherwise. Both are shown; only the first is tappable. Pretending a local transaction has
 * an explorer entry would be the sort of small dishonesty this whole screen exists to make
 * impossible.
 */
function ExplorerLink({ explorer }: { explorer: string }) {
  const isUrl = explorer.startsWith('http');
  if (!isUrl) {
    // The hash alone: which network it is on is not named off the money screens (PLAN.md O3).
    const ref = explorer.split(':')[1];
    return (
      <Text variant="footnote" color={colors.ink55}>
        {`${ref?.slice(0, 10) ?? ''}…`}
      </Text>
    );
  }
  return (
    <Press
      onPress={() => void Linking.openURL(explorer)}
      accessibilityRole="link"
      accessibilityLabel="View this transaction"
      hitHeight={24}
    >
      <Text variant="footnote" color={colors.ink55}>
        View transaction ›
      </Text>
    </Press>
  );
}

/** The desktop web draws the trail as a table at laptop widths (2026-10-01); the phone layout is unchanged. */
export default function Activity() {
  return useDesktop() ? <DesktopActivity /> : <MobileActivity />;
}

function MobileActivity() {
  const goBack = useGoBack();
  const router = useRouter();
  const actFilter = useStore((s) => s.actFilter);
  const setActFilter = useStore((s) => s.setActFilter);
  const trail = useAsync(() => repos.activity.list(), []);
  const { data, loading, error, reload } = trail;
  // The agents go on acting while nobody is looking: read the trail again on return (FEATURES.md #27).
  useFreshOnReturn(trail);
  // Pulling down is the gesture people already try on a list of things that keep changing.
  const refresh = useRefreshControl(reload);
  /** The three files, fetched and delivered by the same code the desktop page uses (`src/export/activityExports.ts`). */
  const { exportingWhich, exportNote, exportFile } = useActivityExports();

  /*
   * The row a notification asked for.
   *
   * A tapped push carries the audit row it recorded (`notifications/routes.ts`), and landing at the
   * top of a hundred rows is not "opening the thing it is about". The list scrolls to it and marks
   * it until the reader takes over.
   */
  const { row: askedFor } = useLocalSearchParams<{ row?: string }>();
  const scroller = useRef<ScrollView>(null);
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  /*
   * Which addressed row the reader has scrolled away from.
   *
   * Set from the scroll gesture — an event, never an effect. The param stays in the URL for as long
   * as the screen is mounted, so without releasing it the list would drag itself back to that row
   * every time the reader scrolled away, which is the behaviour of a screen that will not let go.
   */
  const [released, setReleased] = useState<string>();
  const marked = askedFor && released !== askedFor ? askedFor : undefined;

  /*
   * A filter the addressed row is not under would hide it.
   *
   * A push about a blocked trade opens a list the reader last left on "Trades", while the row it
   * names is filed under "Blocked". Widening to All is the one move that cannot fail to show it.
   *
   * DERIVED rather than written: setting the filter from an effect would cascade a render and,
   * worse, would overwrite a choice the reader made afterwards. As a derivation it applies only
   * while the row is still marked, so the first deliberate tap on a pill takes it back.
   */
  const addressedIsHidden =
    marked !== undefined &&
    data !== undefined &&
    data.some((r) => r.id === marked) &&
    !filterActivity(data, actFilter).some((r) => r.id === marked);
  const showing = addressedIsHidden ? 0 : actFilter;

  const rows = filterActivity(data ?? [], showing);

  // Once the row has a measured offset under the filter now showing, put it on screen. A scroll is
  // a side effect on a ref, not a state write, so it does not cascade.
  useEffect(() => {
    if (!marked) return;
    const y = offsets[marked];
    if (y === undefined) return;
    scroller.current?.scrollTo({ y: Math.max(0, y - space.s12), animated: true });
  }, [marked, offsets]);

  const measure = useCallback(
    (id: string, y: number) => setOffsets((prev) => (prev[id] === y ? prev : { ...prev, [id]: y })),
    [],
  );


  return (
    <Screen>
      {/*
        A pushed screen needs a way back that is visible.

        This had none: the only exit was iOS's edge-swipe, which is undiscoverable and does not
        exist on web at all. Same header as History, which had it right.
      */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <BackButton onPress={() => goBack()} />
        <Text variant="screenTitle">Activity</Text>
      </View>
      <Text variant="secondary" style={{ marginTop: space.s10 }}>
        What agents did, and didn’t.
      </Text>

      <PillRow style={{ marginTop: space.s18, flexGrow: 0 }}>
        {ACTIVITY_FILTERS.map((f, i) => (
          <Pill
            key={f}
            label={f}
            // `showing`, not the stored filter: while a notification's row is being shown the list
            // is widened to All, and a pill claiming otherwise would be describing a different list.
            selected={i === showing}
            onPress={() => {
              if (askedFor) setReleased(askedFor);
              setActFilter(i);
            }}
          />
        ))}
      </PillRow>

      <Fill style={{ marginTop: space.s10 }}>
        {loading && !data ? (
          <LoadingRows count={5} height={72} />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (data ?? []).length === 0 ? (
          <EmptyList list="activity" />
        ) : (
          <ScrollView
            ref={scroller}
            refreshControl={refresh.control}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s20 }}
            // The reader has taken over. The mark has done its job and stops following them.
            onScrollBeginDrag={() => askedFor && setReleased(askedFor)}
          >
            {/* A pull that failed says so, over the rows it could not replace. A success says nothing. */}
            {refresh.notice}
            {rows.length === 0 ? (
              /* The trail has rows, just none of this kind: "Nothing yet." and a push to start buying would deny the rest. */
              <EmptyList list="activity" text={NONE_UNDER[showing] ?? 'Nothing here.'} />
            ) : null}
            {rows.map((r) => {
              /*
                Green for a trade's money only (2026-09-25). Funding an agent's wallet, or taking money back from it,
                moves money between your own accounts: in profit green "$10.00" read as ten dollars made. Those rows are
                drawn in plain ink; a trade keeps the credit/debit colours it always had.
              */
              const amountColor = activityAmountIsTransfer(r.kind)
                ? colors.ink
                : activityAmountIsCredit(r.amount)
                  ? colors.up
                  : colors.ink55;
              return (
                /*
                  Every row opens its own explanation, including the ones with nothing to explain.

                  Tapping only the agent's trades would mean the rows that ANSWER are the rows that
                  respond to touch, so a person learns what the agent did by discovering which rows
                  move. Nothing on this list says which is which, and the honest answer — "no
                  reasoning was stored for this one" — is worth arriving at deliberately rather
                  than by finding a row that does not react.
                */
                <Press
                  key={r.id}
                  onPress={() => router.push(`/explain/${r.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Why: ${plainAction(r.action)}`}
                  // Where this row sits in the list, so a notification naming it can be scrolled to.
                  onLayout={(e) => measure(r.id, e.nativeEvent.layout.y)}
                  style={[
                    { flexDirection: 'row', gap: space.s12, paddingVertical: space.s14 },
                    divider,
                    /*
                      The row the notification was about, said in the one way a list can say it.
                      `surfaceAlt` is the design system's own "this one" — the same ink selection
                      uses — so nothing here is a colour invented for this screen.
                    */
                    r.id === marked
                      ? {
                          backgroundColor: colors.surfaceAlt,
                          borderRadius: radius.card,
                          paddingHorizontal: space.s12,
                        }
                      : null,
                  ]}
                >
                  <View
                    style={{
                      width: DOT,
                      height: DOT,
                      borderRadius: radius.full,
                      marginTop: space.s4,
                      backgroundColor: noteDotColor[activityDot(r.kind)],
                    }}
                  />
                  <View style={{ flex: 1, gap: space.s2 }}>
                    <Text variant="rowPrimary">{plainAction(r.action)}</Text>
                    <Text variant="secondarySm">{plainDetail(r.detail)}</Text>
                    <Text variant="footnote" color={colors.ink55}>
                      {r.agent} · {r.at ? stamp(r.at) : r.t}
                    </Text>
                    {/*
                      The receipt, where there is one. A tappable link on a public chain; a
                      plain label on a fork or a local node, because a link to an explorer
                      that has never seen the transaction reads as the transaction not being
                      real.
                    */}
                    {r.explorer ? <ExplorerLink explorer={r.explorer} /> : null}
                  </View>
                  {r.amount ? (
                    // What moved, in dollars or in a token's units — "$1,234.56 USDC" — hides while balances are hidden.
                    <Price color={amountColor} figure="units">
                      {r.amount}
                    </Price>
                  ) : null}
                </Press>
              );
            })}
            <ExportSection busy={exportingWhich} note={exportNote} onExport={(which) => void exportFile(which)} />
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}

/**
 * The three files, at the end of the trail rather than pinned under it (2026-09-25).
 *
 * Three full-width buttons stood under the list for good and took a quarter of a phone's screen from the one thing this
 * screen is for. They are still three — each file answers a different question for a different reader (see `EXPORTS`)
 * — but as rows after the last event, each saying what is in it, so the feed gets the whole screen and the files are
 * where someone who has read to the end reaches for them. One file at a time: they share one note, said under them.
 */
function ExportSection({
  busy,
  note,
  onExport,
}: {
  busy: ExportKind | undefined;
  note: { text: string; failed: boolean } | undefined;
  onExport: (which: ExportKind) => void;
}) {
  return (
    <View style={{ marginTop: space.s26 }}>
      <Eyebrow>Export</Eyebrow>
      <View style={{ marginTop: space.s4 }}>
        {EXPORT_ORDER.map((kind, i) => (
          <Row
            key={kind}
            title={EXPORTS[kind].label}
            secondary={EXPORTS[kind].what}
            height={size.row}
            divider={i < EXPORT_ORDER.length - 1}
            // While one is on its way the others wait: a second tap would overwrite the first one's note.
            onPress={busy ? undefined : () => onExport(kind)}
            right={
              busy === kind ? (
                <ActivityIndicator size="small" color={colors.ink55} />
              ) : (
                <Text variant="footnote" color={colors.ink55}>
                  CSV ›
                </Text>
              )
            }
          />
        ))}
      </View>
      {note ? (
        <Text
          variant="secondarySm"
          color={note.failed ? colors.down : colors.warn}
          style={{ marginTop: space.s10 }}
        >
          {note.text}
        </Text>
      ) : null}
    </View>
  );
}
