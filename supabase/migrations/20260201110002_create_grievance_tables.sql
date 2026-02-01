-- Migration: F004 Grievance Ticketing System
-- Date: 2026-02-01
-- Description: Creates tables for grievance ticketing with 48-hour SLA tracking

-- ============================================================================
-- SEQUENCE FOR TICKET NUMBERS
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS grievance_ticket_seq START 1;

-- ============================================================================
-- TABLE: grievance_categories
-- ============================================================================

CREATE TABLE IF NOT EXISTS grievance_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES grievance_categories(id) ON DELETE SET NULL,
  default_sla_hours INTEGER DEFAULT 48,
  default_assignee_role VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT grievance_categories_name_check CHECK (char_length(name) >= 1),
  CONSTRAINT grievance_categories_sla_check CHECK (default_sla_hours > 0)
);

-- Unique constraint for category name per institution (within same parent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_grievance_categories_unique_name
  ON grievance_categories (institution_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::UUID), LOWER(name));

-- ============================================================================
-- TABLE: grievance_tickets
-- ============================================================================

CREATE TABLE IF NOT EXISTS grievance_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  ticket_number VARCHAR(20) NOT NULL UNIQUE,
  category_id UUID NOT NULL REFERENCES grievance_categories(id) ON DELETE RESTRICT,
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'pending_info', 'resolved', 'closed', 'reopened')),

  -- Stakeholder info
  raised_by_type VARCHAR(50) NOT NULL CHECK (raised_by_type IN ('learner', 'parent', 'staff', 'alumni')),
  raised_by_id UUID,
  raised_by_name VARCHAR(255) NOT NULL,
  raised_by_email VARCHAR(255),
  raised_by_phone VARCHAR(20),

  -- Assignment
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,

  -- SLA tracking
  sla_hours INTEGER NOT NULL,
  sla_deadline TIMESTAMPTZ NOT NULL,
  sla_status VARCHAR(20) DEFAULT 'on_track' CHECK (sla_status IN ('on_track', 'at_risk', 'breached')),

  -- Resolution
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  satisfaction_rating INTEGER CHECK (satisfaction_rating IS NULL OR (satisfaction_rating >= 1 AND satisfaction_rating <= 5)),
  satisfaction_feedback TEXT,

  -- Metadata
  attachments JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT grievance_tickets_subject_check CHECK (char_length(subject) >= 3),
  CONSTRAINT grievance_tickets_description_check CHECK (char_length(description) >= 10)
);

-- ============================================================================
-- TABLE: grievance_comments
-- ============================================================================

CREATE TABLE IF NOT EXISTS grievance_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES grievance_tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name VARCHAR(255) NOT NULL,
  author_type VARCHAR(50) NOT NULL CHECK (author_type IN ('staff', 'learner', 'parent', 'system')),
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT grievance_comments_content_check CHECK (char_length(content) >= 1)
);

-- ============================================================================
-- TABLE: grievance_history
-- ============================================================================

