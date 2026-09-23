import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { agentSeed, agentWalletAddress, usdcUnits } from './agentWallet';

describe("an agent's wallet, as the app derives it", () => {
  it('is the address the executor derives (server/src/agents/wallet.test.ts pins the same one)', async () => {
    const owner = new PublicKey('zBBNno5hf1JvyBEGRu889sXduQ4AZCexjkbPYA2jpkj');
    expect(agentSeed('b39f22c7-0beb-4264-99fb-fcd02c8a380f')).toBe('xorr-b39f22c70beb426499fbfcd0');
    expect((await agentWalletAddress(owner, 'b39f22c7-0beb-4264-99fb-fcd02c8a380f')).toBase58()).toBe(
      'FBedr8Y4XAcLgaKHztJg98BkXhrPm7hekVrAmZSJCW88',
    );
  });

  it('counts dollars in whole cents', () => {
    expect(usdcUnits(0.3)).toBe(300_000n);
    expect(usdcUnits(25)).toBe(25_000_000n);
    expect(usdcUnits(0.1 + 0.2)).toBe(300_000n);
  });
});
