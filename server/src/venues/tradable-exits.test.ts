/**
 * Everything buyable has to be closable, in every path that closes.
 *
 * The grant was taught to approve the delegate on Tessera's accounts, which is what the chain
 * needs. Two gates in this executor still asked `XSTOCKS` whether a symbol existed, and both sat
 * on the way OUT: `/positions/close` refused a T-Token as "not a tradable xStock", and the Solana
 * exit sweep — stop-losses and take-profits — skipped one with `continue`, silently, no log and no
 * audit row. A stop that never fires is worse than one refused at the door, because the screen
 * goes on showing it as live.
 *
 * These pin the property rather than the mints: any class `tradableToken` admits, both gates admit.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { tradableTokens } from './tradable-token.js';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('the paths that close a position', () => {
  it('has at least one pre-IPO token to be wrong about', () => {
    expect(tradableTokens().some((t) => t.kind === 'pre-ipo')).toBe(true);
  });

  /*
   * Read as source rather than called: both gates sit behind a database and a cluster, and what
   * went wrong was never the arithmetic — it was which table of symbols got asked.
   */
  it('asks tradableToken, not XSTOCKS, when closing a holding', () => {
    const s = source('../routes/panic.ts');
    expect(s).toContain('tradableToken(symbol)');
    expect(s).not.toMatch(/^\s*const stock = XSTOCKS\[/m);
  });

  it('asks tradableToken, not XSTOCKS, when sweeping exits', () => {
    const s = source('../executor/solanaExits.ts');
    expect(s).toContain('tradableToken(row.symbol)');
    expect(s).not.toMatch(/XSTOCKS\[/);
  });

  it('prices a close and an exit through the venue that prices its class', () => {
    expect(source('../routes/panic.ts')).toContain('tradablePriceUsd(symbol)');
    expect(source('../executor/solanaExits.ts')).toContain('priceOf = tradablePriceUsd');
  });
});
