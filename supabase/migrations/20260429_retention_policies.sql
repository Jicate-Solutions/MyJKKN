-- =====================================================================
-- Migration: 20260429_retention_policies
-- =====================================================================
-- Purpose: Director's standing rule (2026-04-29) — every policy decision
--          = config-table row + super_admin UI. Zero deploys / zero PRs /
--          zero developer round-trips for tweaks.
--
-- This is R-001, the FIRST reference implementation of that rule.
--
-- Replaces hardcoded `90 days` retention in PR #586's
-- /api/cron/duty-log-retention with a config row admins can tweak from
-- /admin/retention-policies in 5 seconds — no deploy needed.
--
-- Convention: one row per table_name. retention_days defines purge cutoff.
-- enabled=false freezes the cron's purge for that table without dropping
-- the row (so the historical setting is preserved for audit).
--
-- The cron route reads via get_retention_days('table_name') SECURITY
-- DEFINER helper. NULL return (config row missing OR disabled) means
-- the cron should fall back to its hardcoded default — never crash.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.retention_policies (
  table_name      text PRIMARY KEY,
  retention_days  integer NOT NULL CHECK (retention_days > 0),
  enabled         boolean NOT NULL DEFAULT true,
  description     text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.retention_policies IS
  'Per-table retention policy config. Director''s zero-deploy rule (2026-04-29) — super_admin UI at /admin/retention-policies tweaks days/enabled flags. Read via get_retention_days(table_name) SECURITY DEFINER helper. Cron jobs fall back to hardcoded defaults if row missing or enabled=false.';

COMMENT ON COLUMN public.retention_policies.table_name IS
  'Target table whose data the cron should purge. Primary key — one row per managed table.';
COMMENT ON COLUMN public.retention_policies.retention_days IS
  'Purge cutoff in days. Rows older than now() - interval ''<retention_days> days'' are eligible for deletion. Must be > 0.';
COMMENT ON COLUMN public.retention_policies.enabled IS
  'When false, get_retention_days() returns NULL — cron falls back to its hardcoded default (currently a no-op-safe behavior). Use this to pause purging without losing the configured value.';
COMMENT ON COLUMN public.retention_policies.description IS
  'Human-readable note shown in the admin UI to remind admins what this row controls.';
COMMENT ON COLUMN public.retention_policies.updated_by IS
  'auth.users.id of the super_admin who last edited this row. Audit trail.';

-- updated_at trigger using the canonical helper.
DROP TRIGGER IF EXISTS retention_policies_updated_at ON public.retention_policies;
CREATE TRIGGER retention_policies_updated_at
BEFORE UPDATE ON public.retention_policies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- RLS — canonical CLAUDE.md pattern.
-- Read: super_admin OR is_admin (no per-row institution scoping —
--       this is a system-wide config, no institution_id column).
-- Write: super_admin only — retention policies are governance-grade.
-- =====================================================================
ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "retention_policies_admin_read" ON public.retention_policies;
CREATE POLICY "retention_policies_admin_read"
  ON public.retention_policies
  FOR SELECT
  USING (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS "retention_policies_super_admin_write" ON public.retention_policies;
CREATE POLICY "retention_policies_super_admin_write"
  ON public.retention_policies
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- =====================================================================
-- Helper: get_retention_days(table_name)
-- Returns retention_days when enabled, else NULL (cron uses NULL as
-- "use the hardcoded default" signal — never crash on missing config).
-- SECURITY DEFINER so the cron's service-role client (or even a
-- normal authenticated client) can call it without RLS friction.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_retention_days(p_table_name text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN enabled THEN retention_days ELSE NULL END
  FROM public.retention_policies
  WHERE table_name = p_table_name;
$$;

COMMENT ON FUNCTION public.get_retention_days(text) IS
  'Returns configured retention_days for a table when enabled, else NULL. Cron callers must fall back to a hardcoded default on NULL (config row missing OR enabled=false).';

GRANT EXECUTE ON FUNCTION public.get_retention_days(text) TO authenticated, service_role;

-- =====================================================================
-- Seed: PR #586's existing 90-day retention for admission_counselor_duty_log.
-- ON CONFLICT DO NOTHING so re-running is idempotent and won't trample
-- admin-edited values.
-- =====================================================================
INSERT INTO public.retention_policies (table_name, retention_days, description) VALUES
  ('admission_counselor_duty_log', 90, 'Counselor on/off-duty transition history (Phase 8 cron — sunday 03:00 UTC weekly purge). Most-recent row per counselor is always preserved regardless of age, so fn_get_off_duty_since() always has a baseline.')
ON CONFLICT (table_name) DO NOTHING;
