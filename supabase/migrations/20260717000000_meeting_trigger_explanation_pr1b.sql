-- ============================================================================
-- Migration: Auto-accountability-meeting engine — PR1b (explanation valve)
-- Date: 2026-06-22
-- Spec: specs/meeting-auto-trigger-engine-2026-06-22.md (§8 #6/#7/#8, §9 step 3-4)
--
-- Adds the 24h-explanation-valve state to the breach-event ledger (PR1a created
-- meeting_trigger_events with status enum already including 'explained',
-- 'dismissed', 'meeting_pending'). PR1b reuses the existing notification ACTION
-- framework (requires_acknowledgment + action_config{response_type:text} +
-- action_responses) for the Principal's explanation — no parallel mechanism.
--
-- Flow (§9):
--   notified --(Principal submits explanation ≤24h)--> explained --> Director
--             --(no explanation in 24h)------------> meeting_pending
--   explained --(Director: skip)--> dismissed
--   explained --(Director: meet)--> meeting_pending
--
-- Purely additive (ALTER ADD COLUMN IF NOT EXISTS); table already live.
-- ============================================================================

ALTER TABLE public.meeting_trigger_events
  ADD COLUMN IF NOT EXISTS explanation_deadline   timestamptz,            -- 24h after the breach notice
  ADD COLUMN IF NOT EXISTS explanation_text       text,                   -- Principal's explanation (mirrored from action_responses)
  ADD COLUMN IF NOT EXISTS explained_at           timestamptz,
  ADD COLUMN IF NOT EXISTS explained_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS director_decision      text
                              CHECK (director_decision IN ('skip','meet')),
  ADD COLUMN IF NOT EXISTS director_decided_at    timestamptz,
  ADD COLUMN IF NOT EXISTS director_decided_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.meeting_trigger_events.explanation_deadline IS
  '24h window end. After this, if no explanation, reconcile flips status -> meeting_pending.';
COMMENT ON COLUMN public.meeting_trigger_events.director_decision IS
  'Director judgment on an explained breach: skip (-> dismissed) or meet (-> meeting_pending).';

-- Index for the reconcile sweep: open events awaiting explanation or past deadline.
CREATE INDEX IF NOT EXISTS idx_meeting_trigger_events_open
  ON public.meeting_trigger_events (status, explanation_deadline)
  WHERE status IN ('notified', 'explained');
