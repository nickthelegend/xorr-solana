/**
 * An agent's rules (2026-09-23): what the owner allows one agent to do, inside the permission they already signed.
 *
 * Every rule only narrows, and each says in words what it does — the executor enforces the same five on every entry the
 * agent makes on its own (`server/src/agents/policy.ts`): the most one entry may be, the most a day, which stocks, whether
 * it may enter while Nasdaq is shut, and the furthest its stop may sit below the fill.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  ChoiceChip,
  ErrorState,
  Fill,
  HeaderBar,
  PillWrap,
  Placeholder,
  Screen,
  SheetCard,
  Stepper,
  SwitchRow,
  Text,
  colors,
  radius,
  space,
} from '@/ui';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { system, type AgentPolicy } from '@/data/system';
import { errorText } from '@/data/apiError';

const TRADE_STEP = 5;
const DAY_STEP = 25;
const LOSS_STEP = 1;

/** One rule: a label, what it does now in words, and the control that changes it. */
function Rule({ title, now, children }: { title: string; now: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s12, paddingVertical: space.s10 }}>
      <View style={{ flex: 1, gap: space.s2 }}>
        <Text variant="rowPrimary">{title}</Text>
        <Text variant="secondarySm" color={colors.ink55}>
          {now}
        </Text>
      </View>
      {children}
    </View>
  );
}

