-- Updated: 2026-07-23 — Feature B: Safety-judge model FLOOR enforced at the SOURCE-OF-TRUTH write path.
-- scf.note_safety_judge / scf.judge_help_ask / bug.reverify make safety/verify judgments and must
-- NEVER run below Sonnet (block Haiku or any non-Claude model on the free/max seat).
-- WHY HERE (not the PATCH route): the /admin/ai-models PATCH guard gates ai_model_config, but these 3
-- keys have NO ai_model_config row → the route 404s before the guard, and the resolver reads
-- ai_job_types anyway. fn_ai_job_type_set_model is the real chokepoint for ai_job_types.model_id writes
-- (the screen's PATCH mirror AND the AI Studio tab both call it). The UI dropdown filter (PR #2307) is
-- the UX layer; THIS is the enforcement. Null model_id is allowed (resolves to the drain default = Sonnet).
CREATE OR REPLACE FUNCTION public.fn_ai_job_type_set_model(p_job_type text, p_provider text, p_model_id text, p_fallback_provider text DEFAULT NULL::text, p_fallback_model_id text DEFAULT NULL::text, p_monthly_spend_cap_inr numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '10s'
AS $function$
DECLARE
  v_row public.ai_job_types%ROWTYPE;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: super_admin required';
  END IF;

  -- Safety-judge model FLOOR (Feature B): never below Sonnet for these jobs.
  IF p_job_type IN ('scf.note_safety_judge','scf.judge_help_ask','bug.reverify')
     AND nullif(trim(coalesce(p_model_id,'')),'') IS NOT NULL
     AND ( p_model_id ILIKE '%haiku%'
           OR (nullif(trim(coalesce(p_provider,'')),'') IS NOT NULL AND lower(p_provider) <> 'anthropic') ) THEN
    RAISE EXCEPTION 'Safety-judge jobs cannot be set below Sonnet (got %/%). Use Sonnet or Opus.', p_provider, p_model_id;
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
    RETURN jsonb_build_object('ok', false, 'error', 'unknown job_type');
  END IF;

  RETURN jsonb_build_object('ok', true, 'job_type', v_row.job_type);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_job_type_set_model(text,text,text,text,text,numeric) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_job_type_set_model(text,text,text,text,text,numeric) TO authenticated, service_role;
