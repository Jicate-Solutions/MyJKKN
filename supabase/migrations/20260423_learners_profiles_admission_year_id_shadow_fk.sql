-- =====================================================
-- Migration: learners_profiles.admission_year_id (shadow FK)
-- Date: 2026-04-23
-- PR: PR-1 of 4-PR plan to wire admission_years -> learners_profiles
--
-- Strategy: SHADOW COLUMN. Keeps existing admission_year INTEGER for B2A
--           back-compat (6 endpoints expose it). Adds nullable UUID FK
--           alongside. Scoped backfill: only lifecycle_status='admitted'
--           rows get auto-filled with the latest active cohort for their
--           (institution, program). 'active'/'graduated'/etc. left NULL —
--           director will edit manually via the admitted-status UI.
--
-- Reversibility: column is nullable; trigger DROP recovers prior insert
--                semantics; backfill is idempotent (WHERE admission_year_id IS NULL).
--
-- Production verification (2026-04-23):
--   - 133 admitted rows backfilled
--   - 0 unfilled
--   - 0 non-admitted rows touched
-- =====================================================

BEGIN;

-- 1. Add shadow FK column (idempotent)
ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS admission_year_id UUID NULL
    REFERENCES public.admission_years(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_learners_profiles_admission_year_id
  ON public.learners_profiles(admission_year_id);

-- 2. Scope validator function — ensures FK row matches the profile's
--    institution and (when set) program. Cross-institution attach is rejected.
CREATE OR REPLACE FUNCTION public.validate_learner_admission_year_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.admission_year_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.admission_years ay
    WHERE ay.id = NEW.admission_year_id
      AND ay.institution_id = NEW.institution_id
      AND (NEW.program_id IS NULL OR ay.program_id = NEW.program_id)
  ) THEN
    RAISE EXCEPTION
      'admission_year_id % does not match learner institution_id % / program_id %',
      NEW.admission_year_id, NEW.institution_id, NEW.program_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Wire trigger BEFORE INSERT/UPDATE
DROP TRIGGER IF EXISTS trg_validate_learner_admission_year_scope
  ON public.learners_profiles;

CREATE TRIGGER trg_validate_learner_admission_year_scope
  BEFORE INSERT OR UPDATE OF admission_year_id, institution_id, program_id
  ON public.learners_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_learner_admission_year_scope();

-- 4. Scoped backfill — ONLY lifecycle_status='admitted' rows.
--    Uses the LATEST active admission_year for each (institution, program).
--    Idempotent: skips rows already filled.
UPDATE public.learners_profiles lp
SET admission_year_id = ay.id
FROM (
  SELECT DISTINCT ON (lp2.id)
    lp2.id AS lp_id,
    ay2.id
  FROM public.learners_profiles lp2
  JOIN public.admission_years ay2
    ON ay2.institution_id = lp2.institution_id
   AND ay2.program_id     = lp2.program_id
   AND ay2.is_active      = true
  WHERE lp2.lifecycle_status = 'admitted'
    AND lp2.institution_id IS NOT NULL
    AND lp2.program_id     IS NOT NULL
    AND lp2.admission_year_id IS NULL
  ORDER BY lp2.id, ay2.program_start_year DESC
) ay
WHERE lp.id = ay.lp_id;

-- 5. Post-backfill audit notice (non-blocking; for ops visibility)
DO $$
DECLARE
  filled_count   INT;
  unfilled_count INT;
BEGIN
  SELECT count(*) INTO filled_count
  FROM public.learners_profiles
  WHERE lifecycle_status = 'admitted'
    AND admission_year_id IS NOT NULL;

  SELECT count(*) INTO unfilled_count
  FROM public.learners_profiles
  WHERE lifecycle_status = 'admitted'
    AND admission_year_id IS NULL;

  RAISE NOTICE 'BACKFILL: filled=%, unfilled-admitted=% (NULL kept; create cohort + re-run UPDATE to fix)',
    filled_count, unfilled_count;
END $$;

COMMIT;
