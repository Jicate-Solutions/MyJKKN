-- Migration: Create Parent Portal Module Tables
-- Created: 2026-02-02
-- Purpose: Complete parent portal with OTP authentication, learner linking, and communications
-- Part of: TQM (Total Quality Management) Stakeholder Engagement System

-- =====================================================
-- ENUMS
-- =====================================================

-- Parent relationship type enum
DO $$ BEGIN
  CREATE TYPE parent_relationship AS ENUM ('father', 'mother', 'guardian', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Communication type enum
DO $$ BEGIN
  CREATE TYPE communication_type AS ENUM ('announcement', 'message', 'alert');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Communication priority enum
DO $$ BEGIN
  CREATE TYPE communication_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Parent activity type enum
DO $$ BEGIN
  CREATE TYPE parent_activity_type AS ENUM (
    'login',
    'view_dashboard',
    'view_attendance',
    'view_fees',
    'view_grades',
    'read_message',
    'submit_survey',
    'logout'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- OTP status enum
DO $$ BEGIN
  CREATE TYPE otp_status AS ENUM ('pending', 'verified', 'expired', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- TABLE: parent_profiles
-- Purpose: Store parent/guardian information linked to auth.users
-- =====================================================

CREATE TABLE IF NOT EXISTS parent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  -- Personal Information
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  relationship parent_relationship,
  avatar_url TEXT,

  -- Verification Status
  is_verified BOOLEAN DEFAULT FALSE NOT NULL,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Session Tracking
  last_login_at TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0 NOT NULL,

  -- Audit Fields
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Constraints
  CONSTRAINT unique_phone_per_institution UNIQUE (phone, institution_id),
  CONSTRAINT valid_phone_format CHECK (phone ~ '^\+?[0-9]{10,15}$')
);

-- Add comments
COMMENT ON TABLE parent_profiles IS 'Parent/guardian profiles for the parent portal';
COMMENT ON COLUMN parent_profiles.user_id IS 'Links to auth.users for OTP-authenticated parents';
COMMENT ON COLUMN parent_profiles.phone IS 'Primary phone number used for OTP authentication';
COMMENT ON COLUMN parent_profiles.is_verified IS 'Whether parent identity has been verified by institution';

-- =====================================================
-- TABLE: parent_learner_links
-- Purpose: Many-to-many relationship between parents and learners
-- =====================================================

CREATE TABLE IF NOT EXISTS parent_learner_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,

  -- Relationship Details
  relationship parent_relationship NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE NOT NULL,

  -- Verification (institution verifies parent-child relationship)
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verification_notes TEXT,

  -- Access Control
  can_view_grades BOOLEAN DEFAULT TRUE NOT NULL,
  can_view_attendance BOOLEAN DEFAULT TRUE NOT NULL,
  can_view_fees BOOLEAN DEFAULT TRUE NOT NULL,
  can_receive_notifications BOOLEAN DEFAULT TRUE NOT NULL,

  -- Audit Fields
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Constraints
  CONSTRAINT unique_parent_learner UNIQUE (parent_id, learner_id)
);

-- Add comments
COMMENT ON TABLE parent_learner_links IS 'Links parents to their children (learners) with verification';
COMMENT ON COLUMN parent_learner_links.is_primary IS 'Primary parent/guardian for this learner';
COMMENT ON COLUMN parent_learner_links.verified_at IS 'When institution verified this relationship';

-- =====================================================
-- TABLE: parent_communications
-- Purpose: Messages, announcements, and alerts to parents
-- =====================================================

CREATE TABLE IF NOT EXISTS parent_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  -- Recipients (null parent_id = broadcast to all parents)
  parent_id UUID REFERENCES parent_profiles(id) ON DELETE CASCADE,
  learner_id UUID REFERENCES learners_profiles(id) ON DELETE SET NULL,

  -- Message Content
  type communication_type NOT NULL DEFAULT 'message',
  priority communication_priority NOT NULL DEFAULT 'normal',
  subject VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,

  -- Sender Information
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role VARCHAR(50),

  -- Read Status
  read_at TIMESTAMPTZ,

  -- Delivery Tracking
  delivery_channels TEXT[] DEFAULT ARRAY['in_app']::TEXT[],
  sms_sent_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  push_sent_at TIMESTAMPTZ,

  -- Audit Fields
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Constraints
  CONSTRAINT valid_attachments_array CHECK (jsonb_typeof(attachments) = 'array')
);

