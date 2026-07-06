-- =====================================================================
-- ai_batch_jobs hardening (round 2) — reserve-then-create + feature-scoped
-- in-flight uniqueness + stuck-job attempts cap.
-- Migration: 2026-07-04 (delta on 20260704093000_ai_batch_jobs.sql)
-- =====================================================================
-- Closes deep-review findings on the async batch lane:
--  • create-before-guard billing window: the Anthropic batch was created BEFORE
--    the dedupe/persist guard committed. Invert it — RESERVE the dedupe_key rows
--    ('pending' job) first, create the batch only for the reserved subset, then
--    ACTIVATE. A concurrent duplicate is now rejected before any batch is billed.
--  • whole-batch abort on one conflict: reserve inserts items ON CONFLICT DO
--    NOTHING, so one in-flight course skips just that item, not the whole batch.
--  • stuck 'collecting' job: a persistently-unrecordable ended job used to
--    re-drain forever (fn_ai_batch_inflight_keys blocks on job status, freezing
--    the course). collect_attempts caps it → terminal 'failed'.
--  • cross-feature key collision: the in-flight unique index is now
--    (feature_key, dedupe_key), matching fn_ai_batch_inflight_keys' feature scope.
-- =====================================================================

-- ── jobs: reserved 'pending' state + attempts cap ───────────────────────────────
ALTER TABLE public.ai_batch_jobs ALTER COLUMN anthropic_batch_id DROP NOT NULL;
ALTER TABLE public.ai_batch_jobs DROP CONSTRAINT IF EXISTS ai_batch_jobs_status_check;
ALTER TABLE public.ai_batch_jobs
  ADD CONSTRAINT ai_batch_jobs_status_check
  CHECK (status IN ('pending','submitted','collecting','collected','expired','failed'));
ALTER TABLE public.ai_batch_jobs
  ADD COLUMN IF NOT EXISTS collect_attempts integer NOT NULL DEFAULT 0;

-- ── items: denormalize feature_key so in-flight uniqueness is feature-scoped ─────
ALTER TABLE public.ai_batch_job_items ADD COLUMN IF NOT EXISTS feature_key text;
UPDATE public.ai_batch_job_items i
   SET feature_key = j.feature_key
  FROM public.ai_batch_jobs j
 WHERE i.job_id = j.id AND i.feature_key IS NULL;

DROP INDEX IF EXISTS public.uq_ai_batch_job_items_inflight_dedupe;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_batch_job_items_inflight_dedupe
  ON public.ai_batch_job_items(feature_key, dedupe_key)
  WHERE result_status IS NULL AND dedupe_key IS NOT NULL;

-- ── RPC: reserve — persist a 'pending' job + items, claiming dedupe keys ─────────
-- Per-item ON CONFLICT DO NOTHING: an item whose (feature_key, dedupe_key) is
-- already in-flight is skipped (not inserted); the rest reserve normally. Returns
-- the job id + the custom_ids actually reserved so the caller submits only those.
CREATE OR REPLACE FUNCTION public.fn_ai_batch_reserve(
  p_feature_key text,
  p_phase       text,
  p_model_id    text,
  p_items       jsonb
)
RETURNS TABLE(job_id uuid, reserved_custom_ids text[])
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job_id   uuid;
  v_reserved text[];
BEGIN
  INSERT INTO public.ai_batch_jobs (feature_key, phase, model_id, status, request_count)
  VALUES (p_feature_key, p_phase, p_model_id, 'pending', 0)
  RETURNING id INTO v_job_id;

  WITH src AS (
    -- Dedupe dedupe_key WITHIN this request first: two items sharing a dedupe_key
    -- in the same p_items would otherwise raise unique_violation and abort the whole
    -- reserve (the exact whole-batch failure this PR closes). Keep the first of each
    -- non-null key; keep ALL null-key items (they never conflict).
    SELECT it->>'custom_id'                       AS custom_id,
           COALESCE(it->'context', '{}'::jsonb)   AS context,
           NULLIF(it->>'dedupe_key', '')          AS dedupe_key,
           row_number() OVER (PARTITION BY NULLIF(it->>'dedupe_key', '') ORDER BY ord) AS rn
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(it, ord)
  ),
  ins AS (
    INSERT INTO public.ai_batch_job_items (job_id, feature_key, custom_id, context, dedupe_key)
    SELECT v_job_id, p_feature_key, custom_id, context, dedupe_key
    FROM src
    WHERE dedupe_key IS NULL OR rn = 1
    ON CONFLICT (feature_key, dedupe_key) WHERE result_status IS NULL AND dedupe_key IS NOT NULL
    DO NOTHING
    RETURNING custom_id
  )
  SELECT array_agg(custom_id) INTO v_reserved FROM ins;

  UPDATE public.ai_batch_jobs
     SET request_count = COALESCE(array_length(v_reserved, 1), 0)
   WHERE id = v_job_id;

  RETURN QUERY SELECT v_job_id, COALESCE(v_reserved, ARRAY[]::text[]);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_batch_reserve(text, text, text, jsonb) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_batch_reserve(text, text, text, jsonb) TO service_role;

