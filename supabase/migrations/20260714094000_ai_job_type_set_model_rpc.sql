-- ============================================================================
-- 20260714094000_ai_job_type_set_model_rpc.sql
-- ----------------------------------------------------------------------------
-- FULL CONFIG MERGE (P0) — Phase 2 of N: the admin WRITE path for model
-- governance on the registry.
--
-- After 20260714093000 the ai_job_types registry carries the model-governance
-- columns and getModelForFeature reads them FIRST. So the /admin/ai-models
-- model-edit PATCH must also reach the registry, or a model swap would update
-- ai_model_config while the resolver keeps reading a stale registry row. This
-- RPC is that write path — the PATCH route mirrors the resolved model here
-- after writing ai_model_config (which keeps its own audit trail).
--
-- Super-admin gated (internal is_super_admin() RAISE), anon/PUBLIC revoked,
-- authenticated granted — mirrors the #1998 / 20260713000100 RPC style. It
-- touches ONLY the 5 model columns; it never changes the drain-runnable
-- fields (enabled/lane/allow_rule/prompt_template/…).
--
-- Ref: continuation brief 2026-07-14; migration 20260713000100 (RPC pattern);
--      lib/services/platform/ai-model-config-service.ts (the resolver).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_ai_job_type_set_model(
  p_job_type              text,
  p_provider              text,
  p_model_id              text,
  p_fallback_provider     text    DEFAULT NULL,
  p_fallback_model_id     text    DEFAULT NULL,
  p_monthly_spend_cap_inr numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $fn$
DECLARE
  v_row public.ai_job_types%ROWTYPE;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: super_admin required';
  END IF;

  UPDATE public.ai_job_types
     SET provider              = nullif(trim(coalesce(p_provider, '')), ''),
         model_id              = nullif(trim(coalesce(p_model_id, '')), ''),
         fallback_provider     = nullif(trim(coalesce(p_fallback_provider, '')), ''),
         fallback_model_id     = nullif(trim(coalesce(p_fallback_model_id, '')), ''),
         monthly_spend_cap_inr = p_monthly_spend_cap_inr,
         updated_at            = now()
   WHERE job_type = p_job_type
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    -- Feature not registered in the registry (e.g. a model_config-only key that
    -- was never registered). Caller treats this as a non-fatal miss — the
    -- resolver will fall back to ai_model_config for such a feature anyway.
    RETURN jsonb_build_object('ok', false, 'error', 'unknown job_type');
  END IF;

  RETURN jsonb_build_object('ok', true, 'job_type', v_row.job_type);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION
  public.fn_ai_job_type_set_model(text, text, text, text, text, numeric)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION
  public.fn_ai_job_type_set_model(text, text, text, text, text, numeric)
  TO authenticated;
