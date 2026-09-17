/**
 * Is the executor reachable, and say so when it is not.
 *
 * The app assumed it always was. Every screen reads through `api`, every failure is caught per
 * screen, and each one renders its own local emptiness: no positions, no strategies, no history,
 * "nothing has settled yet". Individually those are honest sentences. Together, on a dropped
 * connection, they compose into a confident and completely false picture — an account with
 * nothing in it — and the user has no way to tell that from the truth.
 *
 * That is worse here than in most apps. Someone opening this on a bad connection is checking
 * whether a bot has been trading their money, and "nothing happened" is exactly the answer they
 * are afraid of.
 *
 * The banner is deliberately not a modal and does not block anything. Cached screens still work,
 * the kill switch is signed on chain rather than through us and works with the executor entirely
 * down, and covering the app with a dialog would take that away at the moment it matters most.
 */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Text, colors, radius, space } from '@/ui';
import { executorHealth } from '@/data/health';
import { CHAIN_KEY, chainMoney, chainSentenceName } from '@/chain';
import { compareChains, type ChainMatch } from './chainMatch';
import { ChainMismatchScreen } from './ChainMismatch';

/** How often to re-check while down. Slow enough not to hammer a server that may be struggling. */
const RETRY_MS = 5_000;
/** And while up — a heartbeat, not a poll. */
const HEARTBEAT_MS = 30_000;

const ReachabilityContext = createContext<boolean>(true);

/** True when the executor answered its health check most recently. */
export function useExecutorReachable(): boolean {
  return useContext(ReachabilityContext);
}

export function ReachabilityProvider({ children }: { children: React.ReactNode }) {
  const [reachable, setReachable] = useState(true);
  /*
   * Whether the executor serves the chain this build signs on, from the same heartbeat.
   *
   * Starts `unknown` rather than `match`: the app has not asked yet, and starting at a verdict it has not
   * earned is how a check like this ends up being decorative. `unknown` renders exactly as `match` does.
   */
  const [chain, setChain] = useState<ChainMatch>({ state: 'unknown' });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Bumped by the mismatch screen's recheck, which restarts the heartbeat rather than waiting out its interval. */
  const [askedAgain, setAskedAgain] = useState(0);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      // The request itself lives in the data layer, where network access belongs.
      const beat = await executorHealth();
      if (!alive) return;
      setReachable(beat.reachable);
      setChain(
        compareChains({
          app: CHAIN_KEY,
          server: beat.chain,
          appName: chainSentenceName,
          appMoney: chainMoney,
          // The executor's own word for its money is not on `/health`, so it is left unsaid rather than
          // guessed — `compareChains` reads an unsaid one as real, which is the safe direction.
        }),
      );
      timer.current = setTimeout(check, beat.reachable ? HEARTBEAT_MS : RETRY_MS);
    };

    void check();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [askedAgain]);

  /*
   * A mismatch replaces the app rather than sitting over it.
   *
   * Every other failure in this provider is a banner, deliberately: cached screens still work and the kill
   * switch is signed on chain, so covering the app would take that away at the moment it matters. A chain
   * mismatch is the one case where that reasoning inverts — the kill switch would be signed on the wrong
   * chain too, and there is no screen whose numbers mean anything. Nothing here is worth keeping reachable.
   */
  if (chain.state === 'mismatch')
    return <ChainMismatchScreen mismatch={chain} onRecheck={() => setAskedAgain((n) => n + 1)} />;

  return (
    <ReachabilityContext.Provider value={reachable}>
      {children}
      {reachable ? null : <OfflineBanner />}
    </ReachabilityContext.Provider>
  );
}

/**
 * What it says matters more than that it appears.
 *
 * "Offline" alone would leave the reader to guess what is still true, and the two facts they
 * actually need are that their money is untouched and that stopping the bot does not go through
 * us. Both are properties of the design rather than reassurances, which is why they can be stated
 * flatly.
 */
function OfflineBanner() {
  return (
    <View
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        left: space.s16,
        right: space.s16,
        bottom: space.s26,
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.card,
        paddingHorizontal: space.s16,
        paddingVertical: space.s12,
        gap: space.s4,
      }}
    >
      <Text variant="rowPrimary" color={colors.down}>
        Can’t reach xorr
      </Text>
      <Text variant="footnote" color={colors.ink40}>
        Screens may be out of date, and anything you start will not go through. Your funds and your
        permission are on chain and unaffected — stopping your agents still works, because that is
        signed by you, not by us.
      </Text>
    </View>
  );
}
