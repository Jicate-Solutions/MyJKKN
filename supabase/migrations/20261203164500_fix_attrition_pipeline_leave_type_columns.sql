-- 20261203164500_fix_attrition_pipeline_leave_type_columns.sql
--
-- FILE ONLY / NOT APPLIED — the operator applies it at merge.
--
-- WHAT IS BROKEN. `fn_compute_input_attrition_pipeline` raises
--     42703: column lt.name does not exist
-- on EVERY call, today, unmasked. It LEFT JOINs `public.hr_leave_types lt` and then
-- filters on `lt.name` / `lt.code` to find resignation-shaped leave types. Those
-- columns do not exist on that table. The real names are `leave_type_name` and
-- `leave_type_code` (confirmed against information_schema 2026-09-12; the table also
-- carries description, color_code, duration_type, … but nothing called name or code).
--
-- WHY IT SHIPPED GREEN. plpgsql resolves column references at CALL time, not at
-- CREATE time, so the original migration applied cleanly and sat in the ledger looking
-- healthy. Nothing executes this function on a schedule, so nobody saw the error.
-- Same class as the two defects in PR #3665 — a body that is valid SQL text and an
-- invalid query.
--
-- ⚠️ SCOPE WIDENED 2026-09-13 AFTER PEER REVIEW. The rename alone shipped a FALSE
-- GREEN and a peer tab caught it. Renaming the columns removes the crash but the
-- signal then computes RETIREMENTS ONLY and calls the result attrition: measured
-- live, 0 of 78 hr_leave_types match resign/separation/notice, so
-- v_resignation_count is structurally 0 at every institution, forever. With the
-- rename alone, 7 of 10 institutions reported GREEN "attrition healthy" while blind
-- to resignations entirely. A 42703 is visibly broken and gets fixed; a green light
-- on an HR attrition signal is a wrong number a leader acts on with no error anywhere.
-- The old guard could not save it either: `IF v_resignation_count = 0 AND NOT
-- v_has_dob_data` needs BOTH, and DOB coverage is 733/733, so it was dead code.
-- This migration therefore ALSO makes the function admit what it cannot see.
--
-- SCOPE. Six column references, plus an observability probe and an honest guard. The body below was taken
-- VERBATIM from the live definition via pg_get_functiondef() on 2026-09-12 and edited
-- surgically — signature, RETURNS hr_signal_input_result, SECURITY DEFINER,
-- search_path, every threshold branch and every raw_data key are byte-identical to what
-- runs today. Retyping a body by hand is how a sibling PR nearly dropped a delivery
-- path it never meant to touch.
--
-- REHEARSED AGAINST PRODUCTION in BEGIN … ROLLBACK (2026-09-12):
--   before : 42703, column lt.name does not exist
--   after  : status = 'amber'  ← a real computed signal on real data, not insufficient_data
--   residue: production definition re-checked afterwards and still carries the OLD
--            columns, proving the rollback held and nothing leaked.
--
-- NOT IN SCOPE, reported separately:
--   * fn_compute_input_sfr + fn_compute_input_peer_benchmark — invalid 'enrolled'
--     lifecycle_status literal, and peer_benchmark's ipa.program_type. PR #3665.
--   * fn_compute_input_projected_intake — same enum class plus 'applied', which needs a
--     semantic ruling nobody has made (the funnel's own 'applied' stage may mean
--     admission_leads.funnel_stage, a DIFFERENT population from learners_profiles).
--
-- LIGHTS NO DARK TAB. The six HR Intelligence tabs stay gated on
-- `institution_program_approvals` being populated from regulator approval letters. This
-- only ensures that when that data lands, this input returns a status instead of throwing.

CREATE OR REPLACE FUNCTION public.fn_compute_input_attrition_pipeline(p_institution_id uuid, p_program_id uuid DEFAULT NULL::uuid)
 RETURNS hr_signal_input_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_result            public.hr_signal_input_result;
  v_resignation_count int := 0;
  v_retirement_count  int := 0;
  v_total_staff       int;
  v_at_risk           int;
  v_retirement_age    int;
  v_has_dob_data      boolean := false;
  v_resig_observable  boolean := false;
  v_threshold_amber   numeric;
  v_threshold_red     numeric;
