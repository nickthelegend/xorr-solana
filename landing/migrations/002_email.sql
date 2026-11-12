-- SPDX-License-Identifier: MIT
-- Copyright (c) 2026 Nivesh Gajengi
-- Nick applies this explicitly after 001_preorders.sql; never auto-migrate production.
BEGIN;
CREATE TABLE IF NOT EXISTS waitlist (
  id bigserial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  ref_code text NOT NULL UNIQUE,
  referred_by text REFERENCES waitlist(ref_code) ON DELETE SET NULL,
  ip_hash text,
  source text NOT NULL DEFAULT 'landing',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waitlist_referred_by_idx ON waitlist(referred_by);
CREATE INDEX IF NOT EXISTS waitlist_ip_recent_idx ON waitlist(ip_hash, created_at);
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE email_events ALTER COLUMN preorder_id DROP NOT NULL;
ALTER TABLE email_events DROP CONSTRAINT IF EXISTS email_events_kind_check;
ALTER TABLE email_events DROP CONSTRAINT IF EXISTS email_events_status_check;
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS waitlist_id bigint UNIQUE REFERENCES waitlist(id);
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'pad';
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS provider_id text;
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS attempted_at timestamptz;
-- Preserve uncertainty from the S2 sender; old failures must not be blindly replayed.
UPDATE email_events SET attempted_at = updated_at WHERE attempted_at IS NULL AND status IN ('sending', 'failed', 'sent');
ALTER TABLE email_events ADD CONSTRAINT email_events_kind_check CHECK (kind IN ('preorder_receipt', 'waitlist_welcome'));
ALTER TABLE email_events ADD CONSTRAINT email_events_status_check CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped_setup', 'unsubscribed'));
ALTER TABLE email_events DROP CONSTRAINT IF EXISTS email_events_owner_check;
ALTER TABLE email_events ADD CONSTRAINT email_events_owner_check CHECK (
  (kind = 'preorder_receipt' AND preorder_id IS NOT NULL AND waitlist_id IS NULL)
  OR (kind = 'waitlist_welcome' AND waitlist_id IS NOT NULL AND preorder_id IS NULL)
);
COMMIT;
