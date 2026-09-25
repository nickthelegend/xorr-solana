/**
 * The stop without the executor, on mainnet (2026-09-25): the indexed read that lists delegated accounts is served only
 * by the executor's relay, so with the relay down the stop falls back to every account this device approved, keeps the
 * ones the chain still shows as delegated, and revokes them — the agent's wallet and the sell approvals included.
 */
import { describe, expect, it, vi } from 'vitest';
import { Keypair, PublicKey, Transaction, type Transaction as Tx } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createApproveCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
  },
}));
const down = () => Promise.reject(new TypeError('Failed to fetch'));
vi.mock('@/data/api', () => ({ api: { get: vi.fn(down), post: vi.fn(down) } }));

const owner = Keypair.generate().publicKey;
const bot = Keypair.generate().publicKey;
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const usdcAta = getAssociatedTokenAddressSync(USDC, owner, false, TOKEN_PROGRAM_ID);
const agentWallet = Keypair.generate().publicKey;
const xstockAccount = Keypair.generate().publicKey;
const closedAccount = Keypair.generate().publicKey;

/** A raw token account whose delegate option is set (or not). */
function raw(delegated: boolean): Uint8Array {
  const d = new Uint8Array(165);
  if (delegated) d[72] = 1;
  return d;
}

vi.mock('./solanaTx', () => ({
  solanaConnection: () => ({
    // The public node: the indexed read is refused.
    getParsedTokenAccountsByOwner: async () => {
      throw new Error('Indexed requests require a personal token');
    },
    getMultipleAccountsInfo: async (keys: PublicKey[]) =>
      keys.map((k) =>
        k.equals(agentWallet) || k.equals(xstockAccount)
          ? { data: raw(true) }
          : k.equals(closedAccount)
            ? null
            : { data: raw(false) },
      ),
  }),
}));

const { approvedIn, namesDelegate, rememberApproved } = await import('./approvedAccounts');
const { revokeOnSolana } = await import('./solanaGrant');

function approving(...accounts: [PublicKey, PublicKey][]): Tx {
  const tx = new Transaction();
  for (const [account, program] of accounts) {
    tx.add(createApproveCheckedInstruction(account, USDC, bot, owner, 1n, 6, [], program));
  }
  return tx;
}

describe('remembering what this device approved', () => {
  it('reads the approved accounts, and their programs, out of a signed transaction', () => {
    expect(approvedIn(approving([agentWallet, TOKEN_PROGRAM_ID], [xstockAccount, TOKEN_2022_PROGRAM_ID]))).toEqual([
      { account: agentWallet.toBase58(), programId: TOKEN_PROGRAM_ID.toBase58() },
      { account: xstockAccount.toBase58(), programId: TOKEN_2022_PROGRAM_ID.toBase58() },
    ]);
  });

  it('tells a delegated account from one without a delegate', () => {
    expect(namesDelegate(raw(true))).toBe(true);
    expect(namesDelegate(raw(false))).toBe(false);
    expect(namesDelegate(null)).toBe(false);
  });
});

describe('the stop with the executor down and no indexed read', () => {
  it('revokes USDC and every remembered account still delegated — and skips closed or already-clear ones', async () => {
    await rememberApproved(
      owner.toBase58(),
      approving(
        [usdcAta, TOKEN_PROGRAM_ID],
        [agentWallet, TOKEN_PROGRAM_ID],
        [xstockAccount, TOKEN_2022_PROGRAM_ID],
        [closedAccount, TOKEN_PROGRAM_ID],
      ),
    );
    let signed: Tx | undefined;
    await revokeOnSolana({
      owner: owner.toBase58(),
      signAndSend: async (tx) => {
        signed = tx;
        return 'sig';
      },
    });
    const revoked = signed!.instructions.map((ix) => ix.keys[0]!.pubkey.toBase58());
    expect(revoked).toEqual([usdcAta.toBase58(), agentWallet.toBase58(), xstockAccount.toBase58()]);
    expect(signed!.instructions[2]!.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
  });
});
