-- Credit ledger for Unsolvable.ai. Applied automatically by Netlify on deploy.
-- Only used when CREDITS_ENABLED=true. Identity user ids are UUID strings.

CREATE TABLE IF NOT EXISTS credit_accounts (
  user_id     TEXT PRIMARY KEY,
  balance     INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES credit_accounts(user_id),
  delta       INTEGER NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('reserve', 'refund', 'grant', 'purchase', 'adjustment')),
  job_id      TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One reserve and at most one refund per job: retries can never double-charge or double-refund.
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_job_reason ON credit_ledger (job_id, reason) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS credit_ledger_user ON credit_ledger (user_id, created_at DESC);

-- Billing boundary: rows are written only by a verified payment-provider webhook (not yet connected).
CREATE TABLE IF NOT EXISTS purchases (
  id               BIGSERIAL PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES credit_accounts(user_id),
  provider         TEXT NOT NULL,
  provider_ref     TEXT NOT NULL UNIQUE,
  credits          INTEGER NOT NULL CHECK (credits > 0),
  amount_minor     INTEGER NOT NULL,
  currency         TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'refunded', 'failed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
