-- ================================================================
-- Marketing & Outreach: Activity Tracking & Analytics
-- Migration: 20260326000006_ss_marketing
-- Part of Incubation Management Enhancement Phase 6
-- ================================================================

-- 1. Marketing Activities
CREATE TABLE IF NOT EXISTS ss_marketing_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'awareness_campaign', 'workshop', 'demo_day', 'media_coverage',
    'social_media', 'website_update', 'brochure', 'newsletter',
    'podcast', 'webinar', 'conference', 'stakeholder_visit', 'other'
  )),
  title TEXT NOT NULL,
  description TEXT,
  target_audience TEXT,
  date_start DATE,
  date_end DATE,
  budget NUMERIC(12,2),
  actual_cost NUMERIC(12,2),
  reach_count INTEGER DEFAULT 0,
  leads_generated INTEGER DEFAULT 0,
  applications_from_activity INTEGER DEFAULT 0,
  media_links TEXT[] DEFAULT '{}',
  photos TEXT[] DEFAULT '{}',
  roi_notes TEXT,
  status TEXT DEFAULT 'planned' CHECK (status IN (
    'planned', 'in_progress', 'completed', 'cancelled'
  )),
  conducted_by UUID REFERENCES profiles(id),
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. RLS
ALTER TABLE ss_marketing_activities ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read activities for their institution + super_admin bypass
CREATE POLICY ss_marketing_activities_select ON ss_marketing_activities
  FOR SELECT TO authenticated
  USING (
    institution_id = auth.jwt()->>'institution_id'
    OR auth.jwt()->>'role' = 'super_admin'
  );

-- Service role has full access
CREATE POLICY ss_marketing_activities_service_all ON ss_marketing_activities
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can insert/update/delete within their institution + super_admin bypass
CREATE POLICY ss_marketing_activities_insert ON ss_marketing_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = auth.jwt()->>'institution_id'
    OR auth.jwt()->>'role' = 'super_admin'
  );

CREATE POLICY ss_marketing_activities_update ON ss_marketing_activities
  FOR UPDATE TO authenticated
  USING (
    institution_id = auth.jwt()->>'institution_id'
    OR auth.jwt()->>'role' = 'super_admin'
  )
  WITH CHECK (
    institution_id = auth.jwt()->>'institution_id'
    OR auth.jwt()->>'role' = 'super_admin'
  );

CREATE POLICY ss_marketing_activities_delete ON ss_marketing_activities
  FOR DELETE TO authenticated
  USING (
    institution_id = auth.jwt()->>'institution_id'
    OR auth.jwt()->>'role' = 'super_admin'
  );

-- 3. GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON ss_marketing_activities TO authenticated;
GRANT ALL ON ss_marketing_activities TO service_role;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_ss_marketing_activities_institution ON ss_marketing_activities(institution_id);
CREATE INDEX IF NOT EXISTS idx_ss_marketing_activities_status ON ss_marketing_activities(status);
CREATE INDEX IF NOT EXISTS idx_ss_marketing_activities_type ON ss_marketing_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_ss_marketing_activities_dates ON ss_marketing_activities(date_start DESC, date_end);

-- 5. Trigger for updated_at
CREATE TRIGGER update_ss_marketing_activities_updated_at
  BEFORE UPDATE ON ss_marketing_activities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
