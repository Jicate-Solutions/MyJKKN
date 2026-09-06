-- ============================================================================
-- Rebuild the 31 July attendance prefilter — properly this time.
-- ============================================================================
-- WHY THIS FILE EXISTS AT ALL
--   On 2026-07-31 this optimisation was applied STRAIGHT TO PRODUCTION with no
--   migration and no commit. Its rollback was then applied only partially,
--   leaving fn_scf_my_confirmed_attendance calling a helper that had been
--   dropped. Every learner's attendance percentage failed from 31 July until
--   10 August — ten days — because the failure was instant and nothing looked
--   slow. Repaired 2026-08-10 by restoring the pre-optimisation body.
--
--   The optimisation itself was sound; only the way it was shipped was not.
--   This migration re-creates it as a RECORDED change so it can never vanish
--   silently again. The original definitions were unrecoverable (they existed
--   nowhere in git), so they are re-derived from the call site preserved in the
--   broken function body.
--
-- ORDER MATTERS (the original rollback file said so, and that warning is what
-- got ignored): helper first, then the index that calls it, then the prefilter
-- that uses both. Reversing this order is exactly how the outage happened.
--
-- SAFETY: the prefilter is STRICTLY WEAKER than the equality test it precedes —
-- it is a superset containment check, so every row that would pass the real
-- test still reaches it. It can narrow work; it cannot change an answer.
-- ============================================================================

-- 1. The helper. Must be IMMUTABLE to be indexable, and is: it reads only its
--    argument. PARALLEL SAFE for the same reason.
CREATE OR REPLACE FUNCTION public.fn_attendance_student_ids(p_doc jsonb)
RETURNS uuid[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(array_agg(DISTINCT (s ->> 'student_id')::uuid), '{}'::uuid[])
  FROM jsonb_each(p_doc) AS per,
       jsonb_array_elements(per.value -> 'students') AS s
  WHERE jsonb_typeof(per.value -> 'students') = 'array'
    AND (s ->> 'student_id') IS NOT NULL
    AND (s ->> 'student_id') ~ '^[0-9a-fA-F-]{36}$';
$$;

COMMENT ON FUNCTION public.fn_attendance_student_ids(jsonb) IS
  'Every learner id inside an attendance_data document, as an array. Exists to back the GIN index idx_student_attendance_student_ids, which lets a learner-scoped attendance query skip documents that cannot contain them. Superset by construction: used only as a strictly-weaker prefilter ahead of an exact student_id test, so it can never change a result. Re-created 2026-08-10 as a recorded migration after the original was applied out-of-band on 2026-07-31 and lost.';

REVOKE EXECUTE ON FUNCTION public.fn_attendance_student_ids(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_attendance_student_ids(jsonb) TO authenticated, service_role;

-- 2. The index that uses it.
CREATE INDEX IF NOT EXISTS idx_student_attendance_student_ids
  ON public.student_attendance
  USING GIN (public.fn_attendance_student_ids(attendance_data));

COMMENT ON INDEX public.idx_student_attendance_student_ids IS
  'Backs the learner-scoped prefilter in fn_scf_my_confirmed_attendance. Drop this only together with the prefilter that uses it — dropping one without the other is what caused the 31 Jul - 10 Aug outage.';

-- ci:allow-secdef-authenticated  fn_scf_my_confirmed_attendance is self-scoped: it
--   takes only two date arguments, derives the learner solely from auth.uid() via
--   learners_profiles.profile_id, and RETURNs empty when that lookup finds nothing.
--   There is no argument by which one caller can name another person, so "callable by
--   every authenticated user" means "every learner may read their OWN attendance %" --
--   which is the point of the function (transparency, Director decision #7).
--   Verified behaviourally on production 2026-08-21, not merely asserted: an
--   authenticated NON-learner profile calling it returned 0 rows, and
--   pg_get_function_identity_arguments reports exactly "p_from date, p_to date".
--   Narrowing the grant would break the live learner-facing page; an is_super_admin()
--   style check would be wrong, since learners are the intended callers.
--   NOTE: this shape is pre-existing -- the function has been SECURITY DEFINER and
--   granted to authenticated since 20260705120200. This migration changes only its
--   body (adding the prefilter); it introduces no new exposure.

-- 3. Re-add the prefilter to the calculation that uses it. LAST, per the
--    ordering warning above — the helper and index must exist first.
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
    SELECT sa.attendance_date, sa.timetable_id AS ttid, period.key AS pid, (st ->> 'status') AS status
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
    SELECT DISTINCT ON (attendance_date, ttid, pid) attendance_date, ttid, pid, status
    FROM marks ORDER BY attendance_date, ttid, pid, (status='Present') DESC
  ),
  agg AS (
    SELECT
      count(*) FILTER (WHERE d.status='Present') AS pm,
      count(*) FILTER (WHERE d.status='Absent')  AS am,
      count(*) FILTER (WHERE d.status='Present' AND EXISTS (
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id = v_lp AND f.attendance_date = d.attendance_date
          AND f.period_id = d.pid AND f.timetable_id = d.ttid
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
$function$
;

-- Grants restated (CREATE OR REPLACE preserves them, but state them anyway so
-- this file is self-describing to whoever reads it next).
REVOKE EXECUTE ON FUNCTION public.fn_scf_my_confirmed_attendance(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_scf_my_confirmed_attendance(date, date) TO authenticated, service_role;
