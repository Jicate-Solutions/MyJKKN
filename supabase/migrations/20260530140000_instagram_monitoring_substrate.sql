-- =====================================================================
-- Instagram Monitoring Substrate — Phase 1B
-- Date: 2026-05-30
-- Agent: β (DB substrate) — 7-agent Meta Instagram build
-- =====================================================================
-- Adds the database substrate for monitoring Instagram accounts under
-- the JKKN Business: 4 ig_* tables + 1 social_instagram_logs audit table,
-- RLS scoped by institution_id, and 8 platform_policies rows for runtime
-- tweakable thresholds.
--
-- Tables:
--   1. ig_accounts          — connected IG accounts (one row per @handle)
--   2. ig_account_metrics   — periodic snapshot of account-level metrics
--   3. ig_posts             — cached canonical post info
--   4. ig_post_metrics      — periodic snapshot of post-level metrics
--   5. social_instagram_logs — audit log for Meta API calls + webhooks
--
-- Companion to existing meta_business_accounts (WhatsApp Business). The
-- two tables share Meta Business plumbing but are kept separate because
-- IG account identity is the @handle's ig_user_id, not the WA phone_number_id.
--
-- RLS: any authenticated user whose profile.institution_id matches the row
-- can SELECT. Writes are service_role only (edge functions / cron / webhooks).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING for seeds.
-- =====================================================================

-- ── 1. ig_accounts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ig_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  department_id UUID NULL REFERENCES public.departments(id) ON DELETE SET NULL,
  ig_user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('BUSINESS','CREATOR','PERSONAL')),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  connected_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','dormant','disconnected','orphaned')),
  last_polled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ig_accounts_institution ON public.ig_accounts (institution_id);
CREATE INDEX IF NOT EXISTS idx_ig_accounts_department ON public.ig_accounts (department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ig_accounts_status ON public.ig_accounts (status) WHERE status <> 'active';

COMMENT ON TABLE public.ig_accounts IS 'Connected Instagram accounts under the JKKN Business. One row per @handle. status=dormant when last_polled_at shows no post in ig.dormancy_threshold_days.';

-- ── 2. ig_account_metrics ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ig_account_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.ig_accounts(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  followers INTEGER NOT NULL DEFAULT 0,
  follows INTEGER NOT NULL DEFAULT 0,
  media_count INTEGER NOT NULL DEFAULT 0,
  raw JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_ig_account_metrics_account_time ON public.ig_account_metrics (account_id, snapshot_at DESC);

COMMENT ON TABLE public.ig_account_metrics IS 'Periodic snapshot of account-level metrics. One row per (account_id, snapshot_at). Polled every ig.poll_interval_hours.';

-- ── 3. ig_posts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ig_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.ig_accounts(id) ON DELETE CASCADE,
  ig_media_id TEXT NOT NULL UNIQUE,
  posted_at TIMESTAMPTZ NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('IMAGE','VIDEO','CAROUSEL_ALBUM','REEL','STORY')),
  caption TEXT NULL,
  permalink TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ig_posts_account_posted ON public.ig_posts (account_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_posts_media_type ON public.ig_posts (media_type);

COMMENT ON TABLE public.ig_posts IS 'Cached canonical Instagram post info. ig_media_id is the Meta-side ID.';

-- ── 4. ig_post_metrics ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ig_post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.ig_posts(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reach INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  engagement INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  raw JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_ig_post_metrics_post_time ON public.ig_post_metrics (post_id, snapshot_at DESC);

COMMENT ON TABLE public.ig_post_metrics IS 'Periodic snapshot of post-level metrics. One row per (post_id, snapshot_at).';

-- ── 5. social_instagram_logs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_instagram_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NULL REFERENCES public.ig_accounts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NULL,
  status TEXT NOT NULL CHECK (status IN ('success','error')),
  error_message TEXT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_instagram_logs_account_time ON public.social_instagram_logs (account_id, occurred_at DESC) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_instagram_logs_event_time ON public.social_instagram_logs (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_instagram_logs_errors ON public.social_instagram_logs (occurred_at DESC) WHERE status = 'error';

COMMENT ON TABLE public.social_instagram_logs IS 'Audit log for Meta Graph API calls + webhook events touching Instagram. Errors retained for SRE forensics.';

-- ── 6. updated_at triggers (re-use the global helper if it exists) ─────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_ig_accounts_updated_at ON public.ig_accounts;
    CREATE TRIGGER trg_ig_accounts_updated_at
      BEFORE UPDATE ON public.ig_accounts
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── 7. RLS — institution-scoped read, service_role write ───────────────
ALTER TABLE public.ig_accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_account_metrics   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_posts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_post_metrics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_instagram_logs ENABLE ROW LEVEL SECURITY;

-- Helper used below: every SELECT policy matches the canonical
-- meta_business_accounts pattern — auth_institution_id() match OR
-- profiles.role = 'super_admin'. Writes (INSERT/UPDATE/DELETE) flow
-- through service_role only, which has built-in RLS bypass — no
-- explicit write policies needed (and adding them risks shadowing the
-- bypass).

-- ig_accounts: institution-scoped read.
DROP POLICY IF EXISTS ig_accounts_select ON public.ig_accounts;
CREATE POLICY ig_accounts_select ON public.ig_accounts
  FOR SELECT TO authenticated
  USING (
    institution_id = auth_institution_id()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ig_account_metrics: institution scope via parent ig_accounts row.
DROP POLICY IF EXISTS ig_account_metrics_select ON public.ig_account_metrics;
CREATE POLICY ig_account_metrics_select ON public.ig_account_metrics
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ig_accounts a
      WHERE a.id = ig_account_metrics.account_id
        AND (
          a.institution_id = auth_institution_id()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'super_admin'
          )
        )
    )
  );

-- ig_posts: institution scope via parent ig_accounts row.
DROP POLICY IF EXISTS ig_posts_select ON public.ig_posts;
CREATE POLICY ig_posts_select ON public.ig_posts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ig_accounts a
      WHERE a.id = ig_posts.account_id
        AND (
          a.institution_id = auth_institution_id()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'super_admin'
          )
        )
    )
  );

