-- ============================================================================
-- Migration: 20260522_fn_get_policy_clinical_reasoning
-- AICBL → PDE Clinical Reasoning sprint, Agent A — Step A8
-- ============================================================================
-- RPC for typed clinical_reasoning policy reads.
--
-- Used by coach service, OSCE scoring service, and faculty UIs to read
-- their policy values without each caller hand-rolling the SELECT.
--
-- Usage from Postgres / RPC:
--   SELECT fn_get_policy_clinical_reasoning('lifetime_attempts_per_case', '5'::jsonb);
--   SELECT fn_get_policy_clinical_reasoning('ai.provider', '"google"'::jsonb);
--
-- Usage from Supabase client (Agent B will call):
--   supabase.rpc('fn_get_policy_clinical_reasoning', { p_key: 'ai.model', p_default: 'gemini-2.5-pro' });
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_get_policy_clinical_reasoning(
  p_key   TEXT,
  p_default JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value JSONB;
BEGIN
  SELECT value INTO v_value
  FROM platform_policies
  WHERE policy_key = 'clinical_reasoning.' || p_key
    AND scope_type = 'global'
    AND is_active = true
  LIMIT 1;

  RETURN COALESCE(v_value, p_default);
END;
$$;

COMMENT ON FUNCTION fn_get_policy_clinical_reasoning(TEXT, JSONB) IS
  'Typed read for clinical_reasoning.* platform_policies. Falls back to p_default when key not found. Auto-prefixes the namespace.';

-- Permission: anon + authenticated need to be able to call this (read-only)
GRANT EXECUTE ON FUNCTION fn_get_policy_clinical_reasoning(TEXT, JSONB) TO anon, authenticated;
