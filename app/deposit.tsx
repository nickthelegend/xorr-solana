/**
 * Deposit — money in (PLAN.md 4.5).
 *
 * Portfolio's "Deposit" and an agent's "Add funds" opened the onboarding funding step: a progress bar, preset amounts that
 * deposit nothing, and "Continue — set the limits", a step of sign-up reached from a wallet that finished it long ago. And a
 * new wallet had no USDC and no way inside the app to get any.
 *
 * This screen is the one thing that funds a non-custodial wallet: USDC arriving at its address. The address, copyable; a
 * code for a phone to scan, where the code is true; what the wallet holds, read from the chain every few seconds while the
 * screen is open, so a deposit is seen landing; and the faucet where this deployment has one, with what it sent and in
 * which transaction — or the executor's own sentence for why it sent nothing.
 *
 * No code on a fork build (`depositQrWorks`). A fork of Base shares Base's chain id, so the code would open a phone wallet
 * on real Base, where a transfer is real money sent to an address this build never reads. The address is shown, and why.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  ErrorState,
  Eyebrow,
  Fill,
  HeaderBar,
  LoadingRows,
  Placeholder,
  Price,
  Row,
  Screen,
  SheetCard,
  Text,
  colors,
  quantity,
  radius,
  size,
  space,
} from '@/ui';
import { AddressQR } from '@/ui/AddressQR';
import { shortAddress } from '@/format';
import { activeChain, chainLabel, depositQrNote, depositQrWorks } from '@/chain';
import { useStore } from '@/state/store';
import { useAsync } from '@/data/useAsync';
import { usePoll } from '@/data/usePoll';
import type { PollState } from '@/data/pollState';
import { errorText } from '@/data/apiError';
import { faucetStatus, requestFaucet, walletFunds, type FaucetOutcome, type WalletFunds } from '@/data/deposit';

/** Often enough to see a deposit land while you wait for it. Each read is two balance calls against the executor's node. */
const POLL_MS = 5_000;
const QR_SIZE = 168;

export default function Deposit() {
  const goBack = useGoBack();
  const address = useStore((s) => s.wallet)?.address;
  const funds = usePoll(walletFunds, POLL_MS);
  const faucet = useAsync(() => faucetStatus(), []);
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  const [outcome, setOutcome] = useState<FaucetOutcome>();

  async function copy() {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setCopied(true);
  }

  async function ask() {
    if (asking) return;
    setAsking(true);
    try {
      const result = await requestFaucet();
      setOutcome(result);
      // The balances changed on chain; read them now rather than at the next tick.
      if (result.status === 'sent') void funds.refresh();
    } catch (e) {
      setOutcome({ status: 'failed', error: errorText(e) });
    } finally {
      setAsking(false);
      // Whether this wallet may ask again changed with the answer, whatever it was: read it rather than guess it.
      faucet.reload();
    }
  }

  const status = faucet.data;

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Deposit</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          {`Send USDC on ${chainLabel} to your address. It is what the bot trades with, and it stays in your wallet.`}
        </Text>
      </View>

      <Fill style={{ marginTop: space.s16 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.s30, gap: space.s22 }}
        >
          <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
            <Eyebrow small>{`Your address on ${chainLabel}`}</Eyebrow>
            {address && depositQrWorks ? (
              <View style={{ alignItems: 'center', paddingVertical: space.s12 }}>
                <AddressQR value={`ethereum:${address}@${activeChain.id}`} size={QR_SIZE} />
              </View>
            ) : null}
            {/* In full and selectable rather than shortened: it is going to be pasted somewhere. */}
            <Text variant="body" selectable style={{ marginTop: space.s8 }}>
              {address ?? 'Finish signing in to see your address.'}
            </Text>
            {address ? (
              <Button
                label={copied ? 'Copied' : 'Copy address'}
                variant="ghost"
                onPress={copy}
                style={{ marginTop: space.s12 }}
              />
            ) : null}
            <Text variant="footnote" color={colors.ink40} style={{ marginTop: space.s10 }}>
              {depositQrWorks
                ? `Only USDC on ${chainLabel} arrives here. The same token sent on another network does not.`
                : depositQrNote}
            </Text>
          </SheetCard>

          <Funds funds={funds} address={address} />

          <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
            <Eyebrow small>Test funds</Eyebrow>
            {faucet.error && !status ? (
              <ErrorState error={faucet.error} onRetry={faucet.reload} />
            ) : !status ? (
              <Placeholder height={size.rowLg} style={{ marginTop: space.s10 }} />
            ) : (
              <>
                <Text variant="body" style={{ marginTop: space.s8 }}>
                  {status.detail}
                </Text>
                {status.available && status.usdc !== null ? (
                  <Button
                    label={`Get ${quantity(status.usdc, 0)} test USDC`}
                    variant="secondary"
                    loading={asking}
                    disabled={!status.wallet?.canAsk}
                    onPress={ask}
                    style={{ marginTop: space.s12 }}
                  />
                ) : null}
                {/* A disabled button always says why: no wallet on file yet, or asked within the window. */}
                {status.available && status.wallet === null ? (
                  <Text variant="footnote" color={colors.ink40} style={{ marginTop: space.s8 }}>
                    Finish setting up your wallet first: test funds go only to a wallet the executor has on file.
                  </Text>
                ) : status.wallet?.nextAt ? (
                  <Text variant="footnote" color={colors.ink40} style={{ marginTop: space.s8 }}>
                    {`This wallet was sent test funds in the last ${status.windowHours} hours. It can ask again at ${new Date(status.wallet.nextAt).toLocaleString()}.`}
                  </Text>
                ) : null}
              </>
            )}
            <Outcome outcome={outcome} />
          </SheetCard>
        </ScrollView>
      </Fill>
    </Screen>
  );
}

