-- Schedule pg_cron jobs that refresh the two dashboard matviews every 30 minutes.
-- Idempotent: unschedule any prior job with the same name first.
--
-- Cadence rationale: matches existing always-on matview refresh pattern
--   (mv_engagement_overview every 15min, refresh_lifecycle_dashboard_view every 5min).
--   CONCURRENTLY refresh on a 35-row matview is microsecond-cost; running 24/7
--   avoids IST-window timezone arithmetic and ensures leaderboards stay fresh
--   for late-evening / weekend Director check-ins.
--
-- Function being called: public.fn_refresh_dashboard_views(p_which text)
--   p_which='conversion' -> v_dashboard_conversion_monthly
--   p_which='sla'        -> v_dashboard_sla_daily
--
-- Required by P0 outcome metric: dashboard leaderboard freshness window.
-- Applied via Supabase MCP at 2026-05-03 08:31 UTC (14:01 IST). First scheduled
-- fire: 09:00 UTC. This file mirrors the live state for git history.

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job
    WHERE jobname IN ('refresh-dashboard-conversion', 'refresh-dashboard-sla')
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'refresh-dashboard-conversion',
  '*/30 * * * *',
  $$SELECT public.fn_refresh_dashboard_views('conversion');$$
);

SELECT cron.schedule(
  'refresh-dashboard-sla',
  '*/30 * * * *',
  $$SELECT public.fn_refresh_dashboard_views('sla');$$
);
