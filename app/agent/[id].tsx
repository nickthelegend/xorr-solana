/**
 * One agent (2026-09-12): who it is, money in and out, and what it runs.
 *
 * Rebuilt to the product owner's brief — add funds, withdraw, the strategies this agent runs and a way
 * to add one — with the long caveats taken off the page. The identity glyph is the same one the roster
 * draws.
 *
 * Which strategies are "its": strategies are not tagged by agent in the data, so this reads the
 * strategy kind each agent's mandate covers — breakouts for Momentum Scout, earnings events for
 * Earnings Desk, idle cash for Yield Keeper, exits for Drawdown Guard — and lists this wallet's
 * strategies of that kind. The mapping is the mandate, written down; it attributes no run to anyone.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  AgentOrb,
  BackButton,
  Button,
  ErrorState,
  Placeholder,
  Price,
  Row,
  Screen,
  Text,
  colors,
  money,
  pnlTone,
  radius,
  size,
  space,
  type PriceTone,
} from '@/ui';
import { Rise } from '@/ui/Rise';
import { agentGradient } from '@/design/gradients';
import { useAsync } from '@/data/useAsync';
import { repos } from '@/data';
import { STRATEGY_LADDER } from '@/strategies/ladder';
import type { StrategyKind } from '@/data/types';

/** The strategy kind each agent's mandate covers. See the header comment. */
const MANDATE_KINDS: Readonly<Record<string, readonly StrategyKind[]>> = {
  'Momentum Scout': ['momentum'],
  'Earnings Desk': ['event-driven'],
  'Yield Keeper': ['yield-rotation'],
  'Drawdown Guard': ['exit-rules'],
};

const STATE_LABEL: Readonly<Record<string, string>> = {
  live: 'Live',
  watch: 'Watching',
  paused: 'Paused',
  draft: 'Draft',
  ended: 'Ended',
};

const ORB = 84 as const;

