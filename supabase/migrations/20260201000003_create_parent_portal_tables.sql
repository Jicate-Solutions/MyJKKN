-- Migration: Create Parent Portal Tables
-- Purpose: Parent authentication, multi-learner dashboard, communication center
-- Created: 2026-02-01

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE parent_relationship AS ENUM ('father', 'mother', 'guardian', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE communication_type AS ENUM ('announcement', 'message', 'alert');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE communication_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE parent_activity_type AS ENUM (
    'login', 'view_dashboard', 'view_attendance', 'view_fees',
    'view_grades', 'read_message', 'submit_survey', 'logout'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- TABLE: parent_profiles
-- ============================================================================

CREATE TABLE IF NOT EXISTS parent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  relationship parent_relationship,
  avatar_url TEXT,
  is_verified BOOLEAN DEFAULT false,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_parent_user_institution UNIQUE(user_id, institution_id)
);

COMMENT ON TABLE parent_profiles IS 'Parent user profiles for parent portal access';
COMMENT ON COLUMN parent_profiles.is_verified IS 'Whether parent identity has been verified by institution';

-- ============================================================================
-- TABLE: parent_learner_links
-- ============================================================================

CREATE TABLE IF NOT EXISTS parent_learner_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  relationship parent_relationship NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_parent_learner UNIQUE(parent_id, learner_id)
);

COMMENT ON TABLE parent_learner_links IS 'Links parents to their learners (children/wards)';
COMMENT ON COLUMN parent_learner_links.is_primary IS 'Primary parent for communications and billing';

-- ============================================================================
-- TABLE: parent_communications
-- ============================================================================

CREATE TABLE IF NOT EXISTS parent_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES parent_profiles(id) ON DELETE CASCADE,
  learner_id UUID REFERENCES learners_profiles(id) ON DELETE SET NULL,
  type communication_type NOT NULL,
  subject VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  priority communication_priority DEFAULT 'normal',
  read_at TIMESTAMPTZ,
  sender_id UUID REFERENCES users_profiles(id),
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE parent_communications IS 'Communications to parents (announcements, messages, alerts)';
COMMENT ON COLUMN parent_communications.attachments IS 'Array of {name, url, type, size} objects';

-- ============================================================================
-- TABLE: parent_activity_log
-- ============================================================================

CREATE TABLE IF NOT EXISTS parent_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  activity_type parent_activity_type NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE parent_activity_log IS 'Audit log of parent activities in the portal';

-- ============================================================================
-- TABLE: parent_otp_requests
-- ============================================================================

CREATE TABLE IF NOT EXISTS parent_otp_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  institution_id UUID NOT NULL REFERENCES institutions(id),
  otp_code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE parent_otp_requests IS 'OTP codes for parent phone verification';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- parent_profiles indexes
CREATE INDEX IF NOT EXISTS idx_parent_profiles_user ON parent_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_parent_profiles_institution ON parent_profiles(institution_id);
CREATE INDEX IF NOT EXISTS idx_parent_profiles_phone ON parent_profiles(phone);
CREATE INDEX IF NOT EXISTS idx_parent_profiles_email ON parent_profiles(email);

