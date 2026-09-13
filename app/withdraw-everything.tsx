/**
 * Withdraw everything — PLAN.md 4.9.
 *
 * Every position sold into USDC through the executor, the USDC taken out of Aave, and all of it sent
 * to one usable address on the allowlist — in that order, each step waiting for the one before it,
 * and the first thing that fails stopping everything after it, with the reason.
 *
 * What each step will touch is said before the button, and what each step did is shown after it,
 * per transaction. Two of the three steps are the owner's own signatures: the executor sells because
 * it holds the permission to, and it cannot take anything out of Aave or send anything anywhere, so
 * nothing here asks it to.
 *
 * Confirmed in two presses, as a limit order is: the first says exactly what the second does. And the
 * destination is chosen by a tap, never by default — this moves everything, and where it goes is not
 * a guess to make on someone's behalf.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  BackButton,
  Button,
  Eyebrow,
  Fill,
  NoteStrip,
  RadioCard,
  Screen,
  SheetCard,
  Tag,
  Text,
  colors,
  money,
  quantity,
  radius,
  size,
  space,
  type TagTone,
} from '@/ui';
import { shortAddress } from '@/format';
import { useAsync } from '@/data/useAsync';
import { errorText } from '@/data/apiError';
import { withdrawals } from '@/data/withdrawals';
import { useAllowlist, usableFromText, usableIn } from '@/wallet/allowlist';
import { useWithdrawEverything } from '@/wallet/useWithdrawEverything';
import type { Step } from '@/wallet/withdrawEverything';
import { userSigningNote, userSigningWorks } from '@/chain';

const STATUS: Readonly<Record<Step['status'], { label: string; tone: TagTone }>> = {
  waiting: { label: 'Not started', tone: 'neutral' },
  running: { label: 'Working', tone: 'warn' },
  done: { label: 'Done', tone: 'up' },
  failed: { label: 'Stopped', tone: 'down' },
};

export default function WithdrawEverything() {
  const goBack = useGoBack();
  const router = useRouter();
  const allowlist = useAllowlist();
  const preview = useAsync(() => withdrawals.sellPreview(), []);
  const aave = useAsync(() => withdrawals.aavePosition(), []);
  const { steps, running, finished, run } = useWithdrawEverything();
  const [chosen, setChosen] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();

  const destination = allowlist.usable.find((a) => a.address === chosen);
  const started = running || finished !== undefined;

  async function press() {
    if (!destination || running) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setError(undefined);
    try {
      await run({ address: destination.address, label: destination.label });
    } catch (e) {
      setError(errorText(e));
    } finally {
      // Everything these read has changed on chain; read it again rather than guess.
      preview.reload();
      aave.reload();
      allowlist.reload();
    }
  }

  const legs = preview.data?.legs ?? [];
  const sells = preview.error
    ? `Your positions could not be read just now: ${errorText(preview.error)}`
    : preview.loading && !preview.data
      ? 'Reading your positions…'
      : legs.length === 0
        ? 'Nothing to sell.'
        : `${legs.map((l) => `${quantity(l.units)} ${l.symbol}`).join(', ')} — about ${money(preview.data!.totalUsd)}, sold by the executor through your permission.`;
  const exits = aave.error
    ? `Your Aave position could not be read just now: ${errorText(aave.error)}`
    : aave.loading && !aave.data
      ? 'Reading your Aave position…'
      : !aave.data?.available
        ? (aave.data?.reason ?? 'There is no Aave pool on this chain, so nothing is supplied.')
        : aave.data.suppliedUsd > 0
          ? `${money(aave.data.suppliedUsd)} supplied. You sign the withdrawal; the bot never held the receipt token.`
          : 'Nothing supplied.';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <BackButton onPress={() => goBack()} />
        <Text variant="screenTitle">Withdraw everything</Text>
      </View>

      <Text variant="secondary" style={{ marginTop: space.s10 }}>
        Sells every position into USDC, takes your USDC out of Aave, then sends all of it to one address
        on your allowlist. Each step waits for the one before it, and the first thing that fails stops
        the rest.
      </Text>

      <Fill style={{ marginTop: space.s16 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.s20 }}>
          {started ? (
            <Progress steps={steps} />
          ) : (
            <>
              <Eyebrow small>To</Eyebrow>
              <View style={{ gap: space.s10, marginTop: space.s12 }}>
                {allowlist.loading ? (
                  <Text variant="secondary" color={colors.ink40}>
                    Reading your allowlist…
                  </Text>
                ) : allowlist.error && allowlist.addresses.length === 0 ? (
                  <Text variant="secondary" color={colors.down}>
                    Your allowlist could not be read: {errorText(allowlist.error)}
                  </Text>
                ) : allowlist.addresses.length === 0 ? (
                  <Text variant="secondary" color={colors.ink40}>
                    Nothing on your allowlist yet, so there is nowhere for your funds to go.
                  </Text>
                ) : (
                  <>
                    {allowlist.usable.map((a) => (
                      <RadioCard
                        key={a.address}
                        title={a.label}
                        detail={a.address}
                        selected={a.address === destination?.address}
                        onPress={() => {
                          setChosen(a.address);
                          setConfirming(false);
                        }}
                      />
                    ))}
                    {allowlist.pending.map((a) => (
                      <Text key={a.address} variant="secondarySm" color={colors.ink40}>
                        {a.label} · {shortAddress(a.address)} — usable from {usableFromText(a)}
                        {allowlist.serverTime !== undefined ? `, ${usableIn(a, allowlist.serverTime)}` : ''}
                      </Text>
                    ))}
                    {allowlist.usable.length === 0 ? (
                      <Text variant="secondarySm" color={colors.warn}>
                        None of these is usable yet.
                      </Text>
                    ) : null}
                  </>
                )}
              </View>

              <Eyebrow small style={{ marginTop: space.s22 }}>
                In this order
              </Eyebrow>
              <SheetCard borderRadius={radius.note} padding={space.s16} style={{ marginTop: space.s10, gap: space.s12 }}>
                <PlanLine n={1} title="Sell every position" detail={sells} />
                <PlanLine n={2} title="Take your USDC out of Aave" detail={exits} />
                <PlanLine
                  n={3}
                  title="Send your USDC"
                  detail={`All of it, to the unit, to ${destination ? destination.label : 'the address you choose'} — once both steps above have landed. You sign it.`}
                />
              </SheetCard>

              <Text variant="footnote" color={colors.ink40} style={{ marginTop: space.s10 }}>
                {preview.data && preview.data.skipped.length > 0
                  ? `${preview.data.skipped.join(', ')} ${preview.data.skipped.length === 1 ? 'stays' : 'stay'}: worth under ${money(preview.data.dustBelowUsd)}, less than the gas to sell. `
                  : ''}
                Your ETH stays too — it pays the network fees for the two transactions you sign.
              </Text>

              {confirming && destination ? (
                <NoteStrip kind="risk" style={{ marginTop: space.s12 }}>
                  {`Confirming sells every position, withdraws everything from Aave and sends every USDC in this wallet to ${destination.label} (${destination.address}). A step that has landed cannot be undone.`}
                </NoteStrip>
              ) : null}
            </>
          )}

          {/* Said before the button is pressed, not by a revert afterwards. See src/chain.ts. */}
          {userSigningWorks ? null : (
            <NoteStrip kind="blocked" style={{ marginTop: space.s12 }}>
              {userSigningNote}
            </NoteStrip>
          )}

          {error ? (
            <Text variant="secondarySm" color={colors.down} style={{ marginTop: space.s12 }}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </Fill>

      {finished !== undefined ? (
        <Button label="Done" height={size.buttonLg} onPress={() => goBack()} />
      ) : (
        <>
          {!started ? (
            <Button
              label="Manage allowlist"
              variant="ghost"
              onPress={() => router.push('/allowlist')}
              style={{ marginBottom: space.s10 }}
            />
          ) : null}
          <Button
            label={
              running
                ? 'Withdrawing…'
                : !destination
                  ? 'Choose where it goes'
                  : confirming
                    ? `Confirm: everything to ${destination.label}`
                    : `Withdraw everything to ${destination.label}`
            }
            variant="destructive"
            height={size.buttonLg}
            disabled={!userSigningWorks || !destination}
            loading={running}
            onPress={press}
          />
        </>
      )}
      <Text variant="footnote" color={colors.ink28} align="center" style={{ marginTop: space.s12 }}>
        The bot can sell for you. It cannot send anything anywhere — you sign that.
      </Text>
    </Screen>
  );
}

