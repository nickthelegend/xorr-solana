/**
 * NEW — Fund wallet. PLAN.md 7.4, REPLACING screen 9 (Add funds).
 *
 * [G44] The LAYOUT is screen 9 verbatim: 52/700 centred amount, preset pills, three radio
 * cards, fee + availability rows. Only the three METHODS change, because there is no
 * custodial rail to fund.
 *
 * [G42] The availability line is computed, not the handoff's frozen "Tue, Sep 8".
 *
 * The CTA used to read "Deposit $500" and navigate to the next screen. It deposited nothing
 * — there is no custodial rail, which the note above already admits — so the button was
 * claiming an action the app cannot perform. A non-custodial wallet has exactly one real
 * funding route: send USDC to its address. So the address is on the screen, copyable, and
 * the button says what it actually does.
 */
import React from 'react';
import { ScrollView, View  } from 'react-native';
import { useRouter } from 'expo-router';
import { activeChain, chainLabel, depositQrNote, depositQrWorks } from '@/chain';
import { AddressQR } from '@/ui/AddressQR';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  Eyebrow,
  Fill,
  Pill,
  PillRow,
  Price,
  Progress,
  RadioCard,
  Row,
  Screen,
  Text,
  colors,
  radius,
  money,
  size,
  space,
} from '@/ui';
import { businessDaysFromNow } from '@/format';
import { depositFee } from '@/state/derived';
import { useStore } from '@/state/store';

const METHODS = [
  {
    name: 'Transfer from an exchange',
    detail: 'Withdraw to your address',
    tag: 'Free',
    feePct: 0,
    lands: () => businessDaysFromNow(1),
  },
  {
    name: 'On-chain deposit',
    // USDC on whichever chain this build settles on, because that is what the executor settles
    // in. "USDT or SOL" was left over from before the pivot and named two things this app cannot
    // do anything with. The chain is read rather than written: this screen tells someone where to
    // send money, and a testnet build that says "Base" is telling them to send it to mainnet.
    detail: `USDC on ${chainLabel}`,
    tag: 'On-chain',
    feePct: 0,
    lands: () => 'After 1 confirmation',
  },
  {
    /*
     * Listed, and honestly unavailable.
     *
     * There is no on-ramp integration in this build, and this option quoted a **1.5% fee** for
     * it — $37.50 on a $2,500 deposit, invented, on the screen where a user decides how to pay.
     * Selecting it did nothing except change that number. Either the fee is real and the flow
     * exists, or the row says so; a made-up price for a service that cannot be bought is the
     * worst of the three options.
     */
    name: 'Card on-ramp',
    detail: 'Not enabled in this build',
    tag: 'Soon',
    feePct: 0,
    lands: () => '—',
    unavailable: true,
  },
] as const;

const PRESETS = [250, 500, 1000, 2500];

export default function Fund() {
  const router = useRouter();
  const goBack = useGoBack();
  const dep = useStore((s) => s.dep);
  const setDep = useStore((s) => s.setDep);
  const method = useStore((s) => s.method);
  const wallet = useStore((s) => s.wallet);
  const setMethod = useStore((s) => s.setMethod);

  const m = METHODS[method] ?? METHODS[0];
  const fee = depositFee(dep, m.feePct);

  return (
    <Screen>
      <Progress step={3} total={3} onBack={() => goBack()} />

      <Text variant="onboardingTitle" style={{ marginTop: space.s26 }}>
        Fund the wallet
      </Text>
      <Text variant="body" color={colors.ink40} style={{ marginTop: space.s10 }}>
        The bot can only trade what has settled. You can top up or withdraw whenever you like.
      </Text>

      <Price variant="heroAmount" align="center" style={{ marginTop: space.s26 }}>
        {money(dep, { decimals: 0 })}
      </Price>

      {/* The presets fit on one line, so the row centres them; it still scrolls rather than
          shrinking a pill if a longer amount is ever added. */}
      <PillRow style={{ marginTop: space.s18, flexGrow: 0 }}>
        {PRESETS.map((p) => (
          <Pill
            key={p}
            label={money(p, { decimals: 0 })}
            selected={p === dep}
            onPress={() => setDep(p)}
          />
        ))}
      </PillRow>

      <Eyebrow small style={{ marginTop: space.s26 }}>
        How you are paying
      </Eyebrow>

      {/*
        Scrolls. The QR made this screen taller than a short phone.

        Measured at 375×667: 368pt of overflow with three elements unreachable, including the
        address itself — on the screen whose entire job is handing someone an address. The code is
        worth the height; the height has to be reachable.
      */}
      <Fill style={{ marginTop: space.s12 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
        <View style={{ gap: space.s10 }}>
          {METHODS.map((opt, i) => (
            <RadioCard
              key={opt.name}
              title={opt.name}
              detail={opt.detail}
              tag={opt.tag}
              selected={i === method}
              // A card that cannot be chosen gets no handler, so `RadioCard` renders it disabled
              // rather than accepting a tap that changes nothing.
              onPress={'unavailable' in opt && opt.unavailable ? undefined : () => setMethod(i)}
            />
          ))}
        </View>

        <View style={{ marginTop: space.s16 }}>
          <Row title="Fee" value={fee === 0 ? 'Free' : money(fee)} height={size.rowSm} />
          <Row title="Available" value={m.lands()} height={size.rowSm} divider={false} />
        </View>

        {/*
          The only funding rail a non-custodial wallet actually has.
          Every method above ends in the same place — USDC arriving at this address — so the
          address is the useful thing on this screen, not the amount. Shown in full and
          selectable rather than truncated, because it is going to be pasted somewhere.
        */}
        <View
          style={{
            marginTop: space.s18,
            padding: space.s16,
            borderRadius: radius.panel,
            backgroundColor: colors.surface,
            gap: space.s6,
          }}
        >
          <Eyebrow small>Send USDC to</Eyebrow>
          {/*
            A code, because the sending wallet is on the other device.
            
            Every rail on this screen ends with USDC arriving at this address, and the person
            doing the sending is almost always looking at a different phone or an exchange in a
            browser. Retyping 42 hex characters between two screens is the step where funding
            actually fails, and a mistyped address on Base is money that is simply gone.

            EIP-681 rather than the bare address: a wallet that understands the URI opens
            pre-filled on the right chain, and one that does not still reads the address out of
            it. Only rendered once there IS an address — a QR of the empty string is a code that
            scans to nothing.

            And only where the chain id is this chain's (PLAN.md 4.5). A fork build encoded 8453,
            which is real Base: scanned, it pointed a phone wallet at real money. `depositQrWorks`
            says where a code is true, and a fork build says why it has none.
          */}
          {wallet?.address && depositQrWorks ? (
            <View style={{ alignItems: 'center', paddingVertical: space.s12 }}>
              <AddressQR value={`ethereum:${wallet.address}@${activeChain.id}`} size={168} />
            </View>
          ) : null}
          <Text variant="body" selectable>
            {wallet?.address ?? 'Finish signing in to see your address.'}
          </Text>
          {depositQrWorks ? null : (
            <Text variant="footnote" color={colors.ink32}>
              {depositQrNote}
            </Text>
          )}
          <Text variant="footnote" color={colors.ink32}>
            {`On ${chainLabel}. Nothing else on this screen moves money — xorr has no custody and no rail to move it for you.`}
          </Text>
        </View>
        </ScrollView>
      </Fill>

      <Button label="Continue — set the limits" onPress={() => router.push('/delegate')} />
    </Screen>
  );
}
