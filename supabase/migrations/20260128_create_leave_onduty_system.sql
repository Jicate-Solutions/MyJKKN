-- =====================================================
-- LEAVE AND ONDUTY APPLICATION SYSTEM
-- =====================================================
-- Created: 2026-01-28
-- Purpose: Comprehensive leave/onduty management with approval workflows
-- and automatic attendance integration
-- =====================================================

-- =====================================================
-- STEP 1: CREATE ENUMS
-- =====================================================

-- Leave/Onduty category
DO $$ BEGIN
    CREATE TYPE leave_onduty_category AS ENUM ('leave', 'onduty');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Leave sub-categories
DO $$ BEGIN
    CREATE TYPE leave_sub_category AS ENUM ('casual', 'medical');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Onduty sub-categories
DO $$ BEGIN
    CREATE TYPE onduty_sub_category AS ENUM ('event_participation', 'club_activities');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Period type
DO $$ BEGIN
    CREATE TYPE period_type AS ENUM ('fullday', 'forenoon', 'afternoon', 'periodwise');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Application status
DO $$ BEGIN
    CREATE TYPE application_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Approval status
DO $$ BEGIN
    CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Flow type
DO $$ BEGIN
    CREATE TYPE flow_type AS ENUM ('sequential', 'parallel');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Approver role
DO $$ BEGIN
    CREATE TYPE approver_role AS ENUM ('faculty', 'hod', 'principal');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Note: Attendance status is stored as string in JSONB attendance_data field
-- No need to alter database enum - OnDuty status is handled at application level

-- =====================================================
-- STEP 2: CREATE STORAGE BUCKET
-- =====================================================

-- Create storage bucket for leave/onduty attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'leave-onduty-attachments',
    'leave-onduty-attachments',
    false,
    10485760, -- 10MB
    ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- STEP 3: CREATE TABLES
-- =====================================================

-- Main leave/onduty applications table
CREATE TABLE IF NOT EXISTS leave_onduty_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    semester_id UUID REFERENCES semesters(id) ON DELETE SET NULL,
    section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
    category leave_onduty_category NOT NULL,
    sub_category TEXT NOT NULL, -- Stores either leave or onduty subcategory
    application_date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    period_type period_type NOT NULL,
    selected_periods JSONB DEFAULT '[]'::jsonb, -- Array of period slot IDs from timetable
    reason TEXT NOT NULL,
    attachment_url TEXT,
    status application_status NOT NULL DEFAULT 'pending',
    current_step INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_date_range CHECK (end_date >= start_date),
    CONSTRAINT valid_current_step CHECK (current_step >= 1),
    CONSTRAINT valid_reason_length CHECK (length(reason) <= 500)
);

-- Approval flow configurations
CREATE TABLE IF NOT EXISTS leave_onduty_approval_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    semester_id UUID REFERENCES semesters(id) ON DELETE SET NULL,
    category TEXT NOT NULL, -- 'leave', 'onduty', or 'all'
    sub_category TEXT, -- Specific sub-category or NULL for all
    flow_type flow_type NOT NULL,
    flow_steps JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of approval steps
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_flow_steps CHECK (jsonb_array_length(flow_steps) > 0)
);

-- Individual approval tracking
CREATE TABLE IF NOT EXISTS leave_onduty_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES leave_onduty_applications(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    approver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approver_role approver_role NOT NULL,
    status approval_status NOT NULL DEFAULT 'pending',
    comments TEXT,
    action_taken_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_step_order CHECK (step_order >= 1),
    CONSTRAINT comments_max_length CHECK (length(comments) <= 1000)
);

-- Attendance update audit trail
CREATE TABLE IF NOT EXISTS leave_onduty_attendance_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES leave_onduty_applications(id) ON DELETE CASCADE,
    attendance_record_id UUID NOT NULL REFERENCES student_attendance(id) ON DELETE CASCADE,
    period_slot_id TEXT NOT NULL,
    student_id UUID NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
    old_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- =====================================================
-- STEP 4: CREATE INDEXES
-- =====================================================

