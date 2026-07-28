-- Feature A wiring: fn_ai_job_type_set_model opens a model_switch_evaluations row
-- when a job_type's model REALLY changes (both old + new non-null → skips first-set and
-- deactivation). Recommendation-only: this NEVER reverts a switch, it only starts the
-- rolling old-vs-new comparison for a human to read later. Supersedes the earlier safety-floor
-- version (20260723140000) by re-including that guard; only the switch-detection block is new.
CREATE OR REPLACE FUNCTION public.fn_ai_job_type_set_model(p_job_type text, p_provider text, p_model_id text, p_fallback_provider text DEFAULT NULL::text, p_fallback_model_id text DEFAULT NULL::text, p_monthly_spend_cap_inr numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '10s'
AS $function$
DECLARE
  v_row public.ai_job_types%ROWTYPE;
  v_old public.ai_job_types%ROWTYPE;
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

  SELECT * INTO v_old FROM public.ai_job_types WHERE job_type = p_job_type;

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

  -- Feature A: open an auto-compare evaluation when the effective model REALLY changed.
  -- Both old + new must be non-null (skip first-set with no baseline, and deactivation to null).
  IF v_old.model_id IS DISTINCT FROM v_row.model_id
     AND v_old.model_id IS NOT NULL AND v_row.model_id IS NOT NULL THEN
    -- Supersede any still-collecting eval for this job_type — the prior comparison is now moot.
    UPDATE public.model_switch_evaluations
       SET status = 'verdict_ready', verdict = 'tie', verdict_at = now(), updated_at = now()
     WHERE job_type = p_job_type AND status = 'collecting';
    INSERT INTO public.model_switch_evaluations
       (job_type, old_provider, old_model_id, new_provider, new_model_id, switched_by)
    VALUES (p_job_type, v_old.provider, v_old.model_id, v_row.provider, v_row.model_id, auth.uid());
  END IF;

  RETURN jsonb_build_object('ok', true, 'job_type', v_row.job_type);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_job_type_set_model(text,text,text,text,text,numeric) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_job_type_set_model(text,text,text,text,text,numeric) TO authenticated, service_role;