-- Add comments
COMMENT ON TABLE parent_communications IS 'Communications sent to parents (messages, announcements, alerts)';
COMMENT ON COLUMN parent_communications.parent_id IS 'NULL for broadcast announcements to all parents';
COMMENT ON COLUMN parent_communications.attachments IS 'JSON array of {name, url, type, size}';

-- =====================================================
-- TABLE: parent_otp_tokens
-- Purpose: OTP tokens for passwordless parent authentication
-- =====================================================

CREATE TABLE IF NOT EXISTS parent_otp_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  -- OTP Details
  otp_code VARCHAR(6) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,

  -- Status Tracking
  status otp_status DEFAULT 'pending' NOT NULL,
  attempts INTEGER DEFAULT 0 NOT NULL,
  max_attempts INTEGER DEFAULT 3 NOT NULL,

  -- Timestamps
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Security
  ip_address INET,
  user_agent TEXT,

  -- Constraints
  CONSTRAINT valid_otp_format CHECK (otp_code ~ '^[0-9]{6}$'),
  CONSTRAINT max_attempts_check CHECK (attempts <= max_attempts + 1)
);

-- Add comments
COMMENT ON TABLE parent_otp_tokens IS 'OTP tokens for parent portal passwordless authentication';
COMMENT ON COLUMN parent_otp_tokens.otp_hash IS 'Hashed OTP for secure verification';
COMMENT ON COLUMN parent_otp_tokens.expires_at IS 'OTP expires after 10 minutes by default';

-- =====================================================
-- TABLE: parent_sessions
-- Purpose: Track active parent portal sessions
-- =====================================================

CREATE TABLE IF NOT EXISTS parent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,

  -- Session Details
  session_token VARCHAR(255) NOT NULL UNIQUE,
  device_fingerprint VARCHAR(255),
  device_name VARCHAR(255),

  -- Status
  is_active BOOLEAN DEFAULT TRUE NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  terminated_at TIMESTAMPTZ,
  termination_reason VARCHAR(100),

  -- Security
  ip_address INET,
  user_agent TEXT,

  -- Constraints
  CONSTRAINT session_not_expired CHECK (is_active = FALSE OR expires_at > NOW())
);

-- Add comments
COMMENT ON TABLE parent_sessions IS 'Active session tracking for parent portal';
COMMENT ON COLUMN parent_sessions.session_token IS 'Secure token stored in httpOnly cookie';
COMMENT ON COLUMN parent_sessions.device_fingerprint IS 'For detecting session hijacking';

-- =====================================================
-- TABLE: parent_activity_log
-- Purpose: Audit trail for parent portal actions
-- =====================================================

CREATE TABLE IF NOT EXISTS parent_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,

  -- Activity Details
  activity_type parent_activity_type NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Context
  session_id UUID REFERENCES parent_sessions(id) ON DELETE SET NULL,
  learner_id UUID REFERENCES learners_profiles(id) ON DELETE SET NULL,

  -- Security
  ip_address INET,
  user_agent TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add comments
COMMENT ON TABLE parent_activity_log IS 'Audit log of all parent portal activities';
COMMENT ON COLUMN parent_activity_log.metadata IS 'JSON object with activity-specific data';

-- =====================================================
-- INDEXES
-- =====================================================

