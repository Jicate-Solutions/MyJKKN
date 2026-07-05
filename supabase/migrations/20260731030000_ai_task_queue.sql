-- ============================================================================
-- AI TASK QUEUE — user-click producer buffer for the async Batch 50% lane
-- Created: 2026-07-05  (spec: specs/ai-max-button-async-lane-2026-07-04.md, P1)
-- ============================================================================
-- The "AI Max button" enqueues a task here (lightweight, no Anthropic call). A
-- */15 submit-sweep groups queued rows per feature_key into ONE Anthropic batch
-- (via lib/services/platform/ai-clients/batch.ts submitBatch → 50% rate); a */15
-- collect-sweep drains finished batches, records the product artefact, and writes
-- the result back here for the button to reflect.
--
-- ANONYMITY / SECURITY:
--   • Raw model inputs (e.g. anonymized free-text comments) are placed ONLY in the
--     Anthropic request `params` at submit time — batch.ts does NOT persist params,
--     so they never land in this DB. `context` here holds NUMBERS + SCOPE only.
--   • RLS: a resident/faculty may read ONLY their own rows (requested_by = auth.uid()).
--     ALL writes go through the SECURITY DEFINER RPCs below (which bypass RLS). The
--     service-role sweeps use the service_role-granted RPCs; the user path uses
--     fn_ai_task_enqueue (authenticated), which derives requested_by from auth.uid()
--     so a caller cannot enqueue as someone else.
--   • Every RPC REVOKEs anon + PUBLIC (Supabase's default grants anon EXECUTE on
--     every new function — CLAUDE.md standing rule / CI anon-lock check).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_task_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key   text NOT NULL,
  entity_id     text NOT NULL,
  requested_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_id uuid,
  context       jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key    text NOT NULL,
  status        text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','submitting','submitted','done','failed','skipped')),
  result        jsonb,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- In-flight guard: at most ONE outstanding task per (feature_key, dedupe_key).
-- A re-click while a task is queued/submitting/submitted is a no-op that returns
-- the existing task (see fn_ai_task_enqueue). dedupe_key MUST embed the tenant
-- (and, for per-user tasks, the requester) — enforced by the caller.
CREATE UNIQUE INDEX IF NOT EXISTS ai_task_queue_inflight_uidx
  ON public.ai_task_queue (feature_key, dedupe_key)
  WHERE status IN ('queued','submitting','submitted');

CREATE INDEX IF NOT EXISTS ai_task_queue_owner_idx
  ON public.ai_task_queue (requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_task_queue_claim_idx
  ON public.ai_task_queue (feature_key, created_at)
  WHERE status = 'queued';

ALTER TABLE public.ai_task_queue ENABLE ROW LEVEL SECURITY;

-- Own-rows read only. No INSERT/UPDATE/DELETE policies → writes only via the
-- SECURITY DEFINER RPCs below. Service-role bypasses RLS for the sweeps.
DROP POLICY IF EXISTS ai_task_queue_select_own ON public.ai_task_queue;
CREATE POLICY ai_task_queue_select_own ON public.ai_task_queue
  FOR SELECT USING (requested_by = auth.uid());

-- ── RPC: enqueue (user-called, via the session client so auth.uid() = caller) ──
CREATE OR REPLACE FUNCTION public.fn_ai_task_enqueue(
  p_feature_key   text,
  p_entity_id     text,
  p_institution_id uuid,
  p_context       jsonb,
  p_dedupe_key    text
) RETURNS TABLE(task_id uuid, already boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.ai_task_queue
    (feature_key, entity_id, requested_by, institution_id, context, dedupe_key, status)
  VALUES
    (p_feature_key, p_entity_id, v_uid, p_institution_id,
     COALESCE(p_context, '{}'::jsonb), p_dedupe_key, 'queued')
  ON CONFLICT (feature_key, dedupe_key)
    WHERE status IN ('queued','submitting','submitted')
    DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, false;
  ELSE
    SELECT id INTO v_id FROM public.ai_task_queue
      WHERE feature_key = p_feature_key AND dedupe_key = p_dedupe_key
        AND status IN ('queued','submitting','submitted')
      ORDER BY created_at DESC LIMIT 1;
    RETURN QUERY SELECT v_id, true;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_task_enqueue(text,text,uuid,jsonb,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_task_enqueue(text,text,uuid,jsonb,text) TO authenticated;

-- ── RPC: claim queued rows for the submit-sweep (service-role only) ────────────
-- Atomically flips 'queued' → 'submitting' with SKIP LOCKED so two overlapping
-- sweeps never grab the same rows. On submit success → fn_ai_task_mark_submitted;
-- on failure → fn_ai_task_requeue (back to 'queued' for the next sweep).
CREATE OR REPLACE FUNCTION public.fn_ai_task_claim_queued(
  p_feature_key text,
  p_max int DEFAULT 50
) RETURNS SETOF public.ai_task_queue
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.ai_task_queue q
     SET status = 'submitting', updated_at = now()
   WHERE q.id IN (
     SELECT id FROM public.ai_task_queue
      WHERE feature_key = p_feature_key AND status = 'queued'
      ORDER BY created_at
      LIMIT GREATEST(p_max, 0)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING q.*;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_task_claim_queued(text,int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_task_claim_queued(text,int) TO service_role;

-- ── RPC: mark a claimed batch actually submitted (service-role only) ───────────
CREATE OR REPLACE FUNCTION public.fn_ai_task_mark_submitted(p_task_ids uuid[])
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.ai_task_queue
     SET status = 'submitted', updated_at = now()
   WHERE id = ANY(p_task_ids) AND status = 'submitting';
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_task_mark_submitted(uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_task_mark_submitted(uuid[]) TO service_role;

-- ── RPC: requeue claimed-but-not-submitted rows (service-role only) ────────────
CREATE OR REPLACE FUNCTION public.fn_ai_task_requeue(p_task_ids uuid[])
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.ai_task_queue
     SET status = 'queued', updated_at = now()
   WHERE id = ANY(p_task_ids) AND status = 'submitting';
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_task_requeue(uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_task_requeue(uuid[]) TO service_role;

-- ── RPC: mark done with the result (service-role only; collect-sweep + small-n) ─
CREATE OR REPLACE FUNCTION public.fn_ai_task_mark_done(p_task_id uuid, p_result jsonb)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.ai_task_queue
     SET status = 'done', result = p_result, error = NULL, updated_at = now()
   WHERE id = p_task_id;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_task_mark_done(uuid,jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_task_mark_done(uuid,jsonb) TO service_role;

-- ── RPC: mark failed (service-role only) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_task_mark_failed(p_task_id uuid, p_error text)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.ai_task_queue
     SET status = 'failed', error = p_error, updated_at = now()
   WHERE id = p_task_id;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_task_mark_failed(uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_task_mark_failed(uuid,text) TO service_role;
