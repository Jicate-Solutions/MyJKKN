-- Migration: event_date_requests — timestamp the ASK for a confirmed event date
-- Date: 2026-07-25 (CARRE instrumentation backlog item 1, Lane B)
-- Why: LC brief Q4 — "no confirmed event dates; repeated Principal meetings
--   (Nursing Alumni Insights: 6 visits)". Nothing records WHEN a date was asked
--   for, so "how long has this request been waiting" is unmeasurable. This table
--   turns each ask into a timestamped row; the CARRE evidence function (separate
--   migration 20260725151500) aggregates open count + oldest waiting days.
-- Anchor: event_proposals (the pre-schedule artifact where the waiting happens —
--   learners propose via /events/propose and track via /events/propose/[id]/status).
-- Writes: RPC-only (no INSERT/UPDATE/DELETE policies). Reads: institution-scoped
--   via role_has_institution_access + requester/proposer own-row visibility.
-- Doctrine: acts-not-scores. Rows record asks and decisions; nothing is ranked,
--   nothing auto-applies to any human's record.

-- ─────────────────────────────────────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_date_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id    UUID NOT NULL REFERENCES public.event_proposals(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES public.institutions(id),
  requested_by   UUID NOT NULL REFERENCES public.profiles(id),
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note           TEXT,
  decision       TEXT CHECK (decision IN ('confirmed','declined','superseded')),
  decision_note  TEXT,
  decided_by     UUID REFERENCES public.profiles(id),
  decided_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A decision is atomic: decision + decided_by + decided_at land together or not at all.
  CONSTRAINT event_date_requests_decision_pair CHECK (
    (decided_at IS NULL AND decision IS NULL AND decided_by IS NULL)
    OR (decided_at IS NOT NULL AND decision IS NOT NULL AND decided_by IS NOT NULL)
  )
);

-- One OPEN ask per event per person (also the raise-RPC race safety net).
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_date_requests_open_per_person
  ON public.event_date_requests (proposal_id, requested_by)
  WHERE decided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_date_requests_proposal
  ON public.event_date_requests (proposal_id);

CREATE INDEX IF NOT EXISTS idx_event_date_requests_institution
  ON public.event_date_requests (institution_id);

-- Keeps the CARRE evidence aggregate (count + oldest over OPEN rows) cheap forever.
CREATE INDEX IF NOT EXISTS idx_event_date_requests_open
  ON public.event_date_requests (requested_at)
  WHERE decided_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — read-only base table; every write goes through the SECDEF RPCs below.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.event_date_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_date_requests_select ON public.event_date_requests
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR requested_by = auth.uid()
  OR EXISTS (
       SELECT 1 FROM public.event_proposals p
       WHERE p.id = proposal_id AND p.proposer_id = auth.uid()
     )
  OR (user_has_permission('events.proposals.view')
      AND role_has_institution_access(institution_id))
);

-- No INSERT/UPDATE/DELETE policies on purpose. Defense-in-depth: strip the
-- default write grants too, so a future permissive policy cannot reopen writes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.event_date_requests FROM anon, authenticated;
REVOKE ALL ON public.event_date_requests FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: raise a date request (authenticated; one open ask per event per person)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_event_date_request_raise(
  p_proposal_id uuid,
  p_note        text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_inst         uuid;
  v_proposer     uuid;
  v_status       text;
  v_id           uuid;
  v_requested_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated',
      'message', 'You must be signed in to request a date.');
  END IF;

  SELECT p.institution_id, p.proposer_id, p.status::text
    INTO v_inst, v_proposer, v_status
  FROM public.event_proposals p
  WHERE p.id = p_proposal_id;

  IF v_inst IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found',
      'message', 'This event proposal does not exist.');
  END IF;

  -- Visibility gate mirrors the event_proposals SELECT policy: the proposer,
  -- leadership, or events.proposals.view within institution scope.
  IF NOT (v_proposer = v_uid OR is_super_admin() OR is_admin()
          OR (user_has_permission('events.proposals.view')
              AND role_has_institution_access(v_inst))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden',
      'message', 'You do not have access to this event proposal — contact the event coordinator.');
  END IF;

  IF v_status IN ('rejected','withdrawn') THEN
    RETURN jsonb_build_object('success', false, 'error', 'proposal_closed',
      'message', 'This proposal is ' || v_status || ' — a date can no longer be requested on it.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_date_requests r
    WHERE r.proposal_id = p_proposal_id
      AND r.requested_by = v_uid
      AND r.decided_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_open_request',
      'message', 'You already have an open date request for this event — it is waiting for a decision.');
  END IF;

  BEGIN
    INSERT INTO public.event_date_requests (proposal_id, institution_id, requested_by, note)
    VALUES (p_proposal_id, v_inst, v_uid, NULLIF(btrim(p_note), ''))
    RETURNING id, requested_at INTO v_id, v_requested_at;
  EXCEPTION WHEN unique_violation THEN
    -- Race with a concurrent raise from the same person: same answer as above.
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_open_request',
      'message', 'You already have an open date request for this event — it is waiting for a decision.');
  END;

  RETURN jsonb_build_object('success', true, 'request_id', v_id, 'requested_at', v_requested_at);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_event_date_request_raise(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_event_date_request_raise(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: decide a date request (event decision owner or leadership)
--   • the person who decided the proposal itself (event_proposals.decided_by)
--   • leadership granted the events.dates.decide permission key in Role
--     Management, within institution scope (never hardcoded role names)
--   • is_super_admin() / is_admin()
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_event_date_request_decide(
  p_request_id uuid,
  p_decision   text,
  p_note       text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_inst           uuid;
  v_decided_at     timestamptz;
  v_proposal_owner uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated',
      'message', 'You must be signed in to decide a date request.');
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('confirmed','declined','superseded') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_decision',
      'message', 'Decision must be one of: confirmed, declined, superseded.');
  END IF;

  SELECT r.institution_id, r.decided_at, p.decided_by
    INTO v_inst, v_decided_at, v_proposal_owner
  FROM public.event_date_requests r
  JOIN public.event_proposals p ON p.id = r.proposal_id
  WHERE r.id = p_request_id;

  IF v_inst IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found',
      'message', 'This date request does not exist.');
  END IF;

  IF NOT (is_super_admin() OR is_admin()
          OR (v_proposal_owner IS NOT NULL AND v_proposal_owner = v_uid)
          OR (user_has_permission('events.dates.decide')
              AND role_has_institution_access(v_inst))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden',
      'message', 'Only the event decision owner or leadership can decide a date request.');
  END IF;

  IF v_decided_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_decided',
      'message', 'This date request has already been decided.');
  END IF;

  UPDATE public.event_date_requests
     SET decision      = p_decision,
         decision_note = NULLIF(btrim(p_note), ''),
         decided_by    = v_uid,
         decided_at    = now(),
         updated_at    = now()
   WHERE id = p_request_id
     AND decided_at IS NULL;

  IF NOT FOUND THEN
    -- Race with a concurrent decide.
    RETURN jsonb_build_object('success', false, 'error', 'already_decided',
      'message', 'This date request has already been decided.');
  END IF;

  RETURN jsonb_build_object('success', true, 'request_id', p_request_id, 'decision', p_decision);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_event_date_request_decide(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_event_date_request_decide(uuid, text, text) TO authenticated;
