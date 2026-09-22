/**
 * Everything a Solana wallet holds that this app knows how to value, read from the chain (2026-09-19).
 *
 * USDC and SOL, and every tradable token the wallet has an account for — in the units a holder sees: the raw amount
 * times the mint's Scaled UI multiplier, so a split or an auto-reinvested dividend moves the number the way the issuer
 * meant. Each is valued live; one that cannot be priced is listed with no value rather than a zero.
 *
 * `/wallet/balance` counted USDC alone, so a wallet that had just bought $50 of NVDAx showed $50 less than it held; and
 * `/wallet/tokens` read the wallet as an EVM address and answered 500.
 *
 * ## Both classes, and why the field is not called `xstocks` any more (2026-09-22)
 *
 * This walked `XSTOCKS`, so a T-Token the wallet genuinely held was invisible to all three callers. On `/wallet/balance`
 * that was an understated total. On `/panic/preview` it was the kill switch: the panic list is built from this, so a
 * held T-Token was not offered for closing and the screen said there was nothing there — while the grant had, by then,
 * correctly approved the delegate on it. A safety control that silently omits an asset class is worse than one that
 * fails loudly.
 *
 * Renaming the field rather than quietly widening it is deliberate: it made every consumer a compile error, which is
 * how all three were found instead of two.
 */
import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, unpackAccount } from '@solana/spl-token';
import { connection } from './connection.js';
import { ataFor, readMintScale, readSolanaBalances, toUiAmount } from './balances.js';
import { xStockPriceUsd } from '../venues/xstocks.js';
import { tesseraPriceUsd } from '../venues/tessera.js';
import { tradableTokens } from '../venues/tradable-token.js';
import { DEFAULT_MINTS } from './clusters.js';

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
  /** Every tradable token held, both classes. */
  tokens: SolanaHolding[];
  /**
   * USDC held in the owner's agent wallets (`agents/wallet.ts`): the owner's money, in accounts other than the main one,
   * found on the chain as every other USDC account the owner owns (2026-09-23).
   */
  agentsUsdc: number;
  /** USDC plus every priced holding. SOL is the fee balance and is not counted as money here. */
  totalUsd: number;
  /** Something is held that nothing could price, so `totalUsd` leaves it out. */
  partial: boolean;
};

export async function solanaHoldings(owner: string): Promise<SolanaHoldings> {
  const base = await readSolanaBalances(owner);
  const universe = tradableTokens();
  const accounts = universe.map((t) => ataFor(owner, new PublicKey(t.address), TOKEN_2022_PROGRAM_ID));
  const infos = await connection.getMultipleAccountsInfo(accounts, 'confirmed');

  const held: SolanaHolding[] = [];
  for (let i = 0; i < universe.length; i += 1) {
    const info = infos[i];
    if (!info) continue;
    const raw = unpackAccount(accounts[i]!, info, TOKEN_2022_PROGRAM_ID).amount;
    if (raw === 0n) continue;
    const t = universe[i]!;
    const units = toUiAmount(raw, await readMintScale(t.address));
    /* Each class by the venue that actually fills it — a T-Token routes through Meteora, not Orca. */
    const price =
      t.kind === 'pre-ipo'
        ? await tesseraPriceUsd(t.symbol).catch(() => null)
        : await xStockPriceUsd(t.symbol).catch(() => null);
    held.push({
      symbol: t.symbol,
      name: t.name,
      address: t.address,
      decimals: t.decimals,
      units,
      usd: price === null ? null : units * price,
    });
  }

  const agentsUsdc = await otherUsdcAccounts(owner);
  return {
    usdc: base.usdc.amount,
    sol: base.sol.amount,
    tokens: held,
    agentsUsdc,
    totalUsd: base.usdc.amount + agentsUsdc + held.reduce((sum, h) => sum + (h.usd ?? 0), 0),
    partial: held.some((h) => h.usd === null),
  };
}

/** USDC in every account the owner owns other than the associated one — the agent wallets — read from the chain. */
async function otherUsdcAccounts(owner: string): Promise<number> {
  const main = ataFor(owner, new PublicKey(DEFAULT_MINTS.USDC)).toBase58();
  const res = await connection.getParsedTokenAccountsByOwner(new PublicKey(owner), { mint: new PublicKey(DEFAULT_MINTS.USDC) }, 'confirmed');
  let total = 0;
  for (const { pubkey, account } of res.value) {
    if (pubkey.toBase58() === main) continue;
    const amount = (account.data as { parsed?: { info?: { tokenAmount?: { uiAmount?: number | null } } } }).parsed?.info?.tokenAmount?.uiAmount;
    total += typeof amount === 'number' ? amount : 0;
  }
  return total;
}
