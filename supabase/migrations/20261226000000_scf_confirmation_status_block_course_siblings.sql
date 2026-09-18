-- =====================================================================
-- SCF: ONE predicate for "did this learner's feedback confirm this
-- mark?", and it recognises the sibling periods of a block-scheduled
-- course
-- Updated: 2026-09-17 (BUG-004651, BUG-004690, BUG-004707, BUG-004728,
--   BUG-004741, BUG-005120, BUG-005178, BUG-005491; clusters 3149b52f,
--   0961c22e)
--
-- DEFECT. A block-scheduled course occupies several periods of one day.
-- fn_scf_pending_for_learner has known that since 20260718200000: it
-- groups those siblings by course and OFFERS a learner exactly one
-- feedback per course per day. Five readers that answer "is this mark
-- confirmed?" were never told, and each carried its OWN copy of the
-- match against the exact (attendance_date, period_id) pair. So the
-- sibling periods the pending list deliberately withholds were counted
-- as never confirmed, permanently, with nothing the learner could do.
-- Eight reports from two learners across three weeks: "I have already
-- submitted my feedback ... however the app is still showing Not Yet
-- Confirmed."
--
-- FIX, and why it is shaped like this. Five private copies of one rule
-- is how the drift happened, so the rule is now ONE inlineable function,
-- fn_scf_feedback_matches_mark, and every reader calls it:
--   * fn_scf_confirmation_status       - the learner's history badges
--   * fn_scf_my_confirmed_attendance   - the learner's own percentage
--   * fn_scf_effective_attendance      - the admin at-risk list
--   * fn_scf_faculty_completion        - the team-member completion view
--   * fn_scf_confirmation_rollup       - the attendance dashboard split
-- The numerators now agree by construction. Before this, the at-risk
-- list could call a learner short for a session the learner's own screen
-- showed confirmed.
--
-- EVERY DENOMINATOR IS UNCHANGED. Nothing here touches a present/absent
-- count, a total_marks, a total_present or an official_pct. The rollup's
-- new course key is an AGGREGATE precisely so its GROUP BY, and
-- therefore its total_present, cannot move. Measured in the rehearsal:
-- official_pct and total_present identical before and after.
--
-- fn_scf_confirmation_rollup expresses the rule as two hash joins rather
-- than calling the predicate, because the predicate's OR of two
-- equalities cannot be hashed and that function was rewritten
-- specifically to replace ~99k per-row EXISTS probes under a 20s
-- statement_timeout. Its own comment says so, and a test pins the two
-- forms to the same answer on the same rows.
--
-- THE TIMETABLE DIMENSION IS A PARAMETER, NOT A NEW RULE. The four
-- session-identity readers pass p_require_same_timetable => true (the
-- Director's aligned tick rule, 2026-07-31 20:40, taken informed of a
-- 37,252-row flip); fn_scf_confirmation_rollup has always matched
-- period-only and still does. Keeping that asymmetry rather than
-- "mirroring the pending list exactly" is a measured choice, not an
-- oversight, because the pending list requires no timetable match and so
-- can suppress an item that these readers would not confirm. Measured on
-- production 2026-09-17 on the only days that gap can occur - the 33
-- section-days in 30 days carrying two timetables, 2,533 Present marks,
-- 1,516 of them suppressed from the pending list: the gap occurs ZERO
-- times, and ZERO of 33,542 feedback groups in 30 days span more than
-- one timetable, because fn_scf_submit_feedback takes the timetable from
-- the session the learner opened. Dropping the requirement would reverse
-- an explicit Director decision to fix a case with no instances. The
-- cross-timetable behaviour is pinned by a test so a future change to it
-- is deliberate.
--
-- A MALFORMED course_id CANNOT ABORT A READ. NULLIF(x,'') covers the
-- empty string and nothing else, so a non-empty malformed value raises
-- 22P02 and, because these readers explode one JSONB document into every
-- mark, would abort the whole read for every learner in it. Every
-- course_id cast goes through fn_scf_uuid_or_null, the course twin of
-- the student_id guard added by 20260722062012 after exactly that.
-- Live today: 0 malformed and 238 absent course_id values across 3,871
-- periods in 14 days - latent, not firing.
--
-- Bodies are otherwise VERBATIM from pg_get_functiondef read on
-- 2026-09-17: signatures, return shapes, SECURITY DEFINER, search_path,
-- statement_timeout, authorization checks, own-college scope, the
-- inlined rosters and their 22P02 student_id guards, outage days,
-- approved leave/OD, forward-only floors and the DISTINCT ON dedupes.
--
-- NOT fixed here, and named so it is not mistaken for done: a class
-- whose feedback window has closed stays in the denominator for good, so
-- a learner cannot recover from a missed window. Both cluster verdicts
-- raise it. It is a different rule and a different decision.
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
-- 2. THE ONE PREDICATE. Every reader that answers "did this learner's
-- feedback confirm this mark?" calls this and nothing else, so the
-- numerators cannot drift apart again - which is how the reported defect
-- arose: 20260718200000 taught the pending list to consolidate sibling
-- periods of a block-scheduled course, and the confirmation readers were
-- never told, each carrying its own copy of the match.
--
-- The rule: feedback confirms a mark when it is for the same period, OR
-- for the same course (which is what makes the sibling periods of a
-- block-scheduled course one confirmable unit, exactly as
-- fn_scf_pending_for_learner treats them). A mark with no course_id
-- keeps exact-period behaviour. Single-period courses are unchanged,
-- because for them a course match IS the period match.
--
-- p_require_same_timetable is a PARAMETER, not a second rule, because
-- the readers already differ on it today and this migration is not the
-- place to change that: the four session-identity readers pass true (the
-- Director's aligned tick rule of 2026-07-31 20:40), and
-- fn_scf_confirmation_rollup has always matched period-only and still
-- does. See the migration header for what that costs, measured.
--
-- Inlineable by design, same three conditions as above, so it is free
-- inside an EXISTS over ~100k marks.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_feedback_matches_mark(
  p_feedback_period_id   text,
  p_feedback_course_id   uuid,
  p_feedback_timetable_id uuid,
  p_mark_period_id       text,
  p_mark_course_id       uuid,
  p_mark_timetable_id    uuid,
  p_require_same_timetable boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT (NOT p_require_same_timetable
          OR p_feedback_timetable_id = p_mark_timetable_id)
     AND (p_feedback_period_id = p_mark_period_id
          OR (p_mark_course_id IS NOT NULL
              AND p_feedback_course_id = p_mark_course_id))
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_uuid_or_null(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_uuid_or_null(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_scf_feedback_matches_mark(text, uuid, uuid, text, uuid, uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_feedback_matches_mark(text, uuid, uuid, text, uuid, uuid, boolean) TO authenticated, service_role;

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
           -- ONE predicate (see fn_scf_feedback_matches_mark): same period, or
           -- same course so a block-scheduled course's sibling periods are one
           -- confirmable unit. Same timetable required (2026-07-31 aligned tick
           -- rule); the window below is decision #11. Both unchanged.
           SELECT 1 FROM public.session_feedback f
           WHERE f.student_id = v_lp AND f.attendance_date = sa.attendance_date
             AND public.fn_scf_feedback_matches_mark(
                   f.period_id, f.course_id, f.timetable_id,
                   period.key,
                   public.fn_scf_uuid_or_null(period.value ->> 'course_id'),
                   sa.timetable_id,
                   true)
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
        -- ONE predicate. This is the number every one of the eight reports
        -- screenshotted.
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id = v_lp AND f.attendance_date = d.attendance_date
          AND public.fn_scf_feedback_matches_mark(
                f.period_id, f.course_id, f.timetable_id,
                d.pid, d.cid, d.ttid, true)
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
        -- at-risk list on the attendance consolidation report can no longer
        -- call a learner short for a sibling period they were never offered.
        -- Same session identity as before (session_feedback.timetable_id is
        -- NOT NULL), so feedback for a different class sharing a period slot
        -- still cannot inflate confirmed_present.
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id      = d.sid
          AND f.attendance_date = d.attendance_date
          AND public.fn_scf_feedback_matches_mark(
                f.period_id, f.course_id, f.timetable_id,
                d.period_id, d.course_id, d.timetable_id, true)
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
                 -- ONE predicate. Same session identity as before (see v1 note
                 -- re: shared period slots), plus the block-course branch, so a
                 -- team member is not shown Incomplete for sibling periods the
                 -- pending list never offered the learners.
                 AND public.fn_scf_feedback_matches_mark(
                       f.period_id, f.course_id, f.timetable_id,
                       s.period_id,
                       public.fn_scf_uuid_or_null(s.pv ->> 'course_id'),
                       s.timetable_id, true)
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
           min(pe.session_end_local) AS session_end_local,
           -- Block-course key for the second join below. AGGREGATED, never added
           -- to the GROUP BY: the grouping deliberately collapses duplicate
           -- substitute / re-provisioned rows for one (date, period, student),
           -- and grouping by course as well would split such a pair in two and
           -- inflate total_present - the denominator this change must not touch.
           -- min() over the raw text (min(uuid) is not a built-in aggregate);
           -- the shape guard is applied where it is read.
           min(period.value ->> 'course_id') AS course_id_text
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
    GROUP BY sa.attendance_date, period.key, (sid.j #>> '{}')
  ),
  scored AS (
    -- Confirmed = the SAME rule fn_scf_feedback_matches_mark states: this
    -- learner's feedback that day for this PERIOD, or for this COURSE (the
    -- block-course branch, so sibling periods of one block-scheduled course
    -- are one confirmable unit). Period-only on the timetable dimension, as
    -- this function has always been - it is the p_require_same_timetable
    -- => false case of that predicate.
    --
    -- WHY TWO JOINS AND NOT THE PREDICATE FUNCTION ITSELF: the predicate's
    -- OR of two equalities cannot be hashed, and this function exists in its
    -- current shape because a prior migration replaced ~99k per-row EXISTS
    -- probes with one hash join under a 20s statement_timeout. Two equi-joins
    -- keep that plan and mean exactly what the predicate means; the test
    -- __tests__/ci/scf-confirmation-block-course-siblings.test.ts pins the
    -- two forms to the same answer on the same rows, which is a stronger
    -- anti-drift device than sharing a call site.
    --
    -- Neither join can multiply: the UNIQUE constraint on (student_id,
    -- attendance_date, period_id) settles the first, and a learner CAN have
    -- several feedback rows for one course in a day (that is the whole point
    -- of a block course), so the DISTINCT on the second is load-bearing, not
    -- belt-and-braces.
    SELECT pm.session_end_local,
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
     AND fbc.course_id       = public.fn_scf_uuid_or_null(pm.course_id_text)
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
-- Restated so the anon-lock gate, which is a text scan and cannot know
-- what CREATE OR REPLACE preserves, can see it. Proven no-ops: the ACL
-- of every function here is byte-identical before and after in the
-- production rehearsal.
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
DECLARE
  v_missing text[] := '{}';
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'fn_scf_confirmation_status',
    'fn_scf_my_confirmed_attendance',
    'fn_scf_effective_attendance',
    'fn_scf_faculty_completion'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
      WHERE n.nspname = 'public' AND pr.proname = v_fn
        AND pg_get_functiondef(pr.oid) LIKE '%fn_scf_feedback_matches_mark%'
    ) THEN
      v_missing := v_missing || v_fn;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'scf confirmation predicate not shared by: %',
      array_to_string(v_missing, ', ');
  END IF;

  -- The rollup carries the rule as two joins; assert the course join is there.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
    WHERE n.nspname = 'public' AND pr.proname = 'fn_scf_confirmation_rollup'
      AND pg_get_functiondef(pr.oid) LIKE '%fbc.course_id%'
  ) THEN
    RAISE EXCEPTION 'fn_scf_confirmation_rollup lost its block-course join';
  END IF;

  -- Both helpers must be inlineable: plain SQL, IMMUTABLE, not SECURITY
  -- DEFINER, no SET. If any of that changes, the planner stops folding them
  -- and the EXISTS over ~100k marks stops being free.
  IF EXISTS (
    SELECT 1 FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
    WHERE n.nspname = 'public'
      AND pr.proname IN ('fn_scf_uuid_or_null', 'fn_scf_feedback_matches_mark')
      AND (pr.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'sql')
           OR pr.provolatile <> 'i'
           OR pr.prosecdef
           OR pr.proconfig IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'scf predicate helpers are no longer inlineable';
  END IF;

  -- And anon must hold nothing on either helper.
  IF EXISTS (
    SELECT 1 FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
    WHERE n.nspname = 'public'
      AND pr.proname IN ('fn_scf_uuid_or_null', 'fn_scf_feedback_matches_mark')
      AND has_function_privilege('anon', pr.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'scf predicate helpers are callable by anon';
  END IF;
END
$assert$;
