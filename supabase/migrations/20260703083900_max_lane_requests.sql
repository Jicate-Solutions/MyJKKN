-- =====================================================================
-- Max Lane request queue — "Run on Max" for AI routines
-- Migration: 2026-07-03
-- =====================================================================
-- The Director's Mac runs 3 AI routines on the Claude Max subscription (the
-- "Max lane") via launchd jobs; the Vercel API cron is the FALLBACK. Vercel
-- cannot reach the Mac, so a super_admin who wants an immediate Max-lane run
-- inserts a request row here; a Mac-side poller CLAIMS it (fn_max_lane_claim_pending),
-- runs the local runner, and reports back (fn_max_lane_complete).
--
-- Director standing rule (config/queue = a row + super-admin UI + reader fn):
-- the /admin/ai-routines UI writes via fn_max_lane_request_run and reads via
-- fn_max_lane_requests_list; the Mac poller (service-role) claims via
-- fn_max_lane_claim_pending and completes via fn_max_lane_complete.
--
-- RLS-enabled with NO policies: anon & authenticated get deny-all on direct
-- table access; every read/write flows through the SECURITY DEFINER RPCs below.
-- =====================================================================

-- ── TABLE ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.max_lane_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id    text NOT NULL,                       -- matches lib/ai-routines registry id
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'claimed', 'done', 'error')),
  requested_by  uuid REFERENCES auth.users(id),
  requested_at  timestamptz DEFAULT now(),
  claimed_at    timestamptz,
  completed_at  timestamptz,
  result_note   text
);

ALTER TABLE public.max_lane_requests ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: anon & authenticated get deny-all on direct access.
-- All reads/writes go through the SECURITY DEFINER RPCs below.
REVOKE ALL ON public.max_lane_requests FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_max_lane_requests_status
  ON public.max_lane_requests (status);
CREATE INDEX IF NOT EXISTS idx_max_lane_requests_routine_requested
  ON public.max_lane_requests (routine_id, requested_at DESC);

COMMENT ON TABLE public.max_lane_requests IS
  'Queue of on-demand "Run on Max" requests for AI routines. Written by super_admin '
  'via fn_max_lane_request_run; claimed+completed by a Mac-side service-role poller. '
  'RLS-enabled with no policies (RPC-only access).';

-- ── RPC 1: super_admin queues a Max-lane run (authenticated / user session) ─────
CREATE OR REPLACE FUNCTION public.fn_max_lane_request_run(p_routine_id text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_routine text := btrim(COALESCE(p_routine_id, ''));
  v_id      uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF length(v_routine) < 1 OR length(v_routine) > 64 THEN
    RAISE EXCEPTION 'invalid routine_id';
  END IF;

  -- de-dupe: one live request per routine at a time
  IF EXISTS (
    SELECT 1 FROM public.max_lane_requests
     WHERE routine_id = v_routine
       AND status IN ('pending', 'claimed')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already queued');
  END IF;

  INSERT INTO public.max_lane_requests (routine_id, requested_by)
  VALUES (v_routine, auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'request_id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_max_lane_request_run(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_max_lane_request_run(text) TO authenticated;

-- ── RPC 2: super_admin lists recent requests (authenticated / user session) ─────
CREATE OR REPLACE FUNCTION public.fn_max_lane_requests_list()
RETURNS SETOF public.max_lane_requests
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
    SELECT * FROM public.max_lane_requests
     ORDER BY requested_at DESC
     LIMIT 20;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_max_lane_requests_list() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_max_lane_requests_list() TO authenticated;

-- ── RPC 3: Mac poller claims pending requests (service_role only, atomic) ────────
-- Mirrors fn_ai_routine_claim_due's grant-based restriction (revoke anon/authenticated,
-- grant service_role) AND adds a runtime JWT-claims check — belt AND suspenders.
CREATE OR REPLACE FUNCTION public.fn_max_lane_claim_pending()
RETURNS SETOF public.max_lane_requests
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'fn_max_lane_claim_pending: service role only';
  END IF;

  -- stale-claim recovery FIRST: a row claimed >60 min ago whose Mac runner never
  -- reported back is failed, so it stops blocking that routine from being re-queued.
  UPDATE public.max_lane_requests
     SET status       = 'error',
         completed_at = now(),
         result_note  = 'claim expired (Mac runner never completed)'
   WHERE status = 'claimed'
     AND claimed_at < now() - interval '60 minutes';

  -- atomic claim: mark up to 5 pending rows claimed in one statement so an
  -- overlapping poll tick can't grab the same row (FOR UPDATE SKIP LOCKED).
  RETURN QUERY
  UPDATE public.max_lane_requests
     SET status = 'claimed', claimed_at = now()
   WHERE id IN (
     SELECT id FROM public.max_lane_requests
      WHERE status = 'pending'
      ORDER BY requested_at
      LIMIT 5
      FOR UPDATE SKIP LOCKED
   )
  RETURNING *;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_max_lane_claim_pending() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_max_lane_claim_pending() TO service_role;

-- ── RPC 4: Mac poller reports a request result (service_role only) ───────────────
CREATE OR REPLACE FUNCTION public.fn_max_lane_complete(p_id uuid, p_status text, p_note text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'fn_max_lane_complete: service role only';
  END IF;
  IF p_status NOT IN ('done', 'error') THEN
    RAISE EXCEPTION 'p_status must be done or error';
  END IF;

  UPDATE public.max_lane_requests
     SET status       = p_status,
         completed_at = now(),
         result_note  = left(p_note, 500)
   WHERE id = p_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_max_lane_complete(uuid, text, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_max_lane_complete(uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
