-- =====================================================================
-- CDC Industry Mentors — photo + company logo                   2026-06-20
--
-- BUG-004088: mentor profile photo upload on the industry-mentor create form.
--   Reuses the EXISTING `profile_photo_url` column (already live since the
--   2026-05-18 probe) — no new column added for the photo.
-- BUG-004089: company logo upload on the same form.
--   Adds the new nullable `company_logo_url` column below.
--
-- Both columns hold public URLs of images stored in the `cdc-docs` bucket.
-- Idempotent / re-runnable.
-- =====================================================================
ALTER TABLE public.industry_mentors
  ADD COLUMN IF NOT EXISTS company_logo_url TEXT NULL;

COMMENT ON COLUMN public.industry_mentors.company_logo_url IS
  'Public URL of the company logo image (cdc-docs bucket). NULL = none uploaded. Added 2026-06-20 for BUG-004089.';

COMMENT ON COLUMN public.industry_mentors.profile_photo_url IS
  'Public URL of the mentor profile photo (cdc-docs bucket). NULL = none uploaded. Wired to the create form 2026-06-20 for BUG-004088.';
