-- =====================================================================
-- Facebook Pages Monitoring Substrate — Phase 1B (Agent β)
-- Date: 2026-05-30
-- =====================================================================
-- Adds the database substrate for monitoring Facebook Pages under the JKKN
-- Business: 4 fb_* tables + 1 social_facebook_logs audit table, RLS scoped
-- by institution_id, and 3 platform_policies rows for runtime tweakable
-- thresholds.
--
-- Tables:
--   1. fb_pages              — connected FB Pages (one row per Page)
--   2. fb_page_metrics       — periodic snapshot of page-level metrics
--   3. fb_posts              — cached canonical post info
--   4. fb_post_metrics       — periodic snapshot of post-level metrics
--   5. social_facebook_logs  — audit log for Meta Graph API calls + webhooks
--
-- Companion to ig_accounts / ig_posts (Instagram) and meta_business_accounts
-- (WhatsApp Business). All three share Meta Business plumbing but are kept
-- separate because identity differs (FB page id vs IG ig_user_id vs WA
-- phone_number_id).
--
-- RLS: any authenticated user whose profile.institution_id matches the row
-- can SELECT. Writes are service_role only (edge functions / cron / webhooks).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING for seeds.
-- =====================================================================

-- ── 1. fb_pages ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fb_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  department_id UUID NULL REFERENCES public.departments(id) ON DELETE SET NULL,
  fb_page_id TEXT NOT NULL UNIQUE,
  username TEXT NULL,
  name TEXT NOT NULL,
  category TEXT NULL,
  link TEXT NULL,
  picture_url TEXT NULL,
  fan_count INTEGER NULL,
  followers_count INTEGER NULL,
  /* Per-page access token. Long-lived (~60 days) when minted from a
     System User token. Refreshed by the cron poller when expiry nears. */
  access_token TEXT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  connected_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','dormant','disconnected','orphaned')),
  last_polled_at TIMESTAMPTZ NULL,
  last_post_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fb_pages_institution ON public.fb_pages (institution_id);
CREATE INDEX IF NOT EXISTS idx_fb_pages_department ON public.fb_pages (department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fb_pages_status ON public.fb_pages (status) WHERE status <> 'active';

COMMENT ON TABLE public.fb_pages IS 'Connected Facebook Pages under the JKKN Business. One row per Page. status=dormant when last_post_at shows no post in fb.pages.dormancy_threshold_days.';

-- ── 2. fb_page_metrics ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fb_page_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.fb_pages(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fan_count INTEGER NOT NULL DEFAULT 0,
  followers_count INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NULL,
  impressions_unique INTEGER NULL,
  post_engagements INTEGER NULL,
  page_views INTEGER NULL,
  fan_adds INTEGER NULL,
  fan_removes INTEGER NULL,
  raw JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_fb_page_metrics_page_time ON public.fb_page_metrics (page_id, snapshot_at DESC);

COMMENT ON TABLE public.fb_page_metrics IS 'Periodic snapshot of page-level metrics. One row per (page_id, snapshot_at). Polled every fb.pages.poll_interval_minutes.';

-- ── 3. fb_posts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fb_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.fb_pages(id) ON DELETE CASCADE,
  fb_post_id TEXT NOT NULL UNIQUE,
  posted_at TIMESTAMPTZ NOT NULL,
  updated_at_meta TIMESTAMPTZ NULL,
  post_type TEXT NULL,
  message TEXT NULL,
  story TEXT NULL,
  permalink_url TEXT NULL,
  attachments JSONB NULL,
  reactions_count INTEGER NULL,
  comments_count INTEGER NULL,
  shares_count INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fb_posts_page_posted ON public.fb_posts (page_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_posts_post_type ON public.fb_posts (post_type) WHERE post_type IS NOT NULL;

COMMENT ON TABLE public.fb_posts IS 'Cached canonical Facebook post info. fb_post_id is the Meta-side page-scoped id ("<pageId>_<postId>").';

-- ── 4. fb_post_metrics ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fb_post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.fb_posts(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  impressions INTEGER NULL,
  impressions_unique INTEGER NULL,
  engaged_users INTEGER NULL,
  clicks INTEGER NULL,
  reactions_total INTEGER NULL,
  video_views INTEGER NULL,
  video_avg_time_watched_ms INTEGER NULL,
  raw JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_fb_post_metrics_post_time ON public.fb_post_metrics (post_id, snapshot_at DESC);

COMMENT ON TABLE public.fb_post_metrics IS 'Periodic snapshot of post-level metrics. One row per (post_id, snapshot_at).';

-- ── 5. social_facebook_logs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_facebook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NULL REFERENCES public.fb_pages(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NULL,
  status TEXT NOT NULL CHECK (status IN ('success','error')),
  error_message TEXT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_facebook_logs_page_time ON public.social_facebook_logs (page_id, occurred_at DESC) WHERE page_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_facebook_logs_event_time ON public.social_facebook_logs (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_facebook_logs_errors ON public.social_facebook_logs (occurred_at DESC) WHERE status = 'error';

COMMENT ON TABLE public.social_facebook_logs IS 'Audit log for Meta Graph API calls + webhook events touching Facebook Pages. Errors retained for SRE forensics.';

-- ── 6. updated_at triggers (re-use the global helper if it exists) ─────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_fb_pages_updated_at ON public.fb_pages;
    CREATE TRIGGER trg_fb_pages_updated_at
      BEFORE UPDATE ON public.fb_pages
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── 7. RLS — institution-scoped read, service_role write ───────────────
ALTER TABLE public.fb_pages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fb_page_metrics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fb_posts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fb_post_metrics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_facebook_logs ENABLE ROW LEVEL SECURITY;

-- Helper used below: every SELECT policy matches the canonical ig_accounts /
-- meta_business_accounts pattern — auth_institution_id() match OR
-- profiles.role = 'super_admin'. Writes (INSERT/UPDATE/DELETE) flow through
-- service_role only, which has built-in RLS bypass — no explicit write
-- policies needed (and adding them risks shadowing the bypass).

-- fb_pages: institution-scoped read.
DROP POLICY IF EXISTS fb_pages_select ON public.fb_pages;
CREATE POLICY fb_pages_select ON public.fb_pages
  FOR SELECT TO authenticated
  USING (
    institution_id = auth_institution_id()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- fb_page_metrics: institution scope via parent fb_pages row.
DROP POLICY IF EXISTS fb_page_metrics_select ON public.fb_page_metrics;
CREATE POLICY fb_page_metrics_select ON public.fb_page_metrics
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fb_pages a
      WHERE a.id = fb_page_metrics.page_id
        AND (
          a.institution_id = auth_institution_id()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'super_admin'
          )
        )
    )
  );

-- fb_posts: institution scope via parent fb_pages row.
DROP POLICY IF EXISTS fb_posts_select ON public.fb_posts;
CREATE POLICY fb_posts_select ON public.fb_posts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fb_pages a
      WHERE a.id = fb_posts.page_id
        AND (
          a.institution_id = auth_institution_id()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'super_admin'
          )
        )
    )
  );

-- fb_post_metrics: institution scope via grand-parent fb_pages row.
DROP POLICY IF EXISTS fb_post_metrics_select ON public.fb_post_metrics;
CREATE POLICY fb_post_metrics_select ON public.fb_post_metrics
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.fb_posts pst
      JOIN public.fb_pages a ON a.id = pst.page_id
      WHERE pst.id = fb_post_metrics.post_id
        AND (
          a.institution_id = auth_institution_id()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'super_admin'
          )
        )
    )
  );