export default function AgentPolicyScreen() {
  const goBack = useGoBack();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const agents = useAsync(() => repos.bot.listAgents(), []);
  const tradable = useAsync(() => system.tradable(), []);
  const agent = (agents.data ?? []).find((a) => a.id === id || a.personaId === id);

  const [policy, setPolicy] = useState<AgentPolicy>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();

  // Seeded once from what is stored, while rendering; after that the screen owns the draft until it is saved.
  const [seeded, setSeeded] = useState(false);
  if (agent && !seeded) {
    setSeeded(true);
    setPolicy((agent.riskLimits ?? {}) as AgentPolicy);
  }

  /*
   * The stocks an agent can actually enter: the xStocks. A pre-IPO token is bought by its owner, never by an agent —
   * a private company has no share price to check the pool against, and the agents do not trade what they cannot check.
   */
  const symbols = (tradable.data ?? []).map((t) => t.symbol).filter((s) => s !== 'USDC' && !s.startsWith('T-'));
  const chosen = policy.symbols ?? [];
  const every = chosen.length === 0;
  const change = (next: AgentPolicy) => {
    setPolicy(next);
    setSaved(false);
  };
  const toggleSymbol = (s: string) => {
    const has = chosen.includes(s);
    const next = has ? chosen.filter((x) => x !== s) : [...chosen, s];
    change({ ...policy, symbols: next.length ? next : undefined });
  };

  async function save() {
    if (!agent) return;
    setSaving(true);
    setError(undefined);
    try {
      // Unset fields are left out, so "no limit" is stored as no limit rather than as a zero.
      const clean = Object.fromEntries(Object.entries(policy).filter(([, v]) => v !== undefined));
      await repos.bot.updateAgent(agent.id, { riskLimits: clean });
      setSaved(true);
      agents.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  const dollars = (n?: number) => (n ? `$${n.toLocaleString('en-US')}` : 'No limit');

  return (
    <Screen gutter="none" testID="agent-policy">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">{agent ? `${agent.name}'s rules` : 'Rules'}</Text>} />
        <Text variant="secondary" color={colors.ink55} style={{ marginTop: space.s6 }}>
          Inside the permission you signed. Every rule only narrows, and the bot enforces each on every trade this agent makes.
        </Text>
      </View>

      {agents.error ? (
        <View style={{ paddingHorizontal: space.gutter }}>
          <ErrorState error={agents.error} onRetry={agents.reload} />
        </View>
      ) : !agent ? (
        <View style={{ padding: space.gutter, gap: space.s10 }}>
          <Placeholder height={64} />
          <Placeholder height={64} />
          <Placeholder height={64} />
        </View>
      ) : !agent.hired && !agent.custom ? (
        <View style={{ padding: space.gutter }}>
          <Text variant="body" color={colors.ink55}>
            {`Hire ${agent.name} to give it rules of its own.`}
          </Text>
        </View>
      ) : (
        <Fill>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.s14, paddingBottom: space.s20, gap: space.s14 }}
          >
            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Rule title="Most per trade" now={dollars(policy.maxUsdPerTrade)}>
                <Stepper
                  value={policy.maxUsdPerTrade ? `$${policy.maxUsdPerTrade}` : 'Off'}
                  canDecrement={!!policy.maxUsdPerTrade}
                  onDecrement={() => {
                    const v = (policy.maxUsdPerTrade ?? 0) - TRADE_STEP;
                    change({ ...policy, maxUsdPerTrade: v > 0 ? v : undefined });
                  }}
                  onIncrement={() => change({ ...policy, maxUsdPerTrade: (policy.maxUsdPerTrade ?? 0) + TRADE_STEP })}
                  testID="policy-per-trade"
                />
              </Rule>
              <Rule title="Most per day" now={dollars(policy.maxUsdPerDay)}>
                <Stepper
                  value={policy.maxUsdPerDay ? `$${policy.maxUsdPerDay}` : 'Off'}
                  canDecrement={!!policy.maxUsdPerDay}
                  onDecrement={() => {
                    const v = (policy.maxUsdPerDay ?? 0) - DAY_STEP;
                    change({ ...policy, maxUsdPerDay: v > 0 ? v : undefined });
                  }}
                  onIncrement={() => change({ ...policy, maxUsdPerDay: (policy.maxUsdPerDay ?? 0) + DAY_STEP })}
                  testID="policy-per-day"
                />
              </Rule>
              <Rule
                title="Most it may lose on a position"
                now={policy.maxLossPct ? `Its stop sits no more than ${policy.maxLossPct}% under the fill` : 'Its own stop decides'}
              >
                <Stepper
                  value={policy.maxLossPct ? `${policy.maxLossPct}%` : 'Off'}
                  canDecrement={!!policy.maxLossPct}
                  canIncrement={(policy.maxLossPct ?? 0) < 20}
                  onDecrement={() => {
                    const v = (policy.maxLossPct ?? 0) - LOSS_STEP;
                    change({ ...policy, maxLossPct: v >= 1 ? v : undefined });
                  }}
                  onIncrement={() => change({ ...policy, maxLossPct: (policy.maxLossPct ?? 0) + LOSS_STEP })}
                  testID="policy-max-loss"
                />
              </Rule>
            </SheetCard>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="rowPrimary">Stocks it may buy</Text>
              <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s2 }}>
                {every ? 'Every xStock this network can settle.' : `Only ${chosen.join(', ')}.`}
              </Text>
              <PillWrap style={{ marginTop: space.s12 }}>
                <ChoiceChip label="All" selected={every} onPress={() => change({ ...policy, symbols: undefined })} />
                {symbols.map((s) => (
                  <ChoiceChip key={s} label={s} selected={chosen.includes(s)} onPress={() => toggleSymbol(s)} testID={`policy-symbol-${s}`} />
                ))}
              </PillWrap>
              <Text variant="footnote" color={colors.ink55} style={{ marginTop: space.s10 }}>
                Pre-IPO tokens are yours to buy, not an agent&apos;s: a private company has no share price to check the pool against.
              </Text>
            </SheetCard>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s6}>
              <SwitchRow
                label="Trade while Nasdaq is shut"
                caption={(on) =>
                  on
                    ? 'May enter nights and weekends, when the pool is measured against the last close.'
                    : 'Enters only in the regular session, when the pool can be checked against the live share.'
                }
                on={policy.allowOffHours !== false}
                onChange={(on) => change({ ...policy, allowOffHours: on ? undefined : false })}
                divider={false}
                testID="policy-off-hours"
              />
            </SheetCard>

            {error ? (
              <Text variant="secondarySm" color={colors.down} align="center">
                {error}
              </Text>
            ) : null}
          </ScrollView>
          <View style={{ paddingHorizontal: space.gutter }}>
            <Button label={saving ? 'Saving' : saved ? 'Saved' : 'Save rules'} loading={saving} disabled={saved} onPress={() => void save()} testID="policy-save" />
          </View>
        </Fill>
      )}
    </Screen>
  );
}
