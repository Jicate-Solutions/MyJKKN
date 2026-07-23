-- Migration: 2026-06-07 22:00 IST
-- Purpose:
--   Phase 2C of ARPS. Adds the RPCs that support the action_log page —
--   manual lever-pull entry by Director, listing existing entries per
--   cycle, and outcome capture for entries that are 14+ days past trigger.
--
-- Director's Section 6 Q2 answer was "auto-detect from existing data +
-- Director confirm" — this phase ships the MANUAL Director-initiated entry
-- path. Auto-detection of scholarship awards / counselor reassignments /
-- WhatsApp campaign sends is deferred to a later phase (each detector
-- needs careful per-source design).
--
-- 3 RPCs:
--   fn_arps_log_director_action — Director-initiated entry, auto-snapshots
--     current fill/pace context from fn_arps_pace_status, director_confirmed=true
--   fn_arps_list_action_log — paginated list for the action_log page,
--     filter by cycle_year + optional institution_id
--   fn_arps_capture_outcomes — runs on demand or cron, fills outcome_*
--     fields for entries where triggered_at is 14+ days old and outcome
--     not yet captured

-- ═══════════════════════════════════════════════════════════════════════════
-- WRITE: fn_arps_log_director_action
-- ═══════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.fn_arps_log_director_action(uuid, uuid, int, int, text, text, numeric, uuid[], text);

