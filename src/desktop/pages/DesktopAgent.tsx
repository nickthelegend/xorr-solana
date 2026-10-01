/**
 * One agent, on a laptop (2026-10-01).
 *
 * Two columns. On the left, who it is and what it has done: its record, its rules, the strategies it runs and the
 * trades it made, from the activity trail. On the right, the money and the actions: its wallet, the hire when it is
 * not hired yet, and asking it to look now.
 *
 * Every action goes through the same code the phone screen calls (`src/agents/useAgentActions.ts`) — the same hire,
 * the same look — and every money move opens the same `/agent/wallet` screen. This page only lays them out wider.
 */
import React from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { isSolana } from '@/chain';
import { agentGradient } from '@/design/gradients';
import {
  AgentOrb,
  Button,
  ErrorState,
  Placeholder,
  Price,
  Text,
  alpha,
  colors,
  money,
  pnlTone,
  quantity,
  radius,
  space,
} from '@/ui';
import { repos } from '@/data';
import { system, type AgentPolicy } from '@/data/system';
import { useAsync } from '@/data/useAsync';
import { useFreshOnReturn } from '@/data/useFreshOnReturn';
import { errorText } from '@/data/apiError';
import { signedPnl, winRate, activityAmountIsCredit } from '@/state/derived';
import { labelFigure, setupFor } from '@/strategies/ladder';
import { spendPhrase } from '@/strategies/spend';
import { plainAction, plainDetail } from '@/format/activity';
import { stamp } from '@/format';
import {
  agentKinds,
  agentStrategiesOf,
  policyLines,
  STATE_LABEL,
  useHireAgent,
  useLookNow,
} from '@/agents/useAgentActions';
import type { ActivityEvent, Agent } from '@/data/types';
import { DesktopPage } from '../DesktopShell';
import { Card } from '../parts/Card';

const RIGHT_W = 380;
/** Enough of the trail to see what it has been doing; the rest is one click away on Activity. */
const RECENT = 12;

