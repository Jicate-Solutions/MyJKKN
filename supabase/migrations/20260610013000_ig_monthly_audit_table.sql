-- Created: 2026-06-10 — ig_monthly_audit sink table for /api/cron/instagram-monthly-audit
--
-- The monthly audit cron (registered in vercel.json, schedule 0 6 1 * *) was
-- shipped in the 2026-05-30 Instagram sprint referencing this table, but no
-- migration ever defined it — every per-account upsert failed (captured by
-- the cron's per-account error isolation; surfaced during the 2026-06-10
-- IG monitoring completion sweep, PR #1271).
--
-- Column list mirrors the cron's upsert payload exactly
-- (app/api/cron/instagram-monthly-audit/route.ts, "Write audit summary row").
-- Writes flow through service_role only (RLS bypass); SELECT policy follows
-- the substrate pattern from 20260530140000_instagram_monitoring_substrate.sql.

CREATE TABLE IF NOT EXISTS public.ig_monthly_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_month DATE NOT NULL,
  ig_account_id UUID NOT NULL REFERENCES public.ig_accounts(id) ON DELETE CASCADE,
  total_posts INTEGER NOT NULL DEFAULT 0,
  total_reach BIGINT NOT NULL DEFAULT 0,
  total_impressions BIGINT NOT NULL DEFAULT 0,
  total_comments INTEGER NOT NULL DEFAULT 0,
  total_saves INTEGER NOT NULL DEFAULT 0,
  total_shares INTEGER NOT NULL DEFAULT 0,
  avg_engagement_rate NUMERIC(10, 4),
  follower_count_start INTEGER,
  follower_count_end INTEGER,
  health_score NUMERIC(6, 2),
  is_dormant_alert BOOLEAN NOT NULL DEFAULT FALSE,
  last_post_at TIMESTAMPTZ,
  health_weights_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ig_monthly_audit_month_account_uniq UNIQUE (audit_month, ig_account_id)
);

CREATE INDEX IF NOT EXISTS idx_ig_monthly_audit_account
  ON public.ig_monthly_audit (ig_account_id, audit_month DESC);

ALTER TABLE public.ig_monthly_audit ENABLE ROW LEVEL SECURITY;

-- Institution scope via parent ig_accounts row — same idiom as
-- ig_account_metrics_select in 20260530140000.
DROP POLICY IF EXISTS ig_monthly_audit_select ON public.ig_monthly_audit;
CREATE POLICY ig_monthly_audit_select ON public.ig_monthly_audit
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ig_accounts a
      WHERE a.id = ig_monthly_audit.ig_account_id
        AND (
          a.institution_id = auth_institution_id()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'super_admin'
          )
        )
    )
  );

-- No INSERT/UPDATE/DELETE policies: writes are service_role-only (the cron),
-- and service_role bypasses RLS. Adding write policies would only risk
-- shadowing that bypass (substrate migration's documented convention).
