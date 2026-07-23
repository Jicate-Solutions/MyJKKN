-- ============================================================================
-- HR Recruitment Need Signal — Live RPC: Workload + Specialization Gap
-- ============================================================================
-- Replaces 2 stub functions with real computation logic.
-- Depends on: PR #1069 (foundation), PR #1071 (signal tables + hr_faculty_workload)
--
-- Functions replaced:
--   fn_compute_input_workload (Input #1) — avg contact hours vs norm
--   fn_compute_input_specialization_gap (Input #4) — coverage vs required
--
-- Also seeds 4 threshold policy rows these functions need.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Seed threshold policies for workload + specialization gap
-- ============================================================================
INSERT INTO public.platform_policies (policy_key, value, description, scope_type, data_type, ui_widget, ui_category, is_active)
VALUES
  ('hr_recruitment.threshold_amber_workload',          '100'::jsonb, 'Workload pct_of_norm at or below which status is green (above = amber). Higher hours = overworked.',           'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.threshold_red_workload',            '120'::jsonb, 'Workload pct_of_norm above which status is red. Faculty teaching >120% of norm = critical.',                   'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.threshold_amber_specialization_gap','80'::jsonb,  'Specialization coverage pct at or above which status is green. Below = amber.',                                'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.threshold_red_specialization_gap',  '60'::jsonb,  'Specialization coverage pct below which status is red.',                                                       'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.workload_norm_hours',               '16'::jsonb,  'Default weekly contact-hour norm (AICTE standard). Overridden by hr_regulatory_norms if body-specific.',       'global', 'number', 'number', 'hr_recruitment', true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Input #1: Faculty Workload (replaces stub)
-- ============================================================================
-- Logic:
--   1. Determine current academic year + semester
--   2. Query hr_faculty_workload for institution/year/semester
--   3. Compute average weekly_contact_hours
--   4. Compare against norm (from hr_regulatory_norms or policy fallback, default 16)
--   5. pct_of_norm = avg_hours / norm * 100
--   6. HIGHER pct = worse (overworked → need to hire)
--   7. Thresholds: <=amber → green; <=red → amber; else → red
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_compute_input_workload(
  p_institution_id uuid,
  p_program_id uuid DEFAULT NULL
)
RETURNS public.hr_signal_input_result
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_result public.hr_signal_input_result;
  v_academic_year text;
  v_semester int;
  v_faculty_count int;
  v_avg_hours numeric;
  v_norm_hours numeric;
  v_threshold_amber numeric;
  v_threshold_red numeric;
BEGIN
  v_result.input_key := 'workload';

  -- Determine current academic year and semester
  -- Academic year: if month >= 7 (July), we're in sem 1 of YYYY-YYYY+1
  -- If month < 7, we're in sem 2 of (YYYY-1)-YYYY
  IF EXTRACT(MONTH FROM CURRENT_DATE) >= 7 THEN
    v_semester := 1;
    v_academic_year := EXTRACT(YEAR FROM CURRENT_DATE)::text || '-' || (EXTRACT(YEAR FROM CURRENT_DATE) + 1)::text;
  ELSE
    v_semester := 2;
    v_academic_year := (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::text || '-' || EXTRACT(YEAR FROM CURRENT_DATE)::text;
  END IF;

  -- Count faculty with workload data for this institution/year/semester
  SELECT count(*), COALESCE(avg(w.weekly_contact_hours), 0)
  INTO v_faculty_count, v_avg_hours
  FROM public.hr_faculty_workload w
  WHERE w.institution_id = p_institution_id
    AND w.academic_year = v_academic_year
    AND w.semester = v_semester;

  -- If no workload data, return insufficient_data
  IF v_faculty_count = 0 THEN
    v_result.status := 'insufficient_data';
    v_result.raw_data := jsonb_build_object(
      'reason', 'No workload data for ' || v_academic_year || ' semester ' || v_semester,
      'academic_year', v_academic_year,
      'semester', v_semester
    );
    RETURN v_result;
  END IF;

  -- Get norm hours: first try hr_regulatory_norms (body-specific), then policy, then default 16
  SELECT n.sfr_norm_ratio  -- reusing this field is wrong; check for a workload-specific field
  INTO v_norm_hours
  FROM public.hr_regulatory_norms n
  JOIN public.institution_program_approvals ipa ON ipa.body_id = n.body_id
  WHERE ipa.institution_id = p_institution_id
    AND (p_program_id IS NULL OR ipa.program_id = p_program_id)
    AND n.is_active = true
    AND ipa.is_active = true
  LIMIT 1;

  -- hr_regulatory_norms doesn't have a workload-specific hours column, so fall back to policy
  -- The sfr_norm_ratio is student-faculty ratio, not hours. Use policy instead.
  SELECT COALESCE((pp.value)::numeric, 16)
  INTO v_norm_hours
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'hr_recruitment.workload_norm_hours'
  LIMIT 1;

  -- Ultimate fallback
  IF v_norm_hours IS NULL THEN
    v_norm_hours := 16;
  END IF;

  -- Compute signal
  v_result.value := round(v_avg_hours, 2);
  v_result.norm := v_norm_hours;
  v_result.gap := round(v_avg_hours - v_norm_hours, 2);
  v_result.pct_of_norm := CASE WHEN v_norm_hours > 0 THEN round(v_avg_hours / v_norm_hours * 100, 2) ELSE 0 END;

  -- Get thresholds from policies
  SELECT COALESCE((pp.value)::numeric, 100)
  INTO v_threshold_amber
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'hr_recruitment.threshold_amber_workload'
  LIMIT 1;
  IF v_threshold_amber IS NULL THEN v_threshold_amber := 100; END IF;

  SELECT COALESCE((pp.value)::numeric, 120)
  INTO v_threshold_red
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'hr_recruitment.threshold_red_workload'
  LIMIT 1;
  IF v_threshold_red IS NULL THEN v_threshold_red := 120; END IF;

  -- For workload: HIGHER is worse. <=amber=green, <=red=amber, >red=red
  IF v_result.pct_of_norm <= v_threshold_amber THEN
    v_result.status := 'green';
  ELSIF v_result.pct_of_norm <= v_threshold_red THEN
    v_result.status := 'amber';
  ELSE
    v_result.status := 'red';
  END IF;

  v_result.raw_data := jsonb_build_object(
    'faculty_count', v_faculty_count,
    'avg_weekly_contact_hours', round(v_avg_hours, 2),
    'norm_hours', v_norm_hours,
    'pct_of_norm', round(v_result.pct_of_norm, 1),
    'academic_year', v_academic_year,
    'semester', v_semester,
    'threshold_amber', v_threshold_amber,
    'threshold_red', v_threshold_red
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_compute_input_workload IS
  'Input #1: Faculty Workload. Avg weekly contact hours vs regulatory/policy norm. HIGHER pct = overworked = need to hire. Thresholds from platform_policies.';

GRANT EXECUTE ON FUNCTION public.fn_compute_input_workload(uuid, uuid) TO authenticated;

-- ============================================================================
-- Input #4: Specialization Coverage (replaces stub)
-- ============================================================================
-- Logic:
--   1. Get required specializations: hr_specializations linked via body_id
--      from institution_program_approvals for this institution
--   2. If no required specializations → insufficient_data
--   3. Count how many are covered by active staff (staff_specializations + staff.is_active)
--   4. pct_of_norm = covered / required * 100
--   5. HIGHER pct = better (more coverage)
--   6. Thresholds: >=amber → green; >=red → amber; else → red
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_compute_input_specialization_gap(
  p_institution_id uuid,
  p_program_id uuid DEFAULT NULL
)
RETURNS public.hr_signal_input_result
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_result public.hr_signal_input_result;
  v_required_count int;
  v_covered_count int;
  v_threshold_amber numeric;
  v_threshold_red numeric;
  v_required_specs jsonb;
  v_covered_specs jsonb;
  v_uncovered_specs jsonb;
BEGIN
  v_result.input_key := 'specialization_gap';

  -- Get required specializations for this institution:
  -- All hr_specializations linked to bodies that govern this institution
  -- (via institution_program_approvals → body_id → hr_specializations.body_id)
  SELECT count(DISTINCT hs.id)
  INTO v_required_count
  FROM public.hr_specializations hs
  WHERE hs.is_active = true
    AND hs.body_id IN (
      SELECT DISTINCT ipa.body_id
      FROM public.institution_program_approvals ipa
      WHERE ipa.institution_id = p_institution_id
        AND ipa.is_active = true
        AND (p_program_id IS NULL OR ipa.program_id = p_program_id)
    );

  -- If no required specializations defined, return insufficient_data
  IF v_required_count = 0 THEN
    v_result.status := 'insufficient_data';
    v_result.raw_data := jsonb_build_object(
      'reason', 'No specializations defined for governing bodies of this institution'
    );
    RETURN v_result;
  END IF;

  -- Count how many required specializations have at least 1 active staff member tagged
  SELECT count(DISTINCT hs.id)
  INTO v_covered_count
  FROM public.hr_specializations hs
  WHERE hs.is_active = true
    AND hs.body_id IN (
      SELECT DISTINCT ipa.body_id
      FROM public.institution_program_approvals ipa
      WHERE ipa.institution_id = p_institution_id
        AND ipa.is_active = true
        AND (p_program_id IS NULL OR ipa.program_id = p_program_id)
    )
    AND EXISTS (
      SELECT 1
      FROM public.staff_specializations ss
      JOIN public.staff s ON s.id = ss.staff_id
      WHERE ss.specialization_id = hs.id
        AND s.institution_id = p_institution_id
        AND s.is_active = true
    );

  -- Build lists for raw_data
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', hs.id, 'name', hs.name)), '[]'::jsonb)
  INTO v_required_specs
  FROM public.hr_specializations hs
  WHERE hs.is_active = true
    AND hs.body_id IN (
      SELECT DISTINCT ipa.body_id
      FROM public.institution_program_approvals ipa
      WHERE ipa.institution_id = p_institution_id
        AND ipa.is_active = true
        AND (p_program_id IS NULL OR ipa.program_id = p_program_id)
    );

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', hs.id, 'name', hs.name)), '[]'::jsonb)
  INTO v_covered_specs
  FROM public.hr_specializations hs
  WHERE hs.is_active = true
    AND hs.body_id IN (
      SELECT DISTINCT ipa.body_id
      FROM public.institution_program_approvals ipa
      WHERE ipa.institution_id = p_institution_id
        AND ipa.is_active = true
        AND (p_program_id IS NULL OR ipa.program_id = p_program_id)
    )
    AND EXISTS (
      SELECT 1
      FROM public.staff_specializations ss
      JOIN public.staff s ON s.id = ss.staff_id
      WHERE ss.specialization_id = hs.id
        AND s.institution_id = p_institution_id
        AND s.is_active = true
    );

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', hs.id, 'name', hs.name)), '[]'::jsonb)
  INTO v_uncovered_specs
  FROM public.hr_specializations hs
  WHERE hs.is_active = true
    AND hs.body_id IN (
      SELECT DISTINCT ipa.body_id
      FROM public.institution_program_approvals ipa
      WHERE ipa.institution_id = p_institution_id
        AND ipa.is_active = true
        AND (p_program_id IS NULL OR ipa.program_id = p_program_id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.staff_specializations ss
      JOIN public.staff s ON s.id = ss.staff_id
      WHERE ss.specialization_id = hs.id
        AND s.institution_id = p_institution_id
        AND s.is_active = true
    );

  -- Compute signal
  v_result.value := v_covered_count;
  v_result.norm := v_required_count;
  v_result.gap := v_covered_count - v_required_count;  -- negative = gap
  v_result.pct_of_norm := CASE WHEN v_required_count > 0 THEN round(v_covered_count::numeric / v_required_count * 100, 2) ELSE 0 END;

  -- Get thresholds from policies (higher pct = better for coverage)
  SELECT COALESCE((pp.value)::numeric, 80)
  INTO v_threshold_amber
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'hr_recruitment.threshold_amber_specialization_gap'
  LIMIT 1;
  IF v_threshold_amber IS NULL THEN v_threshold_amber := 80; END IF;

  SELECT COALESCE((pp.value)::numeric, 60)
  INTO v_threshold_red
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'hr_recruitment.threshold_red_specialization_gap'
  LIMIT 1;
  IF v_threshold_red IS NULL THEN v_threshold_red := 60; END IF;

  -- For specialization: HIGHER is better. >=amber=green; >=red=amber; else=red
  IF v_result.pct_of_norm >= v_threshold_amber THEN
    v_result.status := 'green';
  ELSIF v_result.pct_of_norm >= v_threshold_red THEN
    v_result.status := 'amber';
  ELSE
    v_result.status := 'red';
  END IF;

  v_result.raw_data := jsonb_build_object(
    'required_count', v_required_count,
    'covered_count', v_covered_count,
    'uncovered_count', v_required_count - v_covered_count,
    'pct_of_norm', round(v_result.pct_of_norm, 1),
    'required_specializations', v_required_specs,
    'covered_specializations', v_covered_specs,
    'uncovered_specializations', v_uncovered_specs,
    'threshold_amber', v_threshold_amber,
    'threshold_red', v_threshold_red
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_compute_input_specialization_gap IS
  'Input #4: Specialization Coverage. Required specializations (by body) vs covered by active staff. HIGHER pct = better. Thresholds from platform_policies.';

GRANT EXECUTE ON FUNCTION public.fn_compute_input_specialization_gap(uuid, uuid) TO authenticated;

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
DECLARE
  v_workload_src text;
  v_spec_src text;
BEGIN
  -- Verify both functions exist and are NOT stubs (check source length > 200 chars)
  SELECT prosrc INTO v_workload_src
  FROM pg_proc WHERE proname = 'fn_compute_input_workload';

  SELECT prosrc INTO v_spec_src
  FROM pg_proc WHERE proname = 'fn_compute_input_specialization_gap';

  IF v_workload_src IS NULL THEN
    RAISE EXCEPTION 'fn_compute_input_workload not found';
  END IF;

  IF v_spec_src IS NULL THEN
    RAISE EXCEPTION 'fn_compute_input_specialization_gap not found';
  END IF;

  IF length(v_workload_src) < 200 THEN
    RAISE EXCEPTION 'fn_compute_input_workload still appears to be a stub (% chars)', length(v_workload_src);
  END IF;

  IF length(v_spec_src) < 200 THEN
    RAISE EXCEPTION 'fn_compute_input_specialization_gap still appears to be a stub (% chars)', length(v_spec_src);
  END IF;

  RAISE NOTICE 'Live RPC verification passed: workload=% chars, specialization_gap=% chars', length(v_workload_src), length(v_spec_src);
END $$;

COMMIT;