-- parent_profiles indexes
CREATE INDEX IF NOT EXISTS idx_parent_profiles_user ON parent_profiles(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_profiles_institution ON parent_profiles(institution_id);
CREATE INDEX IF NOT EXISTS idx_parent_profiles_phone ON parent_profiles(phone);
CREATE INDEX IF NOT EXISTS idx_parent_profiles_verified ON parent_profiles(is_verified);
CREATE INDEX IF NOT EXISTS idx_parent_profiles_last_login ON parent_profiles(last_login_at DESC);

-- parent_learner_links indexes
CREATE INDEX IF NOT EXISTS idx_parent_learner_links_parent ON parent_learner_links(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_learner_links_learner ON parent_learner_links(learner_id);
CREATE INDEX IF NOT EXISTS idx_parent_learner_links_primary ON parent_learner_links(learner_id, is_primary) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS idx_parent_learner_links_verified ON parent_learner_links(verified_at) WHERE verified_at IS NOT NULL;

-- parent_communications indexes
CREATE INDEX IF NOT EXISTS idx_parent_comms_institution ON parent_communications(institution_id);
CREATE INDEX IF NOT EXISTS idx_parent_comms_parent ON parent_communications(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_comms_learner ON parent_communications(learner_id) WHERE learner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_comms_type ON parent_communications(type);
CREATE INDEX IF NOT EXISTS idx_parent_comms_priority ON parent_communications(priority);
CREATE INDEX IF NOT EXISTS idx_parent_comms_unread ON parent_communications(parent_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_parent_comms_created ON parent_communications(created_at DESC);

-- parent_otp_tokens indexes
CREATE INDEX IF NOT EXISTS idx_parent_otp_phone ON parent_otp_tokens(phone, institution_id);
CREATE INDEX IF NOT EXISTS idx_parent_otp_status ON parent_otp_tokens(status);
CREATE INDEX IF NOT EXISTS idx_parent_otp_expires ON parent_otp_tokens(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_parent_otp_cleanup ON parent_otp_tokens(created_at) WHERE status IN ('expired', 'failed');

-- parent_sessions indexes
CREATE INDEX IF NOT EXISTS idx_parent_sessions_parent ON parent_sessions(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_sessions_token ON parent_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_parent_sessions_active ON parent_sessions(parent_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_parent_sessions_expires ON parent_sessions(expires_at) WHERE is_active = TRUE;

-- parent_activity_log indexes
CREATE INDEX IF NOT EXISTS idx_parent_activity_parent ON parent_activity_log(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_activity_type ON parent_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_parent_activity_session ON parent_activity_log(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_activity_created ON parent_activity_log(created_at DESC);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE parent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_learner_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_otp_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_activity_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES: parent_profiles
-- =====================================================

-- Parents can view their own profile
CREATE POLICY "Parents can view own profile"
  ON parent_profiles FOR SELECT
  USING (user_id = auth.uid());

-- Parents can update their own profile
CREATE POLICY "Parents can update own profile"
  ON parent_profiles FOR UPDATE
  USING (user_id = auth.uid());

-- Staff can view parent profiles for their institution
CREATE POLICY "Staff can view parent profiles"
  ON parent_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND institution_id = parent_profiles.institution_id
      AND role IN ('super_admin', 'admin', 'staff', 'faculty', 'hod')
    )
  );

-- Staff can create parent profiles
CREATE POLICY "Staff can create parent profiles"
  ON parent_profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND institution_id = parent_profiles.institution_id
      AND role IN ('super_admin', 'admin', 'staff')
    )
  );

-- Staff can update parent profiles
CREATE POLICY "Staff can update parent profiles"
  ON parent_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND institution_id = parent_profiles.institution_id
      AND role IN ('super_admin', 'admin', 'staff')
    )
  );

-- =====================================================
-- RLS POLICIES: parent_learner_links
-- =====================================================

-- Parents can view their own links
CREATE POLICY "Parents can view own links"
  ON parent_learner_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parent_profiles
      WHERE id = parent_learner_links.parent_id
      AND user_id = auth.uid()
    )
  );

-- Staff can view all links for their institution
CREATE POLICY "Staff can view learner links"
  ON parent_learner_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parent_profiles pp
      JOIN public.profiles up ON up.institution_id = pp.institution_id
      WHERE pp.id = parent_learner_links.parent_id
      AND up.id = auth.uid()
      AND up.role IN ('super_admin', 'admin', 'staff', 'faculty', 'hod')
    )
  );