CREATE TABLE IF NOT EXISTS grievance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES grievance_tickets(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- FUNCTION: Generate Ticket Number (GRV-YYYYMMDD-XXXX)
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_grievance_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.ticket_number := 'GRV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
    LPAD(NEXTVAL('grievance_ticket_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-generating ticket number
DROP TRIGGER IF EXISTS set_grievance_ticket_number ON grievance_tickets;
CREATE TRIGGER set_grievance_ticket_number
  BEFORE INSERT ON grievance_tickets
  FOR EACH ROW
  EXECUTE FUNCTION generate_grievance_ticket_number();

-- ============================================================================
-- FUNCTION: Update SLA Status
-- ============================================================================

CREATE OR REPLACE FUNCTION update_grievance_sla_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update SLA status for non-resolved/closed tickets
  IF NEW.status NOT IN ('resolved', 'closed') THEN
    IF NOW() > NEW.sla_deadline THEN
      NEW.sla_status := 'breached';
    ELSIF NOW() > NEW.sla_deadline - INTERVAL '4 hours' THEN
      NEW.sla_status := 'at_risk';
    ELSE
      NEW.sla_status := 'on_track';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for SLA status updates
DROP TRIGGER IF EXISTS check_grievance_sla_status ON grievance_tickets;
CREATE TRIGGER check_grievance_sla_status
  BEFORE UPDATE ON grievance_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_grievance_sla_status();

-- ============================================================================
-- FUNCTION: Update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_grievance_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for timestamp updates
DROP TRIGGER IF EXISTS update_grievance_tickets_timestamp ON grievance_tickets;
CREATE TRIGGER update_grievance_tickets_timestamp
  BEFORE UPDATE ON grievance_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_grievance_timestamp();

DROP TRIGGER IF EXISTS update_grievance_categories_timestamp ON grievance_categories;
CREATE TRIGGER update_grievance_categories_timestamp
  BEFORE UPDATE ON grievance_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_grievance_timestamp();

-- ============================================================================
-- INDEXES
-- ============================================================================

-- grievance_categories indexes
CREATE INDEX IF NOT EXISTS idx_grievance_categories_institution
  ON grievance_categories(institution_id);
CREATE INDEX IF NOT EXISTS idx_grievance_categories_parent
  ON grievance_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_grievance_categories_active
  ON grievance_categories(is_active) WHERE is_active = true;

-- grievance_tickets indexes
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_institution
  ON grievance_tickets(institution_id);
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_status
  ON grievance_tickets(status);
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_sla
  ON grievance_tickets(sla_status, sla_deadline);
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_assigned
  ON grievance_tickets(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_category
  ON grievance_tickets(category_id);
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_priority
  ON grievance_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_raised_by
  ON grievance_tickets(raised_by_type, raised_by_id);
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_department
  ON grievance_tickets(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_created
  ON grievance_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_search
  ON grievance_tickets USING gin(to_tsvector('english', subject || ' ' || description));

-- grievance_comments indexes
CREATE INDEX IF NOT EXISTS idx_grievance_comments_ticket
  ON grievance_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_grievance_comments_author
  ON grievance_comments(author_id) WHERE author_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grievance_comments_internal
  ON grievance_comments(ticket_id, is_internal);

-- grievance_history indexes
CREATE INDEX IF NOT EXISTS idx_grievance_history_ticket
  ON grievance_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_grievance_history_performed_at
  ON grievance_history(performed_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE grievance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES: grievance_categories
-- ============================================================================

-- Staff can view all categories in their institution
CREATE POLICY grievance_categories_staff_select ON grievance_categories
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'super_admin', 'staff', 'hod', 'principal')
        AND (
          up.institution_id = grievance_categories.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = grievance_categories.institution_id
          )
        )
    )
  );

-- Students/Parents can view active categories
CREATE POLICY grievance_categories_public_select ON grievance_categories
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('student', 'parent')
        AND up.institution_id = grievance_categories.institution_id
    )
  );

-- Admins can manage categories
CREATE POLICY grievance_categories_admin_all ON grievance_categories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'super_admin')
        AND (
          up.institution_id = grievance_categories.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = grievance_categories.institution_id
          )
        )
    )
  );

-- ============================================================================
-- RLS POLICIES: grievance_tickets
-- ============================================================================

-- Staff can view all tickets in their institution
CREATE POLICY grievance_tickets_staff_select ON grievance_tickets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'super_admin', 'staff', 'hod', 'principal')
        AND (
          up.institution_id = grievance_tickets.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = grievance_tickets.institution_id
          )
        )
    )
  );

-- Users can view their own tickets
CREATE POLICY grievance_tickets_own_select ON grievance_tickets
  FOR SELECT
  TO authenticated
  USING (
    raised_by_id = auth.uid()
  );

-- Assigned staff can view their assigned tickets
CREATE POLICY grievance_tickets_assigned_select ON grievance_tickets
  FOR SELECT
  TO authenticated
  USING (assigned_to = auth.uid());

-- Anyone can create tickets (for their institution)
CREATE POLICY grievance_tickets_insert ON grievance_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND (
          up.institution_id = grievance_tickets.institution_id
          OR EXISTS (
            SELECT 1 FROM learners_profiles lp
            WHERE lp.id = up.id
              AND lp.institution_id = grievance_tickets.institution_id
          )
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = grievance_tickets.institution_id
          )
        )
    )
  );

-- Staff can update tickets
CREATE POLICY grievance_tickets_staff_update ON grievance_tickets
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'super_admin', 'staff', 'hod', 'principal')
        AND (
          up.institution_id = grievance_tickets.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = grievance_tickets.institution_id
          )
        )
    )
  );

-- Assigned staff can update their tickets
CREATE POLICY grievance_tickets_assigned_update ON grievance_tickets
  FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid());

-- Ticket raisers can update satisfaction rating on resolved tickets
CREATE POLICY grievance_tickets_raiser_rate ON grievance_tickets
  FOR UPDATE
  TO authenticated
  USING (
    status = 'resolved'
    AND (
      raised_by_id = auth.uid()
    )
  );

