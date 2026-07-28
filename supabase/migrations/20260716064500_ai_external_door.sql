-- Updated: 2026-07-16 - AI external door (Phase A): app_id on ai_jobs,
-- external_allowed on ai_job_types, external enqueue/result RPCs, 3 bug.* recipes.

-- 1) Columns
ALTER TABLE public.ai_jobs ADD COLUMN IF NOT EXISTS app_id text;
CREATE INDEX IF NOT EXISTS idx_ai_jobs_app_id ON public.ai_jobs(app_id) WHERE app_id IS NOT NULL;
ALTER TABLE public.ai_job_types ADD COLUMN IF NOT EXISTS external_allowed boolean NOT NULL DEFAULT false;

-- 2) External enqueue: only external_allowed recipes; priority 500; app_id stamped atomically.
CREATE OR REPLACE FUNCTION public.fn_ai_enqueue_external(
  p_job_type text, p_payload jsonb DEFAULT '{}'::jsonb,
  p_app_id text DEFAULT NULL, p_dedupe_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
DECLARE
  v_res jsonb; v_id uuid;
BEGIN
  IF p_app_id IS NULL OR length(trim(p_app_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'app_id required');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_job_types
    WHERE job_type = p_job_type AND enabled AND external_allowed
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task not available to external apps');
  END IF;

  v_res := public.fn_ai_enqueue_system(p_job_type, p_payload, p_dedupe_key);
  IF NOT COALESCE((v_res->>'ok')::boolean, false) THEN
    RETURN v_res;  -- in_flight / disabled / no seat owner — pass reason through
  END IF;

  v_id := (v_res->>'job_id')::uuid;
  -- Same transaction as the insert above: the drain can never claim this job
  -- before app_id + external priority are stamped.
  UPDATE public.ai_jobs SET app_id = p_app_id, priority = 500 WHERE id = v_id;
  RETURN jsonb_build_object('ok', true, 'job_id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_enqueue_external(text,jsonb,text,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_enqueue_external(text,jsonb,text,text) TO service_role;

-- 3) External result read: scoped to the owning app_id (cross-app isolation).
CREATE OR REPLACE FUNCTION public.fn_ai_external_result(p_job_id uuid, p_app_id text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'status', j.status, 'result', j.result, 'error', j.error,
    'requested_at', j.requested_at, 'completed_at', j.completed_at)
  FROM public.ai_jobs j
  WHERE j.id = p_job_id AND j.app_id = p_app_id;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_external_result(uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_external_result(uuid,text) TO service_role;

-- 4) Seed the 3 bug.* recipes (external set menu). ON CONFLICT DO UPDATE so this
--    seed wins even if a stub row exists (first-applied-wins lesson, 2026-07-15).
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled,
   input_schema, expected_seconds, external_allowed)
VALUES
('bug.summarize', 'Bug — plain-English summary (external)',
 'External-app task: summarize a bug report for a busy developer. Enqueued via fn_ai_enqueue_external only.',
 $tpl$You are the bug-triage assistant for a JKKN application. Summarize this bug report in plain English for a busy developer.

App: {{app}}
Bug title: {{title}}
Description: {{description}}
Extra context: {{context}}

Reply with exactly:
1. A 2-3 sentence plain-English summary.
2. One line "Likely area:" naming the probable module/feature.
3. One line "Severity guess:" one of low|medium|high|critical with a short reason.$tpl$,
 'none', 'job.result', false, 'max', 'seat_owner', 2, false, true,
 '[{"key":"app","type":"textarea","label":"app","required":false},
   {"key":"title","type":"textarea","label":"title","required":true},
   {"key":"description","type":"textarea","label":"description","required":true},
   {"key":"context","type":"textarea","label":"context","required":false}]'::jsonb,
 30, true),
('bug.suggest_fix', 'Bug — root cause + fix suggestion (external)',
 'External-app task: hypothesize root cause and suggest fix steps for a bug report.',
 $tpl$You are a senior debugging assistant for a JKKN application. Analyze this bug and suggest how to fix it.

App: {{app}}
Bug title: {{title}}
Description: {{description}}
Technical context (stack traces / console / network, may be empty): {{context}}

Reply with exactly:
1. "Likely root cause:" 1-2 short hypotheses, most probable first.
2. "Suggested fix:" numbered steps, max 5, concrete.
3. "Verify after fixing:" one line on how to confirm the fix worked.$tpl$,
 'none', 'job.result', false, 'max', 'seat_owner', 2, false, true,
 '[{"key":"app","type":"textarea","label":"app","required":false},
   {"key":"title","type":"textarea","label":"title","required":true},
   {"key":"description","type":"textarea","label":"description","required":true},
   {"key":"context","type":"textarea","label":"context","required":false}]'::jsonb,
 40, true),
('bug.categorize', 'Bug — severity + category tags (external)',
 'External-app task: classify a bug report; returns strict JSON for machine use.',
 $tpl$You are a bug classification engine. Classify this bug report.

App: {{app}}
Bug title: {{title}}
Description: {{description}}
Extra context: {{context}}

Reply with STRICT JSON only, no prose, exactly this shape:
{"severity":"low|medium|high|critical","category":"ui|logic|performance|security|data|integration|other","module_guess":"<short module or feature name>","reason":"<one short sentence>"}$tpl$,
 'none', 'job.result', false, 'max', 'seat_owner', 2, false, true,
 '[{"key":"app","type":"textarea","label":"app","required":false},
   {"key":"title","type":"textarea","label":"title","required":true},
   {"key":"description","type":"textarea","label":"description","required":true},
   {"key":"context","type":"textarea","label":"context","required":false}]'::jsonb,
 20, true)
ON CONFLICT (job_type) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  prompt_template = EXCLUDED.prompt_template, input_schema = EXCLUDED.input_schema,
  external_allowed = true, enabled = true, updated_at = now();

-- 5) Retention: external job rows auto-purge after 90 days (caps table growth;
--    Director resource-guard decision 2026-07-16). Internal rows (app_id IS NULL)
--    keep their existing lifecycle. cron.schedule upserts by jobname.
SELECT cron.schedule(
  'ai-external-jobs-retention',
  '38 3 * * *',
  $cron$DELETE FROM public.ai_jobs WHERE app_id IS NOT NULL AND requested_at < now() - interval '90 days'$cron$
);