CREATE OR REPLACE FUNCTION public.fn_arps_log_director_action(
  p_institution_id uuid,
  p_program_id uuid DEFAULT NULL,
  p_cycle_year int DEFAULT NULL,
  p_lever_tier int DEFAULT NULL,
  p_lever_type text DEFAULT NULL,
  p_lever_magnitude_text text DEFAULT NULL,
  p_lever_magnitude_numeric numeric DEFAULT NULL,
  p_target_program_ids uuid[] DEFAULT NULL,
  p_decision_reasoning text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_caller uuid;
  v_today date := CURRENT_DATE;
  v_cycle_year int;
  v_day_n int;
  v_pace_row record;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_cycle_year := COALESCE(p_cycle_year, (
    SELECT MAX(ay.year) FROM admission_years ay WHERE ay.is_active = true
  ));
  IF v_cycle_year IS NULL THEN
    RAISE EXCEPTION 'no active cycle year';
  END IF;

  v_day_n := GREATEST(0, (v_today - make_date(v_cycle_year, 4, 1))::int);

  -- Auto-snapshot trigger context from current pace status
  SELECT
    out_actual_fill_pct AS fill_pct,
    out_expected_fill_pct AS expected_pct,
    out_gap_pp AS gap_pp
  INTO v_pace_row
  FROM public.fn_arps_pace_status(p_institution_id);

  IF p_lever_tier IS NOT NULL AND (p_lever_tier < 1 OR p_lever_tier > 4) THEN
    RAISE EXCEPTION 'lever_tier must be 1-4';
  END IF;

  INSERT INTO public.admission_action_log
    (triggered_at, institution_id, program_id, cycle_year, trigger_day_n,
     trigger_fill_pct, trigger_expected_pct, trigger_gap_pp,
     lever_tier, lever_type, lever_magnitude_text, lever_magnitude_numeric,
     target_program_ids, decided_by, decision_reasoning, auto_detected,
     director_confirmed, director_confirmed_at, director_confirmed_by)
  VALUES
    (now(), p_institution_id, p_program_id, v_cycle_year, v_day_n,
     v_pace_row.fill_pct, v_pace_row.expected_pct, v_pace_row.gap_pp,
     p_lever_tier, p_lever_type, p_lever_magnitude_text, p_lever_magnitude_numeric,
     p_target_program_ids, v_caller, p_decision_reasoning, false,
     true, now(), v_caller)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_arps_log_director_action(uuid, uuid, int, int, text, text, numeric, uuid[], text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_arps_log_director_action(uuid, uuid, int, int, text, text, numeric, uuid[], text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- READ: fn_arps_list_action_log
-- ═══════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.fn_arps_list_action_log(int, uuid, int, int);

CREATE OR REPLACE FUNCTION public.fn_arps_list_action_log(
  p_cycle_year int DEFAULT NULL,
  p_institution_id uuid DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  out_id uuid,
  out_triggered_at timestamptz,
  out_institution_id uuid,
  out_institution_name text,
  out_program_id uuid,
  out_program_name text,
  out_cycle_year int,
  out_trigger_day_n int,
  out_trigger_fill_pct numeric,
  out_trigger_expected_pct numeric,
  out_trigger_gap_pp numeric,
  out_lever_tier int,
  out_lever_type text,
  out_lever_magnitude_text text,
  out_decision_reasoning text,
  out_auto_detected boolean,
  out_director_confirmed boolean,
  out_outcome_captured_at timestamptz,
  out_outcome_fill_pct numeric,
  out_outcome_gap_pp_at_outcome numeric,
  out_outcome_pace_closed boolean,
  out_decided_by_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_year int;
BEGIN
  v_current_year := COALESCE(p_cycle_year, (
    SELECT MAX(ay.year) FROM admission_years ay WHERE ay.is_active = true
  ));

  RETURN QUERY
  SELECT
    al.id,
    al.triggered_at,
    al.institution_id,
    i.name::text,
    al.program_id,
    p.program_name::text,
    al.cycle_year,
    al.trigger_day_n,
    al.trigger_fill_pct,
    al.trigger_expected_pct,
    al.trigger_gap_pp,
    al.lever_tier,
    al.lever_type,
    al.lever_magnitude_text,
    al.decision_reasoning,
    al.auto_detected,
    al.director_confirmed,
    al.outcome_captured_at,
    al.outcome_fill_pct,
    al.outcome_gap_pp_at_outcome,
    al.outcome_pace_closed,
    prof.email::text
  FROM public.admission_action_log al
  LEFT JOIN public.institutions i ON i.id = al.institution_id
  LEFT JOIN public.programs p ON p.id = al.program_id
  LEFT JOIN public.profiles prof ON prof.id = al.decided_by
  WHERE al.cycle_year = v_current_year
    AND (p_institution_id IS NULL OR al.institution_id = p_institution_id)
  ORDER BY al.triggered_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_arps_list_action_log(int, uuid, int, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_arps_list_action_log(int, uuid, int, int) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- WRITE (idempotent): fn_arps_capture_outcomes
-- ═══════════════════════════════════════════════════════════════════════════
-- For all action_log entries where:
--   triggered_at + 14 days has passed
--   outcome_captured_at IS NULL
-- Compute the outcome: current fill_pct vs trigger_fill_pct, gap_pp now vs
-- trigger_gap_pp, did the gap NARROW (pace_closed = true).
--
-- Safe to call repeatedly; only updates rows that haven't been captured.

DROP FUNCTION IF EXISTS public.fn_arps_capture_outcomes();

CREATE OR REPLACE FUNCTION public.fn_arps_capture_outcomes()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_count int := 0;
  v_today date := CURRENT_DATE;
  rec record;
  v_pace_row record;
  v_admit_count int;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  FOR rec IN
    SELECT id, institution_id, cycle_year, trigger_day_n, trigger_gap_pp
    FROM public.admission_action_log
    WHERE outcome_captured_at IS NULL
      AND (now() - triggered_at) >= interval '14 days'
  LOOP
    SELECT
      out_actual_fill_pct AS fill_pct,
      out_gap_pp AS gap_pp,
      out_current_day_n AS day_n
    INTO v_pace_row
    FROM public.fn_arps_pace_status(rec.institution_id);

    SELECT COUNT(*)::int INTO v_admit_count
    FROM public.learners_profiles lp
    JOIN public.admission_years ay ON ay.id = lp.admission_year_id
    WHERE ay.institution_id = rec.institution_id
      AND ay.year = rec.cycle_year
      AND lp.lifecycle_status::text = ANY(public._yoy_admitted_lifecycle_set())
      AND lp.created_at >= (now() - interval '14 days');

    UPDATE public.admission_action_log
    SET outcome_captured_at = now(),
        outcome_day_n = v_pace_row.day_n,
        outcome_fill_pct = v_pace_row.fill_pct,
        outcome_gap_pp_at_outcome = v_pace_row.gap_pp,
        outcome_admits_between_trigger_and_outcome = v_admit_count,
        outcome_pace_closed = (
          rec.trigger_gap_pp IS NOT NULL
          AND v_pace_row.gap_pp IS NOT NULL
          AND v_pace_row.gap_pp > rec.trigger_gap_pp
        )
    WHERE id = rec.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_arps_capture_outcomes() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_arps_capture_outcomes() TO authenticated;

COMMENT ON FUNCTION public.fn_arps_log_director_action(uuid, uuid, int, int, text, text, numeric, uuid[], text) IS
  'ARPS Phase 2C: Director-initiated lever-pull entry. Auto-snapshots current pace context. director_confirmed=true.';

COMMENT ON FUNCTION public.fn_arps_list_action_log(int, uuid, int, int) IS
  'ARPS Phase 2C: list action_log entries filtered by cycle_year + optional institution. Joins institution name + program name + decided_by email.';

COMMENT ON FUNCTION public.fn_arps_capture_outcomes() IS
  'ARPS Phase 2C: capture outcome for action_log entries 14+ days post-trigger. Idempotent — only touches uncaptured rows. Director-locked 2026-06-07.';
