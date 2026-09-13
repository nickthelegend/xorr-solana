/**
 * Send / withdraw — PLAN.md 10.6 [G14].
 *
 * PLAN.md §3.4: withdrawals may go ONLY to a user-allowlisted destination. This screen cannot
 * enter a free-form address on purpose — that constraint is the product, not a limitation.
 *
 * It used to say withdrawals were "not enabled in this build", for two reasons, one of which was
 * wrong: that the executor has no transfer-out path (true, and deliberate — an executor that can
 * move funds out is a custodian) and that "the wallet is a devnet wallet whose key the executor
 * holds" (false since the Privy pivot, and the opposite of the product's central claim).
 *
 * The withdrawal was never the executor's to make. The owner signs it with their own embedded
 * wallet, the same way they sign the grant. Since PLAN.md 4.9 the list is the executor's: only the
 * addresses its clock says are usable can be chosen here, a pending one says when it will be, and
 * `useWithdraw` asks the executor again immediately before a signature is requested.
 */
import React, { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  BackButton,
  Button,
  Eyebrow,
  Fill,
  NoteStrip,
  Pill,
  Price,
  RadioCard,
  Screen,
  Text,
  border,
  colors,
  money,
  quantity,
  radius,
  space,
  typeScale,
} from '@/ui';
import { useAllowlist, usableFromText, usableIn } from '@/wallet/allowlist';
import { useWithdraw } from '@/wallet/useWithdraw';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useDebounced } from '@/data/useDebounced';
import { usePrice } from '@/data/usePrices';
import { system } from '@/data/system';
import { swapSpendable } from '@/state/derived';
import { transferCall } from '@/wallet/transfer';
import { useGrantDelegation } from '@/auth/useGrantDelegation';
import { formatEther, type Address } from 'viem';
import { MINUS, shortAddress } from '@/format';
import { userSigningNote, userSigningWorks } from '@/chain';

const FIELD_H = 52;

