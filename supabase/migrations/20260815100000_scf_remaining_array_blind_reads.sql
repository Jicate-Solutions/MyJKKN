-- ============================================================================
-- Session feedback: the five remaining functions that cannot see a team-taught
-- Senior Learner — four fixed, one deliberately left alone
-- Created: 2026-08-15
-- ci:allow-secdef-authenticated fn_scf_faculty_pending_roster and fn_scf_pending_for_learner are self-scoped: each resolves the caller from auth.uid() (profile email / learners_profiles.profile_id) and returns only that caller's own sessions or pending items; both functions and their authenticated grants pre-exist on main — this migration changes only the teacher-slot reader (array-shape aware), not who may call them.
-- ----------------------------------------------------------------------------
-- 🛑 ORDERING DEPENDENCY — READ FIRST
--
-- This migration REQUIRES public.fn_attendance_slot_faculty(jsonb), created by
-- 20260812010000_scf_submit_feedback_team_taught_faculty.sql (PR #2860, branch
-- fix/session-feedback-faculty-identity-array-shape). That migration is NOT yet
-- merged and the helper does NOT exist on production (verified 2026-08-15:
-- pg_proc count 0 for fn_attendance_slot_faculty; only its sibling
-- fn_attendance_slot_students is live).
--
-- 20260812010000 MUST be applied before this file. Section 0 refuses to apply
-- otherwise, naming the file to run first, so a wrong-order run fails loudly at
-- the first statement instead of leaving four half-fixed functions behind.
--
-- This file is the third in the series. 20260812010000 (#2860) fixed the submit
-- path and introduced the reader; 20260815090000 (#3092) fixed
-- fn_scf_notify_session_pending and fn_scf_faculty_completion. This one has no
-- ordering relationship to 20260815090000 — they touch disjoint functions and
-- may be applied in either order — but both need the helper first.
-- ----------------------------------------------------------------------------
-- THE DEFECT (identical to #2860 / #3092 — see those files for the full history)
--
-- `student_attendance.attendance_data -> <period> -> 'assigned_faculty'` is
-- written by the attendance marker in TWO shapes
-- (app/(routes)/academic/attendance/mark/page.tsx, ~line 1357):
--
--     assignedStaff.length  > 1  ->  ARRAY  [{faculty_id, faculty_name,
--                                             faculty_email, is_primary}, ...]
--     assignedStaff.length == 1  ->  OBJECT  {faculty_id, faculty_name,
--                                             faculty_email}
--
-- `->>` with a TEXT key on a JSON ARRAY returns NULL — silently, no error, no
-- log line. Every read below assumed the object shape, so on a team-taught
-- session it resolves to no teacher and the caller FAILS CLOSED.
--
-- MEASURED ON PRODUCTION 2026-08-15 (whole table, not a sample), every
-- attendance slot carrying an assigned_faculty key:
--
--   object shape   25,766 slots   (8,031 attendance rows)
--   ARRAY  shape    5,952 slots   (3,764 attendance rows)   <- 18.8%, invisible
--
-- Distinct Senior Learner emails inside array-shaped slots:           207
-- ... of whom appear in NO object-shaped slot anywhere:                47
--
-- Beware the near-miss that hid this: several of these functions DO call
-- jsonb_array_elements — over the `'students'` roster, never over
-- assigned_faculty. Two of them even route the roster through the sibling
-- normaliser fn_attendance_slot_students. Neither means the faculty read was
-- ever shape-aware.
-- ----------------------------------------------------------------------------
-- WHAT THIS MIGRATION CHANGES — four functions, five expressions
--
--  1. fn_scf_faculty_pending_roster  — AUTHORIZATION GUARD.
--     `IF lower(v_pv -> 'assigned_faculty' ->> 'faculty_email') IS DISTINCT
--      FROM v_email THEN RAISE 'not the assigned faculty'`.
--     Byte-identical to the guard #3092 fixed in fn_scf_notify_session_pending,
--     but with NO admin escape hatch — the team-taught Senior Learner is hard-
--     refused the list of who in their own class still owes feedback. There is
--     no second path to that list. This is the sharpest of the five.
--
--  2. fn_scf_open_pulse — GUARD **and** the faculty_email stamped on the pulse.
--     Both must move together (see the inline note): fixing only the guard would
--     let the Senior Learner open a pulse that is then anchored to nobody, which
--     fn_live_poll_can_manage reads back to refuse them manage rights on the
--     pulse they just opened.
--
--  3. fn_scf_pending_for_learner — DISPLAY ONLY. `faculty_name` on the learner's
--     pending-feedback card, blank today for a team-taught class.
--
--  4. fn_scf_prepared_pulse_sweep — the faculty_email stamped on an auto-opened
--     pulse anchor. Same argument as (2). The sweep's row selection never
--     filtered on faculty, so no session starts or stops being swept.
--
-- WHICH SENIOR LEARNER GETS THE SESSION
--
-- The single-primary convention #2860 established, for the same reason: 9,996
-- of 9,996 team-taught arrays on production carry exactly one is_primary:true.
-- The helper returns that one (array: is_primary, else the first with an email,
-- else the first; object: as-is; anything else: NULL) and never raises.
-- ----------------------------------------------------------------------------
-- ⛔ WHAT THIS MIGRATION DELIBERATELY DOES **NOT** CHANGE
--
-- fn_scf_micro_next_item carries the same object-only read and is LEFT AS IS.
-- It is not an oversight and it should not be "finished" in a follow-up without
-- a decision from the Director.
--
-- That function offers a learner ONE micro-question from audit_parameter_catalog
-- and writes carre_micro_impressions(teacher_email, teacher_staff_id, ...).
-- The CP-* catalogue is not session-level; every prompt is about a PERSON:
--   CP-RS2 "This Senior Learner treats every learner the same, whoever they are."
--   CP-RS1 "Mistakes are corrected privately — nobody is shamed in front of the class."
--   CP-A2  "When someone struggles in a session, this Senior Learner follows up."
-- 18,877 impressions across 172 people already feed fn_classroom_practice_compare
-- and fn_classroom_practice_sealed_comments, which compare individuals.
--
-- Today a team-taught slot yields v_email = NULL and the function returns
-- {'reason':'no_attributable_session'} — the learner is simply not asked. That
-- is a gap, but routing it through the reader would silently begin recording a
-- learner's judgement of "this Senior Learner" against the PRIMARY alone, for a
-- class two people taught, in a record that carries no hint it was shared — and
-- the learner is never shown a name, so they cannot know which of the two they
-- are being asked about. Attributing appraisal-grade rows to a possibly-wrong
-- named individual is worse than the present silence.
--
-- Fixing it needs a product answer first (ask about the primary only and say so
-- in the prompt / ask about each teacher separately / keep skipping team-taught
-- classes). A guard widening restores access someone already had a right to; a
-- personnel record does not have that property. Deliberately out of scope.
-- ----------------------------------------------------------------------------
-- WHAT DOES NOT CHANGE
--
-- All four functions are rebuilt from their LIVE pg_get_functiondef as of
-- 2026-08-15, not from a repo file. Only the expressions above differ (plus the
-- comments explaining them); signature, volatility, SECURITY DEFINER,
-- search_path and every other line are byte-identical to what is running.
--
-- Each live ACL is re-asserted verbatim, per the standing anon-revoke rule —
-- CREATE OR REPLACE re-fires Supabase's ALTER DEFAULT PRIVILEGES grant to anon.
-- Note the ACLs are NOT uniform: fn_scf_prepared_pulse_sweep is a cron entry
-- point granted to postgres + service_role ONLY, with no `authenticated` grant.
-- Granting it to authenticated here would hand every signed-in user a
-- write-path kill-switch bypass. Section 4 and the closing guard both keep it
-- service_role-only.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Refuse to apply without the helper. See the ORDERING DEPENDENCY note above.
-- ----------------------------------------------------------------------------
DO $dep$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_attendance_slot_faculty'
  ) THEN
    RAISE EXCEPTION
      'public.fn_attendance_slot_faculty(jsonb) is missing — apply migration 20260812010000_scf_submit_feedback_team_taught_faculty.sql (PR #2860) FIRST, then re-run this one';
  END IF;
END
$dep$;

-- ----------------------------------------------------------------------------
-- 1. fn_scf_faculty_pending_roster — rebuilt from the LIVE definition.
--    Only the authorization expression on the marked line differs.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_faculty_pending_roster(p_attendance_date date, p_timetable_id uuid, p_period_id text)
 RETURNS TABLE(student_name text, register_number text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Updated: 2026-08-15 — resolve the teacher through the both-shapes reader.
  -- `-> 'assigned_faculty' ->> 'faculty_email'` returned NULL on the ARRAY shape,
  -- so a team-taught teacher failed this guard on their own class. The guard is
  -- otherwise unchanged: same lower(), same comparison, same v_email.
  IF lower(public.fn_attendance_slot_faculty(v_pv) ->> 'faculty_email') IS DISTINCT FROM v_email THEN
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
$function$
;

-- Restore the exact live ACL (postgres / authenticated / service_role; no anon).
REVOKE EXECUTE ON FUNCTION public.fn_scf_faculty_pending_roster(date,uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_faculty_pending_roster(date,uuid,text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. fn_scf_open_pulse — rebuilt from the LIVE definition.
--    Two expressions differ: the authorization guard, and the faculty_email
--    stamped onto the pulse row. They must move together.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_open_pulse(p_attendance_date date, p_timetable_id uuid, p_period_id text)
 RETURNS scf_live_pulse
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email      text;
  v_role_ok    boolean;
  v_is_faculty boolean;
  v_pv         jsonb;
  v_inst       uuid;
  v_existing   public.scf_live_pulse;
  v_row        public.scf_live_pulse;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_open_pulse: not authenticated'; END IF;
  SELECT lower(p.email),
         (p.is_super_admin = true
          OR public.user_has_permission('academic.live_poll.manage'))
    INTO v_email, v_role_ok
  FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RAISE EXCEPTION 'fn_scf_open_pulse: no profile'; END IF;

  SELECT sa.institution_id, sa.attendance_data -> p_period_id
    INTO v_inst, v_pv
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id
    AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  LIMIT 1;
  IF v_pv IS NULL THEN RAISE EXCEPTION 'fn_scf_open_pulse: no such session (timetable/date/period)'; END IF;

  -- Updated: 2026-08-15 — resolve the teacher through the both-shapes reader.
  -- `-> 'assigned_faculty' ->> 'faculty_email'` returned NULL on the ARRAY shape,
  -- so a team-taught teacher failed this guard on their own class. The guard is
  -- otherwise unchanged: same lower(), same comparison, same v_email.
  v_is_faculty := (lower(public.fn_attendance_slot_faculty(v_pv) ->> 'faculty_email') IS NOT DISTINCT FROM v_email);
  -- Institution gate: a privileged role only counts if it has access to THIS
  -- class's institution (super-admin bypasses). No cross-tenant pulses.
  IF NOT (v_is_faculty
          OR (COALESCE(v_role_ok, false)
              AND (public.is_super_admin() OR public.role_has_institution_access(v_inst)))) THEN
    RAISE EXCEPTION 'fn_scf_open_pulse: only the assigned faculty or an HOD/admin of this institution can open a pulse';
  END IF;

  -- Serialise concurrent opens for the SAME class so two callers cannot both
  -- create an open pulse (txn-scoped; released at commit/rollback).
  PERFORM pg_advisory_xact_lock(hashtext(p_timetable_id::text || '|' || p_attendance_date::text || '|' || p_period_id));

  -- Idempotent: reuse an already-open, non-expired pulse for this exact class.
  SELECT * INTO v_existing
  FROM public.scf_live_pulse lp
  WHERE lp.timetable_id = p_timetable_id
    AND lp.attendance_date = p_attendance_date
    AND lp.period_id = p_period_id
    AND lp.is_open = true
    AND lp.auto_close_at > now()
  ORDER BY lp.issued_at DESC
  LIMIT 1;
  IF v_existing.id IS NOT NULL THEN RETURN v_existing; END IF;

  INSERT INTO public.scf_live_pulse (
    institution_id, timetable_id, attendance_date, period_id,
    course_code, course_name, faculty_email, is_open, issued_at, auto_close_at, created_by
  )
  VALUES (
    v_inst, p_timetable_id, p_attendance_date, p_period_id,
    v_pv ->> 'course_code', v_pv ->> 'course_name',
    -- Updated: 2026-08-15 — same reader. This column is NOT a record of who
    -- clicked open (that is created_by, set from auth.uid() below); it is
    -- whose CLASS the pulse belongs to, and fn_live_poll_can_manage compares
    -- a caller against it. Left NULL on the array shape, the pulse the
    -- team-taught teacher just opened would immediately refuse them manage
    -- rights and credit nobody in fn_scf_facilitator_pulse. Must move in
    -- lock-step with the guard above, or this function half-works.
    public.fn_attendance_slot_faculty(v_pv) ->> 'faculty_email',
    true, now(), now() + interval '240 minutes', auth.uid()
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$
;

-- Restore the exact live ACL (postgres / authenticated / service_role; no anon).
REVOKE EXECUTE ON FUNCTION public.fn_scf_open_pulse(date,uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_open_pulse(date,uuid,text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. fn_scf_pending_for_learner — rebuilt from the LIVE definition.
--    Only the faculty_name output column differs (display label).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_pending_for_learner(p_lookback_days integer DEFAULT 30)
 RETURNS TABLE(attendance_date date, timetable_id uuid, period_id text, section_id uuid, course_id uuid, course_code text, course_name text, faculty_name text, period_name text, start_time text, end_time text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid; v_max_hours integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_pending_for_learner: not authenticated'; END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  -- Widest feedback window configured for ANY institution (fallback 48h).
  -- Rows older than this cannot satisfy the exact two-sided window below,
  -- so they are skipped BEFORE the JSONB roster explosion.
  SELECT COALESCE(max(public.fn_get_policy_int('session_feedback.window_hours', 48, i.id)), 48)
    INTO v_max_hours
    FROM public.institutions i;

  RETURN QUERY
  WITH wh AS (
    SELECT i.id AS institution_id,
           public.fn_get_policy_int('session_feedback.window_hours', 48, i.id) AS hours
      FROM public.institutions i
  )
  SELECT sa.attendance_date, sa.timetable_id, period.key AS period_id,
         NULLIF(period.value ->> 'section_id','')::uuid AS section_id,
         NULLIF(period.value ->> 'course_id','')::uuid AS course_id,
         period.value ->> 'course_code'  AS course_code,
         period.value ->> 'course_name'  AS course_name,
         -- Updated: 2026-08-15 — same reader. On the ARRAY shape this label was
         -- blank, so a learner's pending-feedback card for a team-taught class
         -- named no teacher at all. Shows the PRIMARY, which is exactly who
         -- fn_scf_submit_feedback (PR #2860) attributes the learner's answer to
         -- — the label and the destination now agree. Display only; it is not
         -- compared, joined or written anywhere.
         public.fn_attendance_slot_faculty(period.value) ->> 'faculty_name' AS faculty_name,
         period.value ->> 'period_name'  AS period_name,
         period.value ->> 'start_time'   AS start_time,
         period.value ->> 'end_time'     AS end_time
  FROM public.student_attendance sa
  LEFT JOIN wh ON wh.institution_id = sa.institution_id,
       jsonb_each(sa.attendance_data) AS period
  WHERE sa.attendance_date >= (CURRENT_DATE - p_lookback_days)
    -- NEW sargable prefilter: strictly weaker than the exact window check
    -- (day granularity, +1 day slack, widest institution window).
    AND sa.attendance_date >= (CURRENT_DATE - (v_max_hours / 24 + 1))
    -- NEW containment prefilter: a row that never mentions this learner's id
    -- anywhere in attendance_data cannot produce a Present match below.
    AND strpos(lower(sa.attendance_data::text), lower(v_lp::text)) > 0
    -- Exact two-sided window, per-institution hours resolved from the 14-row
    -- map (identical value by construction; NULL institution falls back to
    -- the original per-row call).
    AND now() <= (sa.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
          + make_interval(hours => COALESCE(wh.hours,
              public.fn_get_policy_int('session_feedback.window_hours', 48, sa.institution_id)))
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(
                      public.fn_attendance_slot_students(period.value)) st
      WHERE CASE
              WHEN (st ->> 'student_id') ~
                   '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              THEN (st ->> 'student_id')::uuid END = v_lp
        AND st ->> 'status' = 'Present'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.session_feedback f
      WHERE f.student_id = v_lp
        AND f.attendance_date = sa.attendance_date
        AND (
          f.period_id = period.key
          OR (NULLIF(period.value ->> 'course_id','') IS NOT NULL
              AND f.course_id = NULLIF(period.value ->> 'course_id','')::uuid)
        )
    )
  ORDER BY sa.attendance_date DESC, period.value ->> 'start_time';
END;
$function$
;

-- Restore the exact live ACL (postgres / authenticated / service_role; no anon).
REVOKE EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(integer) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. fn_scf_prepared_pulse_sweep — rebuilt from the LIVE definition.
--    Only the faculty_email stamped onto the auto-opened pulse anchor differs.
--
--    ⚠️ ACL EXCEPTION: this is a cron entry point behind the
--    scf.prepared_pulse.enabled kill switch. Its live ACL is postgres +
--    service_role ONLY — deliberately NOT authenticated, unlike the three
--    above. Re-assert exactly that; do not copy the grant line from sections
--    1-3.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_prepared_pulse_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled          boolean;
  v_today            date;
  v_close            timestamptz;
  v_rec              record;
  v_anchor           uuid;
  v_poll_id          uuid;
  v_qid              uuid;
  v_opened           int := 0;
  v_candidates       int := 0;
  v_skipped_holiday  int := 0;
BEGIN
  -- Kill switch (gates the only write path). Fail-safe to OFF.
  SELECT (value #>> '{}')::boolean INTO v_enabled
    FROM public.platform_policies
   WHERE policy_key = 'scf.prepared_pulse.enabled' AND scope_type = 'global' AND is_active
   LIMIT 1;
  IF COALESCE(v_enabled, false) = false THEN
    RETURN jsonb_build_object('enabled', false, 'opened', 0);
  END IF;

  -- Only same-day sessions auto-open (IST wall-clock date).
  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  -- Close at 21:00 IST of the day the pulse opens — IDENTICAL to
  -- fn_live_poll_open_class_poll (decision #37), so an auto-opened pulse and a
  -- team-member-opened one have the same answer window. If the sweep runs after
  -- 21:00 IST (rare), give +2h so the pulse is not born already closed.
  v_close := (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') + interval '21 hours') AT TIME ZONE 'Asia/Kolkata';
  IF v_close <= now() THEN v_close := now() + interval '2 hours'; END IF;

  FOR v_rec IN
    SELECT csl.timetable_id,
           csl.attendance_date,
           csl.period_id,
           sa.institution_id,
           sa.attendance_data -> csl.period_id AS pv
    FROM public.class_session_lesson csl
    JOIN public.curriculum_lesson l
      ON l.id = csl.lesson_id AND l.status = 'published'          -- topic set (D coverage)
    JOIN public.student_attendance sa
      ON sa.timetable_id = csl.timetable_id
     AND sa.attendance_date = csl.attendance_date
     AND sa.attendance_data ? csl.period_id                      -- attendance marked
    WHERE csl.attendance_date = v_today
      AND EXISTS (                                               -- >=1 Present (someone can answer)
        SELECT 1
        FROM jsonb_array_elements(sa.attendance_data -> csl.period_id -> 'students') st
        WHERE st ->> 'status' = 'Present'
      )
      AND NOT EXISTS (                                           -- idempotent + never clobber a teacher poll
        SELECT 1
        FROM public.scf_live_pulse a
        JOIN public.induction_session_poll p
          ON p.context_type = 'class_session' AND p.context_id = a.id
        WHERE a.timetable_id   = csl.timetable_id
          AND a.attendance_date = csl.attendance_date
          AND a.period_id       = csl.period_id
      )
  LOOP
    v_candidates := v_candidates + 1;

    -- Cancelled = a declared, approved, institution-scope holiday over the date.
    IF EXISTS (
      SELECT 1 FROM public.institution_leaves il
      WHERE il.status = 'approved'
        AND il.scope_level = 'institution'
        AND il.institution_id = v_rec.institution_id
        AND v_rec.attendance_date BETWEEN il.start_date AND il.end_date
    ) THEN
      v_skipped_holiday := v_skipped_holiday + 1;
      CONTINUE;
    END IF;

    -- Serialise per session anchor (belt-and-braces; the cron is single-worker).
    PERFORM pg_advisory_xact_lock(
      hashtext(v_rec.timetable_id::text || '|' || v_rec.attendance_date::text || '|' || v_rec.period_id));

    SELECT a.id INTO v_anchor
    FROM public.scf_live_pulse a
    WHERE a.timetable_id = v_rec.timetable_id
      AND a.attendance_date = v_rec.attendance_date
      AND a.period_id = v_rec.period_id
    ORDER BY a.issued_at DESC
    LIMIT 1;

    IF v_anchor IS NULL THEN
      INSERT INTO public.scf_live_pulse (
        institution_id, timetable_id, attendance_date, period_id,
        course_code, course_name, faculty_email, is_open, issued_at, auto_close_at, created_by)
      VALUES (
        v_rec.institution_id, v_rec.timetable_id, v_rec.attendance_date, v_rec.period_id,
        v_rec.pv ->> 'course_code',
        v_rec.pv ->> 'course_name',
        -- Updated: 2026-08-15 — same reader, same reason as fn_scf_open_pulse:
        -- an auto-opened pulse on a team-taught class was anchored with no
        -- teacher, so the teacher could not manage the poll the sweep opened
        -- on their behalf. The sweep's own selection is unchanged — it has
        -- never filtered on faculty, so no session starts or stops sweeping.
        public.fn_attendance_slot_faculty(v_rec.pv) ->> 'faculty_email',
        false, now(), v_close, NULL)
      RETURNING id INTO v_anchor;
    END IF;

    -- Re-check inside the lock: another run (or a team member) may have just
    -- created a poll for this anchor. Never clobber it.
    IF EXISTS (
      SELECT 1 FROM public.induction_session_poll p
      WHERE p.context_type = 'class_session' AND p.context_id = v_anchor
    ) THEN
      CONTINUE;
    END IF;

    -- Create the minimal loop poll, OPEN, with the single understood question.
    INSERT INTO public.induction_session_poll
      (context_type, context_id, institution_id, created_by, status, issued_at, auto_close_at)
    VALUES
      ('class_session', v_anchor, v_rec.institution_id, NULL, 'open', now(), v_close)
    RETURNING id INTO v_poll_id;

    INSERT INTO public.induction_session_poll_question
      (poll_id, prompt, kind, position, scale_min_label, scale_max_label, loop_role)
    VALUES
      (v_poll_id, 'How well did you follow today''s session?', 'scale', 0, 'Lost', 'Fully followed', 'understood')
    RETURNING id INTO v_qid;

    INSERT INTO public.induction_session_poll_option (question_id, label, position)
    SELECT v_qid, g::text, g - 1 FROM generate_series(1, 5) AS g;

    UPDATE public.induction_session_poll
      SET current_question_id = v_qid
      WHERE id = v_poll_id;

    -- Sync the anchor pulse so learner discovery + the honest source label treat
    -- it as live (identical to a team-member-opened poll).
    UPDATE public.scf_live_pulse
      SET is_open = true, issued_at = now(), auto_close_at = v_close, updated_at = now()
      WHERE id = v_anchor;

    v_opened := v_opened + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'enabled', true, 'date', v_today,
    'candidates', v_candidates, 'opened', v_opened, 'skipped_holiday', v_skipped_holiday);
END;
$function$
;

-- Restore the exact live ACL (postgres / service_role ONLY — no authenticated, no anon).
REVOKE EXECUTE ON FUNCTION public.fn_scf_prepared_pulse_sweep() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_scf_prepared_pulse_sweep() TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Self-guard: fail the migration rather than ship a silent regression.
--    Modelled on 20260815090000 (#3092), extended for this file's ACL exception
--    and for the one function that must NOT have been touched.
-- ----------------------------------------------------------------------------
DO $guard$
DECLARE
  v_arr  jsonb := '{"assigned_faculty":[
                      {"faculty_id":"11111111-1111-1111-1111-111111111111",
                       "faculty_name":"Second Teacher",
                       "faculty_email":"second@jkkn.ac.in","is_primary":false},
                      {"faculty_id":"22222222-2222-2222-2222-222222222222",
                       "faculty_name":"Primary Teacher",
                       "faculty_email":"primary@jkkn.ac.in","is_primary":true}]}'::jsonb;
  v_obj  jsonb := '{"assigned_faculty":
                      {"faculty_id":"33333333-3333-3333-3333-333333333333",
                       "faculty_name":"Solo Teacher",
                       "faculty_email":"solo@jkkn.ac.in"}}'::jsonb;
  v_none jsonb := '{"course_code":"X"}'::jsonb;
BEGIN
  -- ---- the premise, negative-controlled --------------------------------------
  -- The old expression must genuinely have been broken on the array shape. If
  -- this ever starts returning a value, the reason this file exists has changed
  -- and every claim in the header needs re-verifying before it is applied.
  IF (v_arr -> 'assigned_faculty' ->> 'faculty_email') IS NOT NULL
     OR (v_arr -> 'assigned_faculty' ->> 'faculty_name') IS NOT NULL THEN
    RAISE EXCEPTION 'guard: the pre-fix expression unexpectedly resolved on an array — re-verify the defect';
  END IF;

  -- ---- the fix ---------------------------------------------------------------
  IF lower(public.fn_attendance_slot_faculty(v_arr) ->> 'faculty_email') IS DISTINCT FROM 'primary@jkkn.ac.in' THEN
    RAISE EXCEPTION 'guard: array shape did not resolve to the is_primary faculty';
  END IF;
  -- faculty_name is read too (section 3), so assert that key as well — not just
  -- faculty_email — or a reader that returned a name-less object would pass.
  IF public.fn_attendance_slot_faculty(v_arr) ->> 'faculty_name' IS DISTINCT FROM 'Primary Teacher' THEN
    RAISE EXCEPTION 'guard: array shape did not carry the primary faculty_name';
  END IF;

  -- ---- the 81% majority path must be untouched -------------------------------
  IF lower(public.fn_attendance_slot_faculty(v_obj) ->> 'faculty_email') IS DISTINCT FROM 'solo@jkkn.ac.in'
     OR lower(public.fn_attendance_slot_faculty(v_obj) ->> 'faculty_email')
        IS DISTINCT FROM lower(v_obj -> 'assigned_faculty' ->> 'faculty_email')
     OR public.fn_attendance_slot_faculty(v_obj) ->> 'faculty_name'
        IS DISTINCT FROM (v_obj -> 'assigned_faculty' ->> 'faculty_name') THEN
    RAISE EXCEPTION 'guard: object shape regressed — the 81%% majority path must be unchanged';
  END IF;

  -- A slot with no faculty must stay unmatched (NULL), never match a caller.
  -- The two guards here are IS DISTINCT FROM / IS NOT DISTINCT FROM against a
  -- caller email, so a non-NULL sentinel would be a real authorization bug.
  IF public.fn_attendance_slot_faculty(v_none) ->> 'faculty_email' IS NOT NULL THEN
    RAISE EXCEPTION 'guard: a slot with no assigned_faculty must resolve to NULL';
  END IF;

  -- ---- signatures + SECURITY DEFINER survived the rebuild ---------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_scf_faculty_pending_roster'
      AND p.prosecdef
      AND pg_get_function_identity_arguments(p.oid) = 'p_attendance_date date, p_timetable_id uuid, p_period_id text'
  ) THEN RAISE EXCEPTION 'guard: fn_scf_faculty_pending_roster signature/security changed'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_scf_open_pulse'
      AND p.prosecdef
      AND pg_get_function_identity_arguments(p.oid) = 'p_attendance_date date, p_timetable_id uuid, p_period_id text'
  ) THEN RAISE EXCEPTION 'guard: fn_scf_open_pulse signature/security changed'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_scf_pending_for_learner'
      AND p.prosecdef
      AND pg_get_function_identity_arguments(p.oid) = 'p_lookback_days integer'
  ) THEN RAISE EXCEPTION 'guard: fn_scf_pending_for_learner signature/security changed'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_scf_prepared_pulse_sweep'
      AND p.prosecdef
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN RAISE EXCEPTION 'guard: fn_scf_prepared_pulse_sweep signature/security changed'; END IF;

  -- ---- ACLs re-asserted exactly, including the non-uniform one ----------------
  IF has_function_privilege('anon', 'public.fn_scf_faculty_pending_roster(date,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_scf_open_pulse(date,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_scf_pending_for_learner(integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_scf_prepared_pulse_sweep()', 'EXECUTE') THEN
    RAISE EXCEPTION 'guard: these functions must not be reachable by anon';
  END IF;

  -- The three user-facing RPCs stay callable by a signed-in caller — a REVOKE
  -- typo here would take the working 81%% offline while "fixing" the 19%%.
  IF NOT (has_function_privilege('authenticated', 'public.fn_scf_faculty_pending_roster(date,uuid,text)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.fn_scf_open_pulse(date,uuid,text)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.fn_scf_pending_for_learner(integer)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'guard: a session-feedback RPC lost its authenticated grant';
  END IF;

  -- ... and the cron sweep stays service_role-only. It is the write path behind
  -- the kill switch; an accidental authenticated grant would let any signed-in
  -- user open pulses and polls across every institution.
  IF has_function_privilege('authenticated', 'public.fn_scf_prepared_pulse_sweep()', 'EXECUTE') THEN
    RAISE EXCEPTION 'guard: fn_scf_prepared_pulse_sweep must stay service_role-only, never authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.fn_scf_prepared_pulse_sweep()', 'EXECUTE') THEN
    RAISE EXCEPTION 'guard: fn_scf_prepared_pulse_sweep lost its service_role grant — the cron would stop';
  END IF;

  -- ---- the four bodies really are routed through the reader -------------------
  -- Catches a copy-paste that kept an old expression in one of them.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('fn_scf_faculty_pending_roster','fn_scf_open_pulse',
                          'fn_scf_pending_for_learner','fn_scf_prepared_pulse_sweep')
        AND p.prosrc LIKE '%fn_attendance_slot_faculty%') <> 4 THEN
    RAISE EXCEPTION 'guard: one of the four functions is not routed through fn_attendance_slot_faculty';
  END IF;

  -- And no object-only faculty read survives in any of the four. prosrc keeps
  -- comments, and the notes above quote the broken expression verbatim, so this
  -- has to be checked line by line with `--` lines excluded — a plain LIKE over
  -- prosrc matches this file's own documentation and fails a correct migration.
  -- (It did, on the first rehearsal run.)
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL regexp_split_to_table(p.prosrc, E'\n') AS ln
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_scf_faculty_pending_roster','fn_scf_open_pulse',
                        'fn_scf_pending_for_learner','fn_scf_prepared_pulse_sweep')
      AND ln !~ '^\s*--'
      AND ln LIKE '%''assigned_faculty'' ->>%') THEN
    RAISE EXCEPTION 'guard: an object-only assigned_faculty read survived the rebuild';
  END IF;

  -- ---- and the one that must NOT have been touched ---------------------------
  -- fn_scf_micro_next_item is out of scope on purpose (see the header). If a
  -- later edit routes it through the reader, that is a personnel-data decision
  -- and it must not arrive as a side effect of this file.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_scf_micro_next_item'
      AND p.prosrc LIKE '%fn_attendance_slot_faculty%') THEN
    RAISE EXCEPTION 'guard: fn_scf_micro_next_item was changed — that needs a Director decision, not this migration';
  END IF;
END
$guard$;

COMMIT;
