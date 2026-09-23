import { describe, expect, it, vi } from 'vitest';

vi.mock('../solana/keys.js', () => ({ delegateKeypair: () => ({ publicKey: { equals: () => true } }) }));
const { agentSeed, agentWalletAddress } = await import('./wallet.js');

describe("an agent's wallet address", () => {
  it('fits the 32-character seed limit and is stable for an agent', async () => {
    const id = 'b39f22c7-0beb-4264-99fb-fcd02c8a380f';
    expect(agentSeed(id)).toBe('xorr-b39f22c70beb426499fbfcd0');
    expect(agentSeed(id).length).toBeLessThanOrEqual(32);
    const owner = 'zBBNno5hf1JvyBEGRu889sXduQ4AZCexjkbPYA2jpkj';
    const a = await agentWalletAddress(owner, id);
    const b = await agentWalletAddress(owner, id);
    expect(a.toBase58()).toBe(b.toBase58());
    // Pinned: the app derives the same address (src/wallet/agentWallet.ts); if this moves, both must.
    expect(a.toBase58()).toMatchSnapshot();
  });

  it('differs between agents and between owners', async () => {
    const owner = 'zBBNno5hf1JvyBEGRu889sXduQ4AZCexjkbPYA2jpkj';
    const a = await agentWalletAddress(owner, 'b39f22c7-0beb-4264-99fb-fcd02c8a380f');
    const b = await agentWalletAddress(owner, '11111111-0beb-4264-99fb-fcd02c8a380f');
    const c = await agentWalletAddress('7fqRhkrudvkTvueLbwU8mAXkruLDcgQBLYvBQq4cCyRk', 'b39f22c7-0beb-4264-99fb-fcd02c8a380f');
    expect(new Set([a.toBase58(), b.toBase58(), c.toBase58()]).size).toBe(3);
  });
});