-- ig_post_metrics: institution scope via grand-parent ig_accounts row.
DROP POLICY IF EXISTS ig_post_metrics_select ON public.ig_post_metrics;
CREATE POLICY ig_post_metrics_select ON public.ig_post_metrics
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ig_posts pst
      JOIN public.ig_accounts a ON a.id = pst.account_id
      WHERE pst.id = ig_post_metrics.post_id
        AND (
          a.institution_id = auth_institution_id()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'super_admin'
          )
        )
    )
  );

-- social_instagram_logs: institution scope via parent ig_accounts row when
-- present. Rows with NULL account_id (orphan/system events) visible to
-- super_admin only.
DROP POLICY IF EXISTS social_instagram_logs_select ON public.social_instagram_logs;
CREATE POLICY social_instagram_logs_select ON public.social_instagram_logs
  FOR SELECT TO authenticated
  USING (
    (account_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.ig_accounts a
      WHERE a.id = social_instagram_logs.account_id
        AND (
          a.institution_id = auth_institution_id()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'super_admin'
          )
        )
    ))
    OR (account_id IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    ))
  );

-- ── 8. platform_policies seeds — 8 runtime-tweakable Instagram knobs ───
INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, data_type, description,
  classification, publication_state, is_system, is_active,
  ui_widget, ui_category, ui_consequence
) VALUES
  (
    'ig.dormancy_threshold_days', 'global', NULL,
    to_jsonb(14), 'number',
    'Number of days without a new post before an Instagram account is classified as dormant.',
    'operational', 'published', false, true,
    'number', 'Instagram',
    'Lower the value to flag dormant accounts sooner; raise it to give accounts a longer grace period before they appear in the dormant queue.'
  ),
  (
    'ig.poll_interval_hours', 'global', NULL,
    to_jsonb(1), 'number',
    'How often (in hours) the Instagram metrics poller refreshes account + post metrics from the Meta Graph API.',
    'operational', 'published', false, true,
    'number', 'Instagram',
    'Lower the interval for fresher data and a higher Graph API quota cost; raise it to reduce API calls at the expense of stale metrics.'
  ),
  (
    'ig.monthly_audit_day', 'global', NULL,
    to_jsonb(1), 'number',
    'Day of the month (1-28) on which the monthly Instagram audit cron fires.',
    'operational', 'published', false, true,
    'number', 'Instagram',
    'Changing this shifts when the monthly audit report is generated and the dormant-account summary is dispatched.'
  ),
  (
    'ig.alert_dormant_to_role', 'global', NULL,
    to_jsonb('department_head'::text), 'string',
    'Role that receives dormancy alerts when an Instagram account crosses ig.alert_dormant_after_days without a post.',
    'major', 'published', false, true,
    'dropdown', 'Instagram',
    'Switching the target role changes who is held accountable for a dormant account. Make sure the chosen role has notification routing configured.'
  ),
  (
    'ig.alert_dormant_after_days', 'global', NULL,
    to_jsonb(30), 'number',
    'Number of days an account must remain dormant before a dormancy alert is dispatched. Separate from ig.dormancy_threshold_days (which only classifies the account as dormant).',
    'operational', 'published', false, true,
    'number', 'Instagram',
    'Lower the value to alert sooner; raise it to suppress noise from accounts that quickly resume posting.'
  ),
  (
    'ig.required_account_type', 'global', NULL,
    to_jsonb('BUSINESS_OR_CREATOR'::text), 'string',
    'Minimum Instagram account type that can be connected to MyJKKN. BUSINESS_OR_CREATOR accepts either; BUSINESS_ONLY rejects creator accounts.',
    'major', 'published', false, true,
    'dropdown', 'Instagram',
    'Tightening this forces all institutional handles to upgrade to Business accounts, unlocking the full Insights API at the cost of onboarding friction.'
  ),
  (
    'ig.brand_bible_url', 'global', NULL,
    to_jsonb(''::text), 'string',
    'URL to the JKKN brand bible / social media handbook shown in the Instagram admin UI.',
    'operational', 'published', false, true,
    'text', 'Instagram',
    'Updating this changes the link surfaced to department heads when they review their Instagram presence.'
  ),
  (
    'ig.health_score_weights', 'global', NULL,
    '{"recency":0.4,"engagement":0.3,"growth":0.3}'::jsonb, 'object',
    'Weights used to compute an Instagram account health score from recency, engagement, and growth components. Weights should sum to 1.0.',
    'major', 'published', false, true,
    'textarea', 'Instagram',
    'Re-weighting changes the health score ordering of accounts and therefore the priority list shown to department heads.'
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- =====================================================================
-- Verification queries (SELECT-only, safe to re-run):
--   SELECT table_name FROM information_schema.tables
--     WHERE table_schema='public' AND table_name LIKE 'ig\_%';
--     -- expected: 4 rows (ig_accounts, ig_account_metrics, ig_posts, ig_post_metrics)
--
--   SELECT table_name FROM information_schema.tables
--     WHERE table_schema='public' AND table_name='social_instagram_logs';
--     -- expected: 1 row
--
--   SELECT count(*) FROM platform_policies WHERE policy_key LIKE 'ig.%';
--     -- expected: 8
--
--   SELECT * FROM ig_accounts LIMIT 0;  -- empty rowset, columns visible
-- =====================================================================
