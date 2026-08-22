CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  vapi_call_id VARCHAR,
  status VARCHAR NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'escalated', 'failed')),
  duration INTEGER,
  transcript TEXT,
  recording_url VARCHAR,
  outcome VARCHAR
    CHECK (outcome IN ('no_answer', 'voicemail', 'connected', 'promised', 'paid')),
  amount_promised DECIMAL(10, 2),
  payment_date_promised DATE,
  sentiment VARCHAR
    CHECK (sentiment IN ('positive', 'neutral', 'negative', 'angry')),
  notes TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
