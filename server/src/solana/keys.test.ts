/**
 * The derived keys come from a public string, so the loader must refuse them anywhere a stranger could reach the
 * cluster: devnet, mainnet, or a fork whose RPC is not on this machine.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

async function freshKeys(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return import('./keys.js');
}

const NO_KEYS = {
  XORR_KEY_DELEGATE: '',
  XORR_KEY_DIR: '/nonexistent-xorr-keys',
  XORR_ALLOW_SEED_KEYS: '',
  FORK_RPC: '',
  SOLANA_RPC_URL: '',
};

describe('the derived-key fallback', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is allowed for a fork on this machine', async () => {
    const keys = await freshKeys({ ...NO_KEYS, XORR_CHAIN: 'solana-fork', FORK_RPC: 'http://127.0.0.1:8899' });
    expect(keys.seedKeyRefusal()).toBeNull();
    expect(keys.delegateKeypair().publicKey.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it('is refused for a fork reachable over the network, naming the variable to set', async () => {
    const keys = await freshKeys({ ...NO_KEYS, XORR_CHAIN: 'solana-fork', FORK_RPC: 'https://fork.example.com' });
    expect(keys.seedKeyRefusal()).toMatch(/not on this machine/);
    expect(() => keys.delegateKeypair()).toThrow(/XORR_KEY_DELEGATE/);
  });

  it('is refused on devnet and mainnet whatever the RPC', async () => {
    for (const cluster of ['solana-devnet', 'solana-mainnet']) {
      const keys = await freshKeys({ ...NO_KEYS, XORR_CHAIN: cluster, ALLOW_MAINNET: 'yes' });
      expect(keys.seedKeyRefusal()).toMatch(/local validator only/);
      expect(() => keys.payerKeypair()).toThrow(/XORR_KEY_PAYER/);
    }
  });

  it('can be opted into for a throwaway CI validator', async () => {
    const keys = await freshKeys({
      ...NO_KEYS,
      XORR_CHAIN: 'solana-fork',
      FORK_RPC: 'http://validator:8899',
      XORR_ALLOW_SEED_KEYS: 'yes',
    });
    expect(keys.seedKeyRefusal()).toBeNull();
  });

  it('uses a configured key before anything else', async () => {
    const { Keypair } = await import('@solana/web3.js');
    const bs58 = (await import('bs58')).default;
    const kp = Keypair.generate();
    const keys = await freshKeys({
      ...NO_KEYS,
      XORR_CHAIN: 'solana-mainnet',
      ALLOW_MAINNET: 'yes',
      XORR_KEY_DELEGATE: bs58.encode(kp.secretKey),
    });
    expect(keys.delegateKeypair().publicKey.equals(kp.publicKey)).toBe(true);
  });
});
