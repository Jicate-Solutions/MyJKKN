-- Migration: Session Feedback — Faculty Completion Lane (A) + gate-mode policy seeds (B-ready)
-- Date: 2026-06-17
-- Spec: specs/session-feedback-faculty-completion-lane-2026-06-17.md
-- Builds on: 20260615233000_session_feedback_substrate.sql
-- INVARIANT: never mutate student_attendance.attendance_data — everything here is DERIVED.
--
-- Adds:
--   fn_scf_faculty_completion(from,to)      -- coverage (confirmed/present %) per faculty session
--   fn_scf_faculty_pending_roster(d,tt,pid) -- WHO hasn't submitted (identity ONLY, never content)
--   platform_policies seeds: session_feedback.gate_mode | .window_hours

-- ============================================================================
-- 1) Faculty completion (coverage) per session — matched on assigned_faculty email
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_scf_faculty_completion(p_from date, p_to date)
RETURNS TABLE (
  attendance_date date, timetable_id uuid, period_id text,
  course_code text, course_name text,
  present_count int, confirmed_count int, pending_count int,
  completion_pct numeric, within_window boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_faculty_completion: not authenticated'; END IF;
  SELECT lower(p.email) INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH sess AS (
    SELECT sa.institution_id, sa.attendance_date, sa.timetable_id,
           period.key AS period_id, period.value AS pv
    FROM public.student_attendance sa, jsonb_each(sa.attendance_data) AS period
    WHERE sa.attendance_date BETWEEN p_from AND p_to
      AND lower(period.value -> 'assigned_faculty' ->> 'faculty_email') = v_email
  ),
  counted AS (
    SELECT s.institution_id, s.attendance_date, s.timetable_id, s.period_id, s.pv,
      (SELECT count(*) FROM jsonb_array_elements(s.pv -> 'students') st
        WHERE st ->> 'status' = 'Present')::int AS present_count,
      (SELECT count(*) FROM jsonb_array_elements(s.pv -> 'students') st
        WHERE st ->> 'status' = 'Present'
          AND EXISTS (
            SELECT 1 FROM public.session_feedback f
            WHERE f.student_id = (st ->> 'student_id')::uuid
              AND f.attendance_date = s.attendance_date
              AND f.period_id = s.period_id))::int AS confirmed_count
    FROM sess s
  )
  SELECT c.attendance_date, c.timetable_id, c.period_id,
         c.pv ->> 'course_code', c.pv ->> 'course_name',
         c.present_count, c.confirmed_count,
         (c.present_count - c.confirmed_count),
         CASE WHEN c.present_count = 0 THEN 0
              ELSE round((c.confirmed_count::numeric / c.present_count) * 100, 0) END,
         (now() <= c.attendance_date::timestamptz
            + make_interval(hours => public.fn_get_policy_int('session_feedback.window_hours', 48, c.institution_id)))
  FROM counted c
  WHERE c.present_count > 0
  ORDER BY c.attendance_date DESC, c.pv ->> 'start_time';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_faculty_completion(date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_faculty_completion(date,date) TO authenticated;

-- ============================================================================
-- 2) Pending roster — WHO hasn't submitted. Identity ONLY; NEVER touches feedback content.
--    Authorized to the assigned faculty for that exact session.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_scf_faculty_pending_roster(
  p_attendance_date date, p_timetable_id uuid, p_period_id text
)
RETURNS TABLE (student_name text, register_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_email text; v_pv jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_faculty_pending_roster: not authenticated'; END IF;
  SELECT lower(p.email) INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RAISE EXCEPTION 'fn_scf_faculty_pending_roster: no profile'; END IF;

  SELECT sa.attendance_data -> p_period_id INTO v_pv
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id
    AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  LIMIT 1;

  IF v_pv IS NULL THEN RAISE EXCEPTION 'fn_scf_faculty_pending_roster: no such session'; END IF;

  -- Caller MUST be the assigned faculty for this session.
  IF lower(v_pv -> 'assigned_faculty' ->> 'faculty_email') IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'fn_scf_faculty_pending_roster: not the assigned faculty';
  END IF;

  -- Present students with NO feedback row. Returns identity only — no understood/checklist/free_text.
  RETURN QUERY
  SELECT NULLIF(trim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')), '') AS student_name,
         coalesce(lp.register_number, lp.roll_number) AS register_number
  FROM jsonb_array_elements(v_pv -> 'students') st
  JOIN public.learners_profiles lp ON lp.id = (st ->> 'student_id')::uuid
  WHERE st ->> 'status' = 'Present'
    AND NOT EXISTS (
      SELECT 1 FROM public.session_feedback f
      WHERE f.student_id = (st ->> 'student_id')::uuid
        AND f.attendance_date = p_attendance_date
        AND f.period_id = p_period_id)
  ORDER BY student_name NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_faculty_pending_roster(date,uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_faculty_pending_roster(date,uuid,text) TO authenticated;

-- ============================================================================
-- 3) Gate-mode policy seeds (B-ready; default = visibility). Read via fn_get_policy_*.
--    Idempotent (NOT EXISTS guard — no assumption about a unique constraint name).
-- ============================================================================
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, data_type, enum_options, description, classification, publication_state, is_system, is_active, ui_category)
SELECT 'session_feedback.gate_mode', 'global', NULL, to_jsonb('visibility'::text), 'string',
       to_jsonb(ARRAY['off','visibility','hard']),
       'Post-class feedback gate: off | visibility (show completion, non-blocking) | hard (session incomplete until 100%)',
       'major', 'published', true, true, 'Session Feedback'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'session_feedback.gate_mode' AND scope_type = 'global' AND scope_id IS NULL);

INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, data_type, enum_options, description, classification, publication_state, is_system, is_active, ui_category)
SELECT 'session_feedback.window_hours', 'global', NULL, to_jsonb(48), 'number', NULL,
       'Hours after a class within which feedback is due (completion window + hard-gate escalation)',
       'operational', 'published', true, true, 'Session Feedback'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'session_feedback.window_hours' AND scope_type = 'global' AND scope_id IS NULL);

NOTIFY pgrst, 'reload schema';