export function DesktopAgent() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  // `listAgents` throws when /agents cannot answer, so a failed read reaches the ErrorState below rather than passing
  // for an agent with a record of zeros.
  const agents = useAsync(() => repos.bot.listAgents(), []);
  const strategies = useAsync(() => repos.strategies.list(), []);
  const trail = useAsync(() => repos.activity.list(), []);
  useFreshOnReturn(agents, strategies, trail);

  const agent = (agents.data ?? []).find((a) => a.id === id || a.personaId === id);
  const { hire, hiring, hireError, justHired } = useHireAgent(agent, agents.reload);

  if (agents.error) {
    return (
      <DesktopPage>
        <ErrorState error={agents.error} onRetry={agents.reload} />
      </DesktopPage>
    );
  }
  if (!agent) {
    return (
      <DesktopPage>
        {agents.loading ? (
          <View style={{ flexDirection: 'row', gap: 20 }}>
            <View style={{ flex: 1, gap: 20 }}>
              <Placeholder height={150} style={{ borderRadius: radius.panel }} />
              <Placeholder height={92} style={{ borderRadius: radius.panel }} />
              <Placeholder height={240} style={{ borderRadius: radius.panel }} />
            </View>
            <View style={{ width: RIGHT_W, gap: 20 }}>
              <Placeholder height={220} style={{ borderRadius: radius.panel }} />
            </View>
          </View>
        ) : (
          <Text variant="body" color={colors.ink55}>
            Agent not found.
          </Text>
        )}
      </DesktopPage>
    );
  }

  const mine = agentStrategiesOf(agent, strategies.data ?? []);
  const setup = setupFor(agentKinds(agent));
  const trades = (trail.data ?? []).filter((e) => e.agent === agent.name && e.kind === 'trade').slice(0, RECENT);
  const hasWallet = isSolana && (agent.hired || agent.custom);

  return (
    <DesktopPage>
      <Pressable
        onPress={() => router.navigate('/bot/roster')}
        accessibilityRole="link"
        accessibilityLabel="All agents"
        style={{ alignSelf: 'flex-start' }}
      >
        {({ hovered }: { hovered?: boolean }) => (
          <Text variant="control" color={hovered ? colors.ink : colors.ink55}>
            ‹ All agents
          </Text>
        )}
      </Pressable>

      <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
        {/* LEFT: who it is, and what it has done. */}
        <View style={{ flex: 1, minWidth: 0, gap: 20 }}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s22 }}>
              {/*
                What the agent is doing, from this page's own state: the hire is out for the executor to answer, or it
                has just answered. An agent that was already hired when the page opened is still.
              */}
              <AgentOrb
                gradient={agentGradient(agent.name)}
                identity={agent.name}
                size={104}
                face
                specular
                stage={hiring ? 'executing' : justHired ? 'filled' : undefined}
              />
              <View style={{ flex: 1, minWidth: 0, gap: space.s6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s12 }}>
                  <Text variant="titleLg" numberOfLines={1}>
                    {agent.name}
                  </Text>
                  <Status agent={agent} />
                </View>
                <Text variant="body" color={colors.ink55}>
                  {agent.role}
                </Text>
                {agent.custom ? (
                  <Text variant="secondarySm" color={colors.ink45}>
                    Made by you
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>

          <View style={{ flexDirection: 'row', gap: 20 }}>
            <Tile label="P&L, last 30 days" value={signedPnl(agent.pnl30d)} tone={pnlTone(agent.pnl30d)} figure />
            {/* A share of trades: with none there is no rate, and "0%" read as every trade lost. */}
            <Tile label="Win rate" value={winRate(agent)} />
            <Tile label="Trades" value={agent.trades.toLocaleString('en-US')} />
          </View>

          {agent.hired || agent.custom ? (
            <RulesCard agentId={agent.id} name={agent.name} policy={(agent.riskLimits ?? {}) as AgentPolicy} />
          ) : null}

          <Card
            title="Strategies"
            right={<LinkText label="See all" onPress={() => router.push('/strategies')} />}
          >
            {strategies.loading && !strategies.data ? (
              <View style={{ gap: space.s10 }}>
                <Placeholder height={48} />
                <Placeholder height={48} />
              </View>
            ) : mine.length === 0 ? (
              <Text variant="body" color={colors.ink55}>
                {strategies.error ? 'Couldn’t load strategies.' : 'Nothing running yet.'}
              </Text>
            ) : (
              <View>
                {mine.map((s, i) => (
                  <HoverRow key={s.id} last={i === mine.length - 1} onPress={() => router.push(`/strategy/${s.id}`)} label={s.label}>
                    <View style={{ flex: 1, minWidth: 0, gap: space.s2 }}>
                      <Text variant="rowPrimary" figure={labelFigure(s.kind)} numberOfLines={1}>
                        {s.label}
                      </Text>
                      {/* An exit spends nothing: "$0.00 a day" read as a strategy with no budget. */}
                      <Text variant="secondarySm" color={colors.ink55} numberOfLines={1}>
                        {`${s.symbol} · ${s.kind === 'exit-rules' ? (isSolana ? 'checked every 30 seconds' : 'checked daily') : spendPhrase(money(s.dailyAllocationUsd), s.cadence)}`}
                      </Text>
                    </View>
                    <Text variant="secondary" color={s.state === 'live' ? colors.ink : colors.ink40}>
                      {STATE_LABEL[s.state] ?? s.state}
                    </Text>
                  </HoverRow>
                ))}
              </View>
            )}
            {setup ? (
              <View style={{ marginTop: space.s16, alignSelf: 'flex-start', minWidth: 200 }}>
                <Button label="Add strategy" variant="ghost" height={40} onPress={() => router.push(setup.route as never)} />
              </View>
            ) : (
              <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s14 }}>
                No strategy to add for {agent.name} yet.
              </Text>
            )}
          </Card>

          <Card
            title="Recent trades"
            right={<LinkText label="All activity" onPress={() => router.push('/activity')} />}
          >
            {trail.loading && !trail.data ? (
              <View style={{ gap: space.s10 }}>
                <Placeholder height={44} />
                <Placeholder height={44} />
                <Placeholder height={44} />
              </View>
            ) : trail.error && !trail.data ? (
              <Text variant="body" color={colors.ink55}>
                Couldn’t load its trades.
              </Text>
            ) : trades.length === 0 ? (
              <Text variant="body" color={colors.ink55}>
                {`${agent.name} hasn’t traded yet.`}
              </Text>
            ) : (
              <View>
                {trades.map((e, i) => (
                  <TradeRow key={e.id} event={e} last={i === trades.length - 1} onPress={() => router.push(`/explain/${e.id}`)} />
                ))}
              </View>
            )}
          </Card>
        </View>

        {/* RIGHT: the money, and the things you can ask of it. */}
        <View style={{ width: RIGHT_W, gap: 20 }}>
          {!agent.hired ? (
            <Card title={`Hire ${agent.name}`}>
              <Text variant="secondary" color={colors.ink55} style={{ marginBottom: space.s16 }}>
                {agent.metric}
              </Text>
              <Button label={`Hire ${agent.name}`} onPress={hire} loading={hiring} testID="agent-hire" />
              {hireError ? (
                <Text variant="secondarySm" color={colors.down} style={{ marginTop: space.s10 }}>
                  {hireError}
                </Text>
              ) : null}
            </Card>
          ) : null}

          {hasWallet ? (
            <WalletCard agentId={agent.id} name={agent.name} />
          ) : !isSolana ? (
            <Card title="Money">
              <View style={{ flexDirection: 'row', gap: space.s10 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Add funds" variant={agent.hired ? 'primary' : 'ghost'} onPress={() => router.push('/deposit')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Withdraw" variant="ghost" onPress={() => router.push('/send')} />
                </View>
              </View>
            </Card>
          ) : null}

          {isSolana && agent.hired && !agent.custom ? <LookNowCard agentId={agent.id} name={agent.name} /> : null}
        </View>
      </View>
    </DesktopPage>
  );
}

