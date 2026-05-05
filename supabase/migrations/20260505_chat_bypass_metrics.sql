-- Migration: chat_bypass_metrics
-- Date: 2026-05-05
-- Owner: chat-bypass-workflow-gravity Sprint 1, Agent B
--
-- Background
-- ──────────
-- Chat-bypass spec §10 open question 6 deferred measurement infrastructure:
--   "A proper measurement would automate this as a weekly cron writing to a
--    chat_bypass_metrics table."
--
-- Currently every chat-bypass scan is manual via gws-cli. Without this infra,
-- the Day-30 verdict on May 26 will be a one-off snapshot with no historical
-- trend, and Sprint 2/3 will have no measurement substrate.
--
-- The meta-metric (gross 7-day decision-request count across all 67 active
-- spaces) is currently moving the WRONG direction:
--   - 365-day baseline: 577
--   - 7-day projected:  1,512/yr (2.6× growth)
-- This infra makes that visible to the Director on the dashboard daily.
--
-- Schema
-- ──────
-- One row per (scan_date, bucket). 18 rows per weekly run. Idempotent re-runs
-- via UPSERT on the (scan_date, bucket) unique constraint.
--
-- The 18-bucket taxonomy is hardcoded in the cron writer (see
-- app/api/cron/chat-bypass-scan/route.ts). Per Q1 default rule, value lists
-- in multi-tenant systems should be CRUDable — this is a deferred follow-up
-- for Sprint 4 once the taxonomy stabilizes.
--
-- RLS
-- ───
-- Bypass-classifier output is sensitive (a list of "decision-requests
-- bypassing modules" leaks org politics). Only super_admin SELECTs.
-- service_role retains insert/update access for the cron writer.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_bypass_metrics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_date   date NOT NULL,
  bucket      text NOT NULL,
  count_7d    integer NOT NULL DEFAULT 0,
  count_30d   integer NOT NULL DEFAULT 0,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT chat_bypass_metrics_scan_date_bucket_uniq
    UNIQUE (scan_date, bucket)
);

-- Trend index: descending scan_date for "latest week first" reads.
CREATE INDEX IF NOT EXISTS idx_chat_bypass_metrics_scan_date_bucket
  ON public.chat_bypass_metrics (scan_date DESC, bucket);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — super_admin only
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.chat_bypass_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_bypass_metrics_super_admin_select
  ON public.chat_bypass_metrics;

CREATE POLICY chat_bypass_metrics_super_admin_select
  ON public.chat_bypass_metrics
  FOR SELECT
  TO authenticated
  USING (is_super_admin());

-- service_role bypasses RLS by default; no explicit policy needed for the
-- cron writer. Authenticated non-super_admin users get zero rows.

