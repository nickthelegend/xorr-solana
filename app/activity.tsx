/**
 * Screen 15 — Activity / audit log. screens.md Group D.
 *
 * Filter pills All / Trades / Risk / Blocked. Rows: an 8pt classification dot (up acted /
 * warn risk / down blocked), action + detail + "{agent} · {time}", the on-chain receipt
 * where there is one, and a right-aligned amount (up for credits, ink55 for debits).
 *
 * "The structured trail is the compliance artifact, so it stays a first-class action" — the
 * exports really export (PLAN.md 12.11); they are not decorative buttons.
 *
 * [G41] The `yield` row was orphaned by the original filter map; state/derived.ts folds it
 * into Trades so every row is reachable from a tab.
 */
import React, { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BackButton,
  Button,
  EmptyState,
  ErrorState,
  Fill,
  LoadingRows,
  Pill,
  PillRow,
  Press,
  Price,
  Screen,
  Text,
  colors,
  divider,
  noteDotColor,
  radius,
  space,
} from '@/ui';
import {
  ACTIVITY_FILTERS,
  activityAmountIsCredit,
  activityDot,
  filterActivity,
} from '@/state/derived';
import { repos } from '@/data';
import { exportRecords } from '@/data/system';
import { useAsync } from '@/data/useAsync';
import { useFreshOnReturn } from '@/data/useFreshOnReturn';
import { deliverFile } from '@/export/deliver';
import { useRefreshControl } from '@/ui/useRefreshControl';
import { useStore } from '@/state/store';
import { useGoBack } from '@/nav/useGoBack';
import { errorText } from '@/data/apiError';

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

export default function Activity() {
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
  const [exporting, setExporting] = useState(false);
  const [exportingTax, setExportingTax] = useState(false);
  /** A failure, or an empty file said as one. Kept apart so "Nothing to export yet." is not reported as a failed export. */
  const [exportNote, setExportNote] = useState<{ text: string; failed: boolean }>();

  const rows = filterActivity(data ?? [], actFilter);

  /**
   * One file out of the app, delivered the way `/export` delivers it: a download in a browser, a share sheet on a phone.
   *
   * This called `Share.share`, which Chrome rejects outright — the exact failure `/export` was fixed for, one screen
   * over. The two now share `deliverFile`, and the same refusal to hand over a file with no records in it.
   *
   * The disposals file is separate from the audit trail because they answer different questions for different
   * readers. Average cost is stated inside the file rather than assumed — a jurisdiction that requires FIFO needs to be
   * told this is not it.
   */
  async function exportFile(which: 'trail' | 'disposals') {
    const setBusy = which === 'trail' ? setExporting : setExportingTax;
    setBusy(true);
    setExportNote(undefined);
    try {
      const csv = which === 'trail' ? await repos.activity.exportTrail('csv') : await repos.activity.exportDisposals();
      if (exportRecords(csv, 'csv') === 0) {
        setExportNote({ text: 'Nothing to export yet.', failed: false });
        return;
      }
      const out = await deliverFile(which === 'trail' ? 'xorr-audit.csv' : 'xorr-disposals.csv', csv);
      // A dismissed share sheet is a change of mind, which `deliverFile` words as "Cancelled." — not a failure to report.
      if (!out.ok && out.reason !== 'Cancelled.') setExportNote({ text: `Export failed: ${out.reason}`, failed: true });
    } catch (e) {
      // On the screen, not in a console nobody reads. An export that silently fails is
      // worse than none: the user walks away believing they have the record.
      setExportNote({ text: `Export failed: ${errorText(e)}`, failed: true });
    } finally {
      setBusy(false);
    }
  }

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
          <Pill key={f} label={f} selected={i === actFilter} onPress={() => setActFilter(i)} />
        ))}
      </PillRow>

      <Fill style={{ marginTop: space.s10 }}>
        {loading && !data ? (
          <LoadingRows count={5} height={72} />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          (data ?? []).length > 0 ? (
            /* The trail has rows, just none of this kind: "Nothing yet." and a push to start buying would deny the rest. */
            <EmptyState text={NONE_UNDER[actFilter] ?? 'Nothing here.'} />
          ) : (
            <EmptyState
              text="Nothing yet."
              actionLabel="Set up a recurring buy"
              onAction={() => router.push('/strategy/dca')}
            />
          )
        ) : (
          <ScrollView refreshControl={refresh} showsVerticalScrollIndicator={false}>
            {rows.map((r) => {
              const credit = activityAmountIsCredit(r.amount);
              return (
                <View
                  key={r.id}
                  style={[
                    { flexDirection: 'row', gap: space.s12, paddingVertical: space.s14 },
                    divider,
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
                    <Text variant="rowPrimary">{r.action}</Text>
                    <Text variant="secondarySm">{r.detail}</Text>
                    <Text variant="footnote" color={colors.ink55}>
                      {r.agent} · {r.t}
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
                    <Price color={credit ? colors.up : colors.ink55} figure="units">
                      {r.amount}
                    </Price>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        )}
      </Fill>

      {exportNote ? (
        <Text
          variant="secondarySm"
          color={exportNote.failed ? colors.down : colors.warn}
          align="center"
          style={{ marginTop: space.s10 }}
        >
          {exportNote.text}
        </Text>
      ) : null}

      {/*
        Two different documents, so two different buttons. The audit trail records what the
        BOT did; the disposals file records what the USER owes. Folding the second into the
        first would produce a file that is the wrong shape for both jobs — an accountant does
        not want blocked runs, and a compliance reviewer does not want cost basis.

        A plain row: `ButtonRow` is the secondary/affirmative pair for a decision, and these
        two are peers rather than a choice between them.
      */}
      <View style={{ flexDirection: 'row', gap: space.s10, marginTop: space.s14 }}>
        <Button
          label="Export audit trail"
          variant="ghost"
          loading={exporting}
          onPress={() => exportFile('trail')}
          style={{ flex: 1 }}
        />
        <Button
          label="Disposals (CSV)"
          variant="ghost"
          loading={exportingTax}
          onPress={() => exportFile('disposals')}
          style={{ flex: 1 }}
        />
      </View>
    </Screen>
  );
}
