-- 2026-05-16 — Fix DELETE programs failure
--
-- Symptom: deleting a `programs` row raised 23514 check_violation
--   "admission_year_id ... does not match learner institution_id ... / program_id <NULL>"
--   for any program whose dependent learner profiles had a non-null
--   admission_year_id referencing an admission_year owned by that same program.
--
-- Cause: cascade ordering inside the DELETE statement.
--   1. admission_years_program_id_fkey (ON DELETE CASCADE) removes the
--      admission_year rows whose program_id = the deleted program.
--   2. fk_learners_profiles_program (ON DELETE SET NULL) UPDATEs
--      learners_profiles.program_id = NULL on dependent rows.
--   3. BEFORE-UPDATE trigger trg_validate_learner_admission_year_scope
--      runs and its EXISTS check looks up the (now-deleted)
--      admission_year, finds nothing, and raises check_violation.
--
-- Fix: make the trigger tolerate a missing parent. The SET NULL FK on
-- learners_profiles.admission_year_id (which still exists) will null
-- the column out next in the same statement, so blocking the cascade
-- is wrong.
--
-- This patch only adds a NOT FOUND short-circuit. The institution /
-- program match enforcement is preserved for INSERT and user-driven
-- UPDATE paths (where the parent row IS present).

CREATE OR REPLACE FUNCTION public.validate_learner_admission_year_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ay_institution_id uuid;
  v_ay_program_id     uuid;
BEGIN
  IF NEW.admission_year_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ay.institution_id, ay.program_id
    INTO v_ay_institution_id, v_ay_program_id
  FROM public.admission_years ay
  WHERE ay.id = NEW.admission_year_id;

  -- Parent admission_year already gone (cascade in flight). The SET NULL
  -- FK on learners_profiles.admission_year_id will clear this column.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_ay_institution_id IS DISTINCT FROM NEW.institution_id
     OR (NEW.program_id IS NOT NULL
         AND v_ay_program_id IS DISTINCT FROM NEW.program_id) THEN
    RAISE EXCEPTION
      'admission_year_id % does not match learner institution_id % / program_id %',
      NEW.admission_year_id, NEW.institution_id, NEW.program_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
