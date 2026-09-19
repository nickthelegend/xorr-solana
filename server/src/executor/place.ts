/**
 * Spend chokepoint on Solana (PLAN.md §6.3, §8.2).
 *
 * There is exactly one place capital can leave a wallet: guardAndSpend.
 * Every entry (DCA, bot, proposal, manual order) funnels through this function.
 *
 * 5-step chain:
 * 1. Delegation record check (DB / memory)
 * 2. Rules engine evaluation (kill switch, daily cap, spread, limits)
 * 3. On-chain SPL check: readDelegation() -> delegate == delegateKeypair && delegatedAmount >= wanted
 * 4. Real mark from live Jupiter quote / venues/stocks
 * 5. spendAsDelegate() (SPL Transfer signed by delegate) -> venue ATA, followed by Jupiter swap fill.
 */
import { PublicKey } from '@solana/web3.js';
import { readDelegation, spendAsDelegate, returnToOwner, usdToBaseUnits, baseUnitsToUsd } from '../solana/delegation.js';
import { markBroadcast } from '../http/request-id.js';
import { delegateKeypair, payerKeypair, venueVaultKeypair } from '../solana/keys.js';
import { connection } from '../solana/connection.js';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { ataFor, tokenProgramForMint, readMintScale, toUiAmount, fromUiAmount } from '../solana/balances.js';
import { DEFAULT_MINTS } from '../solana/clusters.js';
import { evaluate, recordSpend, type RuleContext } from '../rules/engine.js';
import { tx } from '../db/index.js';

/**
 * Count a buy against today's cap (2026-09-19). The Solana path never did, so the daily cap the rules engine enforces
 * only ever saw one order at a time: two $150 buys under a $200 cap both passed. Recorded once money has left the
 * owner; a failure to record is logged loudly rather than turning a filled order into an error.
 */
async function countSpend(walletId: string, usd: number): Promise<void> {
  await tx((client) => recordSpend(walletId, usd, client)).catch((e: unknown) =>
    console.error(`[place] ${walletId} spent ${usd.toFixed(2)} and it was NOT counted against today's cap:`, e),
  );
}
import { xStockPriceUsd, XSTOCKS, xStockKey } from '../venues/xstocks.js';
import { quote, swap, resolveMint, type FillVenue } from '../venues/jupiter.js';
import { checkEligibility } from '../solana/eligibility.js';
import { readSolanaPolicy } from '../solana/grant.js';
import { mintsOnCluster } from '../solana/settleable.js';

export type SpendIntent = {
  walletId: string;
  ownerPubkey: string;
  symbol: string;
  usd: number;
  side?: 'buy' | 'sell';
  slippageBps?: number;
  maxSpreadPct?: number;
  skipRulesEngine?: boolean;
  /** For a sell: how many shares (as a holder sees them). Otherwise `usd` at the live mark decides. */
  units?: number;
};

export type SpendReceipt = {
  placed: true;
  signature: string;
  slot: number;
  /** Which venue actually filled this. Never call a `venue-vault` fill a Jupiter swap. */
  venue: FillVenue;
  inUnits: bigint;
  outUnits: bigint;
  filledUnits: number;
  fillPrice: number;
  symbol: string;
  usd: number;
  side: 'buy' | 'sell';
};

export type SpendRefusal = {
  placed: false;
  status: 'blocked';
  reason: string;
  detail: string;
};

export type SpendOutcome = SpendReceipt | SpendRefusal;

