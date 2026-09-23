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
 *
 * "Add strategy" goes where the ladder says that kind is set up, and appears only when something in
 * the app can set it up. It sent Momentum Scout and Earnings Desk to /strategies, where neither kind
 * can be created, so those two say they have nothing to add. The full list is still one tap away, from
 * the card's own header: this page is how people reach it.
 */
import React, { useState } from 'react';
import { isSolana } from '@/chain';
import { Linking, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import { spendPhrase } from '@/strategies/spend';
import { system, type AgentLookOutcome, type AgentPolicy } from '@/data/system';
import { useFreshOnReturn } from '@/data/useFreshOnReturn';
import {
  AgentOrb,
  BackButton,
  Button,
  ErrorState,
  Placeholder,
  Press,
  Price,
  Row,
  Screen,
  Text,
  colors,
  money,
  quantity,
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
import { errorText } from '@/data/apiError';
import { winRate } from '@/state/derived';
import { labelFigure, setupFor } from '@/strategies/ladder';
import type { StrategyKind } from '@/data/types';
import { CHAT_AGENTS } from '@/chat/agents';

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
  const [hireError, setHireError] = useState<string>();
  /*
   * A hire that went through ON THIS VISIT, for the orb's `filled` beat.
   *
   * Not `agent.hired`: that is true for every visit afterwards, and an orb that pops every time the page
   * opens is celebrating something that happened last week. The beat belongs to the moment it lands.
   */
  const [justHired, setJustHired] = useState(false);

  // `listAgents` throws when /agents cannot answer, so a failed read reaches the ErrorState below
  // rather than passing for an agent with a record of zeros. Signed out, that asks for a sign-in.
  const agents = useAsync(() => repos.bot.listAgents(), []);
  const strategies = useAsync(() => repos.strategies.list(), []);

  const agent = (agents.data ?? []).find((a) => a.id === id || a.personaId === id);
  // An agent someone made runs the kind of strategy the one it works like does.
  const mandateOf = agent?.custom ? CHAT_AGENTS.find((a) => a.id === agent.style)?.name : agent?.name;
  const kinds = mandateOf ? (MANDATE_KINDS[mandateOf] ?? []) : [];
  // Plain: the React Compiler memoizes this itself, and could not preserve a hand-written memo keyed
  // on a joined string.
  /*
   * An exit an agent armed on its own entry is that agent's, whatever the kind mandate says (2026-09-23): Momentum
   * Scout read "Nothing running yet" beside ten trades and five live exits, which were drawn under Drawdown Guard — an
   * agent nobody had hired. `params.armedBy` is the executor's record of who armed it; the kind mapping decides the rest.
   */
  const mine = (strategies.data ?? []).filter((s) => {
    if (s.state === 'ended') return false;
    if (agent?.custom) return s.agentId === agent.id;
    const armedBy = typeof s.params?.armedBy === 'string' ? s.params.armedBy : undefined;
    return armedBy ? armedBy === agent?.name : kinds.includes(s.kind);
  });
  const setup = setupFor(kinds);

  const hire = async () => {
    if (!agent) return;
    setHiring(true);
    setHireError(undefined);
    try {
      await repos.bot.hire(agent.personaId ?? agent.id);
      setJustHired(true);
      agents.reload();
    } catch (e) {
      /*
       * The server's sentence, under the button that asked.
       *
       * There was no catch: a refused hire stopped the spinner and changed nothing else, which reads
       * as a hire that went through — until the chip still says NOT HIRED.
       */
      setHireError(errorText(e));
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
          <Text variant="body" color={colors.ink55}>
            Agent not found.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.s30, gap: space.s14 }}
        >
          <Rise index={0} style={{ alignItems: 'center', gap: space.s8 }}>
            {/*
              What the agent is doing, from this screen's own state (`AgentOrb`'s `stage`): the hire is out for
              the executor to answer, or it has just answered. An agent that was already hired when the page
              opened is still — nothing is happening, and the HIRED chip below says the rest.
            */}
            <AgentOrb
              gradient={agentGradient(agent.name)}
              identity={agent.name}
              size={ORB}
              face
              stage={hiring ? 'executing' : justHired ? 'filled' : undefined}
            />
            <Text variant="screenTitle" align="center" style={{ marginTop: space.s6 }}>
              {agent.name}
            </Text>
            <Text variant="secondarySm" color={colors.ink55} align="center">
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
            <Rise index={1} style={{ gap: space.s8 }}>
              <Button label={`Hire ${agent.name}`} onPress={hire} loading={hiring} />
              {hireError ? (
                <Text variant="secondarySm" color={colors.down} align="center">
                  {hireError}
                </Text>
              ) : null}
            </Rise>
          ) : null}

          {/*
            Its own wallet (2026-09-23). "Add funds" and "Withdraw" opened the owner's Deposit and Send screens — money
            in and out of the owner's account, labelled as if it were the agent's. On Solana each hired agent has an
            account of its own, owned by the owner, that it trades from alone.
          */}
          {isSolana && (agent.hired || agent.custom) ? (
            <Rise index={1}>
              <AgentWalletCard agentId={agent.id} name={agent.name} />
            </Rise>
          ) : !isSolana ? (
            <Rise index={1} style={{ flexDirection: 'row', gap: space.s10 }}>
              <View style={{ flex: 1 }}>
                <Button label="Add funds" variant={agent.hired ? 'primary' : 'ghost'} onPress={() => router.push('/deposit')} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Withdraw" variant="ghost" onPress={() => router.push('/send')} />
              </View>
            </Rise>
          ) : null}

          <Rise index={2} style={{ flexDirection: 'row', gap: space.s10 }}>
            <Stat label="30 days" value={money(agent.pnl30d)} tone={pnlTone(agent.pnl30d)} />
            {/* A share of trades: with none there is no rate, and "0%" read as every trade lost. */}
            <Stat label="Win rate" value={winRate(agent)} />
            <Stat label="Trades" value={String(agent.trades)} />
          </Rise>

          {isSolana && agent.hired && !agent.custom ? (
            <Rise index={2}>
              <LookNow agentId={agent.id} name={agent.name} />
            </Rise>
          ) : null}

          {agent.hired || agent.custom ? (
            <Rise index={3}>
              <AgentRulesCard agentId={agent.id} name={agent.name} policy={(agent.riskLimits ?? {}) as AgentPolicy} />
            </Rise>
          ) : null}

          <Rise index={3} style={{ borderRadius: radius.panel, backgroundColor: colors.surfaceAlt, padding: space.s16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="cardTitle">Strategies</Text>
              <Press
                onPress={() => router.push('/strategies')}
                accessibilityRole="button"
                accessibilityLabel="See all strategies"
                hitHeight={size.hit}
              >
                <Text variant="control" color={colors.ink55}>
                  See all
                </Text>
              </Press>
            </View>
            {strategies.loading && !strategies.data ? (
              <View style={{ marginTop: space.s12, gap: space.s10 }}>
                <Placeholder height={48} />
                <Placeholder height={48} />
              </View>
            ) : mine.length === 0 ? (
              <Text variant="body" color={colors.ink55} style={{ marginTop: space.s10 }}>
                {strategies.error ? 'Couldn’t load strategies.' : 'Nothing running yet.'}
              </Text>
            ) : (
              mine.map((s, i) => (
                <Row
                  key={s.id}
                  height={size.rowLg}
                  divider={i < mine.length - 1}
                  onPress={() => router.push(`/strategy/${s.id}`)}
                  title={s.label}
                  titleFigure={labelFigure(s.kind)}
                  // An exit spends nothing: "$0.00 a day" read as a strategy with no budget (2026-09-23), as on Strategies.
                  secondary={`${s.symbol} · ${s.kind === 'exit-rules' ? (isSolana ? 'checked every 30 seconds' : 'checked daily') : spendPhrase(money(s.dailyAllocationUsd), s.cadence)}`}
                  value={
                    <Text variant="secondarySm" color={s.state === 'live' ? colors.ink : colors.ink40}>
                      {STATE_LABEL[s.state] ?? s.state}
                    </Text>
                  }
                />
              ))
            )}
            {setup ? (
              <View style={{ marginTop: space.s14 }}>
                <Button label="Add strategy" variant="ghost" onPress={() => router.push(setup.route as never)} />
              </View>
            ) : (
              <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s14 }}>
                No strategy to add for {agent.name} yet.
              </Text>
            )}
          </Rise>
        </ScrollView>
      )}
    </Screen>
  );
}

