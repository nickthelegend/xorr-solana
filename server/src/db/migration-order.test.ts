/**
 * Migrations are applied in filename order, so the filenames have to encode the intended order
 * unambiguously.
 *
 * Two files sharing a number does not fail loudly — `readdirSync().sort()` still produces a
 * deterministic order, just one decided by whatever follows the number alphabetically rather than
 * by anyone's intent. It stayed harmless here only because the two 030s touched different objects.
 * Had one depended on the other, a fresh database would have built a schema nobody tested, and the
 * databases that were migrated incrementally would disagree with it.
 *
 * This is the cheap check that keeps that from being discovered in production.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(import.meta.dirname, 'migrations');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

describe('migration filenames', () => {
  it('has migrations to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('gives every migration a number', () => {
    const unnumbered = files.filter((f) => !/^\d{3}-/.test(f));
    expect(unnumbered, `not numbered NNN-: ${unnumbered.join(', ')}`).toEqual([]);
  });

  it('never gives two migrations the same number', () => {
    const seen = new Map<string, string[]>();
    for (const f of files) {
      const n = f.slice(0, 3);
      seen.set(n, [...(seen.get(n) ?? []), f]);
    }
    const clashes = [...seen.entries()].filter(([, group]) => group.length > 1);
    expect(
      clashes.map(([n, group]) => `${n}: ${group.join(' + ')}`),
      'two migrations sharing a number apply in filename order, not in the order anyone intended',
    ).toEqual([]);
  });

  it('applies in the same order a human reading the numbers would expect', () => {
    // The runner sorts by filename; that has to agree with sorting by number.
    const byNumber = [...files].sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
    expect(files).toEqual(byNumber);
  });

  it('leaves no number both used and skipped in a way that hides a lost file', () => {
    // Gaps are fine — a renumber leaves one — but a number must not go backwards.
    const numbers = files.map((f) => Number(f.slice(0, 3)));
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]!, `${files[i]} sorts after ${files[i - 1]}`).toBeGreaterThan(numbers[i - 1]!);
    }
  });
});
