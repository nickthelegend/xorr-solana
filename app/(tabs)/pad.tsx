/** Pad extends the approved app UI: existing type, tokens, buttons and approval cards. */
import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Button, ButtonRow, Screen, SheetCard, Text, border, colors, radius, space, typeScale } from '@/ui';
import { usePad } from '@/pad/usePad';
import { canAnswer, isReceipt, type Signal } from '@/pad/signals';

export default function Pad() {
  const pad = usePad();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(Date.now());
  const params = useLocalSearchParams<{ signal?: string }>();
  useEffect(() => { if (pad.url) setUrl(pad.url); }, [pad.url]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const signals = Object.values(pad.queue.signals).sort((a, b) => a.id === params.signal ? -1 : b.id === params.signal ? 1 : b.expiresAt - a.expiresAt);
  return <Screen tabBar>
    <Text variant="screenTitle">Pad</Text>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space.s16, paddingTop: space.s16, paddingBottom: space.s30 }}>
      <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
        <Text variant="rowPrimary">xorrpad</Text>
        <Text variant="secondary" color={colors.ink55}>Link · {pad.link.state}</Text>
        <Text variant="secondary" color={colors.ink55}>Firmware · {pad.link.firmware ?? 'Connect to read'}</Text>
        <Text variant="secondary" color={colors.ink55}>USB powered</Text>
        <Text variant="secondary" color={colors.ink55}>Relay · {pad.relay}</Text>
        <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s8 }}>Pair only with your trusted nearby pad.</Text>
      </SheetCard>
      {pad.link.error ? <Text variant="secondary" color={colors.down}>{pad.link.error}</Text> : null}
      <View>
        <Button label={pad.link.state === 'connected' ? 'Disconnect pad' : 'Pair pad'} loading={['scanning','connecting'].includes(pad.link.state)} onPress={pad.link.state === 'connected' ? pad.disconnect : pad.pair} />
      </View>
      <Text variant="cardTitle">Desk link</Text>
      <Text variant="secondary" color={colors.ink55}>{pad.desk === 'disconnected' && !pad.url ? 'Setup required: desk URL and pad token' : pad.desk}</Text>
      <Field label="Desk URL" value={url} onChangeText={setUrl} placeholder="https://your-desk.your-tailnet.ts.net" />
      <Field label="Pad token" value={token} onChangeText={setToken} placeholder={pad.url ? 'Stored securely · enter to replace' : 'Enter the desk pad token'} secure />
      <Button label="Save and connect desk" loading={saving} disabled={!url || !token} onPress={async () => { setSaving(true); try { await pad.save({ url, token }); setToken(''); } finally { setSaving(false); } }} />
      {pad.url ? <Button label="Forget desk" variant="ghost" onPress={async () => { await pad.forget(); setUrl(''); setToken(''); }} /> : null}
      {pad.error ? <Text variant="secondary" color={colors.down} accessibilityLiveRegion="polite">{pad.error}</Text> : null}
      <Text variant="cardTitle">Trade signals</Text>
      {!signals.length ? <Text variant="secondary" color={colors.ink55}>{pad.desk === 'connected' ? 'No trade signals from this desk.' : 'Connect your desk to read pending signals.'}</Text> : null}
      {signals.map(signal => <SignalCard key={signal.id} signal={signal} now={now} online={pad.desk === 'connected'} busy={!!pad.busy} signing={!!pad.queue.requests[signal.id]} selected={signal.id === params.signal} onAnswer={action => pad.answer(signal.id, action)} onSign={() => pad.sign(signal.id)} />)}
    </ScrollView>
  </Screen>;
}

function Field({ label, value, onChangeText, placeholder, secure }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; secure?: boolean }) {
  return <View style={{ gap: space.s8 }}>
    <Text variant="secondary">{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} secureTextEntry={secure} autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.ink55} style={[typeScale.body, border.input, { color: colors.ink, backgroundColor: colors.inputBg, borderRadius: radius.tile, padding: space.s14 }]} />
  </View>;
}

function detail(value: unknown): string {
  return value === undefined || value === null ? 'Setup required: desk quote details' : typeof value === 'object' ? JSON.stringify(value) : String(value);
}
function SignalCard({ signal, now, online, busy, signing, selected, onAnswer, onSign }: { signal: Signal; now: number; online: boolean; busy: boolean; signing: boolean; selected: boolean; onAnswer: (action: 'accept' | 'refuse') => Promise<void>; onSign: () => Promise<void> }) {
  const { proposal } = signal, best = proposal.routing?.best;
  const remaining = Math.max(0, Math.ceil((signal.expiresAt - now) / 1000));
  const receipt = isReceipt(signal.receipt) ? signal.receipt : undefined;
  return <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
    <View style={{ gap: space.s8 }}>
      <Text variant="rowPrimary">{proposal.signal.side} · {best?.market ?? proposal.signal.market ?? proposal.signal.symbol ?? 'Setup required: market'}</Text>
      <Text variant="secondary" color={colors.ink55}>{best?.venue ?? proposal.signal.venue ?? 'Setup required: venue'} · {signal.state}{selected ? ' · Selected signal' : ''}</Text>
      <Text variant="secondary">Size · ${proposal.verdict.sizeUsd}</Text>
      <Text variant="secondary">Quote · {detail(best?.price)}</Text>
      <Text variant="secondary">Fees · {detail(best?.fees)}</Text>
      <Text variant="secondary" color={colors.ink55}>{proposal.verdict.why.join(' · ') || 'Setup required: gate reason'}</Text>
      {signal.state === 'awaiting' ? <>
        <Text variant="secondarySm" color={colors.ink55}>{remaining ? `${remaining}s remaining` : 'Expired · waiting for desk state'}</Text>
        <ButtonRow secondary={<Button label="Refuse" variant="ghost" disabled={!canAnswer(signal, now) || !online || busy} onPress={() => onAnswer('refuse')} />} primary={<Button label="Accept" disabled={!canAnswer(signal, now) || !online || busy} onPress={() => onAnswer('accept')} />} />
      </> : null}
      {signing && signal.state === 'accepted' ? <Button label="Sign in phone wallet" disabled={!remaining || !online || busy} onPress={onSign} /> : null}
      {signal.error ? <Text variant="secondary" color={colors.down}>{signal.error}</Text> : null}
      {receipt ? <Button label="Open receipt" variant="ghost" onPress={() => Linking.openURL(receipt.explorer)} /> : null}
    </View>
  </SheetCard>;
}
