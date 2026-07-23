-- ============================================================================
-- Migration: 20260515000001_fn_get_policy_json
-- HR gap-closure Wave 1 (Agent α) — JSONB-typed policy reader sugar
-- ============================================================================
-- Adds `fn_get_policy_json` — a JSONB-returning getter parallel to the
-- existing `fn_get_policy_int / _text / _bool` family from migration
-- 20260429000002_platform_policies_substrate.
--
-- Why a dedicated JSONB getter (not just fn_get_policy):
--   • `fn_get_policy` already returns JSONB but does NOT accept a default.
--     Callers must wrap in COALESCE at every callsite. Consumers reading
--     structured (object/array) policies need a consistent default-fallback
--     pattern matching the scalar getters.
--   • Makes intent grep-able: any reader of an object-shaped policy uses
--     `fn_get_policy_json('hr.payroll.formula', '{}'::jsonb)` — symmetric
--     with `fn_get_policy_int(...)` / `fn_get_policy_text(...)`.
--
-- TIER 0 — safe-additive (new function only; no DDL on existing tables).
-- Idempotent. Safe to re-apply.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_get_policy_json(
  p_key TEXT,
  p_default JSONB DEFAULT NULL,
  p_scope_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(fn_get_policy(p_key, p_scope_id), p_default);
$$;

-- Lock down EXECUTE: anon should not read platform_policies via RPC.
REVOKE EXECUTE ON FUNCTION fn_get_policy_json(TEXT, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_get_policy_json(TEXT, JSONB, UUID) TO authenticated, service_role;

-- Functional smoke test: resolves an existing seeded JSONB policy and a
-- non-existent key (default fallback).
DO $$
DECLARE
  v_existing JSONB;
  v_missing  JSONB;
BEGIN
  -- Re-use an existing array-typed seeded policy from the substrate migration.
  v_existing := fn_get_policy_json('hr.attendance.self_heal_step2_channels', '[]'::jsonb, NULL);
  IF v_existing IS NULL OR jsonb_typeof(v_existing) <> 'array' THEN
    RAISE EXCEPTION 'fn_get_policy_json failed: expected array for hr.attendance.self_heal_step2_channels, got %', v_existing;
  END IF;

  -- Non-existent key returns the default.
  v_missing := fn_get_policy_json('nonexistent.policy.key.test', '{"ok":true}'::jsonb, NULL);
  IF v_missing IS NULL OR v_missing->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'fn_get_policy_json failed: expected default fallback {"ok":true}, got %', v_missing;
  END IF;

  RAISE NOTICE 'fn_get_policy_json: smoke test passed';
END $$;