/**
 * What the wallet holds, as the chain last said.
 *
 * Before the first answer, a placeholder; a first read that fails, the failure and nothing else. After that the last
 * answer stays on screen through a failed read, with when it was read and that the latest read failed. A balance that
 * could not be read is never shown as a number, and a number that was read is not taken away by one bad read.
 */
function Funds({
  funds,
  address,
}: {
  funds: PollState<WalletFunds> & { refresh: () => Promise<void> };
  address: string | undefined;
}) {
  const { data, dataAt, error } = funds;
  // The balances are of the wallet the executor has on file; the address above is the one this app signs with. They are
  // the same wallet unless something else is wrong, and then the screen should say so rather than show one beside the other.
  const elsewhere = data !== undefined && address !== undefined && data.owner.toLowerCase() !== address.toLowerCase();

  return (
    <View>
      <Eyebrow small>In this wallet</Eyebrow>
      {data ? (
        <View style={{ marginTop: space.s6 }}>
          <Row title="USDC" value={<Price>{quantity(data.usdc.amount, 2)}</Price>} height={size.rowSm} />
          <Row title="ETH" value={<Price>{quantity(data.eth.amount, 4)}</Price>} height={size.rowSm} divider={false} />
          <Text variant="footnote" color={error ? colors.down : colors.ink40} style={{ marginTop: space.s8 }}>
            {error
              ? `Read at ${clock(dataAt)}. The latest read failed: ${errorText(error)}`
              : `Read from ${chainLabel} at ${clock(dataAt)}, every ${POLL_MS / 1000} seconds while this screen is open.`}
          </Text>
          {elsewhere ? (
            <Text variant="footnote" color={colors.down} style={{ marginTop: space.s6 }}>
              {`These are the balances of ${shortAddress(data.owner)}, the wallet the executor has on file, not of the address above.`}
            </Text>
          ) : null}
        </View>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void funds.refresh()} />
      ) : (
        <LoadingRows count={2} height={size.rowSm} />
      )}
    </View>
  );
}

/** What asking the faucet did: what arrived and in which transaction, or the executor's reason nothing was sent. */
function Outcome({ outcome }: { outcome: FaucetOutcome | undefined }) {
  if (!outcome) return null;
  if (outcome.status !== 'sent') {
    return (
      <Text variant="footnote" color={colors.down} style={{ marginTop: space.s10 }}>
        {outcome.status === 'blocked' ? outcome.detail : outcome.error}
      </Text>
    );
  }
  const eth = outcome.eth;
  const ethLine =
    eth === null
      ? null
      : 'failed' in eth
        ? `ETH for gas was not raised: ${eth.failed}`
        : eth.added > 0
          ? `ETH raised from ${quantity(eth.before)} to ${quantity(eth.before + eth.added)} for gas.`
          : `ETH was already at least ${quantity(eth.floor)}, so it was left as it was.`;
  return (
    <View style={{ marginTop: space.s10, gap: space.s4 }}>
      <Text variant="footnote" color={colors.ink}>
        {`Sent ${quantity(outcome.usdc.amount, 2)} USDC from ${shortAddress(outcome.from)} · ${shortAddress(outcome.txHash, 10, 4)}`}
      </Text>
      {ethLine ? (
        <Text variant="footnote" color={colors.ink40}>
          {ethLine}
        </Text>
      ) : null}
      {outcome.detail ? (
        <Text variant="footnote" color={colors.down}>
          {outcome.detail}
        </Text>
      ) : null}
    </View>
  );
}

const clock = (at: number | undefined) => (at === undefined ? 'an unknown time' : new Date(at).toLocaleTimeString());
