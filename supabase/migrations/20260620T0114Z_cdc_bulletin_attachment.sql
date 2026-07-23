-- 20260620T0114Z_cdc_bulletin_attachment.sql
-- 2026-06-20 — BUG-004063: "Post Opportunity" (/cdc/bulletin/new) form has no way to
--   attach a brochure / supporting document. Add an attachment_url column so a poster
--   can upload a PDF or image (stored in the cdc-docs bucket) and learners can open it.
--
-- Nullable: existing rows predate this field and the attachment is optional on the form.
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.cdc_external_opportunities
  ADD COLUMN IF NOT EXISTS attachment_url text;

COMMENT ON COLUMN public.cdc_external_opportunities.attachment_url IS
  'Public URL of an optional brochure/attachment (PDF or image) stored in the cdc-docs bucket. Nullable; optional on the Post Opportunity form. Added 2026-06-20 (BUG-004063).';
