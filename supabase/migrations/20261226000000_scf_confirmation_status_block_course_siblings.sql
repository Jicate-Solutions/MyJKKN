-- =====================================================================
-- SCF: ONE predicate for "did this learner's feedback confirm this
-- mark?", and it is the rule the pending list already uses
-- Updated: 2026-09-17 (BUG-004651, BUG-004690, BUG-004707, BUG-004728,
--   BUG-004741, BUG-005120, BUG-005178, BUG-005491; clusters 3149b52f,
--   0961c22e)
--
-- DEFECT. A block-scheduled course occupies several periods of one day.
-- fn_scf_pending_for_learner has known that since 20260718200000: it
-- matches on (learner, day, period OR course) and so OFFERS a learner
-- exactly one feedback per course per day. FIVE readers decide whether a
-- mark is CONFIRMED, and each carried its own copy of the match against
-- the exact period. There was therefore no single place the July fix
-- could have landed, and the sibling periods the pending list withholds
-- were counted as never confirmed, permanently, with nothing the learner
-- could do. Eight reports from two learners across three weeks: "I have
-- already submitted my feedback ... however the app is still showing Not
-- Yet Confirmed."
--
-- FIX. fn_scf_feedback_matches_mark is now the only definition of the
-- match, it is the reference migration's rule verbatim, and all five
-- readers use it:
--   * fn_scf_confirmation_status       - the learner's history badges
--   * fn_scf_my_confirmed_attendance   - the learner's own percentage
--   * fn_scf_effective_attendance      - the admin at-risk list
--   * fn_scf_faculty_completion        - the team-member completion view
--   * fn_scf_confirmation_rollup       - the attendance dashboard split
-- What the pending list withholds, these confirm. The invariant is
-- asserted directly by supabase/tests/scf-block-course.
--
-- WHAT THIS REVERSES, stated plainly rather than buried. Migration
-- 20260731020000 added `f.timetable_id = <mark>.timetable_id` to the four
-- session-identity readers, with the note "late or cross-timetable
-- feedback no longer shows a tick" (Director, 2026-07-31 20:40, taken
-- informed of a 37,252-row flip). That equality is GONE here, because the
-- pending list has no such rule and the mismatch left marks that were
-- neither offered nor confirmable. Two measurements on production,
-- 2026-09-17, say the change moves nothing:
--   * The gap it could close: on the only days it can arise - the 33 of
--     2,971 section-days in 30 days carrying two timetables, 2,533
--     Present marks, 1,516 of them suppressed from the pending list - a
--     mark suppressed by cross-timetable feedback yet unconfirmable
--     occurs ZERO times. ZERO of 33,542 feedback groups in 30 days span
--     more than one timetable, because fn_scf_submit_feedback takes the
--     timetable from the session the learner opened.
--   * The risk it could open: the equality existed to stop feedback for a
--     different class sharing a period slot inflating the count. Of the
--     86 period keys present on those dual-timetable days, ZERO appear in
--     two timetables - period_id is a slot uuid, not a "P1" label, so
--     there is no slot to share.
-- The Director's actual decision, that the badge means exactly what the
-- percentage counts, is PRESERVED and strengthened: both now come from
-- one predicate, along with three more readers that did not before.
--
-- EVERY DENOMINATOR IS UNCHANGED. Nothing here touches a present/absent
-- count, a total_marks, a total_present or an official_pct. The rollup
-- now carries course IN its grouping and collapses back with bool_or
-- precisely so its (date, period, student) identity, and therefore
-- total_present, cannot move - an earlier draft used min(course_id),
-- which silently picks one course and drops feedback for the other when
-- duplicate substitute rows disagree (0 of 75,756 mark groups in 14 days
-- span two courses, so latent, but the arbitrary pick is gone).
--
-- A MALFORMED course_id CANNOT ABORT A READ. NULLIF(x,'') covers the
-- empty string and nothing else, so a non-empty malformed value raises
-- 22P02 and, because these readers explode one JSONB document into every
-- mark, would abort the whole read for every learner in it. Every
-- course_id cast goes through fn_scf_uuid_or_null, the course twin of
-- the student_id guard added by 20260722062012 after exactly that. Live:
-- 0 malformed and 238 absent across 3,871 periods in 14 days.
--
-- Bodies are otherwise VERBATIM from pg_get_functiondef read on
-- 2026-09-17: signatures, return shapes, SECURITY DEFINER, search_path,
-- statement_timeout, authorization checks, own-college scope, the
-- inlined rosters and their 22P02 student_id guards, outage days,
-- approved leave/OD, forward-only floors and the DISTINCT ON dedupes.
-- Decision #11's feedback window is untouched in every reader that had
-- it.
--
-- NOT fixed here, and named so it is not mistaken for done: a class
-- whose feedback window has closed stays in the denominator for good, so
-- a learner cannot recover from a missed window. Both cluster verdicts
-- raise it, and it is the larger part of what these two learners were
-- actually looking at - see the per-report table in the pull request.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The shared uuid guard.
-- NULLIF(x,'') covers an EMPTY string and nothing else: a non-empty
-- malformed value still raises 22P02, and because these readers explode
-- one JSONB document into every mark, a single bad course_id in any
-- included period aborts the whole read for every learner in it. That is
-- the exact failure migration 20260722062012 fixed for student_id, with
-- the same regex; this is its course_id twin. Inlineable by design -
-- plain SQL, IMMUTABLE, no SET, no SECURITY DEFINER - so the planner
-- folds it into the calling query and it costs nothing.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_uuid_or_null(p_text text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT CASE WHEN p_text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN p_text::uuid END
$function$;

-- ---------------------------------------------------------------------
-- 2. THE ONE PREDICATE, and it is the reference migration's rule verbatim.
--
-- fn_scf_pending_for_learner (20260718200000) decides what a learner is
-- OFFERED, and it has matched on (learner, day, period OR course) ever
-- since. Every reader that decides what a learner is CREDITED now matches
-- on exactly the same thing, so the two can no longer disagree: what the
-- pending list withholds, these confirm.
--
-- Same period, or same course - the course branch is what makes the
-- sibling periods of a block-scheduled course one confirmable unit. A
-- mark with no course_id keeps exact-period behaviour. A single-period
-- course is unchanged, because for it a course match IS the period match.
--
-- NO TIMETABLE EQUALITY, and that is a change from the four readers'
-- previous behaviour - see the migration header, which states what it
-- reverses and the two measurements that say it moves nothing.
--
-- Inlineable by design (plain SQL, IMMUTABLE, no SET, no SECURITY
-- DEFINER), so it is free inside an EXISTS over ~100k marks.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_feedback_matches_mark(
  p_feedback_period_id text,
  p_feedback_course_id uuid,
  p_mark_period_id     text,
  p_mark_course_id     uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT p_feedback_period_id = p_mark_period_id
      OR (p_mark_course_id IS NOT NULL
          AND p_feedback_course_id = p_mark_course_id)
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_uuid_or_null(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_uuid_or_null(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_scf_feedback_matches_mark(text, uuid, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_feedback_matches_mark(text, uuid, text, uuid) TO authenticated, service_role;

-- =============== 3. The five readers ===============

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
           -- ONE predicate, and it is fn_scf_pending_for_learner's rule: same
           -- period, or same course so a block-scheduled course's siblings are
           -- one confirmable unit. What the pending list withholds, this
           -- confirms. The 2026-07-31 timetable equality is GONE (header).
           -- The window below is decision #11 and is untouched.
           SELECT 1 FROM public.session_feedback f
           WHERE f.student_id = v_lp AND f.attendance_date = sa.attendance_date
             AND public.fn_scf_feedback_matches_mark(
                   f.period_id, f.course_id,
                   period.key,
                   public.fn_scf_uuid_or_null(period.value ->> 'course_id'))
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
           public.fn_scf_uuid_or_null(period.value ->> 'course_id') AS cid,
           (st ->> 'status') AS status
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
        -- ONE predicate. This is the number all eight reports screenshotted.
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id = v_lp AND f.attendance_date = d.attendance_date
          AND public.fn_scf_feedback_matches_mark(f.period_id, f.course_id, d.pid, d.cid)
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

CREATE OR REPLACE FUNCTION public.fn_scf_effective_attendance(p_from date, p_to date, p_institution_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(student_id uuid, present_marks bigint, absent_marks bigint, confirmed_present bigint, official_pct numeric, effective_pct numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE v_window_hours integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_effective_attendance: not authenticated'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('academic.attendance.dashboard.view')) THEN
    RAISE EXCEPTION 'fn_scf_effective_attendance: not authorized';
  END IF;

  -- Server-side compliance gate (defense in depth). The coupling is DARK by default and
  -- must stay inert until a super-admin flips session_feedback.attendance_coupling_enabled
  -- AND legal/compliance sign-off (spec R2). The service layer already checks this flag,
  -- but re-check it HERE so the derived effective-% can NEVER be computed by a direct RPC
  -- call that bypasses the service. When OFF: return zero rows, compute/touch nothing.
  -- Resolves the institution override (p_institution_id) -> global -> default FALSE.
  IF NOT public.fn_get_policy_bool(
       'session_feedback.attendance_coupling_enabled', false, p_institution_id) THEN
    RETURN;
  END IF;

  -- Forward-only floor (Director 2026-07-05): never count marks before the enforcement
  -- start date, so pre-rule attendance can't dilute the confirmed-attendance %. Mirrors
  -- fn_scf_faculty_completion. Institution override -> global -> default '2026-07-05'.
  p_from := GREATEST(p_from, COALESCE(NULLIF(public.fn_get_policy_text(
              'session_feedback.enforcement_start_date','2026-07-05', p_institution_id),'')::date,
              '2026-07-05'::date));

  -- Late-feedback window (decision #11): a confirmation counts only if submitted within
  -- window_hours of the class. Reuses the SAME session_feedback.window_hours lever the
  -- faculty completion window uses (default 48), so "within window" means one thing
  -- everywhere. Resolved once for the query's institution scope.
  v_window_hours := public.fn_get_policy_int('session_feedback.window_hours', 48, p_institution_id);

  RETURN QUERY
  WITH marks AS (
    SELECT
      (st ->> 'student_id')::uuid AS sid,
      sa.attendance_date,
      sa.timetable_id             AS timetable_id,
      period.key                  AS period_id,
      -- Guarded cast (fn_scf_uuid_or_null): a malformed course_id must not
      -- abort the dashboard for a whole institution.
      public.fn_scf_uuid_or_null(period.value ->> 'course_id') AS course_id,
      (st ->> 'status')           AS status
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(sa.attendance_data) = 'object'
           THEN sa.attendance_data ELSE '{}'::jsonb END) AS period
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(period.value -> 'students') = 'array'
           THEN period.value -> 'students' ELSE '[]'::jsonb END) AS st
    WHERE sa.attendance_date BETWEEN p_from AND p_to
      AND (st ->> 'status') IN ('Present', 'Absent')
      AND (st ->> 'student_id') ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND (p_institution_id IS NULL OR sa.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR sa.program_id     = p_program_id)
      AND (p_department_id  IS NULL OR sa.department_id  = p_department_id)
      AND (p_section_id     IS NULL OR sa.section_id     = p_section_id)
      -- Same scope-honest guard as fn_scf_confirmation_rollup (no is_admin() bypass
      -- of institution_scope): super_admin sees all, everyone else is bounded by
      -- role_has_institution_access.
      AND (is_super_admin() OR role_has_institution_access(sa.institution_id))
      -- Decision #10 (outage): drop marks on a super-admin-declared feedback outage
      -- (date [, institution][, period]) from BOTH present and absent counts.
      AND NOT EXISTS (
        SELECT 1 FROM public.scf_outage_days o
        WHERE o.outage_date = sa.attendance_date
          AND (o.institution_id IS NULL OR o.institution_id = sa.institution_id)
          AND (o.period_id      IS NULL OR o.period_id      = period.key))
      -- Decision #12 (approved leave/OD): drop marks that have an approved OD/leave
      -- adjustment (leave_onduty_attendance_updates) from BOTH sides of the denominator,
      -- so a legitimately-excused learner is never penalised for not confirming.
      AND NOT EXISTS (
        SELECT 1 FROM public.leave_onduty_attendance_updates lou
        WHERE lou.attendance_record_id = sa.id
          AND lou.student_id::text     = (st ->> 'student_id')
          AND lou.period_slot_id       = period.key)
  ),
  -- One mark per (learner, date, timetable, period); prefer Present on the rare
  -- dual-row tuple. timetable_id is IN the key so two distinct classes that share a
  -- period key on the same date do NOT collapse into one mark (which would skew both
  -- official_pct and effective_pct).
  dedup AS (
    SELECT DISTINCT ON (sid, attendance_date, timetable_id, period_id)
      sid, attendance_date, timetable_id, period_id, course_id, status
    FROM marks
    ORDER BY sid, attendance_date, timetable_id, period_id, (status = 'Present') DESC
  ),
  agg AS (
    SELECT
      d.sid,
      count(*) FILTER (WHERE d.status = 'Present') AS present_marks,
      count(*) FILTER (WHERE d.status = 'Absent')  AS absent_marks,
      count(*) FILTER (WHERE d.status = 'Present' AND EXISTS (
        -- ONE predicate, the same one the learner's own card uses, so the
        -- at-risk list can no longer call a learner short for a sibling period
        -- they were never offered. The old same-timetable guard here existed to
        -- stop feedback for a different class sharing a period slot inflating
        -- this count; measured on production 2026-09-17, no period key appears
        -- in two timetables on any of the 86 period keys present on the only
        -- days a section has two (see header), so there is no such slot to share.
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id      = d.sid
          AND f.attendance_date = d.attendance_date
          AND public.fn_scf_feedback_matches_mark(
                f.period_id, f.course_id, d.period_id, d.course_id)
          -- Decision #11: only feedback submitted within window_hours of the class
          -- (class day interpreted at IST midnight, mirroring fn_scf_faculty_completion)
          -- counts as a confirmation. A late confirmation still exists but no longer
          -- credits attendance.
          AND f.created_at <= ((d.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
                               + make_interval(hours => v_window_hours))
      )) AS confirmed_present
    FROM dedup d
    GROUP BY d.sid
  )
  SELECT
    a.sid,
    a.present_marks::bigint,
    a.absent_marks::bigint,
    a.confirmed_present::bigint,
    CASE WHEN (a.present_marks + a.absent_marks) = 0 THEN 0
         ELSE round(a.present_marks::numeric
                    / (a.present_marks + a.absent_marks) * 100, 2) END,
    CASE WHEN (a.present_marks + a.absent_marks) = 0 THEN 0
         ELSE round(a.confirmed_present::numeric
                    / (a.present_marks + a.absent_marks) * 100, 2) END
  FROM agg a;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_scf_faculty_completion(p_from date, p_to date)
 RETURNS TABLE(attendance_date date, timetable_id uuid, period_id text, course_code text, course_name text, present_count integer, confirmed_count integer, pending_count integer, completion_pct numeric, within_window boolean, start_time text, end_time text, gate_mode text, session_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE v_email text; v_start date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_faculty_completion: not authenticated'; END IF;
  SELECT lower(p.email) INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RETURN; END IF;
  -- Forward-only floor (Director 2026-07-05): sessions before this date are never
  -- marked incomplete/overdue (grandfathered as neutral 'open').
  v_start := COALESCE(NULLIF(public.fn_get_policy_text('session_feedback.enforcement_start_date','2026-07-05',NULL),'')::date, '2026-07-05'::date);

  RETURN QUERY
  WITH pol AS MATERIALIZED (
    -- Per-institution policy map, resolved once (identical values by
    -- construction; fn_get_policy_int/text never return NULL thanks to their
    -- non-NULL defaults, so COALESCE below only fires on a join miss).
    SELECT i.id AS institution_id,
           public.fn_get_policy_int('session_feedback.window_hours', 48, i.id)  AS hours,
           public.fn_get_policy_text('session_feedback.gate_mode', 'visibility', i.id) AS gmode
    FROM public.institutions i
  ),
  sess AS (
    SELECT sa.id AS att_id, sa.institution_id, sa.attendance_date, sa.timetable_id,
           period.key AS period_id, period.value AS pv,
           -- Decision #11 window end, anchored to IST wall-clock exactly as before:
           -- class day at IST midnight + the institution's window_hours.
           ((sa.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
             + make_interval(hours => COALESCE(pol.hours,
                 public.fn_get_policy_int('session_feedback.window_hours', 48, sa.institution_id)))) AS deadline,
           -- Gate mode for THIS session's institution (institution override
           -- shadows the global default). Default 'visibility' matches the seeded row.
           COALESCE(pol.gmode,
                 public.fn_get_policy_text('session_feedback.gate_mode', 'visibility', sa.institution_id)) AS gmode
    FROM public.student_attendance sa
    LEFT JOIN pol ON pol.institution_id = sa.institution_id,
         jsonb_each(sa.attendance_data) AS period
    WHERE sa.attendance_date BETWEEN p_from AND p_to
      -- Updated: 2026-08-15 — resolve the teacher through the both-shapes reader.
      -- `period.value -> 'assigned_faculty' ->> 'faculty_email'` returned NULL on
      -- the ARRAY shape, so a team-taught session never matched and simply did
      -- not appear on the teacher's completion list at all. The predicate is
      -- otherwise unchanged (same lower(), same equality, same v_email).
      AND lower(public.fn_attendance_slot_faculty(period.value) ->> 'faculty_email') = v_email
      -- Decision #10 (outage): a super-admin-declared feedback outage for this
      -- date [, institution][, period] removes the whole session from the faculty's
      -- completion view — no red for a day the feedback system was down.
      AND NOT EXISTS (
        SELECT 1 FROM public.scf_outage_days o
        WHERE o.outage_date = sa.attendance_date
          AND (o.institution_id IS NULL OR o.institution_id = sa.institution_id)
          AND (o.period_id      IS NULL OR o.period_id      = period.key))
  ),
  counted AS (
    -- ONE explosion of the students array per session. Outer WHERE = the old
    -- present_count predicate (Present + not excused per Decision #12); the
    -- FILTER adds the old confirmed_count predicate on top (same feedback probe,
    -- same uuid-shape CASE guard so a malformed blob id can never raise 22P02).
    SELECT s.att_id, s.institution_id, s.attendance_date, s.timetable_id,
           s.period_id, s.pv, s.deadline, s.gmode,
           x.present_count, x.confirmed_count
    FROM sess s
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS present_count,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM public.session_feedback f
               WHERE f.student_id = CASE
                       WHEN (st.value ->> 'student_id') ~
                            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                       THEN (st.value ->> 'student_id')::uuid END
                 AND f.attendance_date = s.attendance_date
                 -- ONE predicate, so a team member is not shown Incomplete for
                 -- sibling periods the pending list never offered the learners.
                 AND public.fn_scf_feedback_matches_mark(
                       f.period_id, f.course_id,
                       s.period_id,
                       public.fn_scf_uuid_or_null(s.pv ->> 'course_id'))
                 -- Decision #11: only feedback submitted within window_hours
                 -- of the class confirms attendance.
                 AND f.created_at    <= s.deadline))::int AS confirmed_count
      FROM jsonb_array_elements(s.pv -> 'students') st
      WHERE st.value ->> 'status' = 'Present'
        -- Decision #12 (approved leave/OD): an excused student is not
        -- "present-owing-feedback", so drop them from both counts.
        AND NOT EXISTS (
          SELECT 1 FROM public.leave_onduty_attendance_updates lou
          WHERE lou.attendance_record_id = s.att_id
            AND lou.student_id::text     = (st.value ->> 'student_id')
            AND lou.period_slot_id       = s.period_id)
    ) x
  ),
  derived AS (
    SELECT c.*,
      (c.present_count - c.confirmed_count) AS pending_ct,
      (now() <= c.deadline) AS win
    FROM counted c
    WHERE c.present_count > 0
  )
  SELECT d.attendance_date, d.timetable_id, d.period_id,
         d.pv ->> 'course_code', d.pv ->> 'course_name',
         d.present_count, d.confirmed_count, d.pending_ct,
         CASE WHEN d.present_count = 0 THEN 0
              ELSE round((d.confirmed_count::numeric / d.present_count) * 100, 0) END,
         d.win,
         d.pv ->> 'start_time', d.pv ->> 'end_time',
         d.gmode,
         -- DERIVED enforcement status, unchanged (see v1 note: 'incomplete' is
         -- inert until the gate_mode config flips to 'hard').
         CASE
           WHEN d.pending_ct <= 0            THEN 'complete'
           WHEN d.attendance_date < v_start THEN 'open'  -- pre-rule: neutral, never red
           WHEN d.gmode = 'hard' AND d.win   THEN 'incomplete'
           WHEN d.win                        THEN 'open'
           ELSE                                   'overdue'
         END
  FROM derived d
  -- Chronological within a day: sort on the PARSED time-of-day (see v1 note).
  ORDER BY d.attendance_date DESC,
           public.fn_scf_to_time_or_null(d.pv ->> 'start_time') ASC NULLS LAST;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_scf_confirmation_rollup(p_from date, p_to date, p_institution_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid, p_window_hours integer DEFAULT 48)
 RETURNS TABLE(total_present bigint, confirmed bigint, pending_within bigint, pending_overdue bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE v_super boolean; v_insts uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_confirmation_rollup: not authenticated';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('academic.attendance.dashboard.view')) THEN
    RAISE EXCEPTION 'fn_scf_confirmation_rollup: not authorized';
  END IF;

  -- Data scope resolved ONCE: same verdicts as the old per-row
  -- (is_super_admin() OR role_has_institution_access(sa.institution_id)) check,
  -- evaluated per DISTINCT institution present in the window (incl. orphaned ids,
  -- so verdicts match row-for-row). NULL institution rows stay visible
  -- (role_has_institution_access(NULL) = true).
  v_super := is_super_admin();
  IF NOT v_super THEN
    SELECT array_agg(x.iid) INTO v_insts
    FROM (SELECT DISTINCT sa.institution_id AS iid
          FROM public.student_attendance sa
          WHERE sa.attendance_date BETWEEN p_from AND p_to
            AND sa.institution_id IS NOT NULL) x
    WHERE role_has_institution_access(x.iid);
  END IF;

  RETURN QUERY
  WITH present_marks AS (
    -- One row per (date, period, student-id-text): same identity as the old
    -- DISTINCT ON; min(session_end_local) = the old ORDER BY session_end_local ASC
    -- pick (earliest class-end anchor for duplicate substitute/re-provisioned rows).
    SELECT sa.attendance_date,
           period.key AS period_id,
           (sid.j #>> '{}') AS student_text,
           -- The block-course key, IN the grouping rather than aggregated.
           -- An earlier draft used min(course_id) over the (date, period,
           -- student) group, which silently picks one course and loses
           -- feedback for the other when duplicate substitute rows disagree.
           -- Grouping instead keeps every course; `scored` below collapses
           -- back to the original identity, so total_present cannot move.
           -- Measured 2026-09-17: 0 of 75,756 mark groups in 14 days span
           -- more than one course - latent, but the arbitrary pick is gone.
           public.fn_scf_uuid_or_null(period.value ->> 'course_id') AS course_id,
           min(pe.session_end_local) AS session_end_local
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(
                         CASE WHEN jsonb_typeof(sa.attendance_data) = 'object'
                              THEN sa.attendance_data
                              ELSE '{}'::jsonb END) AS period
    -- OFFSET 0: planner fence so fn_scf_safe_time runs once per period, not once
    -- per exploded student row. Same mixed 24h/12h parsing, same end-of-day
    -- fallback on unparseable values.
    CROSS JOIN LATERAL (
      SELECT sa.attendance_date
               + fn_scf_safe_time(period.value ->> 'end_time', TIME '23:59:59')
             AS session_end_local
      OFFSET 0) pe
    -- C-level filter, same predicate as the old SQL quals:
    -- status = 'Present' AND student_id matches the uuid-shape regex (the guard
    -- that keeps one malformed blob row from aborting the whole rollup).
    -- Emits ONLY the student_id string, so the executor never carries whole
    -- student objects. Non-array 'students' (incl. JSON null/scalar/object)
    -- explodes to nothing, exactly like the old CASE guard.
    CROSS JOIN LATERAL jsonb_path_query(
      CASE WHEN jsonb_typeof(period.value -> 'students') = 'array'
           THEN period.value -> 'students'
           ELSE '[]'::jsonb END,
      '$[*] ? (@.status == "Present" && @.student_id like_regex "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").student_id'
    ) AS sid(j)
    WHERE sa.attendance_date BETWEEN p_from AND p_to
      AND (p_institution_id IS NULL OR sa.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR sa.program_id     = p_program_id)
      AND (p_department_id  IS NULL OR sa.department_id  = p_department_id)
      AND (p_section_id     IS NULL OR sa.section_id     = p_section_id)
      AND (v_super OR sa.institution_id IS NULL OR sa.institution_id = ANY(v_insts))
    GROUP BY sa.attendance_date, period.key, (sid.j #>> '{}'),
             public.fn_scf_uuid_or_null(period.value ->> 'course_id')
  ),
  scored_raw AS (
    -- Confirmed = the SAME rule fn_scf_feedback_matches_mark states, and the
    -- same rule fn_scf_pending_for_learner uses to decide what a learner is
    -- offered: this learner's feedback that day for this PERIOD, or for this
    -- COURSE (the block-course branch, so sibling periods of one block course
    -- are a single confirmable unit).
    --
    -- WHY TWO JOINS AND NOT THE PREDICATE FUNCTION: the predicate's OR of two
    -- equalities cannot be hashed, and this function exists in its current
    -- shape because a prior migration replaced ~99k per-row EXISTS probes
    -- with one hash join under a 20s statement_timeout. Two equi-joins keep
    -- that plan and mean exactly what the predicate means; the scenario file
    -- supabase/tests/scf-block-course/10_scenarios.sql recomputes this
    -- numerator straight from the predicate and requires the same answer, so
    -- the two forms are pinned together by outcome, not by a shared call.
    --
    -- Neither join can multiply: the UNIQUE constraint on (student_id,
    -- attendance_date, period_id) settles the first, and a learner CAN have
    -- several feedback rows for one course in a day - that is the whole point
    -- of a block course - so the DISTINCT on the second is load-bearing.
    SELECT pm.attendance_date, pm.period_id, pm.student_text, pm.session_end_local,
           (fb.student_id IS NOT NULL OR fbc.student_id IS NOT NULL) AS is_confirmed
    FROM present_marks pm
    LEFT JOIN (SELECT DISTINCT f.student_id, f.attendance_date, f.period_id
               FROM public.session_feedback f
               WHERE f.attendance_date BETWEEN p_from AND p_to) fb
      ON fb.student_id      = (pm.student_text)::uuid
     AND fb.attendance_date = pm.attendance_date
     AND fb.period_id       = pm.period_id
    LEFT JOIN (SELECT DISTINCT f.student_id, f.attendance_date, f.course_id
               FROM public.session_feedback f
               WHERE f.attendance_date BETWEEN p_from AND p_to
                 AND f.course_id IS NOT NULL) fbc
      ON fbc.student_id      = (pm.student_text)::uuid
     AND fbc.attendance_date = pm.attendance_date
     AND fbc.course_id       = pm.course_id
  ),
  scored AS (
    -- Collapse back to ONE row per (date, period, student) - the identity this
    -- function has always counted, and therefore the denominator. bool_or, so
    -- a match on ANY of the group's courses counts; min(session_end_local) is
    -- the original earliest-class-end pick, unchanged.
    SELECT min(sr.session_end_local) AS session_end_local,
           bool_or(sr.is_confirmed)  AS is_confirmed
    FROM scored_raw sr
    GROUP BY sr.attendance_date, sr.period_id, sr.student_text
  )
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE is_confirmed)::bigint,
    count(*) FILTER (
      WHERE NOT is_confirmed
        AND (now() AT TIME ZONE 'Asia/Kolkata')
            <= session_end_local + make_interval(hours => GREATEST(p_window_hours, 1))
    )::bigint,
    count(*) FILTER (
      WHERE NOT is_confirmed
        AND (now() AT TIME ZONE 'Asia/Kolkata')
            >  session_end_local + make_interval(hours => GREATEST(p_window_hours, 1))
    )::bigint
  FROM scored;
END;
$function$;

-- ---------------------------------------------------------------------
-- Grants: the LIVE posture of the five readers, restated, not changed.
-- CREATE OR REPLACE keeps a function's existing ACL, so nothing above
-- opens anything. All five read
-- `postgres=X | authenticated=X | service_role=X` on production today
-- (pg_proc.proacl, checked 2026-09-17) - anon and PUBLIC hold nothing.
-- Restated so the anon-lock gate, a text scan that cannot know what
-- CREATE OR REPLACE preserves, can see it. Proven no-ops: every ACL here
-- is byte-identical before and after in the production rehearsal.
--
-- ci:allow-secdef-authenticated fn_scf_confirmation_status and
-- fn_scf_my_confirmed_attendance are self-scoped learner reads that take
-- no id from the caller - each resolves auth.uid() to the caller's OWN
-- learners_profiles row, returns zero rows when there is none, and every
-- predicate is bound to that one learner id, so a signed-in user can
-- only ever see themselves. fn_scf_effective_attendance,
-- fn_scf_confirmation_rollup and fn_scf_faculty_completion each RAISE
-- unless the caller is a super admin, an admin, or holds the relevant
-- permission, and those checks are carried here verbatim. All five hold
-- the same grants as before this migration.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_scf_confirmation_status(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_confirmation_status(date, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_scf_my_confirmed_attendance(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_my_confirmed_attendance(date, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_scf_effective_attendance(date, date, uuid, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_effective_attendance(date, date, uuid, uuid, uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_scf_faculty_completion(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_faculty_completion(date, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_scf_confirmation_rollup(date, date, uuid, uuid, uuid, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_confirmation_rollup(date, date, uuid, uuid, uuid, uuid, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- End-state assertion. RAISE, not NOTICE: if any reader is still
-- carrying its own copy of the match, the apply must fail rather than
-- leave the numerators disagreeing again.
-- ---------------------------------------------------------------------
DO $assert$
DECLARE v_missing text[] := '{}'; v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'fn_scf_confirmation_status', 'fn_scf_my_confirmed_attendance',
    'fn_scf_effective_attendance', 'fn_scf_faculty_completion'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
      WHERE n.nspname = 'public' AND pr.proname = v_fn
        AND pg_get_functiondef(pr.oid) LIKE '%fn_scf_feedback_matches_mark%'
    ) THEN v_missing := v_missing || v_fn; END IF;
  END LOOP;
  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'scf confirmation predicate not shared by: %', array_to_string(v_missing, ', ');
  END IF;

  -- No reader may reintroduce a private timetable equality on the match.
  FOREACH v_fn IN ARRAY ARRAY[
    'fn_scf_confirmation_status', 'fn_scf_my_confirmed_attendance',
    'fn_scf_effective_attendance', 'fn_scf_faculty_completion'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
      WHERE n.nspname = 'public' AND pr.proname = v_fn
        AND pg_get_functiondef(pr.oid) ~ 'f\.timetable_id\s*='
    ) THEN
      RAISE EXCEPTION '% still matches feedback on timetable_id, which the pending list does not', v_fn;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
    WHERE n.nspname = 'public' AND pr.proname = 'fn_scf_confirmation_rollup'
      AND pg_get_functiondef(pr.oid) LIKE '%fbc.course_id%'
      AND pg_get_functiondef(pr.oid) LIKE '%bool_or%'
  ) THEN
    RAISE EXCEPTION 'fn_scf_confirmation_rollup lost its block-course join or its collapse';
  END IF;

  -- Both helpers must stay inlineable: plain SQL, IMMUTABLE, not SECURITY
  -- DEFINER, no SET. Otherwise the planner stops folding them and the EXISTS
  -- over ~100k marks stops being free.
  IF EXISTS (
    SELECT 1 FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
    WHERE n.nspname = 'public'
      AND pr.proname IN ('fn_scf_uuid_or_null', 'fn_scf_feedback_matches_mark')
      AND (pr.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'sql')
           OR pr.provolatile <> 'i' OR pr.prosecdef OR pr.proconfig IS NOT NULL)
  ) THEN RAISE EXCEPTION 'scf predicate helpers are no longer inlineable'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
    WHERE n.nspname = 'public'
      AND pr.proname IN ('fn_scf_uuid_or_null', 'fn_scf_feedback_matches_mark')
      AND has_function_privilege('anon', pr.oid, 'EXECUTE')
  ) THEN RAISE EXCEPTION 'scf predicate helpers are callable by anon'; END IF;
END
$assert$;