export async function guardAndSpend(intent: SpendIntent): Promise<SpendOutcome> {
  const side = intent.side ?? 'buy';
  const symbolKey = xStockKey(intent.symbol) ?? intent.symbol;

  if (side === 'buy' && !(intent.usd > 0)) {
    return {
      placed: false,
      status: 'blocked',
      reason: 'invalid_amount',
      detail: 'The amount must be above zero.',
    };
  }

  // Verify symbol is a recognized xStock or tradable asset
  const stock = XSTOCKS[symbolKey];
  if (!stock && symbolKey !== 'USDC' && symbolKey !== 'SOL') {
    return {
      placed: false,
      status: 'blocked',
      reason: 'not_tradable',
      detail: `${intent.symbol} is not a tradable xStock on this cluster.`,
    };
  }

  // A priced xStock whose mint this cluster does not hold cannot settle here; say so before anything is read or moved.
  if (stock && !(await mintsOnCluster([stock.address])).has(stock.address)) {
    return {
      placed: false,
      status: 'blocked',
      reason: 'not_on_cluster',
      detail: `${intent.symbol} has no mint on this network, so it can be priced here but not bought.`,
    };
  }

  // 1 & 3. On-chain check: readDelegation (SPL Token program is authoritative)
  const onChainState = await readDelegation(intent.ownerPubkey, DEFAULT_MINTS.USDC);
  if (side === 'buy') {
    if (onChainState.isRevoked) {
      return {
        placed: false,
        status: 'blocked',
        reason: 'delegation_revoked',
        detail: 'The trading permission has been revoked on-chain, so nothing will be placed.',
      };
    }

    const activeDelegate = delegateKeypair().publicKey.toBase58();
    if (onChainState.delegate !== activeDelegate) {
      return {
        placed: false,
        status: 'blocked',
        reason: 'wrong_delegate',
        detail: `On-chain delegate (${onChainState.delegate ?? 'none'}) does not match the active agent delegate (${activeDelegate}).`,
      };
    }
  }

  const wantedUnits = usdToBaseUnits(intent.usd, 6);
  if (side === 'buy' && wantedUnits > onChainState.delegatedAmount) {
    return {
      placed: false,
      status: 'blocked',
      // The chain's ceiling for the whole grant, not today's cap — which the rules engine below answers in its own words.
      reason: 'allowance',
      detail: `That is more than your permission still allows in total: ${onChainState.remainingUsd.toFixed(2)} USDC of the amount you approved is left. Grant more to buy this much.`,
    };
  }

  // 2. Rules engine check (optional if skipRulesEngine = true for tests)
  if (!intent.skipRulesEngine) {
    /*
     * The cap and end date the OWNER chose, from the grant record the chain confirmed (2026-09-19). This passed the
     * on-chain allowance as the daily cap — the whole ceiling, not a day's share — and an expiry of "now + 30 days"
     * that nobody chose, so no real daily cap or end date was ever enforced. No record behind the delegation is no
     * permission.
     */
    const policy = await readSolanaPolicy({ id: intent.walletId, address: intent.ownerPubkey });
    if (!policy && side === 'buy') {
      return {
        placed: false,
        status: 'blocked',
        reason: 'no_permission',
        detail: 'There is no recorded permission for this wallet, so nothing will be placed. Grant one first.',
      };
    }
    const ruleCtx: RuleContext = {
      walletId: intent.walletId,
      usd: intent.usd,
      dailyCapUsd: policy?.dailyCapUsd ?? 0,
      delegationExpiresAt: new Date(policy?.expiresAt ?? 0),
      delegationRevoked: policy?.revoked ?? onChainState.isRevoked,
      maxSpreadPct: intent.maxSpreadPct,
      reducesRiskOnly: side === 'sell',
    };
    /*
     * Fails CLOSED (2026-09-19). A rules engine that threw was read as "allowed", so the one check that holds the
     * daily cap, the kill switch and the spread could be skipped by any error inside it.
     */
    const verdict = await evaluate(ruleCtx).catch((e: unknown) => ({
      allowed: false as const,
      reason: 'rules_unavailable',
      detail: `The spending rules could not be checked (${e instanceof Error ? e.message : String(e)}), so nothing was placed.`,
    }));
    if (!verdict.allowed) {
      return {
        placed: false,
        status: 'blocked',
        reason: verdict.reason,
        detail: verdict.detail,
      };
    }
  }

  /*
   * 3b. The issuer's own transfer gates, asked before any capital moves.
   *
   * xStocks are jurisdiction-restricted, and Token-2022 lets the issuer pause the token, freeze an
   * individual account, or create new accounts frozen. Any of those makes the delivery leg fail
   * on-chain — after the user's USDC has already left their account, since the spend and the
   * delivery are separate transactions. Asking first turns a stuck position and an unexplained
   * failure into a sentence.
   *
   * `indeterminate` blocks too. A gate we could not read is not a gate we passed, and clearing
   * someone to buy a restricted security on the strength of a failed RPC call is the worst
   * available outcome.
   */
  if (stock) {
    const eligibility = await checkEligibility(intent.ownerPubkey, stock.address).catch((err) => ({
      eligible: false,
      indeterminate: true,
      summary: `Could not check this token's transfer restrictions: ${
        err instanceof Error ? err.message : String(err)
      }`,
    }));
    if (!eligibility.eligible) {
      return {
        placed: false,
        status: 'blocked',
        reason: eligibility.indeterminate ? 'eligibility_unknown' : 'not_eligible',
        detail: eligibility.summary,
      };
    }
  }

  // 4. Real mark from live quote / venues/xstocks
  const markPrice = await xStockPriceUsd(symbolKey);
  if (!markPrice || markPrice <= 0) {
    return {
      placed: false,
      status: 'blocked',
      reason: 'no_price_feed',
      detail: `Could not obtain a live price quote for ${intent.symbol}.`,
    };
  }

  // 5. On-chain execution
  const vault = venueVaultKeypair();
  const vaultUsdcAta = ataFor(vault.publicKey, DEFAULT_MINTS.USDC);

  if (side === 'buy') {
    /*
     * The quote FIRST, then the money (2026-09-19). This moved the owner's USDC into the venue vault and only then asked
     * for a quote, so a quote that failed — no route, a rate limit, the venue down — left the USDC in the vault with
     * nothing delivered for it. A quote that fails now fails before anything has moved.
     */
    const outMint = stock ? stock.address : resolveMint(symbolKey);
    let quoteRes: Awaited<ReturnType<typeof quote>>;
    try {
      quoteRes = await quote({
        inSymbolOrMint: 'USDC',
        outSymbolOrMint: outMint,
        amountUnits: wantedUnits,
        slippageBps: intent.slippageBps ?? 50,
      });
    } catch (e) {
      // A refusal the owner can read, not a 500: nothing has moved, and saying so is the point.
      return {
        placed: false,
        status: 'blocked',
        reason: 'no_quote',
        detail: `No venue would quote ${intent.symbol} right now (${e instanceof Error ? e.message : String(e)}), so nothing was spent.`,
      };
    }

    // Recorded on the request's idempotency key before the first transaction leaves, so a retry never buys twice.
    await markBroadcast();

    // Step 5a: spendAsDelegate (SPL transfer user USDC -> venue vault)
    const spendRes = await spendAsDelegate({
      owner: intent.ownerPubkey,
      destinationAta: vaultUsdcAta,
      amountUnits: wantedUnits,
    });

    // Step 5b: Jupiter swap fill. If it does not fill, the USDC goes straight back to its owner.
    let swapRes: Awaited<ReturnType<typeof swap>>;
    try {
      swapRes = await swap({
        quoteResponse: quoteRes,
        userPublicKey: intent.ownerPubkey,
        vaultKeypair: vault,
      });
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      const refund = await returnToOwner({
        owner: intent.ownerPubkey,
        mint: DEFAULT_MINTS.USDC,
        amountUnits: wantedUnits,
        fromKeypair: vault,
      }).then(
        (r) => r.signature,
        () => null,
      );
      // Refunded: nothing left the owner. Not refunded: it did, and it counts.
      if (!refund) await countSpend(intent.walletId, intent.usd);
      return {
        placed: false,
        status: 'blocked',
        reason: refund ? 'fill_failed_refunded' : 'fill_failed_refund_failed',
        detail: refund
          ? `The swap did not fill (${why}). Your ${intent.usd.toFixed(2)} USDC was returned to you (${refund}).`
          : `The swap did not fill (${why}), and returning your ${intent.usd.toFixed(2)} USDC failed too: it is held in the venue vault after ${spendRes.signature}.`,
      };
    }

    /*
     * What the holder actually received, not what the raw amount looks like.
     *
     * xStocks are Token-2022 with the Scaled UI Amount extension: a split or an auto-reinvested
     * dividend moves an issuer multiplier while every raw balance stays put. Dividing the raw
     * amount by a hardcoded 8 decimals reports the pre-split position and prices the fill against
     * it, so both the holding and the P&L drift the moment an issuer acts.
     */
    const outScale = await readMintScale(outMint);
    const filledUnits = toUiAmount(swapRes.outAmount, outScale);
    const fillPrice = intent.usd / (filledUnits > 0 ? filledUnits : 1);
    await countSpend(intent.walletId, intent.usd);

    return {
      placed: true,
      venue: swapRes.venue,
      signature: swapRes.signature || spendRes.signature,
      slot: swapRes.slot || spendRes.slot,
      inUnits: wantedUnits,
      outUnits: swapRes.outAmount,
      filledUnits,
      fillPrice,
      symbol: symbolKey,
      usd: intent.usd,
      side: 'buy',
    };
  } else {
    /*
     * SELL (closes, exits, sell-all): the OWNER's xStock is sold, and only through the delegate approval the owner gave
     * on that account (2026-09-19). This used to quote and swap without moving the owner's shares at all — the vault
     * sold its own inventory and paid the owner USDC, so a "sell" drained the vault and left the owner holding the
     * shares it had just been paid for.
     */
    if (!stock) {
      return { placed: false, status: 'blocked', reason: 'not_tradable', detail: `${intent.symbol} is not an xStock this can sell.` };
    }
    const inMint = stock.address;
    const held = await readDelegation(intent.ownerPubkey, inMint);
    const activeDelegate = delegateKeypair().publicKey.toBase58();
    if (held.delegate !== activeDelegate || held.delegatedAmount === 0n) {
      return {
        placed: false,
        status: 'blocked',
        reason: 'no_sell_permission',
        detail: `The permission does not cover selling your ${intent.symbol}, so nothing was sold. Grant again to include it.`,
      };
    }
    // Same reasoning as the buy leg: the multiplier decides how many raw units a holding is.
    const inScale = await readMintScale(inMint);
    const wanted = intent.units !== undefined ? fromUiAmount(intent.units, inScale) : fromUiAmount(intent.usd / markPrice, inScale);
    const inUnits = [wanted, held.balanceAmount, held.delegatedAmount].reduce((a, b) => (b < a ? b : a));
    if (inUnits <= 0n) {
      return { placed: false, status: 'blocked', reason: 'nothing_to_sell', detail: `You hold no ${intent.symbol} to sell.` };
    }

    let quoteRes: Awaited<ReturnType<typeof quote>>;
    try {
      quoteRes = await quote({
        inSymbolOrMint: inMint,
        outSymbolOrMint: 'USDC',
        amountUnits: inUnits,
        slippageBps: intent.slippageBps ?? 50,
      });
    } catch (e) {
      return {
        placed: false,
        status: 'blocked',
        reason: 'no_quote',
        detail: `No venue would quote a sale of ${intent.symbol} right now (${e instanceof Error ? e.message : String(e)}), so nothing was sold.`,
      };
    }

    await markBroadcast();
    // The owner's shares move into the vault under the delegate's approval; the swap then pays the owner in USDC.
    const inProg = tokenProgramForMint(inMint);
    const vaultInAta = (
      await getOrCreateAssociatedTokenAccount(connection, payerKeypair(), new PublicKey(inMint), vault.publicKey, false, 'confirmed', undefined, inProg)
    ).address;
    await spendAsDelegate({ owner: intent.ownerPubkey, destinationAta: vaultInAta, amountUnits: inUnits, mint: inMint });

    let swapRes: Awaited<ReturnType<typeof swap>>;
    try {
      swapRes = await swap({ quoteResponse: quoteRes, userPublicKey: intent.ownerPubkey, vaultKeypair: vault });
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      const back = await returnToOwner({ owner: intent.ownerPubkey, mint: inMint, amountUnits: inUnits, fromKeypair: vault }).then(
        () => 'Your shares were returned.',
        (err: unknown) => `Returning your shares ALSO failed (${err instanceof Error ? err.message : String(err)}); they are held in the venue vault.`,
      );
      return { placed: false, status: 'blocked', reason: 'sell_failed', detail: `The sale did not fill (${why}). ${back}` };
    }

    const outUsd = baseUnitsToUsd(swapRes.outAmount, 6);
    const soldUnits = toUiAmount(inUnits, inScale);
    return {
      placed: true,
      venue: swapRes.venue,
      signature: swapRes.signature,
      slot: swapRes.slot,
      inUnits,
      outUnits: swapRes.outAmount,
      filledUnits: soldUnits,
      fillPrice: outUsd / (soldUnits || 1),
      symbol: symbolKey,
      usd: outUsd,
      side: 'sell',
    };
  }
}
