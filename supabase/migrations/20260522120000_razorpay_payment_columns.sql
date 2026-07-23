-- Razorpay migration: extend payment tables with provider column and Razorpay-specific fields.
-- Preserves all existing HDFC SmartGateway rows. New rows can be written under either provider.
-- Reference: docs/plans/2026-05-22-razorpay-migration-plan.md

BEGIN;

-- ============================================================
-- 1. payment_transactions (billing module)
-- ============================================================
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'hdfc_smartgateway'
    CHECK (provider IN ('hdfc_smartgateway','razorpay')),
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS razorpay_signature text,
  ADD COLUMN IF NOT EXISTS amount_paise bigint,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_status text
    CHECK (refund_status IN ('none','partial','full'))
    DEFAULT 'none';

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_razorpay_order_id_key
  ON payment_transactions (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_razorpay_payment_id_key
  ON payment_transactions (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

ALTER TABLE payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_provider_identifiers_chk;
ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_provider_identifiers_chk CHECK (
    (provider = 'hdfc_smartgateway' AND session_id IS NOT NULL) OR
    (provider = 'razorpay' AND razorpay_order_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider
  ON payment_transactions (provider);

-- Backfill amount_paise from total_amount (NUMERIC stored as rupees with 2 decimal places).
-- One-time migration; later writes set amount_paise directly via the Razorpay provider.
UPDATE payment_transactions
SET amount_paise = (total_amount * 100)::bigint
WHERE amount_paise IS NULL AND total_amount IS NOT NULL;

-- ============================================================
-- 2. event_payment_transactions (events/marathon module)
-- ============================================================
ALTER TABLE event_payment_transactions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'hdfc_smartgateway'
    CHECK (provider IN ('hdfc_smartgateway','razorpay')),
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS razorpay_signature text,
  ADD COLUMN IF NOT EXISTS amount_paise bigint,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_status text
    CHECK (refund_status IN ('none','partial','full'))
    DEFAULT 'none';

CREATE UNIQUE INDEX IF NOT EXISTS event_payment_transactions_razorpay_order_id_key
  ON event_payment_transactions (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_payment_transactions_razorpay_payment_id_key
  ON event_payment_transactions (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

ALTER TABLE event_payment_transactions
  DROP CONSTRAINT IF EXISTS event_payment_transactions_provider_identifiers_chk;
ALTER TABLE event_payment_transactions
  ADD CONSTRAINT event_payment_transactions_provider_identifiers_chk CHECK (
    (provider = 'hdfc_smartgateway' AND gateway_session_id IS NOT NULL) OR
    (provider = 'razorpay' AND razorpay_order_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_event_payment_transactions_provider
  ON event_payment_transactions (provider);

-- Backfill amount_paise from amount (NUMERIC stored as rupees with 2 decimal places).
-- One-time migration; later writes set amount_paise directly via the Razorpay provider.
UPDATE event_payment_transactions
SET amount_paise = (amount * 100)::bigint
WHERE amount_paise IS NULL AND amount IS NOT NULL;

-- ============================================================
-- 3. New table: payment_disputes (Razorpay chargebacks)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('razorpay')),
  razorpay_dispute_id text UNIQUE NOT NULL,
  razorpay_payment_id text NOT NULL,
  payment_transaction_id uuid REFERENCES payment_transactions(id),
  event_payment_transaction_id uuid REFERENCES event_payment_transactions(id),
  amount_paise bigint NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  reason_code text,
  phase text CHECK (phase IN ('fraud','retrieval','chargeback','pre_arbitration','arbitration')),
  status text NOT NULL CHECK (status IN ('open','under_review','won','lost','closed')),
  respond_by timestamptz,
  raw_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_disputes_attached_to_one_transaction_chk CHECK (
    (payment_transaction_id IS NOT NULL AND event_payment_transaction_id IS NULL) OR
    (payment_transaction_id IS NULL AND event_payment_transaction_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_payment_disputes_payment_id ON payment_disputes (razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_status ON payment_disputes (status);

-- updated_at trigger for payment_disputes
CREATE OR REPLACE FUNCTION update_payment_disputes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_payment_disputes_updated_at ON payment_disputes;
CREATE TRIGGER trigger_payment_disputes_updated_at
BEFORE UPDATE ON payment_disputes
FOR EACH ROW EXECUTE FUNCTION update_payment_disputes_updated_at();

ALTER TABLE payment_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all disputes" ON payment_disputes;
CREATE POLICY "Admins can view all disputes" ON payment_disputes
  FOR SELECT
  USING (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin','admin','institution_admin')
  ));

DROP POLICY IF EXISTS "Service role can write disputes" ON payment_disputes;
CREATE POLICY "Service role can write disputes" ON payment_disputes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 4. Tighten existing RLS — UPDATE on payment_transactions and event_payment_transactions
-- ============================================================
DROP POLICY IF EXISTS "System can update payment transactions" ON payment_transactions;
CREATE POLICY "Service role can update payment transactions" ON payment_transactions
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "event_payments_public_update" ON event_payment_transactions;
CREATE POLICY "Service role can update event payments" ON event_payment_transactions
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "event_payments_public_insert" ON event_payment_transactions;
DROP POLICY IF EXISTS "event_payments_public_read" ON event_payment_transactions;
CREATE POLICY "Service role can insert event payments" ON event_payment_transactions
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

COMMIT;