-- ============================================================================
-- RLS POLICIES: grievance_comments
-- ============================================================================

-- Staff can view all comments (including internal)
CREATE POLICY grievance_comments_staff_select ON grievance_comments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM grievance_tickets gt
      JOIN public.profiles up ON up.id = auth.uid()
      WHERE gt.id = grievance_comments.ticket_id
        AND up.role IN ('admin', 'super_admin', 'staff', 'hod', 'principal')
        AND (
          up.institution_id = gt.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = gt.institution_id
          )
        )
    )
  );

-- Non-staff can view non-internal comments on their tickets
CREATE POLICY grievance_comments_public_select ON grievance_comments
  FOR SELECT
  TO authenticated
  USING (
    is_internal = false
    AND EXISTS (
      SELECT 1 FROM grievance_tickets gt
      WHERE gt.id = grievance_comments.ticket_id
        AND (
          gt.raised_by_id = auth.uid()
        )
    )
  );

-- Anyone can add comments to tickets they have access to
CREATE POLICY grievance_comments_insert ON grievance_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM grievance_tickets gt
      WHERE gt.id = grievance_comments.ticket_id
        AND (
          -- Staff with access
          EXISTS (
            SELECT 1 FROM public.profiles up
            WHERE up.id = auth.uid()
              AND up.role IN ('admin', 'super_admin', 'staff', 'hod', 'principal')
              AND (
                up.institution_id = gt.institution_id
                OR EXISTS (
                  SELECT 1 FROM user_institution_access uia
                  WHERE uia.user_id = up.id
                    AND uia.institution_id = gt.institution_id
                )
              )
          )
          -- Or ticket raiser
          OR gt.raised_by_id = auth.uid()
          -- Or assigned staff
          OR gt.assigned_to = auth.uid()
        )
    )
    -- Non-staff cannot create internal comments
    AND (
      is_internal = false
      OR EXISTS (
        SELECT 1 FROM public.profiles up
        WHERE up.id = auth.uid()
          AND up.role IN ('admin', 'super_admin', 'staff', 'hod', 'principal')
      )
    )
  );

-- ============================================================================
-- RLS POLICIES: grievance_history
-- ============================================================================

-- Staff can view history
CREATE POLICY grievance_history_staff_select ON grievance_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM grievance_tickets gt
      JOIN public.profiles up ON up.id = auth.uid()
      WHERE gt.id = grievance_history.ticket_id
        AND up.role IN ('admin', 'super_admin', 'staff', 'hod', 'principal')
        AND (
          up.institution_id = gt.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = gt.institution_id
          )
        )
    )
  );

-- Ticket raisers can view history of their tickets
CREATE POLICY grievance_history_raiser_select ON grievance_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM grievance_tickets gt
      WHERE gt.id = grievance_history.ticket_id
        AND (
          gt.raised_by_id = auth.uid()
        )
    )
  );

-- System can insert history
CREATE POLICY grievance_history_insert ON grievance_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- SEED DEFAULT CATEGORIES
-- ============================================================================

-- Note: This will be run per institution via a function
CREATE OR REPLACE FUNCTION seed_grievance_categories(p_institution_id UUID)
RETURNS void AS $$
DECLARE
  v_academic_id UUID;
  v_administrative_id UUID;
  v_facility_id UUID;
  v_fee_id UUID;
  v_other_id UUID;
