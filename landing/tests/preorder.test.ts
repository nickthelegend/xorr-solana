// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Keypair, PublicKey } from '@solana/web3.js';
import { parseURL, validateTransfer } from '@solana/pay';
import BigNumber from 'bignumber.js';
import fixture from './fixtures/devnet-usdc-transfer.json';
import { DEVNET_USDC, MAINNET_USDC, localDatabaseUrl, preorderConfig } from '../src/lib/preorder-config';
import { closePreorderDb, preorderDb } from '../src/lib/preorder-db';
import { createPreorder, readPreorder, confirmPreorder } from '../src/lib/preorder-server';
import { assertExactTransfer, preorderConnection } from '../src/lib/preorder-chain';
import { GET, POST } from '../src/app/api/pad/preorder/route';
import { verifiedBackers, signatureLink } from '../src/lib/pad-backers';

const ids: string[] = [];
const env = { ...process.env };
const input = () => ({ sku: 'pro', build: 'assembled', edition: 'founder', email: `${randomUUID()}@example.test`,
  publicName: 'Private until opted in', showPublicly: false, idempotencyKey: randomUUID() });
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function realRpc<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await wait(1500);
    try { return await work(); } catch (error) {
      if (attempt >= 3 || !/429|Too many requests/.test(String(error))) throw error;
      await wait(11000);
    }
  }
}

before(async () => {
  localDatabaseUrl(process.env.TEST_DATABASE_URL); // Fail before any DB access; never load dotenv.
  process.env.PREORDER_CLUSTER = 'devnet';
  process.env.PREORDER_TREASURY = fixture.recipient;
  process.env.PREORDER_REFUND_EMAIL = 'refunds@example.test';
  delete process.env.PREORDER_ALLOW_MAINNET;
  delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM; // Tests never send email.
  await preorderDb().query(await readFile(new URL('../migrations/001_preorders.sql', import.meta.url), 'utf8'));
});
after(async () => {
  await preorderDb().query('DELETE FROM preorders WHERE id = ANY($1::uuid[])', [ids]);
  await closePreorderDb();
  for (const key of ['PREORDER_CLUSTER', 'PREORDER_TREASURY', 'PREORDER_REFUND_EMAIL', 'PREORDER_ALLOW_MAINNET', 'RESEND_API_KEY', 'EMAIL_FROM']) {
    if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
  }
});

test('local DB guard rejects hosted databases and URL overrides', () => {
  assert.throws(() => localDatabaseUrl('postgres://user@example.com/xorrpad_test'));
  assert.throws(() => localDatabaseUrl('postgres://localhost/production'));
  assert.throws(() => localDatabaseUrl('postgres://localhost/xorrpad_test?host=remote'));
  assert.throws(() => localDatabaseUrl(undefined));
});

test('devnet defaults and all mainnet gates are explicit', () => {
  const base = { PREORDER_TREASURY: fixture.recipient, PREORDER_REFUND_EMAIL: 'refunds@example.test' };
  assert.equal(preorderConfig(base).mint, DEVNET_USDC);
  for (const gate of [undefined, '', 'true', 'I_ACKNOWLEDGE_REAL_FUNDS ']) {
    assert.throws(() => preorderConfig({ ...base, PREORDER_CLUSTER: 'mainnet', PREORDER_ALLOW_MAINNET: gate }), /Setup required/);
  }
  assert.throws(() => preorderConfig({ PREORDER_CLUSTER: 'mainnet', PREORDER_ALLOW_MAINNET: 'I_ACKNOWLEDGE_REAL_FUNDS' }), /TREASURY/);
  const mainnet = preorderConfig({ ...base, PREORDER_CLUSTER: 'mainnet', PREORDER_ALLOW_MAINNET: 'I_ACKNOWLEDGE_REAL_FUNDS' });
  assert.equal(mainnet.mint, MAINNET_USDC); // Configuration only. No mainnet RPC or transactions.
  assert.throws(() => preorderConfig({ ...base, PREORDER_CLUSTER: 'testnet' }), /Setup required/);
});

test('creates a pending order from server prices with a unique reference and ATA transfer URL', async () => {
  const order = await createPreorder({ ...input(), amount: 1, wallet: 'untrusted' }); ids.push(order.id);
  assert.equal(order.amount, '30.000000'); assert.equal(order.status, 'pending');
  assert.equal(order.recipientAta, fixture.recipientAta);
  const url = parseURL(new URL(order.url));
  assert.ok('amount' in url); assert.equal(url.amount!.toFixed(), '30');
  assert.equal(url.reference![0].toBase58(), order.reference);
  assert.equal(url.splToken!.toBase58(), fixture.mint);
  const saved = await readPreorder(order.id);
  assert.equal(saved.wallet, null); assert.equal(saved.signature, null); assert.equal(saved.public_name, null);
  assert.equal(saved.edition, 'founder');
  assert.ok(!('email' in order));
});

test('concurrent creation is idempotent and changed checkout details cannot reuse the key', async () => {
  const body = input();
  const orders = await Promise.all(Array.from({ length: 5 }, () => createPreorder(body)));
  ids.push(orders[0].id);
  assert.equal(new Set(orders.map(order => order.id)).size, 1);
  assert.equal(new Set(orders.map(order => order.reference)).size, 1);
  await assert.rejects(createPreorder({ ...body, sku: 'core' }), /details changed/);
});

