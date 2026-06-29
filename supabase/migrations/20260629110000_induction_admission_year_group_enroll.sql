-- ============================================================================
-- Admission-year-based (optionally group-wide) induction enrollment
-- Date: 2026-06-29
-- Spec: specs/pre-onboarding-induction-access-2026-06-29.md
--
-- The "Fresher Induction 2026" lives under the JKKN Main Office (a group umbrella
-- with no learners), and its freshers are spread across every college. The old
-- fn_induction_auto_enroll filtered learners by the program's institution_id AND
-- their academic_year_id — so it enrolled 0 (Main Office has no learners; and
-- pre-onboarding learners have admission_year_id, not academic_year_id).
--
-- This migration makes induction enrollment ADMISSION-YEAR based and adds a
-- group/institution scope:
--  * induction_programs.admission_year (int)  — the cohort YEAR (e.g. 2026).
--  * induction_programs.enroll_scope          — 'institution' (default) | 'group'.
--  * fn_induction_auto_enroll                  — enroll lifecycle reserved/admitted/
--    account learners whose admission_year_id resolves to that year; cross-college
--    when enroll_scope='group', else only the program's institution.
--  * fn_induction_create_program               — accepts admission_year + enroll_scope.
-- ============================================================================

-- 1. Schema
ALTER TABLE public.induction_programs
  ADD COLUMN IF NOT EXISTS admission_year integer,
  ADD COLUMN IF NOT EXISTS enroll_scope text NOT NULL DEFAULT 'institution';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'induction_programs_enroll_scope_chk'
  ) THEN
    ALTER TABLE public.induction_programs
      ADD CONSTRAINT induction_programs_enroll_scope_chk
      CHECK (enroll_scope IN ('institution', 'group'));
  END IF;
END $$;

COMMENT ON COLUMN public.induction_programs.admission_year IS
  'Cohort admission YEAR (e.g. 2026) this induction enrolls; matched against admission_years.year via learners_profiles.admission_year_id.';
COMMENT ON COLUMN public.induction_programs.enroll_scope IS
  'institution = enroll only this program''s institution; group = enroll across all colleges (e.g. a Main-Office group induction).';

-- 1b. Allow the admission-year auto-enroll source label.
ALTER TABLE public.induction_enrollment DROP CONSTRAINT IF EXISTS induction_enrollment_source_check;
ALTER TABLE public.induction_enrollment ADD CONSTRAINT induction_enrollment_source_check
  CHECK (source IN ('auto_first_year', 'auto_lateral', 'auto_admission_year', 'manual'));

