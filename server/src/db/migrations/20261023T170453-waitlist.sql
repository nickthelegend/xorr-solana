-- The xorr.finance waitlist (2026-10-23).
--
-- One row per email. Every row gets its own referral code; a signup that arrived through someone's link names that
-- code in `referred_by`, and each one moves the referrer up the line (`routes/waitlist.ts` holds the rule).
CREATE TABLE IF NOT EXISTS waitlist (
  id           BIGSERIAL PRIMARY KEY,
  -- Trimmed and lowercased before it is stored, so one person is one row.
  email        TEXT NOT NULL UNIQUE,
  ref_code     TEXT NOT NULL UNIQUE,
  referred_by  TEXT REFERENCES waitlist(ref_code) ON DELETE SET NULL,
  -- Where the signup came from: 'landing' today.
  source       TEXT NOT NULL DEFAULT 'landing',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waitlist_referred_by_idx ON waitlist(referred_by);