function PlanLine({ n, title, detail }: { n: number; title: string; detail: string }) {
  return (
    <View>
      <Text variant="rowPrimary">
        {n}. {title}
      </Text>
      <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s4 }}>
        {detail}
      </Text>
    </View>
  );
}

/** Each step as it stands: what it did, transaction by transaction, and where the run stopped if it did. */
function Progress({ steps }: { steps: Step[] }) {
  return (
    <>
      {steps.map((step, i) => (
        <SheetCard
          key={step.key}
          borderRadius={radius.note}
          padding={space.s14}
          style={{ marginTop: i === 0 ? 0 : space.s10 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s10 }}>
            <Text variant="rowPrimary">
              {i + 1}. {step.title}
            </Text>
            <Tag label={STATUS[step.status].label} small tone={STATUS[step.status].tone} />
          </View>
          {step.lines.map((line, j) => (
            <View key={`${step.key}-${j}`} style={{ marginTop: space.s8 }}>
              <Text
                variant="secondarySm"
                color={line.tone === 'failed' ? colors.down : line.tone === 'left' ? colors.ink45 : colors.ink}
              >
                {line.text}
              </Text>
              {line.txHash ? (
                <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s2 }} selectable>
                  {line.txHash}
                </Text>
              ) : null}
            </View>
          ))}
          {step.detail ? (
            <Text
              variant="secondarySm"
              color={step.status === 'failed' ? colors.down : colors.ink45}
              style={{ marginTop: space.s8 }}
            >
              {step.detail}
            </Text>
          ) : null}
        </SheetCard>
      ))}
    </>
  );
}
