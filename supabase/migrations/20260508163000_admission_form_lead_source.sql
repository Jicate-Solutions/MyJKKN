-- 2026-05-08 — Per-form lead source for admission_forms
--
-- Why: Today FormSubmissionService hardcodes source='website' for every
-- public form submission. To ship a parallel WhatsApp-channel form (and
-- any future channel), forms need a configurable source.
--
-- Strategy:
--   1. Extend lead_source enum with 'whatsapp'.
--   2. Add lead_source column to admission_forms with DEFAULT 'website'
--      so every existing row (including the live website form) keeps
--      identical behavior. NOT NULL because submission writes always
--      need a source.
--
-- Note: ALTER TYPE ADD VALUE is safe inside this single transaction
-- because the new value 'whatsapp' is NOT referenced anywhere in the
-- same transaction (the column DEFAULT uses 'website', a pre-existing
-- value). Postgres 12+ permits this; production runs Postgres 15+.

ALTER TYPE public.lead_source ADD VALUE IF NOT EXISTS 'whatsapp';

ALTER TABLE public.admission_forms
  ADD COLUMN IF NOT EXISTS lead_source public.lead_source
  NOT NULL DEFAULT 'website'::public.lead_source;

COMMENT ON COLUMN public.admission_forms.lead_source IS
  'Channel attribution for leads created via this form. '
  'Read by FormSubmissionService.processSubmission to set lead.source. '
  'Defaults to ''website'' for backward compatibility — the live website '
  'form keeps source=''website'' without any data change.';
