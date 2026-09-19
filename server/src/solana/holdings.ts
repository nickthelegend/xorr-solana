/**
 * Everything a Solana wallet holds that this app knows how to value, read from the chain (2026-09-19).
 *
 * USDC and SOL, and every xStock the wallet has a token account for — in the units a holder sees: the raw amount times
 * the mint's Scaled UI multiplier, so a split or an auto-reinvested dividend moves the number the way the issuer meant.
 * Each xStock is valued at the live Jupiter price; one Jupiter cannot price is listed with no value rather than a zero.
 *
 * `/wallet/balance` counted USDC alone, so a wallet that had just bought $50 of NVDAx showed $50 less than it held; and
 * `/wallet/tokens` read the wallet as an EVM address and answered 500.
 */
import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, unpackAccount } from '@solana/spl-token';
import { connection } from './connection.js';
import { ataFor, readMintScale, readSolanaBalances, toUiAmount } from './balances.js';
import { XSTOCKS, xStockPriceUsd } from '../venues/xstocks.js';

export type SolanaHolding = {
  symbol: string;
  name: string;
  /** The mint. */
  address: string;
  decimals: number;
  /** As a holder sees it: raw × the issuer's multiplier. */
  units: number;
  /** At the live price, or null when nothing prices it right now. */
  usd: number | null;
};

export type SolanaHoldings = {
  usdc: number;
  sol: number;
  xstocks: SolanaHolding[];
  /** USDC plus every priced xStock. SOL is the fee balance and is not counted as money here. */
  totalUsd: number;
  /** An xStock is held that nothing could price, so `totalUsd` leaves it out. */
  partial: boolean;
};

export async function solanaHoldings(owner: string): Promise<SolanaHoldings> {
  const base = await readSolanaBalances(owner);
  const tokens = Object.values(XSTOCKS);
  const accounts = tokens.map((t) => ataFor(owner, new PublicKey(t.address), TOKEN_2022_PROGRAM_ID));
  const infos = await connection.getMultipleAccountsInfo(accounts, 'confirmed');

  const xstocks: SolanaHolding[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const info = infos[i];
    if (!info) continue;
    const raw = unpackAccount(accounts[i]!, info, TOKEN_2022_PROGRAM_ID).amount;
    if (raw === 0n) continue;
    const t = tokens[i]!;
    const units = toUiAmount(raw, await readMintScale(t.address));
    const price = await xStockPriceUsd(t.symbol).catch(() => null);
    xstocks.push({
      symbol: t.symbol,
      name: t.name,
      address: t.address,
      decimals: t.decimals,
      units,
      usd: price === null ? null : units * price,
    });
  }

  return {
    usdc: base.usdc.amount,
    sol: base.sol.amount,
    xstocks,
    totalUsd: base.usdc.amount + xstocks.reduce((sum, h) => sum + (h.usd ?? 0), 0),
    partial: xstocks.some((h) => h.usd === null),
  };
}