export default function AgentDetail() {
  const goBack = useGoBack();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [hiring, setHiring] = useState(false);

  const agents = useAsync(() => repos.bot.listAgents(), []);
  const strategies = useAsync(() => repos.strategies.list(), []);

  const agent = (agents.data ?? []).find((a) => a.id === id || a.personaId === id);
  const kinds = agent ? (MANDATE_KINDS[agent.name] ?? []) : [];
  // Plain: the React Compiler memoizes this itself, and could not preserve a hand-written memo keyed
  // on a joined string.
  const mine = (strategies.data ?? []).filter((s) => kinds.includes(s.kind) && s.state !== 'ended');
  const addRoute = STRATEGY_LADDER.find((e) => kinds.includes(e.kind))?.route ?? '/strategies';

  const hire = async () => {
    if (!agent) return;
    setHiring(true);
    try {
      await repos.bot.hire(agent.personaId ?? agent.id);
      await agents.reload();
    } finally {
      setHiring(false);
    }
  };

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <BackButton onPress={goBack} />
      </View>

      {agents.error ? (
        <View style={{ paddingHorizontal: space.gutter }}>
          <ErrorState error={agents.error} onRetry={agents.reload} />
        </View>
      ) : !agent && agents.loading ? (
        <View style={{ alignItems: 'center', gap: space.s12, paddingHorizontal: space.gutter, marginTop: space.s8 }}>
          <Placeholder width={ORB} height={ORB} style={{ borderRadius: radius.full }} />
          <Placeholder width={180} height={24} />
          <Placeholder width={220} height={14} />
          <View style={{ flexDirection: 'row', gap: space.s10, alignSelf: 'stretch', marginTop: space.s12 }}>
            <Placeholder width="48%" height={54} />
            <Placeholder width="48%" height={54} />
          </View>
          <Placeholder height={180} style={{ marginTop: space.s12 }} />
        </View>
      ) : !agent ? (
        <View style={{ paddingHorizontal: space.gutter }}>
          <Text variant="body" color={colors.ink40}>
            No agent with that id.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.s30, gap: space.s14 }}
        >
          <Rise index={0} style={{ alignItems: 'center', gap: space.s8 }}>
            <AgentOrb gradient={agentGradient(agent.name)} identity={agent.name} size={ORB} face />
            <Text variant="screenTitle" align="center" style={{ marginTop: space.s6 }}>
              {agent.name}
            </Text>
            <Text variant="secondarySm" color={colors.ink40} align="center">
              {agent.role}
            </Text>
            <View
              style={{
                marginTop: space.s4,
                paddingHorizontal: space.s10,
                paddingVertical: space.s2,
                borderRadius: radius.full,
                backgroundColor: agent.hired ? colors.control : colors.neutralBg,
              }}
            >
              <Text variant="chipSm" color={agent.hired ? colors.ink : colors.ink55}>
                {agent.hired ? 'HIRED' : 'NOT HIRED'}
              </Text>
            </View>
          </Rise>

          {!agent.hired ? (
            <Rise index={1}>
              <Button label={`Hire ${agent.name}`} onPress={hire} loading={hiring} />
            </Rise>
          ) : null}

          <Rise index={1} style={{ flexDirection: 'row', gap: space.s10 }}>
            <View style={{ flex: 1 }}>
              <Button label="Add funds" variant={agent.hired ? 'primary' : 'ghost'} onPress={() => router.push('/deposit')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Withdraw" variant="ghost" onPress={() => router.push('/send')} />
            </View>
          </Rise>

          <Rise index={2} style={{ flexDirection: 'row', gap: space.s10 }}>
            <Stat label="30 days" value={money(agent.pnl30d)} tone={pnlTone(agent.pnl30d)} />
            <Stat label="Win rate" value={`${agent.win}%`} />
            <Stat label="Trades" value={String(agent.trades)} />
          </Rise>

          <Rise index={3} style={{ borderRadius: radius.panel, backgroundColor: colors.surfaceAlt, padding: space.s16 }}>
            <Text variant="cardTitle">Strategies</Text>
            {strategies.loading && !strategies.data ? (
              <View style={{ marginTop: space.s12, gap: space.s10 }}>
                <Placeholder height={48} />
                <Placeholder height={48} />
              </View>
            ) : mine.length === 0 ? (
              <Text variant="body" color={colors.ink40} style={{ marginTop: space.s10 }}>
                {strategies.error ? 'Strategies could not be loaded.' : 'Nothing running yet.'}
              </Text>
            ) : (
              mine.map((s, i) => (
                <Row
                  key={s.id}
                  height={size.rowLg}
                  divider={i < mine.length - 1}
                  onPress={() => router.push(`/strategy/${s.id}`)}
                  title={s.label}
                  secondary={`${s.symbol} · ${money(s.dailyAllocationUsd)} a day`}
                  value={
                    <Text variant="secondarySm" color={s.state === 'live' ? colors.ink : colors.ink40}>
                      {STATE_LABEL[s.state] ?? s.state}
                    </Text>
                  }
                />
              ))
            )}
            <View style={{ marginTop: space.s14 }}>
              <Button label="Add strategy" variant="ghost" onPress={() => router.push(addRoute as never)} />
            </View>
          </Rise>
        </ScrollView>
      )}
    </Screen>
  );
}

/** One figure in the stats row. */
function Stat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: PriceTone }) {
  return (
    <View
      style={{
        flex: 1,
        paddingVertical: space.s14,
        paddingHorizontal: space.s12,
        borderRadius: radius.card,
        backgroundColor: colors.surfaceAlt,
      }}
    >
      {/* Shrinks to fit rather than truncating: "$0...." is not a figure. */}
      <Price variant="cardTitleLg" tone={tone} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Price>
      <Text variant="footnote" color={colors.ink40} style={{ marginTop: space.s4 }}>
        {label}
      </Text>
    </View>
  );
}
