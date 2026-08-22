CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  twilio_sms_id VARCHAR,
  message_text TEXT NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
