-- =====================================================================
-- cdc_mentor_pairings.mentorship_category_id → cdc_mentorship_categories FK
-- =====================================================================
-- Date: 2026-06-21
-- Bug: BUG-004094 (wire the Mentorship Category config-master onto the
--      mentor-pairing create form)
-- Depends on: 20260621T0100Z_cdc_config_masters.sql (creates + seeds
--             cdc_mentorship_categories with 4 active rows:
--             Academic / Career / Technical / Entrepreneurship).
--             This file is timestamped AFTER so the master table exists
--             before the FK references it.
--
-- Director decision: "Mentorship Category is REQUIRED on new records."
--   The REQUIRED rule is enforced in the create form's submit guard, not
--   as a NOT NULL DB constraint — the column stays nullable so existing
--   pairing rows (which predate the category) remain valid and reads do
--   not break. New code populates it via the wired Select.
--
-- ON DELETE SET NULL so deleting a master category never cascades into
-- deleting mentorship history — it just unlinks the category.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS). NOT applied to prod here.
-- =====================================================================

BEGIN;

ALTER TABLE public.cdc_mentor_pairings
  ADD COLUMN IF NOT EXISTS mentorship_category_id uuid
  REFERENCES public.cdc_mentorship_categories(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cdc_mentor_pairings.mentorship_category_id IS
  'FK to cdc_mentorship_categories (the CRUDable config-master). The domain a mentorship engagement covers (Academic / Career / Technical / Entrepreneurship). Required on new records via the create form''s submit guard; nullable at the DB level for back-compat with pre-existing pairings. Added 2026-06-21 for BUG-004094.';

COMMIT;
