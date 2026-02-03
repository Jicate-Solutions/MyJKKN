-- Migration: Add Payment Gateway Tables for HDFC SmartGateway Integration
-- Created: 2025-01-20
-- Purpose: Enable online payment processing via HDFC SmartGateway
-- Author: MyJKKN Development Team
-- MID: SG3726

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Table: payment_transactions
-- Purpose: Track online payment sessions with HDFC SmartGateway
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_ref VARCHAR(100) UNIQUE NOT NULL,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  student_id UUID NOT NULL,
  institution_id UUID NOT NULL,
  bill_ids UUID[] NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  status VARCHAR(50) NOT NULL DEFAULT 'initiated' CHECK (status IN (
    'initiated',
    'processing',
    'success',
    'failed',
    'cancelled',
    'expired',
    'refunded'
  )),
  gateway_response JSONB,
  payment_method VARCHAR(50),
  gateway_transaction_id VARCHAR(255),
  payment_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT fk_payment_transactions_student
    FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_transactions_institution
    FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE,
  CONSTRAINT chk_payment_transactions_amount
    CHECK (total_amount > 0)
);

-- ============================================================================
-- Table: payment_transaction_items
-- Purpose: Link payment transactions to specific bills being paid
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_transaction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL,
  bill_id UUID NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT fk_payment_transaction_items_transaction
    FOREIGN KEY (transaction_id) REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_transaction_items_bill
    FOREIGN KEY (bill_id) REFERENCES public.billing_student_bills(id) ON DELETE CASCADE,
  CONSTRAINT chk_payment_transaction_items_amount
    CHECK (amount > 0),

  -- Ensure each bill can only be in a transaction once
  UNIQUE(transaction_id, bill_id)
);

-- ============================================================================
-- Indexes for Performance Optimization
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_payment_transactions_student_id
  ON public.payment_transactions(student_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_status
  ON public.payment_transactions(status);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at
  ON public.payment_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_session_id
  ON public.payment_transactions(session_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_transaction_ref
  ON public.payment_transactions(transaction_ref);

CREATE INDEX IF NOT EXISTS idx_payment_transaction_items_transaction_id
  ON public.payment_transaction_items(transaction_id);

CREATE INDEX IF NOT EXISTS idx_payment_transaction_items_bill_id
  ON public.payment_transaction_items(bill_id);

-- ============================================================================
-- Row Level Security (RLS) Configuration
-- ============================================================================

-- Enable RLS
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transaction_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own payment transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "Admins can view all payment transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "Authenticated users can create payment transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "System can update payment transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "Users can view payment transaction items" ON public.payment_transaction_items;
DROP POLICY IF EXISTS "System can insert payment transaction items" ON public.payment_transaction_items;

-- Policy: Students can view their own payment transactions
CREATE POLICY "Users can view their own payment transactions"
  ON public.payment_transactions FOR SELECT
  USING (
    auth.uid() = student_id OR
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE role IN ('super_admin', 'admin', 'institution_admin')
    )
  );

-- Policy: Admins can view all payment transactions
CREATE POLICY "Admins can view all payment transactions"
  ON public.payment_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'institution_admin')
    )
  );

-- Policy: Authenticated users can create payment transactions
CREATE POLICY "Authenticated users can create payment transactions"
  ON public.payment_transactions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy: System can update payment transactions (for webhook updates)
CREATE POLICY "System can update payment transactions"
  ON public.payment_transactions FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Policy: Users can view payment transaction items
CREATE POLICY "Users can view payment transaction items"
  ON public.payment_transaction_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.payment_transactions
      WHERE id = transaction_id
      AND (
        student_id = auth.uid() OR
        auth.uid() IN (
          SELECT id FROM public.profiles
          WHERE role IN ('super_admin', 'admin', 'institution_admin')
        )
      )
    )
  );

-- Policy: System can insert payment transaction items
CREATE POLICY "System can insert payment transaction items"
  ON public.payment_transaction_items FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- Grant Permissions
-- ============================================================================
GRANT ALL ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transaction_items TO authenticated;
GRANT SELECT ON public.payment_transactions TO anon;
GRANT SELECT ON public.payment_transaction_items TO anon;

-- ============================================================================
-- Trigger: Auto-update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_payment_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_payment_transactions_updated_at ON public.payment_transactions;

CREATE TRIGGER trigger_payment_transactions_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_transactions_updated_at();

-- ============================================================================
-- Comments for Documentation
-- ============================================================================
COMMENT ON TABLE public.payment_transactions IS 'Tracks online payment sessions with HDFC SmartGateway (MID: SG3726)';
COMMENT ON TABLE public.payment_transaction_items IS 'Links payment transactions to specific student bills being paid';

COMMENT ON COLUMN public.payment_transactions.transaction_ref IS 'Unique transaction reference (format: TXN-TIMESTAMP-RANDOM)';
COMMENT ON COLUMN public.payment_transactions.session_id IS 'HDFC SmartGateway session ID';
COMMENT ON COLUMN public.payment_transactions.bill_ids IS 'Array of bill IDs being paid in this transaction';
COMMENT ON COLUMN public.payment_transactions.status IS 'Payment status: initiated, processing, success, failed, cancelled, expired, refunded';
COMMENT ON COLUMN public.payment_transactions.gateway_response IS 'Full response from HDFC webhook (JSON)';
COMMENT ON COLUMN public.payment_transactions.gateway_transaction_id IS 'Transaction ID from HDFC gateway';

-- ============================================================================
-- Verification Queries
-- ============================================================================
-- Run these queries to verify the migration was successful:

-- 1. Check tables exist
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name LIKE 'payment_%';

-- 2. Check indexes
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename LIKE 'payment_%';

-- 3. Check RLS is enabled
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' AND tablename LIKE 'payment_%';

-- 4. Check policies
-- SELECT schemaname, tablename, policyname FROM pg_policies
-- WHERE schemaname = 'public' AND tablename LIKE 'payment_%';

-- ============================================================================
-- Rollback Script (if needed)
-- ============================================================================
-- DROP TRIGGER IF EXISTS trigger_payment_transactions_updated_at ON public.payment_transactions;
-- DROP FUNCTION IF EXISTS update_payment_transactions_updated_at();
-- DROP TABLE IF EXISTS public.payment_transaction_items CASCADE;
-- DROP TABLE IF EXISTS public.payment_transactions CASCADE;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Next Steps:
-- 1. Run this migration on Supabase
-- 2. Verify tables are created
-- 3. Create TypeScript types
-- 4. Implement PaymentGatewayService
-- 5. Build API endpoints
-- ============================================================================
