-- 2026-06-19 — Fix enquiry transfer 23514 (admission_year_id scope mismatch)
--
-- Symptom: "Transfer & Regenerate ID" failed with
--   23514 check_violation "admission_year_id <X> does not match learner
--   institution_id <Y>" (raised by trg_validate_learner_admission_year_scope).
--
-- Cause: transfer_learner_enquiry flipped institution_id to the target
--   institution but left admission_year_id pointing at the SOURCE institution's
--   cohort. Since the 2026-06-05 admission-year collapse, admission_years is
--   institution-scoped, so the BEFORE-UPDATE scope trigger correctly rejects the
--   cross-institution combo and aborts the whole transfer. (As a side effect the
--   AFTER-UPDATE fee trigger never ran, so fee_items never re-resolved either.)
--
-- Fix: re-map admission_year_id to the TARGET institution's cohort for the same
--   calendar year as the learner's current cohort (the admission year doesn't
--   change on transfer). NULL when the target has no cohort for that year — the
--   scope trigger allows NULL and the fee resolver simply yields no items.

CREATE OR REPLACE FUNCTION public.transfer_learner_enquiry(
  p_learner_id uuid,
  p_new_institution_id uuid,
  p_new_degree_id uuid,
  p_new_department_id uuid,
  p_new_program_id uuid,
  p_new_semester_id uuid DEFAULT NULL,
  p_new_section_id uuid DEFAULT NULL,
  p_new_academic_year_id uuid DEFAULT NULL,
  p_new_regulation_id uuid DEFAULT NULL,
  p_new_batch_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  application_id text,
  institution_id uuid,
  program_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current learners_profiles%ROWTYPE;
  v_new_app_id text;
  v_caller uuid := auth.uid();
  v_cohort_year int;
  v_target_admission_year_id uuid;
BEGIN
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('learners.admissions.transfer')
  ) THEN
    RAISE EXCEPTION 'Permission denied: learners.admissions.transfer required';
  END IF;

  SELECT * INTO v_current FROM learners_profiles
  WHERE learners_profiles.id = p_learner_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enquiry not found: %', p_learner_id;
  END IF;

  IF v_current.lifecycle_status IN ('account','active','graduated','exited') THEN
    RAISE EXCEPTION 'Cannot transfer enquiry with status "%". Transfers are only allowed before billing.', v_current.lifecycle_status;
  END IF;

  IF v_current.institution_id = p_new_institution_id THEN
    RAISE EXCEPTION 'New institution must differ from current institution';
  END IF;

  PERFORM 1 FROM degrees
  WHERE degrees.id = p_new_degree_id AND degrees.institution_id = p_new_institution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Degree % does not belong to institution %', p_new_degree_id, p_new_institution_id;
  END IF;

  PERFORM 1 FROM departments
  WHERE departments.id = p_new_department_id AND departments.degree_id = p_new_degree_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Department % does not belong to degree %', p_new_department_id, p_new_degree_id;
  END IF;

  PERFORM 1 FROM programs
  WHERE programs.id = p_new_program_id AND programs.department_id = p_new_department_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program % does not belong to department %', p_new_program_id, p_new_department_id;
  END IF;

  -- Re-map admission_year_id to the TARGET institution's cohort (admission_years
  -- is institution-scoped). Keep the same calendar year as the learner's current
  -- cohort; NULL when the target has no cohort for that year.
  IF v_current.admission_year_id IS NOT NULL THEN
    SELECT ay.year INTO v_cohort_year
      FROM public.admission_years ay
     WHERE ay.id = v_current.admission_year_id;

    IF v_cohort_year IS NOT NULL THEN
      SELECT ay.id INTO v_target_admission_year_id
        FROM public.admission_years ay
       WHERE ay.institution_id = p_new_institution_id
         AND ay.year = v_cohort_year
       ORDER BY ay.is_active DESC, ay.created_at ASC
       LIMIT 1;
    END IF;
  END IF;

  v_new_app_id := generate_learner_application_id(p_new_institution_id);

  UPDATE learners_profiles SET
    institution_id    = p_new_institution_id,
    degree_id         = p_new_degree_id,
    department_id     = p_new_department_id,
    program_id        = p_new_program_id,
    semester_id       = p_new_semester_id,
    section_id        = p_new_section_id,
    academic_year_id  = p_new_academic_year_id,
    admission_year_id = v_target_admission_year_id,
    regulation_id     = p_new_regulation_id,
    batch_id          = p_new_batch_id,
    roll_number       = NULL,
    application_id    = v_new_app_id,
    updated_at        = now()
  WHERE learners_profiles.id = p_learner_id;

  INSERT INTO profile_change_audit_log (
    learner_id, action_type, changed_fields, performed_by, comments, performed_at, created_at
  ) VALUES (
    p_learner_id,
    'TRANSFER',
    jsonb_build_object(
      'old', jsonb_build_object(
        'institution_id', v_current.institution_id,
        'application_id', v_current.application_id,
        'degree_id',      v_current.degree_id,
        'department_id',  v_current.department_id,
        'program_id',     v_current.program_id,
        'semester_id',    v_current.semester_id,
        'section_id',     v_current.section_id,
        'academic_year_id', v_current.academic_year_id,
        'admission_year_id', v_current.admission_year_id,
        'regulation_id',  v_current.regulation_id,
        'batch_id',       v_current.batch_id,
        'roll_number',    v_current.roll_number
      ),
      'new', jsonb_build_object(
        'institution_id', p_new_institution_id,
        'application_id', v_new_app_id,
        'degree_id',      p_new_degree_id,
        'department_id',  p_new_department_id,
        'program_id',     p_new_program_id,
        'semester_id',    p_new_semester_id,
        'section_id',     p_new_section_id,
        'academic_year_id', p_new_academic_year_id,
        'admission_year_id', v_target_admission_year_id,
        'regulation_id',  p_new_regulation_id,
        'batch_id',       p_new_batch_id,
        'roll_number',    NULL
      ),
      'reason', p_reason
    ),
    v_caller,
    p_reason,
    now(),
    now()
  );

  RETURN QUERY
    SELECT lp.id, lp.application_id, lp.institution_id, lp.program_id
    FROM learners_profiles lp
    WHERE lp.id = p_learner_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_learner_enquiry(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text
) TO authenticated;
