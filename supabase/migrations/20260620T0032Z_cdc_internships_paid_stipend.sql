-- 20260620T0032Z_cdc_internships_paid_stipend.sql
-- Date: 2026-06-20
-- Reason: BUG-004040 — the CDC corporate internship form (/cdc/internships/new)
--   had no way to mark an internship Paid vs Unpaid and no field to record the
--   stipend amount for paid internships. Add the two columns to the canonical
--   CDC internship table (internship_assignments).
-- Scope: additive only; both columns are nullable/defaulted so existing rows and
--   inserts that omit them are unaffected.

ALTER TABLE public.internship_assignments
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stipend_amount numeric;

COMMENT ON COLUMN public.internship_assignments.is_paid IS
  'BUG-004040: whether the internship is paid (true) or unpaid (false). Default false.';
COMMENT ON COLUMN public.internship_assignments.stipend_amount IS
  'BUG-004040: monthly stipend amount in INR for paid internships. NULL when unpaid or unspecified.';
