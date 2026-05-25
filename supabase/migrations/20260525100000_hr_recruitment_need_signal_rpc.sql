-- ============================================================================
-- HR Recruitment Need Signal — Computation Engine RPC (PR 3 of ~33-40)
-- ============================================================================
-- Spec: specs/hr-recruitment-need-signal-2026-05-24.md
-- Depends on: PR #1069 (foundation tables) + PR #1071 (signal tables)
--
-- Architecture (Decision AT.5 — per-body plugin):
--   1. Shared return type: hr_signal_input_result
--   2. Per-input computation functions (7 total, 2 implemented here)
--   3. Orchestrator: fn_compute_recruitment_signal
--
-- This PR ships:
--   - fn_compute_input_sanctioned_gap (Input #3 — strongest deterministic signal)
--   - fn_compute_input_sfr (Input #2 — regulatory floor)
--   - fn_compute_recruitment_signal (orchestrator — calls all inputs, applies weights)
--   - Stub functions for inputs #1, #4, #5, #6, #7 (return 'insufficient_data')
--
-- Follow-up PRs fill in the stubs as data sources become available.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Shared return type for per-input computation functions
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.hr_signal_input_result AS (
    input_key text,
    status text,         -- 'green' | 'amber' | 'red' | 'insufficient_data'
    value numeric,       -- computed metric (e.g., actual headcount)
    norm numeric,        -- regulatory norm (e.g., sanctioned count)
    gap numeric,         -- value - norm (negative = under-staffed)
    pct_of_norm numeric, -- value / norm * 100
    raw_data jsonb       -- full audit-trail data for side-by-side view (F1.7)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Input #3: Sanctioned vs. Actual Headcount
-- ============================================================================
-- The strongest deterministic signal. Compares institution_program_approvals
-- sanctioned_faculty_count against actual active staff count, applying:
--   - employment_type weights (F1.4: configurable per body)
--   - leave exclusion threshold (F1.5: policy row)
--   - cross-institution allocation (F1.13: hr_staff_institution_allocation)
--   - R/A/G thresholds (F1.12: fixed defaults + Director override)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_compute_input_sanctioned_gap(
  p_institution_id uuid,
  p_program_id uuid DEFAULT NULL
)
RETURNS public.hr_signal_input_result
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_result public.hr_signal_input_result;
  v_sanctioned int;
  v_actual numeric;
  v_leave_threshold int;
  v_threshold_amber numeric;
  v_threshold_red numeric;
BEGIN
  v_result.input_key := 'sanctioned_gap';

  -- Get sanctioned faculty count from institution_program_approvals
  SELECT COALESCE(SUM(ipa.sanctioned_faculty_count), 0)
  INTO v_sanctioned
  FROM public.institution_program_approvals ipa
  WHERE ipa.institution_id = p_institution_id
    AND ipa.is_active = true
    AND (p_program_id IS NULL OR ipa.program_id = p_program_id);

  IF v_sanctioned = 0 THEN
    v_result.status := 'insufficient_data';
    v_result.raw_data := jsonb_build_object('reason', 'No sanctioned strength data for this institution/program');
    RETURN v_result;
  END IF;

  -- Get leave exclusion threshold from policies
  SELECT COALESCE((pp.value)::int, 30)
  INTO v_leave_threshold
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'hr_recruitment.leave_exclusion_threshold_days'
  LIMIT 1;

  -- Count active faculty with employment_type weighting + leave exclusion
  -- Uses hr_staff_institution_allocation if available, else 100% at primary institution
  SELECT COALESCE(SUM(
    CASE
      WHEN alloc.allocation_percentage IS NOT NULL THEN alloc.allocation_percentage / 100.0
      ELSE 1.0
    END
    *
    CASE s.employment_type
      WHEN 'full_time' THEN 1.0
      WHEN 'adjunct' THEN COALESCE(
        (SELECT n.adjunct_weight FROM public.hr_regulatory_norms n
         JOIN public.institution_program_approvals ipa2 ON ipa2.body_id = n.body_id
         WHERE ipa2.institution_id = p_institution_id AND n.is_active = true LIMIT 1),
        0.5)
      WHEN 'visiting' THEN COALESCE(
        (SELECT n.visiting_weight FROM public.hr_regulatory_norms n
         JOIN public.institution_program_approvals ipa2 ON ipa2.body_id = n.body_id
         WHERE ipa2.institution_id = p_institution_id AND n.is_active = true LIMIT 1),
        0.25)
      ELSE 1.0
    END
  ), 0)
  INTO v_actual
  FROM public.staff s
  LEFT JOIN public.hr_staff_institution_allocation alloc
    ON alloc.staff_id = s.id
    AND alloc.institution_id = p_institution_id
    AND alloc.effective_from <= CURRENT_DATE
    AND (alloc.effective_until IS NULL OR alloc.effective_until >= CURRENT_DATE)
  WHERE s.institution_id = p_institution_id
    AND s.is_active = true
    -- Exclude faculty on long leave (> threshold days)
    AND NOT EXISTS (
      SELECT 1 FROM public.hr_leave_applications la
      WHERE la.employee_id = s.id
        AND la.status = 'approved'
        AND la.start_date <= CURRENT_DATE
        AND la.end_date >= CURRENT_DATE
        AND (la.end_date - la.start_date) > v_leave_threshold
    );

  -- Compute signal
  v_result.value := v_actual;
  v_result.norm := v_sanctioned;
  v_result.gap := v_actual - v_sanctioned;
  v_result.pct_of_norm := CASE WHEN v_sanctioned > 0 THEN (v_actual / v_sanctioned * 100) ELSE 0 END;

  -- Get thresholds (default: amber at 100%, red at 80% — i.e., if you have <100% staff, amber; <80%, red)
  v_threshold_amber := 100.0;
  v_threshold_red := 80.0;

  IF v_result.pct_of_norm >= v_threshold_amber THEN
    v_result.status := 'green';
  ELSIF v_result.pct_of_norm >= v_threshold_red THEN
    v_result.status := 'amber';
  ELSE
    v_result.status := 'red';
  END IF;

  v_result.raw_data := jsonb_build_object(
    'sanctioned', v_sanctioned,
    'actual_weighted', round(v_actual, 2),
    'gap', round(v_result.gap, 2),
    'pct_of_norm', round(v_result.pct_of_norm, 1),
    'leave_threshold_days', v_leave_threshold
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_compute_input_sanctioned_gap IS
  'Input #3: Sanctioned vs actual headcount. Applies employment_type weights (F1.4), leave exclusion (F1.5), allocation % (F1.13). Returns R/A/G + raw audit data.';

GRANT EXECUTE ON FUNCTION public.fn_compute_input_sanctioned_gap(uuid, uuid) TO authenticated;

-- ============================================================================
-- Input #2: Student-Faculty Ratio vs. Regulatory Floor
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_compute_input_sfr(
  p_institution_id uuid,
  p_program_id uuid DEFAULT NULL
)
RETURNS public.hr_signal_input_result
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_result public.hr_signal_input_result;
  v_student_count int;
  v_faculty_count numeric;
  v_sfr_norm numeric;
  v_actual_sfr numeric;
  v_threshold_amber numeric;
  v_threshold_red numeric;
BEGIN
  v_result.input_key := 'sfr';

  -- Get SFR norm from regulatory norms (via institution_program_approvals → body → norm)
  SELECT n.sfr_norm_ratio, n.threshold_amber_pct, n.threshold_red_pct
  INTO v_sfr_norm, v_threshold_amber, v_threshold_red
  FROM public.hr_regulatory_norms n
  JOIN public.institution_program_approvals ipa ON ipa.body_id = n.body_id
  WHERE ipa.institution_id = p_institution_id
    AND (p_program_id IS NULL OR ipa.program_id = p_program_id)
    AND n.is_active = true
    AND ipa.is_active = true
  LIMIT 1;

  IF v_sfr_norm IS NULL THEN
    v_result.status := 'insufficient_data';
    v_result.raw_data := jsonb_build_object('reason', 'No SFR norm configured for this institution/body');
    RETURN v_result;
  END IF;

  -- Count students (from learners_profiles or admission data)
  SELECT count(*)
  INTO v_student_count
  FROM public.learners_profiles lp
  WHERE lp.institution_id = p_institution_id
    AND lp.lifecycle_status IN ('admitted', 'active', 'enrolled');

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

  -- For SFR: LOWER is better (fewer students per faculty). Red if actual SFR exceeds norm by threshold.
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
$$;

COMMENT ON FUNCTION public.fn_compute_input_sfr IS
  'Input #2: Student-Faculty Ratio vs regulatory norm. Queries learners_profiles + staff. Returns R/A/G + raw data.';

GRANT EXECUTE ON FUNCTION public.fn_compute_input_sfr(uuid, uuid) TO authenticated;

-- ============================================================================
-- Stub functions for inputs #1, #4, #5, #6, #7
-- Each returns 'insufficient_data' until its data source is populated.
-- Follow-up PRs fill these in.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_compute_input_workload(p_institution_id uuid, p_program_id uuid DEFAULT NULL)
RETURNS public.hr_signal_input_result LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.hr_signal_input_result;
BEGIN v.input_key := 'workload'; v.status := 'insufficient_data'; v.raw_data := '{"reason":"Workload data not yet populated (hr_faculty_workload table). Fill via /hr/workload."}'::jsonb; RETURN v; END; $$;

CREATE OR REPLACE FUNCTION public.fn_compute_input_specialization_gap(p_institution_id uuid, p_program_id uuid DEFAULT NULL)
RETURNS public.hr_signal_input_result LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.hr_signal_input_result;
BEGIN v.input_key := 'specialization_gap'; v.status := 'insufficient_data'; v.raw_data := '{"reason":"Staff specializations not yet tagged (staff_specializations table)."}'::jsonb; RETURN v; END; $$;

CREATE OR REPLACE FUNCTION public.fn_compute_input_projected_intake(p_institution_id uuid, p_program_id uuid DEFAULT NULL)
RETURNS public.hr_signal_input_result LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.hr_signal_input_result;
BEGIN v.input_key := 'projected_intake'; v.status := 'insufficient_data'; v.raw_data := '{"reason":"Projected intake computation pending admission funnel integration."}'::jsonb; RETURN v; END; $$;

CREATE OR REPLACE FUNCTION public.fn_compute_input_attrition_pipeline(p_institution_id uuid, p_program_id uuid DEFAULT NULL)
RETURNS public.hr_signal_input_result LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.hr_signal_input_result;
BEGIN v.input_key := 'attrition_pipeline'; v.status := 'insufficient_data'; v.raw_data := '{"reason":"DOB backfill needed for retirement projection. Resignations pipeline TBD."}'::jsonb; RETURN v; END; $$;

CREATE OR REPLACE FUNCTION public.fn_compute_input_peer_benchmark(p_institution_id uuid, p_program_id uuid DEFAULT NULL)
RETURNS public.hr_signal_input_result LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.hr_signal_input_result;
BEGIN v.input_key := 'peer_benchmark'; v.status := 'insufficient_data'; v.raw_data := '{"reason":"Peer benchmark data not yet entered (hr_peer_benchmarks table)."}'::jsonb; RETURN v; END; $$;

-- Grant all stubs to authenticated
GRANT EXECUTE ON FUNCTION public.fn_compute_input_workload(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_compute_input_specialization_gap(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_compute_input_projected_intake(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_compute_input_attrition_pipeline(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_compute_input_peer_benchmark(uuid, uuid) TO authenticated;

-- ============================================================================
-- Orchestrator: fn_compute_recruitment_signal
-- ============================================================================
-- Calls all 7 input functions, applies weights from platform_policies,
-- computes composite score (0-100), determines overall R/A/G status,
-- checks for blocked inputs (Decision F1.2), and writes to signal_cache.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_compute_recruitment_signal(
  p_institution_id uuid,
  p_program_id uuid DEFAULT NULL
)
RETURNS public.hr_recruitment_signal_cache
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_inputs public.hr_signal_input_result[];
  v_input public.hr_signal_input_result;
  v_signals jsonb := '{}'::jsonb;
  v_blocked text[] := '{}';
  v_composite numeric := 0;
  v_total_weight numeric := 0;
  v_weight numeric;
  v_overall text;
  v_cache_row public.hr_recruitment_signal_cache;
  v_fy text;
  v_raw_data jsonb := '{}'::jsonb;
BEGIN
  -- Determine current financial year (Apr-Mar per Decision AT.1)
  v_fy := CASE
    WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4 THEN
      EXTRACT(YEAR FROM CURRENT_DATE)::text || '-' || (EXTRACT(YEAR FROM CURRENT_DATE) + 1)::text
    ELSE
      (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::text || '-' || EXTRACT(YEAR FROM CURRENT_DATE)::text
  END;

  -- Call all 7 input computation functions
  v_inputs := ARRAY[
    public.fn_compute_input_sanctioned_gap(p_institution_id, p_program_id),
    public.fn_compute_input_sfr(p_institution_id, p_program_id),
    public.fn_compute_input_specialization_gap(p_institution_id, p_program_id),
    public.fn_compute_input_workload(p_institution_id, p_program_id),
    public.fn_compute_input_projected_intake(p_institution_id, p_program_id),
    public.fn_compute_input_attrition_pipeline(p_institution_id, p_program_id),
    public.fn_compute_input_peer_benchmark(p_institution_id, p_program_id)
  ];

  -- Process each input: build signals JSONB + check for blocked inputs
  FOREACH v_input IN ARRAY v_inputs LOOP
    v_signals := v_signals || jsonb_build_object(
      v_input.input_key,
      jsonb_build_object(
        'status', v_input.status,
        'value', v_input.value,
        'norm', v_input.norm,
        'gap', v_input.gap,
        'pct_of_norm', v_input.pct_of_norm
      )
    );

    v_raw_data := v_raw_data || jsonb_build_object(v_input.input_key, v_input.raw_data);

    IF v_input.status = 'insufficient_data' THEN
      v_blocked := array_append(v_blocked, v_input.input_key);
    ELSE
      -- Get weight for this input from platform_policies
      SELECT COALESCE((pp.value)::numeric, 14.29)
      INTO v_weight
      FROM public.platform_policies pp
      WHERE pp.policy_key = 'hr_recruitment.weight_' || v_input.input_key
      LIMIT 1;

      IF v_weight IS NULL THEN v_weight := 14.29; END IF;

      -- Convert R/A/G to score: green=100, amber=60, red=20
      v_composite := v_composite + v_weight * (
        CASE v_input.status
          WHEN 'green' THEN 100
          WHEN 'amber' THEN 60
          WHEN 'red' THEN 20
          ELSE 0
        END
      ) / 100.0;
      v_total_weight := v_total_weight + v_weight;
    END IF;
  END LOOP;

  -- Decision F1.2: Block whole signal if ANY input has insufficient data
  IF array_length(v_blocked, 1) > 0 THEN
    v_overall := 'blocked';
    v_composite := NULL;
  ELSE
    -- Normalize composite to 0-100 scale
    IF v_total_weight > 0 THEN
      v_composite := round(v_composite / v_total_weight * 100, 2);
    END IF;

    -- Determine overall status from composite
    IF v_composite >= 80 THEN
      v_overall := 'green';
    ELSIF v_composite >= 50 THEN
      v_overall := 'amber';
    ELSE
      v_overall := 'red';
    END IF;
  END IF;

  -- Upsert into signal cache
  INSERT INTO public.hr_recruitment_signal_cache (
    institution_id, program_id, granularity_level,
    composite_score, input_signals, overall_status, blocked_inputs,
    computed_at, computed_by_function, financial_year, raw_data
  ) VALUES (
    p_institution_id, p_program_id, 'program',
    v_composite, v_signals, v_overall, v_blocked,
    now(), 'fn_compute_recruitment_signal', v_fy, v_raw_data
  )
  ON CONFLICT (institution_id, program_id, department_id, financial_year)
  DO UPDATE SET
    composite_score = EXCLUDED.composite_score,
    input_signals = EXCLUDED.input_signals,
    overall_status = EXCLUDED.overall_status,
    blocked_inputs = EXCLUDED.blocked_inputs,
    computed_at = EXCLUDED.computed_at,
    computed_by_function = EXCLUDED.computed_by_function,
    raw_data = EXCLUDED.raw_data,
    updated_at = now();

  -- Return the cached row
  SELECT * INTO v_cache_row
  FROM public.hr_recruitment_signal_cache
  WHERE institution_id = p_institution_id
    AND (program_id IS NOT DISTINCT FROM p_program_id)
    AND financial_year = v_fy;

  RETURN v_cache_row;
END;
$$;

COMMENT ON FUNCTION public.fn_compute_recruitment_signal IS
  'Orchestrator: calls all 7 input computation functions, applies policy-table weights, computes composite score (0-100), writes to signal_cache. Decision F1.2: blocks if ANY input is insufficient_data. Decision AT.5: each input function is a replaceable plugin.';

GRANT EXECUTE ON FUNCTION public.fn_compute_recruitment_signal(uuid, uuid) TO authenticated;

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
DECLARE
  v_fn_count int;
BEGIN
  SELECT count(*) INTO v_fn_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname LIKE 'fn_compute_input_%' OR p.proname = 'fn_compute_recruitment_signal';

  RAISE NOTICE 'PR3 RPC verified: % computation functions deployed (expected 8: 7 inputs + 1 orchestrator)', v_fn_count;

  IF v_fn_count < 8 THEN
    RAISE EXCEPTION 'Expected 8 computation functions, found %', v_fn_count;
  END IF;
END $$;

COMMIT;
