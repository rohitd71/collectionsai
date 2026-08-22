CREATE TABLE IF NOT EXISTS billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month VARCHAR NOT NULL, -- YYYY-MM
  calls_made INTEGER NOT NULL DEFAULT 0,
  amount_collected DECIMAL(10, 2) NOT NULL DEFAULT 0,
  commission_rate DECIMAL(4, 3) NOT NULL DEFAULT 0.06,
  commission_owed DECIMAL(10, 2) NOT NULL DEFAULT 0,
  base_fee DECIMAL(10, 2) NOT NULL DEFAULT 599,
  total_owed DECIMAL(10, 2) NOT NULL DEFAULT 0,
  stripe_invoice_id VARCHAR,
  status VARCHAR NOT NULL DEFAULT 'unpaid'
    CHECK (status IN ('unpaid', 'charged', 'paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  UNIQUE (user_id, month)
);
