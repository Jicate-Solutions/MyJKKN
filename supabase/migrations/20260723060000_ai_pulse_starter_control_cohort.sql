-- Migration: 20260723060000_ai_pulse_starter_control_cohort.sql
-- Updated: 2026-07-23 — Domain Starter loop: silent rotating control cohort.
--
-- WHY: dept_outcome_lift is DEPARTMENT-level (every starter for a topic in Dept X
-- inherits Dept X's lift), so it is non-attributable per prompt — the loop was
-- self-improving on a confounded signal. A rotating ~10% control cohort, generated
-- WITHOUT the improvement hint, turns the loop into a randomized A/B: compare the
-- per-prompt copy-rate (copies/learner_count) of tuned vs control to prove the
-- tuning actually caused the usage gain (not regression to the mean).

-- 1) control flag (additive; inert until the generation cron writes it)
ALTER TABLE public.ai_pulse_domain_starters
  ADD COLUMN IF NOT EXISTS is_control boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.ai_pulse_domain_starters.is_control IS
  'Silent control cohort (~10%, rotating per cycle): generated WITHOUT the improvement hint so tuned-vs-control copy-rate isolates the tuning effect from regression.';

-- 2) record fn stores is_control (signature unchanged: (jsonb) -> uuid)
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_record_domain_starter(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_pack jsonb := COALESCE(p_payload->'prompt_pack','{}'::jsonb);
BEGIN
  INSERT INTO ai_pulse_domain_starters
    (cycle_id, topic_type, topic_id, topic_label, institution_id, learner_count,
     generated_prompt, final_prompt, prompt_pack, model, prior_context, is_control)
  VALUES
    ((p_payload->>'cycle_id')::uuid,
     p_payload->>'topic_type',
     (p_payload->>'topic_id')::uuid,
     p_payload->>'topic_label',
     NULLIF(p_payload->>'institution_id','')::uuid,
     COALESCE((p_payload->>'learner_count')::int, 0),
     p_payload->>'generated_prompt',
     COALESCE(v_pack->'en'->>'build', p_payload->>'final_prompt', p_payload->>'generated_prompt'),
     v_pack,
     p_payload->>'model',
     COALESCE(p_payload->'prior_context','{}'::jsonb),
     COALESCE((p_payload->>'is_control')::boolean, false))
  ON CONFLICT (cycle_id, topic_type, topic_id) DO UPDATE
    SET generated_prompt = EXCLUDED.generated_prompt,
        final_prompt     = EXCLUDED.final_prompt,
        prompt_pack      = EXCLUDED.prompt_pack,
        model            = EXCLUDED.model,
        learner_count    = EXCLUDED.learner_count,
        prior_context    = EXCLUDED.prior_context,
        is_control       = EXCLUDED.is_control,
        updated_at       = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

-- 3) compare fn: randomized A/B readout (tuned vs control per-prompt copy-rate).
--    tuning_lift > 0 => the improvement hint drives more usage (loop self-improves);
--    tuning_lift ~ 0 => the "improvement" was regression, not the tuning.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_control_vs_tuned(p_cycle_id uuid DEFAULT NULL)
 RETURNS TABLE(cycle_id uuid, tuned_n integer, tuned_avg_copy_rate numeric,
               control_n integer, control_avg_copy_rate numeric, tuning_lift numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH c AS (
    SELECT COALESCE(p_cycle_id,
      (SELECT d.cycle_id FROM ai_pulse_domain_starters d ORDER BY d.created_at DESC LIMIT 1)) AS cid
  ),
  base AS (
    SELECT d.is_control, d.copies::numeric / NULLIF(d.learner_count, 0) AS copy_rate
    FROM ai_pulse_domain_starters d, c
    WHERE d.cycle_id = c.cid AND d.learner_count > 0
  )
  SELECT (SELECT cid FROM c),
    count(*) FILTER (WHERE NOT is_control)::int,
    round(avg(copy_rate) FILTER (WHERE NOT is_control), 4),
    count(*) FILTER (WHERE is_control)::int,
    round(avg(copy_rate) FILTER (WHERE is_control), 4),
    round(COALESCE(avg(copy_rate) FILTER (WHERE NOT is_control),0)
        - COALESCE(avg(copy_rate) FILTER (WHERE is_control),0), 4)
  FROM base;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_control_vs_tuned(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_control_vs_tuned(uuid) TO authenticated;
