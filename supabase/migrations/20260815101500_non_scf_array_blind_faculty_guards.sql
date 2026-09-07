-- ============================================================================
-- Curriculum + Live Poll: the two AUTHORIZATION GUARDS that cannot see a
-- team-taught teacher
-- Created: 2026-08-15
-- ----------------------------------------------------------------------------
-- 🛑 ORDERING DEPENDENCY — READ FIRST
--
-- This migration REQUIRES public.fn_attendance_slot_faculty(jsonb), created by
-- 20260812010000_scf_submit_feedback_team_taught_faculty.sql (PR #2860, branch
-- fix/session-feedback-faculty-identity-array-shape). That migration is NOT yet
-- merged and the helper does NOT exist on production (verified 2026-08-15:
-- pg_proc count 0). Sibling PR #3092 (20260815090000) carries the same
-- dependency for the session-feedback pair.
--
-- 20260812010000 MUST be applied before this file. Section 0 refuses to apply
-- otherwise, naming the file to run first, so a wrong-order run fails loudly at
-- the first statement instead of leaving half-fixed functions behind.
-- ----------------------------------------------------------------------------
-- THE DEFECT (identical to PR #2860 / PR #3092, different feature)
--
-- `student_attendance.attendance_data -> <period> -> 'assigned_faculty'` is
-- written by the attendance marker in TWO shapes:
--
--     more than one assigned teacher  ->  ARRAY  [{faculty_id, faculty_name,
--                                                  faculty_email, is_primary}, …]
--     exactly one assigned teacher    ->  OBJECT  {faculty_id, faculty_name,
--                                                  faculty_email}
--
-- `->>` with a TEXT key on a JSON ARRAY returns NULL — silently, no error, no
-- log line (verified on production: the expression evaluates to NULL, it does
-- not raise). Both functions below carry that expression and therefore FAIL
-- CLOSED for every team-taught session.
--
-- MEASURED ON PRODUCTION 2026-08-15 (whole table, not a sample), counting every
-- attendance slot that carries an assigned_faculty key:
--
--     object shape   25,766 slots   (8,031 attendance rows)
--     ARRAY  shape    5,952 slots   (3,764 attendance rows)   <- 18.8%
--     absent          3,308 slots
--
--   · distinct sessions that are array-shaped ............ 5,947
--   · date span of array-shaped sessions ................. 2025-06-02 … 2026-08-14
--     (i.e. this is not historical residue — it happened yesterday)
--   · distinct teacher emails appearing inside arrays .... 207
--   · … of whom are the flagged primary of some array .... 140
--   · … of those 140 who have a profiles row ............. 125
--
-- Every one of the 5,952 array slots carries EXACTLY ONE element flagged
-- `is_primary: true` (measured: array lengths 2,3,4,5,6,7,8,9,11,12,14 — in all
-- 5,952 the primary count is 1). So the helper's primary branch is
-- deterministic here; its two fallbacks never fire on today's data.
--
-- WHAT THIS COSTS TODAY, per function
--
--   _fn_curriculum_class_ctx — the shared authority gate for the curriculum /
--   pre-session-materials feature. ALL FIVE of its callers pass
--   p_require_manage = true (verified against live pg_proc:
--   fn_curriculum_class_poll_seed, fn_curriculum_link_lesson,
--   fn_scf_post_session_resource, fn_scf_deactivate_session_resource — and
--   fn_live_poll_upsert_class_poll via the anchor below). It is therefore
--   ALWAYS an authorization guard, never a lookup. On a team-taught session the
--   teacher branch cannot match, so the RPC raises
--       "only the assigned faculty or an HOD/admin of this institution"
--   at a Senior Learner posting material for a class they personally taught.
--
--   _fn_live_poll_ensure_class_anchor — same guard, plus it writes the resolved
--   email into scf_live_pulse.faculty_email when it creates the anchor row. On
--   a team-taught session the guard refuses first, so the anchor is never
--   created and no live poll can be opened for that class at all. Had the guard
--   passed by the admin branch, the anchor row would have been stamped with a
--   NULL faculty_email.
--
-- Why this never became a support ticket: in BOTH functions the admin branch
-- (is_super_admin / role_has_institution_access / the live-poll manage
-- permission) still passes, so the people best placed to reproduce it are
-- exactly the people the guard lets through anyway. The teacher who is blocked
-- has no way to tell a permission refusal from "this feature is not for me".
--
-- A live example from yesterday (2026-08-14), attendance row
-- 85c3ae8a-aacc-47a4-8e96-ccf8bfe912d1:
--     assigned_faculty = [ {…, dhanabalan.s@jkkn.ac.in,  is_primary:true},
--                          {…, vadivelu.ms.c@jkkn.ac.in, is_primary:false} ]
--     old expression  -> 'assigned_faculty' ->> 'faculty_email'  ->  NULL
--     fn_attendance_slot_faculty(v_pv) ->> 'faculty_email'       ->  dhanabalan.s@jkkn.ac.in
--
-- THE FIX
--
-- Route the expression through public.fn_attendance_slot_faculty(jsonb), the
-- IMMUTABLE both-shapes reader from #2860. It returns ONE faculty object
-- whichever shape was written (array: the element flagged is_primary, else the
-- first carrying an email, else the first; object: as-is; anything else: NULL)
-- and never raises.
--
-- WHICH TEACHER GETS THE AUTHORITY — and why primary-only is right HERE
--
-- Same single-primary convention as #2860/#3092. This is a deliberate, narrow
-- WIDENING of two guards: today the set that passes the teacher branch on an
-- array-shaped session is EMPTY; afterwards it is exactly the one flagged
-- primary. Co-teachers gain nothing and lose nothing — they see today what they
-- will see after: nothing. Nobody who can act today loses the ability.
--
-- Primary-only is the correct semantics for a guard because a guard answers a
-- yes/no question about ONE caller ("may you manage this session?"), and the
-- feature's own model already assumes a single owner: scf_live_pulse has ONE
-- faculty_email column, and class_session_lesson has ONE row per
-- (timetable_id, attendance_date, period_id). Granting every co-teacher manage
-- rights would let N people overwrite one another's lesson link and pulse
-- anchor; that is a product decision, not a bug fix, and it is deliberately NOT
-- attempted here.
--
-- NOT IN THIS MIGRATION — get_faculty_attendance_reports
--
-- The third array-blind function found in the same sweep is deliberately left
-- untouched. It is NOT a guard: it is a MEMBERSHIP FILTER deciding which
-- attendance rows appear on a Senior Learner's own report and statistics
-- (lib/services/academic/attendance-report-service.ts, two call sites). It
-- matches on faculty_id and already ORs in marked_by_details.marker_id.
-- Measured on production 2026-08-15: 11,243 (teacher, attendance-row) pairs are
-- missing from those reports today; routing it through this primary-only helper
-- would recover only 2,643 of them (23.5%) and leave 8,600 co-teacher pairs
-- still missing — and of the 17 teachers currently invisible to that report, 8
-- would still be invisible. A partial fix that LOOKS complete is worse than the
-- known defect, so the correct fix there is to enumerate every element of the
-- array (jsonb_array_elements over assigned_faculty), which is a different
-- change with a different blast radius. Tracked separately; see the PR body.
--
-- WHAT DOES NOT CHANGE
--
-- Both functions are rebuilt from their LIVE pg_get_functiondef as of
-- 2026-08-15, not from a repo file. Exactly ONE expression differs in
-- _fn_curriculum_class_ctx and exactly TWO occurrences of the SAME expression
-- differ in _fn_live_poll_ensure_class_anchor; signature, return type,
-- volatility, SECURITY DEFINER, search_path and every other line are
-- byte-identical to what is running. The live ACL (postgres / authenticated /
-- service_role, NO anon) is re-asserted at the end of each — Supabase's ALTER
-- DEFAULT PRIVILEGES re-grants anon EXECUTE on every CREATE OR REPLACE, so this
-- is not theoretical. Reversible by restoring the two bodies quoted above.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Refuse to apply without the helper. See the ORDERING DEPENDENCY note.
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
-- 1. _fn_curriculum_class_ctx — rebuilt from the LIVE definition.
--    Only the v_fac assignment differs.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_curriculum_class_ctx(p_timetable_id uuid, p_attendance_date date, p_period_id text, p_require_manage boolean)
 RETURNS TABLE(institution_id uuid, course_id uuid, course_code text, course_name text, faculty_email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_email text; v_role_ok boolean; v_pv jsonb; v_inst uuid; v_fac text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '_fn_curriculum_class_ctx: not authenticated'; END IF;
  SELECT sa.institution_id, sa.attendance_data -> p_period_id INTO v_inst, v_pv
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  LIMIT 1;
  IF v_pv IS NULL THEN RAISE EXCEPTION '_fn_curriculum_class_ctx: no such session'; END IF;
  -- Updated: 2026-08-15 — resolve the teacher through the both-shapes reader.
  -- The previous expression read the faculty email straight off the
  -- assigned_faculty value with a text key, which yields NULL on the ARRAY shape
  -- written for a team-taught class, so the guard below could never match the
  -- caller and the teacher was refused management of their own session.
  -- Every caller passes p_require_manage = true, so this value's only live use
  -- is that guard (fn_curriculum_link_lesson selects the returned faculty_email
  -- into a local and never reads it; no other caller selects it at all).
  -- NOTE: do not restate the old expression verbatim in this body — the
  -- self-guard in section 3 greps prosrc for it, and comments are part of prosrc.
  v_fac := lower(public.fn_attendance_slot_faculty(v_pv) ->> 'faculty_email');

  IF p_require_manage THEN
    SELECT lower(p.email),
           (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator'])
            OR p.is_super_admin = true)
      INTO v_email, v_role_ok FROM public.profiles p WHERE p.id = auth.uid();
    IF v_email IS NULL THEN RAISE EXCEPTION '_fn_curriculum_class_ctx: no profile'; END IF;
    IF NOT ((v_fac IS NOT DISTINCT FROM v_email)
            OR (COALESCE(v_role_ok,false) AND (public.is_super_admin() OR public.role_has_institution_access(v_inst)))) THEN
      RAISE EXCEPTION '_fn_curriculum_class_ctx: only the assigned faculty or an HOD/admin of this institution';
    END IF;
  END IF;

  RETURN QUERY SELECT v_inst, nullif(v_pv ->> 'course_id','')::uuid,
                      v_pv ->> 'course_code', v_pv ->> 'course_name', v_fac;
END $function$;

-- Restore the exact live ACL (postgres / authenticated / service_role; no anon).
REVOKE EXECUTE ON FUNCTION public._fn_curriculum_class_ctx(uuid,date,text,boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_curriculum_class_ctx(uuid,date,text,boolean) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. _fn_live_poll_ensure_class_anchor — rebuilt from the LIVE definition.
--    The SAME expression differs in exactly two places: the guard, and the
--    faculty_email written onto the anchor row. The helper is IMMUTABLE and
--    v_pv does not change between them, so the two calls are guaranteed to
--    agree — the anchor is always stamped with the teacher the guard admitted.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_live_poll_ensure_class_anchor(p_attendance_date date, p_timetable_id uuid, p_period_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_email text; v_role_ok boolean; v_pv jsonb; v_inst uuid; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '_fn_live_poll_ensure_class_anchor: not authenticated'; END IF;
  SELECT lower(p.email),
         (p.is_super_admin = true
          OR public.user_has_permission('academic.live_poll.manage'))
    INTO v_email, v_role_ok
  FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RAISE EXCEPTION '_fn_live_poll_ensure_class_anchor: no profile'; END IF;

  SELECT sa.institution_id, sa.attendance_data -> p_period_id
    INTO v_inst, v_pv
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  LIMIT 1;
  IF v_pv IS NULL THEN RAISE EXCEPTION '_fn_live_poll_ensure_class_anchor: no such session'; END IF;

  -- Updated: 2026-08-15 — resolve the teacher through the both-shapes reader
  -- (see the header). On the ARRAY shape the old expression was NULL, so this
  -- guard refused the teacher of a team-taught class and no anchor was ever
  -- created for it — the live poll could not be opened at all.
  IF NOT ((lower(public.fn_attendance_slot_faculty(v_pv) ->> 'faculty_email') IS NOT DISTINCT FROM v_email)
          OR (COALESCE(v_role_ok,false) AND (public.is_super_admin() OR public.role_has_institution_access(v_inst)))) THEN
    RAISE EXCEPTION '_fn_live_poll_ensure_class_anchor: only the assigned faculty or an HOD/admin of this institution';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_timetable_id::text || '|' || p_attendance_date::text || '|' || p_period_id));
  SELECT id INTO v_id FROM public.scf_live_pulse
  WHERE timetable_id = p_timetable_id AND attendance_date = p_attendance_date AND period_id = p_period_id
  ORDER BY issued_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- Updated: 2026-08-15 — same both-shapes reader, so the anchor row records the
  -- teacher who was actually admitted above instead of NULL on a team-taught class.
  INSERT INTO public.scf_live_pulse (institution_id, timetable_id, attendance_date, period_id,
    course_code, course_name, faculty_email, is_open, issued_at, auto_close_at, created_by)
  VALUES (v_inst, p_timetable_id, p_attendance_date, p_period_id,
    v_pv ->> 'course_code', v_pv ->> 'course_name', public.fn_attendance_slot_faculty(v_pv) ->> 'faculty_email',
    false, now(), now() + interval '240 minutes', auth.uid())   -- anchor only; not open yet
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

-- Restore the exact live ACL (postgres / authenticated / service_role; no anon).
REVOKE EXECUTE ON FUNCTION public._fn_live_poll_ensure_class_anchor(date,uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_live_poll_ensure_class_anchor(date,uuid,text) TO authenticated, service_role;

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
  -- Neither guard may become anon-reachable. CREATE OR REPLACE re-fires
  -- Supabase's ALTER DEFAULT PRIVILEGES grant to anon, so this is not theoretical.
  IF has_function_privilege('anon', 'public._fn_curriculum_class_ctx(uuid,date,text,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public._fn_live_poll_ensure_class_anchor(date,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'guard: the curriculum / live-poll authority gates must not be reachable by anon';
  END IF;

  -- The whole point: the expression both guards now use must resolve the
  -- PRIMARY teacher on the ARRAY shape, where the old expression gave NULL.
  IF lower(public.fn_attendance_slot_faculty(v_arr) ->> 'faculty_email') IS DISTINCT FROM 'primary@jkkn.ac.in' THEN
    RAISE EXCEPTION 'guard: array shape did not resolve to the is_primary teacher';
  END IF;
  -- Negative control — the pre-fix expression must genuinely have been broken.
  -- If this ever starts returning a value, the premise of this migration has changed.
  IF (v_arr -> 'assigned_faculty' ->> 'faculty_email') IS NOT NULL THEN
    RAISE EXCEPTION 'guard: the pre-fix expression unexpectedly resolved on an array — re-verify the defect';
  END IF;
  -- The object shape (81.2% of slots) must keep working EXACTLY as before.
  IF lower(public.fn_attendance_slot_faculty(v_obj) ->> 'faculty_email') IS DISTINCT FROM 'solo@jkkn.ac.in'
     OR lower(public.fn_attendance_slot_faculty(v_obj) ->> 'faculty_email')
        IS DISTINCT FROM lower(v_obj -> 'assigned_faculty' ->> 'faculty_email') THEN
    RAISE EXCEPTION 'guard: object shape regressed — the 81%% majority path must be unchanged';
  END IF;
  -- A slot with no teacher must stay unmatched (NULL) so the guard still refuses.
  IF public.fn_attendance_slot_faculty(v_none) ->> 'faculty_email' IS NOT NULL THEN
    RAISE EXCEPTION 'guard: a slot with no assigned_faculty must resolve to NULL';
  END IF;

  -- Both functions must still exist with their original signatures, return
  -- kinds and SECURITY DEFINER — a typo in the rebuild would ship silently.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_fn_curriculum_class_ctx'
      AND p.prosecdef AND p.proretset
      AND pg_get_function_identity_arguments(p.oid) = 'p_timetable_id uuid, p_attendance_date date, p_period_id text, p_require_manage boolean'
  ) THEN
    RAISE EXCEPTION 'guard: _fn_curriculum_class_ctx signature/security changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_fn_live_poll_ensure_class_anchor'
      AND p.prosecdef
      AND pg_get_function_identity_arguments(p.oid) = 'p_attendance_date date, p_timetable_id uuid, p_period_id text'
  ) THEN
    RAISE EXCEPTION 'guard: _fn_live_poll_ensure_class_anchor signature/security changed';
  END IF;

  -- Both rebuilt bodies must actually call the helper, and the anchor must call
  -- it TWICE (guard + the faculty_email it stamps on the row). Catches a
  -- copy-paste that kept one of the old expressions.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('_fn_curriculum_class_ctx','_fn_live_poll_ensure_class_anchor')
        AND p.prosrc LIKE '%fn_attendance_slot_faculty%') <> 2 THEN
    RAISE EXCEPTION 'guard: one of the two gates is not routed through fn_attendance_slot_faculty';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = '_fn_live_poll_ensure_class_anchor'
        AND p.prosrc LIKE '%fn_attendance_slot_faculty%fn_attendance_slot_faculty%') <> 1 THEN
    RAISE EXCEPTION 'guard: the live-poll anchor must resolve the teacher twice (guard + stored faculty_email)';
  END IF;
  -- And NO old array-blind expression may survive in either body.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('_fn_curriculum_class_ctx','_fn_live_poll_ensure_class_anchor')
      AND p.prosrc LIKE '%''assigned_faculty'' ->> ''faculty_email''%'
  ) THEN
    RAISE EXCEPTION 'guard: an array-blind assigned_faculty read survived the rebuild';
  END IF;
END
$guard$;

COMMIT;
