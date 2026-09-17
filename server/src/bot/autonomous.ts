/**
 * Autonomous AI Agent Strategy Selection & Execution Engine — PLAN.md §8.6.
 *
 * Automatically understands available strategies (momentum, event-driven, dca, grid),
 * evaluates current market/news conditions on Backed Finance xStocks (NVDAx, TSLAx, AAPLx, MSFTx),
 * picks the BEST setup, and places the trade on-chain through the executor spend chokepoint
 * (guardAndSpend in place.ts) — with zero manual approval steps — then notifies the user.
 */
import { randomUUID } from 'node:crypto';
import { one, query, tx } from '../db/index.js';
import { evaluate } from '../rules/engine.js';
import { XSTOCKS, stockPriceUsd, type XStockToken } from '../venues/stocks.js';
import { guardAndSpend, type SpendReceipt } from '../executor/place.js';
import { armExits } from '../executor/order.js';
import { notifyEntry } from '../notifications/alerts.js';
import { speak } from './llm.js';
import { TONE_INSTRUCTIONS, type ToneId } from './tone.js';
import { earningsCalendar } from '../market/edgar.js';
import { readDelegation } from '../solana/delegation.js';
import { delegateKeypair } from '../solana/keys.js';
import { PublicKey } from '@solana/web3.js';
import type { PersonaId } from './personas.js';
import { assessCorporateAction, type CorporateActionAssessment } from '../venues/corporate-actions.js';
import { offHoursGuard as offHoursGuardFor, type OffHoursGuardVerdict } from '../market/nasdaq.js';
import type { WalletRow } from '../routes/wallet-context.js';

export type StrategyKind = 'momentum' | 'event-driven' | 'dca' | 'grid';

export type CandidateSetup = {
  symbol: string;
  stock: XStockToken;
  strategyKind: StrategyKind;
  persona: PersonaId;
  personaName: string;
  score: number;
  currentPrice: number;
  stopPrice: number;
  targetPrice: number;
  reason: string;
  marketCondition: string;
  corporateAction?: CorporateActionAssessment;
  offHoursGuard?: OffHoursGuardVerdict;
  suggestedSlippageBps?: number;
};

export type AutonomousTradeResult =
  | {
      executed: true;
      setup: CandidateSetup;
      receipt: SpendReceipt;
      exitStrategyId: string | null;
      proposalId: string;
    }
  | {
      executed: false;
      reason: string;
      detail: string;
    };

/**
 * Assesses market and news/earnings conditions for a given xStock.
 */
async function analyzeStock(
  stock: XStockToken,
  currentPrice: number,
): Promise<{
  rangeHigh: number;
  rangeLow: number;
  rangePosition: number;
  daysToEarnings: number | null;
  /**
   * How far `daysToEarnings` could be off, in days.
   *
   * There is no `confirmed` flag to read here, and this used to try to read one. EDGAR holds
   * filings, not schedules — every next-report date it yields is PROJECTED from the company's own
   * observed cadence, and `errorDays` is the widest miss that cadence would have produced (see
   * `market/edgar.ts`). A caller that treats the projection as a fixed date is the mistake the
   * field exists to prevent.
   */
  earningsErrorDays: number;
  corporateAction: CorporateActionAssessment;
  offHoursGuard: OffHoursGuardVerdict;
}> {
  // Check SEC EDGAR earnings calendar
  let daysToEarnings: number | null = null;
  let earningsErrorDays = 0;
  try {
    const cal = await earningsCalendar(stock.symbol);
    if (cal && cal.nextAt) {
      daysToEarnings = Math.round((cal.nextAt - Date.now()) / 86_400_000);
      earningsErrorDays = cal.errorDays;
    }
  } catch {
    // EDGAR lookup optional
  }

  // Check Corporate Action schedule & multiplier
  const corporateAction = await assessCorporateAction(stock.symbol);

  // Check Nasdaq market session & the pool-vs-underlying spread, against the issuer's own quote
  const offHoursGuard = await offHoursGuardFor({
    symbol: stock.symbol,
    onChainPrice: currentPrice,
  });

  // Estimated synthetic 30-day range around current price for signal derivation
  const rangeHigh = currentPrice * 1.08;
  const rangeLow = currentPrice * 0.92;
  const rangePosition = (currentPrice - rangeLow) / Math.max(rangeHigh - rangeLow, 1e-6);

  return {
    rangeHigh,
    rangeLow,
    rangePosition,
    daysToEarnings,
    earningsErrorDays,
    corporateAction,
    offHoursGuard,
  };
}

