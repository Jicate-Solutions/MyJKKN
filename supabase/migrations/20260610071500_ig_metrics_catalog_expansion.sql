-- Created: 2026-06-10 — IG metric-catalog expansion (ContentStudio-parity sprint)
--
-- Adds the storage columns for the expanded Instagram insights the
-- metrics-poller will start writing: account-level reach/impressions/
-- profile-views/engagement metrics, hourly-audience + demographics JSONB,
-- and per-post likes + reels watch-time. All columns NULLABLE — the poller
-- backfills going forward; historical snapshots stay NULL.
--
-- Companion code lanes (same sprint): poller enrichment, insights API
-- routes, drilldown UI, insights dashboard. Applied live via exec_sql on
-- 2026-06-10; this file is the audit trail (PR #1252 convention).

-- ── ig_account_metrics: account-level insight columns ──────────────────
ALTER TABLE public.ig_account_metrics
  ADD COLUMN IF NOT EXISTS reach BIGINT NULL,
  ADD COLUMN IF NOT EXISTS impressions BIGINT NULL,
  ADD COLUMN IF NOT EXISTS profile_views INTEGER NULL,
  ADD COLUMN IF NOT EXISTS website_clicks INTEGER NULL,
  ADD COLUMN IF NOT EXISTS accounts_engaged INTEGER NULL,
  ADD COLUMN IF NOT EXISTS total_interactions INTEGER NULL,
  ADD COLUMN IF NOT EXISTS online_followers JSONB NULL,
  ADD COLUMN IF NOT EXISTS follower_demographics JSONB NULL;

COMMENT ON COLUMN public.ig_account_metrics.online_followers IS
  'Latest online_followers insight: {"0": n, ..., "23": n} — followers online per hour (UTC). Written by instagram-metrics-poller.';
COMMENT ON COLUMN public.ig_account_metrics.follower_demographics IS
  'Latest follower_demographics insight (age/gender/city/country breakdowns, raw Meta shape). Requires >=100 followers; NULL otherwise.';

-- ── ig_post_metrics: per-post likes + reels watch-time ──────────────────
ALTER TABLE public.ig_post_metrics
  ADD COLUMN IF NOT EXISTS likes INTEGER NULL,
  ADD COLUMN IF NOT EXISTS plays INTEGER NULL,
  ADD COLUMN IF NOT EXISTS total_watch_time_ms BIGINT NULL,
  ADD COLUMN IF NOT EXISTS avg_watch_time_ms INTEGER NULL;

COMMENT ON COLUMN public.ig_post_metrics.plays IS
  'Reels plays (ig_reels_aggregated_all_plays_count / views). NULL for non-reel media.';
COMMENT ON COLUMN public.ig_post_metrics.avg_watch_time_ms IS
  'Reels average watch time in milliseconds (ig_reels_avg_watch_time). NULL for non-reel media.';
