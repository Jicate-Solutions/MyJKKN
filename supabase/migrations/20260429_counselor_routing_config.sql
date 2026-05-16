-- Migration: counselor_routing_config
-- Created: 2026-04-29
-- Purpose: Director's standing rule (2026-04-29) — every policy decision = config-table row
--          + super_admin UI to write. Result: zero deploys, zero PRs for tweaks.
--
-- Scope (this PR — Agent G):
--   1. Table counselor_routing_config (key/value/desc/audit)
--   2. RLS policies (super_admin + admin + admission read; super_admin write only)
--   3. Helper get_routing_config(text) RETURNS jsonb
--   4. Seeds 3 rows matching CURRENT hardcoded constants in DB:
--        - cap_per_run.max_assignments = 500   (matches fn_flush_queued_leads LIMIT 500)
--        - cascade_after_minutes.minutes = 60  (matches fn_cascade_off_duty_counselors default)
--        - flush_interval_minutes.minutes = 15 (matches external cron interval)
--
-- Deferred to follow-up PR: rewrite fn_flush_queued_leads + fn_cascade_off_duty_counselors
-- to read from get_routing_config() instead of hardcoded literals. This PR is forward-compatible
-- (table + helper exist; functions can be migrated atomically in next PR with no behavior change).

CREATE TABLE IF NOT EXISTS counselor_routing_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users
);

COMMENT ON TABLE counselor_routing_config IS
  'Director''s standing rule (2026-04-29): policy decisions live as config rows, not code constants. Edited via /admin/counselors/routing-config UI. Zero deploys for tweaks.';

ALTER TABLE counselor_routing_config ENABLE ROW LEVEL SECURITY;

-- Read: super_admin, admin, and admission role can view (operational visibility)
DROP POLICY IF EXISTS "counselor_routing_config_admin_read" ON counselor_routing_config;
CREATE POLICY "counselor_routing_config_admin_read" ON counselor_routing_config
FOR SELECT
USING (
  is_super_admin()
  OR is_admin()
  OR EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
      AND cr.role_key = 'admission'
  )
);

-- Write: super_admin only (config drives prod routing — locked tight)
DROP POLICY IF EXISTS "counselor_routing_config_admin_write" ON counselor_routing_config;
CREATE POLICY "counselor_routing_config_admin_write" ON counselor_routing_config
FOR ALL
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Helper: get_routing_config(p_key) — used by future fn_* rewrites in follow-up PR.
-- SECURITY DEFINER so RPC callers (and DB functions) bypass RLS for read access.
CREATE OR REPLACE FUNCTION get_routing_config(p_key text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT value FROM counselor_routing_config WHERE key = p_key;
$$;

COMMENT ON FUNCTION get_routing_config(text) IS
  'Read counselor routing config value by key. SECURITY DEFINER so DB functions can call it. Returns NULL if key missing — callers must COALESCE to safe default.';

-- Seed 3 rows matching CURRENT hardcoded values (DO NOT change values — drop-in replacement)
INSERT INTO counselor_routing_config (key, value, description) VALUES
  ('cap_per_run',           '{"max_assignments": 500}'::jsonb, 'Max leads processed per fn_flush_queued_leads cron run (currently hardcoded LIMIT 500 in function body)'),
  ('cascade_after_minutes', '{"minutes": 60}'::jsonb,          'Minutes a counselor must be off-duty before fn_cascade_off_duty_counselors reassigns their open leads (currently default 60 in function body)'),
  ('flush_interval_minutes','{"minutes": 15}'::jsonb,          'Cron interval for fn_flush_queued_leads — informational only, actual schedule lives outside DB')
ON CONFLICT (key) DO NOTHING;

-- Trigger to auto-update updated_at on writes
CREATE OR REPLACE FUNCTION fn_counselor_routing_config_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS counselor_routing_config_touch ON counselor_routing_config;
CREATE TRIGGER counselor_routing_config_touch
BEFORE UPDATE ON counselor_routing_config
FOR EACH ROW EXECUTE FUNCTION fn_counselor_routing_config_touch();