-- parent_learner_links indexes
CREATE INDEX IF NOT EXISTS idx_parent_learner_links_parent ON parent_learner_links(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_learner_links_learner ON parent_learner_links(learner_id);
CREATE INDEX IF NOT EXISTS idx_parent_learner_links_primary ON parent_learner_links(learner_id, is_primary) WHERE is_primary = true;

-- parent_communications indexes
CREATE INDEX IF NOT EXISTS idx_parent_communications_parent ON parent_communications(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_communications_institution ON parent_communications(institution_id);
CREATE INDEX IF NOT EXISTS idx_parent_communications_unread ON parent_communications(parent_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_parent_communications_created ON parent_communications(created_at DESC);

-- parent_activity_log indexes
CREATE INDEX IF NOT EXISTS idx_parent_activity_log_parent ON parent_activity_log(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_activity_log_type ON parent_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_parent_activity_log_created ON parent_activity_log(created_at DESC);

-- parent_otp_requests indexes
CREATE INDEX IF NOT EXISTS idx_parent_otp_phone ON parent_otp_requests(phone, institution_id);
CREATE INDEX IF NOT EXISTS idx_parent_otp_expires ON parent_otp_requests(expires_at);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Updated at trigger for parent_profiles
CREATE OR REPLACE FUNCTION update_parent_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_parent_profile_updated_at ON parent_profiles;
CREATE TRIGGER trigger_update_parent_profile_updated_at
  BEFORE UPDATE ON parent_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_parent_profile_updated_at();

-- Ensure only one primary parent per learner
CREATE OR REPLACE FUNCTION ensure_single_primary_parent()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE parent_learner_links
    SET is_primary = false
    WHERE learner_id = NEW.learner_id
      AND id != NEW.id
      AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ensure_single_primary_parent ON parent_learner_links;
CREATE TRIGGER trigger_ensure_single_primary_parent
  BEFORE INSERT OR UPDATE ON parent_learner_links
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION ensure_single_primary_parent();

-- Auto-cleanup expired OTPs
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM parent_otp_requests
  WHERE expires_at < NOW() - INTERVAL '1 hour';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cleanup_expired_otps ON parent_otp_requests;
CREATE TRIGGER trigger_cleanup_expired_otps
  AFTER INSERT ON parent_otp_requests
  FOR EACH STATEMENT
  EXECUTE FUNCTION cleanup_expired_otps();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE parent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_learner_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_otp_requests ENABLE ROW LEVEL SECURITY;

-- parent_profiles policies
CREATE POLICY "Parents can view own profile"
  ON parent_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Parents can update own profile"
  ON parent_profiles FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Institution staff can view parent profiles"
  ON parent_profiles FOR SELECT
  USING (institution_id IN (
    SELECT institution_id FROM users_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Institution staff can manage parent profiles"
  ON parent_profiles FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM users_profiles WHERE id = auth.uid()
  ));

-- parent_learner_links policies
CREATE POLICY "Parents can view own learner links"
  ON parent_learner_links FOR SELECT
  USING (parent_id IN (
    SELECT id FROM parent_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Institution staff can manage learner links"
  ON parent_learner_links FOR ALL
  USING (parent_id IN (
    SELECT id FROM parent_profiles WHERE institution_id IN (
      SELECT institution_id FROM users_profiles WHERE id = auth.uid()
    )
  ));

-- parent_communications policies
CREATE POLICY "Parents can view own communications"
  ON parent_communications FOR SELECT
  USING (parent_id IN (
    SELECT id FROM parent_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Parents can update read status"
  ON parent_communications FOR UPDATE
  USING (parent_id IN (
    SELECT id FROM parent_profiles WHERE user_id = auth.uid()
  ))
  WITH CHECK (parent_id IN (
    SELECT id FROM parent_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Institution staff can manage communications"
  ON parent_communications FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM users_profiles WHERE id = auth.uid()
  ));

-- parent_activity_log policies
CREATE POLICY "Parents can view own activity log"
  ON parent_activity_log FOR SELECT
  USING (parent_id IN (
    SELECT id FROM parent_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Parents can insert own activity"
  ON parent_activity_log FOR INSERT
  WITH CHECK (parent_id IN (
    SELECT id FROM parent_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Institution staff can view activity logs"
  ON parent_activity_log FOR SELECT
  USING (parent_id IN (
    SELECT id FROM parent_profiles WHERE institution_id IN (
      SELECT institution_id FROM users_profiles WHERE id = auth.uid()
    )
  ));

-- parent_otp_requests policies (accessible only by service role)
CREATE POLICY "Service role can manage OTP requests"
  ON parent_otp_requests FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: Get parent dashboard data
CREATE OR REPLACE FUNCTION get_parent_dashboard(p_parent_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_parent parent_profiles%ROWTYPE;
  v_learners JSONB;
  v_unread_count INTEGER;
  v_pending_surveys JSONB;
BEGIN
  -- Get parent profile
  SELECT * INTO v_parent FROM parent_profiles WHERE id = p_parent_id;

  IF v_parent IS NULL THEN
    RETURN jsonb_build_object('error', 'Parent not found');
  END IF;

  -- Get linked learners with summaries
  SELECT jsonb_agg(
    jsonb_build_object(
      'learner', jsonb_build_object(
        'id', lp.id,
        'name', lp.name,
        'enrollment_number', lp.enrollment_number,
        'photo_url', lp.photo_url,
        'program', jsonb_build_object('id', p.id, 'name', p.name),
        'section', jsonb_build_object('id', s.id, 'name', s.name)
      ),
      'link', jsonb_build_object(
        'id', pll.id,
        'relationship', pll.relationship,
        'is_primary', pll.is_primary,
        'verified_at', pll.verified_at
      )
    )
  ) INTO v_learners
  FROM parent_learner_links pll
  JOIN learners_profiles lp ON lp.id = pll.learner_id
  LEFT JOIN programs p ON p.id = lp.program_id
  LEFT JOIN sections s ON s.id = lp.section_id
  WHERE pll.parent_id = p_parent_id;

  -- Get unread message count
  SELECT COUNT(*) INTO v_unread_count
  FROM parent_communications
  WHERE parent_id = p_parent_id AND read_at IS NULL;

  -- Get pending surveys
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', ns.id,
      'title', ns.title,
      'description', ns.description,
      'end_date', ns.end_date
    )
  ) INTO v_pending_surveys
  FROM nps_surveys ns
  WHERE ns.institution_id = v_parent.institution_id
    AND ns.stakeholder_type = 'parent'
    AND ns.status = 'active'
    AND ns.end_date > NOW()
    AND NOT EXISTS (
      SELECT 1 FROM nps_responses nr
      WHERE nr.survey_id = ns.id
        AND nr.respondent_id = p_parent_id
    );

  -- Build result
  v_result := jsonb_build_object(
    'parent', to_jsonb(v_parent),
    'learners', COALESCE(v_learners, '[]'::jsonb),
    'unread_messages', v_unread_count,
    'pending_surveys', COALESCE(v_pending_surveys, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

-- Function: Get learner attendance summary for parent
CREATE OR REPLACE FUNCTION get_learner_attendance_for_parent(
  p_learner_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_total_days INTEGER;
  v_present_days INTEGER;
  v_absent_days INTEGER;
  v_late_days INTEGER;
  v_leave_days INTEGER;
  v_daily_records JSONB;
BEGIN
  -- Get attendance counts
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'present'),
    COUNT(*) FILTER (WHERE status = 'absent'),
    COUNT(*) FILTER (WHERE status = 'late'),
    COUNT(*) FILTER (WHERE status = 'leave')
  INTO v_total_days, v_present_days, v_absent_days, v_late_days, v_leave_days
  FROM daily_attendance
  WHERE learner_id = p_learner_id
    AND date >= CURRENT_DATE - p_days;

  -- Get daily records
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', date,
      'status', status
    ) ORDER BY date DESC
  ) INTO v_daily_records
  FROM daily_attendance
  WHERE learner_id = p_learner_id
    AND date >= CURRENT_DATE - p_days;

  v_result := jsonb_build_object(
    'total_days', COALESCE(v_total_days, 0),
    'present_days', COALESCE(v_present_days, 0),
    'absent_days', COALESCE(v_absent_days, 0),
    'late_days', COALESCE(v_late_days, 0),
    'leave_days', COALESCE(v_leave_days, 0),
    'attendance_percentage', CASE
      WHEN COALESCE(v_total_days, 0) = 0 THEN 0
      ELSE ROUND((COALESCE(v_present_days, 0)::DECIMAL / v_total_days) * 100, 1)
    END,
    'last_30_days', COALESCE(v_daily_records, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

-- Function: Get learner fee summary for parent
CREATE OR REPLACE FUNCTION get_learner_fees_for_parent(p_learner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_total_billed DECIMAL;
  v_total_paid DECIMAL;
  v_total_pending DECIMAL;
  v_total_overdue DECIMAL;
  v_next_due_date DATE;
  v_next_due_amount DECIMAL;
  v_recent_payments JSONB;
BEGIN
  -- Get billing totals
  SELECT
    COALESCE(SUM(total_amount), 0),
    COALESCE(SUM(paid_amount), 0),
    COALESCE(SUM(bill_balance), 0),
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND bill_balance > 0 THEN bill_balance ELSE 0 END), 0)
  INTO v_total_billed, v_total_paid, v_total_pending, v_total_overdue
  FROM billing_bills
  WHERE student_id = p_learner_id;

  -- Get next due bill
  SELECT due_date, bill_balance INTO v_next_due_date, v_next_due_amount
  FROM billing_bills
  WHERE student_id = p_learner_id
    AND bill_balance > 0
    AND due_date >= CURRENT_DATE
  ORDER BY due_date
  LIMIT 1;

  -- Get recent payments
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', br.id,
      'amount', br.amount,
      'date', br.receipt_date,
      'receipt_number', br.receipt_number
    ) ORDER BY br.receipt_date DESC
  ) INTO v_recent_payments
  FROM billing_receipts br
  WHERE br.student_id = p_learner_id
  LIMIT 5;

  v_result := jsonb_build_object(
    'total_billed', v_total_billed,
    'total_paid', v_total_paid,
    'total_pending', v_total_pending,
    'total_overdue', v_total_overdue,
    'next_due_date', v_next_due_date,
    'next_due_amount', COALESCE(v_next_due_amount, 0),
    'recent_payments', COALESCE(v_recent_payments, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

-- Function: Send OTP to parent phone
CREATE OR REPLACE FUNCTION send_parent_otp(
  p_phone VARCHAR(20),
  p_institution_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_otp VARCHAR(6);
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Generate 6-digit OTP
  v_otp := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
  v_expires_at := NOW() + INTERVAL '10 minutes';

  -- Insert OTP request
  INSERT INTO parent_otp_requests (phone, institution_id, otp_code, expires_at)
  VALUES (p_phone, p_institution_id, v_otp, v_expires_at);

  -- Note: Actual SMS sending should be handled by application layer
  -- This function just stores the OTP

  RETURN jsonb_build_object(
    'success', true,
    'message', 'OTP sent successfully',
    'expires_at', v_expires_at
  );
END;
$$;

-- Function: Verify parent OTP
CREATE OR REPLACE FUNCTION verify_parent_otp(
  p_phone VARCHAR(20),
  p_otp VARCHAR(6),
  p_institution_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_otp_record parent_otp_requests%ROWTYPE;
  v_parent parent_profiles%ROWTYPE;
BEGIN
  -- Find valid OTP
  SELECT * INTO v_otp_record
  FROM parent_otp_requests
  WHERE phone = p_phone
    AND institution_id = p_institution_id
    AND otp_code = p_otp
    AND expires_at > NOW()
    AND verified_at IS NULL
    AND attempts < 3
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_otp_record IS NULL THEN
    -- Increment attempts for existing requests
    UPDATE parent_otp_requests
    SET attempts = attempts + 1
    WHERE phone = p_phone
      AND institution_id = p_institution_id
      AND verified_at IS NULL;

    RETURN jsonb_build_object(
      'success', false,
      'message', 'Invalid or expired OTP'
    );
  END IF;

  -- Mark OTP as verified
  UPDATE parent_otp_requests
  SET verified_at = NOW()
  WHERE id = v_otp_record.id;

  -- Find parent profile
  SELECT * INTO v_parent
  FROM parent_profiles
  WHERE phone = p_phone
    AND institution_id = p_institution_id;

  IF v_parent IS NOT NULL THEN
    -- Update last login
    UPDATE parent_profiles
    SET last_login_at = NOW()
    WHERE id = v_parent.id;

    RETURN jsonb_build_object(
      'success', true,
      'parent_id', v_parent.id,
      'is_new', false,
      'message', 'Login successful'
    );
  ELSE
    RETURN jsonb_build_object(
      'success', true,
      'parent_id', NULL,
      'is_new', true,
      'message', 'OTP verified, please complete registration'
    );
  END IF;
END;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON parent_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON parent_learner_links TO authenticated;
GRANT SELECT, INSERT, UPDATE ON parent_communications TO authenticated;
GRANT SELECT, INSERT ON parent_activity_log TO authenticated;
GRANT ALL ON parent_otp_requests TO service_role;

GRANT EXECUTE ON FUNCTION get_parent_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION get_learner_attendance_for_parent TO authenticated;
GRANT EXECUTE ON FUNCTION get_learner_fees_for_parent TO authenticated;
GRANT EXECUTE ON FUNCTION send_parent_otp TO authenticated;
GRANT EXECUTE ON FUNCTION verify_parent_otp TO authenticated;
