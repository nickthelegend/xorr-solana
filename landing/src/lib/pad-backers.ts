// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
import 'server-only';
import BigNumber from 'bignumber.js';
import { preorderDb } from './preorder-db';
import { verifyPreorderTransfer } from './preorder-chain';
import { DEVNET_USDC, MAINNET_USDC, preorderConfig, PreorderError } from './preorder-config';
import { PAD_MODELS } from './pad-pricing';
import type { Preorder } from './preorder-server';

export function signatureLink(signature: string, cluster: Preorder['cluster']) {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=${cluster === 'mainnet' ? 'mainnet-beta' : 'devnet'}`;
}

/** No persisted verification flag or cached count: every displayed payment is checked afresh. */
export async function verifiedBackers() {
  const cluster = process.env.PREORDER_CLUSTER || 'devnet';
  if (cluster !== 'devnet') preorderConfig(); // Fail closed before any mainnet RPC.
  const { rows } = await preorderDb().query<Preorder>(
    "SELECT * FROM preorders WHERE status = 'paid' AND cluster = $1 ORDER BY created_at DESC, id DESC", [cluster]);
  const backers = [];
  let deposits = new BigNumber(0);
  // Sequential verification avoids bursting the public RPC. Any transport failure hides totals,
  // rather than presenting a partial count as the complete wall.
  for (const order of rows) {
    if (!order.signature || !order.wallet || order.mint !== (cluster === 'devnet' ? DEVNET_USDC : MAINNET_USDC)
        || !PAD_MODELS[order.sku] || !new BigNumber(order.amount).eq(PAD_MODELS[order.sku].deposit)) continue;
    try {
      const payment = await verifyPreorderTransfer(order, order.signature);
      if (payment.wallet !== order.wallet) continue;
    } catch (error) {
      if ((error instanceof PreorderError && error.status === 422)
          || (error instanceof Error && error.name === 'ValidateTransferError')) continue;
      throw error;
    }
    backers.push({ id: order.id, name: order.show_publicly && order.public_name ? order.public_name
      : `${order.wallet.slice(0, 4)}…${order.wallet.slice(-4)}`, sku: order.sku, build: order.build,
      date: new Date(order.created_at).toISOString(), explorer: signatureLink(order.signature, order.cluster) });
    deposits = deposits.plus(order.amount);
  }
  return { backers, count: backers.length, deposits: deposits.toFixed(2), cluster };
}