-- leave_onduty_applications indexes
CREATE INDEX IF NOT EXISTS idx_applications_learner ON leave_onduty_applications(learner_id);
CREATE INDEX IF NOT EXISTS idx_applications_institution ON leave_onduty_applications(institution_id);
CREATE INDEX IF NOT EXISTS idx_applications_department ON leave_onduty_applications(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_semester ON leave_onduty_applications(semester_id) WHERE semester_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_section ON leave_onduty_applications(section_id) WHERE section_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_status ON leave_onduty_applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_category ON leave_onduty_applications(category);
CREATE INDEX IF NOT EXISTS idx_applications_date_range ON leave_onduty_applications(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON leave_onduty_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_pending ON leave_onduty_applications(status) WHERE status = 'pending';

-- leave_onduty_approval_flows indexes
CREATE INDEX IF NOT EXISTS idx_flows_institution ON leave_onduty_approval_flows(institution_id);
CREATE INDEX IF NOT EXISTS idx_flows_department ON leave_onduty_approval_flows(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_flows_semester ON leave_onduty_approval_flows(semester_id) WHERE semester_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_flows_category ON leave_onduty_approval_flows(category);
CREATE INDEX IF NOT EXISTS idx_flows_active ON leave_onduty_approval_flows(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_flows_lookup ON leave_onduty_approval_flows(institution_id, department_id, semester_id, category, sub_category) WHERE is_active = true;

-- leave_onduty_approvals indexes
CREATE INDEX IF NOT EXISTS idx_approvals_application ON leave_onduty_approvals(application_id);
CREATE INDEX IF NOT EXISTS idx_approvals_approver ON leave_onduty_approvals(approver_id) WHERE approver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approvals_status ON leave_onduty_approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_pending ON leave_onduty_approvals(approver_id, status) WHERE status = 'pending';

-- leave_onduty_attendance_updates indexes
CREATE INDEX IF NOT EXISTS idx_attendance_updates_application ON leave_onduty_attendance_updates(application_id);
CREATE INDEX IF NOT EXISTS idx_attendance_updates_attendance ON leave_onduty_attendance_updates(attendance_record_id);
CREATE INDEX IF NOT EXISTS idx_attendance_updates_student ON leave_onduty_attendance_updates(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_updates_updated_at ON leave_onduty_attendance_updates(updated_at DESC);

-- =====================================================
-- STEP 5: CREATE DATABASE FUNCTIONS
-- =====================================================

-- Function to get applicable approval flow for an application
CREATE OR REPLACE FUNCTION get_applicable_approval_flow(
    p_institution_id UUID,
    p_department_id UUID,
    p_semester_id UUID,
    p_category TEXT,
    p_sub_category TEXT
) RETURNS leave_onduty_approval_flows AS $$
DECLARE
    v_flow leave_onduty_approval_flows;
BEGIN
    -- Try to find most specific flow first, then fallback to less specific
    -- Priority: institution + department + semester + category + sub_category (highest)
    -- to institution + category (lowest)

    -- Level 1: All filters
    SELECT * INTO v_flow
    FROM leave_onduty_approval_flows
    WHERE institution_id = p_institution_id
        AND department_id = p_department_id
        AND semester_id = p_semester_id
        AND (category = p_category OR category = 'all')
        AND (sub_category = p_sub_category OR sub_category IS NULL)
        AND is_active = true
    ORDER BY
        CASE WHEN sub_category = p_sub_category THEN 1 ELSE 2 END,
        CASE WHEN category = p_category THEN 1 ELSE 2 END
    LIMIT 1;

    IF FOUND THEN RETURN v_flow; END IF;

    -- Level 2: Institution + Department + Semester + Category
    SELECT * INTO v_flow
    FROM leave_onduty_approval_flows
    WHERE institution_id = p_institution_id
        AND department_id = p_department_id
        AND semester_id = p_semester_id
        AND (category = p_category OR category = 'all')
        AND sub_category IS NULL
        AND is_active = true
    ORDER BY CASE WHEN category = p_category THEN 1 ELSE 2 END
    LIMIT 1;

    IF FOUND THEN RETURN v_flow; END IF;

    -- Level 3: Institution + Department + Category
    SELECT * INTO v_flow
    FROM leave_onduty_approval_flows
    WHERE institution_id = p_institution_id
        AND department_id = p_department_id
        AND semester_id IS NULL
        AND (category = p_category OR category = 'all')
        AND sub_category IS NULL
        AND is_active = true
    ORDER BY CASE WHEN category = p_category THEN 1 ELSE 2 END
    LIMIT 1;

    IF FOUND THEN RETURN v_flow; END IF;

    -- Level 4: Institution + Category (fallback)
    SELECT * INTO v_flow
    FROM leave_onduty_approval_flows
    WHERE institution_id = p_institution_id
        AND department_id IS NULL
        AND semester_id IS NULL
        AND (category = p_category OR category = 'all')
        AND sub_category IS NULL
        AND is_active = true
    ORDER BY CASE WHEN category = p_category THEN 1 ELSE 2 END
    LIMIT 1;

    RETURN v_flow;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if user is valid approver for application
CREATE OR REPLACE FUNCTION is_valid_approver(
    p_user_id UUID,
    p_application_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_is_valid BOOLEAN := false;
BEGIN
    -- Check if user exists in approvals for this application with pending status
    SELECT EXISTS(
        SELECT 1 FROM leave_onduty_approvals
        WHERE application_id = p_application_id
            AND approver_id = p_user_id
            AND status = 'pending'
    ) INTO v_is_valid;

    RETURN v_is_valid;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- STEP 6: CREATE TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_leave_onduty_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_applications_updated_at
BEFORE UPDATE ON leave_onduty_applications
FOR EACH ROW
EXECUTE FUNCTION update_leave_onduty_timestamp();

CREATE TRIGGER trg_flows_updated_at
BEFORE UPDATE ON leave_onduty_approval_flows
FOR EACH ROW
EXECUTE FUNCTION update_leave_onduty_timestamp();

-- =====================================================
-- STEP 7: CREATE RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE leave_onduty_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_onduty_approval_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_onduty_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_onduty_attendance_updates ENABLE ROW LEVEL SECURITY;

-- leave_onduty_applications policies
CREATE POLICY "learners_view_own_applications"
ON leave_onduty_applications FOR SELECT
USING (learner_id IN (
    SELECT id FROM learners_profiles WHERE id = (
        SELECT learner_id FROM profiles WHERE id = auth.uid()
    )
));

CREATE POLICY "learners_create_applications"
ON leave_onduty_applications FOR INSERT
WITH CHECK (learner_id IN (
    SELECT id FROM learners_profiles WHERE id = (
        SELECT learner_id FROM profiles WHERE id = auth.uid()
    )
));

CREATE POLICY "learners_update_own_pending"
ON leave_onduty_applications FOR UPDATE
USING (
    learner_id IN (
        SELECT id FROM learners_profiles WHERE id = (
            SELECT learner_id FROM profiles WHERE id = auth.uid()
        )
    )
    AND status = 'pending'
);

CREATE POLICY "approvers_view_assigned"
ON leave_onduty_applications FOR SELECT
USING (
    id IN (
        SELECT application_id FROM leave_onduty_approvals
        WHERE approver_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'institution_admin', 'staff')
    )
);

CREATE POLICY "admins_view_all_institution"
ON leave_onduty_applications FOR SELECT
USING (
    institution_id IN (
        SELECT institution_id FROM user_institution_access
        WHERE user_id = auth.uid()
    )
    AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'institution_admin')
    )
);

-- leave_onduty_approval_flows policies
CREATE POLICY "admins_manage_flows"
ON leave_onduty_approval_flows FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'institution_admin')
    )
);

