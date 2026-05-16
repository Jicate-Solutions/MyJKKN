-- Add unique indexes required by REFRESH MATERIALIZED VIEW CONCURRENTLY.
--
-- Latent bug exposed by the cron schedule shipped at 08:31 UTC today
-- (migration 20260503083153_cron_refresh_dashboard_views_30min.sql).
-- First cron fire at 09:00 UTC failed for both jobs with:
--
--   ERROR: cannot refresh materialized view "public.v_dashboard_..." concurrently
--   HINT:  Create a unique index with no WHERE clause on one or more columns
--          of the materialized view.
--
-- Both matviews GROUP BY (counselor_id, institution_id) — that's the natural
-- unique key. Pre-existing bug in fn_refresh_dashboard_views: it used
-- CONCURRENTLY but the matviews were created without unique indexes.
--
-- Manual verification post-apply:
--   SELECT public.fn_refresh_dashboard_views('conversion');
--   -> {"ok":true, "ran_at":"2026-05-03T09:01:01...", "refreshed":"v_dashboard_conversion_monthly"}
--   SELECT public.fn_refresh_dashboard_views('sla');
--   -> {"ok":true, "ran_at":"2026-05-03T09:01:01...", "refreshed":"v_dashboard_sla_daily"}

CREATE UNIQUE INDEX IF NOT EXISTS idx_v_dashboard_sla_daily_counselor_institution
  ON public.v_dashboard_sla_daily (counselor_id, institution_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_v_dashboard_conversion_monthly_counselor_institution
  ON public.v_dashboard_conversion_monthly (counselor_id, institution_id);
