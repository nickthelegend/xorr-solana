import { describe, expect, it } from 'vitest';
import { isStaleBlockhash } from './solanaTx';

/*
 * The failure this guards, verbatim from the hosted build: the permission screen is six paragraphs
 * we want people to read, a blockhash lives about fifty-five seconds on this cluster, and reading
 * carefully was enough to lose the grant.
 */
describe('isStaleBlockhash', () => {
  it('recognises the simulation failure the app actually showed', () => {
    expect(isStaleBlockhash(new Error('Simulation failed. Message: Transaction simulation failed: Blockhash not found. Logs: []'))).toBe(true);
  });

  it('recognises an expiry raised during confirmation', () => {
    const e = new Error('Signature has expired: block height exceeded');
    e.name = 'TransactionExpiredBlockheightExceededError';
    expect(isStaleBlockhash(e)).toBe(true);
  });

  it('recognises it by error name alone', () => {
    const e = new Error('');
    e.name = 'TransactionExpiredTimeoutError';
    expect(isStaleBlockhash(e)).toBe(true);
  });

  /* A retry must never paper over a real refusal — those are answers, not glitches. */
  it('is false for failures that retrying would only repeat', () => {
    expect(isStaleBlockhash(new Error('insufficient funds for rent'))).toBe(false);
    expect(isStaleBlockhash(new Error('custom program error: 0x1'))).toBe(false);
    expect(isStaleBlockhash(new Error('User rejected the request'))).toBe(false);
    expect(isStaleBlockhash(undefined)).toBe(false);
  });
});

import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { blockhashOf } from './solanaTx';

/*
 * The guard that turns "Blockhash not found" — an error that reads like the cluster's fault — into
 * a sentence naming the wallet that caused it.
 */
describe('blockhashOf', () => {
  const stamped = (blockhash: string) => {
    const kp = Keypair.generate();
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: kp.publicKey, lamports: 1 }),
    );
    tx.recentBlockhash = blockhash;
    tx.feePayer = kp.publicKey;
    tx.sign(kp);
    return new Uint8Array(tx.serialize());
  };

  it('reads the blockhash a signed transaction carries', () => {
    const bh = Keypair.generate().publicKey.toBase58(); // any base58 32-byte value
    expect(blockhashOf(stamped(bh))).toBe(bh);
  });

  it('is null for bytes that are not a transaction, so the guard never fires on garbage', () => {
    expect(blockhashOf(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(blockhashOf(new Uint8Array(0))).toBeNull();
  });
});
