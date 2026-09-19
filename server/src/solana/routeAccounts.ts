/**
 * The accounts a fork must clone for Jupiter to execute today's routes (2026-09-19).
 *
 * The bootstrap cloned a fixed list of pool accounts written down once. A concentrated-liquidity pool is walked through
 * "tick arrays" around the current price, so as the price moved the route Jupiter quoted needed tick arrays the fork did
 * not have, simulation failed with `InvalidTickArraySequence`, and every fill fell back to the venue vault. The sell
 * direction was never cloned at all.
 *
 * Here the route is asked for at boot, in both directions, for each xStock the fork should trade: Jupiter's own
 * `swap-instructions` names every account the swap touches and every lookup table it uses. Of those, the ones that
 * exist on mainnet are cloned; executable ones are cloned as programs. The payer stands in as the user, so its own
 * token accounts are not asked for.
 */
import { Connection, PublicKey } from '@solana/web3.js';

const JUPITER = 'https://lite-api.jup.ag/swap/v1';

/** Never cloned: the runtime's own programs and sysvars, which every validator already has. */
const BUILTIN = new Set([
  '11111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'ComputeBudget111111111111111111111111111111',
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo',
  'So11111111111111111111111111111111111111112',
  'AddressLookupTab1e1111111111111111111111111',
]);
const isSysvar = (k: string) => k.startsWith('Sysvar');
const UPGRADEABLE_LOADER = 'BPFLoaderUpgradeab1e11111111111111111111111';

export type RouteClones = { accounts: string[]; programs: string[] };

type Pair = { inputMint: string; outputMint: string; amount: bigint };

async function routeKeys(pair: Pair, user: string): Promise<string[]> {
  const q = await fetch(
    `${JUPITER}/quote?inputMint=${pair.inputMint}&outputMint=${pair.outputMint}&amount=${pair.amount}&slippageBps=200`,
  );
  if (!q.ok) throw new Error(`quote ${q.status}`);
  const quoteResponse = await q.json();
  const r = await fetch(`${JUPITER}/swap-instructions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quoteResponse, userPublicKey: user }),
  });
  if (!r.ok) throw new Error(`swap-instructions ${r.status}`);
  const body = (await r.json()) as {
    swapInstruction: { programId: string; accounts: { pubkey: string }[] };
    addressLookupTableAddresses?: string[];
  };
  return [
    body.swapInstruction.programId,
    ...body.swapInstruction.accounts.map((a) => a.pubkey),
    ...(body.addressLookupTableAddresses ?? []),
  ];
}

/**
 * Resolve the accounts to clone for buying and selling each `xstocks` mint against USDC. `exclude` are accounts the
 * caller supplies itself (the overridden mints) or must not clone (the user standing in).
 */
export async function resolveRouteClones(params: {
  upstream: Connection;
  usdcMint: string;
  xstocks: { mint: string; decimals: number }[];
  user: string;
  exclude: string[];
}): Promise<RouteClones> {
  const skip = new Set([...params.exclude, params.user]);
  const keys = new Set<string>();
  // Mainnet's own Token-2022 program, cloned rather than the validator's bundled build: xStocks rely on its newest
  // extensions (Scaled UI), and a validator a release behind would read them differently.
  keys.add('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
  for (const x of params.xstocks) {
    for (const pair of [
      { inputMint: params.usdcMint, outputMint: x.mint, amount: 100_000_000n },
      { inputMint: x.mint, outputMint: params.usdcMint, amount: 10n ** BigInt(x.decimals) / 4n },
    ]) {
      try {
        for (const k of await routeKeys(pair, params.user)) keys.add(k);
      } catch (e) {
        console.warn(`[fork] no route resolved for ${pair.inputMint.slice(0, 4)}→${pair.outputMint.slice(0, 4)}: ${e instanceof Error ? e.message : e}`);
      }
    }
    keys.add(x.mint);
  }
  const candidates = [...keys].filter((k) => !skip.has(k) && !BUILTIN.has(k) && !isSysvar(k));
  const accounts: string[] = [];
  const programs: string[] = [];
  for (let i = 0; i < candidates.length; i += 100) {
    const batch = candidates.slice(i, i + 100);
    const infos = await params.upstream.getMultipleAccountsInfo(batch.map((k) => new PublicKey(k)));
    batch.forEach((k, j) => {
      const info = infos[j];
      if (!info) return; // an account that does not exist yet (a user ATA) cannot be cloned, and is created on use
      // An upgradeable program is cloned with its program data; anything else, executable or not, as an account.
      if (info.executable && info.owner.toBase58() === UPGRADEABLE_LOADER) programs.push(k);
      else accounts.push(k);
    });
  }
  return { accounts, programs };
}
