import { describe, expect, it, vi } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';

vi.mock('@/data/api', () => ({ api: {} }));
vi.mock('./solanaTx', () => ({ solanaConnection: () => ({}) }));
const { buildGrantTx, buildRevokeTx, grantAllowance } = await import('./solanaGrant');

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const NVDAX = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
const owner = Keypair.generate().publicKey;
const delegate = Keypair.generate().publicKey.toBase58();
const grant = { chain: 'solana' as const, delegate, token: USDC, decimals: 6, venues: ['jupiter'] };

describe('the grant the owner signs', () => {
  it('approves USDC for the cap times the days, and nothing else when nothing is sellable', () => {
    const tx = buildGrantTx({ owner, grant, dailyCapUsd: 100, durationMs: 3 * 86_400_000 });
    expect(tx.instructions).toHaveLength(2);
    expect(tx.instructions.every((ix) => !ix.programId.equals(TOKEN_2022_PROGRAM_ID))).toBe(true);
    expect(grantAllowance(100, 3 * 86_400_000, 6)).toBe(300_000_000n);
  });

  it('also approves the delegate on each sellable xStock account, under Token-2022', () => {
    const tx = buildGrantTx({
      owner,
      grant: { ...grant, sellable: [{ symbol: 'NVDAx', mint: NVDAX, decimals: 8 }] },
      dailyCapUsd: 100,
      durationMs: 86_400_000,
    });
    expect(tx.instructions).toHaveLength(4);
    const approve = tx.instructions[3]!;
    expect(approve.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    const nvdaxAta = getAssociatedTokenAddressSync(new PublicKey(NVDAX), owner, false, TOKEN_2022_PROGRAM_ID);
    expect(approve.keys[0]!.pubkey.equals(nvdaxAta)).toBe(true);
    expect(approve.keys[2]!.pubkey.toBase58()).toBe(delegate);
  });
});

describe('the stop the owner signs', () => {
  it('always revokes USDC, and every other account that names a delegate, each under its own program', () => {
    const usdcAta = getAssociatedTokenAddressSync(new PublicKey(USDC), owner, false, TOKEN_PROGRAM_ID);
    const nvdaxAta = getAssociatedTokenAddressSync(new PublicKey(NVDAX), owner, false, TOKEN_2022_PROGRAM_ID);
    const tx = buildRevokeTx({
      owner,
      token: USDC,
      delegated: [
        { account: usdcAta, programId: TOKEN_PROGRAM_ID },
        { account: nvdaxAta, programId: TOKEN_2022_PROGRAM_ID },
      ],
    });
    expect(tx.instructions).toHaveLength(2);
    expect(tx.instructions[0]!.keys[0]!.pubkey.equals(usdcAta)).toBe(true);
    expect(tx.instructions[1]!.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
  });

  it('still revokes USDC when the chain read found nothing', () => {
    expect(buildRevokeTx({ owner, token: USDC }).instructions).toHaveLength(1);
  });
});
