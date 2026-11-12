// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
import { PublicKey } from '@solana/web3.js';

export const DEVNET_USDC = '3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ';
export const MAINNET_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export type PreorderCluster = 'devnet' | 'mainnet';
export type PreorderConfig = {
  cluster: PreorderCluster; recipient: string; mint: string; rpc: string; refundEmail: string;
};
export class PreorderError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function preorderConfig(env: Record<string, string | undefined> = process.env): PreorderConfig {
  const cluster = env.PREORDER_CLUSTER || 'devnet';
  if (cluster !== 'devnet' && cluster !== 'mainnet') throw new PreorderError('Setup required: PREORDER_CLUSTER must be devnet or mainnet', 503);
  if (cluster === 'mainnet' && env.PREORDER_ALLOW_MAINNET !== 'I_ACKNOWLEDGE_REAL_FUNDS') {
    throw new PreorderError('Setup required: PREORDER_ALLOW_MAINNET=I_ACKNOWLEDGE_REAL_FUNDS', 503);
  }
  let recipient: PublicKey;
  try {
    recipient = new PublicKey(env.PREORDER_TREASURY || '');
    if (!PublicKey.isOnCurve(recipient.toBytes())) throw new Error('Wallet required');
  } catch { throw new PreorderError('Setup required: PREORDER_TREASURY (wallet public key)', 503); }
  const refundEmail = env.PREORDER_REFUND_EMAIL || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(refundEmail)) throw new PreorderError('Setup required: PREORDER_REFUND_EMAIL', 503);
  return { cluster, recipient: recipient.toBase58(), mint: cluster === 'devnet' ? DEVNET_USDC : MAINNET_USDC,
    rpc: cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com', refundEmail };
}

export function localDatabaseUrl(raw: string | undefined): string {
  if (!raw) throw new Error('TEST_DATABASE_URL must point to local Postgres');
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || !url.pathname.startsWith('/xorrpad_') || url.search) {
    throw new Error('TEST_DATABASE_URL must use a local xorrpad_ database without connection overrides');
  }
  return raw;
}
