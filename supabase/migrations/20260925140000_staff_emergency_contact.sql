-- ============================================================================
-- staff: emergency contact (name, relationship, phone)
-- ----------------------------------------------------------------------------
-- One optional emergency contact per staff member, captured in the Contact
-- Information section of /staff/list/new and edit, on the detail page, in the
-- bulk upload template and in the staff export.
--
-- All three are nullable — none of the existing staff have one, and it must
-- never block an edit. Blank strings are rejected (the form and bulk upload
-- normalise '' -> NULL), so "not set" has exactly one representation.
--
-- Relationship is free text at the DB level: the UI offers a fixed list plus
-- "Other", and Other stores whatever the user typed.
--
-- No RLS change: the existing staff SELECT/UPDATE policies already cover every
-- column, so visibility matches the staff member's own phone and address.
-- ============================================================================

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS emergency_contact_name         text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone        text;

ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_emergency_contact_not_blank;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_emergency_contact_not_blank CHECK (
        (emergency_contact_name         IS NULL OR btrim(emergency_contact_name)         <> '')
    AND (emergency_contact_relationship IS NULL OR btrim(emergency_contact_relationship) <> '')
    AND (emergency_contact_phone        IS NULL OR btrim(emergency_contact_phone)        <> '')
  );

COMMENT ON COLUMN public.staff.emergency_contact_name IS 'Emergency contact person''s name (optional).';
COMMENT ON COLUMN public.staff.emergency_contact_relationship IS 'Relationship to the staff member, e.g. Father / Spouse, or free text chosen via "Other".';
COMMENT ON COLUMN public.staff.emergency_contact_phone IS 'Emergency contact phone number (optional).';
