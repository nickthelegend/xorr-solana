/**
 * The waitlist's pure rules: what counts as an email, what a code looks like, and that a code we mint is one we accept.
 * The line itself is SQL and is exercised against Postgres (`PLACE_SQL`).
 */
import { describe, expect, it } from 'vitest';
import { isRefCode, newRefCode, normalizeEmail } from './waitlist.js';

describe('an email', () => {
  it('is stored trimmed and lowercased, so one person is one row', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
  });

  it('is refused when it is not one', () => {
    for (const bad of ['', 'ada', 'ada@', '@example.com', 'ada@example', 'a da@example.com', 'ada@@example.com', 42, null]) {
      expect(normalizeEmail(bad), String(bad)).toBeUndefined();
    }
  });

  it('is refused past the length an address can have', () => {
    expect(normalizeEmail(`${'a'.repeat(250)}@x.io`)).toBeUndefined();
  });
});

describe('a referral code', () => {
  it('is eight characters with no look-alikes', () => {
    for (let i = 0; i < 200; i++) {
      const code = newRefCode();
      expect(code).toMatch(/^[A-Z2-9]{8}$/);
      expect(code).not.toMatch(/[01ILO]/);
      expect(isRefCode(code), code).toBe(true);
    }
  });

  it('is the same for the same bytes', () => {
    const bytes = Buffer.from([0, 1, 2, 3, 250, 251, 252, 253]);
    expect(newRefCode(bytes)).toBe(newRefCode(bytes));
  });

  it('is refused when it could not be one of ours', () => {
    for (const bad of ['', 'abcdefgh', 'ABCDEFG', 'ABCDEFGHJ', 'ABCDEFG0', 'ABCDEFGI', undefined, 12345678]) {
      expect(isRefCode(bad), String(bad)).toBe(false);
    }
  });
});
