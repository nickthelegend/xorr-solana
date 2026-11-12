// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
import 'server-only';
import { sendEmail } from './email-server';
import { signatureLink } from './pad-backers';
import { PAD_BUILDS, PAD_MODELS } from './pad-pricing';
import { preorderConfig } from './preorder-config';
import type { Preorder } from './preorder-server';

export async function sendPreorderReceipt(order: Preorder): Promise<string> {
  if (!order.signature || order.status === 'pending') throw new Error('A verified payment is required before sending a receipt');
  if (order.status !== 'paid' && order.status !== 'shipped') return 'not_applicable';
  return sendEmail({ preorderId: order.id, kind: 'preorder_receipt', source: 'pad', to: order.email,
    subject: 'Your xorrpad deposit receipt',
    text: `${PAD_MODELS[order.sku].name} · ${PAD_BUILDS[order.build].name}\nDeposit: ${order.amount} ${order.cluster === 'devnet' ? 'mUSDC (devnet test tokens; no real funds)' : 'USDC'}\nOrder: ${order.id}\n${signatureLink(order.signature, order.cluster)}\nYour deposit is refundable before the order ships. Request refund: mailto:${preorderConfig().refundEmail}?subject=${encodeURIComponent(`Refund request ${order.id}`)}\nShips after the pilot run, timeline TBD. Final refund terms are subject to Nick's approval.` });
}
