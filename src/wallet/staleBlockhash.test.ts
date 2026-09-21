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

import { asBytes } from './solanaTx';

/*
 * The declared type is Uint8Array and that is not always what arrives. sendRawTransaction accepts
 * none of the other shapes quietly — it mangles them into a body the cluster cannot parse, and the
 * resulting error talks about the transaction rather than its encoding.
 */
describe('asBytes', () => {
  const sample = Uint8Array.from([1, 2, 3, 250]);

  it('passes bytes through untouched', () => {
    expect(asBytes(sample)).toBe(sample);
  });

  it('decodes base64, which is what a wallet returning a string gives', () => {
    const b64 = Buffer.from(sample).toString('base64');
    expect(Array.from(asBytes(b64))).toEqual([1, 2, 3, 250]);
  });

  it('takes an array of numbers', () => {
    expect(Array.from(asBytes([1, 2, 3, 250]))).toEqual([1, 2, 3, 250]);
  });

  it('takes an ArrayBuffer', () => {
    expect(Array.from(asBytes(sample.buffer.slice(0)))).toEqual([1, 2, 3, 250]);
  });

  it('takes an index-keyed object, which is what spreading bytes produces', () => {
    expect(Array.from(asBytes({ 0: 1, 1: 2, 2: 3, 3: 250 }))).toEqual([1, 2, 3, 250]);
  });

  it('refuses anything it cannot turn into bytes, rather than broadcasting nonsense', () => {
    expect(() => asBytes(null)).toThrow(/cannot broadcast/);
    expect(() => asBytes(42)).toThrow(/cannot broadcast/);
  });
});