BEGIN
  -- Check if categories already exist for this institution
  IF EXISTS (SELECT 1 FROM grievance_categories WHERE institution_id = p_institution_id) THEN
    RETURN;
  END IF;

  -- Insert parent categories
  INSERT INTO grievance_categories (institution_id, name, description, default_sla_hours, sort_order)
  VALUES (p_institution_id, 'Academic', 'Academic-related grievances', 48, 1)
  RETURNING id INTO v_academic_id;

  INSERT INTO grievance_categories (institution_id, name, description, default_sla_hours, sort_order)
  VALUES (p_institution_id, 'Administrative', 'Administrative and documentation issues', 72, 2)
  RETURNING id INTO v_administrative_id;

  INSERT INTO grievance_categories (institution_id, name, description, default_sla_hours, sort_order)
  VALUES (p_institution_id, 'Facility', 'Infrastructure and facility issues', 24, 3)
  RETURNING id INTO v_facility_id;

  INSERT INTO grievance_categories (institution_id, name, description, default_sla_hours, sort_order)
  VALUES (p_institution_id, 'Fee & Billing', 'Fee and payment related issues', 48, 4)
  RETURNING id INTO v_fee_id;

  INSERT INTO grievance_categories (institution_id, name, description, default_sla_hours, sort_order)
  VALUES (p_institution_id, 'Other', 'General feedback and suggestions', 96, 5)
  RETURNING id INTO v_other_id;

  -- Insert sub-categories for Academic
  INSERT INTO grievance_categories (institution_id, name, parent_id, default_sla_hours, sort_order)
  VALUES
    (p_institution_id, 'Exam Issues', v_academic_id, 48, 1),
    (p_institution_id, 'Grades & Marks', v_academic_id, 48, 2),
    (p_institution_id, 'Attendance', v_academic_id, 48, 3),
    (p_institution_id, 'Faculty Related', v_academic_id, 48, 4);

  -- Insert sub-categories for Administrative
  INSERT INTO grievance_categories (institution_id, name, parent_id, default_sla_hours, sort_order)
  VALUES
    (p_institution_id, 'Documents', v_administrative_id, 72, 1),
    (p_institution_id, 'Certificates', v_administrative_id, 72, 2),
    (p_institution_id, 'ID Cards', v_administrative_id, 72, 3);

  -- Insert sub-categories for Facility
  INSERT INTO grievance_categories (institution_id, name, parent_id, default_sla_hours, sort_order)
  VALUES
    (p_institution_id, 'Hostel', v_facility_id, 24, 1),
    (p_institution_id, 'Canteen', v_facility_id, 24, 2),
    (p_institution_id, 'Transport', v_facility_id, 24, 3),
    (p_institution_id, 'Labs & Classrooms', v_facility_id, 24, 4);

  -- Insert sub-categories for Fee & Billing
  INSERT INTO grievance_categories (institution_id, name, parent_id, default_sla_hours, sort_order)
  VALUES
    (p_institution_id, 'Refund Request', v_fee_id, 48, 1),
    (p_institution_id, 'Discount Query', v_fee_id, 48, 2),
    (p_institution_id, 'Payment Issue', v_fee_id, 48, 3);

  -- Insert sub-categories for Other
  INSERT INTO grievance_categories (institution_id, name, parent_id, default_sla_hours, sort_order)
  VALUES
    (p_institution_id, 'General Feedback', v_other_id, 96, 1),
    (p_institution_id, 'Suggestion', v_other_id, 96, 2);

END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Get SLA Dashboard Stats
-- ============================================================================

CREATE OR REPLACE FUNCTION get_grievance_sla_stats(p_institution_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_open', (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = p_institution_id AND status = 'open'),
    'total_in_progress', (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = p_institution_id AND status = 'in_progress'),
    'total_pending_info', (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = p_institution_id AND status = 'pending_info'),
    'total_resolved', (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = p_institution_id AND status = 'resolved'),
    'total_closed', (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = p_institution_id AND status = 'closed'),
    'sla_on_track', (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = p_institution_id AND status NOT IN ('resolved', 'closed') AND sla_status = 'on_track'),
    'sla_at_risk', (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = p_institution_id AND status NOT IN ('resolved', 'closed') AND sla_status = 'at_risk'),
    'sla_breached', (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = p_institution_id AND status NOT IN ('resolved', 'closed') AND sla_status = 'breached'),
    'avg_satisfaction', (SELECT COALESCE(AVG(satisfaction_rating), 0) FROM grievance_tickets WHERE institution_id = p_institution_id AND satisfaction_rating IS NOT NULL),
    'avg_resolution_time_hours', (
      SELECT COALESCE(
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600),
        0
      )
      FROM grievance_tickets
      WHERE institution_id = p_institution_id
        AND resolved_at IS NOT NULL
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE grievance_categories IS 'F004: Grievance ticketing categories with configurable SLA';
COMMENT ON TABLE grievance_tickets IS 'F004: Main grievance tickets table with 48-hour SLA tracking';
COMMENT ON TABLE grievance_comments IS 'F004: Comment threads for grievance tickets (public + internal)';
COMMENT ON TABLE grievance_history IS 'F004: Audit trail for grievance ticket changes';
COMMENT ON FUNCTION generate_grievance_ticket_number() IS 'Auto-generates ticket number in format GRV-YYYYMMDD-XXXX';
COMMENT ON FUNCTION update_grievance_sla_status() IS 'Updates SLA status based on current time vs deadline';
COMMENT ON FUNCTION seed_grievance_categories(UUID) IS 'Seeds default grievance categories for an institution';
COMMENT ON FUNCTION get_grievance_sla_stats(UUID) IS 'Returns SLA dashboard statistics for an institution';
