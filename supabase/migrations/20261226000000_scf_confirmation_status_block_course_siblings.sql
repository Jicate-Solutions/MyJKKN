-- =====================================================================
-- SCF: the confirmed-with-feedback count now recognises sibling periods
-- of a block-scheduled course
-- Updated: 2026-09-17 (BUG-004651, BUG-004690, BUG-004707, BUG-004728,
--   BUG-004741, BUG-005120, BUG-005178, BUG-005491; clusters 3149b52f,
--   0961c22e)
--
-- DEFECT: both learner-facing confirmation readers match a learner's
-- feedback to an attended period on the EXACT (attendance_date,
-- period_id, timetable_id) triple. fn_scf_pending_for_learner has, since
-- 20260718200000, consolidated sibling periods of a block-scheduled
-- course by course_id, so it OFFERS a learner exactly one feedback per
-- course per day. The siblings it deliberately withholds were then
-- counted as never confirmed. Eight reports from two learners say the
-- same thing in their own words: "I have already submitted my feedback
-- ... however the app is still showing Not Yet Confirmed."
--
-- FIX: one feedback row for (student_id, attendance_date, course_id)
-- confirms every sibling period of that course that day in that
-- timetable. The two rules the Director set on this family are carried
-- unchanged on BOTH branches: same timetable (2026-07-31 aligned tick
-- rule) and submitted within session_feedback.window_hours of the class
-- day at IST midnight (decision #11). Measured on production: keeping
-- the timetable requirement costs nothing (identical counts to the
-- timetable-free pending-list rule for both reporters) and keeping the
-- window costs one session.
--
-- Signature, return shape, security, search_path and every other rule
-- (own-college scope, inlined roster with the 22P02 regex guard, outage
-- days, approved leave/OD) are VERBATIM from the live definitions read
-- with pg_get_functiondef on 2026-09-17.
--
-- NOT CHANGED here, and they carry the same exact-period rule:
-- fn_scf_effective_attendance (the enforcing number -
-- session_feedback.attendance_coupling_enabled is true and gate_mode is
-- 'hard' globally), fn_scf_confirmation_rollup (period-only) and
-- fn_scf_faculty_completion. Until they are aligned a learner's own card
-- reads higher than the gate computes. That is a deliberate hold, not an
-- oversight: widening it relaxes a live hard gate institution-wide.
-- =====================================================================

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
           -- Block-course consolidation (2026-09-17, BUG-004651/690/707/728/741,
           -- BUG-005120/005178/005491): feedback for ANY period of the SAME course
           -- on the same day in the same timetable also confirms its sibling
           -- periods. Same rule fn_scf_pending_for_learner has used since
           -- 20260718200000 - a learner gives ONE feedback per class, and the
           -- pending list only ever OFFERS one, so the siblings it withholds must
           -- not be counted unconfirmed. Single-period courses are unchanged
           -- (course match is the period match); a period with no course_id keeps
           -- the exact-period behaviour. The timetable and window requirements of
           -- the 2026-07-31 aligned tick rule are carried on BOTH branches.
           SELECT 1 FROM public.session_feedback f
           WHERE f.student_id = v_lp AND f.attendance_date = sa.attendance_date
             AND f.timetable_id = sa.timetable_id
             AND (
               f.period_id = period.key
               OR (NULLIF(period.value ->> 'course_id','') IS NOT NULL
                   AND f.course_id = NULLIF(period.value ->> 'course_id','')::uuid)
             )
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

CREATE OR REPLACE FUNCTION public.fn_scf_my_confirmed_attendance(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS TABLE(present_marks bigint, absent_marks bigint, confirmed_present bigint, total_marks bigint, official_pct numeric, confirmed_pct numeric, enforcement_start date, gate_mode text, pass_line numeric, min_marks integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
AS $function$
DECLARE v_lp uuid; v_inst uuid; v_start date; v_from date; v_to date; v_window_hours integer;
BEGIN
  -- Self-scoped learner view of their OWN confirmed-attendance % (transparency,
  -- Director decision #7). Mirrors fn_scf_effective_attendance's math for ONE learner,
  -- forward-only from enforcement_start. NOT gated on attendance_coupling_enabled:
  -- a learner may always see their own number; the UI decides messaging by gate_mode.
  -- Never touches attendance_data.
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_my_confirmed_attendance: not authenticated'; END IF;
  SELECT lp.id, lp.institution_id INTO v_lp, v_inst
    FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  v_start := COALESCE(NULLIF(public.fn_get_policy_text('session_feedback.enforcement_start_date','2026-07-05', v_inst),'')::date, '2026-07-05'::date);
  v_to := COALESCE(p_to, current_date);
  v_from := GREATEST(COALESCE(p_from, v_start), v_start);   -- forward-only floor
  -- Late-feedback window (decision #11): reuse the shared session_feedback.window_hours
  -- lever (default 48) so "within window" is one concept across all three fns.
  v_window_hours := public.fn_get_policy_int('session_feedback.window_hours', 48, v_inst);

  RETURN QUERY
  WITH marks AS (
    SELECT sa.attendance_date, sa.timetable_id AS ttid, period.key AS pid,
           NULLIF(period.value ->> 'course_id','')::uuid AS cid, (st ->> 'status') AS status
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(sa.attendance_data)='object' THEN sa.attendance_data ELSE '{}'::jsonb END) AS period
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(period.value -> 'students')='array' THEN period.value -> 'students' ELSE '[]'::jsonb END) AS st
    WHERE sa.attendance_date BETWEEN v_from AND v_to
      AND public.fn_attendance_student_ids(sa.attendance_data) @> ARRAY[v_lp]
      AND (st ->> 'student_id') = v_lp::text
      AND (st ->> 'status') IN ('Present','Absent')
      -- Decision #10 (outage): drop marks on a declared feedback-outage window from BOTH
      -- present and absent, so the learner is never penalised for a system-down day.
      AND NOT EXISTS (
        SELECT 1 FROM public.scf_outage_days o
        WHERE o.outage_date = sa.attendance_date
          AND (o.institution_id IS NULL OR o.institution_id = sa.institution_id)
          AND (o.period_id      IS NULL OR o.period_id      = period.key))
      -- Decision #12 (approved leave/OD): drop marks with an approved OD/leave adjustment
      -- from BOTH sides, so an excused absence never hurts the confirmed %.
      AND NOT EXISTS (
        SELECT 1 FROM public.leave_onduty_attendance_updates lou
        WHERE lou.attendance_record_id = sa.id
          AND lou.student_id           = v_lp
          AND lou.period_slot_id       = period.key)
  ),
  dedup AS (
    SELECT DISTINCT ON (attendance_date, ttid, pid) attendance_date, ttid, pid, cid, status
    FROM marks ORDER BY attendance_date, ttid, pid, (status='Present') DESC
  ),
  agg AS (
    SELECT
      count(*) FILTER (WHERE d.status='Present') AS pm,
      count(*) FILTER (WHERE d.status='Absent')  AS am,
      count(*) FILTER (WHERE d.status='Present' AND EXISTS (
        -- Block-course consolidation (2026-09-17, same rule and same reason as
        -- fn_scf_confirmation_status above and fn_scf_pending_for_learner since
        -- 20260718200000): one feedback row confirms every sibling period of that
        -- course on that day in that timetable. This is the number all five
        -- reports of cluster 3149b52f and 0961c22e screenshotted.
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id = v_lp AND f.attendance_date = d.attendance_date
          AND f.timetable_id = d.ttid
          AND (f.period_id = d.pid
               OR (d.cid IS NOT NULL AND f.course_id = d.cid))
          -- Decision #11: only feedback submitted within window_hours of the class
          -- (class day interpreted at IST midnight) confirms attendance.
          AND f.created_at <= ((d.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
                               + make_interval(hours => v_window_hours)))) AS cp
    FROM dedup d
  )
  SELECT a.pm::bigint, a.am::bigint, a.cp::bigint, (a.pm + a.am)::bigint,
    CASE WHEN (a.pm+a.am)=0 THEN 0 ELSE round(a.pm::numeric/(a.pm+a.am)*100,2) END,
    CASE WHEN (a.pm+a.am)=0 THEN 0 ELSE round(a.cp::numeric/(a.pm+a.am)*100,2) END,
    v_start,
    public.fn_get_policy_text('session_feedback.gate_mode','visibility', v_inst),
    75::numeric, 10
  FROM agg a;
END;
$function$;
