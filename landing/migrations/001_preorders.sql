-- SPDX-License-Identifier: MIT
-- Copyright (c) 2026 Nivesh Gajengi
-- Apply explicitly to local TEST_DATABASE_URL during development. No automatic production migration.
BEGIN;
CREATE TABLE IF NOT EXISTS preorders (
  id uuid PRIMARY KEY,
  idempotency_key uuid NOT NULL UNIQUE,
  sku text NOT NULL CHECK (sku IN ('core', 'pro')),
  build text NOT NULL CHECK (build IN ('diy', 'assembled')),
  edition text NOT NULL CHECK (edition IN ('standard', 'founder')),
  amount numeric(12,6) NOT NULL CHECK ((sku = 'core' AND amount = 20) OR (sku = 'pro' AND amount = 30)),
  cluster text NOT NULL CHECK (cluster IN ('devnet', 'mainnet')),
  recipient text NOT NULL,
  mint text NOT NULL,
  reference text NOT NULL UNIQUE,
  signature text UNIQUE,
  wallet text,
  email text NOT NULL,
  public_name varchar(80),
  show_publicly boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded', 'shipped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  CHECK ((status = 'pending' AND signature IS NULL AND wallet IS NULL AND paid_at IS NULL)
      OR (status <> 'pending' AND signature IS NOT NULL AND wallet IS NOT NULL AND paid_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS preorders_paid_created ON preorders (created_at DESC) WHERE status = 'paid';
CREATE INDEX IF NOT EXISTS preorders_email_created ON preorders (email, created_at DESC);

-- Receipt delivery is an outbox: a payment remains paid even when mail isn't configured or delivery fails.
-- S4 can extend this table for waitlist welcome/unsubscribe handling.
CREATE TABLE IF NOT EXISTS email_events (
  id bigserial PRIMARY KEY,
  preorder_id uuid NOT NULL UNIQUE REFERENCES preorders(id),
  kind text NOT NULL DEFAULT 'preorder_receipt' CHECK (kind = 'preorder_receipt'),
  status text NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped_setup')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
