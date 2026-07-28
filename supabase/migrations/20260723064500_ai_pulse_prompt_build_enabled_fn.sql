-- Migration: 20260723064500_ai_pulse_prompt_build_enabled_fn.sql
-- Updated: 2026-07-23 — tiny switch-check so the build-from-parts card self-hides
-- when the feature is dark. Mirrors the DARK gate used by every other prompt fn.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_prompt_build_enabled()
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT (value_jsonb#>>'{}')::boolean FROM ai_pulse_policies
                   WHERE config_key = 'prompt_build_enabled' AND is_active), false);
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_prompt_build_enabled() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_prompt_build_enabled() TO authenticated;
