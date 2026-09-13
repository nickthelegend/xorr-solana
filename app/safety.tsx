/**
 * Screen 20 — Kill switch. screens.md Group C.
 *
 * A state chip (7pt dot + LIVE/STOPPED). State-driven title and explanation. Three
 * consequence cards. The two parties to the permission, named. Three settings rows. A 56pt
 * button — `candleDown` "Stop all agents" ↔ white "Resume agents".
 *
 * PLAN.md 6.10 / 12.5: this button SIGNS AN ON-CHAIN REVOKE, from the user's own wallet.
 * The footnote "Takes effect in under a second across every device" is true by construction,
 * because the authority is revoked at the chain rather than at a server we fan out from.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  BackButton,
  Button,
  ConsequenceCard,
  Eyebrow,
  Fill,
  Press,
  Row,
  Screen,
  SheetCard,
  Text,
  colors,
  NoteStrip,
  quantity,
  radius,
  size,
  space,
} from '@/ui';
import {
  delegateUnusable,
  delegationExpired,
  permissionUnreadable,
  expiryNote,
  expiryState,
  killCta,
  killExplanation,
  killTitle,
} from '@/state/derived';
import { userSigningNote, userSigningWorks } from '@/chain';
import { useStore } from '@/state/store';
import { useAllowlist } from '@/wallet/allowlist';
import { useApprovals, type ApprovalsView } from '@/wallet/useApprovals';
import { planResume, type GrantOptions } from '@/wallet/grantPlan';
import { useGrantDelegation } from '@/auth/useGrantDelegation';
import { repos } from '@/data';
import { api } from '@/data/api';
import { system } from '@/data/system';
import { useAsync } from '@/data/useAsync';
import { errorText, NotSignedIn } from '@/data/apiError';

/** The state chip's dot. 7pt — screens.md gives this one exactly. */
const DOT = 7;
const SETTING_ROW = 52;

