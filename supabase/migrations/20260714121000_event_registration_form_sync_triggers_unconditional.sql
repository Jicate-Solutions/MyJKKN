-- The prior sync triggers were column-restricted (OF form_id / OF section_id),
-- so a bare UPDATE ... SET event_id = X (touching neither FK column) bypassed
-- correction entirely. Make both triggers fire on every INSERT/UPDATE instead.

BEGIN;

DROP TRIGGER IF EXISTS trg_sync_event_registration_form_section_event_id ON event_registration_form_sections;
CREATE TRIGGER trg_sync_event_registration_form_section_event_id
BEFORE INSERT OR UPDATE ON event_registration_form_sections
FOR EACH ROW EXECUTE FUNCTION sync_event_registration_form_section_event_id();

DROP TRIGGER IF EXISTS trg_sync_event_registration_form_field_event_id ON event_registration_form_fields;
CREATE TRIGGER trg_sync_event_registration_form_field_event_id
BEFORE INSERT OR UPDATE ON event_registration_form_fields
FOR EACH ROW EXECUTE FUNCTION sync_event_registration_form_field_event_id();

COMMIT;
