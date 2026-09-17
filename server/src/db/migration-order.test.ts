/**
 * Migrations are applied in filename order, so the filenames have to encode a total, unambiguous
 * order — across both naming schemes at once.
 *
 * Two files sharing a number does not fail loudly: `readdirSync().sort()` still produces a
 * deterministic order, just one decided by whatever follows the number alphabetically rather than
 * by anyone's intent. It stayed harmless the first time only because the two files touched
 * different objects. Had one depended on the other, a fresh database would have built a schema
 * nobody tested while incrementally-migrated databases kept the other order.
 *
 * The number scheme caused that three times, because the number is stale the moment it is read.
 * New migrations are timestamped instead (`migration-names.ts`), and the old numbered files stay
 * exactly as they are — renaming an applied migration would make a migrated database run it again.
 * These assertions are what keep the two schemes ordering correctly against each other.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { classify, migrationFilename, MAX_LEGACY_NUMBER } from './migration-names.js';

const DIR = path.join(import.meta.dirname, 'migrations');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const classified = files.map(classify);

describe('migration filenames', () => {
  it('has migrations to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('names every migration in one of the two known shapes', () => {
    const invalid = classified.filter((c) => c.style === 'invalid');
    expect(
      invalid.map((c) => `${c.key} ${'reason' in c ? c.reason : ''}`),
      `new migrations are named like ${migrationFilename('example-change')}`,
    ).toEqual([]);
  });

  it('never gives two migrations the same key', () => {
    const seen = new Map<string, string[]>();
    for (const c of classified) {
      // Legacy files collide on their number; timestamped ones on their timestamp.
      const key = c.style === 'legacy' ? String(c.number) : c.style === 'timestamp' ? c.at : c.key;
      seen.set(key, [...(seen.get(key) ?? []), c.key]);
    }
    const clashes = [...seen.entries()].filter(([, group]) => group.length > 1);
    expect(
      clashes.map(([k, group]) => `${k}: ${group.join(' + ')}`),
      `two migrations sharing a key apply in filename order, not the order anyone intended. ` +
        `Name a new migration ${migrationFilename('your-change')} — it cannot collide.`,
    ).toEqual([]);
  });

  it('keeps every numbered migration below the point it would outsort a timestamp', () => {
    // '203-…' sorts after '2026…'; anything at or below MAX_LEGACY_NUMBER cannot.
    const tooHigh = classified.filter((c) => c.style === 'legacy' && c.number > MAX_LEGACY_NUMBER);
    expect(tooHigh.map((c) => c.key)).toEqual([]);
  });

  it('applies every numbered migration before every timestamped one', () => {
    const lastLegacy = files.findLastIndex((f) => classify(f).style === 'legacy');
    const firstStamped = files.findIndex((f) => classify(f).style === 'timestamp');
    if (lastLegacy === -1 || firstStamped === -1) return; // only one scheme present
    expect(
      lastLegacy,
      'a numbered migration sorted after a timestamped one, so it would apply out of order',
    ).toBeLessThan(firstStamped);
  });

  it('sorts in the same order a reader would put them in', () => {
    // What the runner does — plain filename sort — must equal ordering by scheme then by key.
    const intended = [...files].sort((a, b) => {
      const ca = classify(a);
      const cb = classify(b);
      const rank = (c: ReturnType<typeof classify>) => (c.style === 'legacy' ? 0 : 1);
      if (rank(ca) !== rank(cb)) return rank(ca) - rank(cb);
      if (ca.style === 'legacy' && cb.style === 'legacy') return ca.number - cb.number;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    expect(files).toEqual(intended);
  });

  it('orders timestamped migrations by the moment they were created', () => {
    const stamps = classified.flatMap((c) => (c.style === 'timestamp' ? [c.at] : []));
    expect(stamps).toEqual([...stamps].sort());
  });
});

describe('the name a new migration should have', () => {
  it('is generated, not guessed', () => {
    const at = new Date('2026-09-17T08:45:12.345Z');
    expect(migrationFilename('watchlist order', at)).toBe('20260917T084512-watchlist-order.sql');
  });

  it('is accepted by the same rules the directory is checked against', () => {
    const c = classify(migrationFilename('some new change'));
    expect(c.style).toBe('timestamp');
  });

  it('cannot collide between two authors a second apart', () => {
    const a = migrationFilename('one', new Date('2026-09-17T08:45:12Z'));
    const b = migrationFilename('two', new Date('2026-09-17T08:45:13Z'));
    expect(a).not.toBe(b);
    expect(a < b).toBe(true);
  });

  it('refuses a name that would leave nothing to read', () => {
    expect(() => migrationFilename('   ')).toThrow(/needs a name/);
  });
});