function Status({ agent }: { agent: Agent }) {
  return (
    <View
      style={{
        paddingHorizontal: space.s10,
        paddingVertical: space.s4,
        borderRadius: radius.full,
        backgroundColor: agent.hired ? colors.hiredBg : colors.neutralBg,
      }}
    >
      <Text variant="chipSm" color={agent.hired ? colors.up : colors.ink55}>
        {agent.hired ? 'HIRED' : 'NOT HIRED'}
      </Text>
    </View>
  );
}

function Tile({ label, value, tone, figure }: { label: string; value: string; tone?: 'neutral' | 'up' | 'down'; figure?: boolean }) {
  return (
    <Card style={{ flex: 1, gap: space.s6 }}>
      <Text variant="eyebrowSm" color={colors.ink45}>
        {label}
      </Text>
      {figure ? (
        <Price variant="amountMd" tone={tone} numberOfLines={1}>
          {value}
        </Price>
      ) : (
        <Text variant="amountMd" numberOfLines={1}>
          {value}
        </Text>
      )}
    </Card>
  );
}

function LinkText({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label}>
      {({ hovered }: { hovered?: boolean }) => (
        <Text variant="control" color={hovered ? colors.ink : colors.ink55}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** A list row that lights under the pointer. */
function HoverRow({
  children,
  last,
  onPress,
  label,
}: {
  children: React.ReactNode;
  last: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ hovered }: { hovered?: boolean }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s16,
        minHeight: 60,
        paddingVertical: space.s10,
        paddingHorizontal: space.s12,
        marginHorizontal: -space.s12,
        borderRadius: radius.tileSm,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.hairline,
        backgroundColor: hovered ? alpha('#FFFFFF', 0.035) : 'transparent',
      })}
    >
      {children}
    </Pressable>
  );
}

function TradeRow({ event, last, onPress }: { event: ActivityEvent; last: boolean; onPress: () => void }) {
  return (
    <HoverRow last={last} onPress={onPress} label={`Why: ${plainAction(event.action)}`}>
      <Text variant="secondary" color={colors.ink45} style={{ width: 110 }} numberOfLines={1}>
        {event.at ? stamp(event.at) : event.t}
      </Text>
      <View style={{ flex: 1, minWidth: 0, gap: space.s2 }}>
        <Text variant="rowPrimary" numberOfLines={1}>
          {plainAction(event.action)}
        </Text>
        {event.detail ? (
          <Text variant="secondarySm" color={colors.ink55} numberOfLines={1}>
            {plainDetail(event.detail)}
          </Text>
        ) : null}
      </View>
      {event.amount ? (
        <Price color={activityAmountIsCredit(event.amount) ? colors.up : colors.ink55} figure="units">
          {event.amount}
        </Price>
      ) : null}
      {event.explorer?.startsWith('http') ? (
        <Pressable
          onPress={() => void Linking.openURL(event.explorer!)}
          accessibilityRole="link"
          accessibilityLabel="View this transaction"
        >
          {({ hovered }: { hovered?: boolean }) => (
            <Text variant="footnote" color={hovered ? colors.ink : colors.ink55}>
              {`${event.signature ? `${event.signature.slice(0, 6)}…` : 'Transaction'} ›`}
            </Text>
          )}
        </Pressable>
      ) : null}
    </HoverRow>
  );
}

