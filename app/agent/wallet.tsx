/**
 * Fund an agent's wallet, or take money back from it (2026-09-23).
 *
 * The wallet is a USDC account the owner owns at its own address (`src/wallet/agentWallet.ts`), so this screen says
 * exactly that before anyone signs: where the money goes, who can move it, and how much the bot may spend from it —
 * all of it and nothing more. Both directions are one transaction the owner signs; the executor reads the result off
 * the chain before the trail records a cent.
 */
import React, { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  ErrorState,
  Fill,
  HeaderBar,
  Keypad,
  NoteStrip,
  Pill,
  Placeholder,
  Price,
  Screen,
  Segmented,
  SheetCard,
  Text,
  colors,
  money,
  radius,
  space,
} from '@/ui';
import { useAsync } from '@/data/useAsync';
import { system, type AgentWalletView } from '@/data/system';
import { walletTokens } from '@/data/walletTokens';
import { keypadPress } from '@/state/derived';
import { useAgentWallet } from '@/agents/useAgentWallet';
import { humanWalletError } from '@/wallet/walletError';
import { errorText } from '@/data/apiError';

const MODES = [
  { value: 'fund', label: 'Fund' },
  { value: 'withdraw', label: 'Withdraw' },
] as const;
type Mode = (typeof MODES)[number]['value'];

const QUICK = [25, 50, 100] as const;

/** `FBed…CW88` */
function short(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export default function AgentWalletScreen() {
  const goBack = useGoBack();
  const { id = '', mode: asked } = useLocalSearchParams<{ id: string; mode?: string }>();
  const [mode, setMode] = useState<Mode>(asked === 'withdraw' ? 'withdraw' : 'fund');
  const [amount, setAmount] = useState('');
  const [done, setDone] = useState<AgentWalletView>();
  const [failure, setFailure] = useState<string>();

  const wallet = useAsync(() => system.agentWallet(id), [id]);
  const main = useAsync(() => walletTokens(), [done]);
  const { run, busy, ready } = useAgentWallet();

  const view = done ?? wallet.data;
  const mainUsdc = main.data?.tokens.find((t) => t.symbol === 'USDC')?.units ?? 0;
  const usd = parseFloat(amount || '0') || 0;
  const available = mode === 'fund' ? mainUsdc : (view?.usdc ?? 0);
  const tooMuch = usd > available + 1e-9;

  async function submit() {
    if (!view || !(usd > 0) || tooMuch || busy) return;
    setFailure(undefined);
    try {
      const after = await run(mode, view, usd);
      setDone(after);
      setAmount('');
      wallet.reload();
    } catch (e) {
      // A wallet refusal in the wallet's words; an executor refusal in the executor's.
      const text = humanWalletError(e);
      setFailure(text || errorText(e));
    }
  }

  const name = view?.name ?? 'This agent';

  return (
    <Screen gutter="none" testID="agent-wallet">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">{`${name}'s wallet`}</Text>} />
      </View>

      {wallet.error ? (
        <View style={{ paddingHorizontal: space.gutter }}>
          <ErrorState error={wallet.error} onRetry={wallet.reload} />
        </View>
      ) : !view ? (
        <View style={{ paddingHorizontal: space.gutter, gap: space.s12, marginTop: space.s12 }}>
          <Placeholder height={120} />
          <Placeholder height={48} />
        </View>
      ) : (
        <Fill>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.s16, gap: space.s14 }}
          >
            <SheetCard bordered borderRadius={radius.panel} padding={space.s16} testID="agent-wallet-card">
              <Text variant="footnote" color={colors.ink55}>
                {`IN ${name.toUpperCase()}'S WALLET`}
              </Text>
              <Price variant="heroAmount" style={{ marginTop: space.s6 }} figure="own">
                {money(view.usdc)}
              </Price>
              <Text
                variant="footnote"
                color={colors.ink65}
                style={{ marginTop: space.s6 }}
                onPress={() => void Linking.openURL(view.explorer)}
                accessibilityRole="link"
              >
                {`${short(view.address)} · yours, at its own address ›`}
              </Text>
              <Text variant="footnote" color={colors.ink55} style={{ marginTop: space.s4 }}>
                {view.exists
                  ? view.approved
                    ? 'The bot may spend what is here, and nothing more.'
                    : 'The bot is not approved on it right now. Funding approves it again.'
                  : 'Not created yet. Funding creates it, in your wallet.'}
              </Text>
            </SheetCard>

            <Segmented options={MODES} value={mode} onChange={(m) => { setMode(m); setAmount(''); setFailure(undefined); }} />

            <View style={{ alignItems: 'center', gap: space.s6 }}>
              <Price variant="heroAmount" figure="input">
                ${amount || '0'}
              </Price>
              <Text variant="secondarySm" color={tooMuch ? colors.down : colors.ink55}>
                {mode === 'fund'
                  ? `From your main account · ${money(mainUsdc)} there`
                  : `Back to your main account · ${money(view.usdc)} in ${name}'s wallet`}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: space.s8, justifyContent: 'center' }}>
              {QUICK.map((q) => (
                <Pill key={q} label={`$${q}`} onPress={() => setAmount(String(q))} />
              ))}
              <Pill label="All" onPress={() => setAmount(String(Math.floor(available * 100) / 100))} testID="agent-wallet-all" />
            </View>

            {done?.signature ? (
              <NoteStrip kind="acted">
                {`${done.delta !== undefined && done.delta > 0 ? `Funded with ${money(done.delta)}` : done.delta !== undefined && done.delta < 0 ? `${money(-done.delta)} back in your main account` : 'Approved'} · transaction ${done.signature.slice(0, 6)}…`}
              </NoteStrip>
            ) : null}
            {failure ? (
              <Text variant="secondarySm" color={colors.down} align="center">
                {failure}
              </Text>
            ) : null}

            <NoteStrip kind="risk">
              {mode === 'fund'
                ? `${name} trades from this wallet alone: its buys spend what is here, its sales pay back into it, and the chain stops it at what it holds. Stop all trading in Safety revokes it with everything else.`
                : `Only you can move money out of ${name}'s wallet. What you take back is yours to spend or send at once.`}
            </NoteStrip>
          </ScrollView>

          <View style={{ paddingHorizontal: space.gutter, gap: space.s10 }}>
            <Keypad onPress={(k) => setAmount((cur) => keypadPress(cur, k, { decimals: 2 }))} />
            <Button
              label={
                busy
                  ? mode === 'fund'
                    ? 'Funding'
                    : 'Withdrawing'
                  : mode === 'fund'
                    ? `Fund ${name} with ${money(usd)}`
                    : `Withdraw ${money(usd)}`
              }
              loading={busy}
              disabled={!ready || !(usd > 0) || tooMuch}
              onPress={() => void submit()}
              testID="agent-wallet-submit"
            />
          </View>
        </Fill>
      )}
    </Screen>
  );
}
