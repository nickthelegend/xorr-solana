/**
 * Which screens exist on the Solana build, and where the ones that do not should go instead (2026-09-19).
 *
 * The app was built on Base and carries its whole surface: perps, Aave yield, 1inch swaps and limit orders, cross-chain
 * quotes, Basenames, the Graph, contract approvals. On a Solana build every one of those either reads a chain it is not
 * on or places through a venue that does not exist here, and forty of them were one or two taps from Home. A judge who
 * opened the centre tab got a WETH swap quoted on Base.
 *
 * One list, so a screen is hidden in one place: the route guard redirects to it, and every list of links (Explore,
 * Settings, Profile, Safety, Portfolio, chat shortcuts) filters through `shownHere`. The screens are hidden, not
 * deleted — the Base build still ships them.
 */
import { isSolana } from '@/chain';

/** Route prefixes with no Solana implementation. A prefix matches itself and anything under it. */
export const HIDDEN_ON_SOLANA: readonly string[] = [
  // Perpetuals and futures: Hyperliquid data, nothing tradable here.
  '/futures',
  '/perp',
  '/funding',
  // Aave on Base.
  '/yield',
  '/rates',
  '/balance',
  '/allocation',
  // 1inch on Base: limit orders, cross-chain, route and price comparison, the order ticket.
  '/limit-orders',
  '/crosschain',
  '/route',
  '/crosscheck',
  '/tokens',
  '/order',
  // Base names, the business treasury, the subgraph and its sponsors.
  '/basename',
  '/business',
  '/graph',
  '/spend',
  '/sponsors',
  // The Solidity delegation: its approvals, its logs, its verifier, its anchor, its Privy policy, its flatten.
  '/approvals',
  '/history',
  '/verify',
  '/judge',
  '/audit/anchor',
  '/policy',
  '/flatten',
  '/sell-everything',
  // Base deployments and Base-only strategy kinds.
  '/networks',
  '/strategy/grid',
  '/strategy/yield',
  // Proposals are built from Base tokens; the Base tickers' earnings calendar.
  '/proposals',
  '/earnings',
  '/proposal',
  // The Assets tab draws a Base target mix; Portfolio is the Solana holdings view. More is an empty tab.
  '/holdings',
  '/more',
  // Compares Base crypto (WETH, cbBTC) over CoinGecko history; nothing on it trades here.
  '/compare',
  // The day's movers are Hyperliquid perps and spot crypto, each tagged "Perp"; none of them trades here.
  '/movers',
];

/**
 * Base screens whose Solana counterpart is the xStocks market: the class-by-class Markets list (crypto, commodities,
 * pre-IPO, with gold the only price) and Search, which ranked Hyperliquid perps first. On Solana what can be found and
 * traded is an xStock, and `/xstocks` lists, filters and prices every one.
 */
const XSTOCKS_INSTEAD: readonly string[] = ['/markets', '/search'];

/**
 * Where a Base route that has a Solana counterpart goes instead. The Swap tab becomes the xStocks market; a stock's
 * oracle page becomes its xStock ticket.
 */
export function solanaRedirect(path: string): string | null {
  if (!isSolana) return null;
  if (path === '/swap' || path.startsWith('/swap?')) return '/xstocks';
  if (XSTOCKS_INSTEAD.includes(path.split('?')[0] ?? path)) return '/xstocks';
  const oracle = path.match(/^\/oracle\/([^/?]+)/);
  if (oracle) return `/xstock/${oracle[1]}`;
  // An xStock's asset page is its ticket; other assets (SOL, BTC) keep their chart.
  const asset = path.match(/^\/(?:asset|chart)\/([A-Z0-9]+x)(?:[/?]|$)/);
  if (asset) return `/xstock/${asset[1]}`;
  if (hiddenOn(path, true)) return `/not-here?from=${encodeURIComponent(path)}`;
  return null;
}

/** Whether `path` is hidden on a Solana build (`solana` is the build flag, a parameter so it can be tested). */
export function hiddenOn(path: string, solana: boolean = isSolana): boolean {
  if (!solana) return false;
  const bare = path.split('?')[0] ?? path;
  return HIDDEN_ON_SOLANA.some((p) => bare === p || bare.startsWith(`${p}/`));
}

/** Whether a link to `path` should be drawn on this build. */
export function shownHere(path: string): boolean {
  // A link to a redirected route would be a second way to the same screen, so it is not drawn either.
  return !hiddenOn(path) && !(isSolana && (path === '/swap' || path.startsWith('/oracle') || XSTOCKS_INSTEAD.includes(path)));
}
