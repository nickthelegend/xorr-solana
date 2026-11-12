// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
import 'server-only';
import { Pool } from 'pg';
import { localDatabaseUrl } from './preorder-config';

let pool: Pool | undefined;
export function preorderDb(): Pool {
  if (!pool) {
    // Development never falls back to a hosted database. A test URL is always checked, even in a production build.
    const connectionString = process.env.TEST_DATABASE_URL ? localDatabaseUrl(process.env.TEST_DATABASE_URL)
      : process.env.NODE_ENV === 'production' ? process.env.DATABASE_URL : localDatabaseUrl(undefined);
    if (!connectionString) throw new Error('Setup required: DATABASE_URL');
    pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000 });
  }
  return pool;
}
export async function closePreorderDb() { await pool?.end(); pool = undefined; }
