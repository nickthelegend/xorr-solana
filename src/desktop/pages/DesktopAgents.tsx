/**
 * Agents, on a laptop (2026-10-01).
 *
 * The phone roster is a column of cards with a Hire switch on each. On a wide screen the same roster reads as a grid:
 * a strip of what the agents did between them this month, then one card per agent with its record and what sits in its
 * wallet, then a card that makes a new one. Every card opens the agent's own page, where hiring happens — the grid
 * never hires or fires by itself, so the one place the decision is taken is the page that says what it means.
 *
 * Read from the same `GET /agents` the phone roster reads; the wallet figures from `/agents/wallets`, one read for all.
 */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { isSolana } from '@/chain';
import { Icon } from '@/design/Icon';
import { agentGradient } from '@/design/gradients';
import {
  AgentOrb,
  ErrorState,
  Placeholder,
  Price,
  SignInPrompt,
  Text,
  alpha,
  colors,
  money,
  pnlTone,
  radius,
  space,
} from '@/ui';
import { repos } from '@/data';
import { system, type AgentWalletView } from '@/data/system';
import { useAsync } from '@/data/useAsync';
import { useFreshOnReturn } from '@/data/useFreshOnReturn';
import { useSignedOut } from '@/auth/useSignedOut';
import { signedPnl, winRate } from '@/state/derived';
import type { Agent } from '@/data/types';
import { DesktopPage } from '../DesktopShell';
import { Card } from '../parts/Card';

const GAP = 20;

export function DesktopAgents() {
  const router = useRouter();
  const signedOut = useSignedOut();
  const agents = useAsync(() => repos.bot.listAgents(), []);
  // One read for every agent's wallet — cheap, and the same one Home sums. A failure leaves the line off the cards.
  const wallets = useAsync<AgentWalletView[]>(
    () => (isSolana && !signedOut ? system.agentWallets() : Promise.resolve([])),
    [signedOut],
  );
  useFreshOnReturn(agents, wallets);
  const [width, setWidth] = useState(0);

  const list = agents.data ?? [];
  const hired = list.filter((a) => a.hired);
  const trades = list.reduce((n, a) => n + a.trades, 0);
  const pnl = list.reduce((n, a) => n + a.pnl30d, 0);
  const walletOf = new Map((wallets.data ?? []).map((w) => [w.agentId, w]));
  const withAgents = (wallets.data ?? []).reduce((n, w) => n + (w.exists ? w.usdc : 0), 0);

  // Four across on a wide window, three on a laptop's narrowest.
  const cols = width >= 1180 ? 4 : 3;
  const cardW = width > 0 ? Math.floor((width - GAP * (cols - 1)) / cols) : 0;

  return (
    <DesktopPage>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.s20 }}>
        <View style={{ flex: 1, gap: space.s6 }}>
          <Text variant="titleLg">Agents</Text>
          <Text variant="body" color={colors.ink55}>
            They trade from their own wallets, inside your rules
          </Text>
        </View>
        {signedOut ? null : (
          <HeaderButton label="Make your own agent" onPress={() => router.push('/agent/new')} />
        )}
      </View>

      {signedOut ? (
        <SignInPrompt />
      ) : agents.error && !agents.data ? (
        <ErrorState error={agents.error} onRetry={agents.reload} />
      ) : (
        <>
          {/* What they did between them. Counted from the roster the server gave, never before it answered. */}
          <View style={{ flexDirection: 'row', gap: GAP }}>
            <Summary label="Hired" value={agents.data ? `${hired.length} of ${list.length}` : undefined} />
            <Summary label="Trades" value={agents.data ? trades.toLocaleString('en-US') : undefined} />
            <Summary
              label="P&L, last 30 days"
              value={agents.data ? signedPnl(pnl) : undefined}
              tone={pnlTone(pnl)}
              figure
            />
            {isSolana ? (
              <Summary
                label="In their wallets"
                value={wallets.data ? money(withAgents) : wallets.error ? '—' : undefined}
                figure
              />
            ) : null}
          </View>

          <View
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}
          >
            {cardW === 0 ? null : agents.loading && !agents.data ? (
              Array.from({ length: cols }, (_, i) => (
                <Placeholder key={i} width={cardW} height={330} style={{ borderRadius: radius.panel }} />
              ))
            ) : (
              <>
                {list.map((a) => (
                  <AgentCard
                    key={a.id}
                    agent={a}
                    width={cardW}
                    wallet={walletOf.get(a.id)}
                    onOpen={() => router.push(`/agent/${a.id}`)}
                  />
                ))}
                <NewAgentCard width={cardW} onPress={() => router.push('/agent/new')} />
              </>
            )}
          </View>

          <Text variant="footnote" color={colors.ink45}>
            Past performance of a strategy says nothing about tomorrow.
          </Text>
        </>
      )}
    </DesktopPage>
  );
}

