/**
 * NEW — Grant delegation. PLAN.md 7.5, closing [G45].
 *
 * The single most consequential screen in the app, and it does not exist in the handoff:
 * this is where a user hands a bot authority over real money.
 *
 * Built from screen 20's consequence-card pattern — that layout already reads correctly for
 * "here is exactly what will and will not happen", which is the whole job here.
 *
 * Voice per copy.md: name the consequence, not the feature. Second person, present tense.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  BackButton,
  Button,
  ConsequenceCard,
  Fill,
  NoteStrip,
  Pill,
  Screen,
  SheetCard,
  Stepper,
  Text,
  colors,
  money,
  radius,
  size,
  space,
  SignInButton,
} from '@/ui';
import { useSignedOut } from '@/auth/useSignedOut';
import { useGoBack } from '@/nav/useGoBack';
import { useAsync } from '@/data/useAsync';
import { api } from '@/data/api';
import { useGrantDelegation } from '@/auth/useGrantDelegation';
import { CAP_MAX, CAP_MIN, RUN_FOR, capLabel, runForMs } from '@/state/derived';
import { useStore } from '@/state/store';
import { readDelegationIntoStore } from '@/wallet/readDelegation';
import { errorText } from '@/data/apiError';
import { isSolana } from '@/chain';

/** A dollar figure, whole or with cents as it comes. */
const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;


/** Goals' drawdown answers (Steady / Balanced / Aggressive) as the executor's risk profiles, by position. */
const RISK_PROFILE_FOR = ['conservative', 'balanced', 'aggressive'] as const;

