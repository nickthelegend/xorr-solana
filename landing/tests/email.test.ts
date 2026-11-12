// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
import assert from 'node:assert/strict';
import { after, before, test, mock } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { localDatabaseUrl } from '../src/lib/preorder-config';
import { closePreorderDb, preorderDb } from '../src/lib/preorder-db';
import { join, placeOf } from '../src/lib/waitlist-server';
import { sendWelcome } from '../src/lib/email-server';
import { unsubscribe, unsubscribeToken, tokenEmail } from '../src/lib/email-unsubscribe';
import { GET as unsubscribeGet, POST as unsubscribePost } from '../src/app/api/email/unsubscribe/route';
import { POST as waitlistPost } from '../src/app/api/waitlist/route';
import { createPreorder, readPreorder } from '../src/lib/preorder-server';
import { sendPreorderReceipt } from '../src/lib/preorder-receipt';
import fixture from './fixtures/devnet-usdc-transfer.json';

const emails: string[] = [];
const orders: string[] = [];
const keys = ['RESEND_API_KEY', 'EMAIL_FROM', 'EMAIL_UNSUBSCRIBE_SECRET', 'PREORDER_CLUSTER', 'PREORDER_TREASURY', 'PREORDER_REFUND_EMAIL'];
const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const address = () => { const email = `${randomUUID()}@example.test`; emails.push(email); return email; };
const request = (body: unknown) => new Request('http://localhost/api/waitlist', { method: 'POST', body: JSON.stringify(body) });

before(async () => {
  localDatabaseUrl(process.env.TEST_DATABASE_URL);
  delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM;
  process.env.EMAIL_UNSUBSCRIBE_SECRET = 'local-test-secret-with-at-least-32-characters';
  process.env.PREORDER_CLUSTER = 'devnet'; process.env.PREORDER_TREASURY = fixture.recipient;
  process.env.PREORDER_REFUND_EMAIL = 'refunds@example.test';
  for (const file of ['001_preorders.sql', '002_email.sql']) {
    await preorderDb().query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
});
after(async () => {
  mock.restoreAll();
  await preorderDb().query('DELETE FROM email_events WHERE waitlist_id IN (SELECT id FROM waitlist WHERE email = ANY($1::text[]))', [emails]);
  await preorderDb().query('DELETE FROM waitlist WHERE email = ANY($1::text[])', [emails]);
  await preorderDb().query('DELETE FROM email_unsubscribes WHERE email = ANY($1::text[])', [emails]);
  await preorderDb().query('DELETE FROM preorders WHERE id = ANY($1::uuid[])', [orders]);
  await closePreorderDb();
  for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
});

test('local pad join stores source, ranks/referrals, and logs skipped_setup without calling Resend', async () => {
  const network = mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network call'); });
  try {
    const email = address();
    const response = await waitlistPost(request({ email, source: 'pad' }));
    assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.email, 'Setup required: RESEND_API_KEY'); assert.ok(body.position > 0);
    const again = await waitlistPost(request({ email, source: 'landing' }));
    assert.equal(again.status, 200); assert.equal((await again.json()).refCode, body.refCode);
    const events = await preorderDb().query('SELECT e.* FROM email_events e JOIN waitlist w ON w.id = e.waitlist_id WHERE w.email = $1', [email]);
    assert.equal(events.rowCount, 1); assert.equal(events.rows[0].status, 'skipped_setup');
    assert.equal(events.rows[0].kind, 'waitlist_welcome'); assert.equal(events.rows[0].source, 'pad');
    assert.equal(events.rows[0].payload, null); assert.equal(events.rows[0].provider_id, null);
    const referral = await join({ email: address(), ref: body.refCode, website: '', source: 'pad' }, randomUUID());
    assert.ok(referral.ok); assert.equal((await placeOf(body.refCode))!.referrals, 1);
    assert.equal(network.mock.callCount(), 0);
  } finally { network.mock.restore(); }
});

test('concurrent joins keep one welcome event and default unknown sources to landing', async () => {
  const email = address();
  const results = await Promise.all(Array.from({ length: 4 }, () => join({ email, ref: null, website: '', source: 'untrusted' }, randomUUID())));
  assert.equal(results.filter(result => result.ok && result.created).length, 1);
  assert.ok(results.every(result => result.ok && result.email === 'Setup required: RESEND_API_KEY'));
  const saved = await preorderDb().query('SELECT w.source, count(e.id)::int AS events FROM waitlist w JOIN email_events e ON e.waitlist_id = w.id WHERE w.email = $1 GROUP BY w.source', [email]);
  assert.deepEqual(saved.rows, [{source:'landing', events:1}]);
});

