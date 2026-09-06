-- ============================================================================
-- Session feedback: the OTHER two functions that cannot see a team-taught teacher
-- Created: 2026-08-15
-- ci:allow-secdef-authenticated fn_scf_faculty_completion is self-scoped: it resolves the caller from auth.uid() (profile email) and returns only sessions where that caller is the assigned teacher; the function and its authenticated grant pre-exist on main — this migration changes only the teacher-slot reader (array-shape aware), not who may call it.
-- ----------------------------------------------------------------------------
-- 🛑 ORDERING DEPENDENCY — READ FIRST
--
-- This migration REQUIRES public.fn_attendance_slot_faculty(jsonb), which is
-- created by migration 20260812010000_scf_submit_feedback_team_taught_faculty.sql
-- (PR #2860, branch fix/session-feedback-faculty-identity-array-shape). That
-- migration is NOT yet merged and the helper does NOT exist on production
-- (verified 2026-08-15: pg_proc count 0).
--
-- 20260812010000 MUST be applied before this file. The DO block in section 0
-- refuses to apply this migration otherwise, with a message naming the file to
-- apply first — so a wrong-order run fails loudly at the first statement
-- instead of leaving two half-fixed functions behind.
-- ----------------------------------------------------------------------------
-- THE DEFECT (the same one PR #2860 fixed in the SUBMIT path)
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
-- `->>` with a TEXT key on an ARRAY returns NULL — silently, no error, no log
-- line. PR #2860 fixed the one call site that WRITES (fn_scf_submit_feedback).
-- These are the two that READ, and they carry the identical expression:
--
--   fn_scf_notify_session_pending  (authorization guard)
--       lower(v_pv -> 'assigned_faculty' ->> 'faculty_email') IS DISTINCT FROM v_email
--
--   fn_scf_faculty_completion      (which sessions are MINE)
--       lower(period.value -> 'assigned_faculty' ->> 'faculty_email') = v_email
--
-- Both FAIL CLOSED. Nothing wrong is written; the team-taught teacher is simply
-- not recognised. Concretely, today:
--
--   · fn_scf_faculty_completion — a team-taught session never joins, so the
--     teacher's completion dashboard shows the class does not exist. Not "0%
--     confirmed" — absent. There is no red flag to chase because there is no row.
--   · fn_scf_notify_session_pending — the authorization guard cannot match the
--     caller, so the teacher is told "not authorized for this session" for a
--     class they taught. The admin branch still lets an is_admin() caller nudge,
--     which is exactly why this never surfaced as a support ticket: the people
--     who could reproduce it were the ones the guard let through anyway.
--
-- Neither function already handles the array shape. Both DO contain
-- `jsonb_array_elements` — over the `'students'` roster, not over
-- assigned_faculty. That coincidence is the reason this pair was missed when
-- #2860 was scoped.
--
-- MEASURED ON PRODUCTION 2026-08-15 (whole table, not a sample) — every
-- attendance slot that carries an assigned_faculty key:
--
--   object shape   25,766 slots   (8,031 attendance rows)
--   ARRAY  shape    5,952 slots   (3,764 attendance rows)   <- 18.8%, invisible
--
-- Distinct faculty emails appearing inside array-shaped slots:        207
-- ... of whom NEVER appear in any object-shaped slot:                  47
--
-- Those 47 teachers have no object-shaped session anywhere in the table. For
-- them fn_scf_faculty_completion returns the empty set for every date range:
-- the feedback-completion feature has never once shown them anything, and they
-- cannot nudge a single one of their own classes. The other 160 see a partial
-- roster of their own teaching. This is a visibility bug, not corruption — no
-- row has to be repaired, only the read has to be fixed.
--
-- A live example, from yesterday (2026-08-14), attendance row
-- 85c3ae8a-aacc-47a4-8e96-ccf8bfe912d1, period 7eb5e61c-…-4ab057e3b95c:
--
--   assigned_faculty = [ {DR. DHANABALAN S,  dhanabalan.s@jkkn.ac.in,  is_primary:true},
--                        {MR. VADIVELU R,    vadivelu.ms.c@jkkn.ac.in, is_primary:false} ]
--
--   old expression  ->> 'faculty_email'                     ->  NULL
--   fn_attendance_slot_faculty(...) ->> 'faculty_email'     ->  dhanabalan.s@jkkn.ac.in
--
-- THE FIX
--
-- Route both expressions through public.fn_attendance_slot_faculty(jsonb), the
-- IMMUTABLE both-shapes reader introduced by #2860. It returns ONE faculty
-- object whichever shape was written (array: the element flagged is_primary,
-- else the first with an email, else the first; object: as-is; anything else:
-- NULL) and never raises.
--
-- WHICH TEACHER GETS THE SESSION
--
-- Same single-primary convention #2860 established, and for the same reason:
-- 9,996 of 9,996 team-taught arrays on production carry exactly one
-- `is_primary: true`. So a team-taught class lands on the PRIMARY teacher's
-- completion list, and the PRIMARY teacher may nudge it. The co-teacher gains
-- nothing here and loses nothing — they see exactly what they see today, which
-- is nothing. Giving every co-teacher their own view of the same session would
-- mean N dashboard rows and N nudge rights for one class, and would change what
-- a "session" means in this feature; that is a product decision, not a bug fix,
-- and it is deliberately NOT attempted in this migration. Narrowing later is
-- possible; this change is reversible by restoring the two dumps below.
--
-- WHAT DOES NOT CHANGE
--
-- Both functions are rebuilt from their LIVE pg_get_functiondef as of
-- 2026-08-15, not from a repo file. Exactly ONE expression differs in each; the
-- signature, volatility, SECURITY DEFINER, search_path, statement_timeout, and
-- every other line are byte-identical to what is running. The live ACL
-- (postgres / authenticated / service_role, no anon) is re-asserted at the end
-- of each, per the standing anon-revoke rule — Supabase's ALTER DEFAULT
-- PRIVILEGES re-grants anon EXECUTE on every CREATE OR REPLACE.
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
-- 1. fn_scf_notify_session_pending — rebuilt from the LIVE definition.
--    Only the authorization expression on the marked line differs.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_notify_session_pending(p_attendance_date date, p_timetable_id uuid, p_period_id text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_email          text;
  v_pv             jsonb;
  v_institution_id uuid;
  v_course         text;
  v_system_actor   uuid;
  v_nudged         int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_notify_session_pending: not authenticated'; END IF;
  SELECT lower(p.email) INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RAISE EXCEPTION 'fn_scf_notify_session_pending: no profile'; END IF;

  -- Resolve the session WITH its institution_id so the admin path can be tenant-bounded.
  SELECT sa.attendance_data -> p_period_id, sa.institution_id
    INTO v_pv, v_institution_id
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id
    AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  LIMIT 1;
  IF v_pv IS NULL THEN RAISE EXCEPTION 'fn_scf_notify_session_pending: no such session'; END IF;

  -- Authorization. The assigned faculty may always nudge their own session. An admin
  -- may also nudge, but ONLY within their OWN tenant — mirror the scope-honest guard in
  -- fn_scf_effective_attendance (super_admin sees all; every other admin is bounded by
  -- role_has_institution_access). Without the institution bound a tenant-A admin could
  -- nudge tenant-B learners (cross-tenant), since the session is resolved by
  -- timetable_id + date alone.
  --
  -- Updated: 2026-08-15 — resolve the teacher through the both-shapes reader.
  -- `v_pv -> 'assigned_faculty' ->> 'faculty_email'` returned NULL on the ARRAY
  -- shape, so the teacher of a team-taught session failed this guard and was
  -- refused permission to nudge their own class. The guard is otherwise
  -- unchanged: it still only WIDENS to the genuinely-assigned teacher, and the
  -- admin branch below it is untouched.
  IF lower(public.fn_attendance_slot_faculty(v_pv) ->> 'faculty_email') IS DISTINCT FROM v_email
     AND NOT (
       is_super_admin()
       OR (is_admin() AND role_has_institution_access(v_institution_id))
     ) THEN
    RAISE EXCEPTION 'fn_scf_notify_session_pending: not authorized for this session';
  END IF;

  -- Two-sided 48h window (Director, 2026-07-08): once the window closed, the
  -- submit RPC rejects learner feedback — a reminder would be a dead end.
  IF now() > (p_attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
             + make_interval(hours => public.fn_get_policy_int(
                 'session_feedback.window_hours', 48, v_institution_id)) THEN
    RAISE EXCEPTION 'The feedback window for this class has closed — learners can no longer submit, so a reminder cannot be sent.';
  END IF;

  v_course := COALESCE(NULLIF(v_pv ->> 'course_name', ''),
                       NULLIF(v_pv ->> 'course_code', ''), 'your class');

  SELECT p.id INTO v_system_actor
  FROM public.profiles p WHERE p.is_super_admin = true ORDER BY p.created_at ASC LIMIT 1;

  WITH present_students AS (
    -- Extract + VALIDATE each Present learner's id ONCE. A malformed blob student_id
    -- ('', 'N/A') cast with ::uuid raises 22P02 and aborts the whole nudge. Guard the
    -- cast with the same UUID-shape regex as fn_scf_effective_attendance, applied AS A
    -- CASE so the cast can never run on a non-UUID (guaranteed order). Malformed ids
    -- become NULL and are dropped below — they simply aren't nudged, never crash.
    SELECT CASE
             WHEN (st ->> 'student_id') ~
                  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             THEN (st ->> 'student_id')::uuid END AS student_uuid
    FROM jsonb_array_elements(v_pv -> 'students') st
    WHERE st ->> 'status' = 'Present'
  ),
  pend AS (
    SELECT DISTINCT lp.profile_id AS recipient_id
    FROM present_students ps
    JOIN public.learners_profiles lp
      ON lp.id = ps.student_uuid
     AND lp.profile_id IS NOT NULL
    WHERE ps.student_uuid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id      = ps.student_uuid
          AND f.attendance_date = p_attendance_date
          AND f.period_id       = p_period_id
          -- Full session identity: feedback for a different class sharing this period
          -- slot must NOT mark the learner confirmed for THIS session (else we skip a
          -- genuinely-pending learner).
          AND f.timetable_id    = p_timetable_id)
  ),
  ins_notif AS (
    INSERT INTO public.notifications (
      id, title, body, url, icon, created_by, targeting,
      priority, category, kind, requires_acknowledgment, is_layer_0,
      idempotency_key, metadata, created_at, updated_at
    )
    SELECT
      gen_random_uuid(),
      'Confirm ' || v_course || ' — 10-second feedback',
      'Your teacher is waiting on your post-class feedback for ' || v_course
        || '. Take 10 seconds to confirm you attended and rate how well you understood it.',
      '/learners/class-feedback',
      'clipboard-check',
      COALESCE(v_system_actor, pend.recipient_id),
      jsonb_build_object('type', 'user', 'user_ids', jsonb_build_array(pend.recipient_id)),
      'normal',
      'dashboard:scf_nudge',
      'work_item',
      FALSE,
      FALSE,
      -- Key includes timetable_id so two sessions that share a period_id on the same
      -- day for the same learner cannot collapse into a single nudge. The day component
      -- is the IST calendar day, NOT the UTC day: CURRENT_DATE rolls at 05:30 IST on a
      -- UTC prod server, which would let the same learner/session be nudged twice across
      -- an IST midnight. (now() AT TIME ZONE 'Asia/Kolkata')::date is IST-anchored,
      -- consistent with the completion-window anchoring above.
      'scf-nudge-session:' || pend.recipient_id::text || ':' || p_attendance_date::text
        || ':' || p_timetable_id::text || ':' || p_period_id || ':'
        || (now() AT TIME ZONE 'Asia/Kolkata')::date::text,
      jsonb_build_object('source', 'scf_faculty_session_nudge',
                         'period_id', p_period_id, 'timetable_id', p_timetable_id),
      NOW(), NOW()
    FROM pend
    -- Atomic idempotency via the partial unique index idx_notifications_idempotency
    -- (ON notifications(idempotency_key) WHERE idempotency_key IS NOT NULL). Repeating
    -- that predicate lets ON CONFLICT infer the partial index, so a concurrent
    -- double-click becomes a no-op instead of a unique_violation that aborts the whole
    -- call. Skipped (conflicting) rows are NOT returned, so the user_notifications
    -- fan-out below stays in lock-step (no orphan rows, no duplicates).
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING id, (targeting -> 'user_ids' ->> 0)::uuid AS recipient_id
  ),
  ins_user AS (
    INSERT INTO public.user_notifications (id, notification_id, user_id, created_at)
    SELECT gen_random_uuid(), n.id, n.recipient_id, NOW() FROM ins_notif n
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_nudged FROM ins_user;

  RETURN v_nudged;
END;
$function$;

-- Restore the exact live ACL (postgres / authenticated / service_role; no anon).
REVOKE EXECUTE ON FUNCTION public.fn_scf_notify_session_pending(date,uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_notify_session_pending(date,uuid,text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. fn_scf_faculty_completion — rebuilt from the LIVE definition.
--    Only the sess CTE's faculty predicate on the marked line differs.
-- ----------------------------------------------------------------------------
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
                 AND f.period_id      = s.period_id
                 -- Key the confirmation match on the FULL session identity
                 -- (see v1 note re: shared period slots).
                 AND f.timetable_id   = s.timetable_id
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

-- Restore the exact live ACL (postgres / authenticated / service_role; no anon).
REVOKE EXECUTE ON FUNCTION public.fn_scf_faculty_completion(date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_faculty_completion(date,date) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Self-guard: fail the migration rather than ship a silent regression.
-- ----------------------------------------------------------------------------
DO $guard$
DECLARE
  v_arr  jsonb := '{"assigned_faculty":[
                      {"faculty_id":"11111111-1111-1111-1111-111111111111",
                       "faculty_email":"second@jkkn.ac.in","is_primary":false},
                      {"faculty_id":"22222222-2222-2222-2222-222222222222",
                       "faculty_email":"primary@jkkn.ac.in","is_primary":true}]}'::jsonb;
  v_obj  jsonb := '{"assigned_faculty":
                      {"faculty_id":"33333333-3333-3333-3333-333333333333",
                       "faculty_email":"solo@jkkn.ac.in"}}'::jsonb;
  v_none jsonb := '{"course_code":"X"}'::jsonb;
BEGIN
  -- Neither function may become anon-reachable. CREATE OR REPLACE re-fires
  -- Supabase's ALTER DEFAULT PRIVILEGES grant to anon, so this is not theoretical.
  IF has_function_privilege('anon', 'public.fn_scf_notify_session_pending(date,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_scf_faculty_completion(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'guard: session-feedback read functions must not be reachable by anon';
  END IF;

  -- The whole point: the expression both functions now use must resolve the
  -- PRIMARY teacher on the ARRAY shape, where the old expression gave NULL.
  IF lower(public.fn_attendance_slot_faculty(v_arr) ->> 'faculty_email') IS DISTINCT FROM 'primary@jkkn.ac.in' THEN
    RAISE EXCEPTION 'guard: array shape did not resolve to the is_primary faculty';
  END IF;
  -- And the old expression must genuinely have been broken — if this ever
  -- starts returning a value, the premise of this migration has changed.
  IF (v_arr -> 'assigned_faculty' ->> 'faculty_email') IS NOT NULL THEN
    RAISE EXCEPTION 'guard: the pre-fix expression unexpectedly resolved on an array — re-verify the defect';
  END IF;
  -- The object shape (81.2% of slots) must keep working EXACTLY as before.
  IF lower(public.fn_attendance_slot_faculty(v_obj) ->> 'faculty_email') IS DISTINCT FROM 'solo@jkkn.ac.in'
     OR lower(public.fn_attendance_slot_faculty(v_obj) ->> 'faculty_email')
        IS DISTINCT FROM lower(v_obj -> 'assigned_faculty' ->> 'faculty_email') THEN
    RAISE EXCEPTION 'guard: object shape regressed — the 81%% majority path must be unchanged';
  END IF;
  -- A slot with no faculty must stay unmatched (NULL), never match a caller.
  IF public.fn_attendance_slot_faculty(v_none) ->> 'faculty_email' IS NOT NULL THEN
    RAISE EXCEPTION 'guard: a slot with no assigned_faculty must resolve to NULL';
  END IF;

  -- Both functions must still exist with their original signatures and
  -- SECURITY DEFINER — a typo in the rebuild would otherwise ship silently.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_scf_notify_session_pending'
      AND p.prosecdef AND pg_get_function_identity_arguments(p.oid) = 'p_attendance_date date, p_timetable_id uuid, p_period_id text'
  ) THEN
    RAISE EXCEPTION 'guard: fn_scf_notify_session_pending signature/security changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_scf_faculty_completion'
      AND p.prosecdef AND pg_get_function_identity_arguments(p.oid) = 'p_from date, p_to date'
  ) THEN
    RAISE EXCEPTION 'guard: fn_scf_faculty_completion signature/security changed';
  END IF;

  -- Both rebuilt bodies must actually call the helper — the one thing this
  -- migration exists to do. Catches a copy-paste that kept the old expression.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('fn_scf_notify_session_pending','fn_scf_faculty_completion')
        AND p.prosrc LIKE '%fn_attendance_slot_faculty%') <> 2 THEN
    RAISE EXCEPTION 'guard: one of the two functions is not routed through fn_attendance_slot_faculty';
  END IF;
END
$guard$;

COMMIT;
