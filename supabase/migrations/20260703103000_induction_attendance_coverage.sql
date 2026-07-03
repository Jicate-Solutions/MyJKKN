-- 2026-07-03: Attendance-coverage read RPC for the induction coordinators' nudge.
-- Why: the live "Fresher Induction 2026" reached day 9 with ZERO attendance marks
-- while completion requires >=75% attendance — so every fresher was on track to
-- fail completion by construction. The sessions page needs a per-day
-- "past sessions vs marked sessions" summary so coordinators see exactly which
-- past days still need back-marking (the Day-attendance bulk dialog makes each
-- day a one-minute pass).
-- Read-only + additive. Access gate mirrors fn_induction_day_roster exactly
-- (super/admin OR induction.view+institution OR per-event coordinator).

CREATE OR REPLACE FUNCTION public.fn_induction_attendance_coverage(p_event_id uuid)
RETURNS TABLE(day_number integer, past_sessions integer, marked_sessions integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_attendance_coverage: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_attendance_coverage: not authorized';
  END IF;

  RETURN QUERY
  -- day_number is nullable (NULL = the "Unscheduled" bucket the UI shows as day 0).
  -- Every column reference is table-qualified: the OUT params share names with the
  -- selected columns and an unqualified ref is a 42702 ambiguous-column at runtime.
  SELECT s.day_number::int,
         (count(*) FILTER (WHERE s.start_at < now()))::int AS past_sessions,
         (count(*) FILTER (WHERE s.start_at < now()
                           AND EXISTS (SELECT 1 FROM public.event_session_attendance a
                                       WHERE a.session_id = s.id)))::int AS marked_sessions
  FROM public.event_sessions s
  WHERE s.event_id = p_event_id
  GROUP BY s.day_number
  ORDER BY s.day_number NULLS FIRST;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_attendance_coverage(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_attendance_coverage(uuid) TO authenticated;
