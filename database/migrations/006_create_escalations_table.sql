CREATE TABLE IF NOT EXISTS escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  reason VARCHAR
    CHECK (reason IN ('dispute', 'hardship', 'hostility', 'manager_request', 'compliance_concern')),
  status VARCHAR NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved')),
  agent_assigned VARCHAR,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