-- Staff can create/update links
CREATE POLICY "Staff can manage learner links"
  ON parent_learner_links FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM parent_profiles pp
      JOIN public.profiles up ON up.institution_id = pp.institution_id
      WHERE pp.id = parent_learner_links.parent_id
      AND up.id = auth.uid()
      AND up.role IN ('super_admin', 'admin', 'staff')
    )
  );

-- =====================================================
-- RLS POLICIES: parent_communications
-- =====================================================

-- Parents can view their own messages
CREATE POLICY "Parents can view own messages"
  ON parent_communications FOR SELECT
  USING (
    parent_id IN (
      SELECT id FROM parent_profiles WHERE user_id = auth.uid()
    )
    OR
    (parent_id IS NULL AND institution_id IN (
      SELECT pp.institution_id FROM parent_profiles pp WHERE pp.user_id = auth.uid()
    ))
  );

-- Parents can mark messages as read
CREATE POLICY "Parents can mark messages read"
  ON parent_communications FOR UPDATE
  USING (
    parent_id IN (
      SELECT id FROM parent_profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    -- Only allow updating read_at
    parent_id IN (
      SELECT id FROM parent_profiles WHERE user_id = auth.uid()
    )
  );

-- Staff can view all communications for their institution
CREATE POLICY "Staff can view all communications"
  ON parent_communications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND institution_id = parent_communications.institution_id
      AND role IN ('super_admin', 'admin', 'staff', 'faculty', 'hod')
    )
  );

-- Staff can create communications
CREATE POLICY "Staff can create communications"
  ON parent_communications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND institution_id = parent_communications.institution_id
      AND role IN ('super_admin', 'admin', 'staff', 'faculty', 'hod')
    )
  );

-- =====================================================
-- RLS POLICIES: parent_otp_tokens
-- =====================================================

-- OTP tokens are managed via service role only (security)
-- No direct user access to OTP tokens
CREATE POLICY "Service role manages OTP tokens"
  ON parent_otp_tokens FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- RLS POLICIES: parent_sessions
-- =====================================================

-- Parents can view their own sessions
CREATE POLICY "Parents can view own sessions"
  ON parent_sessions FOR SELECT
  USING (
    parent_id IN (
      SELECT id FROM parent_profiles WHERE user_id = auth.uid()
    )
  );

-- Service role manages sessions
CREATE POLICY "Service role manages sessions"
  ON parent_sessions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- RLS POLICIES: parent_activity_log
-- =====================================================

-- Parents can view their own activity
CREATE POLICY "Parents can view own activity"
  ON parent_activity_log FOR SELECT
  USING (
    parent_id IN (
      SELECT id FROM parent_profiles WHERE user_id = auth.uid()
    )
  );

-- Staff can view activity logs for their institution
CREATE POLICY "Staff can view activity logs"
  ON parent_activity_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parent_profiles pp
      JOIN public.profiles up ON up.institution_id = pp.institution_id
      WHERE pp.id = parent_activity_log.parent_id
      AND up.id = auth.uid()
      AND up.role IN ('super_admin', 'admin')
    )
  );

-- Service role can create activity logs
CREATE POLICY "Service role creates activity logs"
  ON parent_activity_log FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- FUNCTIONS: OTP Generation
-- =====================================================

-- Function to generate OTP and store it
CREATE OR REPLACE FUNCTION generate_parent_otp(
  p_phone VARCHAR(20),
  p_institution_id UUID,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  otp_code VARCHAR(6),
  expires_at TIMESTAMPTZ
) AS $$
DECLARE
  v_otp VARCHAR(6);
  v_otp_hash VARCHAR(255);
  v_expires_at TIMESTAMPTZ;
  v_existing_count INTEGER;