export default function GrantDelegation() {
  const router = useRouter();
  const goBack = useGoBack();
  const signedOut = useSignedOut();
  const cap = useStore((s) => s.cap);
  const riskQ = useStore((s) => s.riskQ);
  const bumpCap = useStore((s) => s.bumpCap);
  const runFor = useStore((s) => s.runFor);
  /** Days the grant runs — on Solana the chain approves the daily cap for each of them (`src/wallet/solanaGrant.ts`). */
  const grantDays = Math.max(1, Math.ceil(runForMs(runFor) / 86_400_000));
  const cycleRunFor = useStore((s) => s.cycleRunFor);
  const [localError, setLocalError] = useState<string>();
  // The grant is signed by the USER's own wallet. The executor cannot grant itself
  // permission — that is the whole point of the delegation being on-chain.
  const { grant: signGrant, busy, error: grantError, ready: canSign } = useGrantDelegation();
  /*
   * How many signatures this is actually going to ask for.
   *
   * The grant is one transaction, and it is preceded by an ERC-20 approval for every token the
   * delegation may need to pull — which on a chain where the tokenized equities exist is eleven.
   * Eleven wallet prompts with no warning reads as the app having broken, and a user who stops
   * half way has approvals but no permission. Saying the number first costs one sentence.
   *
   * Counted the way the grant counts them (`useGrantDelegation`): one approval per token the
   * executor names, or USDC alone when it names none, then the grant. And a count that could not be
   * read does not take the warning with it — a failed read is no evidence of a single signature — so
   * the sentence then states the rule instead of the number.
   */
  const params = useAsync(
    () => api.get<{ tokens?: { symbol: string }[] }>('/delegation/params'),
    [],
  );
  const signatures = params.data ? Math.max(params.data.tokens?.length ?? 0, 1) + 1 : undefined;
  const error = localError ?? grantError;

  async function grant() {
    setLocalError(undefined);
    try {
      const hasHw = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      if (hasHw && (await LocalAuthentication.isEnrolledAsync().catch(() => false))) {
        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Let the bot trade inside your limits',
        });
        if (!res.success) {
          setLocalError('Not confirmed. Nothing was granted.');
          return;
        }
      }
      await signGrant(cap, runForMs(runFor));
      // Read it back from the chain rather than trusting what we just sent, and file it against
      // the address it was read for (`wallet/readDelegation.ts`).
      await readDelegationIntoStore();
      /*
       * The drawdown answer from Goals, now that there is a wallet to file it against (2026-09-19): it becomes the agents'
       * risk profile — how early they enter, how much, how long they wait. It was kept on the phone and read by nothing,
       * so every new user's agent traded as "balanced" whatever they chose. Failing to save it does not undo the grant;
       * the profile can be set again from the agent screen.
       */
      await api.post('/agents/risk-profile', { profile: RISK_PROFILE_FOR[riskQ] ?? 'balanced' }).catch(() => undefined);
      // The draft portfolio is the Base build's sleeves of WETH, cbBTC and Ondo equities (2026-09-19). On Solana the
      // agent trades xStocks and its basket is set from the agent screens, so the grant lands on Home.
      router.replace(isSolana ? '/(tabs)' : '/proposal');
    } catch (e) {
      setLocalError(errorText(e));
    }
  }

  return (
    <Screen>
      {/*
        A way back. This was the one onboarding step without one — and it is also reached from Safety, where the only
        other exit was "Not yet", which replaces the whole stack with Home.
      */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <BackButton onPress={() => goBack()} />
        <Text variant="screenTitle">Let the bot trade</Text>
      </View>
      <Text variant="body" color={colors.ink55} style={{ marginTop: space.s10 }}>
        What it can and can’t do.
      </Text>

      {/*
        Scrolls, because the two things this screen exists to say were below the fold.

        Measured on a 375×667 viewport — an iPhone SE, which is the shortest device the design
        supports — the content runs to 865pt with `body` at `overflow: hidden`. Unreachable: the
        risk warning ("a bot with permission to trade can lose money inside these limits") and the
        sentence telling the user their wallet is about to ask for three signatures.

        Both are on the screen where someone decides whether to give a bot access to their money,
        and a consent screen whose warning cannot be read is not consent.
      */}
      <Fill style={{ marginTop: space.s22 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.s16 }}>
        <View style={{ gap: space.s10 }}>
          {/*
            On Solana the permission is an SPL token approval (2026-09-19), and these three promises are said as the chain
            keeps them. An approval does not choose where the tokens go and has no end date, so "it cannot move your money
            out" and "it expires on its own" — true of the Base contract — would be false here: what the chain enforces is
            the total approved, on the USDC account alone; the daily cap, the venue and the end date are xorr's own rules.
          */}
          <ConsequenceCard
            tone="up"
            label="It can place trades"
            detail={isSolana ? `Up to ${capLabel(cap)}. xorr counts every trade against it.` : `Up to ${capLabel(cap)}.`}
          />
          {isSolana ? (
            <>
              <ConsequenceCard
                tone="down"
                label="It can spend only the USDC you approve"
                detail={`At most ${usd(cap * grantDays)} in all, and xorr only spends it on xStock and pre-IPO token buys through Jupiter.`}
              />
              {/*
                The grant also approves the bot on your xStock accounts (2026-09-19), so a stop-loss can sell while you are
                away. Said plainly: the chain lets that approval move those shares; xorr only ever moves them into a sale that
                pays you USDC, and the stop revokes it with the rest.
              */}
              <ConsequenceCard
                tone="down"
                label="It can sell the stock tokens you hold"
                detail="xStocks and pre-IPO tokens, so a stop-loss or take-profit can fire while you are away. xorr only moves them into a sale that pays you USDC. Nothing else in your wallet is reachable."
              />
              {/* The one disclosure a new holder must see before granting (2026-09-19); the rest is in Risk disclosure. */}
              <ConsequenceCard
                tone="warn"
                label="xStocks are not for US persons"
                detail="They are issued by Backed, which does not offer them to US persons. The issuer can pause or freeze the token. Settings → Risk disclosure has the rest."
              />
            </>
          ) : (
            <ConsequenceCard
              tone="down"
              label="It cannot move your money out"
              detail="No transfers or withdrawals, ever."
            />
          )}
          <ConsequenceCard
            tone="up"
            label={isSolana ? 'xorr stops using it on its own' : 'It expires on its own'}
            detail={
              isSolana
                ? `After ${RUN_FOR[runFor]!.toLowerCase()}. The approval itself stays on your USDC until you take it back.`
                : `After ${RUN_FOR[runFor]!.toLowerCase()}.`
            }
          />
          <ConsequenceCard
            tone="up"
            label="You can take it back in one tap"
            detail="From Safety, anytime."
          />
        </View>

        <SheetCard borderRadius={radius.panel} padding={space.s16} style={{ marginTop: space.s18 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: space.s12,
            }}
          >
            <Text variant="rowPrimary">Most it can spend a day</Text>
            <Stepper
              value={money(cap, { decimals: 0 })}
              onDecrement={() => bumpCap(-1)}
              onIncrement={() => bumpCap(1)}
              canDecrement={cap > CAP_MIN}
              canIncrement={cap < CAP_MAX}
              valueMinWidth={size.stepperValueMinW}
            />
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: space.s18,
              gap: space.s12,
            }}
          >
            <Text variant="rowPrimary">For how long</Text>
            <Pill label={RUN_FOR[runFor]!} selected onPress={cycleRunFor} />
          </View>
        </SheetCard>

        <NoteStrip kind="risk" style={{ marginTop: space.s16 }}>
          Trading can lose money within these limits.
        </NoteStrip>

        {/*
          The grant is the one signature this whole product depends on, so if the build cannot
          take it the screen says so before asking — rather than letting Privy answer with a
          revert about a balance on a chain the user is not looking at. See src/chain.ts.
        */}
        {signatures !== undefined ? (
          signatures > 2 ? (
            <NoteStrip kind="risk" style={{ marginTop: space.s10 }}>
              You’ll sign {signatures} times. Nothing is granted until the last.
            </NoteStrip>
          ) : null
        ) : params.error ? (
          <NoteStrip kind="risk" style={{ marginTop: space.s10 }}>
            You’ll sign once per token, then once more. Nothing is granted until the last.
          </NoteStrip>
        ) : null}

        {error ? (
          <Text variant="secondarySm" color={colors.down} style={{ marginTop: space.s14 }}>
            {error}
          </Text>
        ) : null}
        </ScrollView>
      </Fill>

      {signedOut ? (
        <SignInButton label="Sign in first" />
      ) : (
        <Button
          label="Sign this permission"
          // Loading until the wallet can sign — a tap before then has nothing to sign with.
          loading={busy || !canSign}
          onPress={grant}
        />
      )}
      <Button
        label="Not yet — look around first"
        variant="ghost"
        style={{ marginTop: space.s10 }}
        onPress={() => router.replace('/(tabs)')}
      />
    </Screen>
  );
}

