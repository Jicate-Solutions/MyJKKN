-- ============================================================
-- Fix: Add twelfth_group column to admission_leads
-- Date:    2026-04-15
-- Bug:     BUG-003222 — Add 12th group name fields and remove mandatory fields
--
-- Context:
--   Counselors at expo stalls asked for a field to capture the learner's
--   12th stream (Biology, Computer Science, Commerce, Arts, etc.) so
--   leads can be segmented by stream for follow-up. The rapid-capture
--   form now surfaces a "12th Group / Stream" free-text field; this
--   migration adds the backing column. Free-text (not enum) because
--   stream names vary widely across state boards and we don't want to
--   lose data by forcing counselors into a dropdown.
--
-- Why this is safe:
--   • Column is nullable and has no default — no rewrites on existing
--     rows; the ALTER is a fast metadata-only operation on Postgres 11+.
--   • No indexes added yet (not needed until we have filter/segment UX).
--   • RLS policies on admission_leads cover all columns uniformly, so
--     no policy changes required.
-- ============================================================

ALTER TABLE public.admission_leads
  ADD COLUMN IF NOT EXISTS twelfth_group text;

COMMENT ON COLUMN public.admission_leads.twelfth_group IS
  '12th Standard group / stream (e.g. Biology, Computer Science, Commerce, Arts). Free-text captured at expo rapid-capture form. Added for BUG-003222 on 2026-04-15.';
