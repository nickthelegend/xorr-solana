import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isPublicPath, PUBLIC_PATHS, PUBLIC_PREFIXES } from './publicPaths';

/**
 * This list and the executor's must agree.
 *
 * They are two halves of one decision and they live in different packages, so nothing but a test
 * holds them together. When they drifted the symptom was not a slow request — `api.get` throws
 * `NotSignedIn` before the network for anything missing here, and the screen rendered that as
 * "Sign in to see this." A public endpoint behind a login prompt, with no network request for
 * anyone to notice.
 */
const SERVER = path.join(__dirname, '../../server/src/auth/middleware.ts');

function serverPublic(): { paths: string[]; prefixes: string[] } {
  /*
   * Reads only path literals that sit alone on a line, e.g. `  '/market/logos',`.
   *
   * Stripping comments first and then scanning was the obvious approach and it silently ate two
   * real entries, which made this test report drift that did not exist and hide drift that did.
   * A list entry in this codebase is always its own line; prose never is.
   */
  const src = fs.readFileSync(SERVER, 'utf8');
  const block = (name: string) => {
    const at = src.indexOf(name);
    if (at < 0) throw new Error(`${name} not found in ${SERVER}`);
    const open = src.indexOf('[', at);
    const close = src.indexOf('];', open);
    if (open < 0 || close < 0) throw new Error(`could not read the ${name} literal`);
    return src
      .slice(open, close)
      .split('\n')
      .map((line) => /^\s*'(\/[^']*)',?\s*$/.exec(line)?.[1])
      .filter((x): x is string => Boolean(x));
  };
  return { paths: block('const PUBLIC_PATHS'), prefixes: block('const PUBLIC_PREFIXES') };
}

describe('public paths agree with the executor', () => {
  it('every path the server serves without a session is known to the client', () => {
    const server = serverPublic();
    const missing = server.paths.filter((p) => !PUBLIC_PATHS.includes(p) && !PUBLIC_PREFIXES.some((x) => p.startsWith(x)));
    expect(missing, `public on the server, not on the client: ${missing.join(', ')}`).toEqual([]);
  });

  it('every prefix the server serves without a session is known to the client', () => {
    const missing = serverPublic().prefixes.filter((p) => !PUBLIC_PREFIXES.includes(p));
    expect(missing, `public prefix on the server, not on the client: ${missing.join(', ')}`).toEqual([]);
  });

  it('the client claims nothing public that the server gates', () => {
    const server = serverPublic();
    const extra = PUBLIC_PATHS.filter((p) => !server.paths.includes(p) && !server.prefixes.some((x) => p.startsWith(x)));
    expect(extra, `client thinks these are public but the server gates them: ${extra.join(', ')}`).toEqual([]);
  });

  it('classifies the paths this bug was found on', () => {
    expect(isPublicPath('/market/preipo')).toBe(true);
    expect(isPublicPath('/strategies/library')).toBe(true);
    expect(isPublicPath('/strategies/library/b200_sess_8')).toBe(true);
    /* `/strategies` is the caller's OWN strategies and must stay gated. */
    expect(isPublicPath('/strategies')).toBe(false);
    expect(isPublicPath('/positions')).toBe(false);
  });
});
