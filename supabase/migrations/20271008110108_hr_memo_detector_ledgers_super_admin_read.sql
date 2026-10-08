-- =====================================================================
-- HR memo detector ledgers: super admins only may read them;
-- one auto memo per event
-- Migration: 20271008110108 (follow-up to #4151 review, finding 3; #4259
-- deep review, finding 1)
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
-- ALTER POLICY in place; nothing is removed. Writes are unchanged: neither
-- table has a write policy; the cron writes with the service role.
--
-- ALSO (#4259 deep review, finding 1): a partial UNIQUE index on
-- hr_memos(triggered_by_event_id). The detector now inserts the memo FIRST,
-- naming its event, and only then marks the event. Two overlapping runs
-- cannot both issue a memo for one event (the second gets 23505), and a run
-- that dies between the two writes leaves the event pending; the next run
-- hits the unique memo and links the event to it. Before this, the event was
-- claimed with a memo id before any memo existed, so a crash in between left
-- it claimed by a memo that never existed — pending reads skip it for good.
-- Manual memos (no event) are NULL here and never collide.
-- PRE-APPLY CHECK: this index cannot build if live hr_memos already holds two
-- memos for one event. Run first; apply only when it returns no rows:
--   SELECT triggered_by_event_id, count(*) FROM public.hr_memos
--    WHERE triggered_by_event_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
--
-- No function is created or replaced. No transaction control.
-- =====================================================================

ALTER POLICY hr_memo_detector_runs_select ON public.hr_memo_detector_runs
  USING ((SELECT public.is_super_admin()));

ALTER POLICY hr_memo_nudges_select ON public.hr_memo_nudges
  USING ((SELECT public.is_super_admin()));

CREATE UNIQUE INDEX IF NOT EXISTS ux_hr_memos_triggered_by_event
  ON public.hr_memos (triggered_by_event_id)
  WHERE triggered_by_event_id IS NOT NULL;

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

  -- Per table: 2 policies on one ledger and 0 on the other must not pass.
  SELECT string_agg(t.tablename || '=' || coalesce(p.n, 0), ', ') INTO v_bad
    FROM (VALUES ('hr_memo_detector_runs'), ('hr_memo_nudges')) AS t(tablename)
    LEFT JOIN (SELECT tablename, count(*) AS n FROM pg_policies
                WHERE schemaname = 'public' GROUP BY tablename) p
      ON p.tablename = t.tablename
   WHERE coalesce(p.n, 0) <> 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'expected exactly one policy on each hr memo detector ledger (found %)', v_bad;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'hr_memos'
       AND indexname = 'ux_hr_memos_triggered_by_event'
       AND indexdef ILIKE 'CREATE UNIQUE INDEX%(triggered_by_event_id)%'
  ) THEN
    RAISE EXCEPTION 'hr_memos must allow only one memo per triggering event (ux_hr_memos_triggered_by_event missing)';
  END IF;
END $$;
