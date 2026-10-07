-- =====================================================================
-- HR memo detector ledgers: super admins only may read them
-- Migration: 20271008110108 (follow-up to #4151 review, finding 3)
-- =====================================================================
-- WHY: 20270613101223 let `is_super_admin() OR is_admin()` read
-- hr_memo_detector_runs and hr_memo_nudges, with no college scope. Both hold
-- team member ids, memo ids, memo types and recipient profile ids (the runs'
-- `details` list does so even in a dry run). The memos they describe,
-- public.hr_memos, are readable only by a super admin or the team member the
-- memo is about (20260620_hr_memos.sql). So a college admin could read, for
-- EVERY college, what they cannot read in hr_memos itself.
--
-- WHAT: the two SELECT policies now match hr_memos — super admins only.
-- ALTER POLICY in place (no DROP). Writes are unchanged: neither table has a
-- write policy; the cron writes with the service role.
--
-- No function is created or replaced. No transaction control.
-- =====================================================================

ALTER POLICY hr_memo_detector_runs_select ON public.hr_memo_detector_runs
  USING ((SELECT public.is_super_admin()));

ALTER POLICY hr_memo_nudges_select ON public.hr_memo_nudges
  USING ((SELECT public.is_super_admin()));

-- Guard — RAISE EXCEPTION, never NOTICE
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_bad
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('hr_memo_detector_runs', 'hr_memo_nudges')
     AND (cmd <> 'SELECT' OR qual IS NULL OR qual ILIKE '%is_admin%' OR qual NOT ILIKE '%is_super_admin%');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'hr memo detector ledgers must be readable by super admins only (found %)', v_bad;
  END IF;

  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename IN ('hr_memo_detector_runs', 'hr_memo_nudges')) <> 2 THEN
    RAISE EXCEPTION 'expected exactly one policy on each hr memo detector ledger';
  END IF;
END $$;
