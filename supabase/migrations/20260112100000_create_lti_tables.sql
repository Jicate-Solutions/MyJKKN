-- ============================================================================
-- LTI (Learning Tools Interoperability) Integration Tables
-- Purpose: External tool integration (MATLAB Grader, MATLAB Online)
-- Created: 2026-01-12
-- Migration: 20260112100000_create_lti_tables
-- ============================================================================

-- LTI Tool Registrations (MATLAB Grader, MATLAB Online, etc.)
CREATE TABLE IF NOT EXISTS lti_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tool_type TEXT NOT NULL CHECK (tool_type IN ('matlab_grader', 'matlab_online', 'matlab_academy', 'matlab_production_server')),

  -- LTI 1.3 Configuration
  client_id TEXT NOT NULL UNIQUE,
  deployment_id TEXT NOT NULL,
  platform_id TEXT DEFAULT 'https://myjkkn.jkkn.ac.in',

  -- Endpoints
  launch_url TEXT NOT NULL,
  public_keyset_url TEXT NOT NULL,
  oidc_auth_url TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,

  -- Tool Capabilities
  supports_deep_linking BOOLEAN DEFAULT false,
  supports_grade_passback BOOLEAN DEFAULT false,
  supports_names_roles BOOLEAN DEFAULT false,

  -- Status
  is_active BOOLEAN DEFAULT true,
  license_expiry_date DATE,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- LTI Launch Tracking (Every time a user launches MATLAB)
CREATE TABLE IF NOT EXISTS lti_launches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tool & User
  tool_id UUID NOT NULL REFERENCES lti_tools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  learner_profile_id UUID REFERENCES learners_profiles(id),

  -- Multi-Tenancy
  institution_id UUID NOT NULL REFERENCES institutions(id),

  -- Academic Context (Course/Class Context)
  program_id UUID REFERENCES programs(id),
  semester_id UUID REFERENCES semesters(id),
  section_id UUID REFERENCES sections(id),
  academic_year_id UUID REFERENCES academic_years(id),

  -- LTI Context Claims
  context_id TEXT, -- Generated: "{program_id}_{semester_id}_{section_id}"
  context_label TEXT, -- e.g., "CSE-S3-A"
  context_title TEXT, -- e.g., "Computer Science - Semester 3 - Section A"

  -- Resource Link (Specific Assignment)
  resource_link_id TEXT, -- Assignment ID from MATLAB
  resource_link_title TEXT, -- Assignment name
  resource_link_description TEXT,

  -- Launch Metadata
  launch_type TEXT CHECK (launch_type IN ('assignment', 'resource', 'deep_link', 'content_selection')),
  lti_message_type TEXT DEFAULT 'LtiResourceLinkRequest',
  lti_version TEXT DEFAULT '1.3.0',

  -- User Role Sent to MATLAB
  user_role_sent TEXT, -- LTI role URI
  myjkkn_role TEXT, -- MyJKKN role (student, faculty, etc.)

  -- Session Tracking
  launched_at TIMESTAMPTZ DEFAULT NOW(),
  session_duration_seconds INTEGER,
  ip_address INET,
  user_agent TEXT,

  -- JWT Details (for debugging)
  jwt_nonce TEXT UNIQUE,
  jwt_expires_at TIMESTAMPTZ,

  -- Audit
  created_by UUID REFERENCES auth.users(id)
);

