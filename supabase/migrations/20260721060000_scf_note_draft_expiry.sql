-- Migration: 20260721060000_scf_note_draft_expiry.sql
-- Purpose: Retire learner-note drafts that no human reviewed in time.
--   Director decision 2026-07-21: a support note is only useful while it is timely.
--   "You seemed to struggle last week" landing a month late reads as strange to the
--   learner, so an unreviewed draft retires after 14 days rather than waiting forever.
--
-- Behaviour: draft -> 'expired' once it is older than the window. Never touches
--   'approved' (already with the learner) or 'rejected' (a human's decision).
--   Expiry is a status change, NOT a delete — the note text stays for audit and for
--   the false-carry / judge-quality samples.
--   Notes leave fn_scf_learner_notes_pending automatically (it filters status='draft').
--
-- Reversible: an expired note can be set back to 'draft' by hand; nothing is destroyed.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Widen the status CHECK to admit 'expired'.
--    (No TypeScript union declares this status — the app reads it as a plain
--    string — so there is no TS-union sweep to pair with this widening.)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scf_learner_notes
  DROP CONSTRAINT IF EXISTS scf_learner_notes_status_check;

ALTER TABLE public.scf_learner_notes
  ADD CONSTRAINT scf_learner_notes_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'rejected'::text, 'expired'::text]));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Expiry RPC — cron-only. service_role ONLY: it mutates learner-facing note
--    state in bulk, so `authenticated` would be a cross-tenant write surface.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_scf_expire_stale_note_drafts(p_days int DEFAULT 14)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int := GREATEST(1, LEAST(90, COALESCE(p_days, 14)));
  v_n    int;
BEGIN
  UPDATE public.scf_learner_notes
     SET status = 'expired', updated_at = now()
   WHERE status = 'draft'
     AND created_at < now() - make_interval(days => v_days);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_expire_stale_note_drafts(int) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_expire_stale_note_drafts(int) TO service_role;
