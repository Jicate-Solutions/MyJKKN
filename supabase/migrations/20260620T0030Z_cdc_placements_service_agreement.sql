-- ============================================================================
-- CDC PLACEMENTS — SERVICE AGREEMENT / BOND FIELDS (BUG-004046)
-- ----------------------------------------------------------------------------
-- Date:   2026-06-20
-- Reason: The Record Placement form (/cdc/placements/new) could not capture
--         whether an offer carries a service agreement (bond), nor the bond
--         period/terms. Adds two columns to public.cdc_placements:
--           - has_service_agreement : boolean flag ("Bond required?")
--           - service_agreement_details : free-text bond period / terms
--         Both are idempotent (IF NOT EXISTS) and backward-compatible:
--         existing rows default to has_service_agreement = false.
-- Scope:  DB-only. No RLS / policy / trigger changes — the existing
--         cdc_placements RLS already governs these columns. No new RPC.
-- ============================================================================

ALTER TABLE public.cdc_placements
  ADD COLUMN IF NOT EXISTS has_service_agreement boolean NOT NULL DEFAULT false;

ALTER TABLE public.cdc_placements
  ADD COLUMN IF NOT EXISTS service_agreement_details text;

COMMENT ON COLUMN public.cdc_placements.has_service_agreement
  IS 'BUG-004046: true when this offer carries a service agreement / bond.';

COMMENT ON COLUMN public.cdc_placements.service_agreement_details
  IS 'BUG-004046: free-text bond period / terms (penalty, duration, etc.). Captured only when has_service_agreement = true.';