export default function Safety() {
  const router = useRouter();
  const goBack = useGoBack();
  /*
   * How many things can actually place an order right now, from the server. Counting a boolean in
   * browser state would make the kill switch's own explanation a guess.
   *
   * This counted HIRED AGENTS alone, and that is not the set that can trade. A wallet with no
   * agent hired and five live strategies read "0 agents can place orders inside your limits right
   * now" under a green LIVE badge — while one of those strategies was placing an order. A live
   * strategy is scheduled against this permission exactly as a hired agent is; both stop when the
   * switch below is pulled, so both belong in the sentence that says what the switch stops.
   */
  const roster = useAsync(() => repos.bot.listAgents(), []);
  const strategies = useAsync(() => repos.strategies.list(), []);
  const hiredCount =
    (roster.data ?? []).filter((a) => a.hired).length +
    (strategies.data ?? []).filter((s) => s.state === 'live').length;

  const storedKilled = useStore((s) => s.killed);
  const setKilled = useStore((s) => s.setKilled);
  const setDelegation = useStore((s) => s.setDelegation);
  // Read it as well as write it: the two parties are rendered below, and a screen that
  // stores the delegation and then cannot see it is why they were never shown at all.
  const delegation = useStore((s) => s.delegation);
  const recoveryBackedUp = useStore((s) => s.recoveryBackedUp);
  const [localError, setLocalError] = useState<string>();

  /*
   * Stopped, according to the chain — not according to a flag we kept.
   *
   * `killed` was a persisted store boolean, set when the user pressed the button in THIS browser.
   * The chain already carries the answer as `revoked`, and the two drift the moment anything
   * happens outside the session: a revoke from another device, a reload after site data is
   * cleared, or simply the store not being written.
   *
   * Measured on the deployed build, which is what makes this worth the change rather than an
   * opinion: the kill switch was pressed, the transaction confirmed, and /verify read
   * `revoked=true, $0 left today` off the contract — while this screen still showed a green LIVE
   * badge and "2 agents can place orders inside your limits right now", on a screen that promises
   * the stop "takes effect in under a second across every device". The bot was genuinely stopped
   * and the safety screen said it was not, which is the most expensive direction for this
   * particular lie to run.
   *
   * The chain governs whenever there is a permission to read. The stored flag survives only as
   * the answer before the first fetch lands, and for the case where there is no permission at all.
   */
  const killed = delegation ? delegation.revoked : storedKilled;

  /*
   * A granted permission the bot cannot actually use.
   *
   * Not revoked, not expired, cap intact — and inert, because it names a delegate key the
   * executor is not. The screen reported LIVE through exactly this, so it gets its own state
   * rather than being folded into either of the two that already existed.
   */
  const unusable = delegateUnusable(delegation, killed);
  /*
   * Is there a permission at all? Distinct from "is it revoked" — `stopped` covers that. A
   * signed-out visitor, or a signed-in wallet that has never granted, has no permission, and the
   * badge, title and explanation all have to say so rather than describing one that is not there.
   */
  const granted = delegation !== null && delegation !== undefined;

  /*
   * A permission that ran out.
   *
   * The banner near the bottom of this screen has read expiry since it was added, and the badge at
   * the top did not: an expired policy showed a green dot reading **Live** over "Agents are live",
   * with the words "Your permission has expired, so nothing can be placed" a scroll below. Two
   * contradictory sentences in one screen, which is the exact failure `killExplanation` already
   * carries a docblock about.
   *
   * Seen on the hosted deployment — a grant that lapsed at 13:35 on 8 September still reading Live
   * thirteen hours later, while `/limits` reported `$0 left today` and gave no reason for the zero.
   */
  const expired = delegationExpired(delegation, killed);


  // "2 addresses" was typed in. The allowlist is real and persisted; read it.
  const { addresses } = useAllowlist();

  /*
   * The second lock, read from the party that enforces it.
   *
   * `XorrDelegation` bounds the BOT and is enforced by a contract. It says nothing about what
   * this wallet may be asked to sign, so a compromised bundle could still put a transfer to an
   * attacker in front of the user and the delegation would not care — it governs the delegate.
   * Privy holds the key and refuses anything outside its policy before a signature exists.
   */
  const privy = useAsync(() => repos.wallet.privyPolicy(), []);

  /*
   * The standing allowances, which survive a revoke.
   *
   * Stopping the agents revokes the DELEGATION, and `spend` checks that before moving anything —
   * so the bot is genuinely stopped. The ERC-20 approvals are a separate grant to the same
   * contract and are untouched by it. On the screen where someone goes to disengage, showing one
   * and not the other means "I revoked everything" is true only of the half they can see.
   */
  const { approvals, revoke: revokeApproval, revoking } = useApprovals();

  /*
   * Load the permission when the screen opens.
   *
   * The store only ever held a delegation written by a grant or a revoke performed in this
   * session, so a user who simply navigated here saw nothing about the permission governing
   * their money right now. On a screen whose subject IS that permission, that is the wrong
   * default.
   */
  /*
   * The failure is KEPT, not swallowed.
   *
   * `.catch(() => undefined)` discarded it, so an unreachable executor left `delegation` null and
   * this screen announced "No permission has been granted" over a live on-chain grant. A read we
   * could not complete has to say so.
   */
  const [delegationError, setDelegationError] = useState<unknown>(undefined);
  /** No session, so the chain was never asked. Distinct from asked-and-absent. */
  const [signedOut, setSignedOut] = useState(false);
  useEffect(() => {
    let alive = true;
    void repos.wallet
      .delegation()
      .then((d) => {
        if (!alive) return;
        setDelegation(d);
        setDelegationError(undefined);
      })
      .catch((e: unknown) => {
        /*
         * Signed out is its own state — not "no permission", and not a failed read.
         *
         * This treated `NotSignedIn` as the answer "you have granted nothing", and the screen then
         * said **NOT GRANTED · No permission has been granted, so nothing can trade**. A returning
         * user with a live $1,600/day grant on chain reads that as their money being untouchable.
         * It is the same false reassurance the docblock above `permissionUnreadable` calls "the one
         * claim this screen must never make" — arriving by a different door, because a session we
         * never opened is not an answer we received.
         */
        if (!alive) return;
        if (e instanceof NotSignedIn) setSignedOut(true);
        else setDelegationError(e);
      });
    return () => {
      alive = false;
    };
  }, [setDelegation]);

  /** Could not be read — distinct from read and absent. Outranks every other state below. */
  const unreadable = permissionUnreadable(delegationError, delegation);

  // Signed by the user, on-chain. This is why "under a second across every device" is true
  // without any server needing to be reachable.
  const { grant: signGrant, revoke: signRevoke, busy, error: txError } = useGrantDelegation();
  const error = localError ?? txError;

  /*
   * The grant, called as a resume calls it: with the approvals the plan found missing (PLAN.md 4.7).
   *
   * `useGrantDelegation` is being changed separately to take that third argument. Until it does,
   * its two-parameter `grant` still fits this type and the argument is ignored, so every approval
   * is sent as before — extra signatures, never a weaker permission. Once it takes the options,
   * this assignment is where the compiler holds the two to the same shape.
   */
  const grantWith: (dailyCapUsd: number, durationMs: number, options: GrantOptions) => Promise<unknown> =
    signGrant;

  /*
   * What a re-grant signs, planned from fresh reads of the chain (PLAN.md 4.7).
   *
   * This signed `grant(cap, 86_400_000)`: the cap this device's store held and twenty-four hours,
   * whatever the user had granted — so a $400 permission for a week came back as $1,600 for a day,
   * and every token was approved again for allowances the revoke never touched. The plan takes the
   * cap the chain holds, the length the last grant ran, and only the approvals no longer enough.
   * Read when the button is pressed rather than from what the screen loaded: the chain is what is
   * being resumed, and an allowance can move while the screen is open.
   */
  async function planFromChain() {
    const [permission, params, allowances] = await Promise.all([
      repos.wallet.delegation(),
      system.delegationParams(),
      api.get<ApprovalsView>('/approvals'),
    ]);
    return planResume({ permission, params, allowances, now: Date.now() });
  }

  async function toggle() {
    setLocalError(undefined);
    try {
      const plan = killed || unusable || expired ? await planFromChain() : undefined;
      /*
       * Nothing on record to resume from — no permission, or no record of how long the last one
       * ran — so nothing is signed here. The limits are the user's to set, on the screen that sets
       * them, rather than a length this screen would have to make up.
       */
      if (plan?.kind === 'choose') {
        router.push('/delegate');
        return;
      }
      // Biometrics gate every change to what the bot may do. PLAN.md 12.20.
      const hasHw = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const enrolled = hasHw
        ? await LocalAuthentication.isEnrolledAsync().catch(() => false)
        : false;
      if (enrolled) {
        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: unusable
            ? 'Reconnect your agents'
            : expired
              ? 'Grant a new permission'
              : killed
                ? 'Resume your agents'
                : 'Stop all agents',
        });
        if (!res.success) {
          setLocalError('Not confirmed — nothing changed.');
          return;
        }
      }
      /*
       * A disconnected permission is re-granted, not revoked.
       *
       * `unusable` means the grant names a key the executor does not hold. Revoking it — which is
       * what "not killed, so the button stops things" used to do — would take the user from a
       * permission that does not work to no permission at all, and call that progress.
       */
      /*
       * An EXPIRED permission is re-granted too, for the same reason a disconnected one is.
       * Without this branch the button read "Stop all agents" over a policy that had already
       * stopped itself, and pressing it would have sent `revoke()` for a grant the contract
       * considers over — a transaction, a wallet prompt and a gas fee to change nothing. The same
       * mistake the ungranted-wallet case was fixed for.
       */
      if (plan) await grantWith(plan.dailyCapUsd, plan.durationMs, { approvals: plan.approvals });
      else await signRevoke();
      setDelegation(await repos.wallet.delegation());
      setKilled(unusable || expired ? false : !killed);
    } catch (e) {
      setLocalError(errorText(e));
    }
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <BackButton onPress={() => goBack()} />
        <Text variant="screenTitle">Safety</Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s8,
          alignSelf: 'flex-start',
          marginTop: space.s20,
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.card,
          paddingHorizontal: space.s12,
          paddingVertical: space.s6,
        }}
      >
        <View
          style={{
            width: DOT,
            height: DOT,
            borderRadius: radius.full,
            backgroundColor: unreadable
              ? colors.ink30
              : unusable || expired
                ? colors.down
                : killed || !granted
                  ? colors.ink30
                  : colors.up,
          }}
        />
        {/*
          A green LIVE dot on a wallet that has granted nothing is the same false claim as the
          title under it. `granted` is read from the delegation, which this screen already loads.
        */}
        <Text
          variant="tagSm"
          color={
            unreadable
              ? colors.ink55
              : unusable || expired
                ? colors.down
                : killed || !granted
                  ? colors.ink55
                  : colors.up
          }
        >
          {/*
            "Unknown" outranks everything. Saying "Not granted" because the request failed is the
            one claim this screen must never make — see `permissionUnreadable`.
          */}
          {signedOut
            ? 'Not signed in'
            : unreadable
              ? 'Unknown'
              : unusable
                ? 'Disconnected'
                : !granted
                  ? 'Not granted'
                  : expired
                    ? 'Expired'
                    : killed
                      ? 'Stopped'
                      : 'Live'}
        </Text>
      </View>

      <Text variant="onboardingTitle" style={{ marginTop: space.s16 }}>
        {signedOut
          ? 'Sign in to see what can trade'
          : unreadable
            ? 'Could not read your permission'
            : killTitle(killed, unusable, granted, expired)}
      </Text>
      <Text variant="body" color={colors.ink40} style={{ marginTop: space.s8 }}>
        {signedOut
          ? 'Nobody is signed in, so this screen has not asked the chain about any wallet. If you have granted a permission, it is still in force — signing in is what lets us read it.'
          : unreadable
            ? 'This screen could not read your permission, so it cannot tell you what the bot is allowed to do. Whatever is granted on chain is still in force — this is a gap in what we can show you, not a change to your permission.'
            : killExplanation(killed, hiredCount, unusable, granted, expired)}
      </Text>

      {/*
        Scrolls, because this screen has outgrown a short phone.
        
        It gained the Privy policy, the token approvals and the expiry warning, and on an iPhone SE
        (667pt against the design's 874) the last of those sits below the fold with no way to
        reach it. The repo's own device-matrix check catches this, and it is right to: unreachable
        content on the safety screen is worse than unreachable content anywhere else.

        `Fill` keeps the flex behaviour; the ScrollView inside it takes the overflow, and the stop
        button stays pinned below rather than scrolling away.
      */}
      <Fill style={{ marginTop: space.s20 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.s16 }}>
        <View style={{ gap: space.s10 }}>
          <ConsequenceCard tone="down" label="New orders" detail="Stopped immediately" />
          <ConsequenceCard
            tone="up"
            label="Stops and take-profits"
            detail="Stay active — your risk is still covered"
          />
          <ConsequenceCard tone="up" label="Open positions" detail="Left exactly as they are" />
        </View>

        {/*
          Name the two parties.
          This screen is entirely about who may do what with the user's money, and it never
          said who either party was. `Row` truncates a long value, and two addresses that
          differ only in the middle truncate identically — so the address is shown in full,
          small, and a Basename is used as the headline wherever one exists.
        */}
        <SheetCard borderRadius={radius.panel} padding={space.s16} style={{ marginTop: space.s18 }}>
          {/*
            No permission is a SENTENCE, not two dashes.

            Before a grant exists `/delegation` is null, so both rows rendered "—" on the one
            screen whose entire subject is who may do what with the user's money. Two blank
            fields under "Your wallet" and "The bot's key" read as the screen having failed to
            load, and the honest answer — nobody has been given anything yet — is also the
            reassuring one. It links to the grant, because that is what the reader will want next.
          */}
          {delegation ? (
            <>
              <Party
                label="Your wallet"
                name={delegation.ownerName}
                address={delegation.ownerPubkey}
              />
              <Party
                label="The bot's key"
                name={delegation.delegateName}
                address={delegation.delegatePubkey}
                note="Can trade inside your limits. Cannot withdraw, ever."
              />
            </>
          ) : (
            <View style={{ paddingVertical: space.s12, gap: space.s6 }}>
              <Eyebrow small>The permission</Eyebrow>
              <Text variant="rowPrimary">Nothing is granted yet</Text>
              <Text variant="footnote" color={colors.ink32}>
                No bot can touch this wallet until you sign a permission, and there is nothing to
                stop because nothing has started.
              </Text>
              <Button
                label="Set the limits"
                variant="ghost"
                onPress={() => router.push('/delegate')}
                style={{ marginTop: space.s10 }}
              />
            </View>
          )}
        </SheetCard>

        {/*
          Both locks, named, on the screen whose subject is who may do what.

          Showing only the on-chain one understates the protection; claiming "defence in depth"
          without showing the second layer is the kind of unfalsifiable assertion this whole
          product argues against. So the policy is read back from Privy and its destinations are
          listed — and when it is not attached to this wallet, that says so, because Privy makes
          the wallet's OWNER authorise the attachment and for an embedded wallet that owner is the
          user. "This control belongs to you, not to us" is a better fact than a green tick.
        */}
        {privy.data ? (
          <SheetCard borderRadius={radius.panel} padding={space.s16} style={{ marginTop: space.s10 }}>
            <View style={{ gap: space.s6 }}>
              <Eyebrow small>Privy policy</Eyebrow>
              <Text variant="rowPrimary">
                {privy.data.enforced
                  ? 'Your wallet can only send to these'
                  : 'Ready, and yours to switch on'}
              </Text>
              <Text variant="footnote" color={colors.ink32}>
                {privy.data.enforced
                  ? 'Privy holds the key and refuses anything else before a signature exists — even if this app asks.'
                  : 'Privy makes the wallet’s owner authorise this, and that owner is you. Nothing we hold can attach it for you.'}
              </Text>
            </View>
            <View style={{ gap: space.s4, marginTop: space.s12 }}>
              {(privy.data.enforced ? privy.data.allowed : privy.data.wouldAllow).map((d) => (
                <View
                  key={d.address}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.s10 }}
                >
                  <Text variant="footnote" color={colors.ink55} style={{ flexShrink: 1 }}>
                    {d.label}
                  </Text>
                  <Text variant="footnote" color={colors.ink32}>
                    {d.address.slice(0, 6)}…{d.address.slice(-4)}
                  </Text>
                </View>
              ))}
            </View>
            {privy.data.ownedByQuorum ? (
              <Text variant="footnote" color={colors.ink32} style={{ marginTop: space.s12 }}>
                Owned by key quorum {privy.data.ownedByQuorum} — this server cannot widen it. Check
                it on ›
              </Text>
            ) : null}
            <Button
              label="Check it yourself"
              variant="ghost"
              onPress={() => router.push('/judge')}
              style={{ marginTop: space.s10 }}
            />
          </SheetCard>
        ) : null}

        {/*
          The deadline the contract will enforce whether or not anyone is watching.

          `expiresAt` has been written at grant time and returned by `/delegation` since the
          beginning, and read by nothing. So the permission lapses, the bot stops, and every
          screen goes on saying "Agents are live" — the same silent stop as a rotated delegate
          key. Only shown when it is actually close, because a countdown three days out is noise.
        */}
        {expiryNote(delegation?.expiresAt) ? (
          <NoteStrip
            kind={expiryState(delegation?.expiresAt) === 'expired' ? 'blocked' : 'risk'}
            style={{ marginTop: space.s10 }}
          >
            {expiryNote(delegation?.expiresAt)!}
          </NoteStrip>
        ) : null}

        {/*
          What the contract can still pull, and the button that takes it back.

          Only rendered when something is actually approved: four zero rows on a fresh wallet is
          noise on a screen that has to be scannable in a second.
        */}
        {approvals && approvals.tokens.some((t) => !t.none && !t.unread) ? (
          <SheetCard borderRadius={radius.panel} padding={space.s16} style={{ marginTop: space.s10 }}>
            <View style={{ gap: space.s6 }}>
              <Eyebrow small>Token approvals</Eyebrow>
              <Text variant="rowPrimary">What the contract can still pull</Text>
              <Text variant="footnote" color={colors.ink32}>
                Separate from the permission above, and they outlive it. Stopping your agents does
                not remove them — the bot cannot use them while it is stopped, but they stay until
                you take them back.
              </Text>
            </View>
            <View style={{ gap: space.s10, marginTop: space.s12 }}>
              {approvals.tokens
                .filter((t) => !t.none && !t.unread)
                .map((t) => (
                  <View
                    key={t.address}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: space.s10,
                    }}
                  >
                    <View style={{ flexShrink: 1 }}>
                      <Text variant="rowPrimary">{t.symbol}</Text>
                      <Text variant="footnote" color={colors.ink32}>
                        {/*
                          The number, not the word. "Limited" is technically true of 48,000 USDC
                          and tells the reader nothing about whether they are comfortable with it.
                        */}
                        {t.unlimited
                          ? 'No limit'
                          : Number.isFinite(Number(t.display))
                            ? `Up to ${quantity(Number(t.display))} ${t.symbol}`
                            : 'Limited'}
                      </Text>
                    </View>
                    <Button
                      label={revoking === `${approvals.spender}:${t.symbol}` ? 'Taking it back…' : 'Take it back'}
                      variant="ghost"
                      loading={revoking === `${approvals.spender}:${t.symbol}`}
                      onPress={() => revokeApproval(t, approvals.spender)}
                    />
                  </View>
                ))}
            </View>
          </SheetCard>
        ) : null}

        <SheetCard borderRadius={radius.panel} padding={space.s16} style={{ marginTop: space.s12 }}>
          <Row
            title="Face ID for every payout"
            value={<Text variant="rowPrimary" color={colors.ink55}>On</Text>}
            height={SETTING_ROW}
          />
          <Row
            title="Withdrawal allowlist"
            value={
              <Text variant="rowPrimary" color={colors.ink55}>
                {addresses.length === 1 ? '1 address' : `${addresses.length} addresses`}
              </Text>
            }
            height={SETTING_ROW}
            onPress={() => router.push('/allowlist')}
          />
          <Row
            title="Recovery"
            value={
              <Text variant="rowPrimary" color={recoveryBackedUp ? colors.ink55 : colors.warn}>
                {recoveryBackedUp ? 'Acknowledged' : 'Read this'}
              </Text>
            }
            height={SETTING_ROW}
            divider={false}
            onPress={() => router.push('/recovery')}
          />
        </SheetCard>

        </ScrollView>
      </Fill>

      {/*
        The kill switch has to tell the truth about itself before it is pressed.

        On a fork build the user's wallet signs through Privy against real Base, where it holds
        nothing — so `revoke()` cannot land. The grant screen has said so up front since it was
        written; this screen did not, and the result was the worst version of it: tapping
        "Stop all agents" changed nothing, showed nothing, and left "Agents are live · 5 agents can
        place orders" on screen. The failure WAS reported — at the bottom of a scroll area several
        screens long, as five lines of viem containing the RPC URL, the Privy app id and the entire
        signed transaction.

        So the note is here, the error is here, and the button is disabled rather than pretending.
        An emergency stop that silently does nothing is worse than one that says it cannot.
      */}
      {userSigningWorks ? null : (
        <NoteStrip kind="blocked" style={{ marginBottom: space.s10 }}>
          {userSigningNote}
        </NoteStrip>
      )}

      {error ? (
        <Text
          variant="secondarySm"
          color={colors.down}
          style={{ marginBottom: space.s10 }}
        >
          {error}
        </Text>
      ) : null}

      {/*
        No permission, no kill switch.
        
        This rendered a red "Stop all agents" on a wallet with nothing granted, directly under the
        sentence "There is nothing to stop yet" — and pressing it would have asked the wallet to
        revoke a policy that never existed. Caught in the closing frame of the demo recording.
        
        The first fix relabelled it "Set the limits", which put two buttons with the same words a
        centimetre apart: the permission card above already offers exactly that. So the whole block
        goes instead — the button and the "takes effect in under a second" line beneath it, which
        promises something about a stop that cannot happen either. The screen keeps one action, in
        the card that explains it.
      */}
      {granted && !unreadable ? (
        <>
          <Button
            label={killCta(killed, unusable, granted, expired)}
            variant={killed || unusable || expired ? 'primary' : 'destructive'}
            height={size.buttonLg}
            loading={busy}
            disabled={!userSigningWorks}
            onPress={toggle}
          />
          <Text
            variant="footnote"
            color={colors.ink28}
            align="center"
            style={{ marginTop: space.s12 }}
          >
            {/*
              The promise is about a STOP, and it is not true of the other things this button does.
              Granting a fresh permission is a signature and a transaction, not a sub-second flag,
              and saying otherwise under a button that is about to open a wallet is a small lie on
              the screen least able to afford one.
            */}
            {killed || unusable || expired
              ? 'You will be asked to sign. Nothing changes until you do.'
              : 'Takes effect in under a second across every device.'}
          </Text>
        </>
      ) : null}
      {/*
        Stopping and exiting are different needs, and only the first one was offered.
        Deliberately a quiet secondary link rather than a second big red button: two
        destructive buttons of equal weight is how someone taps the wrong one.
      */}
      <Press
        onPress={() => router.push('/flatten')}
        accessibilityRole="button"
        accessibilityLabel="Sell every position into USDC"
        hitHeight={size.hit}
        style={{ marginTop: space.s14, alignItems: 'center' }}
      >
        <Text variant="footnote" color={colors.ink45}>
          Stopping is not selling. Sell everything into cash ›
        </Text>
      </Press>
    </Screen>
  );
}

/**
 * One side of the permission: what it is called, and exactly which address it is.
 *
 * The address is rendered in full rather than truncated, because the reason to show it at
 * all is so a person can compare it with an explorer — and a truncation defeats that. A
 * Basename, when there is one, is the headline; the address stays underneath rather than
 * being replaced by it, since a name is a claim about an address and the app should not ask
 * anyone to take it on faith.
 */
function Party({
  label,
  name,
  address,
  note,
}: {
  label: string;
  name?: string | null;
  address?: string;
  note?: string;
}) {
  return (
    <View style={{ paddingVertical: space.s12, gap: space.s2 }}>
      <Eyebrow small>{label}</Eyebrow>
      <Text variant="rowPrimary">{name ?? (address ? 'No Basename' : '—')}</Text>
      {address ? (
        <Text variant="footnoteSm" color={colors.ink38} selectable>
          {address}
        </Text>
      ) : null}
      {note ? (
        <Text variant="footnote" color={colors.ink32} style={{ marginTop: space.s2 }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}
