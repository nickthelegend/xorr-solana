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

/**
 * The route the executor will actually ask for on a fork: the pinned venue, direct, legacy (`venues/jupiter.ts`), and
 * Jupiter's unconstrained route beside it, so both are cloned.
 */
/*
 * The same shapes the executor quotes, in the same order (`venues/jupiter.ts`): a direct Whirlpool route, then a direct
 * Meteora DLMM route, both legacy, then whatever Jupiter picks. What the fork clones is what the executor will ask for.
 */
const ROUTE_SHAPES = [
  '&dexes=Whirlpool&onlyDirectRoutes=true&asLegacyTransaction=true',
  '&dexes=Meteora%20DLMM&onlyDirectRoutes=true&asLegacyTransaction=true',
  '',
];

/** Between calls to Jupiter's public tier, which answers a burst with 400s and 429s. */
const SPACING_MS = Number(process.env.FORK_ROUTE_SPACING_MS ?? 900);
const ATTEMPTS = 4;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One request to Jupiter, paced and retried.
 *
 * The bootstrap asks for a quote and a set of swap instructions for every mint in both directions,
 * which is a burst the public tier refuses partway through. Before this it was a bare `fetch`, so
 * the refusal surfaced as "no route resolved" and the mints that happened to be LAST in the list
 * lost their routes — which on 2026-09-21 was every Tessera pair but one: the fork could buy
 * T-SpaceX and not sell it, and could not trade T-OpenAI or T-Kalshi at all.
 *
 * A rate limit is not "there is no route", and a list whose tail silently loses its liquidity
 * because of where it sits in an array is the kind of failure that looks like a data problem for a
 * day before anyone reads the log.
 */
async function jupiterFetch(url: string, init?: RequestInit): Promise<Response> {
  let last = '';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    const body = await res.text().catch(() => '');
    last = `${res.status} ${body.slice(0, 120)}`;
    /*
     * A 400 that says there is no route is final; any other 400 is the public tier refusing a burst (2026-09-23). All
     * six Tessera pairs, last in the list, came back "quote 400" on a fresh fork and none was retried, so the fork
     * booted unable to settle a single pre-IPO trade. Jupiter names the permanent case: `NO_ROUTES_FOUND`.
     */
    if (res.status === 400 && /NO_ROUTES_FOUND|COULD_NOT_FIND_ANY_ROUTE|TOKEN_NOT_TRADABLE/.test(body)) break;
    if (res.status === 400) {
      await wait(SPACING_MS * attempt * 2);
      continue;
    }
    /*
     * Only a rate limit or a server fault is worth asking again.
     *
     * 400 was retried here for an afternoon, which was wrong twice over: the first route shape asks
     * for a Whirlpool-only direct route, and a pair that trades on Meteora answers 400 to that
     * every time — permanently and correctly. Retrying it burned twenty seconds per pair to arrive
     * at the same answer.
     */
    if (res.status !== 429 && res.status < 500) break;
    await wait(SPACING_MS * attempt * 2);
  }
  throw new Error(`quote ${last}`);
}

async function routeKeys(pair: Pair, user: string, shape: string): Promise<string[]> {
  const q = await jupiterFetch(
    `${JUPITER}/quote?inputMint=${pair.inputMint}&outputMint=${pair.outputMint}&amount=${pair.amount}&slippageBps=200${shape}`,
  );
  const quoteResponse = await q.json();
  await wait(SPACING_MS);
  const r = await jupiterFetch(`${JUPITER}/swap-instructions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quoteResponse, userPublicKey: user, ...(shape.includes('asLegacy') ? { asLegacyTransaction: true } : {}) }),
  });
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
      /*
       * Warn once per PAIR, and only when every shape failed.
       *
       * This warned per SHAPE, so a pair whose route resolved perfectly well on the second shape
       * still logged "no route resolved" from the first — and the first is Whirlpool-only, which
       * every Meteora pair refuses. The fork's own log therefore reported all six Tessera pairs as
       * unroutable while it was cloning their routes correctly, which is worse than silence: it
       * sent someone reading it to look for a liquidity problem that did not exist.
       */
      let resolved = false;
      const failures: string[] = [];
      for (const shape of ROUTE_SHAPES) try {
        for (const k of await routeKeys(pair, params.user, shape)) keys.add(k);
        resolved = true;
        await wait(SPACING_MS);
      } catch (e) {
        failures.push(e instanceof Error ? e.message : String(e));
      }
      if (!resolved) {
        console.warn(`[fork] no route resolved for ${pair.inputMint.slice(0, 4)}→${pair.outputMint.slice(0, 4)}: ${failures.join('; ')}`);
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
