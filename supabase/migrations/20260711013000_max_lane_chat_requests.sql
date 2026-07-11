-- =====================================================================
-- Max-lane CHAT queue — "Ask on Max" for AI Query (seat owner ONLY)
-- Migration: 2026-07-11
-- =====================================================================
-- Sibling of max_lane_requests (routine runs): the seat owner's AI Query
-- questions queue here, the runner box (Windows poller, ~2 min cadence)
-- claims them, answers via headless `claude -p` on the Claude Max
-- subscription, and reports back; /api/ai-query long-polls the row and
-- falls back to the cached API path on offline/timeout/error.
--
-- HARD BOUNDARY (Director-accepted, 2026-07-04 + 2026-07-11): the allowlist
-- is ai_model_config.config_json->'max_lane_user_ids' on the
-- 'ai_query.natural_language' row — individual auth.users ids, expected to
-- contain ONLY the Max seat owner. It is NEVER a role-wide grant: a personal
-- Claude subscription must not serve other users' product traffic (Anthropic
-- consumer terms; detection risks the seat that powers all build work).
--
-- RLS-enabled with NO policies: anon & authenticated get deny-all on direct
-- table access; every read/write flows through the SECURITY DEFINER RPCs.
-- =====================================================================

-- ── TABLE ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.max_lane_chat_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by  uuid NOT NULL REFERENCES auth.users(id),
  conversation_id uuid,                                -- UI conversation echo only
  message       text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'claimed', 'done', 'error')),
  answer        text,
  result_note   text,
  requested_at  timestamptz DEFAULT now(),
  claimed_at    timestamptz,
  completed_at  timestamptz
);

ALTER TABLE public.max_lane_chat_requests ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: anon & authenticated get deny-all on direct access.
REVOKE ALL ON public.max_lane_chat_requests FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_max_lane_chat_requests_status
  ON public.max_lane_chat_requests (status);
CREATE INDEX IF NOT EXISTS idx_max_lane_chat_requests_requester
  ON public.max_lane_chat_requests (requested_by, requested_at DESC);

COMMENT ON TABLE public.max_lane_chat_requests IS
  'Queue of seat-owner AI Query questions for the Max lane. Written via '
  'fn_max_chat_request (allowlist-gated); claimed+answered by the runner box '
  '(service_role). RLS-enabled with no policies (RPC-only access).';

