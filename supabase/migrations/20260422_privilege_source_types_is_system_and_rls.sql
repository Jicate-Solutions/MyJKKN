-- =====================================================================
-- Q1 compliance fix — 2026-04-22 (applied to prod via
-- mcp__supabase__apply_migration). This file is for repo + staging.
--
-- Root cause of the miss: PR #302 shipped privilege_source_types without
-- is_system. A director could delete 'manual' or 'lc_members' from a
-- future admin UI and break every sourced privilege group + the view.
-- Canonical pattern (okr_metric_registry, leave_types) uses is_system=true
-- for load-bearing rows. Surfaced by /myjkkn-chain Q1 gate re-run.
-- =====================================================================

ALTER TABLE privilege_source_types
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN privilege_source_types.is_system IS
  'When true, this source is load-bearing and cannot be unregistered or deleted.';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'privilege_source_types_config_schema_is_object') THEN
    ALTER TABLE privilege_source_types
      ADD CONSTRAINT privilege_source_types_config_schema_is_object
      CHECK (jsonb_typeof(config_schema) = 'object');
  END IF;
END $$;

UPDATE privilege_source_types
   SET is_system = true, updated_at = now()
 WHERE kind IN ('manual', 'lc_members') AND is_system = false;

-- unregister() now blocks based on is_system, not just hardcoded 'manual'
CREATE OR REPLACE FUNCTION privilege_source_unregister(p_kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_view_name text; v_in_use_count int; v_is_system boolean;
BEGIN
  IF p_kind IS NULL OR p_kind = '' THEN
    RAISE EXCEPTION 'privilege_source_unregister: kind must be non-empty'; END IF;
  SELECT is_system INTO v_is_system FROM privilege_source_types WHERE kind = p_kind;
  IF v_is_system IS NULL THEN
    RAISE EXCEPTION 'privilege_source_unregister: source_kind=% is not registered', p_kind; END IF;
  IF v_is_system THEN
    RAISE EXCEPTION 'privilege_source_unregister: source_kind=% is a system source and cannot be unregistered', p_kind; END IF;
  SELECT COUNT(*) INTO v_in_use_count FROM privilege_groups WHERE source_kind = p_kind;
  IF v_in_use_count > 0 THEN
    RAISE EXCEPTION 'privilege_source_unregister: source_kind=% is in use by % privilege_groups', p_kind, v_in_use_count; END IF;
  v_view_name := '_resolver_privilege_' || p_kind;
  EXECUTE 'DROP VIEW IF EXISTS ' || quote_ident(v_view_name);
  DELETE FROM privilege_source_types WHERE kind = p_kind;
  PERFORM _privilege_rebuild_effective_view();
END;
$fn$;

ALTER TABLE privilege_source_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS privilege_source_types_read_all ON privilege_source_types;
CREATE POLICY privilege_source_types_read_all
  ON privilege_source_types FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS privilege_source_types_super_admin_write ON privilege_source_types;
CREATE POLICY privilege_source_types_super_admin_write
  ON privilege_source_types FOR ALL TO authenticated
  USING (is_super_admin() OR is_admin())
  WITH CHECK ((is_super_admin() OR is_admin()) AND is_system = false);
