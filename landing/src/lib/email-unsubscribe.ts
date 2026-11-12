// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { preorderDb } from './preorder-db';

function secret() {
  const value = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!value || value.length < 32) throw new Error('Setup required: EMAIL_UNSUBSCRIBE_SECRET (at least 32 characters)');
  return value;
}

export function unsubscribeToken(email: string) {
  const payload = Buffer.from(JSON.stringify({ v: 1, email: email.trim().toLowerCase() })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret()).update(payload).digest('base64url')}`;
}

export function tokenEmail(token: string): string | null {
  if (token.length > 1024) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  const expected = createHmac('sha256', secret()).update(parts[0]).digest('base64url');
  if (expected.length !== parts[1].length || !timingSafeEqual(Buffer.from(expected), Buffer.from(parts[1]))) return null;
  try {
    const value = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (value.v !== 1 || typeof value.email !== 'string' || value.email.length > 254
        || value.email !== value.email.trim().toLowerCase() || !/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(value.email)) return null;
    return value.email;
  } catch { return null; }
}

export async function unsubscribe(email: string) {
  const db = await preorderDb().connect();
  try {
    await db.query('BEGIN');
    // The sender takes this same lock: after this transaction finishes, no new mail can start.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`email:${email}`]);
    await db.query('INSERT INTO email_unsubscribes (email) VALUES ($1) ON CONFLICT DO NOTHING', [email]);
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