BEGIN
  v_result.input_key := 'attrition_pipeline';

  -- Get retirement age from policy (default 60)
  SELECT COALESCE((pp.value)::int, 60)
  INTO v_retirement_age
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'hr_recruitment.retirement_age_default'
  LIMIT 1;
  IF v_retirement_age IS NULL THEN v_retirement_age := 60; END IF;

  -- Count total active staff for this institution
  SELECT COALESCE(COUNT(*), 0)
  INTO v_total_staff
  FROM public.staff s
  WHERE s.institution_id = p_institution_id
    AND s.is_active = true;

  IF v_total_staff = 0 THEN
    v_result.status := 'insufficient_data';
    v_result.raw_data := jsonb_build_object('reason', 'No active staff found for this institution.');
    RETURN v_result;
  END IF;

  -- 0. CAN we observe resignations at all? The count below matches leave TYPES by
  --    name. If no such type exists the count is structurally 0, and "no resignations"
  --    becomes indistinguishable from "cannot see resignations". Measured 2026-09-13:
  --    0 of 78 hr_leave_types match, so this is FALSE today at every institution.
  SELECT EXISTS (
    SELECT 1 FROM public.hr_leave_types lt
    WHERE lt.leave_type_name ILIKE '%resign%'
       OR lt.leave_type_code ILIKE '%resign%'
       OR lt.leave_type_name ILIKE '%separation%'
       OR lt.leave_type_code ILIKE '%separation%'
       OR lt.leave_type_name ILIKE '%notice period%'
       OR lt.leave_type_code ILIKE '%notice%'
  ) INTO v_resig_observable;

  -- 1. Count resignations in last 12 months
  --    Join hr_leave_applications → hr_leave_types to find resignation-related leave types
  SELECT COALESCE(COUNT(DISTINCT la.employee_id), 0)
  INTO v_resignation_count
  FROM public.hr_leave_applications la
  JOIN public.staff s ON s.id = la.employee_id
  LEFT JOIN public.hr_leave_types lt ON lt.id = la.leave_type_id
  WHERE s.institution_id = p_institution_id
    AND s.is_active = true
    AND la.status = 'approved'
    AND la.created_at >= (CURRENT_DATE - INTERVAL '12 months')
    AND (la.superseded_by IS NULL)
    AND (
      lt.leave_type_name ILIKE '%resign%'
      OR lt.leave_type_code ILIKE '%resign%'
      OR lt.leave_type_name ILIKE '%separation%'
      OR lt.leave_type_code ILIKE '%separation%'
      OR lt.leave_type_name ILIKE '%notice period%'
      OR lt.leave_type_code ILIKE '%notice%'
    );

  -- 2. Count upcoming retirements: staff with DOB where age >= retirement_age - 1
  --    staff.date_of_birth is on the staff table directly
  SELECT COALESCE(COUNT(*), 0), (COUNT(*) > 0 OR EXISTS (
    SELECT 1 FROM public.staff s2
    WHERE s2.institution_id = p_institution_id
      AND s2.is_active = true
      AND s2.date_of_birth IS NOT NULL
    LIMIT 1
  ))
  INTO v_retirement_count, v_has_dob_data
  FROM public.staff s
  WHERE s.institution_id = p_institution_id
    AND s.is_active = true
    AND s.date_of_birth IS NOT NULL
    AND EXTRACT(YEAR FROM age(CURRENT_DATE, s.date_of_birth)) >= (v_retirement_age - 1);

  -- Check if we have any useful data
  IF NOT v_resig_observable OR NOT v_has_dob_data THEN
    -- HALF-BLIND, SO SAY SO. Retirements alone are not attrition. Reporting 'green'
    -- here told a leader "attrition healthy" while the resignation term was
    -- structurally 0 -- a wrong number with no error anywhere to notice. The
    -- retirement figures are still returned so the work is not lost, but the STATUS
    -- refuses to assert a verdict it cannot support.
    -- NOTE the operator: the previous guard was AND, and DOB coverage is 733/733, so
    -- it could never fire.
    v_result.status := 'insufficient_data';
    v_result.value  := v_retirement_count;
    v_result.norm   := v_total_staff;
    v_result.raw_data := jsonb_build_object(
      'reason', CASE WHEN NOT v_resig_observable
                     THEN 'Resignations are not observable: no hr_leave_types row matches resign/separation/notice. Retirement counts below are complete; the attrition verdict is not.'
                     ELSE 'No DOB data on staff, so retirement risk cannot be computed.' END,
      'resignation_observable', v_resig_observable,
      'retirement_count', v_retirement_count,
      'total_staff', v_total_staff,
      'retirement_age', v_retirement_age
    );
    RETURN v_result;
  END IF;

  -- 3. Total at-risk headcount
  v_at_risk := v_resignation_count + v_retirement_count;

  -- 4. Compute signal
  v_result.value := v_at_risk;
  v_result.norm := v_total_staff;
  v_result.gap := v_at_risk;  -- positive = at-risk headcount
  v_result.pct_of_norm := CASE
    WHEN v_total_staff > 0 THEN round(v_at_risk::numeric / v_total_staff * 100, 2)
    ELSE 0
  END;

  -- 5. Get thresholds from policies (key uses 'attrition_pipeline' per threshold admin PR)
  SELECT COALESCE((pp.value)::numeric, 10)
  INTO v_threshold_amber
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'hr_recruitment.threshold_amber_attrition_pipeline'
  LIMIT 1;
  IF v_threshold_amber IS NULL THEN v_threshold_amber := 10; END IF;

  SELECT COALESCE((pp.value)::numeric, 20)
  INTO v_threshold_red
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'hr_recruitment.threshold_red_attrition_pipeline'
  LIMIT 1;
  IF v_threshold_red IS NULL THEN v_threshold_red := 20; END IF;

  -- HIGHER pct = worse (more staff at risk). <=amber=green; <=red=amber; else=red
  IF v_result.pct_of_norm <= v_threshold_amber THEN
    v_result.status := 'green';
  ELSIF v_result.pct_of_norm <= v_threshold_red THEN
    v_result.status := 'amber';
  ELSE
    v_result.status := 'red';
  END IF;

  v_result.raw_data := jsonb_build_object(
    'resignation_count', v_resignation_count,
    'retirement_count', v_retirement_count,
    'total_staff', v_total_staff,
    'at_risk_count', v_at_risk,
    'at_risk_pct', round(v_result.pct_of_norm, 1),
    'retirement_age', v_retirement_age,
    'has_dob_data', v_has_dob_data,
    'threshold_amber', v_threshold_amber,
    'threshold_red', v_threshold_red
  );

  RETURN v_result;
END;
$function$
;

REVOKE EXECUTE ON FUNCTION public.fn_compute_input_attrition_pipeline(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_compute_input_attrition_pipeline(uuid) TO authenticated;  -- ci:allow-secdef-authenticated (pre-existing reader, no new exposure)
