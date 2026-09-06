-- ============================================================================
-- Induction auto-enroll: optional UG/PG degree restriction
-- Date: 2026-06-29
--
-- Why
-- ---
-- "Fresher Induction 2026" (JKKN College of Arts & Science (Self)) must enroll
-- UG freshers ONLY. `fn_induction_auto_enroll` (added 20260629110000) filtered
-- the joining cohort on institution + admission_year + lifecycle_status with NO
-- degree filter, so it pulled UG and PG learners alike — 11 PG students landed
-- in a UG-only induction (and a re-run would re-add them after a manual cleanup).
--
-- This adds an ADDITIVE, nullable `induction_programs.degree_type_filter` and
-- teaches auto-enroll to honor it:
--   * NULL  -> all degrees (DEFAULT, behavior unchanged — every existing and
--              group-scope induction is byte-for-byte unaffected).
--   * 'ug'  -> only learners whose degree resolves to degree_type = 'ug'.
--   * 'pg'  -> only 'pg'.
--
-- Live-verified on prod 2026-06-29: with degree_type_filter='ug' set on the
-- Fresher Induction 2026 program, a full delete + re-run of fn_induction_auto_enroll
-- rebuilt the cohort to 432 rows — all Arts & Science (Self), all UG, 0 PG, and
-- correctly picked up 2 newly-reserved UG freshers since the prior run.
-- ============================================================================

-- 1. Schema: nullable degree restriction on the induction program.
ALTER TABLE public.induction_programs
  ADD COLUMN IF NOT EXISTS degree_type_filter text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'induction_programs_degree_type_filter_chk'
  ) THEN
    ALTER TABLE public.induction_programs
      ADD CONSTRAINT induction_programs_degree_type_filter_chk
      CHECK (degree_type_filter IS NULL OR degree_type_filter IN ('ug', 'pg'));
  END IF;
END $$;

COMMENT ON COLUMN public.induction_programs.degree_type_filter IS
  'Optional UG/PG restriction for auto-enroll: NULL = all degrees (default, unchanged); ''ug''/''pg'' = enroll only that degree_type. Resolved via learners_profiles.degree_id -> degrees.degree_type.';

-- 2. Auto-enroll honors degree_type_filter. The added clause
--    `(v_degree_filter IS NULL OR d.degree_type = v_degree_filter)` is a no-op
--    when the column is NULL, so all other inductions are unchanged. LEFT JOIN
--    means a learner with a NULL degree_id is EXCLUDED when a filter is set
--    (only confirmed-degree learners are auto-enrolled).
CREATE OR REPLACE FUNCTION public.fn_induction_auto_enroll(p_event_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst          UUID;
  v_year          INTEGER;
  v_scope         TEXT;
  v_degree_filter TEXT;
  v_count         INTEGER;
BEGIN
  SELECT institution_id, admission_year, enroll_scope, degree_type_filter
    INTO v_inst, v_year, v_scope, v_degree_filter
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
  -- program's own institution. degree_type_filter (when set) restricts to UG or PG.
  -- institution_id stored = the learner's college (per-college batch-split + scorecard
  -- stay correct for a group induction).
  INSERT INTO public.induction_enrollment (event_id, learner_id, institution_id, source)
  SELECT p_event_id, lp.id, lp.institution_id, 'auto_admission_year'
  FROM public.learners_profiles lp
  JOIN public.admission_years ay ON ay.id = lp.admission_year_id
  LEFT JOIN public.degrees d ON d.id = lp.degree_id
  WHERE ay.year = v_year
    AND lp.lifecycle_status IN ('reserved', 'admitted', 'account')
    AND (v_scope = 'group' OR lp.institution_id = v_inst)
    AND (v_degree_filter IS NULL OR d.degree_type = v_degree_filter)
  ON CONFLICT (event_id, learner_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $function$;

-- 3. Lock anon (mandatory for SECURITY DEFINER RPCs — Supabase grants anon
--    EXECUTE on new functions by default). authenticated only; the function's
--    own body re-checks is_super_admin()/is_admin()/induction.manage.
REVOKE EXECUTE ON FUNCTION public.fn_induction_auto_enroll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_auto_enroll(uuid) TO authenticated;
