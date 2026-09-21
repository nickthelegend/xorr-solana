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
