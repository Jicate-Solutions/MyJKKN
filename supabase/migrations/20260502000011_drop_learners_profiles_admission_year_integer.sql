-- Migration: 2026-05-02
-- Phase D of admission_year integer column retirement.
-- Drop learners_profiles.admission_year (integer) and its supporting index.
--
-- Pre-conditions established by prior phases:
--   * Phase A (2026-05-02 #4): backfilled admission_year_id for every linkable
--     learner. Materialized 85 historical admission_years rows.
--   * Phase B: writers populate admission_year_id alongside the integer.
--   * Phase C-1..C-7: all 6 group-dashboard RPCs read FK only, no longer
--     scan the integer column.
--   * Phase C-8: B2A, api-management, MCP, and Excel-export readers select
--     the FK + program_start_year join and derive the legacy integer in
--     their response shape, so external API consumers see no change.
--   * Phase D writer prep: bulk-upload-profiles, bulk-edit-exited,
--     enquiry-form, enquiries/import, and bridge/convert no longer write
--     the integer column.
--
-- Reversibility:
--   The integer was a legacy mirror of admission_years.program_start_year via
--   the FK. To restore: re-add the column and run
--     UPDATE learners_profiles lp SET admission_year = ay.program_start_year
--     FROM admission_years ay WHERE lp.admission_year_id = ay.id;

DROP INDEX IF EXISTS public.idx_learners_profiles_admission_year;

ALTER TABLE public.learners_profiles DROP COLUMN IF EXISTS admission_year;
