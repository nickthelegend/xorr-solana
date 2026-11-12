// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
import 'server-only';
import { preorderDb } from './preorder-db';
import { PAD_BUILDS, PAD_MODELS } from './pad-pricing';
import { preorderConfig } from './preorder-config';
import type { Preorder } from './preorder-server';

export async function sendPreorderReceipt(order: Preorder): Promise<string> {
  if (!order.signature || order.status === 'pending') throw new Error('A verified payment is required before sending a receipt');
  const db = preorderDb();
  const missing = !process.env.RESEND_API_KEY ? 'RESEND_API_KEY' : !process.env.EMAIL_FROM ? 'EMAIL_FROM' : null;
  const { rows } = await db.query(
    `INSERT INTO email_events (preorder_id, status) VALUES ($1, $2)
     ON CONFLICT (preorder_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()
     WHERE email_events.status IN ('pending', 'failed', 'skipped_setup')
        OR (email_events.status = 'sending' AND email_events.updated_at < now() - interval '5 minutes') RETURNING id`,
    [order.id, missing ? 'skipped_setup' : 'sending']);
  if (!rows.length) {
    const current = await db.query('SELECT status FROM email_events WHERE preorder_id = $1', [order.id]);
    return current.rows[0].status;
  }
  if (missing) return `Setup required: ${missing}`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `preorder-${order.id}` },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: order.email, subject: 'Your xorrpad deposit receipt',
        text: `${PAD_MODELS[order.sku].name} · ${PAD_BUILDS[order.build].name}\nDeposit: ${order.amount} ${order.cluster === 'devnet' ? 'mUSDC (devnet test tokens; no real funds)' : 'USDC'}\nOrder: ${order.id}\nhttps://explorer.solana.com/tx/${order.signature}?cluster=${order.cluster === 'mainnet' ? 'mainnet-beta' : 'devnet'}\nYour deposit is refundable before the order ships. Request refund: mailto:${preorderConfig().refundEmail}?subject=${encodeURIComponent(`Refund request ${order.id}`)}\nShips after the pilot run, timeline TBD. Final refund terms are subject to Nick's approval.` }),
    });
    if (!response.ok) throw new Error('Receipt delivery failed');
    await db.query("UPDATE email_events SET status = 'sent', updated_at = now() WHERE preorder_id = $1", [order.id]);
    return 'sent';
  } catch {
    await db.query("UPDATE email_events SET status = 'failed', updated_at = now() WHERE preorder_id = $1", [order.id]);
    return 'failed';
  }
}
