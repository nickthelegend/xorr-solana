/**
 * Agent & asset identity gradients — design.md §1 "Agent identity gradients".
 *
 * Every mark is `radial-gradient(circle at 32% 26%, c1, c2 74%)`. The off-center origin IS the
 * specular highlight and MUST NOT MOVE — design.md states this explicitly.
 *
 * React Native has no CSS radial gradient, so `AgentOrb` renders this with react-native-svg's
 * <RadialGradient> using exactly these numbers: fx/fy = 32%/26%, the c2 stop at 74%.
 */

import { assetClasses } from '../data/fixtures/markets';
import { normaliseSeed, pick, seededRandom } from './seed';

export type GradientPair = { c1: string; c2: string };

/** The five agent gradients. design.md §1. */
export const agentGradients = {
  'Momentum Scout': { c1: '#5B93FF', c2: '#1B44CE' },
  Signals: { c1: '#5B93FF', c2: '#1B44CE' },
  'Earnings Desk': { c1: '#F0BE55', c2: '#C98518' },
  Stocks: { c1: '#F0BE55', c2: '#C98518' },
  'Yield Keeper': { c1: '#49E39B', c2: '#12A45F' },
  Crypto: { c1: '#49E39B', c2: '#12A45F' },
  'Drawdown Guard': { c1: '#B58CFF', c2: '#7A45E0' },
  Strategist: { c1: '#C79BFF', c2: '#7B3FE4' },
} as const satisfies Record<string, GradientPair>;

export type AgentGradientName = keyof typeof agentGradients;

/**
 * Gradients for agents §1 does not name.
 *
 * `agentGradient` used to give any unknown name Momentum Scout's blue, so a new agent arrived wearing
 * another agent's identity — the mistake `assetGradient` below already refuses to make. These sit
 * beside the §1 five (a light c1 falling into a deeper c2 at the same lightness), none of them
 * repeats one, and none is the profit green or the loss red.
 */
export const AGENT_PALETTE = [
  { c1: '#5ED8F5', c2: '#1690C4' }, // cyan
  { c1: '#FF8FC7', c2: '#D1408F' }, // rose
  { c1: '#FFB35C', c2: '#DD6B12' }, // orange
  { c1: '#8F8CFF', c2: '#4A45D8' }, // indigo
  { c1: '#B7C0CC', c2: '#667183' }, // slate
  { c1: '#5BE6D0', c2: '#139C8B' }, // mint
] as const satisfies readonly GradientPair[];

/** The exact geometry of the recipe. Consumed by AgentOrb / AssetMark; never hand-tune per call. */
export const RADIAL = {
  /** `circle at 32% 26%` — the specular origin. */
  fx: '32%',
  fy: '26%',
  /** `c2 74%` — where the second stop lands. */
  c2Stop: '74%',
  /** The gradient circle covers the whole square mark. */
  r: '74%',
} as const;

/**
 * An agent's gradient: its own from §1, or — for a name §1 does not list — one from `AGENT_PALETTE`,
 * chosen from the name so the same agent always gets the same one.
 */
export function agentGradient(name: string): GradientPair {
  const key = normaliseSeed(name);
  for (const [known, pair] of Object.entries(agentGradients)) {
    if (normaliseSeed(known) === key) return pair;
  }
  return pick(seededRandom(name), AGENT_PALETTE);
}

/**
 * Letters drawn on a mark, for an instrument no logo registry has an icon for. `ink` is the letters' colour.
 */
export type Monogram = { letters: string; ink: string };

/** A symbol's mark: its gradient, and — where no logo exists to draw — the letters that stand for it. */
export type AssetIdentity = GradientPair & { monogram?: Monogram };

/**
 * Tessera's pre-IPO tokens, as marks a person can tell apart (2026-09-25).
 *
 * None of the three is in the catalogue or in any registry `/market/logos` asks, so each one fell through to the
 * neutral grey below — and Home's Pre-IPO row, the pre-IPO list and the ticket all drew the same grey sphere for three
 * different companies. Each now wears its company's own colours with a monogram: SpaceX dark with white letters, OpenAI
 * white with black, Kalshi green. Letters, not a copied logo: a drawn wordmark would claim an issuer's artwork these
 * tokens do not come with, and the letters say only which company the token tracks.
 */
const T_TOKEN_MARKS: Readonly<Record<string, AssetIdentity>> = {
  'T-SpaceX': { c1: '#474C55', c2: '#0B0D10', monogram: { letters: 'SX', ink: '#FFFFFF' } },
  'T-OpenAI': { c1: '#FFFFFF', c2: '#C4C8CE', monogram: { letters: 'AI', ink: '#0B0D10' } },
  'T-Kalshi': { c1: '#4AE8B4', c2: '#0B9A6C', monogram: { letters: 'K', ink: '#04241A' } },
};

/**
 * The gradient for a tradable symbol.
 *
 * Every instrument in the catalogue carries its own `c1`/`c2`, and screens were typing a
 * pair in by hand at the call site — which meant one asset's identity got drawn over all of
 * them. This is that lookup, done once.
 *
 * A symbol not in the catalogue falls back to a neutral grey rather than borrowing another
 * asset's identity: an unknown mark should not claim to be something it is not.
 */
export function assetGradient(symbol: string): AssetIdentity {
  const token = T_TOKEN_MARKS[symbol];
  if (token) return token;
  const own = catalogGradient(symbol);
  if (own) return own;
  // An xStock wears its share's colours: `NVDAx` is the catalogue's `NVDAc` on Solana (2026-09-20).
  const share = /^[A-Z]{1,6}x$/.test(symbol) ? catalogGradient(`${symbol.slice(0, -1)}c`) : undefined;
  return share ?? { c1: '#9AA3AD', c2: '#5C636B' };
}

function catalogGradient(symbol: string): GradientPair | undefined {
  for (const cls of assetClasses) {
    for (const i of cls.instruments) {
      if (i.sym === symbol) return { c1: i.c1, c2: i.c2 };
    }
  }
  return undefined;
}
