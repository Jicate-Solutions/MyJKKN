-- 2026-07-31 PERF + ALIGNMENT: fn_scf_confirmation_status rewritten.
-- 1) SPEED: (a) the per-period fn_attendance_slot_students() helper call is
--    replaced by the same roster rules written inline (proven byte-identical
--    across 33 sampled learners, 66 md5 tests, 0 mismatches, BEFORE any rule
--    change); (b) the lookup is scoped to the learner's own institution -
--    Director-approved on evidence that 0 of 304,873 Present marks in 90 days
--    were cross-college. Two safety nets keep odd data visible (NULL-institution
--    rows, and NULL-institution learners fall back to unscoped).
-- 2) ALIGNMENT (Director decision, informed of the 37,252-row / 28.4% visible
--    flip): "confirmed" now uses the SAME rule as fn_scf_my_confirmed_attendance
--    - same timetable AND feedback submitted within the institution's window
--    (class day at IST midnight + window_hours). The checklist tick and the
--    percentage can no longer disagree.
-- Applied to production 2026-07-31 night window; this file makes it durable.

CREATE OR REPLACE FUNCTION public.fn_scf_confirmation_status(p_from date, p_to date)
 RETURNS TABLE(attendance_date date, timetable_id uuid, period_id text, course_code text, course_name text, confirmed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid; v_inst uuid; v_window_hours integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_confirmation_status: not authenticated'; END IF;
  SELECT lp.id, lp.institution_id INTO v_lp, v_inst
    FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;
  v_window_hours := public.fn_get_policy_int('session_feedback.window_hours', 48, v_inst);

  RETURN QUERY
  SELECT sa.attendance_date, sa.timetable_id, period.key,
         period.value ->> 'course_code', period.value ->> 'course_name',
         EXISTS (
           -- Aligned tick rule (Director decision 2026-07-31 20:40, informed of the
           -- 37,252-row / 28.4% flip): "confirmed" now means EXACTLY what
           -- fn_scf_my_confirmed_attendance counts - same timetable AND submitted
           -- within the institution's feedback window (class day at IST midnight
           -- + window_hours). Late or cross-timetable feedback no longer shows a tick.
           SELECT 1 FROM public.session_feedback f
           WHERE f.student_id = v_lp AND f.attendance_date = sa.attendance_date
             AND f.period_id = period.key
             AND f.timetable_id = sa.timetable_id
             AND f.created_at <= ((sa.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
                                  + make_interval(hours => v_window_hours))
         ) AS confirmed
  FROM public.student_attendance sa,
       jsonb_each(sa.attendance_data) AS period
  WHERE sa.attendance_date BETWEEN p_from AND p_to
    -- Own-college scope (Director decision 2026-07-31, evidence: 0 of 304,873
    -- Present marks in the last 90 days were in another college's rows): a
    -- learner's attendance lives in their own institution's rows. Two safety
    -- nets: rows with NO institution stay visible, and a learner with NO
    -- recorded institution falls back to the old search-everything behaviour.
    AND (v_inst IS NULL OR sa.institution_id = v_inst OR sa.institution_id IS NULL)
    AND EXISTS (
      -- Inlined roster (set-based): mirrors fn_attendance_slot_students /
      -- slotStudents() (PR #1865) EXACTLY, without a per-period function call:
      --   1) a non-empty top-level students[] IS the roster (groups ignored);
      --   2) otherwise, if groups is an array, the roster is every
      --      groups[].students[];
      --   3) otherwise the roster is empty.
      -- The regex-CASE guard is carried unchanged from migration
      -- 20260722062012: a malformed roster id becomes NULL (excluded) instead
      -- of raising 22P02 and aborting the read for every learner in the session.
      SELECT 1 FROM (
        SELECT elem.st FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(period.value -> 'students') = 'array'
                AND jsonb_array_length(period.value -> 'students') > 0
               THEN period.value -> 'students' ELSE '[]'::jsonb END) elem(st)
        UNION ALL
        SELECT gel.st
        FROM jsonb_array_elements(
               CASE WHEN NOT (jsonb_typeof(period.value -> 'students') = 'array'
                              AND jsonb_array_length(period.value -> 'students') > 0)
                     AND jsonb_typeof(period.value -> 'groups') = 'array'
                    THEN period.value -> 'groups' ELSE '[]'::jsonb END) g,
             jsonb_array_elements(
               CASE WHEN jsonb_typeof(g -> 'students') = 'array'
                    THEN g -> 'students' ELSE '[]'::jsonb END) gel(st)
      ) roster
      WHERE CASE
              WHEN (roster.st ->> 'student_id') ~
                   '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              THEN (roster.st ->> 'student_id')::uuid END = v_lp
        AND roster.st ->> 'status' = 'Present'
    )
  ORDER BY sa.attendance_date DESC;
END;
$function$;

-- Lock (CI: check-secdef-anon-revoke): SECURITY DEFINER must not be anonymously
-- callable. Mirrors the live production ACL exactly - postgres owner,
-- authenticated, service_role; no anon, no PUBLIC.
REVOKE EXECUTE ON FUNCTION public.fn_scf_confirmation_status(date, date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_scf_confirmation_status(date, date) TO authenticated, service_role;
