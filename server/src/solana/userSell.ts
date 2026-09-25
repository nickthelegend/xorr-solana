/**
 * A sale the OWNER signs, from the app (2026-09-19; through Jupiter since 2026-09-24).
 *
 * Jupiter's own swap transaction, built for the owner's wallet: their shares go into the route and USDC comes back to
 * their own account, with the owner as the only signer and fee payer. The executor builds it from a live quote, the
 * owner signs in Privy and broadcasts, and `verifyUserSell` reads the confirmed transaction back before anything is
 * booked.
 *
 * It used to settle against the venue vault — the owner's shares into xorr's account, the vault's USDC out at the
 * quote — which is real transfers with no market in between. A sale is a trade, so it now goes to the market.
 */
import { PublicKey, type Connection } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';
import { connection as defaultConnection } from './connection.js';
import { ataFor, readMintScale, tokenProgramForMint, fromUiAmount, toUiAmount } from './balances.js';
import { DEFAULT_MINTS } from './clusters.js';
import { tradableToken } from '../venues/tradable-token.js';
import { buildOwnerSwap, quote } from '../venues/jupiter.js';

export class SellRefused extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = 'SellRefused';
  }
}

export type PreparedSell = {
  /** Jupiter's swap for the owner's wallet, unsigned, base64. */
  transaction: string;
  blockhash: string;
  lastValidBlockHeight: number;
  symbol: string;
  units: number;
  usd: number;
  price: number;
};

/**
 * The token this symbol names, whichever class issued it.
 *
 * This asked `XSTOCKS`, so the owner's own signed sale refused a T-Token — and "Withdraw
 * everything" is built on exactly this call. Before `/wallet/tokens` reported the class, that flow
 * skipped the holding and then sent the USDC, so "everything" left a position behind; once the
 * holding became visible it aborted the whole withdrawal instead. Neither is a withdrawal.
 *
 * Nothing else in the sale is xStock-specific — the program, the scale, the quote and the transfer
 * are all read from the mint — and `delegation.ts`, the path that already closes a T-Token on
 * chain, builds the same `transferChecked`. So this is the one line that differed.
 */
function stockFor(symbol: string) {
  const token = tradableToken(symbol);
  if (!token) throw new SellRefused('not_tradable', `${symbol} is not a token this can sell.`);
  return token;
}

/** Build the owner's Jupiter sale of `units` shares (as a holder sees them), from a live quote. */
export async function prepareUserSell(
  params: { owner: string; symbol: string; units: number },
  conn: Connection = defaultConnection,
): Promise<PreparedSell> {
  if (!(params.units > 0)) throw new SellRefused('invalid_amount', 'The number of shares must be above zero.');
  const stock = stockFor(params.symbol);
  const owner = new PublicKey(params.owner);
  const xMint = new PublicKey(stock.address);
  const xProg = tokenProgramForMint(xMint);

  const xScale = await readMintScale(xMint, conn, xProg);
  const asked = fromUiAmount(params.units, xScale);
  const ownerX = ataFor(owner, xMint, xProg);
  const held = await getAccount(conn, ownerX, 'confirmed', xProg).catch(() => null);
  if (!held || held.amount === 0n) throw new SellRefused('nothing_to_sell', `You hold no ${stock.symbol} to sell.`);
  /*
   * "All of it" arrives as the holding rounded to eight places, which can come back a raw unit or two past the balance
   * once the multiplier is undone (2026-09-23). Within that rounding it IS the holding, and is sold as the holding.
   */
  const rounding = 10n ** BigInt(Math.max(0, xScale.decimals - 8)) * 2n + 2n;
  const units = asked > held.amount && asked - held.amount <= rounding ? held.amount : asked;
  if (units > held.amount) {
    throw new SellRefused('over_balance', `You hold ${toUiAmount(held.amount, xScale)} ${stock.symbol}, fewer than that.`);
  }

  let q: Awaited<ReturnType<typeof quote>>;
  try {
    q = await quote({ inSymbolOrMint: stock.address, outSymbolOrMint: 'USDC', amountUnits: units, slippageBps: 50, legacy: true });
  } catch (e) {
    throw new SellRefused('no_quote', `No venue would quote a sale of ${stock.symbol} right now (${e instanceof Error ? e.message : String(e)}).`);
  }
  const usdcOut = BigInt(q.outAmount);
  if (usdcOut <= 0n) throw new SellRefused('no_quote', `The quote for ${stock.symbol} came back empty.`);

  let built: Awaited<ReturnType<typeof buildOwnerSwap>>;
  try {
    built = await buildOwnerSwap({ quoteResponse: q, owner, conn });
  } catch (e) {
    throw new SellRefused('no_route', `Jupiter could not build a sale of ${stock.symbol} right now (${e instanceof Error ? e.message : String(e)}).`);
  }
  const { transaction: tx, blockhash, lastValidBlockHeight } = built;

  const soldUnits = toUiAmount(units, xScale);
  const usd = Number(usdcOut) / 1e6;
  return {
    transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
    blockhash,
    lastValidBlockHeight,
    symbol: stock.symbol,
    units: soldUnits,
    usd,
    price: usd / soldUnits,
  };
}

export type VerifiedSell = { symbol: string; units: number; usd: number; price: number; slot: number };

/**
 * Read a sale back from the chain: confirmed without error, signed by the owner, executed by the Jupiter program, and
 * the owner's token fell while their USDC rose. A transfer to anyone at all is not a sale; a swap through the market is.
 */
export async function verifyUserSell(
  params: { owner: string; signature: string; symbol: string },
  conn: Connection = defaultConnection,
): Promise<VerifiedSell> {
  const stock = stockFor(params.symbol);
  const got = await conn.getTransaction(params.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!got) throw new SellRefused('not_found', 'That transaction is not on the chain (yet).');
  if (got.meta?.err) throw new SellRefused('failed', 'That transaction failed on the chain, so nothing was sold.');
  const msg = got.transaction.message;
  const signers = msg.staticAccountKeys.slice(0, msg.header.numRequiredSignatures).map((k) => k.toBase58());
  if (!signers.includes(params.owner)) {
    throw new SellRefused('not_a_sale', 'That transaction was not signed by this wallet.');
  }
  if (!msg.staticAccountKeys.some((k) => k.toBase58() === DEFAULT_MINTS.JUPITER_V6)) {
    throw new SellRefused('not_a_sale', 'That transaction did not go through Jupiter, so it is not a sale.');
  }
  const change = (mint: string) => {
    const pre = got.meta?.preTokenBalances?.find((b) => b.owner === params.owner && b.mint === mint);
    const post = got.meta?.postTokenBalances?.find((b) => b.owner === params.owner && b.mint === mint);
    return { delta: BigInt(post?.uiTokenAmount.amount ?? '0') - BigInt(pre?.uiTokenAmount.amount ?? '0'), decimals: post?.uiTokenAmount.decimals ?? pre?.uiTokenAmount.decimals ?? 6 };
  };
  const x = change(stock.address);
  const cash = change(DEFAULT_MINTS.USDC);
  if (x.delta >= 0n || cash.delta <= 0n) throw new SellRefused('not_a_sale', 'That transaction did not sell shares for USDC.');
  const xScale = await readMintScale(new PublicKey(stock.address), conn);
  const units = toUiAmount(-x.delta, xScale);
  const usd = Number(cash.delta) / 1e6;
  return { symbol: stock.symbol, units, usd, price: usd / units, slot: got.slot };
}
