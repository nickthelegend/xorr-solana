/**
 * Every token account this device has approved the bot on, remembered per owner (2026-09-25).
 *
 * The stop normally asks the chain which of the owner's accounts name a delegate (`getTokenAccountsByOwner`). That is an
 * indexed read: the executor's relay serves it, and a public node does not. So if the executor is down, the stop would
 * know only the USDC account — and leave the xStock sell approvals and the agents' wallets approved. This list is the
 * answer that needs no server: each approval this app signs is recorded here as it is signed, and the stop revokes every
 * recorded account the chain still shows as delegated.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PublicKey, type Transaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const KEY = 'xorr-bot-approved-v1';

export type Approved = { account: string; programId: string };

/** SPL `Approve` (4) and `ApproveChecked` (13) — the only instructions that name a delegate on an account. */
const APPROVE = new Set([4, 13]);

/** The accounts a transaction approves a delegate on, with the program each lives under. */
export function approvedIn(tx: Transaction): Approved[] {
  return tx.instructions
    .filter(
      (ix) =>
        (ix.programId.equals(TOKEN_PROGRAM_ID) || ix.programId.equals(TOKEN_2022_PROGRAM_ID)) &&
        ix.data.length > 0 &&
        APPROVE.has(ix.data[0]!),
    )
    .map((ix) => ({ account: ix.keys[0]!.pubkey.toBase58(), programId: ix.programId.toBase58() }));
}

async function readAll(): Promise<Record<string, Approved[]>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, Approved[]>) : {};
  } catch {
    return {};
  }
}

/** Record what a signed transaction approved. Best effort: failing to remember never fails the grant. */
export async function rememberApproved(owner: string, tx: Transaction): Promise<void> {
  const found = approvedIn(tx);
  if (!found.length) return;
  try {
    const all = await readAll();
    const known = new Map((all[owner] ?? []).map((a) => [a.account, a]));
    for (const a of found) known.set(a.account, a);
    all[owner] = [...known.values()];
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable: the stop still revokes what the chain reports, and USDC always.
  }
}

/** What this device has approved for `owner`, as keys ready for a revoke. */
export async function approvedFor(owner: string): Promise<{ account: PublicKey; programId: PublicKey }[]> {
  const all = await readAll();
  return (all[owner] ?? []).map((a) => ({ account: new PublicKey(a.account), programId: new PublicKey(a.programId) }));
}

/**
 * Whether a raw SPL token account names a delegate: the `COption<Pubkey>` at byte 72 (the same base layout under
 * Token-2022). An account that no longer exists, or no longer delegates, needs no revoke — and revoking one that does
 * not exist would fail the whole stop.
 */
export function namesDelegate(data: Uint8Array | null | undefined): boolean {
  if (!data || data.length < 76) return false;
  return data[72] === 1 && data[73] === 0 && data[74] === 0 && data[75] === 0;
}
