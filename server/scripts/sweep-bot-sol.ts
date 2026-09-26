/**
 * Send the bot's own SOL — the payer's and the venue vault's — to one address, and close their empty token accounts so
 * that rent comes back too (2026-09-26).
 *
 * The owner funded these two accounts for the demo (gas for the executor, and the vault's hop on buys). This returns
 * it. It is a dry run unless `--send` is passed: it prints what each account holds and what would move, and signs
 * nothing. With `--send` it signs with the executor's keys, so run it where those keys are — through Railway:
 *
 *   cd server
 *   railway run -s executor -e production -- npx tsx scripts/sweep-bot-sol.ts <DESTINATION>          # look first
 *   railway run -s executor -e production -- npx tsx scripts/sweep-bot-sol.ts <DESTINATION> --send   # then send
 *
 * After it runs the executor has no SOL for fees: agents cannot trade and a sale cannot settle until it is funded again.
 */
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type Keypair,
} from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createCloseAccountInstruction } from '@solana/spl-token';
import { payerKeypair, venueVaultKeypair } from '../src/solana/keys.js';
import { rpcUrl } from '../src/solana/clusters.js';

const FEE_LAMPORTS = 5_000;

async function emptyTokenAccounts(conn: Connection, owner: PublicKey) {
  const out: { account: PublicKey; programId: PublicKey }[] = [];
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const res = await conn.getParsedTokenAccountsByOwner(owner, { programId }, 'confirmed');
    for (const { pubkey, account } of res.value) {
      const amount = (account.data as { parsed: { info: { tokenAmount: { amount: string } } } }).parsed.info.tokenAmount.amount;
      if (amount === '0') out.push({ account: pubkey, programId });
    }
  }
  return out;
}

async function sweep(conn: Connection, name: string, key: Keypair, to: PublicKey, send: boolean) {
  const empty = await emptyTokenAccounts(conn, key.publicKey);
  const lamports = await conn.getBalance(key.publicKey, 'confirmed');
  console.log(`\n${name} ${key.publicKey.toBase58()}`);
  console.log(`  SOL ${(lamports / 1e9).toFixed(6)} · ${empty.length} empty token account(s) whose rent comes back`);

  // Close the empty accounts first; their rent lands in `to`. A Token-2022 account holding withheld fees refuses, and
  // is skipped rather than failing the sweep.
  for (const e of empty) {
    if (!send) continue;
    try {
      const tx = new Transaction().add(createCloseAccountInstruction(e.account, to, key.publicKey, [], e.programId));
      const sig = await sendAndConfirmTransaction(conn, tx, [key], { commitment: 'confirmed' });
      console.log(`  closed ${e.account.toBase58()} · ${sig}`);
    } catch (err) {
      console.log(`  kept ${e.account.toBase58()}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
    }
  }

  const left = await conn.getBalance(key.publicKey, 'confirmed');
  const amount = left - FEE_LAMPORTS;
  if (amount <= 0) {
    console.log('  nothing left to send');
    return;
  }
  console.log(`  ${send ? 'sending' : 'would send'} ${(amount / 1e9).toFixed(6)} SOL to ${to.toBase58()}`);
  if (!send) return;
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: key.publicKey, toPubkey: to, lamports: amount }));
  const sig = await sendAndConfirmTransaction(conn, tx, [key], { commitment: 'confirmed' });
  console.log(`  sent · ${sig}`);
}

async function main() {
  const [dest, flag] = process.argv.slice(2);
  if (!dest) throw new Error('Pass the address to send to: npx tsx scripts/sweep-bot-sol.ts <DESTINATION> [--send]');
  const to = new PublicKey(dest);
  const send = flag === '--send';
  const conn = new Connection(rpcUrl(), 'confirmed');
  console.log(send ? 'SENDING — this signs with the executor keys.' : 'Dry run — nothing is signed. Add --send to send.');
  await sweep(conn, 'venue vault', venueVaultKeypair(), to, send);
  await sweep(conn, 'payer', payerKeypair(), to, send);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
