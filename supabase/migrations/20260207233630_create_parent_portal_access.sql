-- Parent Portal Access Management
-- Adds access code based system for parent access administration

CREATE TABLE IF NOT EXISTS parent_portal_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  learner_id UUID NOT NULL,
  parent_name TEXT NOT NULL,
  parent_email TEXT,
  parent_phone TEXT,
  relationship TEXT DEFAULT 'parent', -- parent, guardian, sponsor
  access_code TEXT UNIQUE NOT NULL,
  access_level TEXT DEFAULT 'view', -- view, interact
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0,
  notification_preferences JSONB DEFAULT '{"email": true, "sms": false, "push": false}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_parent_access_institution ON parent_portal_access(institution_id);
CREATE INDEX IF NOT EXISTS idx_parent_access_learner ON parent_portal_access(learner_id);
CREATE INDEX IF NOT EXISTS idx_parent_access_code ON parent_portal_access(access_code);

-- Enable RLS
ALTER TABLE parent_portal_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON parent_portal_access FOR ALL USING (auth.role() = 'authenticated');

-- Updated_at trigger
CREATE OR REPLACE TRIGGER update_parent_access_updated_at
  BEFORE UPDATE ON parent_portal_access
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
