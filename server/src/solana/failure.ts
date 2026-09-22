/**
 * Why a transaction failed, in a sentence someone about to spend money can read (2026-09-23).
 *
 * A failed fill put web3.js's own error inside the refusal: "Simulation failed. Message: Transaction simulation failed:
 * Error processing Instruction 2: custom program error: 0x1. Logs: [ "Program ATokenGP… invoke [1]", … ]" — twenty
 * lines of program log on the order ticket. The logs stay in the executor's log, where they help; the person gets the
 * cause, and the one cause that has a name gets its name.
 */
export function plainFailure(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const beforeLogs = raw.split(/\bLogs:/)[0] ?? raw;
  const line = beforeLogs
    .replace(/Catch the `SendTransactionError`[^.]*\./g, '')
    .replace(/\s+/g, ' ')
    .replace(/^Simulation failed\.?\s*/i, '')
    .replace(/^Message:\s*/i, '')
    .replace(/^Transaction simulation failed:\s*/i, '')
    .trim()
    .replace(/[.\s]+$/, '');
  // The token programs' error 1 is InsufficientFunds: an account in the route did not hold what it was asked to move.
  if (/custom program error: 0x1$/.test(line)) return 'an account in the route did not hold enough to fill it';
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}
