-- =====================================================================
-- Feedback Spine — universal feedback/interaction event store
-- Date: 2026-06-26
-- =====================================================================
-- ONE table every feedback source writes to (IG comments/DMs, session
-- feedback, AI Pulse, mess, class-feedback, parent, SCF check-ins…),
-- normalized so the self-improving + per-interaction-personalized loops
-- read feedback without caring where it came from.
--
-- Each row = one feedback event. Adapters normalize a source's native
-- rows INTO this shape; the AI-classify worker fills the ai_* columns
-- (one claude-sonnet-4-6 call per event) with sentiment/intent/topic +
-- a draft personalized reply; loops + the unified dashboard read it.
--
-- SECURITY: writes are service_role only (adapters + the classify worker
-- run server-side as crons). SELECT = admins OR feedback.view (fail-safe
-- to admins if the permission key is not yet granted). anon fully revoked.
-- Idempotent: CREATE IF NOT EXISTS + DROP POLICY IF EXISTS.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.feedback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- WHERE it came from
  source TEXT NOT NULL,            -- 'ig_comment'|'ig_dm'|'session_feedback'|'ai_pulse'|'mess'|'class_feedback'|'parent'|'scf_checkin'
  source_ref TEXT,                 -- the source's own row/object id (idempotency key)
  institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
  -- WHO (per-person where the source exposes it; null/anon otherwise)
  actor_type TEXT,                 -- 'ig_user'|'learner'|'parent'|'staff'|'anon'
  actor_ref TEXT,                  -- handle / learner_id / etc
  -- WHAT it's about
  target_type TEXT,                -- 'ig_post'|'session'|'meeting'|'program'|...
  target_ref TEXT,                 -- post id / session id / ...
  event_type TEXT NOT NULL,        -- 'comment'|'dm'|'rating'|'reply'|'mention'|'story_reply'
  -- THE FEEDBACK
  content TEXT,                    -- the actual text (null for pure-numeric ratings)
  rating NUMERIC,                  -- optional numeric score
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- AI ENRICHMENT (filled by the classify worker)
  ai_sentiment TEXT,               -- 'positive'|'neutral'|'negative'|'mixed'
  ai_intent TEXT,                  -- 'praise'|'complaint'|'question'|'request'|'suggestion'|'spam'
  ai_topic TEXT,                   -- short free-text topic label
  ai_draft_reply TEXT,             -- suggested personalized reply (human approves before sending)
  ai_model TEXT,
  ai_processed_at TIMESTAMPTZ,     -- NULL = awaiting classification (the work queue)
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT feedback_events_source_ref_key UNIQUE (source, source_ref)
);

-- classify queue: unprocessed events with text, newest first
CREATE INDEX IF NOT EXISTS idx_feedback_events_unprocessed
  ON public.feedback_events (occurred_at DESC)
  WHERE ai_processed_at IS NULL AND content IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_events_source ON public.feedback_events (source, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_events_target ON public.feedback_events (target_type, target_ref);
CREATE INDEX IF NOT EXISTS idx_feedback_events_institution ON public.feedback_events (institution_id);

ALTER TABLE public.feedback_events ENABLE ROW LEVEL SECURITY;

-- SELECT: admins, or holders of feedback.view (fail-safe to admins).
DROP POLICY IF EXISTS feedback_events_select ON public.feedback_events;
CREATE POLICY feedback_events_select ON public.feedback_events
  FOR SELECT TO authenticated
  USING (is_super_admin() OR is_admin() OR user_has_permission('feedback.view'));

-- Writes: service_role only (adapters + classify worker). No authenticated
-- write policy — ingestion never runs under a user session.

REVOKE ALL ON public.feedback_events FROM anon, PUBLIC;
GRANT SELECT ON public.feedback_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.feedback_events TO service_role;
