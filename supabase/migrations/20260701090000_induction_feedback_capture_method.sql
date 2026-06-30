-- ============================================================================
-- Fresher Induction — Feedback capture-method tag (no-smartphone coverage gap)
-- File: 20260701090000_induction_feedback_capture_method.sql | Date: 2026-07-01
-- Spec: specs/induction-feedback-coverage-no-smartphone-2026-06-30.md (PR1, §C.0)
--   + Director decisions 2026-06-30 (PAPER REMOVED; methods = phone | volunteer_kiosk).
--
-- Tags every induction feedback row with HOW it was captured + WHO entered a proxy
-- (volunteer-kiosk) row. Establishes the load-bearing invariant:
--     submitted_by IS NULL  ⟺  capture_method = 'phone'
-- i.e. a fresher's OWN-login submission always has submitted_by = NULL ('phone'),
-- and any proxy/kiosk row carries the volunteer's profile id ('volunteer_kiosk').
-- The proxy writer's anti-clobber (next migration) relies on this invariant.
-- ============================================================================

ALTER TABLE public.event_session_feedback
  ADD COLUMN IF NOT EXISTS capture_method TEXT NOT NULL DEFAULT 'phone'
    CHECK (capture_method IN ('phone','volunteer_kiosk')),
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.profiles(id);
    -- NULL  → student self-submit on their own login ('phone', authoritative).
    -- set   → the volunteer/coordinator who entered a 'volunteer_kiosk' row.

-- The existing rows are all student self-submits → already 'phone' via DEFAULT.
-- (No real backfill needed, but assert it explicitly for the audit trail.)
UPDATE public.event_session_feedback SET capture_method = 'phone' WHERE capture_method IS NULL;

CREATE INDEX IF NOT EXISTS idx_esf_capture_method
  ON public.event_session_feedback(event_id, capture_method);

-- DB-enforce the load-bearing invariant (submitted_by IS NULL ⟺ capture_method='phone')
-- so a drifted row can never make the proxy/volunteer anti-clobber misclassify an
-- own-login row as overwritable (review #1694 r4). Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'event_session_feedback_submitter_method_chk') THEN
    ALTER TABLE public.event_session_feedback
      ADD CONSTRAINT event_session_feedback_submitter_method_chk
      CHECK ((submitted_by IS NULL) = (capture_method = 'phone'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
