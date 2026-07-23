-- =====================================================================
-- ig_accounts.metrics_source — distinguish how an account is polled
-- Date: 2026-06-10
-- =====================================================================
-- The 9 college accounts are owned + Facebook-Page-linked, so the
-- instagram-metrics-poller reads their FULL private insights (reach,
-- impressions, demographics) directly.
--
-- The ~56 department accounts have NO linked Facebook Page (they were
-- created as standalone Instagram logins). Meta's Facebook-Login Graph API
-- cannot read private insights for a non-Page-linked account (error #100
-- subcode 33, verified live 2026-06-10). They CAN be read via
-- `business_discovery` (public metrics: followers, media_count, per-post
-- likes/comments) with the existing token, no Page required.
--
-- `metrics_source` routes each account to the right poller:
--   'graph'              → instagram-metrics-poller (full insights, default)
--   'business_discovery' → ig-business-discovery-poll (public metrics)
--
-- Default 'graph' keeps every existing row on the current pipeline
-- untouched; only department accounts seeded by the new poller get
-- 'business_discovery'.
-- =====================================================================

ALTER TABLE public.ig_accounts
  ADD COLUMN IF NOT EXISTS metrics_source TEXT NOT NULL DEFAULT 'graph'
    CHECK (metrics_source IN ('graph', 'business_discovery')),
  ADD COLUMN IF NOT EXISTS last_discovery_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.ig_accounts.metrics_source IS
  'How metrics are collected: graph = full insights via Page link (instagram-metrics-poller); business_discovery = public metrics for non-Page-linked accounts (ig-business-discovery-poll).';

NOTIFY pgrst, 'reload schema';
