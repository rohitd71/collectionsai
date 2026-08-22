CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  tone VARCHAR NOT NULL DEFAULT 'professional'
    CHECK (tone IN ('professional', 'empathetic', 'aggressive')),
  status VARCHAR NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'deleted')),
  account_type VARCHAR
    CHECK (account_type IN ('credit_card', 'auto_loan', 'medical', 'personal_loan', 'other')),
  max_retries INTEGER NOT NULL DEFAULT 3,
  call_schedule_start TIME NOT NULL DEFAULT '08:00',
  call_schedule_end TIME NOT NULL DEFAULT '21:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  launched_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON campaigns;
CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
