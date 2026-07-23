-- Migration: Extend ims_stores with POS/receipt/distribution columns
-- Date: 2026-05-14
-- Purpose: Fix "Could not find the 'email' column of 'ims_stores' in the schema cache"
--          error during store registration.
--
-- Context: The IMS module was ported to main on 2026-05-03 with only the base
--          ims_stores table. The TS types, store form, and service layer reference
--          11 additional columns that were added in the dev project but never
--          applied to this Supabase project. PostgREST rejects INSERTs containing
--          any unknown column.
--
-- Columns added match types/ims/stores.ts (ImsStore interface):
--   - institution_name TEXT — snapshot of institution name (nullable)
--   - phone / email TEXT — store contact info
--   - gstin TEXT — GST identification number (super_admin only field)
--   - upi_vpa / upi_merchant_name TEXT — UPI payment config (super_admin only)
--   - receipt_header / receipt_footer TEXT — POS receipt branding
--   - sale_number_prefix TEXT NOT NULL DEFAULT 'INV' — invoice prefix
--   - is_central_supply_store BOOLEAN NOT NULL DEFAULT false — distribution flag
--   - requires_local_approval BOOLEAN NOT NULL DEFAULT false — indent approval flag
--
-- The CreateImsStoreDto type makes the two booleans optional via Partial<Pick<...>>,
-- which only holds if DB has defaults — hence DEFAULT false NOT NULL.

ALTER TABLE public.ims_stores
  ADD COLUMN IF NOT EXISTS institution_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS upi_vpa TEXT,
  ADD COLUMN IF NOT EXISTS upi_merchant_name TEXT,
  ADD COLUMN IF NOT EXISTS receipt_header TEXT,
  ADD COLUMN IF NOT EXISTS receipt_footer TEXT,
  ADD COLUMN IF NOT EXISTS sale_number_prefix TEXT NOT NULL DEFAULT 'INV',
  ADD COLUMN IF NOT EXISTS is_central_supply_store BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_local_approval BOOLEAN NOT NULL DEFAULT false;

-- Refresh PostgREST schema cache so the new columns become writable immediately
NOTIFY pgrst, 'reload schema';
