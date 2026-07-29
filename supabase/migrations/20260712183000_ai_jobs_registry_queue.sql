-- ============================================================================
-- 20260712183000_ai_jobs_registry_queue.sql
-- ----------------------------------------------------------------------------
-- Generic AI job registry + queue + Windows drain pipe. Applied live via the
-- Management API 2026-07-12; this file records it for rebuild fidelity.
--
-- ai_job_types = self-describing registry (a row carries prompt_template +
-- tool_set + output_target, so the generic runner runs a job with no per-type
-- code). ai_jobs = the queue. fn_ai_enqueue/status/job_types_active are
-- authenticated + auth.uid()-gated; fn_ai_claim/complete/fail are service-role
-- only (a logged-in user can never claim another user's job). anon revoked.
--
-- lane routing is DEFERRED (every type defaults to 'max'). ai_query.chat is
-- seeded but left DISABLED until the chat cutover — the live AI Assistant still
-- runs on the separate max_lane_chat_requests path and is unaffected.
-- Ref: memory/project_ai_jobs_registry_lane.md
-- ============================================================================

-- ============================================================================
-- AI Jobs — registry + queue + Windows drain pipe (lane routing deferred)
-- Additive. Nothing existing moves. Applied 2026-07-12.
-- ============================================================================

-- ── 1. REGISTRY: self-describing catalog of job types ───────────────────────
CREATE TABLE IF NOT EXISTS public.ai_job_types (
  job_type        text PRIMARY KEY,
  title           text NOT NULL,
  description     text,
  prompt_template text,                                   -- instruction to Claude; may use {{payload}} placeholders
  tool_set        text NOT NULL DEFAULT 'all',            -- 'all' | 'none' | comma-list of ai_rpc_* tool names
  output_target   text NOT NULL DEFAULT 'job.result',     -- 'job.result' | 'table:<name>' | 'inbox'
  interactive     boolean NOT NULL DEFAULT false,         -- true = a user is waiting
  lane            text NOT NULL DEFAULT 'max',            -- DEFERRED: routing decision parked; default max
  allow_rule      text NOT NULL DEFAULT 'seat_owner',     -- SAFE default (license question parked)
  max_inflight    int  NOT NULL DEFAULT 3,
  schedulable     boolean NOT NULL DEFAULT false,
  enabled         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_job_types_lane_chk  CHECK (lane IN ('max','api','either')),
  CONSTRAINT ai_job_types_out_chk   CHECK (output_target = 'job.result' OR output_target = 'inbox' OR output_target LIKE 'table:%'),
  CONSTRAINT ai_job_types_allow_chk CHECK (allow_rule = 'seat_owner' OR allow_rule = 'authenticated' OR allow_rule LIKE 'permission:%')
);
COMMENT ON TABLE public.ai_job_types IS 'Registry of AI job types. Self-describing: a row carries how to run the job (prompt_template, tool_set, output_target) so the generic runner needs no per-type code. lane routing is deferred (default max).';

-- ── 2. QUEUE: one row per request to run a job ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type      text NOT NULL REFERENCES public.ai_job_types(job_type),
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by  uuid NOT NULL,                            -- always auth.uid(), never caller-supplied
  status        text NOT NULL DEFAULT 'pending',          -- pending|claimed|running|done|error|canceled
  lane          text NOT NULL DEFAULT 'max',              -- resolved at enqueue (mirrors type.lane for now)
  priority      int  NOT NULL DEFAULT 100,                -- lower = sooner; interactive can jump batch later
  claimed_by    text,
  attempts      int  NOT NULL DEFAULT 0,
  result        jsonb,
  error         text,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  claimed_at    timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  delivered_at  timestamptz,
  CONSTRAINT ai_jobs_status_chk CHECK (status IN ('pending','claimed','running','done','error','canceled'))
);
CREATE INDEX IF NOT EXISTS ai_jobs_claim_idx     ON public.ai_jobs (lane, priority, requested_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS ai_jobs_requester_idx ON public.ai_jobs (requested_by, status);

-- ── 3. RLS: users see only their own jobs + enabled types; writes via RPC only
ALTER TABLE public.ai_job_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_jobs      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_job_types_read ON public.ai_job_types;
CREATE POLICY ai_job_types_read ON public.ai_job_types
  FOR SELECT TO authenticated USING (enabled = true);

DROP POLICY IF EXISTS ai_jobs_read_own ON public.ai_jobs;
CREATE POLICY ai_jobs_read_own ON public.ai_jobs
  FOR SELECT TO authenticated USING (requested_by = auth.uid());
-- (no INSERT/UPDATE/DELETE policy for authenticated → all writes go through the SECURITY DEFINER RPCs)

REVOKE ALL ON public.ai_job_types FROM anon;
REVOKE ALL ON public.ai_jobs      FROM anon;

-- ── 4. RPC: app enqueues a job (authenticated; identity from auth.uid()) ─────
CREATE OR REPLACE FUNCTION public.fn_ai_enqueue(p_job_type text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '10s'
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_type  public.ai_job_types%ROWTYPE;
  v_ok    boolean;
  v_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_type FROM public.ai_job_types WHERE job_type = p_job_type AND enabled = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown or disabled job_type');
  END IF;

  -- allow_rule gate (the pluggable seam; seat_owner reuses the existing allowlist)
  IF v_type.allow_rule = 'seat_owner' THEN
    v_ok := EXISTS (SELECT 1 FROM public.ai_model_config
                     WHERE feature_key = 'ai_query.natural_language' AND is_active
                       AND COALESCE(config_json->'max_lane_user_ids','[]'::jsonb) ? v_uid::text);
  ELSIF v_type.allow_rule LIKE 'permission:%' THEN
    v_ok := public.user_has_permission(substring(v_type.allow_rule from 12));
  ELSE  -- 'authenticated'
    v_ok := true;
  END IF;
  IF NOT COALESCE(v_ok, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not allowed for this job_type');
  END IF;

  -- per-requester in-flight cap (atomic: gate inside the INSERT; serialize racers)
  PERFORM pg_advisory_xact_lock(hashtext('ai_jobs:' || v_uid::text || ':' || p_job_type));
  INSERT INTO public.ai_jobs (job_type, payload, requested_by, lane)
  SELECT p_job_type, COALESCE(p_payload,'{}'::jsonb), v_uid, v_type.lane
   WHERE (SELECT count(*) FROM public.ai_jobs
           WHERE requested_by = v_uid AND job_type = p_job_type
             AND status IN ('pending','claimed','running')) < v_type.max_inflight
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too many in-flight jobs of this type');
  END IF;
  RETURN jsonb_build_object('ok', true, 'job_id', v_id);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_enqueue(text, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_enqueue(text, jsonb) TO authenticated;

-- ── 5. RPC: requester reads their job status (authenticated) ─────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_job_status(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '10s'
AS $fn$
DECLARE v_uid uuid := auth.uid(); r public.ai_jobs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  SELECT * INTO r FROM public.ai_jobs WHERE id = p_job_id AND requested_by = v_uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
  RETURN jsonb_build_object('status', r.status, 'result', r.result, 'error', r.error,
                            'job_type', r.job_type, 'completed_at', r.completed_at);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_job_status(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_job_status(uuid) TO authenticated;

-- ── 6. RUNNER RPCs (service role only): read registry, claim, complete, fail ─
-- Windows uses the service key (bypasses RLS). We still REVOKE from authenticated
-- so a logged-in user can never claim/complete someone else's job.

CREATE OR REPLACE FUNCTION public.fn_ai_job_types_active()
RETURNS SETOF public.ai_job_types LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $fn$ SELECT * FROM public.ai_job_types WHERE enabled = true ORDER BY job_type; $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_job_types_active() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_job_types_active() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_ai_claim(p_lane text DEFAULT NULL, p_runner text DEFAULT 'unknown')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '10s'
AS $fn$
DECLARE j public.ai_jobs%ROWTYPE; t public.ai_job_types%ROWTYPE;
BEGIN
  UPDATE public.ai_jobs SET status='claimed', claimed_by=p_runner, claimed_at=now()
   WHERE id = (
     SELECT id FROM public.ai_jobs
      WHERE status='pending' AND (p_lane IS NULL OR lane = p_lane)
      ORDER BY priority ASC, requested_at ASC
      FOR UPDATE SKIP LOCKED LIMIT 1)
  RETURNING * INTO j;
  IF NOT FOUND THEN RETURN jsonb_build_object('job', null); END IF;
  SELECT * INTO t FROM public.ai_job_types WHERE job_type = j.job_type;
  -- hand the runner everything it needs to execute from data alone
  RETURN jsonb_build_object(
    'job', jsonb_build_object('id', j.id, 'job_type', j.job_type, 'payload', j.payload,
                              'requested_by', j.requested_by, 'lane', j.lane),
    'spec', jsonb_build_object('prompt_template', t.prompt_template, 'tool_set', t.tool_set,
                               'output_target', t.output_target, 'interactive', t.interactive));
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_claim(text, text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_ai_claim(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_ai_complete(p_job_id uuid, p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '10s'
AS $fn$
BEGIN
  UPDATE public.ai_jobs SET status='done', result=p_result, completed_at=now()
   WHERE id = p_job_id AND status IN ('claimed','running');
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'job not claimable'); END IF;
  RETURN jsonb_build_object('ok', true);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_complete(uuid, jsonb) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_ai_complete(uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_ai_fail(p_job_id uuid, p_error text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '10s'
AS $fn$
BEGIN
  UPDATE public.ai_jobs SET status='error', error=left(p_error, 2000), attempts=attempts+1, completed_at=now()
   WHERE id = p_job_id AND status IN ('claimed','running');
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'job not claimable'); END IF;
  RETURN jsonb_build_object('ok', true);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_fail(uuid, text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_ai_fail(uuid, text) TO service_role;

-- ── 7. SEED: the real chat type + a trivial proof-of-pipe type ──────────────
INSERT INTO public.ai_job_types (job_type, title, description, prompt_template, tool_set, output_target, interactive, lane, allow_rule, schedulable)
VALUES
  ('ai_query.chat', 'AI Assistant chat', 'Natural-language data questions from the AI Assistant.', NULL, 'all', 'inbox', true, 'max', 'seat_owner', false),
  ('demo.ping', 'Pipe health check', 'Trivial job to prove enqueue→claim→complete end to end.', 'Reply with a one-line OK health check.', 'none', 'job.result', false, 'max', 'seat_owner', false)
ON CONFLICT (job_type) DO NOTHING;

-- Chat is deferred until the cutover: disable so it can't be enqueued/claimed
-- by the not-yet-chat-aware generic drain (reversible: SET enabled=true).
UPDATE public.ai_job_types SET enabled=false, updated_at=now() WHERE job_type='ai_query.chat';
