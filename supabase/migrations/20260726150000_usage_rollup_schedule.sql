-- =============================================================================
-- Migration: schedule the usage-analytics rollup + retention routine
-- Date: 2026-07-26
--
-- WHY
--   The four usage-analytics RPCs have existed since 2026-02-06 and have never
--   been called by anything:
--     compute_module_usage_daily / compute_feature_usage_summary /
--     compute_institution_health_scores / archive_old_usage_events
--   Verified 2026-07-26 against prod: usage_events held 25,832 rows while
--   module_usage_daily's newest row was 2026-02-06 — the day the tables were
--   created. A repo-wide grep found ZERO callers, and none of the 116 cron
--   routes covered it.
--
--   This matters because every usage read surface — /api/analytics/usage/
--   dashboard, /modules, /trends, all via LifecycleDashboardService — queries
--   module_usage_daily and institution_health_scores, NOT raw usage_events. So
--   the adoption dashboards have been serving five-and-a-half-month-old numbers,
--   and usage_events grows unbounded because archival never runs either.
--
-- WHAT THIS DOES
--   Seeds ONE ai_routine_schedules row so the AI-routine dispatcher fires
--   /api/cron/usage-rollup daily. No new table, no new function, no grant
--   change — the RPCs and tables all already exist.
--
--   minute_of_day 247 = 04:07 IST. Verified free against prod: the 46 existing
--   schedules occupy 0, 195, 221, 231, 263, 277, 291, 343, 350, 365, 380, 395,
--   405, 410, 420, 435, 473, 480, 495, 545, 555, 563, 570, 581, 585, 615, 630,
--   690, 765, 1170, 1320, 1325, 1340, 1355, 1370. 247 sits clear of the 221/231
--   and 263/277 clusters.
--
-- SAFETY: additive and reversible. Disable with
--   UPDATE ai_routine_schedules SET enabled = false WHERE routine_id = 'usage-rollup';
--   The routine only writes aggregate tables and moves rows into
--   usage_events_archive; it never writes usage_events and emits no learner
--   identities.
--
-- NOTE: ON CONFLICT (routine_id) DO NOTHING is correct here — unlike
--   platform_policies, ai_routine_schedules.routine_id is a plain unique
--   column, not an expression index, so it does not hit the 42P10 pattern.
--   Matches 20260726130000_hr_evidence_snapshots.sql.
--
-- BACKFILL (manual, after this is applied — NOT done by this migration):
--   The Feb-onward history was never rolled up. One manual trigger with
--   ?days=180 processes it; the nightly default window is 2 days.
-- =============================================================================

INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('usage-rollup', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 247)
ON CONFLICT (routine_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Apply-time asserts — fail loudly here rather than the cron failing silently
-- forever (same discipline as 20260726130000_hr_evidence_snapshots.sql).
-- ---------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'compute_module_usage_daily'
  ) THEN
    RAISE EXCEPTION 'compute_module_usage_daily() is missing — usage-rollup would fail every night';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'compute_feature_usage_summary'
  ) THEN
    RAISE EXCEPTION 'compute_feature_usage_summary() is missing — usage-rollup would fail every night';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'compute_institution_health_scores'
  ) THEN
    RAISE EXCEPTION 'compute_institution_health_scores() is missing — usage-rollup would fail every night';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'archive_old_usage_events'
  ) THEN
    RAISE EXCEPTION 'archive_old_usage_events() is missing — retention would never run';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ai_routine_schedules WHERE routine_id = 'usage-rollup'
  ) THEN
    RAISE EXCEPTION 'usage-rollup schedule row was not seeded';
  END IF;
END
$assert$;
