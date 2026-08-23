-- Indexes for common access patterns
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_campaign_id ON accounts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_calls_account_id ON calls(account_id);
CREATE INDEX IF NOT EXISTS idx_calls_vapi_call_id ON calls(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_account_id ON sms_messages(account_id);
CREATE INDEX IF NOT EXISTS idx_escalations_call_id ON escalations(call_id);
CREATE INDEX IF NOT EXISTS idx_billing_user_id ON billing(user_id);

-- Row-level security: every tenant only ever sees rows that trace back to
-- their own users.id via campaign_id -> user_id (or user_id directly).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing ENABLE ROW LEVEL SECURITY;

-- users: a user can only read/update their own row
DROP POLICY IF EXISTS users_self ON users;
CREATE POLICY users_self ON users
  FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- campaigns: owned directly by user_id
DROP POLICY IF EXISTS campaigns_owner ON campaigns;
CREATE POLICY campaigns_owner ON campaigns
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- accounts: owned via campaign -> user
DROP POLICY IF EXISTS accounts_owner ON accounts;
CREATE POLICY accounts_owner ON accounts
  FOR ALL USING (
    campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid())
  )
  WITH CHECK (
    campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid())
  );

-- calls: owned via account -> campaign -> user
DROP POLICY IF EXISTS calls_owner ON calls;
CREATE POLICY calls_owner ON calls
  FOR ALL USING (
    account_id IN (
      SELECT a.id FROM accounts a
      JOIN campaigns c ON c.id = a.campaign_id
      WHERE c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    account_id IN (
      SELECT a.id FROM accounts a
      JOIN campaigns c ON c.id = a.campaign_id
      WHERE c.user_id = auth.uid()
    )
  );

-- sms_messages: owned via account -> campaign -> user
DROP POLICY IF EXISTS sms_messages_owner ON sms_messages;
CREATE POLICY sms_messages_owner ON sms_messages
  FOR ALL USING (
    account_id IN (
      SELECT a.id FROM accounts a
      JOIN campaigns c ON c.id = a.campaign_id
      WHERE c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    account_id IN (
      SELECT a.id FROM accounts a
      JOIN campaigns c ON c.id = a.campaign_id
      WHERE c.user_id = auth.uid()
    )
  );

-- escalations: owned via call -> account -> campaign -> user
DROP POLICY IF EXISTS escalations_owner ON escalations;
CREATE POLICY escalations_owner ON escalations
  FOR ALL USING (
    call_id IN (
      SELECT ca.id FROM calls ca
      JOIN accounts a ON a.id = ca.account_id
      JOIN campaigns c ON c.id = a.campaign_id
      WHERE c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    call_id IN (
      SELECT ca.id FROM calls ca
      JOIN accounts a ON a.id = ca.account_id
      JOIN campaigns c ON c.id = a.campaign_id
      WHERE c.user_id = auth.uid()
    )
  );

-- billing: owned directly by user_id
DROP POLICY IF EXISTS billing_owner ON billing;
CREATE POLICY billing_owner ON billing
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Service-role key (used by the backend for webhooks/jobs) bypasses RLS by
-- default in Supabase, so the backend can still write on behalf of any user.
