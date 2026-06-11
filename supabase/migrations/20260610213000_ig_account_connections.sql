-- =====================================================================
-- Instagram Business Login connections (Track 3 substrate)
-- Date: 2026-06-10
-- =====================================================================
-- The ~56 department Instagram accounts have NO linked Facebook Page, so
-- the Facebook-Login Graph API cannot read their private insights (#100
-- subcode 33, proven live 2026-06-10). business_discovery (live) covers
-- PUBLIC metrics only. The only per-account route to FULL private
-- insights (reach, profile views, accounts engaged, demographics)
-- without a Page is **Instagram Business Login**: the account owner
-- authorizes via OAuth, MyJKKN receives a per-account long-lived token
-- (60 days, refreshable), and reads /me/insights on graph.instagram.com.
--
-- One row per authorized account. Tokens are written ONLY by the OAuth
-- callback + refresh cron (service_role); admins can read connection
-- STATUS but never the token itself (column-level grant excludes
-- access_token — see GRANT below).
--
-- Also extends ig_accounts.metrics_source with 'instagram_login' so the
-- new poller lane is routable:
--   'graph'              → instagram-metrics-poller (Page-linked, full)
--   'business_discovery' → ig-business-discovery-poll (public only)
--   'instagram_login'    → ig-login-insights-poll (per-account token, full)
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + dynamic constraint swap.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ig_account_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Registry row this connection was initiated for (state-param binding).
  dept_account_id UUID NULL REFERENCES public.social_dept_accounts(id) ON DELETE SET NULL,
  -- Monitored-pipeline row (set at callback; created there if missing).
  ig_account_id UUID NULL REFERENCES public.ig_accounts(id) ON DELETE SET NULL,
  -- Instagram professional account id as returned by graph.instagram.com
  -- /me?fields=user_id (token-scoped; may differ from the 178… discovery id).
  ig_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  -- Long-lived (60-day) Instagram Login token. Service-role only — the
  -- authenticated column grant below deliberately excludes this column.
  access_token TEXT NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'bearer',
  -- Granted permissions from the token exchange (comma-joined as Meta returns).
  scopes TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_refreshed_at TIMESTAMPTZ NULL,
  last_polled_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ig_account_connections_ig_user_id_key UNIQUE (ig_user_id)
);

CREATE INDEX IF NOT EXISTS idx_ig_account_connections_dept
  ON public.ig_account_connections (dept_account_id);
CREATE INDEX IF NOT EXISTS idx_ig_account_connections_account
  ON public.ig_account_connections (ig_account_id);
CREATE INDEX IF NOT EXISTS idx_ig_account_connections_status_expiry
  ON public.ig_account_connections (status, expires_at);

ALTER TABLE public.ig_account_connections ENABLE ROW LEVEL SECURITY;

-- Admins may read connection status (matches the SuperAdminOnly gate on
-- /admin/social/*). Writes are service_role only (no write policies).
DROP POLICY IF EXISTS ig_account_connections_select ON public.ig_account_connections;
CREATE POLICY ig_account_connections_select ON public.ig_account_connections
  FOR SELECT TO authenticated
  USING (is_super_admin() OR is_admin());

-- Column-level grant: everything EXCEPT access_token. A SELECT that asks
-- for access_token (including select=*) fails with permission denied even
-- for admins — only service_role (OAuth callback, refresh cron, poller)
-- can read tokens.
REVOKE ALL ON public.ig_account_connections FROM anon, PUBLIC, authenticated;
GRANT SELECT (
  id, dept_account_id, ig_account_id, ig_user_id, username, token_type,
  scopes, expires_at, connected_at, last_refreshed_at, last_polled_at,
  status, last_error, created_at, updated_at
) ON public.ig_account_connections TO authenticated;

COMMENT ON TABLE public.ig_account_connections IS
  'Per-account Instagram Business Login OAuth connections (long-lived 60-day tokens, refreshable). Tokens are service_role-only via column-level grants; admins read status columns.';

-- ---------------------------------------------------------------------
-- ig_accounts.metrics_source: allow 'instagram_login'
-- (constraint was created inline with ADD COLUMN — name is generated, so
--  resolve it dynamically before swapping)
-- ---------------------------------------------------------------------
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.ig_accounts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%metrics_source%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ig_accounts DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.ig_accounts
  ADD CONSTRAINT ig_accounts_metrics_source_check
  CHECK (metrics_source IN ('graph', 'business_discovery', 'instagram_login'));

COMMENT ON COLUMN public.ig_accounts.metrics_source IS
  'How metrics are collected: graph = full insights via Page link (instagram-metrics-poller); business_discovery = public metrics for non-Page-linked accounts (ig-business-discovery-poll); instagram_login = full insights via per-account Instagram Business Login token (ig-login-insights-poll).';

NOTIFY pgrst, 'reload schema';
