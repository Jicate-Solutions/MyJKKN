-- =============================================================================
-- 016: WhatsApp Templates Table
-- =============================================================================
-- Dedicated table for WhatsApp message templates with local management,
-- Meta sync metadata, usage tracking, and attachment support.
-- Matches the schema defined in lib/types/database.ts → whatsapp_templates.
-- =============================================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid        NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  content         text        NOT NULL,
  category        text,
  variables       jsonb       DEFAULT '[]'::jsonb,
  attachment_type text,
  attachment_url  text,
  use_count       integer     DEFAULT 0,
  last_used_at    timestamptz,
  created_by      uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  is_active       boolean     DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_institution
  ON whatsapp_templates (institution_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_name
  ON whatsapp_templates (institution_id, name);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_active
  ON whatsapp_templates (institution_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_category
  ON whatsapp_templates (institution_id, category)
  WHERE category IS NOT NULL;

-- 3. Updated-at trigger (reuses existing function)
CREATE TRIGGER whatsapp_templates_updated_at
  BEFORE UPDATE ON whatsapp_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4. Enable RLS
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies — matching wa_* table pattern
--    Access: institution members via auth_institution_id() OR super_admin
--    Service role bypasses RLS automatically.

CREATE POLICY "whatsapp_templates_select" ON whatsapp_templates
  FOR SELECT TO authenticated
  USING (
    institution_id = auth_institution_id()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.role = 'super_admin' OR profiles.is_super_admin = true)
    )
  );

CREATE POLICY "whatsapp_templates_insert" ON whatsapp_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = auth_institution_id()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.role = 'super_admin' OR profiles.is_super_admin = true)
    )
  );

CREATE POLICY "whatsapp_templates_update" ON whatsapp_templates
  FOR UPDATE TO authenticated
  USING (
    institution_id = auth_institution_id()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.role = 'super_admin' OR profiles.is_super_admin = true)
    )
  );

CREATE POLICY "whatsapp_templates_delete" ON whatsapp_templates
  FOR DELETE TO authenticated
  USING (
    institution_id = auth_institution_id()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.role = 'super_admin' OR profiles.is_super_admin = true)
    )
  );

-- Service role full access (needed for Meta sync which runs server-side)
CREATE POLICY "whatsapp_templates_service_role" ON whatsapp_templates
  FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role');