test('Core deposit, explicit public-name consent, validation and unique signature constraint', async () => {
  const order = await createPreorder({ ...input(), sku: 'core', build: 'diy', publicName: 'Consenting test checkout', showPublicly: true }); ids.push(order.id);
  assert.equal(order.amount, '20.000000'); assert.equal((await readPreorder(order.id)).public_name, 'Consenting test checkout');
  await assert.rejects(createPreorder({ ...input(), sku: 'unknown' }), /Choose/);
  await assert.rejects(createPreorder({ ...input(), email: 'bad' }), /valid email/);
  await assert.rejects(createPreorder({ ...input(), publicName: 'x'.repeat(81) }), /80 characters/);
  const constraints = await preorderDb().query("SELECT indexdef FROM pg_indexes WHERE tablename = 'preorders'");
  assert.ok(constraints.rows.some(row => /UNIQUE INDEX/.test(row.indexdef) && /\(signature\)/.test(row.indexdef)));
});

test('API gates mainnet before any create or confirm DB work', async () => {
  process.env.PREORDER_CLUSTER = 'mainnet';
  try {
    assert.equal((await GET(new Request('http://localhost/api/pad/preorder'))).status, 503);
    for (const action of ['create', 'confirm']) {
      const response = await POST(new Request('http://localhost/api/pad/preorder', { method: 'POST', body: JSON.stringify({ action }) }));
      assert.equal(response.status, 503); assert.match((await response.json()).error, /Setup required/);
    }
  } finally { process.env.PREORDER_CLUSTER = 'devnet'; }
});

test('API rejects malformed requests, cross-origin writes and private-data reads', async () => {
  assert.equal((await POST(new Request('http://localhost/api/pad/preorder', { method: 'POST', body: 'null' }))).status, 400);
  assert.equal((await POST(new Request('http://localhost/api/pad/preorder', { method: 'POST', body: '{' }))).status, 400);
  assert.equal((await POST(new Request('http://localhost/api/pad/preorder', { method: 'POST', headers: { origin: 'https://elsewhere.test' }, body: '{}' }))).status, 403);
  const created = await POST(new Request('http://localhost/api/pad/preorder', { method: 'POST', body: JSON.stringify({ action: 'create', ...input() }) }));
  assert.equal(created.status, 201);
  const order = await created.json(); ids.push(order.id);
  const response = await GET(new Request(`http://localhost/api/pad/preorder?id=${order.id}`));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const value = await response.json();
  assert.ok(!('email' in value) && !('public_name' in value));
});

test('real devnet lookup leaves an unpaid order pending on repeated confirmation', { timeout: 120000 }, async () => {
  const order = await createPreorder(input()); ids.push(order.id);
  for (let count = 0; count < 2; count++) {
    const confirmed = await realRpc(() => confirmPreorder(order.id));
    assert.equal(confirmed.status, 'pending'); assert.equal(confirmed.signature, null);
  }
  const events = await preorderDb().query('SELECT * FROM email_events WHERE preorder_id = $1', [order.id]);
  assert.equal(events.rowCount, 0); // No receipt before a real verified payment.
});

test('backers query excludes local pending orders and reports honest zero totals', async () => {
  const order = await createPreorder(input()); ids.push(order.id);
  const wall = await verifiedBackers();
  assert.equal(wall.count, 0); assert.equal(wall.deposits, '0.00'); assert.deepEqual(wall.backers, []);
  assert.equal(wall.cluster, 'devnet');
  assert.match(signatureLink(fixture.signature, 'devnet'), /cluster=devnet$/);
  assert.match(signatureLink(fixture.signature, 'mainnet'), /cluster=mainnet-beta$/);
  process.env.PREORDER_CLUSTER = 'mainnet';
  try { await assert.rejects(verifiedBackers(), /Setup required/); }
  finally { process.env.PREORDER_CLUSTER = 'devnet'; }
});

test('real historical mUSDC transfer validates; exactness and reference mismatch reject it as a preorder', { timeout: 120000 }, async () => {
  const connection = preorderConnection('devnet');
  const fields = { recipient: new PublicKey(fixture.recipient), splToken: new PublicKey(fixture.mint), amount: new BigNumber(fixture.amount) };
  const tx = await realRpc(() => validateTransfer(connection, fixture.signature, fields, { commitment: 'finalized' }));
  assert.equal(tx.blockTime, fixture.blockTime);
  assert.equal(assertExactTransfer(tx, fixture), fixture.payer);
  assert.throws(() => assertExactTransfer(tx, { ...fixture, amount: '30' }), /exactly/);
  assert.throws(() => assertExactTransfer(tx, { ...fixture, amount: '1001' }), /exactly/);
  assert.throws(() => assertExactTransfer(tx, { ...fixture, mint: MAINNET_USDC }), /exactly/);
  assert.throws(() => assertExactTransfer(tx, { ...fixture, recipient: fixture.payer }), /exactly/);
  // This historical transfer has no Solana Pay reference. It must NEVER become a paid preorder/backer.
  await assert.rejects(realRpc(() => validateTransfer(connection, fixture.signature, { ...fields, reference: Keypair.generate().publicKey }, { commitment: 'finalized' })), /invalid references/);
  assert.equal((await preorderDb().query('SELECT id FROM preorders WHERE signature = $1', [fixture.signature])).rowCount, 0);
});