BEGIN
  -- Validate phone format
  IF p_phone !~ '^\+?[0-9]{10,15}$' THEN
    RETURN QUERY SELECT FALSE, 'Invalid phone number format', NULL::VARCHAR(6), NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Check rate limiting (max 5 OTPs per phone per hour)
  SELECT COUNT(*) INTO v_existing_count
  FROM parent_otp_tokens
  WHERE phone = p_phone
    AND institution_id = p_institution_id
    AND created_at > NOW() - INTERVAL '1 hour';

  IF v_existing_count >= 5 THEN
    RETURN QUERY SELECT FALSE, 'Too many OTP requests. Please try again later.', NULL::VARCHAR(6), NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Expire any existing pending OTPs for this phone
  UPDATE parent_otp_tokens
  SET status = 'expired'
  WHERE phone = p_phone
    AND institution_id = p_institution_id
    AND status = 'pending';

  -- Generate 6-digit OTP
  v_otp := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');

  -- Hash the OTP for storage (using pgcrypto)
  v_otp_hash := encode(digest(v_otp || p_phone, 'sha256'), 'hex');

  -- Set expiry (10 minutes)
  v_expires_at := NOW() + INTERVAL '10 minutes';

  -- Store the OTP
  INSERT INTO parent_otp_tokens (
    phone,
    institution_id,
    otp_code,
    otp_hash,
    expires_at,
    ip_address,
    user_agent
  ) VALUES (
    p_phone,
    p_institution_id,
    v_otp,
    v_otp_hash,
    v_expires_at,
    p_ip_address,
    p_user_agent
  );

  RETURN QUERY SELECT TRUE, 'OTP generated successfully', v_otp, v_expires_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION generate_parent_otp IS 'Generates a 6-digit OTP for parent authentication';

-- =====================================================
-- FUNCTIONS: OTP Verification
-- =====================================================

CREATE OR REPLACE FUNCTION verify_parent_otp(
  p_phone VARCHAR(20),
  p_otp VARCHAR(6),
  p_institution_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  parent_id UUID,
  user_id UUID,
  is_new_parent BOOLEAN
) AS $$
DECLARE
  v_token_record RECORD;
  v_parent RECORD;
  v_otp_hash VARCHAR(255);
BEGIN
  -- Hash the provided OTP for comparison
  v_otp_hash := encode(digest(p_otp || p_phone, 'sha256'), 'hex');

  -- Find the pending OTP token
  SELECT * INTO v_token_record
  FROM parent_otp_tokens
  WHERE phone = p_phone
    AND institution_id = p_institution_id
    AND status = 'pending'
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;

  -- Check if token exists
  IF v_token_record IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No valid OTP found or OTP expired', NULL::UUID, NULL::UUID, FALSE;
    RETURN;
  END IF;

  -- Check attempt limit
  IF v_token_record.attempts >= v_token_record.max_attempts THEN
    UPDATE parent_otp_tokens SET status = 'failed' WHERE id = v_token_record.id;
    RETURN QUERY SELECT FALSE, 'Maximum attempts exceeded', NULL::UUID, NULL::UUID, FALSE;
    RETURN;
  END IF;

  -- Increment attempt count
  UPDATE parent_otp_tokens SET attempts = attempts + 1 WHERE id = v_token_record.id;

  -- Verify OTP hash
  IF v_token_record.otp_hash != v_otp_hash THEN
    RETURN QUERY SELECT FALSE, 'Invalid OTP', NULL::UUID, NULL::UUID, FALSE;
    RETURN;
  END IF;

  -- Mark OTP as verified
  UPDATE parent_otp_tokens
  SET status = 'verified', verified_at = NOW()
  WHERE id = v_token_record.id;

  -- Find or create parent profile
  SELECT * INTO v_parent
  FROM parent_profiles
  WHERE phone = p_phone AND institution_id = p_institution_id
  LIMIT 1;

  IF v_parent IS NULL THEN
    -- Return success with is_new_parent = true (profile needs to be created)
    RETURN QUERY SELECT TRUE, 'OTP verified. Please complete registration.', NULL::UUID, NULL::UUID, TRUE;
  ELSE
    -- Update last login
    UPDATE parent_profiles
    SET last_login_at = NOW(), login_count = login_count + 1
    WHERE id = v_parent.id;

    RETURN QUERY SELECT TRUE, 'Login successful', v_parent.id, v_parent.user_id, FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION verify_parent_otp IS 'Verifies OTP and returns parent profile if exists';