-- ── RPC: activate — attach the real batch id, flip 'pending' → 'submitted' ───────
-- RETURNS true only if a 'pending' row was actually updated. If the reservation
-- was already swept/aborted (0 rows), the caller MUST treat it as failure and
-- cancel the already-created batch — otherwise a billed batch is left untracked.
DROP FUNCTION IF EXISTS public.fn_ai_batch_activate(uuid, text, timestamptz, integer);
CREATE OR REPLACE FUNCTION public.fn_ai_batch_activate(
  p_job_id             uuid,
  p_anthropic_batch_id text,
  p_expires_at         timestamptz,
  p_request_count      integer
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_updated integer;
BEGIN
  UPDATE public.ai_batch_jobs
     SET anthropic_batch_id = p_anthropic_batch_id,
         status             = 'submitted',
         expires_at         = COALESCE(p_expires_at, now() + interval '24 hours'),
         submitted_at       = now(),
         request_count      = p_request_count,
         updated_at         = now()
   WHERE id = p_job_id AND status = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_batch_activate(uuid, text, timestamptz, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_batch_activate(uuid, text, timestamptz, integer) TO service_role;

-- ── RPC: abort a reservation (create failed / nothing reserved) ──────────────────
-- Deletes the 'pending' job; CASCADE removes its items, freeing their dedupe keys.
CREATE OR REPLACE FUNCTION public.fn_ai_batch_abort_reservation(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.ai_batch_jobs WHERE id = p_job_id AND status = 'pending';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_batch_abort_reservation(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_batch_abort_reservation(uuid) TO service_role;

-- ── RPC: claim (updated) — sweep stale reservations + increment attempts ─────────
CREATE OR REPLACE FUNCTION public.fn_ai_batch_claim_for_collection(
  p_feature_key   text,
  p_lease_seconds integer DEFAULT 600,
  p_max_jobs      integer DEFAULT 50
)
RETURNS SETOF public.ai_batch_jobs
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- A 'pending' reservation older than 5 min means submit crashed between reserve
  -- and activate; delete it (CASCADE frees its dedupe keys so the course unblocks).
  DELETE FROM public.ai_batch_jobs
   WHERE feature_key = p_feature_key AND status = 'pending'
     AND created_at < now() - interval '5 minutes';

  -- FREEZE BACKSTOP (path-independent): any submitted/collecting job past its
  -- expiry+2h can never be productively collected — Anthropic ends every batch by
  -- 24h — regardless of WHY collection kept failing (permanent retrieve 404/5xx,
  -- results timeout, record failure). Mark it terminal AND free its item dedupe
  -- keys so no failure path can freeze the course forever. This single sweep is
  -- the guarantee; the collect_attempts cap is only a faster bound for the common
  -- record-failure case.
  UPDATE public.ai_batch_job_items i
     SET result_status = 'expired'
    FROM public.ai_batch_jobs j
   WHERE i.job_id = j.id
     AND j.feature_key = p_feature_key
     AND j.status IN ('submitted','collecting')
     AND COALESCE(j.expires_at, j.submitted_at + interval '24 hours') + interval '2 hours' < now()
     AND i.result_status IS NULL;
  UPDATE public.ai_batch_jobs
     SET status = 'expired', updated_at = now()
   WHERE feature_key = p_feature_key
     AND status IN ('submitted','collecting')
     AND COALESCE(expires_at, submitted_at + interval '24 hours') + interval '2 hours' < now();

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
     SET status = 'collecting', collecting_since = now(),
         collect_attempts = s.collect_attempts + 1, updated_at = now()
    FROM due
   WHERE s.id = due.id
  RETURNING s.*;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_batch_claim_for_collection(text, integer, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_batch_claim_for_collection(text, integer, integer) TO service_role;

-- ── RPC: mark_expired (updated) — free unrecorded item keys on terminal ─────────
-- A terminal ('failed'/'expired') job must release its items' dedupe keys, or the
-- partial unique index (result_status IS NULL) keeps blocking every future submit
-- for that course — a permanent freeze. Setting unrecorded items' result_status
-- takes them out of the in-flight index so the course unblocks.
CREATE OR REPLACE FUNCTION public.fn_ai_batch_mark_expired(p_job_id uuid, p_status text DEFAULT 'expired')
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('expired','failed') THEN
    RAISE EXCEPTION 'fn_ai_batch_mark_expired: p_status must be expired|failed';
  END IF;
  UPDATE public.ai_batch_job_items
     SET result_status = p_status
   WHERE job_id = p_job_id AND result_status IS NULL;
  UPDATE public.ai_batch_jobs
     SET status = p_status, updated_at = now()
   WHERE id = p_job_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_batch_mark_expired(uuid, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_batch_mark_expired(uuid, text) TO service_role;

-- ── RPC: release (updated) — decrement collect_attempts on a non-productive claim
-- A not-yet-ended job (or a collect error) is released back to 'submitted'; that
-- claim wasn't a real record-attempt, so undo its increment. Net effect:
-- collect_attempts counts only ENDED claims, so MAX_COLLECT_ATTEMPTS caps genuine
-- record-failure re-drains, not the polls a slow batch takes to finish.
CREATE OR REPLACE FUNCTION public.fn_ai_batch_release_job(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_batch_jobs
     SET status = 'submitted',
         collecting_since = NULL,
         collect_attempts = GREATEST(collect_attempts - 1, 0),
         updated_at = now()
   WHERE id = p_job_id AND status = 'collecting';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_batch_release_job(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_batch_release_job(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
