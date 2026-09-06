-- =====================================================================
-- Meta Ads Insights Substrate — Phase 1 (read-only)
-- Date: 2026-05-30
-- Agent: ζ-ads-read — Meta Ads Insights build
-- =====================================================================
-- Adds the database substrate for caching READ-ONLY Meta Ads Insights
-- data under the JKKN Business: 3 meta_ad_* tables + 2 platform_policies
-- rows for runtime-tweakable knobs. RLS scoped by institution_id.
--
-- Tables:
--   1. meta_ad_accounts  — connected ad accounts (one row per act_*)
--   2. meta_campaigns    — cached campaign metadata
--   3. meta_ad_insights  — daily rollup of spend/impressions/clicks/etc.
--
-- This is companion to the existing ig_* (Instagram) tables — the two
-- share the Meta Business plumbing but ads identity is the
-- `act_<numeric>` ad-account id, NOT the page or IG handle.
--
-- READ-ONLY MODULE: there are no write endpoints that flow from MyJKKN
-- INTO Meta. All writes to these tables come from the sync cron / manual
-- sync trigger pulling Ads Insights READS.
--
-- RLS: any authenticated user whose profile.institution_id matches the
-- row can SELECT. Writes (INSERT/UPDATE/DELETE) flow through service_role
-- only.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING for
-- platform_policies seeds.
-- =====================================================================

-- ── 1. meta_ad_accounts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meta_ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  -- Canonical Meta ad account id, including the `act_` prefix.
  fb_ad_account_id TEXT NOT NULL UNIQUE,
  -- Numeric form without the prefix, surfaced for cross-API joins.
  account_id_numeric TEXT NULL,
  name TEXT NOT NULL,
  currency TEXT NULL,
  -- Meta-numeric status code (1=ACTIVE, 2=DISABLED, etc.).
  account_status INTEGER NULL,
  timezone_name TEXT NULL,
  business_name TEXT NULL,
  business_id TEXT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  connected_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','dormant','disconnected','orphaned')),
  last_synced_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_accounts_institution
  ON public.meta_ad_accounts (institution_id);
CREATE INDEX IF NOT EXISTS idx_meta_ad_accounts_status
  ON public.meta_ad_accounts (status)
  WHERE status <> 'active';

COMMENT ON TABLE public.meta_ad_accounts IS
  'Connected Meta Ad Accounts under the JKKN Business. One row per act_<numeric>. READ-ONLY mirror — sync cron writes from Meta Graph API.';

-- ── 2. meta_campaigns ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meta_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.meta_ad_accounts(id) ON DELETE CASCADE,
  fb_campaign_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NULL,
  effective_status TEXT NULL,
  objective TEXT NULL,
  -- Budgets stored as text — Meta returns minor-unit decimal strings, and
  -- we don't want to lose precision converting to numeric here.
  daily_budget TEXT NULL,
  lifetime_budget TEXT NULL,
  start_time TIMESTAMPTZ NULL,
  stop_time TIMESTAMPTZ NULL,
  fb_created_time TIMESTAMPTZ NULL,
  fb_updated_time TIMESTAMPTZ NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_campaigns_account
  ON public.meta_campaigns (account_id);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_status
  ON public.meta_campaigns (effective_status)
  WHERE effective_status IS NOT NULL;

COMMENT ON TABLE public.meta_campaigns IS
  'Cached Meta Ads campaign metadata. READ-ONLY mirror; sync cron upserts on fb_campaign_id.';

-- ── 3. meta_ad_insights ────────────────────────────────────────────────
-- Daily rollup. Each row is ONE (account_id, campaign_id-or-NULL, date)
-- bucket. campaign_id IS NULL means "account-level total for the day".
CREATE TABLE IF NOT EXISTS public.meta_ad_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.meta_ad_accounts(id) ON DELETE CASCADE,
  campaign_id UUID NULL REFERENCES public.meta_campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  spend NUMERIC(14,4) NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  reach BIGINT NOT NULL DEFAULT 0,
  cpm NUMERIC(14,4) NULL,
  cpc NUMERIC(14,4) NULL,
  ctr NUMERIC(8,5) NULL,
  -- One row per Meta action_type, value as a decimal string.
  -- Shape: [{ "action_type": "lead", "value": "12" }, ...]
  actions JSONB NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent upsert key: (account_id, campaign_id, date). Campaign-id
