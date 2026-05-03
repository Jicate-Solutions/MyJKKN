-- Migration: 20260227_add_company_name_batch_to_ims
-- Purpose:
--   1. Add company_name to ims_items (manufacturer/brand at the item-master level)
--   2. Add batch_number and expiry_date to ims_financial_transactions
--      so stock adjustments (damage, expiry, theft, etc.) can record which batch was affected
--
-- Both columns are nullable for backward compatibility with existing records.

-- ── 1. ims_items ──────────────────────────────────────────────────────────────
ALTER TABLE public.ims_items
  ADD COLUMN IF NOT EXISTS company_name TEXT;

-- ── 2. ims_financial_transactions ────────────────────────────────────────────
ALTER TABLE public.ims_financial_transactions
  ADD COLUMN IF NOT EXISTS batch_number TEXT,
  ADD COLUMN IF NOT EXISTS expiry_date  DATE;
