-- Derive (not just validate) event_id on sections/fields from their parent
-- chain via BEFORE INSERT/UPDATE triggers. Postgres runs BEFORE ROW triggers
-- before RLS WITH CHECK evaluation, so this closes the drift risk precisely:
-- even a caller who submits a wrong event_id gets it silently corrected to
-- the TRUE owning tournament before RLS checks permissions against it.

BEGIN;

CREATE OR REPLACE FUNCTION sync_event_registration_form_section_event_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT event_id INTO NEW.event_id FROM event_registration_forms WHERE id = NEW.form_id;
  IF NEW.event_id IS NULL THEN
    RAISE EXCEPTION 'event_registration_form_sections.form_id % does not reference a valid form', NEW.form_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_event_registration_form_section_event_id ON event_registration_form_sections;
CREATE TRIGGER trg_sync_event_registration_form_section_event_id
BEFORE INSERT OR UPDATE OF form_id ON event_registration_form_sections
FOR EACH ROW EXECUTE FUNCTION sync_event_registration_form_section_event_id();

CREATE OR REPLACE FUNCTION sync_event_registration_form_field_event_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT event_id INTO NEW.event_id FROM event_registration_form_sections WHERE id = NEW.section_id;
  IF NEW.event_id IS NULL THEN
    RAISE EXCEPTION 'event_registration_form_fields.section_id % does not reference a valid section', NEW.section_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_event_registration_form_field_event_id ON event_registration_form_fields;
CREATE TRIGGER trg_sync_event_registration_form_field_event_id
BEFORE INSERT OR UPDATE OF section_id ON event_registration_form_fields
FOR EACH ROW EXECUTE FUNCTION sync_event_registration_form_field_event_id();

COMMIT;
