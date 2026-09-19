/**
 * Key management for xorr-solana (PLAN.md §8.1).
 *
 * Manages delegate, payer, dev-owner, and venue-vault keypairs.
 * Keys are loaded from environment variables (base58 secret) or JSON keypair files
 * in XORR_KEY_DIR. If not found, deterministic keypairs are derived — but ONLY for a localnet or fork whose RPC is on
 * this machine (or with XORR_ALLOW_SEED_KEYS=yes, for a disposable CI validator). The seed is a public string, so
 * anyone can compute those keys: on any reachable cluster the delegate would be a key that can spend every user's
 * delegated USDC. Anywhere else a missing key is a refusal to boot, naming the variable to set (2026-09-19).
 *
 * NEVER logs or prints secret keys — only public keys are logged.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { activeClusterKey, rpcUrl } from './clusters.js';

const KEY_DIR = process.env.XORR_KEY_DIR ?? path.resolve(process.cwd(), '.keys');

function parseKeySecret(raw: string): Keypair {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const bytes = Uint8Array.from(JSON.parse(trimmed) as number[]);
    return Keypair.fromSecretKey(bytes);
  }
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

function loadOrDeriveKey(name: string, envVar?: string): Keypair {
  // 1. Env var
  if (envVar) {
    return parseKeySecret(envVar);
  }

  // 2. File in KEY_DIR
  try {
    const file = path.join(KEY_DIR, `${name}.json`);
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      return parseKeySecret(content);
    }
  } catch {
    // Ignore file read error and fall back
  }

  // 3. Fallback: deterministic seed from name for repeatable local development — never on a reachable cluster.
  const refusal = seedKeyRefusal();
  if (refusal) {
    throw new Error(
      `No ${name} key: set ${envVarName(name)} (a base58 or JSON secret) or put ${name}.json in XORR_KEY_DIR. ${refusal}`,
    );
  }
  // 32-byte seed derived predictably from key name
  const seed = new Uint8Array(32);
  const nameBytes = new TextEncoder().encode(`xorr-solana-seed-${name}`);
  seed.set(nameBytes.subarray(0, 32));
  return Keypair.fromSeed(seed);
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function envVarName(name: string): string {
  return `XORR_KEY_${name.toUpperCase().replace(/-/g, '_')}`;
}

/**
 * Why the publicly derivable keys may not be used here, or null when they may: a localnet or fork whose RPC is on
 * this machine, or an explicit XORR_ALLOW_SEED_KEYS=yes (a throwaway CI validator).
 */
export function seedKeyRefusal(): string | null {
  const cluster = activeClusterKey();
  if (cluster !== 'solana-localnet' && cluster !== 'solana-fork') {
    return `Derived keys are for a local validator only, and this is ${cluster}.`;
  }
  if (process.env.XORR_ALLOW_SEED_KEYS === 'yes') return null;
  let host: string;
  try {
    host = new URL(rpcUrl(cluster)).hostname;
  } catch {
    return 'The cluster RPC is not a URL this can check.';
  }
  return LOOPBACK.has(host)
    ? null
    : `The RPC (${host}) is not on this machine, so a key anyone can derive would control real delegations.`;
}

let cachedDelegate: Keypair | undefined;
let cachedPayer: Keypair | undefined;
let cachedDevOwner: Keypair | undefined;
let cachedVenueVault: Keypair | undefined;

export function delegateKeypair(): Keypair {
  cachedDelegate ??= loadOrDeriveKey('delegate', process.env.XORR_KEY_DELEGATE);
  return cachedDelegate;
}

export function payerKeypair(): Keypair {
  cachedPayer ??= loadOrDeriveKey('payer', process.env.XORR_KEY_PAYER);
  return cachedPayer;
}

export function devOwnerKeypair(): Keypair {
  cachedDevOwner ??= loadOrDeriveKey('dev-owner', process.env.XORR_KEY_DEV_OWNER);
  return cachedDevOwner;
}

export function venueVaultKeypair(): Keypair {
  cachedVenueVault ??= loadOrDeriveKey('venue-vault', process.env.XORR_KEY_VENUE_VAULT);
  return cachedVenueVault;
}

export function keyPublicKeys() {
  return {
    delegate: delegateKeypair().publicKey.toBase58(),
    payer: payerKeypair().publicKey.toBase58(),
    devOwner: devOwnerKeypair().publicKey.toBase58(),
    venueVault: venueVaultKeypair().publicKey.toBase58(),
  };
}