-- =====================================================
-- FUNCTIONS: Send Parent OTP (wrapper for API)
-- =====================================================

CREATE OR REPLACE FUNCTION send_parent_otp(
  p_phone VARCHAR(20),
  p_institution_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM generate_parent_otp(p_phone, p_institution_id);

  -- NOTE: In production, integrate with SMS provider here
  -- For now, just return the result (OTP should be sent via external service)

  IF v_result.success THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'OTP sent to your phone',
      'expires_at', v_result.expires_at
      -- DO NOT return otp_code in production!
    );
  ELSE
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', v_result.message
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION send_parent_otp IS 'Generates and sends OTP to parent phone (integrate SMS provider)';

-- =====================================================
-- FUNCTIONS: Get Learner Data for Parent
-- =====================================================

-- Function to get learner attendance summary for parent
CREATE OR REPLACE FUNCTION get_learner_attendance_for_parent(
  p_learner_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
  v_attendance RECORD;
  v_daily_records JSONB;
BEGIN
  -- Get attendance summary
  SELECT
    COUNT(*) FILTER (WHERE status = 'present') as present_days,
    COUNT(*) FILTER (WHERE status = 'absent') as absent_days,
    COUNT(*) FILTER (WHERE status = 'late') as late_days,
    COUNT(*) FILTER (WHERE status = 'leave') as leave_days,
    COUNT(*) as total_days
  INTO v_attendance
  FROM daily_attendance
  WHERE learner_id = p_learner_id
    AND date >= CURRENT_DATE - p_days;

  -- Get daily records
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', date,
      'status', status
    ) ORDER BY date DESC
  )
  INTO v_daily_records
  FROM daily_attendance
  WHERE learner_id = p_learner_id
    AND date >= CURRENT_DATE - p_days;

  RETURN jsonb_build_object(
    'total_days', COALESCE(v_attendance.total_days, 0),
    'present_days', COALESCE(v_attendance.present_days, 0),
    'absent_days', COALESCE(v_attendance.absent_days, 0),
    'late_days', COALESCE(v_attendance.late_days, 0),
    'leave_days', COALESCE(v_attendance.leave_days, 0),
    'attendance_percentage', CASE
      WHEN COALESCE(v_attendance.total_days, 0) > 0
      THEN ROUND((v_attendance.present_days::DECIMAL / v_attendance.total_days::DECIMAL) * 100, 2)
      ELSE 0
    END,
    'last_30_days', COALESCE(v_daily_records, '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_learner_attendance_for_parent IS 'Returns attendance summary for a learner';

-- Function to get learner fee summary for parent
CREATE OR REPLACE FUNCTION get_learner_fees_for_parent(
  p_learner_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_fees RECORD;
  v_recent_payments JSONB;
BEGIN
  -- Get fee summary
  SELECT
    COALESCE(SUM(total_amount), 0) as total_billed,
    COALESCE(SUM(paid_amount), 0) as total_paid,
    COALESCE(SUM(balance_amount), 0) as total_pending,
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND balance_amount > 0 THEN balance_amount ELSE 0 END), 0) as total_overdue,
    MIN(CASE WHEN due_date >= CURRENT_DATE AND balance_amount > 0 THEN due_date END) as next_due_date,
    COALESCE(MIN(CASE WHEN due_date >= CURRENT_DATE AND balance_amount > 0 THEN balance_amount END), 0) as next_due_amount
  INTO v_fees
  FROM student_bills
  WHERE student_id = p_learner_id;

  -- Get recent payments
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'amount', r.amount,
      'date', r.payment_date,
      'receipt_number', r.receipt_number
    ) ORDER BY r.payment_date DESC
  )
  INTO v_recent_payments
  FROM (
    SELECT id, amount, payment_date, receipt_number
    FROM receipts
    WHERE student_id = p_learner_id
    ORDER BY payment_date DESC
    LIMIT 5
  ) r;

  RETURN jsonb_build_object(
    'total_billed', COALESCE(v_fees.total_billed, 0),
    'total_paid', COALESCE(v_fees.total_paid, 0),
    'total_pending', COALESCE(v_fees.total_pending, 0),
    'total_overdue', COALESCE(v_fees.total_overdue, 0),
    'next_due_date', v_fees.next_due_date,
    'next_due_amount', COALESCE(v_fees.next_due_amount, 0),
    'recent_payments', COALESCE(v_recent_payments, '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_learner_fees_for_parent IS 'Returns fee summary for a learner';

-- =====================================================
-- FUNCTIONS: Create Parent Session
-- =====================================================

CREATE OR REPLACE FUNCTION create_parent_session(
  p_parent_id UUID,
  p_device_fingerprint VARCHAR(255) DEFAULT NULL,
  p_device_name VARCHAR(255) DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (
  session_id UUID,
  session_token VARCHAR(255),
  expires_at TIMESTAMPTZ
) AS $$
DECLARE
  v_session_id UUID;
  v_session_token VARCHAR(255);
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Generate session token
  v_session_id := gen_random_uuid();
  v_session_token := encode(digest(v_session_id::text || NOW()::text || p_parent_id::text, 'sha256'), 'hex');
  v_expires_at := NOW() + INTERVAL '30 days';

  -- Terminate any existing active sessions for same device (if fingerprint provided)
  IF p_device_fingerprint IS NOT NULL THEN
    UPDATE parent_sessions
    SET is_active = FALSE,
        terminated_at = NOW(),
        termination_reason = 'new_session_same_device'
    WHERE parent_id = p_parent_id
      AND device_fingerprint = p_device_fingerprint
      AND is_active = TRUE;
  END IF;

  -- Create new session
  INSERT INTO parent_sessions (
    id,
    parent_id,
    session_token,
    device_fingerprint,
    device_name,
    expires_at,
    ip_address,
    user_agent
  ) VALUES (
    v_session_id,
    p_parent_id,
    v_session_token,
    p_device_fingerprint,
    p_device_name,
    v_expires_at,
    p_ip_address,
    p_user_agent
  );

  RETURN QUERY SELECT v_session_id, v_session_token, v_expires_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_parent_session IS 'Creates a new session for authenticated parent';

-- =====================================================
-- FUNCTIONS: Validate Parent Session
-- =====================================================

CREATE OR REPLACE FUNCTION validate_parent_session(
  p_session_token VARCHAR(255)
)
RETURNS TABLE (
  valid BOOLEAN,
  parent_id UUID,
  session_id UUID,
  parent_name VARCHAR(255),
  institution_id UUID
) AS $$
DECLARE
  v_session RECORD;
  v_parent RECORD;
BEGIN
  -- Find active session
  SELECT * INTO v_session
  FROM parent_sessions
  WHERE session_token = p_session_token
    AND is_active = TRUE
    AND expires_at > NOW();

  IF v_session IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::VARCHAR(255), NULL::UUID;
    RETURN;
  END IF;

  -- Get parent details
  SELECT * INTO v_parent
  FROM parent_profiles
  WHERE id = v_session.parent_id;

  -- Update last activity
  UPDATE parent_sessions
  SET last_activity_at = NOW()
  WHERE id = v_session.id;

  RETURN QUERY SELECT TRUE, v_parent.id, v_session.id, v_parent.name, v_parent.institution_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION validate_parent_session IS 'Validates session token and returns parent info';

-- =====================================================
-- FUNCTIONS: Terminate Parent Session
-- =====================================================

CREATE OR REPLACE FUNCTION terminate_parent_session(
  p_session_token VARCHAR(255),
  p_reason VARCHAR(100) DEFAULT 'logout'
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE parent_sessions
  SET is_active = FALSE,
      terminated_at = NOW(),
      termination_reason = p_reason
  WHERE session_token = p_session_token
    AND is_active = TRUE;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION terminate_parent_session IS 'Terminates a parent session (logout)';

-- =====================================================
-- TRIGGERS: Updated At
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_update_parent_portal_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_parent_profiles_updated_at ON parent_profiles;
CREATE TRIGGER trg_parent_profiles_updated_at
  BEFORE UPDATE ON parent_profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_parent_portal_timestamp();

DROP TRIGGER IF EXISTS trg_parent_learner_links_updated_at ON parent_learner_links;
CREATE TRIGGER trg_parent_learner_links_updated_at
  BEFORE UPDATE ON parent_learner_links
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_parent_portal_timestamp();

DROP TRIGGER IF EXISTS trg_parent_comms_updated_at ON parent_communications;
CREATE TRIGGER trg_parent_comms_updated_at
  BEFORE UPDATE ON parent_communications
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_parent_portal_timestamp();

-- =====================================================
-- TRIGGERS: Enforce Primary Link Uniqueness
-- =====================================================

CREATE OR REPLACE FUNCTION enforce_single_primary_parent()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting a link as primary, unset any existing primary
  IF NEW.is_primary = TRUE THEN
    UPDATE parent_learner_links
    SET is_primary = FALSE
    WHERE learner_id = NEW.learner_id
      AND id != NEW.id
      AND is_primary = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_primary_parent ON parent_learner_links;
CREATE TRIGGER trg_enforce_primary_parent
  BEFORE INSERT OR UPDATE ON parent_learner_links
  FOR EACH ROW
  WHEN (NEW.is_primary = TRUE)
  EXECUTE FUNCTION enforce_single_primary_parent();

-- =====================================================
-- CLEANUP: Expired OTP Tokens (Scheduled Job)
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_expired_otp_tokens()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Mark expired tokens
  UPDATE parent_otp_tokens
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();

  -- Delete old tokens (older than 24 hours)
  DELETE FROM parent_otp_tokens
  WHERE created_at < NOW() - INTERVAL '24 hours'
    AND status IN ('expired', 'failed', 'verified');

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_expired_otp_tokens IS 'Cleans up expired and old OTP tokens';

-- =====================================================
-- GRANTS
-- =====================================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION generate_parent_otp(VARCHAR, UUID, INET, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION verify_parent_otp(VARCHAR, VARCHAR, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION send_parent_otp(VARCHAR, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_learner_attendance_for_parent(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_learner_fees_for_parent(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_parent_session(UUID, VARCHAR, VARCHAR, INET, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION validate_parent_session(VARCHAR) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION terminate_parent_session(VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_otp_tokens() TO service_role;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE parent_profiles IS 'Parent/guardian profiles for the Parent Portal module';
COMMENT ON TABLE parent_learner_links IS 'Many-to-many links between parents and their children (learners)';
COMMENT ON TABLE parent_communications IS 'Messages, announcements, and alerts sent to parents';
COMMENT ON TABLE parent_otp_tokens IS 'OTP tokens for passwordless parent authentication';
COMMENT ON TABLE parent_sessions IS 'Active session tracking for parent portal logins';
COMMENT ON TABLE parent_activity_log IS 'Audit trail of all parent portal activities';
