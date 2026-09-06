-- =====================================================================
-- Spend-cap enforcement helper — month-to-date spend for one feature
-- Migration: 2026-07-11
-- =====================================================================
-- Director decision (interview 2026-07-11): the 'Monthly spend cap' box on
-- /admin/ai-models becomes REAL. getModelForFeature() calls this on every
-- cache miss (≤1/min per feature per instance); when MTD spend >= cap, an
-- anthropic feature degrades to the cheapest chat model (claude-haiku-4-5)
-- instead of going dark. PostgREST aggregates are disabled on this project
-- (PGRST123), hence this SECURITY DEFINER sum.
--
-- service_role only: the resolver reads through the service-role client, and
-- per-feature spend totals are not something every logged-in user should be
-- able to enumerate.

CREATE OR REPLACE FUNCTION public.fn_ai_feature_mtd_spend(p_feature_key text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Month boundary anchored to IST (the Director's calendar), not the DB's
  -- UTC session TZ — otherwise caps stay spuriously tripped for ~5.5h into
  -- each new IST month (deep-review finding #3).
  SELECT COALESCE(sum(cost_inr), 0)
    FROM public.ai_model_usage
   WHERE feature_key = p_feature_key
     AND invoked_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_feature_mtd_spend(text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_feature_mtd_spend(text) TO service_role;

NOTIFY pgrst, 'reload schema';
