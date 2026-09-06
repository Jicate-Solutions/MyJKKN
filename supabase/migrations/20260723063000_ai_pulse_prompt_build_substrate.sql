-- Migration: 20260723063000_ai_pulse_prompt_build_substrate.sql
-- Updated: 2026-07-23 — Domain Starter learning loop: build-from-parts + grader (DARK substrate).
--
-- The learner assembles a prompt from parts (role + context + task + output format);
-- an AI grades it against that checklist on the ₹0 Max lane. This is the dark backend
-- (no UI yet, kill switch off) — mirrors how the domain-starter loop shipped (#2185
-- substrate, then #2197 UI). Base table is LOCKED; learner reads/writes only through
-- SECURITY DEFINER RPCs (answer-key-leak pattern); the grade writer is service_role-only.

-- ── 1) capture table (locked) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_pulse_prompt_builds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id       uuid NOT NULL,
  cycle_id         uuid,
  starter_id       uuid,          -- reference subject prompt they learned from (nullable)
  topic_type       text,
  topic_id         uuid,
  institution_id   uuid,
  parts            jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {role, context, task, format}
  assembled_prompt text NOT NULL,
  grade            jsonb,         -- {has_role,has_context,has_task,has_format,score,tips[]}
  grade_status     text NOT NULL DEFAULT 'pending',     -- pending | graded | error
  graded_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_pulse_prompt_builds_pending_idx
  ON public.ai_pulse_prompt_builds (created_at) WHERE grade_status = 'pending';
CREATE INDEX IF NOT EXISTS ai_pulse_prompt_builds_learner_idx
  ON public.ai_pulse_prompt_builds (learner_id, cycle_id);

ALTER TABLE public.ai_pulse_prompt_builds ENABLE ROW LEVEL SECURITY;
-- Base table locked: only admins read directly. Learners go through the SECDEF fns
-- below; the grade cron uses the service-role client (bypasses RLS). No authenticated
-- INSERT/UPDATE policy => direct writes are blocked; all writes flow through RPCs.
DROP POLICY IF EXISTS prompt_builds_admin_read ON public.ai_pulse_prompt_builds;
CREATE POLICY prompt_builds_admin_read ON public.ai_pulse_prompt_builds
  FOR SELECT TO authenticated USING (is_super_admin() OR is_admin());

-- ── 2) learner submit (kill-switch-gated) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_submit_prompt_build(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_learner uuid; v_inst uuid; v_id uuid;
BEGIN
  IF NOT COALESCE((SELECT (value_jsonb#>>'{}')::boolean FROM ai_pulse_policies
                   WHERE config_key = 'prompt_build_enabled' AND is_active), false) THEN
    RAISE EXCEPTION 'prompt_build_disabled';
  END IF;
  SELECT learner_id, institution_id INTO v_learner, v_inst FROM profiles WHERE id = auth.uid();
  IF v_learner IS NULL THEN RAISE EXCEPTION 'not_a_learner'; END IF;
  IF COALESCE(trim(p_payload->>'assembled_prompt'),'') = '' THEN RAISE EXCEPTION 'empty_prompt'; END IF;

  INSERT INTO ai_pulse_prompt_builds
    (learner_id, cycle_id, starter_id, topic_type, topic_id, institution_id, parts, assembled_prompt)
  VALUES
    (v_learner,
     NULLIF(p_payload->>'cycle_id','')::uuid,
     NULLIF(p_payload->>'starter_id','')::uuid,
     p_payload->>'topic_type',
     NULLIF(p_payload->>'topic_id','')::uuid,
     v_inst,
     COALESCE(p_payload->'parts','{}'::jsonb),
     p_payload->>'assembled_prompt')
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

-- ── 3) grade writer (service_role only — cron) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_record_prompt_grade(p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE ai_pulse_prompt_builds SET
    grade        = COALESCE(p_payload->'grade', '{}'::jsonb),
    grade_status = COALESCE(NULLIF(p_payload->>'grade_status',''), 'graded'),
    graded_at    = now(),
    updated_at   = now()
  WHERE id = (p_payload->>'build_id')::uuid;
END; $function$;

-- ── 4) learner reads own builds + grades ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_my_prompt_builds(p_cycle_id uuid DEFAULT NULL)
 RETURNS TABLE(id uuid, cycle_id uuid, topic_type text, topic_id uuid, parts jsonb,
               assembled_prompt text, grade jsonb, grade_status text, created_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_learner uuid;
BEGIN
  SELECT learner_id INTO v_learner FROM profiles WHERE id = auth.uid();
  IF v_learner IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT b.id, b.cycle_id, b.topic_type, b.topic_id, b.parts,
         b.assembled_prompt, b.grade, b.grade_status, b.created_at
  FROM ai_pulse_prompt_builds b
  WHERE b.learner_id = v_learner AND (p_cycle_id IS NULL OR b.cycle_id = p_cycle_id)
  ORDER BY b.created_at DESC LIMIT 50;
END; $function$;

-- ── locks ───────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_submit_prompt_build(jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_submit_prompt_build(jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_record_prompt_grade(jsonb) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_record_prompt_grade(jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_my_prompt_builds(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_my_prompt_builds(uuid) TO authenticated;

-- ── 5) kill switch (DARK) + job type (Max lane, interactive=false) ──────────
INSERT INTO ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type, is_active)
SELECT 'prompt_build_enabled',
       'Prompt Build (learn prompt engineering)',
       'Master switch for the build-from-parts prompt-engineering exercise + AI grader. DARK until the learner UI ships and this is turned on.',
       'false'::jsonb, 'bool', true
WHERE NOT EXISTS (SELECT 1 FROM ai_pulse_policies WHERE config_key = 'prompt_build_enabled');

INSERT INTO ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled, input_schema, expected_seconds)
SELECT 'ai_pulse.prompt_grade',
       'AI Pulse - Prompt build grader',
       'Grades a learner''s build-from-parts prompt against a checklist (role/context/task/output-format); returns JSON with per-part flags, a 0-100 score, and short tips.',
       '{{prompt}}', 'none', 'job.result',
       false, 'max', 'seat_owner', 3, true, true,
       '[{"key":"prompt","type":"textarea","label":"Grading request","required":true}]'::jsonb, 25
WHERE NOT EXISTS (SELECT 1 FROM ai_job_types WHERE job_type = 'ai_pulse.prompt_grade');
