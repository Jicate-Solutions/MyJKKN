-- =====================================================================
-- industry_mentors → engagement category + structured expertise
-- =====================================================================
-- Date: 2026-06-21
-- Bugs: BUG-004059 (engagement category) + BUG-004060 (expertise areas)
-- Depends on: 20260621T0100Z_cdc_config_masters.sql (creates + seeds
--             cdc_mentor_categories [4 rows] + cdc_expertise_areas [10 rows]).
--             This file is timestamped AFTER so both master tables exist
--             before the FK + array columns reference them.
--
-- Director decision: engagement category is REQUIRED on NEW records. The
--   form enforces that (blocks submit when empty); the column stays NULLABLE
--   at the DB level so pre-existing rows are not retroactively invalidated.
--
-- What this adds to industry_mentors:
--   1. mentor_category_id uuid — FK to cdc_mentor_categories. ON DELETE
--      SET NULL so deleting a category master never deletes mentor history,
--      it just unlinks (matches the internship_type_id precedent).
--   2. expertise_area_ids uuid[] — array of cdc_expertise_areas ids. Stored
--      as a uuid[] (not a join table) to mirror the existing free-text
--      expertise_areas text[] shape and keep the read path a single select.
--
-- Back-compat: the legacy free-text `expertise_areas` text[] column is KEPT
--   (existing reads / list-page sector filter depend on it). New records may
--   populate both; old records keep only the text form.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS). NOT applied to prod here.
-- =====================================================================

BEGIN;

-- 1. Engagement category FK. ON DELETE SET NULL — unlink, never cascade-delete.
ALTER TABLE public.industry_mentors
  ADD COLUMN IF NOT EXISTS mentor_category_id uuid
  REFERENCES public.cdc_mentor_categories(id) ON DELETE SET NULL;

-- 2. Structured expertise areas as an array of master ids. No FK enforcement
--    is possible on array elements in Postgres; integrity is maintained by
--    the form only offering active cdc_expertise_areas ids.
ALTER TABLE public.industry_mentors
  ADD COLUMN IF NOT EXISTS expertise_area_ids uuid[];

-- 3. Document the new + retained columns.
COMMENT ON COLUMN public.industry_mentors.mentor_category_id IS
  'FK to cdc_mentor_categories (the CRUDable config-master). Engagement category of the mentor (Guest Lecturer / Project Mentor / Placement Mentor / Advisory Board). REQUIRED on new records via the form; column is nullable so legacy rows remain valid. [BUG-004059]';

COMMENT ON COLUMN public.industry_mentors.expertise_area_ids IS
  'Array of cdc_expertise_areas ids — the structured expertise tags chosen on the form. Forward-looking source of truth for expertise. The legacy free-text expertise_areas text[] column is retained for back-compat (list-page sector filter). [BUG-004060]';

COMMENT ON COLUMN public.industry_mentors.expertise_areas IS
  'LEGACY free-text expertise tags (text[]). Retained for back-compat with the list-page sector filter. New records should populate expertise_area_ids (FK array to cdc_expertise_areas) instead.';

COMMIT;
