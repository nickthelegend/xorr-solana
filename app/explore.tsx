/**
 * The index for everything the app can show you about itself.
 *
 * A screen nobody can reach is worse than no screen, and thirty-odd new surfaces cannot each earn a
 * row in Settings. So they get one door, grouped by the question they answer rather than by the
 * subsystem they read from — "is any of this real" and "where did my money go" are how someone
 * thinks about it, and `/graph/health` versus `/pnl/realised` is not.
 *
 * Deliberately not a search field. Thirty items is a list you scan, and a search box on a list you
 * can see in full is a control that adds a step to every use.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import { Eyebrow, Fill, HeaderBar, Press, Screen, Text, colors, divider, size, space } from '@/ui';
import { Icon } from '@/design/Icon';

type Item = { route: string; title: string; detail: string };
type Group = { title: string; blurb: string; items: Item[] };

/**
 * Grouped by the question, not the subsystem.
 *
 * Each `detail` says what the screen actually shows rather than restating its title. A row reading
 * "Approvals · your approvals" is a row nobody needed.
 */
const GROUPS: Group[] = [
  {
    title: 'Proof',
    blurb: 'Everything this product claims, and how to check it.',
    items: [
      { route: '/verify', title: 'Verification', detail: 'Twenty claims, run live, each with its evidence' },
      { route: '/audit/chain', title: 'The trail', detail: 'Whether the hash chain still holds' },
      { route: '/approvals', title: 'Approvals', detail: 'What the contract may pull, per token, from the chain' },
      { route: '/policy', title: 'Wallet policy', detail: 'What Privy refuses, independently of us' },
      { route: '/delegation', title: 'Permission', detail: 'The grant itself: key, venues, cap, expiry' },
      { route: '/venues', title: 'Venues', detail: 'Where a fill may go, enforced on-chain' },
      { route: '/sponsors', title: 'Integrations', detail: 'What 1inch, The Graph and Privy each do here, with the evidence' },
      { route: '/sources', title: 'Sources', detail: 'Where every number in this app comes from' },
    ],
  },
  {
    title: 'Money',
    blurb: 'What was made, what was spent, and what is left.',
    items: [
      { route: '/history', title: 'History', detail: 'What settled on chain: every spend and close, each with its transaction' },
      { route: '/pnl', title: 'Realised', detail: 'Profit on positions that are actually closed' },
      { route: '/limits', title: "Today's limit", detail: 'The cap, what it has spent, what remains' },
      { route: '/allocation', title: 'Allocation', detail: 'Where the money sits, by class' },
      { route: '/disposals', title: 'Disposals', detail: 'Cost basis per sale, for an accountant' },
      { route: '/balance', title: 'Balance', detail: 'Cash, held and supplied — they behave differently' },
      { route: '/spend', title: 'Spend', detail: 'Day by day, from what the contract emitted' },
      { route: '/rates', title: 'Rate', detail: 'What idle cash earns, and who sets it' },
      { route: '/export', title: 'Export', detail: 'The two files an accountant asks for' },
      { route: '/sell-everything', title: 'What would sell', detail: 'A preview of flattening, before you ask' },
      { route: '/withdraw-everything', title: 'Withdraw everything', detail: 'Sell, leave Aave and send it all to an allowlisted address, step by step' },
    ],
  },
  {
    title: 'What the bot did',
    blurb: 'Including the runs that refused.',
    items: [
      { route: '/runs', title: 'Runs', detail: 'Every scheduled run, fills and refusals alike' },
      { route: '/proposals', title: 'Proposals', detail: 'What it asked for, and what you said' },
      { route: '/catchup', title: 'Since you looked', detail: 'What happened while you were away' },
      { route: '/backtest', title: 'Backtest', detail: 'What a weekly buy would have done, on real prices' },
      { route: '/schedule', title: 'What runs next', detail: 'Every live strategy, ordered by time' },
      { route: '/roster-compare', title: 'Compare agents', detail: 'The four side by side, on the numbers' },
      { route: '/risk', title: 'Risk limits', detail: 'What each agent holds itself to' },
      { route: '/voice', title: 'Voice', detail: 'How the bot talks, with the instruction shown' },
    ],
  },
  {
    title: 'Markets',
    blurb: 'The instruments, and where their numbers come from.',
    items: [
      { route: '/swap', title: 'Swap', detail: 'Any token you hold for another, through your permission' },
      { route: '/crosschain', title: 'Cross-chain', detail: 'What USDC or WETH from Base would arrive as on another chain, quoted by 1inch Fusion+' },
      { route: '/limit-orders', title: 'Limit orders', detail: 'WETH makers signed a price for, taken whole through your permission' },
      { route: '/movers', title: 'Movers', detail: "Today's largest moves, both directions" },
      { route: '/tokens', title: 'Tokens', detail: 'What settles on this chain, with addresses' },
      { route: '/compare', title: 'Compare', detail: 'Two instruments over the same range' },
      { route: '/stocks', title: 'Equities', detail: 'Priced by a real buy, not a feed' },
      { route: '/earnings', title: 'Earnings', detail: "Filing dates from the regulator's own record" },
      { route: '/coverage', title: 'Coverage', detail: 'What is priced, what settles, and the gap' },
      { route: '/funding', title: 'Funding', detail: 'Mark against oracle, across the perps' },
    ],
  },
  {
    title: 'Infrastructure',
    blurb: 'The machinery underneath, and whether it is working.',
    items: [
      { route: '/system', title: 'System', detail: 'The executor and every dependency it needs' },
      { route: '/network', title: 'Network', detail: 'Which chain this build is really pointed at' },
      { route: '/graph', title: 'Subgraph', detail: 'How far behind the index is' },
      { route: '/graph/spends', title: 'Spend events', detail: 'The same money, recorded by someone else' },
      { route: '/graph/decision', title: 'Routing decision', detail: 'Which venue the router picks, and why' },
      { route: '/metrics', title: 'Metrics', detail: 'What this executor has done, counted' },
    ],
  },
  {
    title: 'Identity',
    blurb: 'Who an address belongs to.',
    items: [
      { route: '/basename', title: 'Basenames', detail: 'Name to address and back, resolved on-chain' },
      { route: '/profile', title: 'This wallet', detail: 'Address, name, and what it has done' },
    ],
  },
  {
    title: 'Settings',
    blurb: '',
    items: [
      { route: '/notifications', title: 'Notifications', detail: 'What is worth interrupting you for' },
    ],
  },
];

export default function Explore() {
  const goBack = useGoBack();
  const router = useRouter();

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Explore</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          Everything the app can tell you about itself.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s16 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.s30 }}
        >
          {GROUPS.map((g) => (
            <View key={g.title} style={{ marginTop: space.s20 }}>
              <Eyebrow>{g.title}</Eyebrow>
              {g.blurb ? (
                <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s4 }}>
                  {g.blurb}
                </Text>
              ) : null}

              {g.items.map((item) => (
                <Press
                  key={item.route}
                  onPress={() => router.push(item.route as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}. ${item.detail}`}
                  style={[
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.s12,
                      minHeight: size.rowLg,
                      paddingVertical: space.s10,
                    },
                    divider,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="rowPrimary">{item.title}</Text>
                    <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s2 }}>
                      {item.detail}
                    </Text>
                  </View>
                  <Icon name="chevron" size={14} color={colors.ink30} />
                </Press>
              ))}
            </View>
          ))}
        </ScrollView>
      </Fill>
    </Screen>
  );
}