-- LTI Grade Passback (MATLAB → MyJKKN Grade Sync)
CREATE TABLE IF NOT EXISTS lti_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to Launch
  launch_id UUID REFERENCES lti_launches(id),
  tool_id UUID NOT NULL REFERENCES lti_tools(id),

  -- User
  user_id UUID NOT NULL REFERENCES auth.users(id),
  learner_profile_id UUID NOT NULL REFERENCES learners_profiles(id),

  -- Multi-Tenancy
  institution_id UUID NOT NULL REFERENCES institutions(id),

  -- Resource Link (Assignment Identifier)
  resource_link_id TEXT NOT NULL,
  resource_link_title TEXT,

  -- Grade Data
  score DECIMAL(10,2) NOT NULL CHECK (score >= 0),
  score_maximum DECIMAL(10,2) NOT NULL CHECK (score_maximum > 0),
  score_percentage DECIMAL(5,2),

  -- LTI AGS (Assignment and Grade Services) Status
  activity_progress TEXT CHECK (activity_progress IN ('Initialized', 'Started', 'InProgress', 'Submitted', 'Completed')),
  grading_progress TEXT CHECK (grading_progress IN ('FullyGraded', 'Pending', 'PendingManual', 'Failed', 'NotReady')),

  -- Timestamps
  graded_at TIMESTAMPTZ, -- When MATLAB graded the assignment
  received_at TIMESTAMPTZ DEFAULT NOW(), -- When MyJKKN received the grade

  -- Sync to Gradebook (Future Feature)
  synced_to_gradebook BOOLEAN DEFAULT false,
  gradebook_entry_id UUID, -- Future: Link to gradebook table
  sync_error TEXT,
  synced_at TIMESTAMPTZ,

  -- Idempotency (Prevent Duplicate Grades)
  idempotency_key TEXT UNIQUE,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- LTI Tools
CREATE INDEX IF NOT EXISTS idx_lti_tools_active ON lti_tools(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_lti_tools_type ON lti_tools(tool_type);

-- LTI Launches
CREATE INDEX IF NOT EXISTS idx_lti_launches_user ON lti_launches(user_id);
CREATE INDEX IF NOT EXISTS idx_lti_launches_learner ON lti_launches(learner_profile_id);
CREATE INDEX IF NOT EXISTS idx_lti_launches_institution ON lti_launches(institution_id);
CREATE INDEX IF NOT EXISTS idx_lti_launches_context ON lti_launches(context_id);
CREATE INDEX IF NOT EXISTS idx_lti_launches_resource ON lti_launches(resource_link_id);
CREATE INDEX IF NOT EXISTS idx_lti_launches_created ON lti_launches(launched_at DESC);
CREATE INDEX IF NOT EXISTS idx_lti_launches_tool ON lti_launches(tool_id);
CREATE INDEX IF NOT EXISTS idx_lti_launches_nonce ON lti_launches(jwt_nonce) WHERE jwt_nonce IS NOT NULL;

-- LTI Grades
CREATE INDEX IF NOT EXISTS idx_lti_grades_user ON lti_grades(user_id);
CREATE INDEX IF NOT EXISTS idx_lti_grades_learner ON lti_grades(learner_profile_id);
CREATE INDEX IF NOT EXISTS idx_lti_grades_institution ON lti_grades(institution_id);
CREATE INDEX IF NOT EXISTS idx_lti_grades_resource ON lti_grades(resource_link_id);
CREATE INDEX IF NOT EXISTS idx_lti_grades_launch ON lti_grades(launch_id);
CREATE INDEX IF NOT EXISTS idx_lti_grades_unsynced ON lti_grades(synced_to_gradebook) WHERE synced_to_gradebook = false;
CREATE INDEX IF NOT EXISTS idx_lti_grades_received ON lti_grades(received_at DESC);

-- Composite Index for Roster Queries
CREATE INDEX IF NOT EXISTS idx_learners_active_roster ON learners_profiles(
  institution_id, program_id, semester_id, section_id, lifecycle_status
) WHERE lifecycle_status = 'active';

-- ============================================================================
-- Row-Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE lti_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE lti_launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE lti_grades ENABLE ROW LEVEL SECURITY;

-- LTI Tools: Admin-only management
CREATE POLICY "Admins manage LTI tools" ON lti_tools
  FOR ALL
  USING (
    auth.jwt()->>'role' IN ('super_admin', 'administrator')
  );

-- LTI Tools: All users can view active tools
CREATE POLICY "Users view active LTI tools" ON lti_tools
  FOR SELECT
  USING (is_active = true);

-- LTI Launches: Users see own launches + institution filtering
CREATE POLICY "Users see own launches" ON lti_launches
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR auth.jwt()->>'role' IN ('super_admin', 'administrator', 'faculty', 'hod', 'principal')
  );

