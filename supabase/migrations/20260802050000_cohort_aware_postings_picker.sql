-- 2026-08-02 — The Postings picker must offer EVERY activated teaching cohort,
-- not only MBA.
--
-- WHAT IS WRONG TODAY
-- The Improvement Board's Postings screen decides who may be posted to a
-- department by calling public.fn_mba_list_associates(). Its eligibility filter
-- is a hardcoded role name:
--
--     WHERE cr.role_key = 'mba_associate' AND cr.is_active
--
-- It never reads the cohort configuration. The rest of the teaching-enterprise
-- spine WAS generalised in 20260727010000 / 20260727040000:
-- public.teaching_enterprise_cohorts carries learner_role_key precisely so the
-- role is not hardcoded, and fn_teaching_cohort_sync honours it. Two cohort rows
-- exist right now — mba_associate (is_active = true) and cse_resident
-- (is_active = false, learner_role_key 'cse_resident', semester_orders {5,6,7}).
--
-- WHY IT MATTERS
-- The moment an administrator flips CSE Resident on at /admin/teaching-cohorts,
-- CSE residents receive the cse_resident role and can OPEN the Improvement Board
-- (cse_resident already carries improvement.ideas.view = true) — but they never
-- appear in the Postings picker, so they can never be posted to a department, so
-- they can never record a gemba visit. Permanent spectators, with no error
-- anywhere to explain it.
--
-- Everything else on that path is already generic. public.mba_associate_postings
-- has NO role constraint (associate_user_id is just a foreign key to profiles),
-- and fn_gemba_observation_record checks THE POSTING, not the role. This single
-- lookup is the entire blockage.
--
-- WHAT THIS MIGRATION CHANGES — exactly one predicate
-- CREATE OR REPLACE of fn_mba_list_associates() authored from the LIVE definition
-- (pg_get_functiondef, read 2026-08-01), with the hardcoded role swapped for the
-- learner roles of ACTIVE cohorts. Signature, RETURNS TABLE shape, the
-- SELECT DISTINCT list, the ORDER BY and the authorisation guard are byte-for-byte
-- unchanged. The function is deliberately NOT renamed: the name reaches into
-- lib/services/mba-analyst/mba-analyst-service.ts and the Postings client, and
-- renaming it is a separate decision.
--
-- NO REGRESSION, PROVEN BEFORE WRITING THIS FILE: with only the MBA cohort active
-- (today's real state) the old predicate and the new predicate select the SAME 45
-- people. The new predicate's subquery returns exactly {'mba_associate'} today.
--
-- STILL HARDCODED, DELIBERATELY OUT OF SCOPE (Director to rank separately):
-- fn_mba_associate_sync, fn_mba_faculty_sync, fn_mba_rotation_generate and
-- fn_mba_rotation_apply each still carry a literal 'mba_associate'.
-- fn_mba_analyst_views, fn_teaching_cohort_options and fn_teaching_cohort_resolve
-- already read the cohort configuration.
--
-- This migration does NOT activate the CSE Resident cohort. That toggle belongs
-- to the administrator; this only makes the toggle actually work.

CREATE OR REPLACE FUNCTION public.fn_mba_list_associates()
RETURNS TABLE (user_id uuid, name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('improvement.board.manage')) THEN
    RAISE EXCEPTION 'not authorized: improvement.board.manage required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT DISTINCT p.id, p.full_name, p.email
    FROM user_roles ur
    JOIN custom_roles cr ON cr.id = ur.role_id
    JOIN profiles p ON p.id = ur.user_id
    -- CHANGED (and the only change): eligibility now follows the cohort
    -- configuration instead of a hardcoded role name.
    WHERE cr.is_active AND cr.role_key IN (
      SELECT tec.learner_role_key
      FROM public.teaching_enterprise_cohorts tec
      WHERE tec.is_active
    )
    ORDER BY p.full_name;
END;
$fn$;

COMMENT ON FUNCTION public.fn_mba_list_associates() IS
  'Board-manager-only picker source: the learners holding the learner role of ANY ACTIVE teaching_enterprise_cohorts row (id, full_name, email). Cohort-aware since 2026-08-02 — previously hardcoded to mba_associate, which made every non-MBA cohort unpostable the moment it was activated. SECDEF because user_roles SELECT is self-scoped for non-admins. Name kept for caller compatibility (mba-analyst-service.ts, Postings client).';

-- Anon lock-out, re-asserted because CREATE OR REPLACE can re-arm Supabase's
-- default ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon.
REVOKE EXECUTE ON FUNCTION public.fn_mba_list_associates() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_list_associates() TO authenticated;