/** The agent's rules, in words, and the door to change them. */
function RulesCard({ agentId, name, policy }: { agentId: string; name: string; policy: AgentPolicy }) {
  const router = useRouter();
  const lines = policyLines(policy);
  return (
    <Card
      title="Its rules"
      testID="agent-rules-summary"
      right={<LinkText label="Edit" onPress={() => router.push(`/agent/policy?id=${encodeURIComponent(agentId)}`)} />}
    >
      {lines.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s8 }}>
          {lines.map((l) => (
            <View key={l} style={{ paddingHorizontal: space.s12, paddingVertical: space.s6, borderRadius: radius.full, backgroundColor: colors.control }}>
              <Text variant="secondary" color={colors.ink70}>
                {l}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text variant="secondary" color={colors.ink55}>
          {`No rules of its own yet — only your daily cap. Set what ${name} may trade, how much, and when.`}
        </Text>
      )}
    </Card>
  );
}

/** `FBed…CW88` */
function shortAddress(a: string): string {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

/** The agent's own wallet: what it holds, where, whether the bot may spend it, and the two ways money moves. */
function WalletCard({ agentId, name }: { agentId: string; name: string }) {
  const router = useRouter();
  const wallet = useAsync(() => system.agentWallet(agentId), [agentId]);
  useFreshOnReturn(wallet);
  const [copied, setCopied] = React.useState(false);
  const w = wallet.data;
  async function copy(address: string) {
    await Clipboard.setStringAsync(address);
    setCopied(true);
  }
  return (
    <Card title="Its wallet" testID="agent-wallet-summary">
      {wallet.error ? (
        <Text variant="secondarySm" color={colors.down}>
          {errorText(wallet.error)}
        </Text>
      ) : !w ? (
        <Placeholder height={64} />
      ) : (
        <View style={{ gap: space.s8 }}>
          <Price variant="amountLg" figure="own">
            {money(w.usdc)}
          </Price>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s12 }}>
            <Text variant="secondary" color={colors.ink55}>
              {shortAddress(w.address)}
            </Text>
            <LinkText label={copied ? 'Copied' : 'Copy'} onPress={() => void copy(w.address)} />
            <LinkText label="Explorer ›" onPress={() => void Linking.openURL(w.explorer)} />
          </View>
          <Text variant="secondarySm" color={colors.ink55}>
            {!w.exists || !w.inUse
              ? `Give ${name} money of its own to trade. It stays in your wallet, at its own address.`
              : w.approved
                ? `${name} trades from this alone. The chain stops it at what is here.`
                : 'The bot is not approved on it right now — fund it or resume in Safety.'}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: space.s10, marginTop: space.s18 }}>
        <View style={{ flex: 1 }}>
          <Button
            label="Fund"
            height={46}
            onPress={() => router.push(`/agent/wallet?id=${encodeURIComponent(agentId)}&mode=fund`)}
            testID="agent-fund"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="Withdraw"
            variant="ghost"
            height={46}
            disabled={!w || !(w.usdc > 0)}
            onPress={() => router.push(`/agent/wallet?id=${encodeURIComponent(agentId)}&mode=withdraw`)}
            testID="agent-withdraw"
          />
        </View>
      </View>
    </Card>
  );
}

/** Ask it to look now — the same call the phone screen makes (`useLookNow`). */
function LookNowCard({ agentId, name }: { agentId: string; name: string }) {
  const { look, busy, out, error } = useLookNow(agentId);
  return (
    <Card title="Look now">
      <Text variant="secondary" color={colors.ink55} style={{ marginBottom: space.s14 }}>
        {`${name} runs its own check right now, through every one of your rules, and tells you what it did or why it held.`}
      </Text>
      <Button
        label={busy ? `${name} is looking` : `Ask ${name} to look now`}
        variant="ghost"
        height={46}
        loading={busy}
        onPress={() => void look()}
        testID="agent-look"
      />
      {out?.executed ? (
        <View
          style={{ marginTop: space.s12, borderRadius: radius.card, backgroundColor: colors.surfaceAlt, padding: space.s14, gap: space.s4 }}
          testID="agent-look-filled"
        >
          <Text variant="rowPrimary">{`Bought ${quantity(out.units)} ${out.symbol} for ${money(out.usd)}`}</Text>
          <Text variant="secondarySm" color={colors.ink55}>
            {out.reason}
          </Text>
          <Text variant="footnote" color={colors.ink65} onPress={() => void Linking.openURL(out.explorer)} accessibilityRole="link">
            {`${out.venue === 'jupiter-route' ? 'Routed by Jupiter' : 'Filled from the venue vault'} · transaction ${out.signature.slice(0, 6)}… ›`}
          </Text>
        </View>
      ) : out ? (
        <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s12 }} testID="agent-look-held">
          {out.detail}
        </Text>
      ) : error ? (
        <Text variant="secondarySm" color={colors.down} style={{ marginTop: space.s12 }}>
          {error}
        </Text>
      ) : null}
    </Card>
  );
}