/** `FBed…CW88` */
function shortAddress(a: string): string {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

/** The agent's own wallet: what it holds, where, whether the bot may spend it, and the two ways money moves. */
function AgentWalletCard({ agentId, name }: { agentId: string; name: string }) {
  const router = useRouter();
  const wallet = useAsync(() => system.agentWallet(agentId), [agentId]);
  useFreshOnReturn(wallet);
  const w = wallet.data;
  return (
    <View style={{ borderRadius: radius.panel, backgroundColor: colors.surfaceAlt, padding: space.s16 }} testID="agent-wallet-summary">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="cardTitle">Its wallet</Text>
        {w ? (
          <Text
            variant="footnote"
            color={colors.ink55}
            onPress={() => void Linking.openURL(w.explorer)}
            accessibilityRole="link"
          >
            {`${shortAddress(w.address)} ›`}
          </Text>
        ) : null}
      </View>
      {wallet.error ? (
        <Text variant="secondarySm" color={colors.down} style={{ marginTop: space.s8 }}>
          {errorText(wallet.error)}
        </Text>
      ) : !w ? (
        <Placeholder height={40} style={{ marginTop: space.s10 }} />
      ) : (
        <>
          <Price variant="cardTitleLg" figure="own" style={{ marginTop: space.s8 }}>
            {money(w.usdc)}
          </Price>
          <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s4 }}>
            {!w.exists || !w.inUse
              ? `Give ${name} money of its own to trade. It stays in your wallet, at its own address.`
              : w.approved
                ? `${name} trades from this alone. The chain stops it at what is here.`
                : 'The bot is not approved on it right now — fund it or resume in Safety.'}
          </Text>
        </>
      )}
      <View style={{ flexDirection: 'row', gap: space.s10, marginTop: space.s14 }}>
        <View style={{ flex: 1 }}>
          <Button label="Fund" onPress={() => router.push(`/agent/wallet?id=${encodeURIComponent(agentId)}&mode=fund`)} testID="agent-fund" />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="Withdraw"
            variant="ghost"
            disabled={!w || !(w.usdc > 0)}
            onPress={() => router.push(`/agent/wallet?id=${encodeURIComponent(agentId)}&mode=withdraw`)}
            testID="agent-withdraw"
          />
        </View>
      </View>
    </View>
  );
}

