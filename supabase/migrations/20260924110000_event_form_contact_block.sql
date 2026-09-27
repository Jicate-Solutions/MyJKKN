-- ============================================================================
-- event_registration_forms.contact_block — where (or whether) the built-in
-- "Your name / Phone / Email" block appears on the public form.
-- ----------------------------------------------------------------------------
--   'top'    — first, before the custom sections (the historic layout; default)
--   'bottom' — after the custom sections, so a banner or category question
--              leads the page
--   'hidden' — not shown; the public form reads name / phone / email from the
--              organizer's own fields (deriveContactFromAnswers in
--              lib/services/events/registration/form-prefill.ts). The
--              public-register API still requires a name and one of phone /
--              email, so the builder warns when no field can supply a name.
-- Asked 2026-09-24: the 360° Townhall form asks these per category already,
-- and wants its banner first.
-- ============================================================================

ALTER TABLE public.event_registration_forms
  ADD COLUMN IF NOT EXISTS contact_block text NOT NULL DEFAULT 'top';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_registration_forms_contact_block_check'
  ) THEN
    ALTER TABLE public.event_registration_forms
      ADD CONSTRAINT event_registration_forms_contact_block_check
      CHECK (contact_block IN ('top', 'bottom', 'hidden'));
  END IF;
END $$;

COMMENT ON COLUMN public.event_registration_forms.contact_block IS
  'Built-in name/phone/email block on the public form: top (default) | bottom | hidden (derived from the form''s own fields)';
