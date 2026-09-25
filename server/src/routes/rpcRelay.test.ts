import { describe, expect, it } from 'vitest';
import { refusedCalls, RELAYED_METHODS } from './rpcRelay.js';

describe('the RPC relay carries only the app’s own calls (2026-09-25)', () => {
  it('passes the reads and the signed transactions the app makes', () => {
    for (const method of ['getLatestBlockhash', 'getTokenAccountsByOwner', 'sendTransaction', 'getSignatureStatuses']) {
      expect(refusedCalls({ jsonrpc: '2.0', id: 1, method })).toBeNull();
    }
  });

  it('refuses anything else, per call, with the id it came with', () => {
    expect(refusedCalls({ jsonrpc: '2.0', id: 7, method: 'getProgramAccounts' })).toEqual([
      { id: 7, error: { code: -32601, message: expect.stringContaining('getProgramAccounts is not relayed') } },
    ]);
    expect(refusedCalls([{ id: 1, method: 'getBalance' }, { id: 2, method: 'requestAirdrop' }])).toHaveLength(1);
  });

  it('bounds a batch', () => {
    expect(refusedCalls([])).not.toBeNull();
    expect(refusedCalls(Array.from({ length: 21 }, (_, i) => ({ id: i, method: 'getSlot' })))).not.toBeNull();
  });

  it('never relays the expensive scans', () => {
    expect(RELAYED_METHODS.has('getProgramAccounts')).toBe(false);
    expect(RELAYED_METHODS.has('getSignaturesForAddress')).toBe(false);
  });
});
