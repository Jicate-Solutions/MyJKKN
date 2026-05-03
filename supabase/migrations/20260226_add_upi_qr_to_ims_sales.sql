-- Migration: Add UPI QR columns to ims_sales and fix payment_method CHECK constraint
-- Date: 2026-02-26
-- Root cause: createSale inserts upi_qr_amount and upi_qr_transaction_ref but these
--             columns don't exist; and 'upi_qr' is not in the payment_method CHECK.

-- 1. Add missing UPI QR columns (mirrors the cash/gpay/card pattern)
ALTER TABLE public.ims_sales
  ADD COLUMN IF NOT EXISTS upi_qr_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upi_qr_transaction_ref TEXT;

-- 2. Drop the existing CHECK constraint (must drop to recreate with new values)
ALTER TABLE public.ims_sales
  DROP CONSTRAINT IF EXISTS ims_sales_payment_method_check;

-- 3. Recreate CHECK constraint including 'upi_qr'
ALTER TABLE public.ims_sales
  ADD CONSTRAINT ims_sales_payment_method_check
  CHECK (payment_method IN ('cash', 'gpay', 'card', 'upi_qr', 'mixed'));

NOTIFY pgrst, 'reload schema';
