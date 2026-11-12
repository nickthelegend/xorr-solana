// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
import 'server-only';
import { randomUUID } from 'node:crypto';
import { Keypair, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { encodeURL } from '@solana/pay';
import BigNumber from 'bignumber.js';
import { PAD_MODELS, PAD_SKUS, PAD_BUILD_IDS, type PadSku, type PadBuild, type PadEdition } from './pad-pricing';
import { preorderConfig, PreorderError, type PreorderCluster } from './preorder-config';
import { preorderDb } from './preorder-db';
import { findPreorderTransfer } from './preorder-chain';
import { sendPreorderReceipt } from './preorder-receipt';

export type Preorder = {
  id: string; idempotency_key: string; sku: PadSku; build: PadBuild; edition: PadEdition;
  amount: string; cluster: PreorderCluster; recipient: string; mint: string; reference: string;
  signature: string | null; wallet: string | null; email: string; public_name: string | null;
  show_publicly: boolean; status: 'pending' | 'paid' | 'refunded' | 'shipped'; created_at: Date;
};
export const isOrderId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

export function publicPreorder(order: Preorder) {
  const { id, sku, build, edition, amount, cluster, recipient, mint, reference, signature, status } = order;
  return { id, sku, build, edition, amount, cluster, recipient, mint, reference, signature, status,
    recipientAta: getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(recipient)).toBase58(),
    url: encodeURL({ recipient: new PublicKey(recipient), splToken: new PublicKey(mint), amount: new BigNumber(amount),
      reference: new PublicKey(reference), label: 'xorrpad', message: `${PAD_MODELS[sku].name} refundable deposit (${cluster})` }).toString(),
  };
}

export async function createPreorder(input: Record<string, unknown>) {
  const config = preorderConfig();
  if (!PAD_SKUS.includes(input.sku as PadSku) || !PAD_BUILD_IDS.includes(input.build as PadBuild)
    || !['standard', 'founder'].includes(input.edition as string)) throw new PreorderError('Choose a model, build and edition.');
  if (!isOrderId(input.idempotencyKey)) throw new PreorderError('A checkout idempotency key is required.');
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(email)) throw new PreorderError('Enter a valid email for shipping updates.');
  if (typeof input.showPublicly !== 'boolean') throw new PreorderError('Choose whether to publish your name.');
  const name = typeof input.publicName === 'string' ? input.publicName.trim() : '';
  if (name.length > 80 || /[\p{Cc}\p{Cf}]/u.test(name)) throw new PreorderError('Public names must be at most 80 characters, without control characters.');
  const db = preorderDb();
  const sku = input.sku as PadSku;
  const values = [randomUUID(), input.idempotencyKey, sku, input.build, input.edition, PAD_MODELS[sku].deposit,
    config.cluster, config.recipient, config.mint, Keypair.generate().publicKey.toBase58(), email,
    input.showPublicly ? name || null : null, input.showPublicly];
  // Idempotency keys are unguessable checkout capabilities; changed form data needs a new checkout.
  const { rows } = await db.query<Preorder>(
    `INSERT INTO preorders (id, idempotency_key, sku, build, edition, amount, cluster, recipient, mint, reference, email, public_name, show_publicly)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
     WHERE preorders.sku = EXCLUDED.sku AND preorders.build = EXCLUDED.build AND preorders.edition = EXCLUDED.edition
       AND preorders.cluster = EXCLUDED.cluster AND preorders.recipient = EXCLUDED.recipient AND preorders.mint = EXCLUDED.mint
       AND preorders.email = EXCLUDED.email AND preorders.public_name IS NOT DISTINCT FROM EXCLUDED.public_name
       AND preorders.show_publicly = EXCLUDED.show_publicly RETURNING *`, values);
  if (!rows[0]) throw new PreorderError('Checkout details changed. Start a new checkout.', 409);
  return publicPreorder(rows[0]);
}

export async function readPreorder(id: unknown) {
  if (!isOrderId(id)) throw new PreorderError('Invalid order ID.');
  const { rows } = await preorderDb().query<Preorder>('SELECT * FROM preorders WHERE id = $1', [id]);
  if (!rows[0]) throw new PreorderError('Order not found.', 404);
  const config = preorderConfig();
  if (rows[0].cluster !== config.cluster || rows[0].recipient !== config.recipient || rows[0].mint !== config.mint) {
    throw new PreorderError('Setup required: this order belongs to a different payment configuration', 503);
  }
  return rows[0];
}

export async function confirmPreorder(id: unknown) {
  preorderConfig(); // Also gate reads/confirmation when mainnet hasn't been explicitly enabled.
  const order = await readPreorder(id);
  if (order.status !== 'pending') return { ...publicPreorder(order), email: await sendPreorderReceipt(order) };
  const payment = await findPreorderTransfer(order);
  if (!payment) return { ...publicPreorder(order), email: 'pending_payment' };
  // Unique signature + conditional UPDATE make concurrent confirmations safe, with one receipt event per order.
  try {
    await preorderDb().query(
      `UPDATE preorders SET status = 'paid', signature = $2, wallet = $3, paid_at = now() WHERE id = $1 AND status = 'pending'`,
      [order.id, payment.signature, payment.wallet]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new PreorderError('This payment is already assigned to another order.', 409);
    throw error;
  }
  const paid = await readPreorder(order.id);
  return { ...publicPreorder(paid), email: await sendPreorderReceipt(paid) };
}
