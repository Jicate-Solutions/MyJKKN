-- Tournament dynamic registration form builder: per-tournament custom fields
-- layered on top of the fixed core registration fields. event_id is
-- denormalized onto every table (not just event_registration_forms) so RLS
-- policies stay single-join, mirroring tournament_divisions' pattern rather
-- than requiring a 3-way join through form_id/section_id on every check.

BEGIN;

CREATE TABLE IF NOT EXISTS event_registration_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_registration_form_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES event_registration_forms(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_registration_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES event_registration_form_sections(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN (
    'text','number','phone','email','select','multi_select','date','textarea','file','checkbox','radio'
  )),
  is_required boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  placeholder text,
  help_text text,
  min_length int,
  max_length int,
  min_value numeric,
  max_value numeric,
  pattern text,
  options jsonb,
  condition jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_event_registration_form_sections_form ON event_registration_form_sections(form_id);
CREATE INDEX IF NOT EXISTS idx_event_registration_form_fields_section ON event_registration_form_fields(section_id);

ALTER TABLE events_registrations ADD COLUMN IF NOT EXISTS custom_fields jsonb;
COMMENT ON COLUMN events_registrations.custom_fields IS
  'Submitted answers to a tournament''s custom registration fields, keyed by field_key. Validated server-side against event_registration_form_fields.is_required before insert.';

-- updated_at triggers (mirrors the existing trg_tournament_divisions_updated_at pattern)
CREATE OR REPLACE FUNCTION update_event_registration_form_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_registration_forms_updated_at ON event_registration_forms;
CREATE TRIGGER trg_event_registration_forms_updated_at
BEFORE UPDATE ON event_registration_forms
FOR EACH ROW EXECUTE FUNCTION update_event_registration_form_updated_at();

DROP TRIGGER IF EXISTS trg_event_registration_form_sections_updated_at ON event_registration_form_sections;
CREATE TRIGGER trg_event_registration_form_sections_updated_at
BEFORE UPDATE ON event_registration_form_sections
FOR EACH ROW EXECUTE FUNCTION update_event_registration_form_updated_at();

DROP TRIGGER IF EXISTS trg_event_registration_form_fields_updated_at ON event_registration_form_fields;
CREATE TRIGGER trg_event_registration_form_fields_updated_at
BEFORE UPDATE ON event_registration_form_fields
FOR EACH ROW EXECUTE FUNCTION update_event_registration_form_updated_at();

-- ============================================================
-- RLS — mirrors tournament_divisions_select/_insert/_update/_delete
-- (20260622110716_sports_tournament_pr1.sql) + the in-charge FOR ALL
-- policy (20260801001000_tournament_incharge_access.sql).
-- ============================================================

ALTER TABLE event_registration_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registration_form_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registration_form_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_registration_forms_select" ON event_registration_forms;
CREATE POLICY "event_registration_forms_select" ON event_registration_forms
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR (
      user_has_permission('sports.tournaments.view')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_forms.event_id
          AND (
            e.scope = 'all_jkkn'
            OR e.visibility IN ('all_jkkn', 'public')
            OR role_has_institution_access(e.institution_id)
          )
      )
    )
  );

DROP POLICY IF EXISTS "event_registration_forms_manage" ON event_registration_forms;
CREATE POLICY "event_registration_forms_manage" ON event_registration_forms
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_forms.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_forms.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  );

DROP POLICY IF EXISTS "event_registration_form_sections_select" ON event_registration_form_sections;
CREATE POLICY "event_registration_form_sections_select" ON event_registration_form_sections
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR (
      user_has_permission('sports.tournaments.view')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_sections.event_id
          AND (
            e.scope = 'all_jkkn'
            OR e.visibility IN ('all_jkkn', 'public')
            OR role_has_institution_access(e.institution_id)
          )
      )
    )
  );

DROP POLICY IF EXISTS "event_registration_form_sections_manage" ON event_registration_form_sections;
CREATE POLICY "event_registration_form_sections_manage" ON event_registration_form_sections
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_sections.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_sections.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  );

DROP POLICY IF EXISTS "event_registration_form_fields_select" ON event_registration_form_fields;
CREATE POLICY "event_registration_form_fields_select" ON event_registration_form_fields
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR (
      user_has_permission('sports.tournaments.view')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_fields.event_id
          AND (
            e.scope = 'all_jkkn'
            OR e.visibility IN ('all_jkkn', 'public')
            OR role_has_institution_access(e.institution_id)
          )
      )
    )
  );

DROP POLICY IF EXISTS "event_registration_form_fields_manage" ON event_registration_form_fields;
CREATE POLICY "event_registration_form_fields_manage" ON event_registration_form_fields
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_fields.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_fields.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  );

COMMIT;