-- 2. Admission-year-based auto-enroll (replaces the academic-year + institution filter).
CREATE OR REPLACE FUNCTION public.fn_induction_auto_enroll(p_event_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst  UUID;
  v_year  INTEGER;
  v_scope TEXT;
  v_count INTEGER;
BEGIN
  SELECT institution_id, admission_year, enroll_scope
    INTO v_inst, v_year, v_scope
  FROM public.induction_programs WHERE event_id = p_event_id;

  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'fn_induction_auto_enroll: induction program not found for event %', p_event_id;
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_auto_enroll: not authorized';
  END IF;
  IF v_year IS NULL THEN
    RAISE EXCEPTION 'fn_induction_auto_enroll: induction has no admission_year set';
  END IF;

  -- The joining cohort = reserved / admitted / account learners in the program's
  -- admission YEAR. enroll_scope='group' enrolls every college; otherwise only the
  -- program's own institution. institution_id stored = the learner's college (so
  -- per-college batch-split + scorecard stay correct for a group induction).
  INSERT INTO public.induction_enrollment (event_id, learner_id, institution_id, source)
  SELECT p_event_id, lp.id, lp.institution_id, 'auto_admission_year'
  FROM public.learners_profiles lp
  JOIN public.admission_years ay ON ay.id = lp.admission_year_id
  WHERE ay.year = v_year
    AND lp.lifecycle_status IN ('reserved', 'admitted', 'account')
    AND (v_scope = 'group' OR lp.institution_id = v_inst)
  ON CONFLICT (event_id, learner_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $function$;

-- 3. Create-program accepts admission_year + enroll_scope. DROP first because the
--    arg list changes (CREATE OR REPLACE can't alter the signature; avoids an
--    ambiguous overload in PostgREST).
DROP FUNCTION IF EXISTS public.fn_induction_create_program(uuid, uuid, text, timestamptz, timestamptz, text, text);

CREATE OR REPLACE FUNCTION public.fn_induction_create_program(
  p_institution_id uuid,
  p_academic_year_id uuid,
  p_name text,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_venue_text text DEFAULT 'Campus'::text,
  p_description text DEFAULT NULL::text,
  p_admission_year integer DEFAULT NULL,
  p_enroll_scope text DEFAULT 'institution'
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id UUID;
  v_slug     TEXT;
  v_scope    TEXT := COALESCE(NULLIF(p_enroll_scope, ''), 'institution');
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(p_institution_id))) THEN
    RAISE EXCEPTION 'fn_induction_create_program: not authorized';
  END IF;
  IF p_institution_id IS NULL OR p_name IS NULL THEN
    RAISE EXCEPTION 'fn_induction_create_program: institution_id and name are required';
  END IF;
  IF v_scope NOT IN ('institution', 'group') THEN
    RAISE EXCEPTION 'fn_induction_create_program: enroll_scope must be institution or group';
  END IF;

  v_slug := lower(regexp_replace(coalesce(p_name,'induction'), '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);

  INSERT INTO public.events (institution_id, event_type, name, slug, venue_text,
                             start_date, end_date, description, status, created_by)
  VALUES (p_institution_id, 'induction', p_name, v_slug, coalesce(p_venue_text, 'Campus'),
          p_start_date, p_end_date, p_description, 'draft', auth.uid())
  RETURNING id INTO v_event_id;

  INSERT INTO public.induction_programs (event_id, institution_id, academic_year_id, admission_year, enroll_scope)
  VALUES (v_event_id, p_institution_id, p_academic_year_id, p_admission_year, v_scope);

  RETURN v_event_id;
END $function$;

-- 4. 'account'-status learners are part of the auto-enroll cohort, so they must
--    also be able to LOG IN to reach My Induction. Add 'account' to the auto-link
--    trigger's eligible-status list (callback + StudentValidationService pick it up
--    via INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES). Rebuilt from
--    20260629100000_induction_only_access_widen_provisioning.sql; only the
--    lifecycle_status IN (...) list changed (added 'account').
CREATE OR REPLACE FUNCTION public.auto_link_profile_to_approved_learner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_learner_record RECORD;
    v_full_name TEXT;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.learner_id IS NULL AND NEW.email IS NOT NULL THEN
        SELECT
            id, first_name, last_name, institution_id, department_id, lifecycle_status
        INTO v_learner_record
        FROM learners_profiles
        WHERE LOWER(college_email) = LOWER(NEW.email)
        AND lifecycle_status IN (
            'approved', 'active', 'graduated',
            'admitted', 'reserved', 'enquiry_submitted', 'enquiry', 'account'
        )
        LIMIT 1;

        IF v_learner_record.id IS NOT NULL THEN
            v_full_name := NEW.full_name;
            IF v_full_name IS NULL OR v_full_name = '' THEN
                v_full_name := TRIM(CONCAT(v_learner_record.first_name, ' ', COALESCE(v_learner_record.last_name, '')));
            END IF;
            NEW.learner_id := v_learner_record.id;
            NEW.institution_id := COALESCE(NEW.institution_id, v_learner_record.institution_id);
            NEW.department_id := COALESCE(NEW.department_id, v_learner_record.department_id);
            NEW.role := COALESCE(NEW.role, 'student');
            NEW.full_name := v_full_name;
            NEW.profile_completed := true;
            RAISE NOTICE 'Auto-linked new profile to learner: % (email: %, status: %)',
                v_learner_record.id, NEW.email, v_learner_record.lifecycle_status;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;
