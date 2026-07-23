-- 20260523120000_billing_refunds_gateway_columns.sql
-- Add gateway-tracking columns to billing_refunds so Razorpay refund IDs and
-- raw gateway responses can be persisted. Idempotent: safe to apply multiple
-- times. See app/api/billing/refunds/[id]/gateway-refund/route.ts (Task 35).

ALTER TABLE billing_refunds
  ADD COLUMN IF NOT EXISTS gateway_refund_id text,
  ADD COLUMN IF NOT EXISTS gateway_response jsonb;

-- Unique gateway_refund_id (when not null) to prevent duplicate refund records
-- for the same Razorpay rfnd_xxx id.
CREATE UNIQUE INDEX IF NOT EXISTS billing_refunds_gateway_refund_id_unique
  ON billing_refunds (gateway_refund_id)
  WHERE gateway_refund_id IS NOT NULL;
