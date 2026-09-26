/**
 * Return funds (2026-09-26): everything in this wallet, back to the wallet that funded it.
 *
 * A helper, not a button. It finds where the money came from — the oldest transaction that brought SOL or USDC into
 * this wallet from another wallet, read off the chain by `GET /wallet/funded-by` — says what is here, and lays out the
 * steps in the order they have to happen: sell the stocks into USDC, send the USDC, send the SOL last (it pays the fees
 * for everything before it). Each step is a link to the screen that does it. The owner taps every sale and every send
 * themselves, on those screens, with their own signature; nothing here moves anything.
 *
 * The destination still has to be on the allowlist and past its cooling-off before Send will use it — the same gate as
 * every other withdrawal — so the first thing this screen offers is adding it.
 *
 * Every step's state is the wallet's balances, read again whenever this screen comes back into view.
 */
import React, { useCallback, useRef, useState } from 'react';
import { Linking, ScrollView, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { PublicKey } from '@solana/web3.js';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  ErrorState,
  Eyebrow,
  HeaderBar,
  LoadingRows,
  NoteStrip,
  Press,
  Price,
  Row,
  Screen,
  SignInPrompt,
  Tag,
  Text,
  border,
  colors,
  money,
  quantity,
  radius,
  size,
  space,
  typeScale,
} from '@/ui';
import { day, shortAddress } from '@/format';
import { useSignedOut } from '@/auth/useSignedOut';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useFreshOnReturn } from '@/data/useFreshOnReturn';
import { errorText } from '@/data/apiError';
import { walletTokens, type WalletToken } from '@/data/walletTokens';
import { withdrawals } from '@/data/withdrawals';
import { useStore } from '@/state/store';
import { delegationOrUnknown, delegationScope } from '@/accounts/delegationScope';
import { isSolanaAddress, sameAddress, useAllowlist, usableFromText } from '@/wallet/allowlist';
import { SOL_FEE_RESERVE } from '@/wallet/useWithdraw';

/** Below this much SOL, what a send would move is not worth the fee and the reserve it leaves. */
const SOL_WORTH_SENDING = 0.003;
const FIELD_H = 48;
const SELL_W = 92;

/** A typed address, when it is a real Solana public key. */
function validKey(text: string): string | undefined {
  const t = text.trim();
  if (!isSolanaAddress(t)) return undefined;
  try {
    return new PublicKey(t).toBase58();
  } catch {
    return undefined;
  }
}

/** Rounded DOWN at `digits`, so an amount handed to Send is never a hair more than is held. */
function floorTo(n: number, digits: number): string {
  const f = 10 ** digits;
  return (Math.floor(n * f) / f).toFixed(digits).replace(/\.?0+$/, '');
}

function StepHead({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8, marginTop: space.s22 }}>
      <Text variant="secondary" style={{ flex: 1 }}>
        {n}. {title}
      </Text>
      <Tag label={done ? 'Done ✓' : 'To do'} tone={done ? 'up' : 'neutral'} small />
    </View>
  );
}