-- social_facebook_logs: institution scope via parent fb_pages row when
-- present. Rows with NULL page_id (orphan/system events) visible to
-- super_admin only.
DROP POLICY IF EXISTS social_facebook_logs_select ON public.social_facebook_logs;
CREATE POLICY social_facebook_logs_select ON public.social_facebook_logs
  FOR SELECT TO authenticated
  USING (
    (page_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.fb_pages a
      WHERE a.id = social_facebook_logs.page_id
        AND (
          a.institution_id = auth_institution_id()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'super_admin'
          )
        )
    ))
    OR (page_id IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    ))
  );

-- ── 8. platform_policies seeds — runtime-tweakable Facebook knobs ──────
INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, data_type, description,
  classification, publication_state, is_system, is_active,
  ui_widget, ui_category, ui_consequence
) VALUES
  (
    'fb.pages.poll_interval_minutes', 'global', NULL,
    to_jsonb(60), 'number',
    'How often (in minutes) the Facebook Pages metrics poller refreshes page + post metrics from the Meta Graph API.',
    'operational', 'published', false, true,
    'number', 'Facebook',
    'Lower the interval for fresher data and a higher Graph API quota cost; raise it to reduce API calls at the expense of stale metrics.'
  ),
  (
    'fb.pages.post_lookback_days', 'global', NULL,
    to_jsonb(7), 'number',
    'Number of days of recent Page posts the poller fetches each cycle when no last_polled_at is set. Anchors the historical backfill window.',
    'operational', 'published', false, true,
    'number', 'Facebook',
    'Raising this captures more historical posts on first connect but increases initial Graph API cost. Lowering it speeds up first-poll but may miss older posts on dormant pages.'
  ),
  (
    'fb.pages.is_enabled', 'global', NULL,
    to_jsonb(false), 'boolean',
    'Master toggle for Facebook Pages monitoring. When false the cron poller and admin UI return early without making Graph API calls.',
    'major', 'published', false, true,
    'toggle', 'Facebook',
    'Enable only after the Meta App has been granted pages_read_engagement, pages_show_list, read_insights, and business_management. Disabling stops all Page metric collection but leaves existing rows in place.'
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- =====================================================================
-- Verification queries (SELECT-only, safe to re-run):
--   SELECT table_name FROM information_schema.tables
--     WHERE table_schema='public'
--       AND (table_name LIKE 'fb\_%' OR table_name='social_facebook_logs');
--     -- expected: 5 rows (fb_pages, fb_page_metrics, fb_posts, fb_post_metrics,
--     --                   social_facebook_logs)
--
--   SELECT count(*) FROM platform_policies WHERE policy_key LIKE 'fb.pages.%';
--     -- expected: 3
--
--   SELECT * FROM fb_pages LIMIT 0;  -- empty rowset, columns visible
-- =====================================================================
