/**
 * The phone says so when a hired agent trades (2026-09-26).
 *
 * The executor's push has nowhere to go: this build has no APNs credentials, so `send()` fires at a device that was
 * never issued a token and nothing ever arrives. The app itself already knows — Home's status line reads
 * `/agents/last-look`, and a sweep that traded records `outcome: 'taken'` with "Momentum Scout bought AAPLx: …" — so
 * while the app is open it asks that same question on Home's clock and, when the answer is a trade it has not seen,
 * posts a LOCAL notification. A real system banner, fired by the app, with no server change and no credentials.
 *
 * Three rules keep it honest:
 *
 *   - only a NEW trade alerts. The newest one seen is remembered per wallet in AsyncStorage, and the very first read
 *     after install or sign-in only records it: relaunching must not re-announce this morning's buy;
 *   - only while the app is active. A backgrounded app's timers are suspended anyway, and a read nobody will see is a
 *     request the executor did not need;
 *   - the words come from the data. The headline names the agent and the symbol; the amount comes from the matching
 *     activity row when there is one, and is left out rather than guessed when there is not.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { repos } from '@/data';
import { system, type AgentLastLook } from '@/data/system';
import { useStore } from '@/state/store';
import { AGENT_TRADE_KIND } from './index';

/** Home's own ticker clock (`TICKER_EVERY_MS`), so the banner lands no later than the status line changes. */
const EVERY_MS = 12_000;

const seenKey = (address: string) => `xorr.agentTradeAlerts.lastSeen.${address}`;

type TakenLook = Extract<AgentLastLook, { looked: true }>;

/** "Momentum Scout bought AAPLx: reason…" → who, what they did, and to which symbol. */
export function tradeOf(headline: string): { agent: string; side: string; symbol: string } | null {
  const m = /^(.+?)\s+(bought|sold)\s+([A-Za-z0-9.]{1,16})\b/.exec(headline.trim());
  const [, agent, side, symbol] = m ?? [];
  return agent && side && symbol ? { agent, side, symbol } : null;
}

/**
 * The activity row this trade wrote, for its amount and its row.
 *
 * Best effort: a slow or failed read costs the body its dollar figure, never the banner. Matched on agent and symbol
 * within a few minutes of the look, because the look carries no row id of its own.
 */
async function rowFor(look: TakenLook, agent: string, symbol: string): Promise<{ amount?: string; seq?: string }> {
  try {
    const rows = await repos.activity.list();
    const row = rows.find(
      (r) =>
        r.kind === 'trade' &&
        r.agent === agent &&
        r.action.includes(symbol) &&
        (r.at === undefined || Math.abs(r.at - look.at) < 5 * 60_000),
    );
    if (!row) return {};
    const amount = row.amount.replace(/^[+\-−]\s*/, '').trim();
    return { amount: amount || undefined, seq: row.id };
  } catch {
    return {};
  }
}

async function announce(look: TakenLook): Promise<void> {
  const trade = tradeOf(look.headline);
  if (!trade) return;

  // Asked at sign-in by `register()`; asked here only if that never happened. iOS shows its prompt once, ever.
  const perm = await Notifications.getPermissionsAsync();
  let granted = perm.status === 'granted';
  if (!granted && perm.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).status === 'granted';
  if (!granted) return;

  const { amount, seq } = await rowFor(look, trade.agent, trade.symbol);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${trade.agent} ${trade.side} ${trade.symbol}`,
      body: amount ? `${amount} from its own wallet · tap to see it` : 'From its own wallet · tap to see it',
      sound: 'default',
      // `useNotificationRoute` reads this: the row when the trail named one, the Activity list when it did not.
      data: { kind: AGENT_TRADE_KIND, route: '/activity', ...(seq ? { seq } : {}) },
    },
    trigger: null,
  });
}

/** The newest trade an agent made, from the activity trail, which keeps every one (the last look lasts ~30 s). */
async function newestAgentTrade() {
  const rows = await repos.activity.list();
  return rows
    .filter((r) => r.kind === 'trade' && r.agent !== 'You' && r.agent !== 'xorr' && typeof r.at === 'number')
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
}

/** How recent a trade must be for a first launch to still announce it: "your agent just traded" (2026-09-26). */
const CATCH_UP_MS = 15 * 60_000;

export function useAgentTradeAlerts(): void {
  const address = useStore((s) => s.wallet?.address);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!address) return;
    let alive = true;
    const key = seenKey(address) + '.v2';

    /*
     * Read from the activity trail, not the last look (2026-09-26). A sweep that traded is the last look for about
     * thirty seconds before the cooldown replaces it, and a twelve-second poll missed Yield Keeper's AMZNx buy that way.
     * The trail keeps every trade with its time, so a trade is caught however late the app asks.
     */
    const check = async () => {
      if (inFlight.current || AppState.currentState !== 'active') return;
      inFlight.current = true;
      try {
        const row = await newestAgentTrade();
        if (!alive || !row?.at) return;
        const seen = await AsyncStorage.getItem(key).catch(() => null);
        if (seen !== null && Number(seen) >= row.at) return;
        await AsyncStorage.setItem(key, String(row.at)).catch(() => undefined);
        // First run: announce only a trade from the last few minutes, never this morning's.
        if (seen === null && Date.now() - row.at > CATCH_UP_MS) return;
        const m = /^(bought|sold)\s+(\S+)/i.exec(row.action.trim());
        const side = (m?.[1] ?? 'traded').toLowerCase();
        const symbol = m?.[2] ?? '';
        const amount = row.amount.replace(/^[+\-−]\s*/, '').trim();
        const perm = await Notifications.getPermissionsAsync();
        let granted = perm.status === 'granted';
        if (!granted && perm.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).status === 'granted';
        if (!granted) return;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `${row.agent} ${side} ${symbol}`.trim(),
            body: amount ? `${amount} from its own wallet · tap to see it` : 'From its own wallet · tap to see it',
            sound: 'default',
            data: { kind: AGENT_TRADE_KIND, route: '/activity', seq: row.id },
          },
          trigger: null,
        });
      } catch (e) {
        if (__DEV__) console.log(`[agent-alerts] check failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        inFlight.current = false;
      }
    };

    void check();
    const timer = setInterval(() => void check(), EVERY_MS);
    const sub = AppState.addEventListener('change', (st: AppStateStatus) => {
      if (st === 'active') void check();
    });
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [address]);
}
