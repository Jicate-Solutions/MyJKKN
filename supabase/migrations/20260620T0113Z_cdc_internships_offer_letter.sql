-- 2026-06-20 - BUG-004087 - Add optional offer-letter document URL to corporate internships.
-- Stores the public URL of an uploaded offer letter (PDF/image) for an
-- internship_assignments row. Nullable: the offer letter is optional at create time.
-- Idempotent so re-runs are safe.

ALTER TABLE public.internship_assignments
  ADD COLUMN IF NOT EXISTS offer_letter_url text;

COMMENT ON COLUMN public.internship_assignments.offer_letter_url IS
  'BUG-004087: Public URL of the uploaded internship offer letter (PDF/image) in the cdc-docs storage bucket. Nullable — optional at create time.';