test('signed tokens reject tampering, extra fields, oversized and malformed links', () => {
  const token = unsubscribeToken('Person@Example.test');
  assert.equal(tokenEmail(token), 'person@example.test');
  assert.equal(tokenEmail(`${token}.extra`), null);
  assert.equal(tokenEmail(`${token.slice(0,-1)}!`), null);
  assert.equal(tokenEmail('x'.repeat(1025)), null);
  const [payload, signature] = token.split('.');
  assert.equal(tokenEmail(`${Buffer.from(JSON.stringify({v:1,email:'other@example.test'})).toString('base64url')}.${signature}`), null);
  assert.equal(tokenEmail(`${payload}.${signature.slice(0, -2)}aa`), null);
});

test('unsubscribe GET/one-click POST are idempotent, stop future joins and send no mail', async () => {
  const email = address();
  const result = await join({ email, ref: null, website: '', source: 'pad' }, randomUUID()); assert.ok(result.ok);
  const url = `http://localhost/api/email/unsubscribe?token=${unsubscribeToken(email)}`;
  for (const handler of [unsubscribeGet, unsubscribePost]) {
    const response = await handler(new Request(url));
    assert.equal(response.status, 200); assert.match(await response.text(), /unsubscribed from all xorr emails/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const network = mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network call'); });
  try {
    const rejoin = await waitlistPost(request({ email, source: 'pad' }));
    assert.equal((await rejoin.json()).email, 'unsubscribed');
    assert.equal(await sendWelcome(email, result.place), 'unsubscribed');
    assert.equal(network.mock.callCount(), 0);
  } finally { network.mock.restore(); }
  const events = await preorderDb().query('SELECT e.status FROM email_events e JOIN waitlist w ON w.id = e.waitlist_id WHERE w.email = $1', [email]);
  assert.deepEqual(events.rows, [{status:'unsubscribed'}]);
  assert.equal((await unsubscribeGet(new Request('http://localhost/api/email/unsubscribe?token=invalid'))).status, 400);
});

test('unsubscribe before signup still suppresses the welcome', async () => {
  const email = address(); await unsubscribe(email);
  const result = await join({ email, ref: null, website: '' }, randomUUID());
  assert.ok(result.ok); assert.equal(result.email, 'unsubscribed');
});

test('sender requires configuration, persists welcome content and records network failure honestly', async () => {
  const email = address();
  const result = await join({ email, ref: null, website: '', source: 'pad' }, randomUUID()); assert.ok(result.ok);
  // This is a deliberate transport-failure test: no email is accepted or marked sent.
  process.env.RESEND_API_KEY = 'transport-failure-test';
  assert.equal(await sendWelcome(email, result.place), 'Setup required: EMAIL_FROM');
  process.env.EMAIL_FROM = 'test@example.test';
  const oldSecret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
  assert.match(await sendWelcome(email, result.place), /Setup required: EMAIL_UNSUBSCRIBE_SECRET/);
  process.env.EMAIL_UNSUBSCRIBE_SECRET = oldSecret;
  const payloads: string[] = [];
  const network = mock.method(globalThis, 'fetch', async (_url: string | URL | Request, options?: RequestInit) => {
    payloads.push(String(options?.body)); throw new Error('Deliberate test network failure');
  });
  try {
    assert.equal(await sendWelcome(email, result.place), 'failed');
    assert.equal(await sendWelcome(email, {...result.place, position: result.place.position + 100}), 'failed');
    assert.equal(payloads[0], payloads[1]); // Retry body is immutable for Resend idempotency.
    const payload = JSON.parse(payloads[0]);
    assert.match(payload.text, new RegExp(`#${result.place.position} of ${result.place.total}`));
    assert.ok(payload.text.includes(`https://xorr.finance/?ref=${result.place.refCode}`));
    const link = payload.text.match(/https:\/\/xorr.finance\/api\/email\/unsubscribe\?token=(\S+)/)[1];
    assert.equal(tokenEmail(link), email); assert.equal(payload.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    await preorderDb().query("UPDATE email_events SET attempted_at = now() - interval '25 hours' WHERE waitlist_id = (SELECT id FROM waitlist WHERE email = $1)", [email]);
    assert.equal(await sendWelcome(email, result.place), 'failed');
    assert.equal(network.mock.callCount(), 2); // An ambiguous old attempt is never resent.
  } finally { network.mock.restore(); delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM; }
});

test('unpaid orders cannot send receipts or create receipt events', async () => {
  const order = await createPreorder({ sku:'pro', build:'assembled', edition:'founder', email:address(), publicName:'', showPublicly:false, idempotencyKey:randomUUID() });
  orders.push(order.id);
  await assert.rejects(sendPreorderReceipt(await readPreorder(order.id)), /verified payment/);
  assert.equal((await preorderDb().query('SELECT 1 FROM email_events WHERE preorder_id = $1', [order.id])).rowCount, 0);
});

test('waitlist rejects malformed, cross-origin and bot joins before writing', async () => {
  for (const body of [null, [], 'bad']) assert.equal((await waitlistPost(request(body))).status, 400);
  assert.equal((await waitlistPost(new Request('http://localhost/api/waitlist', {method:'POST',headers:{origin:'https://other.test'},body:'{}'}))).status, 403);
  assert.equal((await waitlistPost(request({email:address(),website:'bot'}))).status, 400);
});