function Summary({ label, value, tone, figure }: { label: string; value?: string; tone?: 'neutral' | 'up' | 'down'; figure?: boolean }) {
  return (
    <Card style={{ flex: 1, gap: space.s6 }}>
      <Text variant="eyebrowSm" color={colors.ink45}>
        {label}
      </Text>
      {value === undefined ? (
        <Placeholder width={120} height={30} />
      ) : figure ? (
        <Price variant="amountMd" tone={tone}>
          {value}
        </Price>
      ) : (
        <Text variant="amountMd">{value}</Text>
      )}
    </Card>
  );
}

function AgentCard({
  agent,
  width,
  wallet,
  onOpen,
}: {
  agent: Agent;
  width: number;
  wallet?: AgentWalletView;
  onOpen: () => void;
}) {
  const isHired = !!agent.hired;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="link"
      accessibilityLabel={`${agent.name}, ${agent.role}. ${isHired ? 'Open' : 'Hire'}`}
      testID={`agents-card-${agent.id}`}
      style={({ hovered }: { hovered?: boolean }) => ({
        width,
        padding: 22,
        gap: space.s16,
        borderRadius: radius.panel,
        borderWidth: 1,
        borderColor: hovered ? colors.ghostBorder : colors.cardBorder,
        backgroundColor: hovered ? colors.surfaceAlt : colors.surface,
      })}
    >
      {({ hovered }: { hovered?: boolean }) => (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <AgentOrb gradient={agentGradient(agent.name)} identity={agent.name} size={84} face specular />
            <Badge hired={isHired} />
          </View>

          <View style={{ gap: space.s4 }}>
            <Text variant="cardTitleLg" numberOfLines={1}>
              {agent.name}
            </Text>
            <Text variant="secondary" color={colors.ink55} numberOfLines={2} style={{ minHeight: 36 }}>
              {agent.role}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: space.s14 }}>
            <Stat label="Trades" value={String(agent.trades)} />
            {/* A share of trades: with none there is no rate, and "0%" read as every trade lost. */}
            <Stat label="Win rate" value={winRate(agent)} />
            <Stat label="30 days" value={signedPnl(agent.pnl30d)} tone={pnlTone(agent.pnl30d)} figure />
          </View>

          <Text variant="secondarySm" color={colors.ink55} numberOfLines={1} style={{ minHeight: 17 }}>
            {wallet?.exists ? (
              <Price variant="secondarySm" color={colors.ink70}>
                {`${money(wallet.usdc)} in its wallet`}
              </Price>
            ) : isHired && isSolana ? (
              'No money of its own yet'
            ) : (
              agent.metric
            )}
          </Text>

          <View
            style={{
              height: 40,
              borderRadius: radius.card,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isHired ? (hovered ? colors.controlPress : colors.control) : hovered ? alpha('#FFFFFF', 0.88) : colors.ink,
            }}
          >
            <Text variant="control" color={isHired ? colors.ink : colors.bg}>
              {isHired ? 'Open' : 'Hire'}
            </Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

function Badge({ hired }: { hired: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: space.s10,
        paddingVertical: space.s4,
        borderRadius: radius.full,
        // `hiredBg` is the roster's own "Hired" fill — a state, not a P&L reading.
        backgroundColor: hired ? colors.hiredBg : colors.neutralBg,
      }}
    >
      <Text variant="chipSm" color={hired ? colors.up : colors.ink55}>
        {hired ? 'HIRED' : 'NOT HIRED'}
      </Text>
    </View>
  );
}

function Stat({ label, value, tone, figure }: { label: string; value: string; tone?: 'neutral' | 'up' | 'down'; figure?: boolean }) {
  return (
    <View style={{ flex: 1, gap: space.s2, minWidth: 0 }}>
      {figure ? (
        <Price variant="value" tone={tone} numberOfLines={1}>
          {value}
        </Price>
      ) : (
        <Text variant="value" numberOfLines={1}>
          {value}
        </Text>
      )}
      <Text variant="footnote" color={colors.ink45}>
        {label}
      </Text>
    </View>
  );
}

function NewAgentCard({ width, onPress }: { width: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel="Make your own agent"
      testID="agents-new"
      style={({ hovered }: { hovered?: boolean }) => ({
        width,
        minHeight: 330,
        padding: 22,
        gap: space.s12,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.panel,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: hovered ? colors.selectedBorder : colors.pending,
        backgroundColor: hovered ? colors.surface : 'transparent',
      })}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.control,
        }}
      >
        <Icon name="plus" size={24} color={colors.ink} strokeWidth={2.2} />
      </View>
      <Text variant="cardTitle">Make your own agent</Text>
      <Text variant="secondary" color={colors.ink55} align="center">
        Pick how it trades and what it may touch. It gets a wallet of its own.
      </Text>
    </Pressable>
  );
}

function HeaderButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ hovered }: { hovered?: boolean }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s8,
        height: 40,
        paddingHorizontal: space.s16,
        borderRadius: 20,
        backgroundColor: hovered ? alpha('#FFFFFF', 0.88) : colors.ink,
      })}
    >
      <Icon name="plus" size={16} color={colors.bg} strokeWidth={2.2} />
      <Text variant="control" color={colors.bg}>
        {label}
      </Text>
    </Pressable>
  );
}
