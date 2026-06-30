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
  ADD COLUMN IF NOT EXISTS submitted_by UUID;
    -- NULL  → student self-submit on their own login ('phone', authoritative).
    -- set   → the volunteer/coordinator who entered a 'volunteer_kiosk' row.
    -- NO FK to profiles: this holds auth.uid(), and the sibling marked_by/appointed_by
    -- audit columns are deliberately FK-less for auth.uid()-valued columns. An FK here
    -- would fail-CLOSED for any authenticated actor lacking a profiles row (review #1694 r5 HIGH).

-- Remove the FK the ORIGINAL column-add created on prod (idempotent; no-op on a fresh DB
-- where the column above is now created without it).
ALTER TABLE public.event_session_feedback
  DROP CONSTRAINT IF EXISTS event_session_feedback_submitted_by_fkey;

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
