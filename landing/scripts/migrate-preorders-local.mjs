// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const raw = process.env.TEST_DATABASE_URL;
if (!raw) throw new Error('Set TEST_DATABASE_URL to local Postgres first.');
const url = new URL(raw);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || !url.pathname.startsWith('/xorrpad_') || url.search) throw new Error('Refusing a nonlocal or non-xorrpad_ test database.');
const client = new pg.Client({ connectionString: raw });
try {
  await client.connect();
  await client.query(await readFile(new URL('../migrations/001_preorders.sql', import.meta.url), 'utf8'));
  console.log('Local preorders migration applied.');
} finally { await client.end(); }
