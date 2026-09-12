-- Updated: 2026-09-12 - fn_compute_input_peer_benchmark and fn_compute_input_sfr referenced
-- a lifecycle_status value ('enrolled') that is not in the enum, and peer_benchmark joined
-- institution_program_approvals.program_type, a column that does not exist. Both resolve at
-- runtime, so both applied green and failed only when called.
--
-- Defect A — invalid enum literal 'enrolled'
--   public.lifecycle_status has exactly: admitted, pending, approved, account, rejected,
--   waitlisted, active, inactive, exited, graduated, alumni, enquiry, enquiry_submitted,
--   reserved, withdrawal_pending. There is no 'enrolled'. learners_profiles.lifecycle_status
--   is that enum type (not text), so the literal must cast and raises
--     22P02: invalid input value for enum lifecycle_status: "enrolled"
--   fn_compute_input_peer_benchmark raises this on EVERY call today.
--   fn_compute_input_sfr is currently masked by its own early return (no SFR norm is
--   resolvable while institution_program_approvals is empty); it starts raising the moment
--   the first approvals row is imported.
--   Fix: drop the invalid literal. It was a redundant synonym — the remaining values already
--   express "currently studying". No other enum value is substituted.
--
-- Defect B — column that does not exist
--   institution_program_approvals has no program_type column (id, institution_id, program_id,
--   body_id, sanctioned_faculty_count, approved_intake, approval_date, renewal_due_date,
--   approval_reference, norm_version_at_approval, is_active, created_at, updated_at), so the
--   peer-type lookup raises 42703: column ipa.program_type does not exist.
--   The intent of that block is to collect the programme types this institution is approved to
--   run and filter peers on hr_peer_benchmarks.program_type. programs.program_type does exist,
--   so the type is now reached THROUGH programs via ipa.program_id. The
--   `p.program_type IS NOT NULL` guard is deliberate: most programs carry a NULL program_type,
--   and without it array_agg emits a NULL element that pollutes the program_types_searched
--   value reported in raw_data and inflates array_length.
--
-- Apart from those two corrections, both bodies are reproduced verbatim from their current
-- production definitions (pg_get_functiondef, 2026-09-12); the only other edits are comment
-- wording ("students" -> "learners", per house terminology). Signature, return type, language,
-- SECURITY DEFINER, search_path and every raw_data key ('students', 'student_count') are
-- unchanged — those keys are read by lib/services/hr/recruitment-need/signal-service.ts.
--
-- ci:allow-secdef-authenticated Pre-existing HR Intelligence signal-input readers, granted to
-- authenticated since 20260525100000/20260526020000; this migration only corrects two runtime
-- defects in their bodies and re-asserts the grants they already hold. They read aggregate
-- counts for a caller-supplied institution and add no new exposure. Restricting who may call
-- them is a separate, deliberate change (see PR #3388, HR institution-scope gates).

-- ============================================================================
-- Input #2: Student-Faculty Ratio vs. Regulatory Floor
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_compute_input_sfr(
  p_institution_id uuid,
  p_program_id uuid DEFAULT NULL
)
RETURNS public.hr_signal_input_result
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
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
$$;

-- ============================================================================
-- Input #7: Peer Benchmark
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_compute_input_peer_benchmark(
  p_institution_id uuid,
  p_program_id uuid DEFAULT NULL
)
RETURNS public.hr_signal_input_result
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
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

  -- 1. Count active learners at this institution
  -- FIX (Defect A): 'enrolled' removed — not a label of the lifecycle_status enum.
  SELECT COALESCE(COUNT(*), 0)
  INTO v_student_count
  FROM public.learners_profiles lp
  WHERE lp.institution_id = p_institution_id
    AND lp.lifecycle_status IN ('active')
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

  -- JKKN actual SFR = learners / faculty
  v_jkkn_sfr := round(v_student_count::numeric / v_faculty_count, 2);

  -- 2. Determine program types from institution_program_approvals for filtering peers
  -- FIX (Defect B): institution_program_approvals has no program_type column; the type is
  -- reached through programs via ipa.program_id. NULL program_types are excluded so they
  -- cannot enter the array and distort program_types_searched / array_length.
  SELECT COALESCE(array_agg(DISTINCT p.program_type), ARRAY[]::text[])
  INTO v_program_types
  FROM public.institution_program_approvals ipa
  JOIN public.programs p            ON p.id = ipa.program_id
  JOIN public.hr_regulatory_norms n ON n.body_id = ipa.body_id AND n.program_type = p.program_type
  WHERE ipa.institution_id = p_institution_id
    AND ipa.is_active = true
    AND p.program_type IS NOT NULL
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
  --    For SFR: lower is better (fewer learners per faculty)
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

  -- LOWER pct = worse (JKKN has more learners per faculty than peers)
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

-- ============================================================================
-- Grants — re-asserted for both functions.
-- REVOKE FROM PUBLIC alone is insufficient: Supabase's ALTER DEFAULT PRIVILEGES
-- gives anon a direct EXECUTE grant on every new function, separate from PUBLIC.
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.fn_compute_input_sfr(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_compute_input_sfr(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_compute_input_peer_benchmark(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_compute_input_peer_benchmark(uuid, uuid) TO authenticated;
