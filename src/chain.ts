/**
 * Which chain the APP signs on.
 *
 * There was no such thing. `PrivyProvider` named `baseSepolia` as its `defaultChain` and nothing
 * else in the client mentioned a chain at all — so every transaction the USER signs went to Base
 * Sepolia regardless of what the executor was settling on. On a `base-fork` deployment that is
 * every write in the product pointed at the wrong network:
 *
 *   - the delegation `grant` lands on Sepolia while the executor reads the fork, so the bot has
 *     permission on a chain nobody is trading, and none where it is
 *   - the ERC-20 approvals go with it
 *   - a withdrawal is signed against a chain that does not hold the funds
 *
 * It showed up in Privy's own confirmation sheet: "Network: Base Sepolia" over a Base-mainnet USDC
 * address, with `balanceOf` returning `0x` because that contract has no code there.
 *
 * This mirrors `server/src/evm/chains.ts` deliberately — the app and the executor have to agree
 * about which chain they are on, and the only way to be sure is for both to read it from the same
 * name in the same `.env`.
 */
import { base, baseSepolia } from 'viem/chains';
import type { Chain } from 'viem';

export type ChainKey = 'base' | 'base-sepolia' | 'base-fork' | 'localnet';

export const CHAIN_KEY = (process.env.EXPO_PUBLIC_XORR_CHAIN ?? 'base-sepolia') as ChainKey;

/**
 * A fork of Base IS Base — same id, same deployed contracts, different node. So the chain is Base
 * with its RPC replaced, exactly as the executor does it; anything else and viem believes the
 * chain has no Multicall3 and silently reads zeros.
 */
function withRpc(chain: Chain, rpc: string | undefined): Chain {
  if (!rpc) return chain;
  return { ...chain, rpcUrls: { default: { http: [rpc] }, public: { http: [rpc] } } };
}

const RPC = process.env.EXPO_PUBLIC_CHAIN_RPC;

export const activeChain: Chain =
  CHAIN_KEY === 'base'
    ? withRpc(base, RPC)
    : CHAIN_KEY === 'base-fork' || CHAIN_KEY === 'localnet'
      ? withRpc({ ...base, name: 'Base (local fork)' }, RPC ?? 'http://127.0.0.1:8545')
      : withRpc(baseSepolia, RPC);

/**
 * Every chain the wallet may be asked to switch to.
 *
 * The active one first: Privy offers the list, and a user who is shown two Bases has to guess.
 * Base mainnet stays available so a wallet funded there is still readable.
 */
export const supportedChains: Chain[] =
  activeChain.id === base.id ? [activeChain, baseSepolia] : [activeChain, base];

/** For the screens that name the network to the user. */
export const chainLabel =
  CHAIN_KEY === 'base'
    ? 'Base'
    : CHAIN_KEY === 'base-sepolia'
      ? 'Base Sepolia'
      : 'Base (local fork)';


/**
 * Can the USER's wallet actually sign on this chain?
 *
 * Privy's embedded wallet previews and broadcasts through Privy's own RPC for a chain it knows, and
 * a fork of Base is chain 8453 — indistinguishable from real Base. Pointing `rpcUrls` at the fork
 * changes what the app reads and not what Privy signs against, so on a fork build every
 * user-signed transaction is simulated against real Base, where the wallet holds nothing:
 *
 *   Execution reverted with reason: ERC20: transfer amount exceeds balance
 *
 * — over an amount shown as `0 USDC`. Which is true of real Base and says nothing about the fork
 * the user is looking at, and there is no way to tell that from the message.
 *
 * The bot's own trades are unaffected: the executor signs with its delegate key against the RPC we
 * give it. This is only the transactions a PERSON signs — the grant, the approvals, a withdrawal.
 *
 * So the screens that ask for a signature say so up front rather than letting Privy deliver a
 * revert nobody can act on.
 */
export const userSigningWorks = CHAIN_KEY === 'base' || CHAIN_KEY === 'base-sepolia';

export const userSigningNote =
  `This build settles on ${chainLabel}. Your wallet signs through Privy, which uses public Base — ` +
  `so a transaction you sign here will not go through. Run against Base Sepolia to sign for real.`;

/**
 * Can a deposit code name the chain this build is on?
 *
 * A deposit code encodes `ethereum:<address>@<chainId>` (EIP-681), and a phone wallet that scans it opens on that chain
 * id. On Base and Base Sepolia the id is the chain this build reads. A fork of Base is 8453 too — real Base's id — so on a
 * fork build the same code opens a phone wallet on real Base, where a transfer is real money sent to an address whose
 * balance this build never reads.
 */
export const depositQrWorks = CHAIN_KEY === 'base' || CHAIN_KEY === 'base-sepolia';

export const depositQrNote =
  `No code on this build: it settles on ${chainLabel}, which shares real Base's chain id (${activeChain.id}), so a code ` +
  `would open a phone wallet on real Base — where a transfer is real money that never arrives here.`;