-- ─────────────────────────────────────────────────────────────────────────
-- fn_chat_bypass_trend — sparkline-ready JSONB for dashboard card
-- ─────────────────────────────────────────────────────────────────────────
-- Returns the latest p_days of scans for either:
--   (a) a single bucket if p_bucket is non-null, OR
--   (b) the gross total across all buckets per scan_date if p_bucket IS NULL
--
-- Output shape (newest-first):
--   {
--     "bucket": "events" | "ALL",
--     "days": 30,
--     "scans": [{"date": "2026-05-05", "count_7d": 81, "count_30d": 246}, ...],
--     "current_7d": 81,
--     "median_4w": 65,
--     "top_buckets": [{"bucket": "events", "count_7d": 81}, ...]   // only if p_bucket IS NULL
--   }
--
-- SECURITY DEFINER + super_admin gate inside body so non-super_admin callers
-- get an empty result instead of silent table read.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chat_bypass_trend(
  p_bucket text DEFAULT NULL,
  p_days   integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_scans       jsonb;
  v_current_7d  integer;
  v_median_4w   numeric;
  v_top_buckets jsonb;
  v_cutoff      date;
BEGIN
  -- Gate: super_admin only. Non-super_admin gets empty result, never error.
  IF NOT is_super_admin() THEN
    RETURN jsonb_build_object(
      'bucket', COALESCE(p_bucket, 'ALL'),
      'days', p_days,
      'scans', '[]'::jsonb,
      'current_7d', 0,
      'median_4w', 0,
      'top_buckets', '[]'::jsonb
    );
  END IF;

  v_cutoff := CURRENT_DATE - (p_days || ' days')::interval;

  IF p_bucket IS NOT NULL THEN
    -- Single-bucket trend
    SELECT jsonb_agg(
      jsonb_build_object(
        'date', scan_date,
        'count_7d', count_7d,
        'count_30d', count_30d
      ) ORDER BY scan_date DESC
    ) INTO v_scans
    FROM public.chat_bypass_metrics
    WHERE bucket = p_bucket
      AND scan_date >= v_cutoff;

    SELECT count_7d INTO v_current_7d
    FROM public.chat_bypass_metrics
    WHERE bucket = p_bucket
    ORDER BY scan_date DESC
    LIMIT 1;

    -- 4-week median: last 4 distinct scan_dates for this bucket
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY count_7d) INTO v_median_4w
    FROM (
      SELECT count_7d
      FROM public.chat_bypass_metrics
      WHERE bucket = p_bucket
      ORDER BY scan_date DESC
      LIMIT 4
    ) recent;

    v_top_buckets := '[]'::jsonb;
  ELSE
    -- Gross total across all buckets per scan_date
    SELECT jsonb_agg(
      jsonb_build_object(
        'date', scan_date,
        'count_7d', total_7d,
        'count_30d', total_30d
      ) ORDER BY scan_date DESC
    ) INTO v_scans
    FROM (
      SELECT
        scan_date,
        SUM(count_7d)::integer  AS total_7d,
        SUM(count_30d)::integer AS total_30d
      FROM public.chat_bypass_metrics
      WHERE scan_date >= v_cutoff
      GROUP BY scan_date
    ) totals;

    SELECT SUM(count_7d)::integer INTO v_current_7d
    FROM public.chat_bypass_metrics
    WHERE scan_date = (SELECT MAX(scan_date) FROM public.chat_bypass_metrics);

    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY week_total) INTO v_median_4w
    FROM (
      SELECT scan_date, SUM(count_7d) AS week_total
      FROM public.chat_bypass_metrics
      GROUP BY scan_date
      ORDER BY scan_date DESC
      LIMIT 4
    ) recent;

    -- Top 3 buckets by current-week count_7d
    SELECT jsonb_agg(
      jsonb_build_object('bucket', bucket, 'count_7d', count_7d)
      ORDER BY count_7d DESC
    ) INTO v_top_buckets
    FROM (
      SELECT bucket, count_7d
      FROM public.chat_bypass_metrics
      WHERE scan_date = (SELECT MAX(scan_date) FROM public.chat_bypass_metrics)
      ORDER BY count_7d DESC
      LIMIT 3
    ) top;
  END IF;

  RETURN jsonb_build_object(
    'bucket', COALESCE(p_bucket, 'ALL'),
    'days', p_days,
    'scans', COALESCE(v_scans, '[]'::jsonb),
    'current_7d', COALESCE(v_current_7d, 0),
    'median_4w', COALESCE(v_median_4w, 0),
    'top_buckets', COALESCE(v_top_buckets, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_chat_bypass_trend(text, integer)
  TO authenticated, service_role;

COMMENT ON TABLE public.chat_bypass_metrics IS
  'Weekly chat-bypass scan results — 18 rows per scan_date (one per module bucket).
   Populated by /api/cron/chat-bypass-scan (Mondays 06:00 IST). Read via
   fn_chat_bypass_trend() — super_admin only. Spec: specs/chat-bypass-workflow-gravity.md §10 q6.';

COMMENT ON FUNCTION public.fn_chat_bypass_trend(text, integer) IS
  'Sparkline-ready JSONB for dashboard chat-bypass trend card. Returns latest
   p_days of scans for a single bucket OR the gross total across all buckets
   when p_bucket IS NULL. Super_admin only — non-super_admin gets empty result.';
