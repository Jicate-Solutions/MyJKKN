-- =====================================================================
-- Migration: 20260429_whatsapp_send_limits
-- =====================================================================
-- Director's STANDING RULE (2026-04-29): every policy decision = config-table
-- row + super_admin UI to write. Zero deploys / zero PRs / zero developer
-- round-trips for tweaks.
--
-- Memory ref: feedback_policy_decisions_must_be_config_rows.md
--
-- Replaces hardcoded `DAILY_LIMIT = 950` in
--   lib/services/admission/expo-whatsapp-service.ts:43
-- with a singleton config row that the Director can edit from
--   /admin/whatsapp-limits
-- in 5 seconds — no PR, no deploy.
--
-- Pattern: matches 4 sibling configs landed 2026-04-29
--   - retention_policies        (PR #594)
--   - staffing_alert_thresholds (PR #592)
--   - notification_recipient_policies (PR #582)
--   - counselor_routing_config  (PR #593)
--
-- Singleton-row enforcement via UNIQUE INDEX on a constant expression — there
-- is exactly one daily-limit value across the whole platform (Meta Cloud API
-- tier is platform-wide, not per-institution).
--
-- Service consumer reads via fn_get_whatsapp_daily_limit() SECURITY DEFINER
-- helper. NULL return (config row missing) means caller falls back to its
-- hardcoded default — never crash on missing config.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_send_limits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_limit  INTEGER NOT NULL CHECK (daily_limit > 0 AND daily_limit <= 10000),
  notes        TEXT,
  updated_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.whatsapp_send_limits IS
  'Singleton config row for the platform-wide WhatsApp daily-send cap. Director-tunable from /admin/whatsapp-limits. Read via fn_get_whatsapp_daily_limit() SECURITY DEFINER helper. Service-side fallback is 950 (matches the original hardcoded DAILY_LIMIT in expo-whatsapp-service.ts) so a missing/RLS-blocked read can never break sends.';

COMMENT ON COLUMN public.whatsapp_send_limits.daily_limit IS
  'Max number of WhatsApp template sends allowed per UTC day before queuing kicks in. Bounded 1..10000. Meta Cloud API tier 1k = 1000; we seed at 950 for a 50-msg safety margin. Director can raise/lower from the admin UI.';
COMMENT ON COLUMN public.whatsapp_send_limits.notes IS
  'Optional free-text describing why the value was chosen (e.g. "TIER_1K cap with 50-msg safety margin").';
COMMENT ON COLUMN public.whatsapp_send_limits.updated_by IS
  'auth.users.id of the super_admin who last edited the row. Audit trail.';

-- Singleton-row enforcement: index on constant expression means at most one
-- row can ever exist. Mirrors the pattern Director chose in the spec.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_send_limits_singleton
  ON public.whatsapp_send_limits ((1));

-- updated_at trigger using the canonical helper (matches retention_policies).
DROP TRIGGER IF EXISTS whatsapp_send_limits_updated_at ON public.whatsapp_send_limits;
CREATE TRIGGER whatsapp_send_limits_updated_at
BEFORE UPDATE ON public.whatsapp_send_limits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- RLS — canonical CLAUDE.md pattern.
-- Read: any authenticated user (the service consumer needs to read this on
--       every send, including from server-side service-role contexts; the
--       helper function below is SECURITY DEFINER so even RLS-restricted
--       roles can fetch the value).
-- Write: super_admin only — daily-limit changes are governance-grade.
-- =====================================================================
ALTER TABLE public.whatsapp_send_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_send_limits_select" ON public.whatsapp_send_limits;
CREATE POLICY "whatsapp_send_limits_select"
  ON public.whatsapp_send_limits
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "whatsapp_send_limits_super_admin_write" ON public.whatsapp_send_limits;
CREATE POLICY "whatsapp_send_limits_super_admin_write"
  ON public.whatsapp_send_limits
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- =====================================================================
-- Helper: fn_get_whatsapp_daily_limit()
-- Returns the configured daily_limit. NULL when the singleton row hasn't
-- been seeded yet — service consumer falls back to its hardcoded default
-- (950) on NULL so a missing config never breaks sends.
-- SECURITY DEFINER so service-role / cron / anon contexts can call it
-- without RLS friction.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_get_whatsapp_daily_limit()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT daily_limit FROM public.whatsapp_send_limits LIMIT 1;
$$;

COMMENT ON FUNCTION public.fn_get_whatsapp_daily_limit() IS
  'Returns the singleton WhatsApp daily-send cap from whatsapp_send_limits. Callers must fall back to their hardcoded default (950) on NULL.';

GRANT EXECUTE ON FUNCTION public.fn_get_whatsapp_daily_limit() TO authenticated, service_role, anon;

-- =====================================================================
-- Seed: current hardcoded value (950) so behaviour is unchanged on day one.
-- Director can edit from /admin/whatsapp-limits once the UI ships.
-- ON CONFLICT DO NOTHING so re-running this migration won't trample admin
-- edits to the value.
-- =====================================================================
INSERT INTO public.whatsapp_send_limits (daily_limit, notes)
VALUES (
  950,
  'Initial value migrated from expo-whatsapp-service.ts:43 DAILY_LIMIT (TIER_1K cap with 50-msg safety margin)'
)
ON CONFLICT DO NOTHING;
