-- ============================================================================
-- Fresher Induction — Phase 2a: attendance (coordinator roster marking + rollup)
-- File: 20260627190000_induction_phase2a_attendance.sql  | Date: 2026-06-27
-- Spec: specs/induction-program-module-2026-06-27.md (decision 5 + completion 9)
-- Adds 3 DEFINER + anon-revoked RPCs:
--   roster (enrolled learners for a session's batch + current mark),
--   mark (bulk upsert present/absent/excused/od), recompute (induction_completion).
-- Completion rule (decision 9, 75%): attended = present + od (OD = official duty,
--   not penalised); excused/absent do not count as attended. pct = attended/total.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. recompute completion for an induction (set-based, all enrolled learners).
--    Gated (writes induction_completion). Called by mark + standalone refresh.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_recompute_completion(p_event_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID; v_thr INTEGER; v_n INTEGER;
BEGIN
  SELECT institution_id, completion_attendance_pct INTO v_inst, v_thr
  FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_recompute_completion: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_recompute_completion: not authorized';
  END IF;

  WITH agg AS (
    SELECT e.learner_id, e.institution_id,
           count(s.id) AS total,
           count(a.id) FILTER (WHERE a.status IN ('present','od')) AS attended
    FROM public.induction_enrollment e
    LEFT JOIN public.event_sessions s
      ON s.event_id = e.event_id AND (s.batch_id IS NULL OR s.batch_id = e.batch_id)
    LEFT JOIN public.event_session_attendance a
      ON a.session_id = s.id AND a.learner_id = e.learner_id
    WHERE e.event_id = p_event_id
    GROUP BY e.learner_id, e.institution_id
  )
  INSERT INTO public.induction_completion
    (event_id, learner_id, institution_id, sessions_total, sessions_attended,
     attendance_pct, participation_complete, updated_at)
  SELECT p_event_id, agg.learner_id, agg.institution_id, agg.total, agg.attended,
         CASE WHEN agg.total = 0 THEN 0 ELSE round(100.0 * agg.attended / agg.total, 2) END,
         agg.total > 0 AND (CASE WHEN agg.total = 0 THEN 0 ELSE 100.0 * agg.attended / agg.total END) >= v_thr,
         now()
  FROM agg
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    sessions_total = EXCLUDED.sessions_total,
    sessions_attended = EXCLUDED.sessions_attended,
    attendance_pct = EXCLUDED.attendance_pct,
    participation_complete = EXCLUDED.participation_complete,
    updated_at = now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_recompute_completion(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_recompute_completion(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. roster for a session — enrolled learners for the session's batch (or all,
--    if combined) + their current mark. Coordinator-only.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_session_roster(p_session_id UUID)
RETURNS TABLE (
  learner_id      UUID,
  name            TEXT,
  register_number TEXT,
  batch_label     TEXT,
  status          TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_event UUID; v_batch UUID; v_inst UUID;
BEGIN
  SELECT s.event_id, s.batch_id INTO v_event, v_batch FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_session_roster: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_session_roster: not an induction session'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_session_roster: not authorized';
  END IF;

  RETURN QUERY
  SELECT e.learner_id::uuid,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         b.label::text,
         a.status::text
  FROM public.induction_enrollment e
  JOIN public.learners_profiles lp ON lp.id = e.learner_id
  LEFT JOIN public.induction_batches b ON b.id = e.batch_id
  LEFT JOIN public.event_session_attendance a ON a.session_id = p_session_id AND a.learner_id = e.learner_id
  WHERE e.event_id = v_event
    AND (v_batch IS NULL OR e.batch_id = v_batch)
  ORDER BY 2;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_roster(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_roster(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. mark attendance — bulk upsert [{learner_id, status}], then recompute.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_mark_attendance(p_session_id UUID, p_marks JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_event UUID; v_inst UUID; v_n INTEGER;
BEGIN
  SELECT s.event_id INTO v_event FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_mark_attendance: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_mark_attendance: not an induction session'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_mark_attendance: not authorized';
  END IF;

  INSERT INTO public.event_session_attendance
    (session_id, learner_id, institution_id, status, marked_by, marked_at)
  SELECT p_session_id, (m->>'learner_id')::uuid, v_inst, (m->>'status'), auth.uid(), now()
  FROM jsonb_array_elements(p_marks) m
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = now(), updated_at = now();
  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM public.fn_induction_recompute_completion(v_event);
  RETURN v_n;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_mark_attendance(UUID, JSONB) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_mark_attendance(UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
