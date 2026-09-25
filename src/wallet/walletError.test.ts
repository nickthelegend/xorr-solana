/**
 * viem's error text was going straight onto the screen.
 *
 * Pulling the kill switch on a fork build put this under "Stop all agents", off the bottom of a
 * scroll area: five lines, one of which says anything, and the other four publishing the RPC
 * endpoint, the Privy app id and the whole signed transaction into the user interface.
 */
import { describe, expect, it } from 'vitest';
import { CANCELLED, humanWalletError } from './walletError';

/** Verbatim from the simulator, shortened only in the hex blob. */
const VIEM_DUMP = `Transaction creation failed.

URL: https://base-mainnet.rpc.privy.systems/?privyAppId=cmtoq4h2o00nd0dg6r64i0od
Request body: {"method":"eth_sendRawTransaction","params":["0x02f8b28221058083df424083c96a8083682194abe6f2bbe7471c4976128f0dc13a7f83499e9a23"]}

Details: insufficient funds for gas * price + value: have 0 want 351872400000
Version: viem@2.56.3`;

describe('a wallet failure reads as a sentence, not a request log', () => {
  it('says what went wrong and nothing about the transport', () => {
    const message = humanWalletError(new Error(VIEM_DUMP));
    expect(message).toBe(
      'Your wallet has no ETH to pay the network fee, so the transaction was not sent.',
    );
  });

  it('never leaks the endpoint, the app id or the signed transaction', () => {
    const message = humanWalletError(new Error(VIEM_DUMP));
    expect(message).not.toContain('rpc.privy.systems');
    expect(message).not.toContain('privyAppId');
    expect(message).not.toContain('eth_sendRawTransaction');
    expect(message).not.toContain('0x02f8');
    expect(message).not.toContain('viem@');
  });

  it('a cancelled signature is not a fault', () => {
    expect(humanWalletError(new Error('User rejected the request.'))).toBe(
      'You cancelled the signature, so nothing changed.',
    );
  });

  it('keeps the node’s own reason when there is no better sentence', () => {
    const message = humanWalletError(
      new Error('Something failed.\n\nDetails: execution reverted: NotDelegate\nVersion: viem@2.56.3'),
    );
    expect(message).toBe('execution reverted: NotDelegate');
  });

  it('does not replace an unrecognised message with a generic apology', () => {
    expect(humanWalletError(new Error('Chain 8453 is not configured.'))).toBe(
      'Chain 8453 is not configured.',
    );
  });

  it('caps a runaway single line rather than filling the screen', () => {
    expect(humanWalletError(new Error('x'.repeat(500))).length).toBeLessThanOrEqual(200);
  });
});

describe('a closed Privy Solana sheet', () => {
  it('reads as a cancel, not a connection failure', async () => {
    const { humanWalletError, isUserCancel, CANCELLED } = await import('./walletError');
    const privy = new Error('Failed to connect to wallet', {
      cause: new Error('User exited the modal before submitting the transaction'),
    });
    expect(isUserCancel(privy)).toBe(true);
    expect(humanWalletError(privy)).toBe(CANCELLED);
    expect(isUserCancel(new Error('Failed to connect to wallet'))).toBe(false);
  });
});

/*
 * What the hosted build put on screen under "Stop all trading", verbatim (2026-09-22).
 *
 * web3.js raises this as one `Error.message`, and `errorText` hands a non-`ApiError` back its
 * message unchanged — so all five lines were rendered, ending with an instruction to catch an
 * exception type and call a method on it. Under a kill switch.
 */
const SEND_ERROR =
  'Simulation failed. \nMessage: Transaction simulation failed: Blockhash not found. \nLogs: \n[]. \n' +
  'Catch the `SendTransactionError` and call `getLogs()` on it for full details.';

describe('a Solana send that the cluster refused', () => {
  it('says the signature aged out, and that nothing moved', () => {
    const said = humanWalletError(new Error(SEND_ERROR));
    expect(said).toBe('That took longer than the network allows, so nothing was sent. Nothing changed — try once more.');
  });

  it('never repeats web3.js’s errand to the developer', () => {
    const said = humanWalletError(new Error(SEND_ERROR));
    expect(said).not.toMatch(/SendTransactionError|getLogs|Logs:/);
    expect(said.split('\n')).toHaveLength(1);
  });

  it('keeps the cluster’s own reason when the failure is not an expiry', () => {
    const insufficient =
      'Simulation failed. \nMessage: Transaction simulation failed: Error processing Instruction 0: ' +
      'custom program error: 0x1. \nLogs: \n[]. \nCatch the `SendTransactionError` and call `getLogs()` on it.';
    const said = humanWalletError(new Error(insufficient));
    expect(said).toContain('custom program error: 0x1');
    expect(said).not.toMatch(/SendTransactionError|getLogs/);
  });

  /* A closed sheet is the person's answer and outranks every message inside the error. */
  it('still reads a cancelled signature as a cancellation', () => {
    const cancelled = new Error('Failed to connect to wallet', { cause: new Error('The user exited the modal.') });
    expect(humanWalletError(cancelled)).toBe(CANCELLED);
  });
});

describe('no SOL for the fee, on Solana (2026-09-25)', () => {
  it('says SOL, not ETH, and what to do', () => {
    for (const raw of [
      'Transaction simulation failed: Attempt to debit an account but found no record of a prior credit.',
      'failed to send transaction: Transaction simulation failed: Error processing Instruction 0: insufficient funds for fee',
    ]) {
      expect(humanWalletError(new Error(raw))).toBe(
        'Your wallet has no SOL to pay the network fee, so nothing was sent. Send it a little SOL (about 0.02) and try again.',
      );
    }
  });
});
