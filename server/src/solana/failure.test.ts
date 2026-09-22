import { describe, expect, it } from 'vitest';
import { plainFailure } from './failure.js';

describe('plainFailure', () => {
  it('drops the program logs and names insufficient funds', () => {
    const e = new Error(
      'Simulation failed. \nMessage: Transaction simulation failed: Error processing Instruction 2: custom program error: 0x1. \nLogs: \n[\n  "Program ATokenGP invoke [1]"\n]. \nCatch the `SendTransactionError` and call `getLogs()` on it for full details.',
    );
    expect(plainFailure(e)).toBe('an account in the route did not hold enough to fill it');
  });

  it('keeps a plain reason as it is, without its trailing stop', () => {
    expect(plainFailure(new Error('Jupiter route reverted: {"InstructionError":[3,{"Custom":6001}]}.'))).toBe(
      'Jupiter route reverted: {"InstructionError":[3,{"Custom":6001}]}',
    );
  });

  it('never carries a log line', () => {
    expect(plainFailure(new Error('Transaction simulation failed: Blockhash not found. Logs: ["x"]'))).toBe('Blockhash not found');
  });
});