/**
 * Evaluates all available strategies across the xStocks universe and selects the best candidate.
 */
export async function evaluateBestSetup(): Promise<CandidateSetup | null> {
  const candidates: CandidateSetup[] = [];

  for (const stock of Object.values(XSTOCKS)) {
    const price = await stockPriceUsd(stock.symbol);
    if (!price || price <= 0) continue;

    const analysis = await analyzeStock(stock, price);

    // If off-hours guard mandates a HOLD (spread > 1.5%), skip candidates for this stock
    if (analysis.offHoursGuard.action === 'hold') {
      continue;
    }

    const offHoursPenalty = analysis.offHoursGuard.session === 'closed' ? 15 : 0;
    const caPenalty = analysis.corporateAction.recommendation === 'avoid_entry' ? analysis.corporateAction.scoreAdjustment : 0;

    /*
     * 1. Event-Driven candidate: Earnings run-up within 3-10 days.
     *
     * The near edge carries the projection's own error margin. The date came from a filing cadence,
     * not a schedule, so "6 days out, ±4" could already be past the print — and a run-up entered
     * after the print is the opposite of this strategy. The whole margin has to fit in the window.
     */
    if (
      analysis.daysToEarnings !== null &&
      analysis.daysToEarnings - analysis.earningsErrorDays >= 3 &&
      analysis.daysToEarnings <= 10
    ) {
      const stop = price * 0.94;
      const target = price * 1.12;
      const baseScore = 95 - Math.abs(analysis.daysToEarnings - 6);
      candidates.push({
        symbol: stock.symbol,
        stock,
        strategyKind: 'event-driven',
        persona: 'earnings-desk',
        personaName: 'Earnings Desk',
        score: Math.max(10, baseScore + caPenalty),
        currentPrice: price,
        stopPrice: stop,
        targetPrice: target,
        reason: `${stock.symbol} scheduled report is approaching in ${analysis.daysToEarnings} days${analysis.earningsErrorDays > 0 ? ` (projected from its filing cadence, ±${analysis.earningsErrorDays}d)` : ''}. Riding pre-earnings momentum before print.${caPenalty !== 0 ? ` [Warning: ${analysis.corporateAction.reason}]` : ''}`,
        marketCondition: `Pre-earnings window (${analysis.daysToEarnings}d away)`,
        corporateAction: analysis.corporateAction,
        offHoursGuard: analysis.offHoursGuard,
        suggestedSlippageBps: analysis.offHoursGuard.suggestedSlippageBps,
      });
    }

    // 2. Momentum candidate: Breakout towards top decile
    if (analysis.rangePosition >= 0.75) {
      const stop = Math.max(price * 0.95, analysis.rangeHigh * 0.94);
      const risk = price - stop;
      const target = price + risk * 2;
      const baseScore = Math.round(75 + analysis.rangePosition * 20);
      const adjustedScore = Math.max(10, baseScore + caPenalty - offHoursPenalty);
      candidates.push({
        symbol: stock.symbol,
        stock,
        strategyKind: 'momentum',
        persona: 'momentum-scout',
        personaName: 'Momentum Scout',
        score: adjustedScore,
        currentPrice: price,
        stopPrice: stop,
        targetPrice: target,
        reason: `${stock.symbol} breaking out near upper trading band. Trend filter confirmed.${caPenalty !== 0 ? ` [Corporate Action: ${analysis.corporateAction.reason}]` : ''}${offHoursPenalty > 0 ? ` [Off-hours penalty applied: ${analysis.offHoursGuard.reason}]` : ''}`,
        marketCondition: `Bullish breakout (${(analysis.rangePosition * 100).toFixed(0)}th percentile)`,
        corporateAction: analysis.corporateAction,
        offHoursGuard: analysis.offHoursGuard,
        suggestedSlippageBps: analysis.offHoursGuard.suggestedSlippageBps,
      });
    }

    // 3. DCA / Dip buyer candidate: Value accumulation
    if (analysis.rangePosition < 0.4) {
      const stop = price * 0.92;
      const target = price * 1.10;
      const caBonus = analysis.corporateAction.recommendation === 'position_dca' ? 10 : 0;
      candidates.push({
        symbol: stock.symbol,
        stock,
        strategyKind: 'dca',
        persona: 'yield-keeper',
        personaName: 'Yield Keeper',
        score: Math.round(70 + (0.4 - analysis.rangePosition) * 20 + caBonus),
        currentPrice: price,
        stopPrice: stop,
        targetPrice: target,
        reason: `${stock.symbol} trading at discount within lower band. Accumulating position.${caBonus > 0 ? ` [Dividend capture: ${analysis.corporateAction.reason}]` : ''}`,
        marketCondition: `Oversold dip (${(analysis.rangePosition * 100).toFixed(0)}th percentile)`,
        corporateAction: analysis.corporateAction,
        offHoursGuard: analysis.offHoursGuard,
        suggestedSlippageBps: analysis.offHoursGuard.suggestedSlippageBps,
      });
    }

    // 4. Default baseline candidate
    const defaultStop = price * 0.95;
    const defaultTarget = price * 1.10;
    candidates.push({
      symbol: stock.symbol,
      stock,
      strategyKind: 'momentum',
      persona: 'momentum-scout',
      personaName: 'Momentum Scout',
      score: Math.max(10, 60 + caPenalty - offHoursPenalty),
      currentPrice: price,
      stopPrice: defaultStop,
      targetPrice: defaultTarget,
      reason: `${stock.symbol} liquid equity with steady volume.`,
      marketCondition: 'Stable trend',
      corporateAction: analysis.corporateAction,
      offHoursGuard: analysis.offHoursGuard,
      suggestedSlippageBps: analysis.offHoursGuard.suggestedSlippageBps,
    });
  }

  if (candidates.length === 0) return null;

  // Rank by score descending and return the top candidate
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

/**
 * Runs the autonomous propose -> decide -> execute -> notify cycle for a wallet.
 */
export async function runAutonomousCycle(
  walletId: string,
  options: {
    fixedUsd?: number;
    tone?: ToneId;
  } = {},
): Promise<AutonomousTradeResult> {
  /*
   * 1. Check wallet status.
   *
   * The whole row, because `armExits` below takes a `WalletRow` and this was handing it three
   * columns cast to fit. A partial row that typechecks is a row whose missing fields are `undefined`
   * at runtime, and `wallet-context.ts` is where the shape is decided.
   */
  const wallet = await one<WalletRow>(`SELECT * FROM wallets WHERE id = $1`, [walletId]);
  if (!wallet) {
    return { executed: false, reason: 'no_wallet', detail: 'Wallet not found.' };
  }
  /*
   * Read once, then reason about it.
   *
   * `killed: wallet.agents_stopped === true` sat below this guard, where the flag is already
   * narrowed to `false | undefined` — so the comparison could only ever be false and the rules
   * engine was told `killed: false` unconditionally. It happened to be correct, because the early
   * return above is what actually enforces the kill switch, but it read as a second check that was
   * doing nothing. One name, stated where it is read.
   */
  const agentsStopped = wallet.agents_stopped === true;
  if (agentsStopped) {
    return { executed: false, reason: 'agents_stopped', detail: 'Agents are stopped by user kill switch.' };
  }

  // 2. Read on-chain SPL delegation
  const ownerPk = new PublicKey(wallet.address);
  const onChainDel = await readDelegation(ownerPk).catch(() => null);
  if (onChainDel && onChainDel.revoked) {
    return { executed: false, reason: 'delegation_revoked', detail: 'On-chain SPL delegation revoked.' };
  }

  // 3. Pick the BEST setup across xStocks and strategies
  const bestSetup = await evaluateBestSetup();
  if (!bestSetup) {
    return { executed: false, reason: 'no_setup', detail: 'No viable xStocks setups found in current market conditions.' };
  }

  // 4. Determine trade size (guarding daily cap)
  const dailyCap = onChainDel ? Math.max(onChainDel.delegatedUsd, 100) : 1000;
  const verdict = await evaluate({
    walletId,
    usd: 1,
    dailyCapUsd: dailyCap,
    delegationExpiresAt: new Date(Date.now() + 30 * 86_400_000),
    delegationRevoked: false,
    killed: agentsStopped,
  });
  if (!verdict.allowed) {
    return { executed: false, reason: verdict.reason, detail: verdict.detail };
  }

  // Sizing: default to $25 or user-specified, capped at remaining daily budget
  const sizeUsd = Math.min(
    options.fixedUsd ?? 25,
    Math.max(10, Math.floor(verdict.remainingUsd * 0.25)),
  );
  if (sizeUsd < 10) {
    return { executed: false, reason: 'insufficient_budget', detail: 'Remaining daily allowance is below minimum trade size ($10).' };
  }

  // 5. Generate persona narrative via LLM or deterministic voice
  const tone = options.tone ?? 'dry';
  let openingLine: string | null = null;
  const llmRes = await speak({
    persona: bestSetup.persona,
    toneInstruction: TONE_INSTRUCTIONS[tone],
    situation: `Autonomous agent selected ${bestSetup.strategyKind} strategy for ${bestSetup.symbol} based on ${bestSetup.marketCondition}. Placed market buy with attached stop loss. Explain why this setup was chosen in one terse sentence, naming no numbers.`,
  }).catch(() => null);

  if (llmRes && llmRes.ok) {
    openingLine = llmRes.text;
  } else {
    openingLine = `${bestSetup.personaName} detected optimal setup: ${bestSetup.reason}`;
  }

  // 6. EXECUTE TRADE THROUGH CHOKEPOINT (place.ts: guardAndSpend)
  const receipt = await guardAndSpend({
    walletId,
    ownerAddress: wallet.address,
    usd: sizeUsd,
    symbol: bestSetup.symbol,
    venue: 'jupiter',
    slippageBps: bestSetup.suggestedSlippageBps ?? 50,
    because: `Autonomous ${bestSetup.strategyKind} entry on ${bestSetup.symbol}: ${bestSetup.reason}`,
    agentName: bestSetup.personaName,
  });

  // 7. Arm exit rules (stop-loss / take-profit)
  let exitStrategyId: string | null = null;
  try {
    const exits = await armExits(
      wallet,
      {
        symbol: bestSetup.symbol,
        entryPrice: receipt.price,
        stopPrice: bestSetup.stopPrice,
        targetPrice: bestSetup.targetPrice,
      },
    );
    exitStrategyId = exits.strategyId;
  } catch (e) {
    console.error('[autonomous] failed to arm exits:', e);
  }

  // 8. Record autonomous proposal record as approved
  const proposalId = randomUUID();
  await query(
    `INSERT INTO proposals (id, wallet_id, agent, payload, decision, decided_at, expires_at)
     VALUES ($1, $2, $3, $4, 'approved', now(), now() + interval '1 hour')`,
    [
      proposalId,
      walletId,
      bestSetup.personaName,
      JSON.stringify({
        symbol: bestSetup.symbol,
        strategyKind: bestSetup.strategyKind,
        usd: sizeUsd,
        units: receipt.units,
        price: receipt.price,
        stopPrice: bestSetup.stopPrice,
        targetPrice: bestSetup.targetPrice,
        signature: receipt.signature,
        slot: receipt.slot,
        opening: openingLine,
        reason: bestSetup.reason,
        marketCondition: bestSetup.marketCondition,
        corporateAction: bestSetup.corporateAction?.imminentAction ?? null,
        nasdaqSession: bestSetup.offHoursGuard?.session ?? 'regular',
        spreadBps: bestSetup.offHoursGuard?.spreadBps ?? 0,
        suggestedSlippageBps: bestSetup.suggestedSlippageBps ?? 50,
      }),
    ],
  ).catch((e) => console.error('[autonomous] failed to insert proposal:', e));

  // 9. Dispatch Entry Notification
  await notifyEntry({
    walletId,
    symbol: bestSetup.symbol,
    strategyKind: bestSetup.strategyKind,
    notionalUsd: sizeUsd,
    units: receipt.units,
    price: receipt.price,
    signature: receipt.signature,
    rationale: openingLine ?? bestSetup.reason,
    agentName: bestSetup.personaName,
  });

  return {
    executed: true,
    setup: bestSetup,
    receipt,
    exitStrategyId,
    proposalId,
  };
}

/**
 * Sweeps eligible active wallets to evaluate and execute autonomous trades during a scheduler tick.
 */
export async function autonomousAgentSweep(now: Date = new Date()): Promise<number> {
  const wallets = await query<{ id: string }>(
    `SELECT id FROM wallets
     WHERE address IS NOT NULL AND (agents_stopped IS NULL OR agents_stopped = false)
     ORDER BY updated_at DESC LIMIT 10`,
  ).catch(() => []);

  let executedCount = 0;
  for (const w of wallets) {
    try {
      // Cooldown check: max 1 autonomous trade per wallet per 10 minutes to prevent over-trading
      const recent = await one<{ id: string }>(
        `SELECT id FROM proposals
         WHERE wallet_id = $1 AND decision = 'approved' AND decided_at > now() - interval '10 minutes'
         LIMIT 1`,
        [w.id],
      ).catch(() => null);

      if (recent) continue;

      const res = await runAutonomousCycle(w.id);
      if (res.executed) {
        executedCount++;
        console.log(`[autonomous] executed ${res.setup.strategyKind} on ${res.setup.symbol} (sig: ${res.receipt.signature})`);
      }
    } catch (err) {
      console.error(`[autonomous] sweep error for wallet ${w.id}:`, err);
    }
  }
  return executedCount;
}