export default function Send() {
  const router = useRouter();
  const goBack = useGoBack();
  const {
    addresses,
    usable,
    pending,
    serverTime,
    loading: listLoading,
    error: listError,
  } = useAllowlist();
  const [chosen, setChosen] = useState<string>();
  const [amount, setAmount] = useState('');
  const { withdraw, busy, error, txHash } = useWithdraw();

  const balance = useAsync(() => repos.portfolio.balance(), []);
  /*
   * What can be sent (PLAN.md 3.11): the tokens this chain knows, at this chain's own addresses and decimals — asked,
   * never assumed. Send moved only USDC, with six decimals written into the hook. Native ETH is left out: this sends
   * ERC-20 transfers.
   */
  const listed = useAsync(() => system.watchable(), []);
  const [symbol, setSymbol] = useState('USDC');
  const sendable = (listed.data ?? []).filter((t) => t.symbol !== 'ETH');
  const token = sendable.find((t) => t.symbol === symbol);

  // Cash for USDC and the chain's holding for anything else; undefined while it is unknown, never a zero.
  const held = swapSpendable(balance.data, symbol);
  /*
   * Only a usable address can be the destination. Chosen by address, not by position, so a list read
   * again — an address that became usable, or one removed elsewhere — cannot move the selection onto
   * a different card.
   */
  const entry = usable.find((a) => a.address === chosen) ?? usable[0];
  const typed = Number(amount);
  const overBalance = held !== undefined && typed > held;

  const problem = useMemo(() => {
    if (listLoading) return undefined;
    if (listError && addresses.length === 0) return 'Your allowlist could not be read, so there is nowhere to send to yet.';
    if (addresses.length === 0) return 'Add a destination to your allowlist first.';
    if (usable.length === 0) return 'None of your addresses is usable yet.';
    if (!entry) return 'Choose a destination.';
    if (!amount) return undefined;
    if (!(typed > 0)) return 'Enter an amount above zero.';
    if (overBalance) return `That is more ${symbol} than you hold.`;
    return undefined;
  }, [listLoading, listError, addresses.length, usable.length, entry, amount, typed, overBalance, symbol]);

  /*
   * What the send costs you in gas (PLAN.md 3.13), asked of your own wallet, which pays it — nothing here goes
   * through the executor. Estimated for the transfer as built, once typing settles.
   */
  const { estimateFee } = useGrantDelegation();
  const settledAmount = useDebounced(amount);
  const feeFor =
    userSigningWorks && token && entry && Number(settledAmount) > 0
      ? `${token.address}:${entry.address}:${settledAmount}`
      : '';
  const fee = useAsync(async () => {
    if (!feeFor || !token || !entry) return undefined;
    let call: ReturnType<typeof transferCall>;
    try {
      call = transferCall(token, entry.address as Address, settledAmount);
    } catch {
      return undefined;
    }
    return estimateFee(call.to, call.data);
  }, [feeFor]);
  const { quote: ethPrice } = usePrice('WETH');
  const feeUsd =
    fee.data && ethPrice?.price !== undefined
      ? Number(formatEther(fee.data.gas * fee.data.gasPrice)) * ethPrice.price
      : undefined;

  const ready = userSigningWorks && Boolean(entry) && typed > 0 && !overBalance && Boolean(token);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <BackButton onPress={() => goBack()} />
        <Text variant="screenTitle">Send</Text>
      </View>

      <Text variant="secondary" style={{ marginTop: space.s10 }}>
        Funds can only leave to an address you have already allowlisted. That is what stops a
        compromised phone from draining the wallet.
      </Text>

      <Fill style={{ marginTop: space.s22 }}>
        <Eyebrow small>Destination</Eyebrow>
        <View style={{ gap: space.s10, marginTop: space.s12 }}>
          {listLoading ? (
            <Text variant="secondary" color={colors.ink40}>
              Reading your allowlist…
            </Text>
          ) : listError && addresses.length === 0 ? (
            // A list that could not be read is not an empty list, and must not look like one.
            <Text variant="secondary" color={colors.down}>
              Could not read your allowlist.
            </Text>
          ) : addresses.length === 0 ? (
            <Text variant="secondary" color={colors.ink40}>
              Nothing on your allowlist yet.
            </Text>
          ) : (
            <>
              {usable.map((a) => (
                <RadioCard
                  key={a.address}
                  title={a.label}
                  detail={a.address}
                  selected={a.address === entry?.address}
                  onPress={() => setChosen(a.address)}
                  showRadio={false}
                />
              ))}
              {/* Pending addresses are shown, and cannot be chosen: when each becomes usable is the executor's answer. */}
              {pending.map((a) => (
                <Text key={a.address} variant="secondarySm" color={colors.ink40}>
                  {a.label} · {shortAddress(a.address)} — usable from {usableFromText(a)}
                  {serverTime !== undefined ? `, ${usableIn(a, serverTime)}` : ''}
                </Text>
              ))}
            </>
          )}
        </View>

        <View style={{ marginTop: space.s22 }}>
          <Eyebrow small>Asset</Eyebrow>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s8, marginTop: space.s10 }}>
            {sendable.map((t) => (
              <Pill
                key={t.symbol}
                label={t.symbol}
                selected={t.symbol === symbol}
                onPress={() => {
                  setSymbol(t.symbol);
                  // An amount of one token is not an amount of another.
                  setAmount('');
                }}
              />
            ))}
          </View>
        </View>

        <View style={{ marginTop: space.s22 }}>
          <Eyebrow small>Amount</Eyebrow>
          <View
            style={{
              height: FIELD_H,
              borderRadius: radius.card,
              ...border.input,
              backgroundColor: colors.surfaceAlt,
              justifyContent: 'center',
              paddingHorizontal: space.s14,
              marginTop: space.s10,
            }}
          >
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.ink30}
              keyboardType="decimal-pad"
              inputMode="decimal"
              accessibilityLabel={`Amount in ${symbol}`}
              style={[typeScale.amountMd, { color: colors.ink, padding: 0 }]}
            />
          </View>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginTop: space.s8,
            }}
          >
            <Text variant="footnote" color={colors.ink40}>
              You hold
            </Text>
            {/*
              A dash, never a confident $0.00, when the balance could not be read — and never a
              dash for one that simply has not arrived yet. `?? null` collapsed those two into the
              same glyph, and against this executor "not yet" lasts long enough to read as "we
              could not": measured at twenty-five seconds on the simulator before $24,207.43
              appeared where a dash had been.
            */}
            <Price variant="footnote">
              {held !== undefined ? `${quantity(held)} ${symbol}` : balance.loading ? '· · ·' : '—'}
            </Price>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.s6 }}>
            <Text variant="footnote" color={colors.ink40}>
              Network fee, paid from your ETH
            </Text>
            <Price variant="footnote">
              {feeUsd !== undefined ? `≈ ${money(feeUsd)}` : fee.loading ? '· · ·' : MINUS}
            </Price>
          </View>
        </View>

        <NoteStrip kind="risk" style={{ marginTop: space.s16 }}>
          A new address takes effect after a cooling-off period, counted by the executor. Adding one
          now does not let you send to it today.
        </NoteStrip>

        {/* Said before the button is pressed, not by a revert afterwards. See src/chain.ts. */}
        {userSigningWorks ? null : (
          <NoteStrip kind="blocked" style={{ marginTop: space.s10 }}>
            {userSigningNote}
          </NoteStrip>
        )}

        {problem ? (
          <Text variant="secondary" color={colors.down} style={{ marginTop: space.s12 }}>
            {problem}
          </Text>
        ) : null}
        {error ? (
          <Text variant="secondary" color={colors.down} style={{ marginTop: space.s12 }}>
            {error}
          </Text>
        ) : null}
        {txHash ? (
          <NoteStrip kind="acted" style={{ marginTop: space.s12 }}>
            Sent. {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </NoteStrip>
        ) : null}
      </Fill>

      <Button
        label="Manage allowlist"
        variant="ghost"
        onPress={() => router.push('/allowlist')}
        style={{ marginBottom: space.s10 }}
      />
      <Button
        label="Withdraw everything"
        variant="ghost"
        onPress={() => router.push('/withdraw-everything')}
        style={{ marginBottom: space.s10 }}
      />
      <Button
        label={busy ? 'Signing…' : 'Send'}
        disabled={!ready || busy}
        onPress={() => {
          if (!token) return;
          void withdraw({ token, entry, allowlist: usable, amount }).catch(() => undefined);
        }}
      />
      <Text
        variant="footnote"
        color={colors.ink28}
        align="center"
        style={{ marginTop: space.s12 }}
      >
        You sign this yourself. The bot has no power to move funds off this wallet.
      </Text>
    </Screen>
  );
}
