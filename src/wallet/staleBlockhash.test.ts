import { describe, expect, it, vi } from 'vitest';
import { SIGN_ATTEMPTS, isStaleBlockhash, untilFresh } from './solanaTx';

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

/*
 * One retry was not enough (2026-09-22).
 *
 * Measured on this cluster, a blockhash lives 64 seconds, and the wallet's sheet has to be read,
 * approved and then dismissed before the app gets the bytes back. A person slow enough to lose the
 * first one had exactly one more go, and the hosted build showed them "Blockhash not found" under
 * the kill switch when they lost that too.
 */
describe('untilFresh', () => {
  const stale = () => new Error('Transaction simulation failed: Blockhash not found');

  it('returns the first success without signing again', async () => {
    const attempt = vi.fn(async () => 'sig');
    await expect(untilFresh(attempt, isStaleBlockhash)).resolves.toBe('sig');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('goes round again for a stale blockhash and returns what finally lands', async () => {
    let n = 0;
    const attempt = vi.fn(async () => {
      if (++n < 3) throw stale();
      return 'sig';
    });
    await expect(untilFresh(attempt, isStaleBlockhash)).resolves.toBe('sig');
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('gives up after the bound, with the cluster\u2019s own last failure', async () => {
    const attempt = vi.fn(async () => {
      throw stale();
    });
    await expect(untilFresh(attempt, isStaleBlockhash)).rejects.toThrow(/Blockhash not found/);
    expect(attempt).toHaveBeenCalledTimes(SIGN_ATTEMPTS);
  });

  /* A refusal is an answer. Asking for another signature would only collect the same one. */
  it('does not retry a failure that is not an expiry', async () => {
    const attempt = vi.fn(async () => {
      throw new Error('custom program error: 0x1');
    });
    await expect(untilFresh(attempt, isStaleBlockhash)).rejects.toThrow(/0x1/);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  /* The executor's co-signed transaction: re-stamping the blockhash would void its signature. */
  it('signs a prepared transaction exactly once, however it fails', async () => {
    const attempt = vi.fn(async () => {
      throw stale();
    });
    await expect(untilFresh(attempt, isStaleBlockhash, 1)).rejects.toThrow(/Blockhash not found/);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
