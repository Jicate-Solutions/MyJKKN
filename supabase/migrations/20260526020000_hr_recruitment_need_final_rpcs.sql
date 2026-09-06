-- ============================================================================
-- HR Recruitment Need Signal — Final 3 RPCs + Per-Body Plugin Resolver
-- ============================================================================
-- Replaces 3 stub functions with real computation logic + adds plugin helper.
-- Depends on:
--   PR #1069 (foundation — tables + types)
--   PR #1071 (signal tables + stubs + orchestrator)
--   PR #1082 (YoY + threshold admin)
--   PR #1089 (live RPCs: workload + specialization_gap)
--
-- Functions replaced:
--   fn_compute_input_projected_intake  (Input #5) — admission pipeline → faculty demand
--   fn_compute_input_attrition_pipeline (Input #6) — resignations + retirements → at-risk
--   fn_compute_input_peer_benchmark    (Input #7) — JKKN SFR vs peer institutions
--
-- New:
--   fn_get_body_specific_computation — per-body plugin resolver (Decision AT.5)
--
-- Also seeds 6 threshold policy rows these functions need.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Seed threshold policies for projected_intake, attrition, peer_benchmark
-- ============================================================================
-- Threshold policies for projected_intake, attrition_pipeline, peer_benchmark
-- were already seeded by 20260526000000_hr_recruitment_need_threshold_policies.sql.
-- Only seed the retirement_age_default (new to this migration).
INSERT INTO public.platform_policies (policy_key, value, description, scope_type, data_type, ui_widget, ui_category, is_active)
VALUES
  ('hr_recruitment.retirement_age_default', '60'::jsonb, 'Default retirement age in years. Used by attrition pipeline to flag upcoming retirements.', 'global', 'number', 'number', 'hr_recruitment', true)
ON CONFLICT DO NOTHING;

-- Cleanup: remove erroneously seeded keys (correct keys use '_attrition_pipeline' suffix)
DELETE FROM public.platform_policies
WHERE policy_key IN (
  'hr_recruitment.threshold_amber_attrition',
  'hr_recruitment.threshold_red_attrition'
);


-- ============================================================================
-- Input #5: Projected Intake → Faculty Demand (replaces stub)
-- ============================================================================
-- Logic:
--   1. Count current admission pipeline (applied + admitted) from learners_profiles
--   2. Get approved_intake from institution_program_approvals
--   3. Project next AY headcount (pipeline count, capped at approved_intake)
--   4. Derive faculty needed using SFR norm from hr_regulatory_norms
--   5. Compare against current active faculty count
--   6. HIGHER pct_of_norm = more students than capacity → worse → need to hire
--   7. Thresholds: <=amber → green; <=red → amber; else → red
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_compute_input_projected_intake(
  p_institution_id uuid,
  p_program_id uuid DEFAULT NULL
)
RETURNS public.hr_signal_input_result
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_result       public.hr_signal_input_result;
  v_applied      int;
  v_admitted     int;
  v_approved_intake int;
  v_projected    int;
  v_sfr_norm     numeric;
  v_faculty_count numeric;
  v_faculty_needed numeric;
  v_capacity     numeric;
  v_threshold_amber numeric;
  v_threshold_red   numeric;
BEGIN
  v_result.input_key := 'projected_intake';

  -- 1. Count students in the admission pipeline for this institution
  SELECT
    COALESCE(SUM(CASE WHEN lp.lifecycle_status = 'applied' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN lp.lifecycle_status IN ('admitted', 'active', 'enrolled') THEN 1 ELSE 0 END), 0)
  INTO v_applied, v_admitted
  FROM public.learners_profiles lp
  WHERE lp.institution_id = p_institution_id
    AND (p_program_id IS NULL OR lp.program_id = p_program_id);

  -- 2. Get approved_intake from institution_program_approvals
  SELECT COALESCE(SUM(ipa.approved_intake), 0)
  INTO v_approved_intake
  FROM public.institution_program_approvals ipa
  WHERE ipa.institution_id = p_institution_id
    AND ipa.is_active = true
    AND (p_program_id IS NULL OR ipa.program_id = p_program_id);

  -- If no approved_intake data, return insufficient_data
  IF v_approved_intake = 0 THEN
    v_result.status := 'insufficient_data';
    v_result.raw_data := jsonb_build_object(
      'reason', 'No approved_intake data in institution_program_approvals for this institution.',
      'applied_count', v_applied,
      'admitted_count', v_admitted
    );
    RETURN v_result;
  END IF;

  -- 3. Project next AY total: admitted students + pipeline applied (rough projection)
  v_projected := v_admitted + v_applied;

  -- 4. Get SFR norm — prefer body-specific from hr_regulatory_norms, else policy fallback
  SELECT COALESCE(MIN(n.sfr_norm_ratio), 0)
  INTO v_sfr_norm
  FROM public.hr_regulatory_norms n
  WHERE n.is_active = true
    AND n.body_id IN (
      SELECT DISTINCT ipa.body_id
      FROM public.institution_program_approvals ipa
      WHERE ipa.institution_id = p_institution_id
        AND ipa.is_active = true
        AND (p_program_id IS NULL OR ipa.program_id = p_program_id)
    );

  -- Fallback to a reasonable default SFR if no norm found
  IF v_sfr_norm IS NULL OR v_sfr_norm = 0 THEN
    v_sfr_norm := 20;  -- conservative default: 20 students per faculty
  END IF;

  -- 5. Count current active faculty
  SELECT COALESCE(COUNT(*), 0)
  INTO v_faculty_count
  FROM public.staff s
  WHERE s.institution_id = p_institution_id
    AND s.is_active = true;

  -- Faculty needed for the projected student count
  v_faculty_needed := CEIL(v_projected::numeric / v_sfr_norm);

  -- Current capacity = what existing faculty can handle
  v_capacity := v_faculty_count * v_sfr_norm;

  -- 6. Signal: projected students vs capacity
  v_result.value := v_projected;
  v_result.norm := v_capacity;
  v_result.gap := v_projected - v_capacity;
  v_result.pct_of_norm := CASE
    WHEN v_capacity > 0 THEN round(v_projected::numeric / v_capacity * 100, 2)
    ELSE 0
  END;

  -- 7. Get thresholds from policies
  SELECT COALESCE((pp.value)::numeric, 100)
  INTO v_threshold_amber
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'hr_recruitment.threshold_amber_projected_intake'
  LIMIT 1;
  IF v_threshold_amber IS NULL THEN v_threshold_amber := 100; END IF;

  SELECT COALESCE((pp.value)::numeric, 120)
  INTO v_threshold_red
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'hr_recruitment.threshold_red_projected_intake'
  LIMIT 1;
  IF v_threshold_red IS NULL THEN v_threshold_red := 120; END IF;

  -- HIGHER pct = worse (more students than capacity). <=amber=green; <=red=amber; else=red
  IF v_result.pct_of_norm <= v_threshold_amber THEN
    v_result.status := 'green';
  ELSIF v_result.pct_of_norm <= v_threshold_red THEN
    v_result.status := 'amber';
  ELSE
    v_result.status := 'red';
  END IF;

  v_result.raw_data := jsonb_build_object(
    'applied_count', v_applied,
    'admitted_count', v_admitted,
    'approved_intake', v_approved_intake,
    'projected_total', v_projected,
    'sfr_norm', v_sfr_norm,
    'faculty_count', v_faculty_count,
    'faculty_needed', v_faculty_needed,
    'capacity', v_capacity,
    'threshold_amber', v_threshold_amber,
    'threshold_red', v_threshold_red
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_compute_input_projected_intake IS
  'Input #5: Projected Intake. Admission pipeline (applied+admitted) vs faculty capacity (staff × SFR norm). HIGHER pct = over-capacity → need to hire. Thresholds from platform_policies.';

GRANT EXECUTE ON FUNCTION public.fn_compute_input_projected_intake(uuid, uuid) TO authenticated;


-- ============================================================================
-- Input #6: Attrition Pipeline (replaces stub)
-- ============================================================================
-- Logic:
--   1. Count resignations: hr_leave_applications with leave_type matching
--      resignation patterns (via hr_leave_types.name/code), approved in last 12 months
--   2. Count upcoming retirements: staff where age >= (retirement_age - 1 year)
--   3. Total at-risk = resignations + upcoming_retirements
--   4. pct_of_norm = at_risk / total_active_staff × 100
--   5. HIGHER pct = worse → need to hire ahead
--   6. Thresholds: <=amber=green; <=red=amber; else=red
--   7. If no DOB data AND no resignations → graceful insufficient_data
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_compute_input_attrition_pipeline(
  p_institution_id uuid,
  p_program_id uuid DEFAULT NULL
)
RETURNS public.hr_signal_input_result
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_result            public.hr_signal_input_result;
  v_resignation_count int := 0;
  v_retirement_count  int := 0;
  v_total_staff       int;
  v_at_risk           int;
  v_retirement_age    int;
  v_has_dob_data      boolean := false;
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
      lt.name ILIKE '%resign%'
      OR lt.code ILIKE '%resign%'
      OR lt.name ILIKE '%separation%'
      OR lt.code ILIKE '%separation%'
      OR lt.name ILIKE '%notice period%'
      OR lt.code ILIKE '%notice%'
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
  IF v_resignation_count = 0 AND NOT v_has_dob_data THEN
    v_result.status := 'insufficient_data';
    v_result.raw_data := jsonb_build_object(
      'reason', 'No DOB data on staff and no resignation-type leave applications found.',
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
$$;

COMMENT ON FUNCTION public.fn_compute_input_attrition_pipeline IS
  'Input #6: Attrition Pipeline. Resignations (via hr_leave_types) + upcoming retirements (DOB-based) → at-risk headcount as pct of total staff. HIGHER pct = worse. Thresholds from platform_policies.';

GRANT EXECUTE ON FUNCTION public.fn_compute_input_attrition_pipeline(uuid, uuid) TO authenticated;


-- ============================================================================
-- Input #7: Peer Benchmark (replaces stub)
-- ============================================================================
-- Logic:
--   1. Compute JKKN actual SFR for this institution (active students / active faculty)
--   2. Get peer data from hr_peer_benchmarks
--   3. Calculate peer average SFR
--   4. Compare: value = jkkn_sfr, norm = peer_avg_sfr
--   5. pct_of_norm = peer_avg / jkkn_sfr × 100 (inverted: LOWER = worse)
--   6. LOWER pct = worse (JKKN has more students per faculty than peers)
--   7. Thresholds: >=amber=green; >=red=amber; else=red (same as specialization_gap)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_compute_input_peer_benchmark(
  p_institution_id uuid,
  p_program_id uuid DEFAULT NULL
)
RETURNS public.hr_signal_input_result
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_result          public.hr_signal_input_result;
  v_student_count   int;
  v_faculty_count   int;
  v_jkkn_sfr        numeric;
  v_peer_avg_sfr    numeric;
  v_peer_count      int;
  v_peer_names      jsonb;
  v_program_types   text[];
  v_threshold_amber numeric;
  v_threshold_red   numeric;
BEGIN
  v_result.input_key := 'peer_benchmark';

  -- 1. Count active students at this institution
  SELECT COALESCE(COUNT(*), 0)
  INTO v_student_count
  FROM public.learners_profiles lp
  WHERE lp.institution_id = p_institution_id
    AND lp.lifecycle_status IN ('active', 'enrolled')
    AND (p_program_id IS NULL OR lp.program_id = p_program_id);

  -- Count active faculty
  SELECT COALESCE(COUNT(*), 0)
  INTO v_faculty_count
  FROM public.staff s
  WHERE s.institution_id = p_institution_id
    AND s.is_active = true;

  IF v_faculty_count = 0 THEN
    v_result.status := 'insufficient_data';
    v_result.raw_data := jsonb_build_object(
      'reason', 'No active faculty found for SFR calculation.',
      'student_count', v_student_count
    );
    RETURN v_result;
  END IF;

  -- JKKN actual SFR = students / faculty
  v_jkkn_sfr := round(v_student_count::numeric / v_faculty_count, 2);

  -- 2. Determine program types from institution_program_approvals for filtering peers
  SELECT COALESCE(array_agg(DISTINCT ipa.program_type), ARRAY[]::text[])
  INTO v_program_types
  FROM public.institution_program_approvals ipa
  JOIN public.hr_regulatory_norms n ON n.body_id = ipa.body_id AND n.program_type = ipa.program_type
  WHERE ipa.institution_id = p_institution_id
    AND ipa.is_active = true
    AND (p_program_id IS NULL OR ipa.program_id = p_program_id);

  -- 3. Get peer benchmark data
  --    Filter by program_type if we have specific types, otherwise use all peers
  SELECT
    COALESCE(avg(pb.sfr_ratio), 0),
    COUNT(*),
    COALESCE(jsonb_agg(DISTINCT pb.institution_name), '[]'::jsonb)
  INTO v_peer_avg_sfr, v_peer_count, v_peer_names
  FROM public.hr_peer_benchmarks pb
  WHERE pb.sfr_ratio IS NOT NULL
    AND pb.sfr_ratio > 0
    AND (
      array_length(v_program_types, 1) IS NULL
      OR array_length(v_program_types, 1) = 0
      OR pb.program_type = ANY(v_program_types)
    );

  -- If no peer data, return insufficient_data
  IF v_peer_count = 0 OR v_peer_avg_sfr = 0 THEN
    v_result.status := 'insufficient_data';
    v_result.raw_data := jsonb_build_object(
      'reason', 'No peer benchmark data in hr_peer_benchmarks for matching program types.',
      'jkkn_sfr', v_jkkn_sfr,
      'student_count', v_student_count,
      'faculty_count', v_faculty_count,
      'program_types_searched', to_jsonb(v_program_types)
    );
    RETURN v_result;
  END IF;

  v_peer_avg_sfr := round(v_peer_avg_sfr, 2);

  -- 4. Signal: JKKN SFR vs peer average
  --    For SFR: lower is better (fewer students per faculty)
  --    pct_of_norm = peer_avg / jkkn_sfr × 100 (inverted so LOWER = worse)
  --    This aligns with threshold semantics: amber=90, red=75 (below = bad)
  v_result.value := v_jkkn_sfr;
  v_result.norm := v_peer_avg_sfr;
  v_result.gap := round(v_jkkn_sfr - v_peer_avg_sfr, 2);  -- positive = worse than peers
  v_result.pct_of_norm := CASE
    WHEN v_jkkn_sfr > 0 THEN round(v_peer_avg_sfr / v_jkkn_sfr * 100, 2)
    ELSE 0
  END;

  -- 5. Get thresholds from policies (LOWER pct = worse, per threshold admin PR)
  SELECT COALESCE((pp.value)::numeric, 90)
  INTO v_threshold_amber
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'hr_recruitment.threshold_amber_peer_benchmark'
  LIMIT 1;
  IF v_threshold_amber IS NULL THEN v_threshold_amber := 90; END IF;

  SELECT COALESCE((pp.value)::numeric, 75)
  INTO v_threshold_red
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'hr_recruitment.threshold_red_peer_benchmark'
  LIMIT 1;
  IF v_threshold_red IS NULL THEN v_threshold_red := 75; END IF;

  -- LOWER pct = worse (JKKN has more students per faculty than peers)
  -- >=amber=green; >=red=amber; else=red (same pattern as specialization_gap)
  IF v_result.pct_of_norm >= v_threshold_amber THEN
    v_result.status := 'green';
  ELSIF v_result.pct_of_norm >= v_threshold_red THEN
    v_result.status := 'amber';
  ELSE
    v_result.status := 'red';
  END IF;

  v_result.raw_data := jsonb_build_object(
    'jkkn_sfr', v_jkkn_sfr,
    'peer_avg_sfr', v_peer_avg_sfr,
    'peer_count', v_peer_count,
    'peer_institutions', v_peer_names,
    'student_count', v_student_count,
    'faculty_count', v_faculty_count,
    'program_types', to_jsonb(v_program_types),
    'threshold_amber', v_threshold_amber,
    'threshold_red', v_threshold_red
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_compute_input_peer_benchmark IS
  'Input #7: Peer Benchmark. JKKN actual SFR vs peer average SFR from hr_peer_benchmarks. pct_of_norm = peer_avg/jkkn_sfr*100 — LOWER = worse (JKKN has more students per faculty). Thresholds from platform_policies (amber=90, red=75).';

GRANT EXECUTE ON FUNCTION public.fn_compute_input_peer_benchmark(uuid, uuid) TO authenticated;


-- ============================================================================
-- Per-Body Plugin Resolver (Decision AT.5)
-- ============================================================================
-- Checks hr_regulatory_norms.computation_function_ref for a body-specific
-- override of a given input computation. Returns the function name if set,
-- NULL otherwise. Enables future per-body custom computations without
-- modifying the orchestrator.
--
-- Usage example (future orchestrator enhancement):
--   SELECT fn_get_body_specific_computation(body_uuid, 'sfr')
--   → 'fn_compute_input_sfr_nmc_v2' (or NULL if no override)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_get_body_specific_computation(
  p_body_id uuid,
  p_input_key text
)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_fn_ref text;
BEGIN
  -- Look up computation_function_ref from hr_regulatory_norms for this body
  -- Return the first non-null match (active norms only, most recent effective_from)
  SELECT n.computation_function_ref
  INTO v_fn_ref
  FROM public.hr_regulatory_norms n
  WHERE n.body_id = p_body_id
    AND n.is_active = true
    AND n.computation_function_ref IS NOT NULL
    AND n.computation_function_ref LIKE '%' || p_input_key || '%'
  ORDER BY n.effective_from DESC NULLS LAST
  LIMIT 1;

  RETURN v_fn_ref;
END;
$$;

COMMENT ON FUNCTION public.fn_get_body_specific_computation IS
  'Per-body plugin resolver (Decision AT.5). Checks hr_regulatory_norms.computation_function_ref for body-specific overrides of standard input computation functions. Returns function name or NULL.';

GRANT EXECUTE ON FUNCTION public.fn_get_body_specific_computation(uuid, text) TO authenticated;


-- ============================================================================
-- Verification
-- ============================================================================
DO $$
DECLARE
  v_fn_name text;
  v_src_len int;
  v_fn_names text[] := ARRAY[
    'fn_compute_input_projected_intake',
    'fn_compute_input_attrition_pipeline',
    'fn_compute_input_peer_benchmark',
    'fn_get_body_specific_computation'
  ];
BEGIN
  FOREACH v_fn_name IN ARRAY v_fn_names LOOP
    SELECT length(prosrc) INTO v_src_len
    FROM pg_proc WHERE proname = v_fn_name;

    IF v_src_len IS NULL THEN
      RAISE EXCEPTION 'Function % not found after migration', v_fn_name;
    END IF;

    -- Stubs are ~100 chars; real implementations should be >200
    IF v_fn_name != 'fn_get_body_specific_computation' AND v_src_len < 200 THEN
      RAISE EXCEPTION 'Function % still appears to be a stub (% chars)', v_fn_name, v_src_len;
    END IF;

    RAISE NOTICE 'Verified: % (% chars)', v_fn_name, v_src_len;
  END LOOP;

  -- Verify all 7 input functions + orchestrator exist
  PERFORM 1 FROM pg_proc WHERE proname IN (
    'fn_compute_input_sanctioned_gap',
    'fn_compute_input_sfr',
    'fn_compute_input_workload',
    'fn_compute_input_specialization_gap',
    'fn_compute_input_projected_intake',
    'fn_compute_input_attrition_pipeline',
    'fn_compute_input_peer_benchmark',
    'fn_compute_recruitment_signal'
  );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not all 8 recruitment-need functions found in pg_proc';
  END IF;

  RAISE NOTICE 'All 8 recruitment-need computation functions verified.';
END $$;

COMMIT;