-- LTI Launches: Institution-based access
CREATE POLICY "Institution-based launch access" ON lti_launches
  FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id
      FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );

-- LTI Grades: Users see own grades
CREATE POLICY "Users see own grades" ON lti_grades
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR auth.jwt()->>'role' IN ('super_admin', 'administrator', 'faculty', 'hod', 'principal')
  );

-- LTI Grades: Institution-based access
CREATE POLICY "Institution-based grade access" ON lti_grades
  FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id
      FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- Functions for Common Queries
-- ============================================================================

-- Get active roster for a context (used by LTI Names & Roles Service)
CREATE OR REPLACE FUNCTION get_lti_roster(
  p_institution_id UUID,
  p_program_id UUID,
  p_semester_id UUID,
  p_section_id UUID
)
RETURNS TABLE (
  user_id UUID,
  learner_profile_id UUID,
  full_name TEXT,
  email TEXT,
  role TEXT,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lp.user_id,
    lp.id AS learner_profile_id,
    CONCAT(lp.first_name, ' ', lp.last_name) AS full_name,
    lp.college_email AS email,
    'student' AS role,
    lp.lifecycle_status AS status
  FROM learners_profiles lp
  WHERE lp.institution_id = p_institution_id
    AND lp.program_id = p_program_id
    AND lp.semester_id = p_semester_id
    AND lp.section_id = p_section_id
    AND lp.lifecycle_status = 'active'
    AND lp.college_email IS NOT NULL
  ORDER BY lp.first_name, lp.last_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get launch analytics
CREATE OR REPLACE FUNCTION get_lti_launch_stats(
  p_institution_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  tool_name TEXT,
  total_launches BIGINT,
  unique_users BIGINT,
  student_launches BIGINT,
  faculty_launches BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lt.name AS tool_name,
    COUNT(ll.id) AS total_launches,
    COUNT(DISTINCT ll.user_id) AS unique_users,
    COUNT(*) FILTER (WHERE ll.myjkkn_role = 'student') AS student_launches,
    COUNT(*) FILTER (WHERE ll.myjkkn_role IN ('faculty', 'hod', 'principal')) AS faculty_launches
  FROM lti_launches ll
  JOIN lti_tools lt ON ll.tool_id = lt.id
  WHERE ll.institution_id = p_institution_id
    AND ll.launched_at BETWEEN p_start_date AND p_end_date
  GROUP BY lt.name
  ORDER BY total_launches DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Triggers for Auto-population
-- ============================================================================

-- Trigger function to auto-populate lti_grades fields
CREATE OR REPLACE FUNCTION populate_lti_grade_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Generate idempotency key
  NEW.idempotency_key := md5(
    COALESCE(NEW.resource_link_id, '') ||
    COALESCE(NEW.user_id::text, '') ||
    COALESCE(NEW.graded_at::text, NOW()::text)
  );

  -- Calculate score percentage
  IF NEW.score_maximum > 0 THEN
    NEW.score_percentage := ROUND((NEW.score / NEW.score_maximum) * 100, 2);
  ELSE
    NEW.score_percentage := 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to lti_grades table
CREATE TRIGGER trg_populate_lti_grade_fields
BEFORE INSERT OR UPDATE ON lti_grades
FOR EACH ROW
EXECUTE FUNCTION populate_lti_grade_fields();

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE lti_tools IS 'Registry of external LTI 1.3 tools (MATLAB Grader, MATLAB Online, etc.)';
COMMENT ON TABLE lti_launches IS 'Tracks every LTI tool launch with academic context and JWT details';
COMMENT ON TABLE lti_grades IS 'Stores grades passed back from LTI tools (MATLAB) to MyJKKN';

COMMENT ON COLUMN lti_launches.jwt_nonce IS 'One-time random string to prevent replay attacks';
COMMENT ON COLUMN lti_grades.idempotency_key IS 'Hash to prevent duplicate grade submissions (auto-generated on insert)';
COMMENT ON COLUMN lti_grades.score_percentage IS 'Auto-calculated percentage (score/max * 100)';
