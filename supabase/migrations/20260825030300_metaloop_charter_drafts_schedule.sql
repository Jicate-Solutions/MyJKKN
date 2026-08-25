-- ============================================================================
-- 20260825030300_metaloop_charter_drafts_schedule.sql
-- ----------------------------------------------------------------------------
-- MetaLoop charter-drafting — the dispatcher SCHEDULE row. The AI-routine
-- dispatcher fires ai_routine_schedules rows; this seed row IS the
-- registration. ⛔ vercel.json is deliberately untouched — the hard 100-cron
-- cap fails EVERY build past it (ref feedback_vercel_cron_limit_100_blocks_all_deploys).
--
-- Cadence: WEEKLY, Sundays 10:41 IST (minute_of_day = 641; dispatcher floors
-- to the 10:30 slot). Sunday AFTER loops-regress (07:53 IST) on purpose — the
-- regress writes the week's fresh sim loop_audits rows, and this routine reads
-- loop_audits as charter evidence, so the drafts see this morning's proofs.
-- Off-grid minute (:41, never :00/:30) per the house seed style.
--
-- managed=true → the dispatcher owns the timing (day/time editable on
-- /admin/ai-routines, no deploy). max_only=false → this is a CLOUD cron
-- routine; its Max-lane involvement is the ai_jobs it enqueues, not a
-- maxlane:* runner (same as cac-attendance-rollup / capgap-scan).
--
-- ON CONFLICT DO NOTHING (capgap style): a re-run must never clobber a
-- schedule the Director has since retuned in the UI.
--
-- ORDERING IS SAFE EITHER WAY: applied before the code deploys, the dispatcher
-- logs a harmless 'skipped: not in registry' per week until the deploy lands
-- (the registry entry ships in lib/ai-routines/loop-governance.ts in the same
-- PR); applied after, the first Sunday simply fires.
--
-- Auth compatibility: /api/cron/metaloop-charter-drafts accepts BOTH
-- `Authorization: Bearer` AND `?secret=` (constant-time), so the dispatcher's
-- Bearer-only call and manual query-param triggers both work
-- (ref feedback_cron_auth_must_accept_query_secret).
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; in this file (rollback-rehearsal safe).
-- ============================================================================

INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day, max_only)
VALUES
  ('metaloop-charter-drafts', true, true, ARRAY[0]::smallint[], 641, false)
ON CONFLICT (routine_id) DO NOTHING;

-- Guard: RAISE EXCEPTION, never RAISE NOTICE — a NOTICE-only miss path stamps
-- zero rows and reads as success (ref feedback_a_raise_notice_guard_reads_as_success).
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.ai_routine_schedules
   WHERE routine_id = 'metaloop-charter-drafts';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'metaloop-charter-drafts schedule row missing after seed (count=%)', v_count;
  END IF;
END $$;
