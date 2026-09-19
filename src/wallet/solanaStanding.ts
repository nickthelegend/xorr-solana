/**
 * Whether the bot can trade on Solana, decided from the chain (2026-09-19) — the Solana half of `standingOnChain`.
 *
 * The chip that answers this asked the EVM delegation contract, which does not exist on Solana, so a wallet with a live
 * SPL approval was shown "Not granted". The permission is the delegate on the owner's USDC token account, and that is
 * read here, from the chain. Two facts the chain does not hold come from the executor: which key is the bot's (to tell
 * our delegate from anyone else's) and the end date the owner chose. Where those cannot be had, the answer is
 * `unreadable` — never rounded to armed, and never to off.
 */
import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TokenAccountNotFoundError, getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { api } from '@/data/api';
import type { ChainStandingKind } from '@/state/killSwitch';
import { solanaConnection } from './solanaTx';

/** Mainnet USDC, the mint every cluster this build runs on uses (the fork clones it). */
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export async function solanaStandingOnChain(owner: string, now: number): Promise<ChainStandingKind> {
  let delegate: string | null;
  let delegated: bigint;
  try {
    const ata = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), new PublicKey(owner), false, TOKEN_PROGRAM_ID);
    const account = await getAccount(solanaConnection(), ata, 'confirmed', TOKEN_PROGRAM_ID);
    delegate = account.delegate?.toBase58() ?? null;
    delegated = account.delegatedAmount;
  } catch (e) {
    // No USDC account yet is an answer — nothing is delegated. Anything else is a read that failed.
    if (!(e instanceof TokenAccountNotFoundError)) return 'unreadable';
    delegate = null;
    delegated = 0n;
  }

  const [params, record] = await Promise.all([
    api.get<{ delegate: string }>('/delegation/params').catch(() => null),
    api.get<{ expiresAt: number; revoked: boolean } | null>('/delegation').catch(() => undefined),
  ]);

  if (delegate && delegated > 0n) {
    if (!params) return 'unreadable';
    // A delegate that is not the bot's key is someone else's approval: nothing of ours can trade on it.
    if (delegate !== params.delegate) return 'none';
    if (record && record.expiresAt <= now) return 'expired';
    return 'live';
  }
  // No delegate on the chain. Stopped if a grant was ever recorded for this wallet; never granted otherwise.
  if (record === undefined) return 'unreadable';
  return record ? 'revoked' : 'none';
}

/**
 * The chain alone, for when the executor cannot be asked (Safety's fallback). Only what the token account itself says:
 * a delegate with something left to move is `live`, no delegate is `revoked`. Which key the delegate is and what end
 * date was chosen are the executor's to say, so neither is claimed here — the stop, an SPL `Revoke`, drops whatever
 * delegate the account names and needs neither.
 */
export async function solanaChainOnlyStanding(owner: string): Promise<{ kind: 'live' | 'revoked' | 'unreadable' }> {
  try {
    const ata = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), new PublicKey(owner), false, TOKEN_PROGRAM_ID);
    const account = await getAccount(solanaConnection(), ata, 'confirmed', TOKEN_PROGRAM_ID);
    return { kind: account.delegate && account.delegatedAmount > 0n ? 'live' : 'revoked' };
  } catch (e) {
    return { kind: e instanceof TokenAccountNotFoundError ? 'revoked' : 'unreadable' };
  }
}
