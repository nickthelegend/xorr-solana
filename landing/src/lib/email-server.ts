// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
import 'server-only';
import { preorderDb } from './preorder-db';
import { unsubscribeToken } from './email-unsubscribe';
import { BOOST_PER_REFERRAL, shareLink, type Place } from './waitlist';

type Mail = { preorderId?: string; waitlistId?: string; kind: 'preorder_receipt' | 'waitlist_welcome';
  source: string; to: string; subject: string; text: string };

/** Shared suppression and delivery path for every mail type. Never logs provider responses or secrets. */
export async function sendEmail(mail: Mail): Promise<string> {
  const db = await preorderDb().connect();
  const lock = `email:${mail.to.trim().toLowerCase()}`;
  let transaction = false;
  const begin = async () => {
    await db.query('BEGIN'); transaction = true;
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lock]);
  };
  const commit = async () => { await db.query('COMMIT'); transaction = false; };
  try {
    // Transaction locks work with direct Postgres and transaction-pooling services alike.
    await begin();
    await db.query(
      `INSERT INTO email_events (preorder_id, waitlist_id, kind, source, status) VALUES ($1,$2,$3,$4,'pending')
       ON CONFLICT DO NOTHING`, [mail.preorderId || null, mail.waitlistId || null, mail.kind, mail.source]);
    const { rows } = await db.query(
      'SELECT * FROM email_events WHERE preorder_id = $1 OR waitlist_id = $2', [mail.preorderId || null, mail.waitlistId || null]);
    const event = rows[0];
    const update = async (status: string) => {
      await db.query('UPDATE email_events SET status = $2, updated_at = now() WHERE id = $1', [event.id, status]);
      return status;
    };
    const suppressed = await db.query('SELECT 1 FROM email_unsubscribes WHERE email = $1', [mail.to.trim().toLowerCase()]);
    if (suppressed.rowCount) {
      if (event.status !== 'sent') await update('unsubscribed');
      return 'unsubscribed';
    }
    if (event.status === 'sent') return 'sent';
    if (event.status === 'sending' && event.attempted_at && Date.now() - new Date(event.updated_at).getTime() < 5 * 60 * 1000) return 'sending';
    const missing = !process.env.RESEND_API_KEY ? 'RESEND_API_KEY' : !process.env.EMAIL_FROM ? 'EMAIL_FROM'
      : !process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.EMAIL_UNSUBSCRIBE_SECRET.length < 32 ? 'EMAIL_UNSUBSCRIBE_SECRET (at least 32 characters)' : null;
    if (missing) { await update('skipped_setup'); return `Setup required: ${missing}`; }
    // Resend retains idempotency keys for 24 hours. An ambiguous older attempt needs operator review,
    // never an automatic resend that could duplicate a receipt.
    if (event.attempted_at && Date.now() - new Date(event.attempted_at).getTime() > 23 * 60 * 60 * 1000) return await update('failed');
    const unsubscribeUrl = `https://xorr.finance/api/email/unsubscribe?token=${unsubscribeToken(mail.to)}`;
    const payload = event.payload || { from: process.env.EMAIL_FROM, to: mail.to, subject: mail.subject,
      text: `${mail.text}\n\nUnsubscribe from all xorr emails: ${unsubscribeUrl}`,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
    const stored = await db.query(
      "UPDATE email_events SET status = 'sending', payload = $2, attempted_at = COALESCE(attempted_at, now()), updated_at = now() WHERE id = $1 RETURNING payload",
      [event.id, JSON.stringify(payload)]);
    // Persist the claim BEFORE contacting Resend. A worker crash cannot erase the retry window.
    await commit();
    await begin();
    // Unsubscribe may have committed between the claim and this transaction; check again under its lock.
    const unsubscribed = await db.query('SELECT 1 FROM email_unsubscribes WHERE email = $1', [mail.to.trim().toLowerCase()]);
    if (unsubscribed.rowCount) return await update('unsubscribed');
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json',
          'Idempotency-Key': mail.preorderId ? `preorder-${mail.preorderId}` : `welcome-${mail.waitlistId}` },
        body: JSON.stringify(stored.rows[0].payload),
      });
      if (!response.ok) return await update('failed');
      const body = await response.json();
      if (typeof body.id !== 'string' || !body.id) return await update('failed');
      await db.query("UPDATE email_events SET status = 'sent', provider_id = $2, updated_at = now() WHERE id = $1", [event.id, body.id]);
      return 'sent'; // Provider accepted, not a claim of inbox delivery.
    } catch { return await update('failed'); }
  } catch (error) {
    if (transaction) { await db.query('ROLLBACK'); transaction = false; }
    throw error;
  } finally {
    try { if (transaction) await commit(); }
    catch { db.release(true); throw new Error('Email event could not be committed'); }
    db.release();
  }
}

export async function sendWelcome(email: string, place: Place) {
  const { rows } = await preorderDb().query('SELECT id, source FROM waitlist WHERE email = $1 AND ref_code = $2', [email, place.refCode]);
  if (!rows[0]) throw new Error('A saved waitlist place is required');
  return sendEmail({ waitlistId: rows[0].id, kind: 'waitlist_welcome', source: rows[0].source, to: email,
    subject: 'Welcome to the xorr waitlist',
    text: `You are #${place.position} of ${place.total} in line for xorr.\nYour referral link: ${shareLink(place.refCode)}\nEvery friend who joins with your link moves you ${BOOST_PER_REFERRAL} places up the line.` });
}
