-- ─────────────────────────────────────────────────────────────────────────────
-- BoS Email Templates
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores per-institution editable email templates used by BoS workflows.
-- A row with institutions_id = NULL is the system default and is used as
-- fallback when no per-institution override exists.
--
-- First-slice scope: one template_code, 'meeting_invitation', used by the
-- Members tab notify-members endpoint. New codes are seeded by adding more
-- INSERTs — no schema change required.

CREATE TABLE IF NOT EXISTS bos_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL = system default. Non-null = per-institution override.
  institutions_id UUID REFERENCES institutions(id) ON DELETE CASCADE,

  -- e.g. 'meeting_invitation', 'syllabus_revised', 'syllabus_approved'.
  -- Free-form so new templates can be added without enum migrations.
  template_code VARCHAR(64) NOT NULL,

  -- Human-readable name shown in the admin dropdown.
  template_name VARCHAR(255) NOT NULL,

  -- Optional description of when this template is used.
  description TEXT,

  -- Subject line — supports {{placeholder}} interpolation.
  subject TEXT NOT NULL,

  -- Full HTML body — supports {{placeholder}} interpolation.
  body_html TEXT NOT NULL,

  -- Only is_active = true rows are picked up by the resolver. Inactive rows
  -- are kept as edit history.
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active template per (institution, code). Partial index allows
-- inactive history rows to coexist.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bos_email_templates_active
  ON bos_email_templates (COALESCE(institutions_id, '00000000-0000-0000-0000-000000000000'::uuid), template_code)
  WHERE is_active = true;

-- Lookup index for the resolver (per-institution → fallback to global).
CREATE INDEX IF NOT EXISTS idx_bos_email_templates_lookup
  ON bos_email_templates (template_code, institutions_id)
  WHERE is_active = true;

-- updated_at trigger.
CREATE OR REPLACE FUNCTION update_bos_email_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_bos_email_templates_updated_at ON bos_email_templates;
CREATE TRIGGER trigger_bos_email_templates_updated_at
  BEFORE UPDATE ON bos_email_templates
  FOR EACH ROW EXECUTE FUNCTION update_bos_email_templates_updated_at();

-- RLS: super-admin and BoS-eligible users can read/write.
-- Mirrors the gating already used for other bos_* tables.
ALTER TABLE bos_email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bos_email_templates_select ON bos_email_templates;
CREATE POLICY bos_email_templates_select ON bos_email_templates
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS bos_email_templates_insert ON bos_email_templates;
CREATE POLICY bos_email_templates_insert ON bos_email_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.is_super_admin = true OR p.role IN ('super_admin', 'principal', 'hod'))
    )
  );

DROP POLICY IF EXISTS bos_email_templates_update ON bos_email_templates;
CREATE POLICY bos_email_templates_update ON bos_email_templates
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.is_super_admin = true OR p.role IN ('super_admin', 'principal', 'hod'))
    )
  );

-- ─── Seed: system-default 'meeting_invitation' template ─────────────────────
INSERT INTO bos_email_templates (
  institutions_id, template_code, template_name, description, subject, body_html
)
VALUES (
  NULL,
  'meeting_invitation',
  'Meeting Invitation (BoS Members)',
  'Sent to selected board members when the chairman invites experts to a Board of Studies meeting (status = expert_invited).',
  'Appointment Letter - {{member_role}} - {{academic_year}}',
  $body$<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Times New Roman', serif; color: #333; margin: 0; padding: 0; }
    .outer { width: 100%; padding: 24px 0; }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 24px 32px;
      line-height: 1.65;
      font-size: 15px;
      text-align: justify;
    }
    p { margin: 0 0 14px 0; }
    a { color: #0b5394; }
    .signoff { margin-top: 28px; text-align: left; }
  </style>
</head>
<body>
  <div class="outer">
    <div class="container">
      <p>Dear {{member_name}},</p>

      <p>Greetings from <strong>{{institution_name}}</strong>.</p>

      <p>Please find attached the Board of Studies meeting notice for your reference.</p>

      <p>If you are not in a position to accept this offer, please inform us through mail at
         <a href="mailto:bosarts@jkkn.ac.in">bosarts@jkkn.ac.in</a> immediately.</p>

      <div class="signoff">
        <p>
          Warm Regards,<br/>
          Principal<br/>
          {{institution_name}}
        </p>
      </div>
    </div>
  </div>
</body>
</html>
$body$
)
ON CONFLICT DO NOTHING;
