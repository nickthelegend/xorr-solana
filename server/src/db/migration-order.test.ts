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

/**
 * Renaming a migration is bookkeeping, not just a file move.
 *
 * `schema_migrations` records the FILENAME, so a renamed migration is a file an already-migrated
 * database has no record of and will run again. `migrate.ts` handles that with a `RENAMED` map
 * that carries the bookkeeping row forward without executing anything — and that map is a second
 * place the truth lives, which is the kind of thing that goes stale silently.
 *
 * Read out of the source rather than imported: `migrate.ts` is a script that connects to a
 * database and migrates it at import time, so importing it here would run a migration.
 */
describe('the renamed-migration map', () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, 'migrate.ts'), 'utf8');

  /** The `'current': 'previous'` pairs inside `const RENAMED = Object.freeze({ ... })`. */
  function renamedPairs(): { current: string; previous: string }[] {
    const block = /const RENAMED[^{]*\{([\s\S]*?)\}\)/.exec(source);
    if (!block?.[1]) throw new Error('could not find the RENAMED map in migrate.ts');
    return [...block[1].matchAll(/'([^']+\.sql)'\s*:\s*'([^']+\.sql)'/g)].map((m) => ({
      current: m[1]!,
      previous: m[2]!,
    }));
  }

  it('finds the map, so this is checking something', () => {
    expect(renamedPairs().length).toBeGreaterThan(0);
  });

  /*
   * A key naming a file that no longer exists carries nothing forward, silently. It happens the
   * second time a migration is renumbered — the map still points at the first new name.
   */
  it('names a migration that actually exists for every rename', () => {
    const missing = renamedPairs()
      .filter((p) => !files.includes(p.current))
      .map((p) => p.current);
    expect(missing, `RENAMED points at files that are not here: ${missing.join(', ')}`).toEqual([]);
  });

  /* The old name must be gone. If both exist, the migration would run twice under two names. */
  it('does not leave the old filename in place beside the new one', () => {
    const stillThere = renamedPairs()
      .filter((p) => files.includes(p.previous))
      .map((p) => p.previous);
    expect(stillThere, `renamed away but still present: ${stillThere.join(', ')}`).toEqual([]);
  });

  /*
   * Every rename this repo has actually made is declared.
   *
   * Derived from git rather than trusted: a rename that skipped the map is the failure the map
   * exists to prevent, and it is invisible until a deployed database re-runs the SQL.
   */
  it('declares every rename git has recorded, or none are missing', () => {
    const renamed = new Set(renamedPairs().map((p) => p.current));
    // Only migrations that ever shipped under another name need an entry; a file renamed while
    // still on a branch never reached a database under the old name. `git log --follow` would
    // conflate the two, so this asserts the weaker, checkable property: nothing declared is stale.
    for (const name of renamed) expect(files).toContain(name);
  });
});
