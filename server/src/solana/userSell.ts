/**
 * A sale the OWNER signs, from the app (2026-09-19).
 *
 * One transaction, both legs, so neither side can be left half done: the owner's xStock moves into the venue vault
 * (signed by the owner) and the vault pays the owner USDC (signed by the vault) at a live Jupiter quote for exactly that
 * many shares. The executor builds it, the vault signs its leg, the owner signs theirs in Privy and broadcasts, and
 * `verifyUserSell` reads the confirmed transaction back before anything is booked.
 *
 * It settles against the vault, not through a Jupiter route, and says so (`venue: 'venue-vault'`): the price is the
 * route's live quote, the transfers are real, and there is no AMM in the middle. A fork's pools drift from mainnet and
 * do not include the sell direction, so a user-signed route would fail simulation more often than it filled.
 */
import { PublicKey, Transaction, type Connection } from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
} from '@solana/spl-token';
import { connection as defaultConnection } from './connection.js';
import { ataFor, readMintScale, tokenProgramForMint, fromUiAmount, toUiAmount } from './balances.js';
import { DEFAULT_MINTS } from './clusters.js';
import { venueVaultKeypair } from './keys.js';
import { tradableToken } from '../venues/tradable-token.js';
import { quote } from '../venues/jupiter.js';

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
  /** The partially signed transaction (vault leg signed), base64. */
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

/** Build the two-leg sale for `units` shares (as a holder sees them), priced by a live Jupiter quote. */
export async function prepareUserSell(
  params: { owner: string; symbol: string; units: number },
  conn: Connection = defaultConnection,
): Promise<PreparedSell> {
  if (!(params.units > 0)) throw new SellRefused('invalid_amount', 'The number of shares must be above zero.');
  const stock = stockFor(params.symbol);
  const owner = new PublicKey(params.owner);
  const vault = venueVaultKeypair();
  const xMint = new PublicKey(stock.address);
  const usdcMint = new PublicKey(DEFAULT_MINTS.USDC);
  const xProg = tokenProgramForMint(xMint);
  const usdcProg = tokenProgramForMint(usdcMint);

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

  let usdcOut: bigint;
  try {
    const q = await quote({ inSymbolOrMint: stock.address, outSymbolOrMint: 'USDC', amountUnits: units, slippageBps: 50 });
    usdcOut = BigInt(q.outAmount);
  } catch (e) {
    throw new SellRefused('no_quote', `No venue would quote a sale of ${stock.symbol} right now (${e instanceof Error ? e.message : String(e)}).`);
  }
  if (usdcOut <= 0n) throw new SellRefused('no_quote', `The quote for ${stock.symbol} came back empty.`);

  const vaultUsdc = ataFor(vault.publicKey, usdcMint, usdcProg);
  const vaultCash = await getAccount(conn, vaultUsdc, 'confirmed', usdcProg).catch(() => null);
  if (!vaultCash || vaultCash.amount < usdcOut) {
    throw new SellRefused('venue_short', 'The venue cannot cover that sale right now, so nothing was prepared.');
  }

  const vaultX = ataFor(vault.publicKey, xMint, xProg);
  const ownerUsdc = ataFor(owner, usdcMint, usdcProg);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(owner, vaultX, vault.publicKey, xMint, xProg),
    createAssociatedTokenAccountIdempotentInstruction(owner, ownerUsdc, owner, usdcMint, usdcProg),
    createTransferCheckedInstruction(ownerX, xMint, vaultX, owner, units, xScale.decimals, [], xProg),
    createTransferCheckedInstruction(vaultUsdc, usdcMint, ownerUsdc, vault.publicKey, usdcOut, 6, [], usdcProg),
  );
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;
  tx.partialSign(vault);

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
 * Read a sale back from the chain: confirmed without error, signed by the owner AND the vault (only `prepareUserSell`
 * produces the vault's signature), the owner's xStock fell and their USDC rose.
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
  if (!signers.includes(params.owner) || !signers.includes(venueVaultKeypair().publicKey.toBase58())) {
    throw new SellRefused('not_a_sale', 'That transaction is not a sale this app prepared.');
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