-- nullable, so we use a partial unique index per "null vs not null" branch.
CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_ad_insights_account_date_campaign
  ON public.meta_ad_insights (account_id, date, campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_ad_insights_account_date_null_campaign
  ON public.meta_ad_insights (account_id, date)
  WHERE campaign_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_meta_ad_insights_account_date
  ON public.meta_ad_insights (account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_meta_ad_insights_campaign_date
  ON public.meta_ad_insights (campaign_id, date DESC)
  WHERE campaign_id IS NOT NULL;

COMMENT ON TABLE public.meta_ad_insights IS
  'Daily insight rollup pulled from Meta Ads Insights. campaign_id NULL = account-level total. READ-ONLY cache for the admin dashboard.';

-- ── 4. updated_at triggers (reuse global helper if present) ────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_meta_ad_accounts_updated_at ON public.meta_ad_accounts;
    CREATE TRIGGER trg_meta_ad_accounts_updated_at
      BEFORE UPDATE ON public.meta_ad_accounts
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS trg_meta_campaigns_updated_at ON public.meta_campaigns;
    CREATE TRIGGER trg_meta_campaigns_updated_at
      BEFORE UPDATE ON public.meta_campaigns
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── 5. RLS — institution-scoped read, service_role write ───────────────
ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_campaigns   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ad_insights ENABLE ROW LEVEL SECURITY;

-- meta_ad_accounts: institution-scoped read.
DROP POLICY IF EXISTS meta_ad_accounts_select ON public.meta_ad_accounts;
CREATE POLICY meta_ad_accounts_select ON public.meta_ad_accounts
  FOR SELECT TO authenticated
  USING (
    institution_id = auth_institution_id()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- meta_campaigns: institution scope via parent meta_ad_accounts row.
DROP POLICY IF EXISTS meta_campaigns_select ON public.meta_campaigns;
CREATE POLICY meta_campaigns_select ON public.meta_campaigns
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meta_ad_accounts a
      WHERE a.id = meta_campaigns.account_id
        AND (
          a.institution_id = auth_institution_id()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'super_admin'
          )
        )
    )
  );

-- meta_ad_insights: institution scope via parent meta_ad_accounts row.
DROP POLICY IF EXISTS meta_ad_insights_select ON public.meta_ad_insights;
CREATE POLICY meta_ad_insights_select ON public.meta_ad_insights
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meta_ad_accounts a
      WHERE a.id = meta_ad_insights.account_id
        AND (
          a.institution_id = auth_institution_id()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'super_admin'
          )
        )
    )
  );

-- ── 6. platform_policies seeds — 2 runtime-tweakable Ads knobs ─────────
-- platform_policies has a partial unique index using
-- `COALESCE(scope_id, sentinel-uuid)`, so plain `ON CONFLICT` won't match.
-- Use the index expression form for idempotent INSERTs.
INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, data_type, description,
  classification, publication_state, is_system, is_active,
  ui_widget, ui_category, ui_consequence
) VALUES
  (
    'meta.ads.sync_interval_minutes', 'global', NULL,
    to_jsonb(120), 'number',
    'How often (in minutes) the Meta Ads sync cron refreshes ad-account + campaign insights from the Meta Graph API.',
    'operational', 'published', false, true,
    'number', 'Meta Ads',
    'Lower the interval for fresher ad performance data and a higher Graph API quota cost; raise it to reduce API calls at the expense of stale insights.'
  ),
  (
    'meta.ads.is_enabled', 'global', NULL,
    to_jsonb(false), 'boolean',
    'Master switch for the Meta Ads Insights integration. When false, the sync cron is a no-op and the admin dashboard surfaces a disabled banner.',
    'operational', 'published', false, true,
    'toggle', 'Meta Ads',
    'Turn off to halt all Ads Insights syncs (cached data remains visible); turn on once the Meta App has ads_read + business_management + read_insights scopes approved.'
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO NOTHING;
