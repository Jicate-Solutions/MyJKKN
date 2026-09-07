-- ============================================================================
-- Session feedback: a team-taught session must not lose the teacher's name
-- Created: 2026-08-05
-- ----------------------------------------------------------------------------
-- THE DEFECT
--
-- fn_scf_submit_feedback resolved the teacher with
--
--     v_period -> 'assigned_faculty' ->> 'faculty_email'
--     v_period -> 'assigned_faculty' ->> 'faculty_id'
--
-- but `assigned_faculty` is written in TWO shapes by the attendance marker
-- (app/(routes)/academic/attendance/mark/page.tsx, ~line 1357):
--
--     assignedStaff.length  > 1  ->  ARRAY  [{faculty_id, faculty_name,
--                                             faculty_email, is_primary}, ...]
--     assignedStaff.length == 1  ->  OBJECT  {faculty_id, faculty_name,
--                                             faculty_email}
--
-- On the ARRAY shape, `->>` with a TEXT key returns NULL — silently, with no
-- error and no log line. So every team-taught session wrote a feedback row
-- with faculty_id = NULL and faculty_email = NULL even though the teacher was
-- sitting right there in the JSON. The learner's answer was recorded; the
-- teacher it was about was not.
--
-- MEASURED ON PRODUCTION 2026-08-05 (whole table, not a sample):
--
--   session_feedback                                 135,861 rows
--   faculty_email IS NULL                             19,804 rows (14.58%)
--   ... of which faculty_id is ALSO NULL               19,804 (100%)
--
-- Re-resolving each of those 19,804 against the attendance blob TODAY:
--
--   assigned_faculty is an ARRAY        9,996  <- this defect
--   assigned_faculty key ABSENT         8,080  <- nothing to read, ever
--   assigned_faculty is an OBJECT       1,728  <- see SECOND DEFECT below
--
-- Every one of the 9,996 arrays has length > 1 (they are genuinely
-- team-taught), carries at least one usable faculty_email, and contains
-- EXACTLY ONE element flagged `is_primary: true` — 9,996 of 9,996, with zero
-- arrays carrying two primaries and zero carrying none.
--
-- WHICH TEACHER THE ROW SHOULD NAME
--
-- Because the data gives a unique `is_primary` in 100% of cases, this is not a
-- coin flip: the row records the PRIMARY teacher. session_feedback has one
-- faculty_id/faculty_email pair per row, so a single teacher must be chosen,
-- and `is_primary` is the marker's own declaration of which one that is.
-- Order of preference, each step justified by what the data actually shows:
--
--   1. the element with is_primary = true      (present in 9,996/9,996)
--   2. else the first element with a non-empty faculty_email
--   3. else the first element
--
-- Steps 2 and 3 never fire on today's data; they exist so a future array
-- written without the flag degrades to naming SOMEBODY rather than silently
-- naming nobody — which is the exact failure this migration exists to end.
-- Step 1 matches the precedent already set in TypeScript, where
-- attendance-report-service.ts:1004 reads `assigned_faculty[0]` for the array
-- shape; taking the declared primary is strictly better than taking index 0.
--
-- This DOES mean a co-teacher on a team-taught session is not named on the
-- row. That is a deliberate, reversible narrowing: naming the primary is
-- correct for the escalation path (one addressee per class), and the full
-- roster remains in the attendance blob for anyone who needs it. Recording
-- all co-teachers would require a second table and is not attempted here.
--
-- SECOND DEFECT (measured, NOT fixed here)
--
-- The 1,728 OBJECT-shaped rows are NOT explained by the array bug — `->>`
-- works fine on an object. All 1,728 carry a usable faculty_email today, and
-- all 1,728 (100%) sit on an attendance blob whose updated_at is LATER than
-- the feedback row's created_at. So the faculty was assigned AFTER the learner
-- submitted: at submit time there was genuinely nothing to read. That is a
-- write-ordering problem, not a shape problem, and fixing it needs a decision
-- about back-writing identity onto existing rows. Out of scope for this PR.
--
-- THIRD DEFECT (measured, FIXED here)
--
-- The `LIMIT 1` that picks the student_attendance row had NO ORDER BY, and 186
-- of the 1,601 distinct (timetable_id, attendance_date, period_id) keys behind
-- these NULLs match MORE THAN ONE student_attendance row (up to 5). Which of
-- those rows won — and therefore which teacher received the weekly HOD
-- escalation — was decided by the planner, not by a rule. Naming the WRONG
-- teacher to their HOD is worse than naming none, so this is now ordered.
--
-- Rule: the most recently edited attendance row wins —
--   ORDER BY sa.updated_at DESC, sa.id DESC
-- with id as a deterministic tiebreak so two equal timestamps cannot
-- reintroduce the coin flip. public.student_attendance.updated_at is
-- timestamptz NOT NULL, so this needs no schema change.
--
-- NO BACKFILL. This migration changes the WRITE PATH only. The 19,804 existing
-- rows are untouched; recovering 9,996 + 1,728 = 11,724 of them is a separate,
-- explicit decision.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. The both-shapes reader.
--
-- Deliberately mirrors public.fn_attendance_slot_students(jsonb), which already
-- exists for exactly this reason on the ROSTER side of the same blob (PR #1865:
-- a normal slot stores students[], a subdivided lab stores groups[].students[]).
-- This is the faculty twin of that helper, not a new mechanism.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_attendance_slot_faculty(p_period jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  -- Returns ONE faculty object {faculty_id, faculty_name, faculty_email, ...}
  -- for a period, whichever shape attendance/mark wrote, or NULL when the blob
  -- genuinely carries no faculty. NEVER raises: `is_primary` is compared as
  -- text rather than cast to boolean, so a malformed flag degrades to "not
  -- primary" instead of raising 22P02 and aborting the caller's submit.
  SELECT CASE jsonb_typeof(p_period -> 'assigned_faculty')

    WHEN 'array' THEN COALESCE(
      -- 1. the element the marker declared primary (9,996/9,996 on prod)
      (SELECT e FROM jsonb_array_elements(p_period -> 'assigned_faculty')
                       WITH ORDINALITY AS t(e, ord)
        WHERE lower(e ->> 'is_primary') = 'true'
        ORDER BY ord LIMIT 1),
      -- 2. else the first element that actually carries an email
      (SELECT e FROM jsonb_array_elements(p_period -> 'assigned_faculty')
                       WITH ORDINALITY AS t(e, ord)
        WHERE NULLIF(e ->> 'faculty_email', '') IS NOT NULL
        ORDER BY ord LIMIT 1),
      -- 3. else the first element at all
      (SELECT e FROM jsonb_array_elements(p_period -> 'assigned_faculty')
                       WITH ORDINALITY AS t(e, ord)
        ORDER BY ord LIMIT 1))

    WHEN 'object' THEN p_period -> 'assigned_faculty'

    ELSE NULL
  END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_attendance_slot_faculty(jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_attendance_slot_faculty(jsonb) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. fn_scf_submit_feedback — rebuilt from the LIVE pg_get_functiondef as of
--    2026-08-05, not from a repo file. Only the faculty resolution and the new
--    warning differ; every other line is byte-identical to what is running.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_submit_feedback(
  p_attendance_date date,
  p_timetable_id uuid,
  p_period_id text,
  p_understood smallint,
  p_checklist jsonb DEFAULT '{}'::jsonb,
  p_free_text text DEFAULT NULL::text,
  p_source text DEFAULT 'async'::text)
RETURNS session_feedback
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lp       uuid;
  v_period   jsonb;
  v_present  boolean;
  v_inst     uuid;
  v_src      text;
  v_row      public.session_feedback;
  v_window_hours integer;
  v_faculty    jsonb;
  v_fac_email  text;
  v_fac_id     uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: not authenticated';
  END IF;
  IF p_understood IS NULL OR p_understood < 1 OR p_understood > 5 THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: understood must be 1..5';
  END IF;
  v_src := COALESCE(p_source, 'async');
  IF v_src NOT IN ('async','live_poll') THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: source must be async|live_poll';
  END IF;

  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: caller is not a learner';
  END IF;

  SELECT sa.institution_id, sa.attendance_data -> p_period_id
    INTO v_inst, v_period
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id
    AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  -- Most recently edited wins. 186 of 1,601 keys match up to 5 rows; without
  -- this ORDER BY the planner decided which teacher the HOD escalation named.
  -- sa.id DESC is the deterministic tiebreak for equal timestamps.
  ORDER BY sa.updated_at DESC, sa.id DESC
  LIMIT 1;

  IF v_period IS NULL THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: no such session (timetable/date/period)';
  END IF;

  v_window_hours := public.fn_get_policy_int('session_feedback.window_hours', 48, v_inst);
  IF now() > (p_attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
             + make_interval(hours => v_window_hours) THEN
    RAISE EXCEPTION 'The feedback window for this class has closed — feedback can be given up to % hours after the class day.', v_window_hours;
  END IF;

  -- Guard the ::uuid cast with a CASE so it can NEVER run on a non-UUID (guaranteed
  -- order): a malformed/empty roster student_id would otherwise raise 22P02 and
  -- abort the submit for EVERY learner in this class. Malformed -> NULL -> excluded.
  -- Subdivided practical/lab periods (2026-07-25): a subdivided slot keeps
  -- its roster in groups[].students[] and leaves the top-level students[]
  -- array EMPTY, so a Present check must read the effective roster for BOTH
  -- shapes. Same semantics as slotStudents() in
  -- lib/services/academic/attendance-report-service.ts (PR #1865).
  -- The ::uuid cast carries the same regex-CASE guard as
  -- fn_scf_submit_feedback (migration 20260722062012): reading group
  -- rosters widens what this cast sees, and a malformed roster id would
  -- otherwise raise 22P02 and abort the read for EVERY learner in the
  -- session. Malformed -> NULL -> excluded.
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
                    public.fn_attendance_slot_students(v_period)) st
    WHERE CASE
            WHEN (st ->> 'student_id') ~
                 '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            THEN (st ->> 'student_id')::uuid END = v_lp
      AND st ->> 'status' = 'Present'
  ) INTO v_present;

  IF NOT v_present THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: caller was not marked Present in this session';
  END IF;

  IF v_src = 'live_poll' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.scf_live_pulse lp
      WHERE lp.timetable_id = p_timetable_id
        AND lp.attendance_date = p_attendance_date
        AND lp.period_id = p_period_id
        AND lp.is_open = true
        AND lp.auto_close_at > now()
    ) THEN
      v_src := 'async';
    END IF;
  END IF;

  -- Updated: 2026-08-05 — resolve the teacher through the both-shapes reader.
  -- `v_period -> 'assigned_faculty' ->> 'faculty_email'` returned NULL on the
  -- ARRAY shape, so team-taught sessions lost the teacher's identity.
  v_faculty   := public.fn_attendance_slot_faculty(v_period);
  v_fac_email := NULLIF(v_faculty ->> 'faculty_email', '');

  -- Same regex-CASE guard as the roster cast above, for the same reason and now
  -- with an extra one: reading the ARRAY shape WIDENS what this cast sees. A
  -- malformed faculty_id inside a team-taught array previously never reached
  -- the cast; it does now, and unguarded it would raise 22P02 and abort the
  -- submit for every learner in the class. Malformed -> NULL.
  v_fac_id := CASE
                WHEN (v_faculty ->> 'faculty_id') ~
                     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                THEN (v_faculty ->> 'faculty_id')::uuid
              END;

  -- Make the loss LOUD. A NULL written with no signal is precisely what let
  -- this run unnoticed from the table's first row (2026-06-08) to today. The
  -- submit still succeeds — the learner's answer is never thrown away for an
  -- administrative gap — but the gap now leaves a trace, and it names the shape
  -- so a reader can tell "the faculty was there and we failed to read it" from
  -- "there was no faculty in the blob".
  IF v_fac_email IS NULL AND v_fac_id IS NULL THEN
    RAISE WARNING 'fn_scf_submit_feedback: unattributed session — no faculty identity resolved (timetable=%, date=%, period=%, assigned_faculty_shape=%)',
      p_timetable_id, p_attendance_date, p_period_id,
      COALESCE(jsonb_typeof(v_period -> 'assigned_faculty'), 'key_absent');
  END IF;

  INSERT INTO public.session_feedback (
    institution_id, student_id, attendance_date, timetable_id, period_id,
    section_id, course_id, course_code, course_name, faculty_id, faculty_email,
    understood, checklist, free_text, source
  )
  VALUES (
    v_inst, v_lp, p_attendance_date, p_timetable_id, p_period_id,
    NULLIF(v_period ->> 'section_id','')::uuid,
    NULLIF(v_period ->> 'course_id','')::uuid,
    v_period ->> 'course_code',
    v_period ->> 'course_name',
    v_fac_id,
    v_fac_email,
    p_understood, COALESCE(p_checklist,'{}'::jsonb), p_free_text, v_src
  )
  ON CONFLICT (student_id, attendance_date, period_id) DO UPDATE SET
    understood = EXCLUDED.understood,
    checklist  = EXCLUDED.checklist,
    free_text  = EXCLUDED.free_text,
    source     = EXCLUDED.source,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- Restore the exact live ACL (postgres / authenticated / service_role; no anon).
REVOKE EXECUTE ON FUNCTION public.fn_scf_submit_feedback(date,uuid,text,smallint,jsonb,text,text) FROM anon, PUBLIC;
-- ci:allow-secdef-authenticated Learner self-service: called from the browser as the signed-in
-- learner (lib/services/session-feedback-service.ts via createClientSupabaseClient), so
-- authenticated is the only path that works. The body gates the caller five ways before any
-- write: rejects auth.uid() IS NULL; requires the caller to resolve to a learner via
-- learners_profiles.profile_id = auth.uid(); requires the session to exist; requires the
-- feedback window to still be open; and requires the caller to have been marked Present in
-- that exact session roster. student_id is hardcoded from the resolved learner and the upsert
-- keys on (student_id, attendance_date, period_id), so a caller can only write their own row.
GRANT  EXECUTE ON FUNCTION public.fn_scf_submit_feedback(date,uuid,text,smallint,jsonb,text,text) TO authenticated, service_role;

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
  v_bad  jsonb := '{"assigned_faculty":[{"faculty_id":"not-a-uuid",
                       "faculty_email":"","is_primary":"yes"}]}'::jsonb;
