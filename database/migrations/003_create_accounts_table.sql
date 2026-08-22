CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  phone VARCHAR NOT NULL,
  email VARCHAR,
  amount_owed DECIMAL(10, 2) NOT NULL,
  days_overdue INTEGER NOT NULL DEFAULT 0,
  account_type VARCHAR
    CHECK (account_type IN ('credit_card', 'auto_loan', 'medical', 'personal_loan', 'other')),
  last_payment_date DATE,
  status VARCHAR NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'called', 'connected', 'promised', 'paid', 'escalated')),
  amount_paid DECIMAL(10, 2),
  payment_date DATE,
  notes TEXT,
  call_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_accounts_updated_at ON accounts;
CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
