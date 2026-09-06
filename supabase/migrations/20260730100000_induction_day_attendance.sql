-- ============================================================================
-- Fresher Induction — Day-level attendance (bulk mark, fans out to sessions)
-- File: 20260730100000_induction_day_attendance.sql | Date: 2026-07-30
-- Adds 2 DEFINER + anon-revoked RPCs alongside the existing per-session ones
-- (fn_induction_session_roster / fn_induction_mark_attendance, phase 2a):
--   fn_induction_day_roster          — learners eligible for ANY session on a
--                                      day, + whether their existing per-session
--                                      marks for that day are uniform
--                                      (prefillable) or mixed (left blank).
--   fn_induction_mark_day_attendance — bulk-writes the SAME status into EVERY
--                                      session that day applicable to the
--                                      learner's batch, then recomputes
--                                      completion. Attendance storage stays
--                                      session-scoped; this is a marking-UX
--                                      convenience, not a new data model.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_day_roster(p_event_id UUID, p_day_number INTEGER)
RETURNS TABLE (
  learner_id      UUID,
  name            TEXT,
  register_number TEXT,
  batch_label     TEXT,
  status          TEXT,     -- the uniform status across the day's sessions, or NULL
  is_mixed        BOOLEAN   -- true when the learner's sessions that day carry DIFFERENT statuses
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_day_roster: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_day_roster: not authorized';
  END IF;

  RETURN QUERY
  WITH day_sessions AS (
    SELECT s.id, s.batch_id FROM public.event_sessions s
    -- day_number is nullable (NULL = the "Unscheduled" bucket the UI shows as
    -- day 0) — IS NOT DISTINCT FROM matches NULL rows a plain `=` would silently drop.
    WHERE s.event_id = p_event_id AND s.day_number IS NOT DISTINCT FROM p_day_number
  ),
  eligible AS (
    -- a learner is on the day roster if at least one of the day's sessions
    -- applies to their batch (combined batch_id IS NULL, or an exact match)
    SELECT DISTINCT e.learner_id
    FROM public.induction_enrollment e
    JOIN day_sessions ds ON ds.batch_id IS NULL OR ds.batch_id = e.batch_id
    WHERE e.event_id = p_event_id
  ),
  marks AS (
    SELECT a.learner_id,
           count(DISTINCT a.status) AS distinct_statuses,
           min(a.status) AS one_status
    FROM public.event_session_attendance a
    JOIN day_sessions ds ON ds.id = a.session_id
    GROUP BY a.learner_id
  )
  SELECT el.learner_id::uuid,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         b.label::text,
         CASE WHEN m.distinct_statuses = 1 THEN m.one_status ELSE NULL END::text,
         COALESCE(m.distinct_statuses, 0) > 1
  FROM eligible el
  JOIN public.learners_profiles lp ON lp.id = el.learner_id
  JOIN public.induction_enrollment ie ON ie.event_id = p_event_id AND ie.learner_id = el.learner_id
  LEFT JOIN public.induction_batches b ON b.id = ie.batch_id
  LEFT JOIN marks m ON m.learner_id = el.learner_id
  ORDER BY 2;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_day_roster(UUID, INTEGER) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_day_roster(UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_mark_day_attendance(p_event_id UUID, p_day_number INTEGER, p_marks JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_mark_day_attendance: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_mark_day_attendance: not authorized';
  END IF;

  WITH incoming AS (
    SELECT (m->>'learner_id')::uuid AS learner_id, (m->>'status') AS status
    FROM jsonb_array_elements(p_marks) m
  ),
  fanned AS (
    SELECT s.id AS session_id, i.learner_id, i.status
    FROM incoming i
    JOIN public.induction_enrollment ie ON ie.event_id = p_event_id AND ie.learner_id = i.learner_id
    JOIN public.event_sessions s
      ON s.event_id = p_event_id AND s.day_number IS NOT DISTINCT FROM p_day_number
     AND (s.batch_id IS NULL OR s.batch_id = ie.batch_id)
  )
  INSERT INTO public.event_session_attendance (session_id, learner_id, institution_id, status, marked_by, marked_at)
  SELECT session_id, learner_id, v_inst, status, auth.uid(), now() FROM fanned
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = now(), updated_at = now();

  PERFORM public.fn_induction_recompute_completion(p_event_id);
  RETURN jsonb_array_length(p_marks);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_mark_day_attendance(UUID, INTEGER, JSONB) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_mark_day_attendance(UUID, INTEGER, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