export default function ReturnFunds() {
  const goBack = useGoBack();
  const router = useRouter();
  const signedOut = useSignedOut();
  const owner = useStore((s) => s.wallet?.address);

  const funder = useAsync(() => (owner ? withdrawals.fundedBy() : Promise.resolve(undefined)), [owner]);
  const tokens = useAsync(() => (owner ? walletTokens() : Promise.resolve(undefined)), [owner]);
  const permission = useAsync(() => repos.wallet.delegation(), [owner]);
  const allowlist = useAllowlist();
  useFreshOnReturn(tokens, permission);
  // The allowlist too: an address added on the Allowlist screen should read as added on the way back.
  const firstFocus = useRef(true);
  const reloadList = allowlist.reload;
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) firstFocus.current = false;
      else reloadList();
    }, [reloadList]),
  );

  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string>();

  const found = funder.data?.address ? funder.data : undefined;
  const custom = typing ? validKey(typed) : undefined;
  const destination = typing ? custom : found?.address;
  const toSelf = Boolean(destination && owner && sameAddress(destination, owner));

  const listed = destination ? allowlist.addresses.find((a) => sameAddress(a.address, destination)) : undefined;

  // What is here: USDC, SOL, and every stock token (xStocks and T-Tokens alike) the wallet's own accounts hold.
  const all = tokens.data?.tokens ?? [];
  const usdc = all.find((t) => t.symbol === 'USDC' && !t.native)?.units ?? 0;
  const sol = all.find((t) => t.native)?.units ?? 0;
  const stocks: WalletToken[] = all.filter((t) => !t.native && t.symbol !== 'USDC' && t.units > 0);
  const solUsd = all.find((t) => t.native)?.usd ?? null;
  const totalUsd = all.reduce((sum, t) => sum + (t.usd ?? 0), 0);

  const solToSend = sol - SOL_FEE_RESERVE;
  const solWorthIt = sol >= SOL_WORTH_SENDING;

  /*
   * Stopped when revoked — or never granted, which leaves nothing to trade with. The chain's answer, with the store's
   * copy (the one Safety keeps) standing in until it arrives; `undefined` is "not read yet", never a claim.
   */
  const stored = delegationOrUnknown(
    delegationScope({
      cached: useStore((s) => s.delegation),
      cachedFor: useStore((s) => s.delegationAddress),
      active: owner,
    }),
  );
  const grant = permission.data !== undefined ? permission.data : stored;
  const tradingStopped = grant === null || grant?.revoked === true;

  async function addToAllowlist() {
    if (!destination || adding) return;
    setAdding(true);
    setAddError(undefined);
    try {
      await allowlist.add('Return address', destination);
    } catch (e) {
      setAddError(errorText(e));
    } finally {
      setAdding(false);
    }
  }

  function send(asset: 'USDC' | 'SOL', amount: string) {
    if (!destination) return;
    router.push({ pathname: '/send', params: { to: destination, asset, amount } } as never);
  }

  const header = <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Return funds</Text>} />;

  if (signedOut) {
    return (
      <Screen>
        {header}
        <SignInPrompt text="Sign in to return funds." />
      </Screen>
    );
  }

  const canSend = Boolean(destination) && !toSelf && listed?.usable === true;

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        {header}
        <Text variant="secondary" color={colors.ink55} style={{ marginTop: space.s8 }}>
          Everything in this wallet, back to the wallet that funded it. You tap every sale and every send yourself —
          nothing here moves money on its own.
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.s30 }}
      >
        {/* ── Where it goes back to ─────────────────────────────────────────── */}
        <Eyebrow small style={{ marginTop: space.s22 }}>
          Sending back to
        </Eyebrow>
        <View style={{ marginTop: space.s10 }}>
          {typing ? null : funder.error ? (
            <ErrorState error={funder.error} onRetry={funder.reload} />
          ) : funder.loading && !funder.data ? (
            <LoadingRows count={1} height={size.rowLg} />
          ) : found ? (
            <View style={{ gap: space.s6 }}>
              <Text variant="secondary">{shortAddress(found.address, 4, 4)}</Text>
              {/* The funding transaction itself, on Solscan, so the claim can be checked rather than taken. */}
              <Press
                onPress={() => void Linking.openURL(`https://solscan.io/tx/${found.signature}`)}
                accessibilityRole="link"
                accessibilityLabel="Open the funding transaction on Solscan"
              >
                <Text variant="secondarySm" color={colors.ink55}>
                  it funded this wallet{found.at !== null ? ` on ${day(found.at)}` : ''} with{' '}
                  {found.asset === 'USDC' ? `${quantity(found.amount, 2)} USDC` : `${quantity(found.amount)} SOL`} (tx{' '}
                  {found.signature.slice(0, 4)}…) ›
                </Text>
              </Press>
            </View>
          ) : (
            <Text variant="secondary" color={colors.ink55}>
              Nothing in this wallet’s history shows where it was funded from. Enter the address to send it back to.
            </Text>
          )}

          {typing || (!funder.loading && !funder.error && !found) ? (
            <View style={{ marginTop: typing ? 0 : space.s12 }}>
              <View
                style={{
                  height: FIELD_H,
                  borderRadius: radius.card,
                  ...border.input,
                  backgroundColor: colors.surfaceAlt,
                  justifyContent: 'center',
                  paddingHorizontal: space.s14,
                }}
              >
                <TextInput
                  value={typed}
                  onChangeText={(t) => {
                    setTyping(true);
                    setTyped(t);
                  }}
                  placeholder="Solana address"
                  placeholderTextColor={colors.ink30}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Address to send back to"
                  style={[typeScale.secondary, { color: colors.ink, padding: 0 }]}
                />
              </View>
              {typed.trim() && !custom ? (
                <Text variant="footnote" color={colors.down} style={{ marginTop: space.s6 }}>
                  That is not a Solana address.
                </Text>
              ) : null}
            </View>
          ) : null}

          {found ? (
            <Press
              onPress={() => {
                setTyping((t) => !t);
                setTyped('');
              }}
              accessibilityRole="button"
              style={{ marginTop: space.s12 }}
            >
              <Text variant="footnote" color={colors.ink55}>
                {typing ? `Use ${shortAddress(found.address, 4, 4)} instead ›` : 'Use a different address ›'}
              </Text>
            </Press>
          ) : null}

          {/* The allowlist gate: Send will only use an address that is on it and past its cooling-off. */}
          {destination ? (
            <View style={{ marginTop: space.s14, gap: space.s8 }}>
              {toSelf ? (
                <Text variant="secondarySm" color={colors.down}>
                  That is this wallet’s own address.
                </Text>
              ) : allowlist.loading ? (
                <Text variant="secondarySm" color={colors.ink55}>
                  Checking your allowlist…
                </Text>
              ) : listed?.usable ? (
                <Text variant="secondarySm" color={colors.up}>
                  On your allowlist ✓
                </Text>
              ) : listed ? (
                <Text variant="secondarySm" color={colors.ink55}>
                  On your allowlist, cooling off — usable from {usableFromText(listed)}.
                </Text>
              ) : (
                <>
                  <Text variant="secondarySm" color={colors.ink55}>
                    Not on your allowlist yet. Send only goes to allowlisted addresses
                    {allowlist.coolingOffHours !== undefined
                      ? `, after a ${allowlist.coolingOffHours}-hour cooling-off.`
                      : ', after a cooling-off.'}
                  </Text>
                  <Button
                    label={adding ? 'Adding…' : 'Add to allowlist'}
                    variant="ghost"
                    loading={adding}
                    onPress={() => void addToAllowlist()}
                  />
                  {addError ? (
                    <Text variant="footnote" color={colors.down}>
                      {addError}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          ) : null}
        </View>

        {/* ── What's in the wallet ─────────────────────────────────────────── */}
        <Eyebrow small style={{ marginTop: space.s26 }}>
          In this wallet
        </Eyebrow>
        {tokens.error && !tokens.data ? (
          <ErrorState error={tokens.error} onRetry={tokens.reload} />
        ) : tokens.loading && !tokens.data ? (
          <LoadingRows count={3} height={size.rowLg} />
        ) : (
          <View style={{ marginTop: space.s6 }}>
            <Price variant="screenTitle">{money(totalUsd)}</Price>
            <Row title="USDC" secondary={`${quantity(usdc, 2)} USDC`} value={money(usdc)} divider />
            <Row
              title="SOL"
              secondary={`${quantity(sol)} SOL`}
              value={solUsd !== null ? money(solUsd) : '—'}
              divider={stocks.length > 0}
            />
            {stocks.map((t, i) => (
              <Row
                key={t.address}
                title={t.symbol}
                secondary={`${quantity(t.units)} ${t.symbol}`}
                value={t.usd !== null ? money(t.usd) : '—'}
                divider={i < stocks.length - 1}
              />
            ))}
          </View>
        )}

        {/* ── Steps ─────────────────────────────────────────────────────────── */}
        <Eyebrow small style={{ marginTop: space.s26 }}>
          Steps
        </Eyebrow>
        {tokens.data ? (
          <>
            <StepHead n={1} title="Sell your stocks back to USDC" done={stocks.length === 0} />
            {stocks.length === 0 ? (
              <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s6 }}>
                No stocks held.
              </Text>
            ) : (
              stocks.map((t) => (
                <Row
                  key={t.address}
                  title={t.symbol}
                  secondary={`${quantity(t.units)} · ${t.usd !== null ? money(t.usd) : 'unpriced'}`}
                  right={
                    <View style={{ width: SELL_W }}>
                      <Button
                        label="Sell all"
                        variant="ghost"
                        height={size.pillH}
                        onPress={() =>
                          router.push({
                            pathname: '/xstock/[symbol]',
                            params: { symbol: t.symbol, side: 'sell' },
                          } as never)
                        }
                      />
                    </View>
                  }
                />
              ))
            )}

            <StepHead n={2} title="Send your USDC" done={usdc === 0} />
            {usdc > 0 ? (
              <View style={{ marginTop: space.s8, gap: space.s6 }}>
                {stocks.length > 0 ? (
                  <Text variant="secondarySm" color={colors.ink55}>
                    Sell your stocks first, so their USDC goes too.
                  </Text>
                ) : null}
                <Button
                  label={`Send ${quantity(usdc, 2)} USDC`}
                  variant="ghost"
                  disabled={!canSend}
                  onPress={() => send('USDC', floorTo(usdc, 6))}
                />
              </View>
            ) : (
              <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s6 }}>
                No USDC left.
              </Text>
            )}

            <StepHead n={3} title="Send your SOL" done={!solWorthIt} />
            {solWorthIt ? (
              <View style={{ marginTop: space.s8, gap: space.s6 }}>
                <Text variant="secondarySm" color={colors.ink55}>
                  Last, because it pays the fees for the steps above. {SOL_FEE_RESERVE} SOL stays behind for this send’s
                  own fee.
                </Text>
                <Button
                  label={`Send ${floorTo(solToSend, 6)} SOL`}
                  variant="ghost"
                  disabled={!canSend}
                  onPress={() => send('SOL', floorTo(solToSend, 6))}
                />
              </View>
            ) : (
              <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s6 }}>
                {sol > 0 ? 'Too little SOL left to be worth sending.' : 'No SOL left.'}
              </Text>
            )}

            {!canSend && destination && !toSelf && (usdc > 0 || solWorthIt) ? (
              <Text variant="footnote" color={colors.ink55} style={{ marginTop: space.s12 }}>
                The send buttons open once the address is usable on your allowlist.
              </Text>
            ) : null}
          </>
        ) : (
          <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s6 }}>
            The steps appear once the wallet’s balances are read.
          </Text>
        )}

        {/* ── Trading ───────────────────────────────────────────────────────── */}
        <View style={{ marginTop: space.s26, gap: space.s10 }}>
          {grant === undefined ? null : tradingStopped ? (
            <NoteStrip kind="acted">Trading is stopped. No agent can trade from this wallet.</NoteStrip>
          ) : (
            <>
              <NoteStrip kind="risk">
                Agents can still trade from this wallet. Stop them first so nothing buys back in while you empty it.
              </NoteStrip>
              <Button label="Open Safety" variant="ghost" onPress={() => router.push('/safety')} />
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
