-- 20261204093000_fix_sfr_norm_selection_ambiguity.sql
-- Updated: 2026-09-13 — fn_compute_input_sfr picked an arbitrary regulator norm.
--
-- DEFECT. The norm lookup joined hr_regulatory_norms to institution_program_approvals on
-- body_id ALONE, with `LIMIT 1` and no ORDER BY and no programme-type predicate. A
-- regulator's norm is not one number: AICTE's UG and PG student-faculty ratios differ.
-- With more than one active norm row for a body, the planner decided which ratio scored
-- the institution.
--
-- DEMONSTRATED on production inside BEGIN/ROLLBACK, same institution and same staff:
--     AICTE UG 1:20 only              -> norm 20, pct_of_norm 50.2
--     AICTE UG 1:20 AND PG 1:12       -> norm 12, pct_of_norm 83.6
-- The second run scored *JKKN Matric Higher Secondary School* against a POSTGRADUATE
-- norm. A 66% swing in a figure that feeds Recruitment Need, i.e. hiring.
--
-- WHY NOW, BEFORE THE DATA. institution_program_approvals is empty today, so the lookup
-- returns no row and the function answers `insufficient_data` no matter what this
-- migration does — its behaviour on current production data is unchanged. The ambiguity
-- only becomes reachable on the FIRST successful approvals upload. Fixing it after that
-- upload would mean correcting a number a leader had already read.
--
-- FIX. Match the norm through the approved programme's own program_type, and order
-- deterministically. A programme with no program_type can no longer silently borrow some
-- other programme's ratio.
--
-- OBSERVABILITY. `insufficient_data` previously said only "No SFR norm configured for
-- this institution/body" for three different situations: no approvals at all, approvals
-- whose programmes carry no type, and a genuinely missing norm row. A reader could not
-- tell which, and 66% of programmes currently have a NULL program_type. The reason now
-- names the situation and carries the two counts behind it.
--
-- Body is verbatim `pg_get_functiondef` from production (the post-#3665 definition) with
-- only the blocks above changed. Grant re-asserts the existing posture using identity
-- arguments read from pg_proc, never hand-typed (cf. #3683, 42883).

CREATE OR REPLACE FUNCTION public.fn_compute_input_sfr(p_institution_id uuid, p_program_id uuid DEFAULT NULL::uuid)
 RETURNS hr_signal_input_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_result public.hr_signal_input_result;
  v_student_count int;
  v_faculty_count numeric;
  v_sfr_norm numeric;
  v_actual_sfr numeric;
  v_threshold_amber numeric;
  v_threshold_red numeric;
  v_approvals int;
  v_untyped int;
BEGIN
  v_result.input_key := 'sfr';

  -- Get SFR norm from regulatory norms (via institution_program_approvals → body → norm)
  -- FIX: a regulator's norm is body-specific AND programme-type-specific (AICTE's UG and
  -- PG ratios differ), so the norm must be matched through the APPROVED PROGRAMME's own
  -- type. The previous LIMIT 1 had no programme-type predicate and no ORDER BY, so with
  -- more than one norm row per body it returned an arbitrary ratio. Demonstrated on
  -- production: with AICTE UG 1:20 and PG 1:12 both present, a Higher Secondary School
  -- was scored against the PG norm and its compliance read 83.6% instead of 50.2%.
  SELECT n.sfr_norm_ratio, n.threshold_amber_pct, n.threshold_red_pct
  INTO v_sfr_norm, v_threshold_amber, v_threshold_red
  FROM public.hr_regulatory_norms n
  JOIN public.institution_program_approvals ipa ON ipa.body_id = n.body_id
  JOIN public.programs pr ON pr.id = ipa.program_id
  WHERE ipa.institution_id = p_institution_id
    AND (p_program_id IS NULL OR ipa.program_id = p_program_id)
    AND n.is_active = true
    AND ipa.is_active = true
    AND pr.program_type IS NOT NULL
    AND n.program_type = pr.program_type
  ORDER BY n.effective_from DESC NULLS LAST, n.sfr_norm_ratio ASC
  LIMIT 1;

  IF v_sfr_norm IS NULL THEN
    -- OBSERVABILITY: 'no norm' previously covered three very different situations and a
    -- reader could not tell which. Name the one that actually applies.
    SELECT count(*), count(*) FILTER (WHERE pr.program_type IS NULL)
      INTO v_approvals, v_untyped
      FROM public.institution_program_approvals ipa
      JOIN public.programs pr ON pr.id = ipa.program_id
     WHERE ipa.institution_id = p_institution_id
       AND (p_program_id IS NULL OR ipa.program_id = p_program_id)
       AND ipa.is_active = true;

    v_result.status := 'insufficient_data';
    v_result.raw_data := jsonb_build_object(
      'reason', CASE
        WHEN v_approvals = 0 THEN
          'No active regulator approval on record for this institution. Upload approval letters in HR Intelligence setup, step 3.'
        WHEN v_untyped = v_approvals THEN
          'Approvals are on record but every approved programme has no program_type, so no regulator norm can be matched to them.'
        ELSE
          'No active SFR norm configured for the regulator and programme type of this institution''s approvals.'
      END,
      'approvals_on_record', v_approvals,
      'approved_programmes_without_program_type', v_untyped
    );
    RETURN v_result;
  END IF;

  -- Count learners (from learners_profiles or admission data)
  -- FIX (Defect A): 'enrolled' removed — not a label of the lifecycle_status enum.
  SELECT count(*)
  INTO v_student_count
  FROM public.learners_profiles lp
  WHERE lp.institution_id = p_institution_id
    AND lp.lifecycle_status IN ('admitted', 'active');

  -- Count faculty (simplified — same as sanctioned gap but without leave exclusion for SFR)
  SELECT count(*)
  INTO v_faculty_count
  FROM public.staff s
  WHERE s.institution_id = p_institution_id
    AND s.is_active = true
    AND s.employment_type = 'full_time';

  IF v_faculty_count = 0 THEN
    v_result.status := 'red';
    v_result.value := 0;
    v_result.norm := v_sfr_norm;
    v_result.raw_data := jsonb_build_object('reason', 'Zero full-time faculty', 'students', v_student_count);
    RETURN v_result;
  END IF;

  v_actual_sfr := v_student_count::numeric / v_faculty_count;

  v_result.value := round(v_actual_sfr, 1);
  v_result.norm := v_sfr_norm;
  v_result.gap := v_actual_sfr - v_sfr_norm;
  v_result.pct_of_norm := CASE WHEN v_sfr_norm > 0 THEN (v_actual_sfr / v_sfr_norm * 100) ELSE 0 END;

  -- For SFR: LOWER is better (fewer learners per faculty). Red if actual SFR exceeds norm by threshold.
  IF v_result.pct_of_norm <= v_threshold_amber THEN
    v_result.status := 'green';
  ELSIF v_result.pct_of_norm <= v_threshold_red THEN
    v_result.status := 'amber';
  ELSE
    v_result.status := 'red';
  END IF;

  v_result.raw_data := jsonb_build_object(
    'students', v_student_count,
    'faculty_fulltime', v_faculty_count,
    'actual_sfr', round(v_actual_sfr, 1),
    'norm_sfr', v_sfr_norm,
    'pct_of_norm', round(v_result.pct_of_norm, 1)
  );

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_compute_input_sfr(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_compute_input_sfr(uuid, uuid) TO authenticated;  -- ci:allow-secdef-authenticated (pre-existing reader, no new exposure)
