-- 20261222093000_attrition_reads_offboarding_not_leave_types.sql
-- Updated: 2026-09-16 — the attrition signal counted people leaving by searching LEAVE
-- TYPES, and JKKN does not model leaving as a kind of leave.
--
-- DEFECT. `fn_compute_input_attrition_pipeline` counted resignations from
-- hr_leave_applications joined to hr_leave_types matching resign/separation/notice.
-- Measured: 0 of 78 leave types match, at every institution, so the resignation term was
-- structurally 0 and could never become anything else. A prior fix (#3680/#3683) repaired
-- the crashing column names in that lookup; it made the function stop erroring without
-- making the number mean anything, and the honest guard it added has returned
-- `insufficient_data` everywhere ever since.
--
-- WHERE DEPARTURES ACTUALLY LIVE. `hr_offboarding_cases`, whose separation_type is CHECK
-- constrained to ('resignation','retirement','termination','death'). It carries
-- institution_id and staff_id, so it scopes and joins cleanly. 68 cases on production
-- today, all retirement, initiated June–September 2026.
--
-- RULING (Director, 2026-09-16), asked as "what should count as losing a person":
--   "Everyone who leaves, retirements included — the full headcount picture."
-- He was shown, and accepted, the trade-off: an institution with many staff near
-- retirement age will read as higher churn than one without. So every separation_type
-- counts toward the headline figure.
--
-- THE EDGE CASE THAT DECIDES THE SHAPE — double counting. The function ALSO counts
-- upcoming retirements from staff date of birth. Measured on production 2026-09-16:
--   staff near retirement age (DOB)            72
--   staff holding an offboarding case          68
--   in BOTH sets                               68   <-- every single one
-- Adding the two counts reports 140 people leaving out of 733 staff (19.1%, amber)
-- when the true figure is 72 (9.8%, green). The at-risk headcount is therefore computed
-- as ONE query over distinct staff rows, never as a sum of two counts.
--
-- OBSERVABILITY. `insufficient_data` now fires only when BOTH sources are blind: no
-- offboarding case has ever been filed for the institution AND no staff record carries a
-- date of birth. Because all 68 cases platform-wide are retirements, a zero resignation
-- figure is not yet evidence that nobody resigned — `non_retirement_case_ever` is
-- returned in raw_data so a reader can tell a measured zero from an unused module.
--
-- Body is verbatim `pg_get_functiondef` from production with only those blocks changed.
-- `pg_get_functiondef` returns NO trailing semicolon, so the closing $function$ is
-- terminated explicitly. Grant re-asserts the existing posture using identity arguments
-- read from pg_proc, never hand-typed (cf. #3683: a grant naming a 1-arg signature that
-- never existed failed the whole file with 42883 and froze the ship wave).

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
  v_resig_observable  boolean := false;  -- retained: reported so a reader can see the old probe is gone
  v_departure_count   int     := 0;      -- everyone who left, all separation types
  v_cases_ever        boolean := false;  -- has this institution EVER filed an offboarding case
  v_nonretire_ever    boolean := false;  -- has a non-retirement case ever been filed here
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

  -- 0. CAN we see anyone leaving at all? Departures live in the Offboarding module.
  --    If this institution has never filed a case, "nobody left" is indistinguishable
  --    from "nobody records leaving here".
  SELECT EXISTS (
    SELECT 1 FROM public.hr_offboarding_cases o
     WHERE o.institution_id = p_institution_id
  ) INTO v_cases_ever;

  -- And separately: has a NON-retirement case ever been filed here? Measured
  -- 2026-09-16, all 68 cases platform-wide are retirements, so a zero resignation
  -- figure is not yet evidence that nobody resigned. Reported, never hidden.
  SELECT EXISTS (
    SELECT 1 FROM public.hr_offboarding_cases o
     WHERE o.institution_id = p_institution_id
       AND o.separation_type IS DISTINCT FROM 'retirement'
  ) INTO v_nonretire_ever;

  -- 1. Count departures in the last 12 months, from the Offboarding module.
  --    RULING (Director, 2026-09-16): "everyone who leaves, retirements included" --
  --    the full headcount picture. So EVERY separation_type counts: resignation,
  --    retirement, termination and death.
  --    This replaces a lookup against hr_leave_types, which could never work: JKKN does
  --    not model leaving as a kind of leave (0 of 78 types matched resign/separation/
  --    notice), so the old figure was structurally 0 at every institution, forever.
  SELECT COALESCE(COUNT(DISTINCT o.staff_id), 0),
         COALESCE(COUNT(DISTINCT o.staff_id) FILTER (
           WHERE o.separation_type IS DISTINCT FROM 'retirement'), 0)
    INTO v_departure_count, v_resignation_count
  FROM public.hr_offboarding_cases o
  WHERE o.institution_id = p_institution_id
    AND o.initiated_at >= (CURRENT_DATE - INTERVAL '12 months');

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

  -- Check if we have any useful data.
  -- RULING (Director, 2026-09-16), asked directly as "at a college that has never
  -- recorded anyone leaving, should the signal be allowed to say green": refuse the
  -- verdict. A college that has never filed a case cannot see resignations, terminations
  -- or deaths at all -- only retirement risk from date of birth. Calling that "green"
  -- tells a leader "healthy" when half the question was never asked.
  --
  -- This looks like the OR-guard that #3680 added, and it is NOT the same thing. That one
  -- asked whether a resignation-shaped LEAVE TYPE existed: 0 of 78 matched, nothing in the
  -- product could ever create one, so it was stuck closed forever at every institution.
  -- This one asks whether the institution has filed an offboarding case, which is ordinary
  -- HR work and clears itself the moment the first one is filed.
  IF NOT v_cases_ever OR NOT v_has_dob_data THEN
    v_result.status := 'insufficient_data';
    v_result.value  := v_retirement_count;
    v_result.norm   := v_total_staff;
    v_result.raw_data := jsonb_build_object(
      'reason', CASE WHEN NOT v_cases_ever
                     THEN 'No verdict: this institution has never filed an offboarding case, so resignations, terminations and deaths cannot be seen here. Only retirement risk is measurable, and half an answer is not a verdict. File departures in the Offboarding module and this clears itself.'
                     ELSE 'No verdict: no staff record carries a date of birth, so retirement risk cannot be computed.' END,
      'offboarding_cases_ever', v_cases_ever,
      'has_dob_data', v_has_dob_data,
      'retirement_count', v_retirement_count,
      'total_staff', v_total_staff,
      'retirement_age', v_retirement_age
    );
    RETURN v_result;
  END IF;

  -- 3. Total at-risk headcount -- DISTINCT PEOPLE, never a sum.
  --    Measured on production 2026-09-16: ALL 68 staff holding an offboarding case were
  --    ALSO inside the 72 counted as near-retirement by date of birth. Adding the two
  --    counts would have reported 140 people leaving when the true figure was 72.
  SELECT COALESCE(COUNT(*), 0) INTO v_at_risk
  FROM public.staff s
  WHERE s.institution_id = p_institution_id
    AND s.is_active = true
    AND (
      EXISTS (
        SELECT 1 FROM public.hr_offboarding_cases o
         WHERE o.staff_id = s.id
           AND o.initiated_at >= (CURRENT_DATE - INTERVAL '12 months')
      )
      OR (
        s.date_of_birth IS NOT NULL
        AND EXTRACT(YEAR FROM age(CURRENT_DATE, s.date_of_birth)) >= (v_retirement_age - 1)
      )
    );

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
    'departure_count', v_departure_count,
    'resignation_count', v_resignation_count,
    'offboarding_cases_ever', v_cases_ever,
    'non_retirement_case_ever', v_nonretire_ever,
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
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_compute_input_attrition_pipeline(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_compute_input_attrition_pipeline(uuid, uuid) TO authenticated;  -- ci:allow-secdef-authenticated (pre-existing reader, no new exposure)
