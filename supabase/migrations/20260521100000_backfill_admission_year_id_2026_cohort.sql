-- ============================================================================
-- 20260521100000 — Backfill admission_year_id on 2026-cohort leads + learners
-- ============================================================================
-- Why: the student-form Course Selection step now auto-fetches and persists
-- admission_year_id (read-only) for the current calendar year scoped to the
-- learner's (institution, program). Pre-2026-05-21 leads and learners that
-- had complete (institution, program) data but no admission_year_id stored
-- carry NULL in that column, which breaks the Finance tab's fee-structure
-- matrix lookup (the matrix is keyed off admission_year_id).
--
-- This migration backfills the column WHERE a unique matching admission_years
-- row exists. Audit performed 2026-05-21 against production:
--   - admission_leads: 89 rows backfillable (have inst+prog AND a 2026
--     admission_year row exists for that combo)
--   - learners_profiles: 495 rows backfillable
--
-- Rows that stay NULL after this migration:
--   - 17,446 leads + 23 learners that lack institution_id or program_id —
--     can't match to a (inst, prog) admission_year row
--   - 4 leads + 4 learners with inst+prog set but no 2026 admission_year
--     configured — admin needs to create the admission_years row first
--
-- Idempotent: re-running this is a no-op because WHERE clause requires
-- admission_year_id IS NULL.
--
-- Trigger safety: learners_profiles has BEFORE-UPDATE trigger
-- validate_learner_admission_year_scope that rejects mismatched
-- (institution_id, program_id) on the admission_year row. Our UPDATE
-- specifically JOINs by those same columns, so the trigger's scope check
-- will PASS for every backfilled row.
-- ============================================================================

-- Step 1: backfill admission_leads
UPDATE public.admission_leads l
SET admission_year_id = ay.id,
    updated_at = now()
FROM public.admission_years ay
WHERE l.admission_year_id IS NULL
  AND l.institution_id = ay.institution_id
  AND l.program_id     = ay.program_id
  AND ay.program_start_year = 2026
  AND ay.is_active = true
  AND l.created_at >= '2026-01-01'
  AND l.created_at < '2027-01-01';
-- Expected rows updated: 89

-- Step 2: backfill learners_profiles
UPDATE public.learners_profiles lp
SET admission_year_id = ay.id,
    updated_at = now()
FROM public.admission_years ay
WHERE lp.admission_year_id IS NULL
  AND lp.institution_id = ay.institution_id
  AND lp.program_id     = ay.program_id
  AND ay.program_start_year = 2026
  AND ay.is_active = true
  AND lp.created_at >= '2026-01-01'
  AND lp.created_at < '2027-01-01';
-- Expected rows updated: 495
