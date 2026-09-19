/** What a Solana withdrawal moved, read from the chain's own balance records — never guessed from the allowlist. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ one: vi.fn(), query: vi.fn(), tx: vi.fn() }));
const { tokenMovement } = await import('./withdrawals.js');

const OWNER = 'GiKwSkGbok8AvQeZFL7HNcHZqce8bTvjsVti3HiGsHJM';
const DEST = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const NVDAX = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
const bal = (accountIndex: number, mint: string, owner: string, amount: string, decimals = 6) => ({
  accountIndex,
  mint,
  owner,
  uiTokenAmount: { amount, decimals },
});

describe('tokenMovement', () => {
  it('reads a USDC send and its recipient', () => {
    const m = tokenMovement(
      { preTokenBalances: [bal(1, USDC, OWNER, '54000000')], postTokenBalances: [bal(1, USDC, OWNER, '53000000'), bal(2, USDC, DEST, '1000000')] },
      OWNER,
    );
    expect(m).toEqual({ mint: USDC, units: 1_000_000n, decimals: 6, to: DEST });
  });

  it('reads an xStock send, in its own decimals', () => {
    const m = tokenMovement(
      {
        preTokenBalances: [bal(1, NVDAX, OWNER, '45000000', 8), bal(2, NVDAX, DEST, '0', 8)],
        postTokenBalances: [bal(1, NVDAX, OWNER, '40000000', 8), bal(2, NVDAX, DEST, '5000000', 8)],
      },
      OWNER,
    );
    expect(m).toEqual({ mint: NVDAX, units: 5_000_000n, decimals: 8, to: DEST });
  });

  it('names no recipient when the chain shows none', () => {
    const m = tokenMovement(
      { preTokenBalances: [bal(1, USDC, OWNER, '10')], postTokenBalances: [bal(1, USDC, OWNER, '5')] },
      OWNER,
    );
    expect(m?.to).toBeNull();
  });

  it('is null when nothing of the owner fell', () => {
    expect(tokenMovement({ preTokenBalances: [], postTokenBalances: [bal(1, USDC, OWNER, '5')] }, OWNER)).toBeNull();
  });
});