BEGIN
  IF has_function_privilege('anon', 'public.fn_scf_submit_feedback(date,uuid,text,smallint,jsonb,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_attendance_slot_faculty(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'guard: session-feedback functions must not be reachable by anon';
  END IF;

  -- the whole point of this migration: the ARRAY shape must resolve the PRIMARY
  IF public.fn_attendance_slot_faculty(v_arr) ->> 'faculty_email' IS DISTINCT FROM 'primary@jkkn.ac.in' THEN
    RAISE EXCEPTION 'guard: array shape did not resolve to the is_primary faculty';
  END IF;
  -- the object shape must keep working exactly as before
  IF public.fn_attendance_slot_faculty(v_obj) ->> 'faculty_email' IS DISTINCT FROM 'solo@jkkn.ac.in' THEN
    RAISE EXCEPTION 'guard: object shape regressed';
  END IF;
  -- a blob with no faculty must resolve to NULL, not to an empty object
  IF public.fn_attendance_slot_faculty(v_none) IS NOT NULL THEN
    RAISE EXCEPTION 'guard: missing assigned_faculty should resolve to NULL';
  END IF;
  -- a malformed array must degrade, never raise
  IF public.fn_attendance_slot_faculty(v_bad) ->> 'faculty_id' IS DISTINCT FROM 'not-a-uuid' THEN
    RAISE EXCEPTION 'guard: malformed array element should still be returned verbatim';
  END IF;
END
$guard$;

COMMIT;