CREATE POLICY "staff_view_flows"
ON leave_onduty_approval_flows FOR SELECT
USING (
    institution_id IN (
        SELECT institution_id FROM user_institution_access
        WHERE user_id = auth.uid()
    )
);

-- leave_onduty_approvals policies
CREATE POLICY "approvers_view_own"
ON leave_onduty_approvals FOR SELECT
USING (approver_id = auth.uid());

CREATE POLICY "approvers_update_own"
ON leave_onduty_approvals FOR UPDATE
USING (approver_id = auth.uid() AND status = 'pending');

CREATE POLICY "admins_view_all"
ON leave_onduty_approvals FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'institution_admin')
    )
);

-- leave_onduty_attendance_updates policies
CREATE POLICY "admins_view_updates"
ON leave_onduty_attendance_updates FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'institution_admin', 'staff')
    )
);

CREATE POLICY "learners_view_own_updates"
ON leave_onduty_attendance_updates FOR SELECT
USING (
    student_id IN (
        SELECT id FROM learners_profiles WHERE id = (
            SELECT learner_id FROM profiles WHERE id = auth.uid()
        )
    )
);

-- =====================================================
-- STEP 8: STORAGE BUCKET RLS POLICIES
-- =====================================================

-- Allow authenticated users to upload their own attachments
CREATE POLICY "users_upload_own_attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'leave-onduty-attachments'
    AND (storage.foldername(name))[1] IN (
        SELECT institution_id::text FROM user_institution_access
        WHERE user_id = auth.uid()
    )
);

-- Allow users to view their own attachments
CREATE POLICY "users_view_own_attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'leave-onduty-attachments'
    AND (storage.foldername(name))[1] IN (
        SELECT institution_id::text FROM user_institution_access
        WHERE user_id = auth.uid()
    )
);

-- Allow users to update their own attachments
CREATE POLICY "users_update_own_attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'leave-onduty-attachments'
    AND (storage.foldername(name))[1] IN (
        SELECT institution_id::text FROM user_institution_access
        WHERE user_id = auth.uid()
    )
);

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Add comment to track migration
COMMENT ON TABLE leave_onduty_applications IS 'Leave and OnDuty applications with approval workflow - Created: 2026-01-28';
COMMENT ON TABLE leave_onduty_approval_flows IS 'Configurable approval workflows for leave/onduty - Created: 2026-01-28';
COMMENT ON TABLE leave_onduty_approvals IS 'Individual approval tracking for applications - Created: 2026-01-28';
COMMENT ON TABLE leave_onduty_attendance_updates IS 'Audit trail for attendance updates from approved applications - Created: 2026-01-28';
