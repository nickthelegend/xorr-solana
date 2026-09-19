/**
 * The address a request names must be one Privy says belongs to the caller.
 *
 * The binding itself — never moving a row between users — is proven against a real Postgres in
 * `walletBinding.live.test.ts`; this pins the matching every call starts from.
 */
import { describe, expect, it } from 'vitest';
import { findLinkedWallet } from './walletBinding.js';

const EMBEDDED = { address: '0x95A0b368588713011a15f4b1041423f31B08e615', embedded: true, chain: 'ethereum' as const };
const EXTENSION = { address: '0x364d7Bbc139541e0e37450D527ae154B5C292581', embedded: false, chain: 'ethereum' as const };
/** Solana keys (the fork's dev owner and delegate): base58, one spelling each. */
const SOL_EMBEDDED = { address: 'CDRsbbFHHMWWXqV215r3Bfbh6GivraCfXRndSicPm7No', embedded: true, chain: 'solana' as const };
const SOL_OTHER = { address: 'CZqacbMj1p2e1ryUfdDHkr9Y4P7ryMnXmwG149qXsoeu', embedded: false, chain: 'solana' as const };

describe('findLinkedWallet', () => {
  it("finds the caller's wallet whatever case the request used", () => {
    expect(findLinkedWallet([EMBEDDED], '0x95a0b368588713011a15f4b1041423f31b08e615')).toBe(EMBEDDED);
    expect(findLinkedWallet([EMBEDDED], '0X95A0B368588713011A15F4B1041423F31B08E615'.replace('0X', '0x'))).toBe(
      EMBEDDED,
    );
  });

  it('finds a linked wallet that is not the embedded one', () => {
    expect(findLinkedWallet([EMBEDDED, EXTENSION], EXTENSION.address)?.embedded).toBe(false);
  });

  it("refuses an address that is not on the caller's account — the takeover request", () => {
    expect(findLinkedWallet([EXTENSION], EMBEDDED.address)).toBeUndefined();
    expect(findLinkedWallet([], EMBEDDED.address)).toBeUndefined();
  });

  it('refuses something that is not an address at all', () => {
    expect(findLinkedWallet([EMBEDDED], '0x95A0')).toBeUndefined();
    expect(findLinkedWallet([EMBEDDED], "0x95A0b368588713011a15f4b1041423f31B08e615'; --")).toBeUndefined();
  });
});

describe('findLinkedWallet on Solana (2026-09-19)', () => {
  it("finds the caller's Solana wallet by its exact base58 key", () => {
    expect(findLinkedWallet([SOL_EMBEDDED, SOL_OTHER], SOL_EMBEDDED.address)).toBe(SOL_EMBEDDED);
  });

  it('refuses a key that differs only in case — base58 has one spelling, and case changes the key', () => {
    expect(findLinkedWallet([SOL_EMBEDDED], SOL_EMBEDDED.address.toLowerCase())).toBeUndefined();
  });

  it("refuses a Solana key that is not on the caller's account — the takeover request", () => {
    expect(findLinkedWallet([SOL_OTHER], SOL_EMBEDDED.address)).toBeUndefined();
  });
});
