/**
 * Tokenized equities on Base (STOCKS) and Backed Finance xStocks on Solana (XSTOCKS).
 *
 * PLAN.md §8.4 / §12.19.
 *
 * Base: Ondo Global Markets issued equities (0xb2000… vanity prefix, 'c' suffix) routed via 1inch.
 * Solana: Backed Finance equities (Token-2022, 8 decimals, 'x' suffix) routed via Jupiter aggregator.
 */
import type { Address } from 'viem';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { query } from '../db/index.js';

/* ── Base / EVM Equities ─────────────────────────────────────────────────── */

export type StockToken = {
  /** The on-chain symbol. What the app shows, so the screen matches the block explorer. */
  symbol: string;
  /** The underlying listed company. */
  name: string;
  address: Address;
  decimals: number;
};

export const STOCKS: Record<string, StockToken> = {
  NVDAc: {
    symbol: 'NVDAc',
    name: 'NVIDIA Corporation',
    address: '0xb20000000000000000000078ee7ce2fE4908108C',
    decimals: 8,
  },
  AAPLc: {
    symbol: 'AAPLc',
    name: 'Apple Inc.',
    address: '0xb200000000000000000000C2e324d24d7eEcd1fb',
    decimals: 8,
  },
  TSLAc: {
    symbol: 'TSLAc',
    name: 'Tesla Inc.',
    address: '0xb2000000000000000000001e800a7f5189430cD0',
    decimals: 8,
  },
  METAc: {
    symbol: 'METAc',
    name: 'Meta Platforms Inc.',
    address: '0xb2000000000000000000008bC8786B856E61707C',
    decimals: 8,
  },
  MSFTc: {
    symbol: 'MSFTc',
    name: 'Microsoft Corporation',
    address: '0xB200000000000000000000Ab99cFa739E253872B',
    decimals: 8,
  },
  AMZNc: {
    symbol: 'AMZNc',
    name: 'Amazon.com Inc.',
    address: '0xb200000000000000000000d9192b6B456483C2E8',
    decimals: 8,
  },
  GOOGLc: {
    symbol: 'GOOGLc',
    name: 'Alphabet Inc.',
    address: '0xb2000000000000000000002D0BA3164cc74f58B7',
    decimals: 8,
  },
  MSTRc: {
    symbol: 'MSTRc',
    name: 'MicroStrategy Inc.',
    address: '0xb2000000000000000000004884b426556b92883d',
    decimals: 8,
  },
};

export function stockKey(symbol: string): string | undefined {
  const want = symbol.trim().toUpperCase();
  return Object.keys(STOCKS).find((k) => k.toUpperCase() === want);
}

/* ── Solana / Backed Finance xStocks ───────────────────────────────────────── */

export type XStockToken = {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  programId: string;
};

export const XSTOCKS: Record<string, XStockToken> = {
  NVDAx: {
    symbol: 'NVDAx',
    name: 'NVIDIA xStock',
    mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',
    decimals: 8,
    programId: TOKEN_2022_PROGRAM_ID.toBase58(),
  },
  TSLAx: {
    symbol: 'TSLAx',
    name: 'Tesla xStock',
    mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB',
    decimals: 8,
    programId: TOKEN_2022_PROGRAM_ID.toBase58(),
  },
  AAPLx: {
    symbol: 'AAPLx',
    name: 'Apple xStock',
    mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp',
    decimals: 8,
    programId: TOKEN_2022_PROGRAM_ID.toBase58(),
  },
  MSFTx: {
    symbol: 'MSFTx',
    name: 'Microsoft xStock',
    mint: 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX',
    decimals: 8,
    programId: TOKEN_2022_PROGRAM_ID.toBase58(),
  },
};

export function xStockKey(symbol: string): string | undefined {
  const want = symbol.trim().toUpperCase();
  return Object.keys(XSTOCKS).find((k) => k.toUpperCase() === want);
}

export function isXStock(symbol: string): boolean {
  return xStockKey(symbol) !== undefined;
}

export function isStock(symbol: string): boolean {
  return stockKey(symbol) !== undefined || xStockKey(symbol) !== undefined;
}

export function stockByMint(mint: string): XStockToken | undefined {
  return Object.values(XSTOCKS).find((s) => s.mint === mint);
}

