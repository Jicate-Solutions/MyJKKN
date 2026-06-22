-- 2026-06-22 — F3 IDP provenance (BUG-004197, PR3): record which IDP fields were
-- machine-suggested at create time, so CDC can later report "% machine-suggested."
-- Additive, back-compat: existing rows default to '{}' (treated as fully hand-typed).
ALTER TABLE public.cdc_idp_responses
  ADD COLUMN IF NOT EXISTS prefill_sources jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.cdc_idp_responses.prefill_sources IS
  'BUG-004197: map of field -> source (e.g. {"club_picks":"cdc_club_memberships","interests":"prior_idp"}) recording which IDP fields received a non-empty machine suggestion at create time (from /api/cdc/idp/prefill). Empty {} for hand-typed rows. Additive, back-compat.';