-- ── RPC 1: allowlisted user queues a question (authenticated / user session) ───
CREATE OR REPLACE FUNCTION public.fn_max_chat_request(
  p_message         text,
  p_conversation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_message   text := btrim(COALESCE(p_message, ''));
  v_uid       uuid := auth.uid();
  v_heartbeat timestamptz;
  v_id        uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Allowlist: individual user ids on the ai_query config row. The jsonb `?`
  -- operator tests membership of the uid string in the array.
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_model_config
     WHERE feature_key = 'ai_query.natural_language'
       AND is_active
       AND COALESCE(config_json->'max_lane_user_ids', '[]'::jsonb) ? v_uid::text
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not allowed');
  END IF;

  IF length(v_message) < 1 OR length(v_message) > 4000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid message');
  END IF;

  -- Runner liveness: the poller stamps maxlane:poller-heartbeat every ~2 min.
  -- A stale/missing pulse means nothing would claim the row — refuse WITHOUT
  -- inserting so the route can fall back to the API immediately, not after
  -- its 150s unclaimed deadline.
  SELECT last_fired_at INTO v_heartbeat
    FROM public.ai_routine_schedules
   WHERE routine_id = 'maxlane:poller-heartbeat';
  IF v_heartbeat IS NULL OR v_heartbeat < now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'runner offline');
  END IF;

  -- Up to 3 live questions per requester (Director edge-case decision
  -- 2026-07-11: a second question queues behind the first on Max rather than
  -- being bounced; the cap stops a runaway tab from flooding the seat).
  -- ATOMIC: the count gate lives inside the INSERT statement itself — a
  -- count-then-insert pair could let two concurrent submits both pass
  -- (deep-review finding #4). Serialized against same-user racers by a
  -- transaction-scoped advisory lock on the requester id.
  PERFORM pg_advisory_xact_lock(hashtext('max_lane_chat:' || v_uid::text));

  INSERT INTO public.max_lane_chat_requests (requested_by, conversation_id, message)
  SELECT v_uid, p_conversation_id, v_message
   WHERE (
     SELECT count(*) FROM public.max_lane_chat_requests
      WHERE requested_by = v_uid
        AND status IN ('pending', 'claimed')
   ) < 3
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'queue full');
  END IF;

  RETURN jsonb_build_object('ok', true, 'request_id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_max_chat_request(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_max_chat_request(text, uuid) TO authenticated;

-- ── RPC 2: requester polls their own request (authenticated / user session) ────
CREATE OR REPLACE FUNCTION public.fn_max_chat_status(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.max_lane_chat_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_row
    FROM public.max_lane_chat_requests
   WHERE id = p_id
     AND requested_by = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  RETURN jsonb_build_object(
    'status', v_row.status,
    'answer', v_row.answer,
    'result_note', v_row.result_note
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_max_chat_status(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_max_chat_status(uuid) TO authenticated;

-- ── RPC 3: requester abandons a request (authenticated / user session) ─────────
-- The route calls this when it stops waiting (falls back to the API) so a
-- late-claiming runner doesn't burn the seat on an already-answered question.
CREATE OR REPLACE FUNCTION public.fn_max_chat_cancel(p_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.max_lane_chat_requests
     SET status       = 'error',
         completed_at = now(),
         result_note  = 'abandoned by requester (route fell back to API)'
   WHERE id = p_id
     AND requested_by = auth.uid()
     AND status IN ('pending', 'claimed');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_max_chat_cancel(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_max_chat_cancel(uuid) TO authenticated;

-- ── RPC 4: runner box claims pending questions (service_role only, atomic) ─────
CREATE OR REPLACE FUNCTION public.fn_max_chat_claim_pending()
RETURNS SETOF public.max_lane_chat_requests
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'fn_max_chat_claim_pending: service role only';
  END IF;

  -- Chat is time-sensitive: the route stops waiting after ~4 min, so anything
  -- older than 10 min (claimed OR still pending) is dead — expire it rather
  -- than answering into the void.
  UPDATE public.max_lane_chat_requests
     SET status       = 'error',
         completed_at = now(),
         result_note  = CASE WHEN status = 'claimed'
                             THEN 'claim expired (runner never completed)'
                             ELSE 'expired unclaimed (runner did not pick up in time)'
                        END
   WHERE status IN ('pending', 'claimed')
     AND requested_at < now() - interval '10 minutes';

  RETURN QUERY
  UPDATE public.max_lane_chat_requests
     SET status = 'claimed', claimed_at = now()
   WHERE id IN (
     SELECT id FROM public.max_lane_chat_requests
      WHERE status = 'pending'
      ORDER BY requested_at
      LIMIT 3
      FOR UPDATE SKIP LOCKED
   )
  RETURNING *;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_max_chat_claim_pending() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_max_chat_claim_pending() TO service_role;

-- ── RPC 5: runner box reports an answer (service_role only) ────────────────────
-- Guards on status='claimed' so a requester cancel (RPC 3) can't be overwritten
-- by a late runner completion.
CREATE OR REPLACE FUNCTION public.fn_max_chat_complete(
  p_id     uuid,
  p_status text,
  p_answer text,
  p_note   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'fn_max_chat_complete: service role only';
  END IF;
  IF p_status NOT IN ('done', 'error') THEN
    RAISE EXCEPTION 'p_status must be done or error';
  END IF;

  UPDATE public.max_lane_chat_requests
     SET status       = p_status,
         completed_at = now(),
         answer       = left(p_answer, 20000),
         result_note  = left(p_note, 500)
   WHERE id = p_id
     AND status = 'claimed';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_max_chat_complete(uuid, text, text, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_max_chat_complete(uuid, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
