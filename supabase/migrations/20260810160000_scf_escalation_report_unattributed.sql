-- ============================================================================
-- SCF weekly escalation: stop DISCARDING the classes that have no addressee,
-- start REPORTING them
-- Created: 2026-08-05
-- ----------------------------------------------------------------------------
-- BACKGROUND — what is already fixed, and what is not.
--
-- PR #2814 (migration 20260809210000, applied to production) added
-- `AND f.faculty_email IS NOT NULL` to fn_scf_apply_weekly_escalation_digest,
-- which stopped the whole weekly digest crashing on
--   'null value in column "faculty_email" of relation
--    "session_feedback_escalations" violates not-null constraint'.
-- That was the right call and this migration does not touch it.
--
-- But it fixed the crash by making the loss SILENT. Today:
--
--   * fn_scf_compute_weekly_escalations still has NO null filter, so it hands
--     the cron route escalations whose faculty_email is NULL. The route then
--     spends a Claude call (or an ai_jobs slot) writing a leadership briefing
--     for each one.
--   * fn_scf_apply_weekly_escalation_digest then filters those same groups out,
--     returns (0, 0), and the route reports `classes_flagged: 0`.
--
-- So a class whose learners said they did not understand is dropped with no
-- count, no log line and no trace anywhere an admin can see. Verified on
-- production 2026-08-05, week beginning 2026-07-27:
--
--   SELECT * FROM fn_scf_compute_weekly_escalations('2026-07-27');
--   -- CME346  faculty_email NULL   7 responses  avg 2.57
--   -- CME365  faculty_email NULL  11 responses  avg 2.73
--
-- Both crossed the escalation threshold. Both reached nobody. Nothing recorded
-- that they existed. A dropped signal nobody can see is how this stayed
-- invisible for weeks, so this migration makes the drop *countable*.
--
-- ----------------------------------------------------------------------------
-- WAS THE FACULTY RECOVERABLE?  Investigated, measured, and rejected.
--
-- 19,661 of 134,177 session_feedback rows (14.7%) carry neither faculty_email
-- nor faculty_id. Two recovery paths were tested against the ~109k rows where
-- the true faculty_email IS known, i.e. where a wrong answer is detectable:
--
--   (1) timetables.timetable_data -> slot_id = session_feedback.period_id
--       -> primary_staff_id -> staff.email
--       100% of timetable_id values resolve, so this LOOKS authoritative.
--       Measured: correct on 74,345 of 109,007 rows and WRONG on 34,662
--       (31.8% wrong), on the identical source ('async') and era as the
--       unattributed rows. Widening to the whole staff_ids array does not help
--       (truth is absent from the slot's staff set on 34,194 rows).
--
--   (2) student_attendance.attendance_data -> period_id -> assigned_faculty,
--       the very source fn_scf_submit_feedback copies from.
--       Object shape: correct on 90,235 of 93,410 (96.6%); the 3.4% residual is
--       attendance edited after the feedback was recorded, not an extraction
--       error. Array shape (the shape that dominates the unattributed rows):
--       correct on only 636 of 1,488 (42.7%) — WRONG more often than right.
--
-- And for the two classes that actually escalated this week, the attendance
-- slot has no `assigned_faculty` key at all, so neither path could ever have
-- named anyone:
--
--   CME346 -> 2 slots, shape '(no assigned_faculty key)'
--   CME365 -> 3 slots, shape '(no assigned_faculty key)'
--
-- An escalation names a teacher to their HOD. Naming the wrong teacher is a
-- worse failure than naming none, so nothing here guesses. Unattributable
-- groups are excluded and counted.
--
-- ----------------------------------------------------------------------------
-- UPSTREAM DEFECT — named here, deliberately NOT fixed by this migration.
-- See the PR body. fn_scf_submit_feedback reads
--   v_period -> 'assigned_faculty' ->> 'faculty_email'
-- but `assigned_faculty` is stored in TWO shapes, and on the array shape
-- (team-taught / multi-staff slots) `->> 'faculty_email'` returns NULL, so the
-- faculty identity is dropped at write time without any error. That is the
-- source of the 19,661 rows and it needs its own change plus a data decision
-- about the rows already written. Out of scope here.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS MIGRATION CHANGES
--   1. fn_scf_compute_weekly_escalations — rebuilt from its LIVE definition
--      (pg_get_functiondef, captured 2026-08-05) with ONE added line,
--      `AND f.faculty_email IS NOT NULL`, so the route stops paying for AI
--      briefings addressed to nobody. Signature and return type unchanged.
--   2. fn_scf_unattributed_escalations — NEW. Returns the groups that crossed
--      the escalation threshold but have no faculty to send to, so the cron can
--      report them. Read-only; writes nothing.
-- fn_scf_apply_weekly_escalation_digest is NOT touched.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) compute: exclude the unattributable groups (the ONLY change vs live)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_compute_weekly_escalations(p_week_start date)
 RETURNS TABLE(institution_id uuid, faculty_email text, course_code text, course_name text, responses bigint, avg_understood numeric, free_texts text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_week_end date := p_week_start + 6;
BEGIN
  RETURN QUERY
  SELECT f.institution_id::uuid,
         lower(f.faculty_email)::text                                   AS faculty_email,
         f.course_code::text,
         max(f.course_name)::text                                       AS course_name,
         count(*)::bigint                                               AS responses,
         round(avg(f.understood)::numeric, 2)                          AS avg_understood,
         COALESCE(
           array_remove(array_agg(NULLIF(btrim(f.free_text), '')), NULL),
           '{}'::text[]
         )                                                              AS free_texts
  FROM public.session_feedback f
  WHERE f.attendance_date BETWEEN p_week_start AND v_week_end
    -- ADDED 2026-08-05: a group with no faculty_email has no addressee. It is
    -- dropped by fn_scf_apply_weekly_escalation_digest anyway (it carries the
    -- same filter since PR #2814), so emitting it here only bought a wasted
    -- Claude call / ai_jobs slot per group. Reported instead by
    -- fn_scf_unattributed_escalations below.
    AND f.faculty_email IS NOT NULL
  GROUP BY f.institution_id, lower(f.faculty_email), f.course_code
  HAVING count(*) >= 3 AND avg(f.understood) < 3
  ORDER BY avg(f.understood) ASC;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 2) NEW: the visible counterpart — what we could NOT escalate, and why
-- ----------------------------------------------------------------------------
-- Grouping note: on the NULL-faculty subset, GROUP BY (institution_id,
-- course_code) is exactly equivalent to compute's
-- GROUP BY (institution_id, lower(faculty_email), course_code) — every row in
-- the subset shares the same NULL faculty_email, and SQL groups NULLs together.
-- So this returns precisely the groups compute used to emit and apply used to
-- discard: verified on production for week 2026-07-27 (CME346 7/2.57,
-- CME365 11/2.73 — the same two rows, same counts, same averages).
--
-- free_text is deliberately NOT returned: this feeds a count and a course list
-- for an operator, never a briefing, and learner comments are held under an
-- anonymity promise. Nothing here needs them.
CREATE OR REPLACE FUNCTION public.fn_scf_unattributed_escalations(p_week_start date)
 RETURNS TABLE(institution_id uuid, course_code text, course_name text, responses bigint, avg_understood numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_week_end date := p_week_start + 6;
BEGIN
  RETURN QUERY
  SELECT f.institution_id::uuid,
         f.course_code::text,
         max(f.course_name)::text             AS course_name,
         count(*)::bigint                     AS responses,
         round(avg(f.understood)::numeric, 2) AS avg_understood
  FROM public.session_feedback f
  WHERE f.attendance_date BETWEEN p_week_start AND v_week_end
    AND f.faculty_email IS NULL
  GROUP BY f.institution_id, f.course_code
  HAVING count(*) >= 3 AND avg(f.understood) < 3
  ORDER BY avg(f.understood) ASC;
END;
$function$;

-- ----------------------------------------------------------------------------
-- Privileges.
-- ----------------------------------------------------------------------------
-- The anon revoke is mandatory (CLAUDE.md): Supabase's ALTER DEFAULT PRIVILEGES
-- grants anon EXECUTE on every new function independently of PUBLIC.
--
-- DELIBERATE DEVIATION from the usual `GRANT TO authenticated` template: this
-- function returns per-course aggregates of anonymous learner feedback and is
-- called only by the service-role cron. Its two siblings are locked the same
-- way -- live ACL on 2026-08-05 for BOTH fn_scf_compute_weekly_escalations and
-- fn_scf_apply_weekly_escalation_digest is exactly
-- {postgres=X/postgres, service_role=X/postgres}, with anon=false and
-- authenticated=false. Granting `authenticated` here would widen learner
-- feedback to every logged-in user, so it is revoked, not granted. Migration
-- 20260809210000 asserts the same invariant for the digest function.
REVOKE EXECUTE ON FUNCTION public.fn_scf_unattributed_escalations(date) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_unattributed_escalations(date) TO service_role;

-- compute's grants are unchanged by CREATE OR REPLACE, but re-assert the anon
-- lock so a future default-privileges change cannot quietly reopen it.
REVOKE EXECUTE ON FUNCTION public.fn_scf_compute_weekly_escalations(date) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_compute_weekly_escalations(date) TO service_role;

-- ----------------------------------------------------------------------------
-- Guards — fail the migration rather than ship a silent regression.
-- ----------------------------------------------------------------------------
DO $guard$
DECLARE n int;
BEGIN
  -- compute must carry the null filter exactly once.
  SELECT (length(pg_get_functiondef(p.oid))
          - length(replace(pg_get_functiondef(p.oid), 'AND f.faculty_email IS NOT NULL', '')))
         / length('AND f.faculty_email IS NOT NULL')
    INTO n
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'fn_scf_compute_weekly_escalations';
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'fn_scf_compute_weekly_escalations: expected exactly 1 null-faculty filter, found %', n;
  END IF;

  -- The digest function must keep the filter PR #2814 gave it.
  SELECT (length(pg_get_functiondef(p.oid))
          - length(replace(pg_get_functiondef(p.oid), 'AND f.faculty_email IS NOT NULL', '')))
         / length('AND f.faculty_email IS NOT NULL')
    INTO n
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'fn_scf_apply_weekly_escalation_digest';
  IF COALESCE(n, 0) < 2 THEN
    RAISE EXCEPTION 'fn_scf_apply_weekly_escalation_digest lost its null-faculty filter (found %) - refusing', n;
  END IF;

  -- Neither function may be reachable by anon or authenticated.
  IF has_function_privilege('anon',          'public.fn_scf_unattributed_escalations(date)', 'EXECUTE')
  OR has_function_privilege('authenticated', 'public.fn_scf_unattributed_escalations(date)', 'EXECUTE')
  OR has_function_privilege('anon',          'public.fn_scf_compute_weekly_escalations(date)', 'EXECUTE')
  OR has_function_privilege('authenticated', 'public.fn_scf_compute_weekly_escalations(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCF escalation functions must not be reachable by anon or authenticated';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.fn_scf_unattributed_escalations(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_scf_unattributed_escalations is not callable by the cron (service_role)';
  END IF;
END
$guard$;

COMMIT;
