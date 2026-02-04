-- VAC Enrollments Migration
-- Created: 2026-02-04
-- Purpose: Add enrollment tracking for VAC courses

-- ============================================
-- Table: vac_enrollments
-- Tracks student enrollments in VAC courses
-- ============================================
CREATE TABLE IF NOT EXISTS vac_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,                       -- References auth.users or profiles
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'active',         -- 'active', 'completed', 'cancelled', 'expired'
  payment_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'paid', 'waived', 'refunded'
  payment_amount DECIMAL(10, 2),               -- Amount paid (if applicable)
  payment_date TIMESTAMPTZ,                    -- When payment was made
  payment_reference VARCHAR(100),              -- Transaction/receipt reference
  completed_at TIMESTAMPTZ,                    -- When course was completed
  expires_at TIMESTAMPTZ,                      -- Enrollment expiry (optional)
  notes TEXT,                                  -- Admin notes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One enrollment per user per course
  UNIQUE(user_id, course_id),

  -- Constraints for valid values
  CONSTRAINT vac_enrollment_status_check CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
  CONSTRAINT vac_payment_status_check CHECK (payment_status IN ('pending', 'paid', 'waived', 'refunded'))
);

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_vac_enrollments_user ON vac_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_vac_enrollments_course ON vac_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_vac_enrollments_status ON vac_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_vac_enrollments_payment ON vac_enrollments(payment_status);
CREATE INDEX IF NOT EXISTS idx_vac_enrollments_enrolled_at ON vac_enrollments(enrolled_at DESC);

-- ============================================
-- Trigger for updated_at
-- ============================================
CREATE TRIGGER update_vac_enrollments_updated_at
  BEFORE UPDATE ON vac_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Row Level Security (RLS) Policies
-- ============================================

-- Enable RLS
ALTER TABLE vac_enrollments ENABLE ROW LEVEL SECURITY;

-- Users can view their own enrollments
CREATE POLICY "vac_enrollments_select_own"
  ON vac_enrollments FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own enrollments
CREATE POLICY "vac_enrollments_insert_own"
  ON vac_enrollments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own enrollments (limited to cancellation)
CREATE POLICY "vac_enrollments_update_own"
  ON vac_enrollments FOR UPDATE
  USING (auth.uid() = user_id);

-- Authenticated users with admin roles can manage all enrollments
CREATE POLICY "vac_enrollments_all_authenticated"
  ON vac_enrollments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin', 'accounts')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin', 'accounts')
    )
  );

-- ============================================
-- View: vac_enrollments_with_details
-- Joins enrollment with course and user info
-- ============================================
CREATE OR REPLACE VIEW vac_enrollments_with_details AS
SELECT
  e.id,
  e.user_id,
  e.course_id,
  e.enrolled_at,
  e.status,
  e.payment_status,
  e.payment_amount,
  e.payment_date,
  e.payment_reference,
  e.completed_at,
  e.expires_at,
  e.created_at,
  e.updated_at,
  c.code AS course_code,
  c.name AS course_name,
  c.institution AS course_institution,
  c.track AS course_track,
  c.duration_hours AS course_duration,
  c.fee AS course_fee,
  p.full_name AS user_name,
  p.email AS user_email
FROM vac_enrollments e
JOIN vac_courses c ON e.course_id = c.id
LEFT JOIN profiles p ON e.user_id = p.id;

-- ============================================
-- Function: Check if user is enrolled
-- ============================================
CREATE OR REPLACE FUNCTION is_enrolled_in_vac_course(p_user_id UUID, p_course_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM vac_enrollments
    WHERE user_id = p_user_id
    AND course_id = p_course_id
    AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function: Get enrollment stats for a course
-- ============================================
CREATE OR REPLACE FUNCTION get_vac_course_enrollment_stats(p_course_id UUID)
RETURNS TABLE (
  total_enrollments BIGINT,
  active_enrollments BIGINT,
  completed_enrollments BIGINT,
  paid_enrollments BIGINT,
  total_revenue DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_enrollments,
    COUNT(*) FILTER (WHERE status = 'active')::BIGINT AS active_enrollments,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed_enrollments,
    COUNT(*) FILTER (WHERE payment_status = 'paid')::BIGINT AS paid_enrollments,
    COALESCE(SUM(payment_amount) FILTER (WHERE payment_status = 'paid'), 0)::DECIMAL AS total_revenue
  FROM vac_enrollments
  WHERE course_id = p_course_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON TABLE vac_enrollments IS 'Student enrollments in Value-Added Courses';
COMMENT ON VIEW vac_enrollments_with_details IS 'Enrollments with course and user details joined';
COMMENT ON FUNCTION is_enrolled_in_vac_course IS 'Check if a user has active enrollment in a VAC course';
COMMENT ON FUNCTION get_vac_course_enrollment_stats IS 'Get enrollment statistics for a VAC course';