/**
 * Ask it to look now (2026-09-23): the sweep's own cycle for this agent alone, through every gate. What comes back is
 * either the fill — symbol, size, price, where it filled, the transaction — or the reason it took nothing.
 */
function LookNow({ agentId, name }: { agentId: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<AgentLookOutcome>();
  const [error, setError] = useState<string>();
  async function look() {
    setBusy(true);
    setError(undefined);
    setOut(undefined);
    try {
      setOut(await system.agentLook(agentId));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: space.s8 }}>
      <Button label={busy ? `${name} is looking` : `Ask ${name} to look now`} variant="ghost" loading={busy} onPress={() => void look()} testID="agent-look" />
      {out?.executed ? (
        <View style={{ borderRadius: radius.card, backgroundColor: colors.surfaceAlt, padding: space.s12, gap: space.s4 }} testID="agent-look-filled">
          <Text variant="rowPrimary">{`Bought ${quantity(out.units)} ${out.symbol} for ${money(out.usd)}`}</Text>
          <Text variant="secondarySm" color={colors.ink55}>
            {out.reason}
          </Text>
          <Text variant="footnote" color={colors.ink65} onPress={() => void Linking.openURL(out.explorer)} accessibilityRole="link">
            {`${out.venue === 'jupiter-route' ? 'Routed by Jupiter' : 'Filled from the venue vault'} · transaction ${out.signature.slice(0, 6)}… ›`}
          </Text>
        </View>
      ) : out ? (
        <Text variant="secondarySm" color={colors.ink55} align="center" testID="agent-look-held">
          {out.detail}
        </Text>
      ) : error ? (
        <Text variant="secondarySm" color={colors.down} align="center">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** The agent's rules, in words, and the door to change them. */
function AgentRulesCard({ agentId, name, policy }: { agentId: string; name: string; policy: AgentPolicy }) {
  const router = useRouter();
  const lines = [
    policy.maxUsdPerTrade ? `Up to $${policy.maxUsdPerTrade} a trade` : null,
    policy.maxUsdPerDay ? `Up to $${policy.maxUsdPerDay} a day` : null,
    policy.symbols?.length ? `Only ${policy.symbols.join(', ')}` : null,
    policy.allowOffHours === false ? 'Only while Nasdaq is open' : null,
    policy.maxLossPct ? `Stop no more than ${policy.maxLossPct}% under the fill` : null,
  ].filter((l): l is string => l !== null);
  return (
    <Press
      onPress={() => router.push(`/agent/policy?id=${encodeURIComponent(agentId)}`)}
      accessibilityRole="button"
      accessibilityLabel={`${name}'s rules`}
      style={{ borderRadius: radius.panel, backgroundColor: colors.surfaceAlt, padding: space.s16 }}
      testID="agent-rules-summary"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="cardTitle">Its rules</Text>
        <Text variant="control" color={colors.ink55}>
          Edit
        </Text>
      </View>
      <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s8 }}>
        {lines.length ? lines.join(' · ') : `No rules of its own yet — only your daily cap. Set what ${name} may trade, how much, and when.`}
      </Text>
    </Press>
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
      <Text variant="footnote" color={colors.ink55} style={{ marginTop: space.s4 }}>
        {label}
      </Text>
    </View>
  );
}