/* ── Pricing & Observation ─────────────────────────────────────────────────── */

const PROBE_USD = 1_000;
const cache = new Map<string, { at: number; price: number }>();
const TTL_MS = 15_000;

export function clearStockPriceCache(): void {
  cache.clear();
}

export async function stockPriceUsd(symbol: string): Promise<number | null> {
  // 1. Solana xStock path
  const xKey = xStockKey(symbol);
  if (xKey) {
    const stock = XSTOCKS[xKey];
    if (!stock) return null;

    const hit = cache.get(xKey);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.price;

    try {
      const { quoteJupiter } = await import('./jupiter.js');
      const { SOLANA_MINTS } = await import('../solana/clusters.js');
      const q = await quoteJupiter({
        // The cluster's USDC, not a literal — a fork clones the real mint but `SOLANA_USDC_MINT`
        // can point elsewhere, and `place.ts` prices and spends through `SOLANA_MINTS`. Two
        // different USDC mints between the mark and the fill is a mispriced trade.
        inputMint: SOLANA_MINTS.usdc,
        outputMint: stock.mint,
        amount: 10_000_000,
      });

      if (q && q.outAmountUnits > 0) {
        const outTokens = q.outAmountUnits / 10 ** stock.decimals;
        const price = 10 / outTokens;
        cache.set(xKey, { at: Date.now(), price });
        recordObservation(xKey, price);
        return price;
      }
    } catch {
      // Same answer as an empty route: there is no price. Falls through to `null` below.
    }

    /*
     * Nothing routes, so there is no price — and `null` is what that is.
     *
     * A table of four reference prices used to be returned here, with $100 for anything not in it.
     * That is the Base path's mistake in reverse: `priceOf` refuses to invent an equity price and
     * says "No route for NVDAc right now" instead (see market/stock-price.test.ts), and the Solana
     * path was quietly answering $216.50 for an unroutable NVDAx — a number that sizes a trade,
     * passes a cap check and gets written into a fill record. Nothing downstream could tell it
     * apart from a real mark.
     */
    return null;
  }

  // 2. Base EVM stock path
  const key = stockKey(symbol);
  if (!key) return null;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.price;

  const { quote } = await import('./oneinch.js');
  const q = await quote({
    inSymbol: 'USDC',
    outSymbol: key,
    amount: PROBE_USD,
    skipPriceImpact: true,
  }).catch(() => null);

  if (!q || !(q.outAmount > 0)) return null;
  const price = PROBE_USD / q.outAmount;
  cache.set(key, { at: Date.now(), price });
  recordObservation(key, price);
  return price;
}

export function recordObservation(symbol: string, usd: number): void {
  if (!(usd > 0)) return;
  void query(`INSERT INTO price_observations (symbol, usd) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    symbol,
    usd,
  ]).catch(() => undefined);
}

export async function observedHistory(
  symbol: string,
  hours = 24 * 30,
): Promise<{ at: number; usd: number }[]> {
  const key = stockKey(symbol) ?? xStockKey(symbol);
  if (!key) return [];
  const rows = await query<{ at: Date; usd: string }>(
    `SELECT at, usd FROM price_observations
      WHERE symbol = $1 AND at > now() - ($2 || ' hours')::interval
      ORDER BY at ASC`,
    [key, String(hours)],
  );
  return rows.map((r) => ({ at: new Date(r.at).getTime(), usd: Number(r.usd) }));
}

let functional: Promise<boolean> | undefined;

export function equitiesFunctional(): Promise<boolean> {
  functional ??= (async () => {
    const probes = Object.values(STOCKS).slice(0, 4);
    if (probes.length === 0) return false;
    const { publicClient } = await import('../evm/client.js');
    const { erc20Abi } = await import('viem');
    const { pastTheThrottle } = await import('../evm/throttle.js');
    const answers = await Promise.all(
      probes.map((p) =>
        pastTheThrottle(() =>
          publicClient.readContract({
            address: p.address,
            abi: erc20Abi,
            functionName: 'totalSupply',
          }),
        ).catch(() => 0n),
      ),
    );
    return answers.some((a) => a > 0n);
  })();
  return functional;
}

export function resetEquitiesFunctional(): void {
  functional = undefined;
}
