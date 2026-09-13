/**
 * What the order ticket may send, checked against what the wallet actually has.
 *
 * A sale had no check at all. Its ceiling was the position's value, and with no position the ceiling was
 * `undefined`, which the ticket read as "no limit" — so "Sell $250 of WETH" stayed live for a token the
 * wallet did not hold, and only the executor said no. A buy is checked against cash where cash is known;
 * the executor enforces the daily cap either way.
 */
import { money } from '@/format';

/** Below a cent, a holding is what a sale left behind, not something to sell — the line Portfolio and the asset screen draw. */
export const DUST_USD = 0.01;

export type TicketLimit =
  | { state: 'ok' }
  /** The holding has not been read yet, so a sale cannot be checked. */
  | { state: 'checking' }
  | { state: 'refused'; reason: string };

export function ticketLimit(input: {
  side: 'buy' | 'sell';
  symbol: string;
  amountUsd: number;
  /** Spendable cash, once read. */
  cashUsd: number | undefined;
  /** What the position is worth — 0 when there is none — or where the read of it stands. */
  held: number | 'loading' | 'unread';
}): TicketLimit {
  const { side, symbol, amountUsd, cashUsd, held } = input;
  if (side === 'buy') {
    return cashUsd !== undefined && amountUsd > cashUsd
      ? { state: 'refused', reason: `You have ${money(cashUsd)}.` }
      : { state: 'ok' };
  }
  if (held === 'loading') return { state: 'checking' };
  if (held === 'unread') return { state: 'refused', reason: 'Your holding did not load.' };
  if (held < DUST_USD) return { state: 'refused', reason: `You hold no ${symbol}.` };
  if (amountUsd > held) return { state: 'refused', reason: `You hold ${money(held)} of ${symbol}.` };
  return { state: 'ok' };
}

/** "Max" on a sale: the whole holding, to the cent below, so it never asks for more than is there. */
export function sellMax(heldUsd: number): string {
  return String(Math.floor(heldUsd * 100) / 100);
}
