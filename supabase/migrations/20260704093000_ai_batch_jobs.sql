-- =====================================================================
-- AI Batch Jobs — async Anthropic Message Batches (submit-now / collect-later)
-- Migration: 2026-07-04
-- =====================================================================
-- Backs the async 50%-rate batch lane (lib/services/platform/ai-clients/batch.ts).
-- A producer cron SUBMITS a Message Batch in one run (persisting a job + its
-- items here) and returns immediately; a later collect run drains ENDED batches,
-- records each request in ai_model_usage at the 50% batch rate, and hands the
-- results back to the producer for domain recording.
--
-- Two service-role-only tables (patterned on ai_routine_schedules): RLS enabled
-- with NO policies (anon & authenticated deny-all); all access via the
-- SECURITY DEFINER RPCs below (service_role for machine ops; a super_admin-gated
-- read for /admin observability).
--
-- Correctness properties this schema guarantees:
--   • record_submission inserts the job + all items in ONE transaction (a job
--     never exists without its items).
--   • claim_for_collection marks 'collecting' in the same UPDATE that selects
--     (idempotent; overlapping collector ticks can't double-process); a lease
--     reclaims jobs whose collector crashed.
--   • settle_item is idempotent (no-op once result_status is set) → EXACTLY one
--     ai_model_usage row per request across crash/retry.
--   • the dedupe_key on items (under a 'submitted'/'collecting' job) is the
--     in-flight guard: a candidate whose batch is still outstanding is never
--     re-submitted → no re-bill, no chain-double-submit.
-- =====================================================================

-- ── TABLES ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_batch_jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key        text NOT NULL,                    -- ai_model_config feature key (ledger)
  phase              text NOT NULL,                    -- producer-defined, e.g. 'judge' | 'generate'
  anthropic_batch_id text NOT NULL UNIQUE,             -- msgbatch_...  (unique = dedupe on retry)
  model_id           text NOT NULL,
  status             text NOT NULL DEFAULT 'submitted'
                       CHECK (status IN ('submitted','collecting','collected','expired','failed')),
  request_count      integer NOT NULL DEFAULT 0,
  submitted_at       timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz,                       -- from MessageBatch.expires_at (~+24h)
  collecting_since   timestamptz,                       -- lease stamp for crash recovery
  collected_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_batch_jobs_status_feature
  ON public.ai_batch_jobs(status, feature_key);

CREATE TABLE IF NOT EXISTS public.ai_batch_job_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid NOT NULL REFERENCES public.ai_batch_jobs(id) ON DELETE CASCADE,
  custom_id     text NOT NULL,                          -- matches MessageBatch result.custom_id
  context       jsonb NOT NULL DEFAULT '{}'::jsonb,     -- caller data needed to record the result later
  dedupe_key    text,                                   -- in-flight guard key
  result_status text,                                   -- NULL until settled; succeeded|errored|canceled|expired
  UNIQUE (job_id, custom_id)
);
CREATE INDEX IF NOT EXISTS idx_ai_batch_job_items_dedupe ON public.ai_batch_job_items(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_ai_batch_job_items_job    ON public.ai_batch_job_items(job_id);
-- Atomic in-flight guard (backs partitionInFlight, which is only advisory): at
-- most ONE unsettled item per dedupe_key. result_status IS NULL == outstanding
-- (submitted/collecting); a settled item (collected job, or a settled-then-record-
-- failed item) has result_status set and does NOT block a legitimate next-window
-- resubmit. Two concurrent submit runs for the same course conflict here → the
-- second's fn_ai_batch_record_submission rolls back → submitBatch cancels its
-- (not-yet-billed) batch. Closes the check-then-act re-bill window.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_batch_job_items_inflight_dedupe
  ON public.ai_batch_job_items(dedupe_key)
  WHERE result_status IS NULL AND dedupe_key IS NOT NULL;

ALTER TABLE public.ai_batch_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_batch_job_items ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: anon & authenticated deny-all; service_role bypasses RLS.
REVOKE ALL ON public.ai_batch_jobs      FROM anon, authenticated;
REVOKE ALL ON public.ai_batch_job_items FROM anon, authenticated;
-- Explicit (Supabase grants service_role by default, but be self-documenting):
-- the collector reads item rows directly via the service-role client.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_batch_jobs      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_batch_job_items TO service_role;

COMMENT ON TABLE public.ai_batch_jobs IS
  'Async Anthropic Message Batch jobs (submit-now/collect-later 50% lane). Service-role only '
  '(RLS-enabled, no policies); accessed via fn_ai_batch_* RPCs. Owned by producer crons + the collector.';
COMMENT ON TABLE public.ai_batch_job_items IS
  'One row per request in an ai_batch_jobs batch. context = caller data to record the result; '
  'dedupe_key powers the in-flight guard; result_status NULL until settled (idempotency handle).';

-- ── RPC 1: record a submission (job + items) atomically ─────────────────────────
-- p_items: jsonb array of { "custom_id": text, "context": jsonb, "dedupe_key": text|null }
CREATE OR REPLACE FUNCTION public.fn_ai_batch_record_submission(
  p_feature_key        text,
  p_phase              text,
  p_anthropic_batch_id text,
  p_model_id           text,
  p_expires_at         timestamptz,
  p_items              jsonb
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
  v_count  integer := COALESCE(jsonb_array_length(p_items), 0);
BEGIN
  INSERT INTO public.ai_batch_jobs
    (feature_key, phase, anthropic_batch_id, model_id, status, request_count, expires_at)
  VALUES
    (p_feature_key, p_phase, p_anthropic_batch_id, p_model_id, 'submitted', v_count,
     -- Fallback so a null expiry can't leave a stuck batch's dedupe_key blocking
     -- the course forever (the expiry sweep needs a concrete timestamp).
     COALESCE(p_expires_at, now() + interval '24 hours'))
  RETURNING id INTO v_job_id;

  INSERT INTO public.ai_batch_job_items (job_id, custom_id, context, dedupe_key)
  SELECT v_job_id,
         it->>'custom_id',
         COALESCE(it->'context', '{}'::jsonb),
         NULLIF(it->>'dedupe_key', '')
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS it;

  RETURN v_job_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_batch_record_submission(text, text, text, text, timestamptz, jsonb) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_batch_record_submission(text, text, text, text, timestamptz, jsonb) TO service_role;

-- ── RPC 2: claim ended-able jobs for collection (atomic + lease) ─────────────────
-- Marks matched jobs 'collecting' in the SAME statement that selects them, so two
-- overlapping collector ticks can't grab the same job. A job stuck in 'collecting'
-- longer than the lease (crashed collector) is reclaimed.
CREATE OR REPLACE FUNCTION public.fn_ai_batch_claim_for_collection(
  p_feature_key   text,
  p_lease_seconds integer DEFAULT 600,
  p_max_jobs      integer DEFAULT 50
)
RETURNS SETOF public.ai_batch_jobs
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT j.id
      FROM public.ai_batch_jobs j
     WHERE j.feature_key = p_feature_key
       AND (
         j.status = 'submitted'
         OR (j.status = 'collecting'
             AND j.collecting_since < now() - make_interval(secs => p_lease_seconds))
       )
     ORDER BY j.submitted_at
     LIMIT GREATEST(p_max_jobs, 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.ai_batch_jobs s
     SET status = 'collecting', collecting_since = now(), updated_at = now()
    FROM due
   WHERE s.id = due.id
  RETURNING s.*;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_batch_claim_for_collection(text, integer, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_batch_claim_for_collection(text, integer, integer) TO service_role;

-- ── RPC 3: settle one item (idempotent ledger write + mark) ──────────────────────
-- Writes EXACTLY one ai_model_usage row the first time an item is settled and
-- stamps result_status. A second call for the same item is a no-op (returns false)
-- so a crash-and-retry never double-bills.
CREATE OR REPLACE FUNCTION public.fn_ai_batch_settle_item(
  p_item_id       uuid,
  p_result_status text,
  p_feature_key   text,
  p_provider      text,
  p_model_id      text,
  p_input_tokens  integer,
  p_output_tokens integer,
  p_cost_inr      numeric,
  p_duration_ms   integer,
  p_success       boolean,
  p_error         text
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_existing text;
BEGIN
  SELECT result_status INTO v_existing
    FROM public.ai_batch_job_items
   WHERE id = p_item_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ai_batch_settle_item: item % not found', p_item_id;
  END IF;
  IF v_existing IS NOT NULL THEN
    RETURN false;  -- already settled → do not re-bill
  END IF;

  INSERT INTO public.ai_model_usage
    (feature_key, provider, model_id, input_tokens, output_tokens,
     cost_inr, duration_ms, success, error_message, invoked_at)
  VALUES
    (p_feature_key, p_provider, p_model_id, p_input_tokens, p_output_tokens,
     p_cost_inr, p_duration_ms, p_success, left(p_error, 500), now());

  UPDATE public.ai_batch_job_items
     SET result_status = p_result_status
   WHERE id = p_item_id;

  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_batch_settle_item(uuid, text, text, text, text, integer, integer, numeric, integer, boolean, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_batch_settle_item(uuid, text, text, text, text, integer, integer, numeric, integer, boolean, text) TO service_role;

-- ── RPC 4: mark a job collected (terminal) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_batch_mark_collected(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_batch_jobs
     SET status = 'collected', collected_at = now(), updated_at = now()
   WHERE id = p_job_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_batch_mark_collected(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_batch_mark_collected(uuid) TO service_role;

-- ── RPC 5: mark a job expired/failed (defensive sweep for stuck-canceling) ───────
CREATE OR REPLACE FUNCTION public.fn_ai_batch_mark_expired(p_job_id uuid, p_status text DEFAULT 'expired')
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('expired','failed') THEN
    RAISE EXCEPTION 'fn_ai_batch_mark_expired: p_status must be expired|failed';
  END IF;
  UPDATE public.ai_batch_jobs
     SET status = p_status, updated_at = now()
   WHERE id = p_job_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_batch_mark_expired(uuid, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_batch_mark_expired(uuid, text) TO service_role;

-- ── RPC 6: release a not-yet-ended job back to 'submitted' ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_batch_release_job(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_batch_jobs
     SET status = 'submitted', collecting_since = NULL, updated_at = now()
   WHERE id = p_job_id AND status = 'collecting';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_batch_release_job(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_batch_release_job(uuid) TO service_role;

-- ── RPC 7: in-flight guard — which dedupe_keys are already outstanding? ──────────
-- Returns the subset of p_dedupe_keys attached to an item under a 'submitted' or
-- 'collecting' job for this feature. Callers skip those candidates (no re-submit).
CREATE OR REPLACE FUNCTION public.fn_ai_batch_inflight_keys(
  p_feature_key text,
  p_dedupe_keys text[]
)
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT i.dedupe_key
    FROM public.ai_batch_job_items i
    JOIN public.ai_batch_jobs j ON j.id = i.job_id
   WHERE j.feature_key = p_feature_key
     AND j.status IN ('submitted','collecting')
     AND i.dedupe_key = ANY (p_dedupe_keys);
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_batch_inflight_keys(text, text[]) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_batch_inflight_keys(text, text[]) TO service_role;

-- ── RPC 8: observability summary (super_admin read) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_batch_jobs_summary()
RETURNS TABLE(feature_key text, status text, jobs bigint, items bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Fail CLOSED: a NULL scalar (no profiles row / NULL auth.uid()) must deny,
  -- so COALESCE to false before the NOT (matches fn_scf_leadership_concerns).
  IF NOT COALESCE(
        (SELECT (p.role = 'super_admin' OR p.is_super_admin = true)
           FROM public.profiles p WHERE p.id = auth.uid()),
        false) THEN
    RAISE EXCEPTION 'fn_ai_batch_jobs_summary: not authorized';
  END IF;
  RETURN QUERY
  SELECT j.feature_key, j.status, count(DISTINCT j.id), count(i.id)
    FROM public.ai_batch_jobs j
    LEFT JOIN public.ai_batch_job_items i ON i.job_id = j.id
   GROUP BY j.feature_key, j.status
   ORDER BY j.feature_key, j.status;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_batch_jobs_summary() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_batch_jobs_summary() TO authenticated;

NOTIFY pgrst, 'reload schema';
