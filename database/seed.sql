-- Sample data for local development / testing
INSERT INTO users (id, email, password_hash, company_name, plan)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'demo@agency.test',
  '$2b$10$K7L1OJ0TfPO0/nOr8HAX8.h9Q6cSaEqHLNxkFH5eYgSD2b0YXwZ0S', -- bcrypt("password123")
  'Demo Collections Agency',
  'professional'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO campaigns (id, user_id, name, tone, status, account_type, max_retries)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Q1 Medical Debt Recovery',
  'empathetic',
  'draft',
  'medical',
  3
) ON CONFLICT (id) DO NOTHING;

INSERT INTO accounts (campaign_id, name, phone, email, amount_owed, days_overdue, account_type, status)
VALUES
  ('22222222-2222-2222-2222-222222222222', 'John Doe', '+16475550101', 'john@example.com', 500.00, 45, 'medical', 'pending'),
  ('22222222-2222-2222-2222-222222222222', 'Jane Smith', '+16475550102', 'jane@example.com', 1200.00, 90, 'medical', 'pending'),
  ('22222222-2222-2222-2222-222222222222', 'Bob Lee', '+16475550103', NULL, 275.50, 30, 'medical', 'pending')
ON CONFLICT DO NOTHING;
