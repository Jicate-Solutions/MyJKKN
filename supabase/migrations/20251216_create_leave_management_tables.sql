-- =====================================================
-- LEAVE MANAGEMENT MODULE - DATABASE SCHEMA
-- =====================================================
-- Purpose: Institution-level leave management for blocking attendance
-- Created: 2025-12-16
--
-- Tables:
--   1. leave_types - Leave categories with color codes
--   2. institution_leaves - Main leave records with scope
--   3. leave_approval_chains - Workflow configuration
--   4. leave_approvals - Approval action tracking
--
-- Access Control: Uses profiles.institution_id (NOT user_institution_access)
-- =====================================================

-- =====================================================
-- TABLE 1: LEAVE TYPES
-- =====================================================
-- Configurable leave categories per institution
CREATE TABLE IF NOT EXISTS public.leave_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,
    leave_type_code VARCHAR(20) NOT NULL,
    leave_type_name VARCHAR(100) NOT NULL,
    description TEXT,
    color_code VARCHAR(7) NOT NULL DEFAULT '#6B7280', -- Hex color for calendar display
    requires_approval BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Unique constraint per institution
    CONSTRAINT uq_leave_type_code_per_institution UNIQUE (institution_id, leave_type_code)
);

-- Indexes for leave_types
CREATE INDEX IF NOT EXISTS idx_leave_types_institution_id ON public.leave_types(institution_id);
CREATE INDEX IF NOT EXISTS idx_leave_types_is_active ON public.leave_types(is_active);

-- Comments
COMMENT ON TABLE public.leave_types IS 'Leave type categories for institutional leave management';
COMMENT ON COLUMN public.leave_types.color_code IS 'Hex color code for calendar display (e.g., #FF5733)';
COMMENT ON COLUMN public.leave_types.requires_approval IS 'Whether leaves of this type require approval workflow';

-- =====================================================
-- TABLE 2: INSTITUTION LEAVES
-- =====================================================
-- Main leave records with hierarchical scope
CREATE TABLE IF NOT EXISTS public.institution_leaves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,
    leave_type_id UUID NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,

    -- Leave details
    leave_name VARCHAR(200) NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,

    -- Scope configuration
    scope_level VARCHAR(20) NOT NULL DEFAULT 'institution', -- institution, department, semester, section
    department_ids UUID[] DEFAULT '{}', -- Array of department IDs (when scope_level = department)
    semester_ids UUID[] DEFAULT '{}',   -- Array of semester IDs (when scope_level = semester)
    section_ids UUID[] DEFAULT '{}',    -- Array of section IDs (when scope_level = section)

    -- Status and workflow
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected, cancelled
    requested_by UUID NOT NULL,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,

    -- Metadata
    is_recurring BOOLEAN NOT NULL DEFAULT false,
    recurrence_pattern JSONB, -- { type: 'yearly', month: 8, day: 15 }
    academic_year_id UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Constraints
    CONSTRAINT chk_leave_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_leave_scope_level CHECK (scope_level IN ('institution', 'department', 'semester', 'section')),
    CONSTRAINT chk_leave_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);

-- Indexes for institution_leaves
CREATE INDEX IF NOT EXISTS idx_institution_leaves_institution_id ON public.institution_leaves(institution_id);
CREATE INDEX IF NOT EXISTS idx_institution_leaves_leave_type_id ON public.institution_leaves(leave_type_id);
CREATE INDEX IF NOT EXISTS idx_institution_leaves_status ON public.institution_leaves(status);
CREATE INDEX IF NOT EXISTS idx_institution_leaves_date_range ON public.institution_leaves(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_institution_leaves_scope ON public.institution_leaves(scope_level);
CREATE INDEX IF NOT EXISTS idx_institution_leaves_requested_by ON public.institution_leaves(requested_by);
CREATE INDEX IF NOT EXISTS idx_institution_leaves_department_ids ON public.institution_leaves USING GIN (department_ids);
CREATE INDEX IF NOT EXISTS idx_institution_leaves_semester_ids ON public.institution_leaves USING GIN (semester_ids);
CREATE INDEX IF NOT EXISTS idx_institution_leaves_section_ids ON public.institution_leaves USING GIN (section_ids);

-- Comments
COMMENT ON TABLE public.institution_leaves IS 'Institution-level leaves for blocking attendance and calendar display';
COMMENT ON COLUMN public.institution_leaves.scope_level IS 'Hierarchy level: institution (all), department, semester, or section';
COMMENT ON COLUMN public.institution_leaves.department_ids IS 'Array of department IDs when scope_level = department';
COMMENT ON COLUMN public.institution_leaves.semester_ids IS 'Array of semester IDs when scope_level = semester';
COMMENT ON COLUMN public.institution_leaves.section_ids IS 'Array of section IDs when scope_level = section';

-- =====================================================
-- TABLE 3: LEAVE APPROVAL CHAINS
-- =====================================================
-- Configurable approval workflows per institution/leave type
CREATE TABLE IF NOT EXISTS public.leave_approval_chains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,
    leave_type_id UUID REFERENCES public.leave_types(id) ON DELETE CASCADE,
    scope_level VARCHAR(20) NOT NULL DEFAULT 'institution',

    -- Approval chain configuration
    chain_order INTEGER NOT NULL DEFAULT 1,
    approver_role VARCHAR(50) NOT NULL, -- 'hod', 'principal', 'admin', or custom role ID
    approver_scope VARCHAR(50), -- 'same_department', 'any', or specific ID

    -- Conditions
    is_required BOOLEAN NOT NULL DEFAULT true,
    can_skip_if_approved_by_higher BOOLEAN NOT NULL DEFAULT false,

    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Unique order per chain
    CONSTRAINT uq_approval_chain_order UNIQUE (institution_id, leave_type_id, scope_level, chain_order)
);

-- Indexes for leave_approval_chains
CREATE INDEX IF NOT EXISTS idx_leave_approval_chains_institution ON public.leave_approval_chains(institution_id);
CREATE INDEX IF NOT EXISTS idx_leave_approval_chains_leave_type ON public.leave_approval_chains(leave_type_id);
CREATE INDEX IF NOT EXISTS idx_leave_approval_chains_active ON public.leave_approval_chains(is_active);

-- Comments
COMMENT ON TABLE public.leave_approval_chains IS 'Configurable approval workflow chains for leave requests';
COMMENT ON COLUMN public.leave_approval_chains.approver_role IS 'Role required to approve: hod, principal, admin, or custom role ID';
COMMENT ON COLUMN public.leave_approval_chains.chain_order IS 'Order in approval chain (1 = first approver)';

-- =====================================================
-- TABLE 4: LEAVE APPROVALS
-- =====================================================
-- Individual approval actions tracking
CREATE TABLE IF NOT EXISTS public.leave_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leave_id UUID NOT NULL REFERENCES public.institution_leaves(id) ON DELETE CASCADE,
    approval_chain_id UUID REFERENCES public.leave_approval_chains(id) ON DELETE SET NULL,

    -- Approval details
    approver_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL, -- 'approved', 'rejected', 'pending'
    comments TEXT,

    -- Timestamps
    acted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT chk_approval_action CHECK (action IN ('approved', 'rejected', 'pending'))
);

-- Indexes for leave_approvals
CREATE INDEX IF NOT EXISTS idx_leave_approvals_leave_id ON public.leave_approvals(leave_id);
CREATE INDEX IF NOT EXISTS idx_leave_approvals_approver ON public.leave_approvals(approver_id);
CREATE INDEX IF NOT EXISTS idx_leave_approvals_action ON public.leave_approvals(action);

-- Comments
COMMENT ON TABLE public.leave_approvals IS 'Tracks individual approval actions for leave requests';

-- =====================================================
-- RLS POLICIES
-- =====================================================
-- Enable RLS on all tables
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_approval_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_approvals ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- LEAVE TYPES POLICIES
-- =====================================================
-- View policy: Super admin OR user's institution
DROP POLICY IF EXISTS "leave_types_select_policy" ON public.leave_types;
CREATE POLICY "leave_types_select_policy" ON public.leave_types
    FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
        OR
        institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    );

-- Insert policy: Super admin OR user's institution with permission
DROP POLICY IF EXISTS "leave_types_insert_policy" ON public.leave_types;
CREATE POLICY "leave_types_insert_policy" ON public.leave_types
    FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
        OR
        institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    );

-- Update policy: Super admin OR user's institution
DROP POLICY IF EXISTS "leave_types_update_policy" ON public.leave_types;
CREATE POLICY "leave_types_update_policy" ON public.leave_types
    FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
        OR
        institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    );

-- Delete policy: Super admin OR user's institution
DROP POLICY IF EXISTS "leave_types_delete_policy" ON public.leave_types;
CREATE POLICY "leave_types_delete_policy" ON public.leave_types
    FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
        OR
        institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    );

-- =====================================================
-- INSTITUTION LEAVES POLICIES
-- =====================================================
-- View policy: Super admin OR user's institution
DROP POLICY IF EXISTS "institution_leaves_select_policy" ON public.institution_leaves;
CREATE POLICY "institution_leaves_select_policy" ON public.institution_leaves
    FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
        OR
        institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    );

-- Insert policy: Super admin OR user's institution
DROP POLICY IF EXISTS "institution_leaves_insert_policy" ON public.institution_leaves;
CREATE POLICY "institution_leaves_insert_policy" ON public.institution_leaves
    FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
        OR
        institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    );

-- Update policy: Super admin OR user's institution
DROP POLICY IF EXISTS "institution_leaves_update_policy" ON public.institution_leaves;
CREATE POLICY "institution_leaves_update_policy" ON public.institution_leaves
    FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
        OR
        institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    );

-- Delete policy: Super admin OR user's institution
DROP POLICY IF EXISTS "institution_leaves_delete_policy" ON public.institution_leaves;
CREATE POLICY "institution_leaves_delete_policy" ON public.institution_leaves
    FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
        OR
        institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    );

-- =====================================================
-- LEAVE APPROVAL CHAINS POLICIES
-- =====================================================
DROP POLICY IF EXISTS "leave_approval_chains_select_policy" ON public.leave_approval_chains;
CREATE POLICY "leave_approval_chains_select_policy" ON public.leave_approval_chains
    FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
        OR
        institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "leave_approval_chains_insert_policy" ON public.leave_approval_chains;
CREATE POLICY "leave_approval_chains_insert_policy" ON public.leave_approval_chains
    FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
        OR
        institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "leave_approval_chains_update_policy" ON public.leave_approval_chains;
CREATE POLICY "leave_approval_chains_update_policy" ON public.leave_approval_chains
    FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
        OR
        institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "leave_approval_chains_delete_policy" ON public.leave_approval_chains;
CREATE POLICY "leave_approval_chains_delete_policy" ON public.leave_approval_chains
    FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
        OR
        institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    );

-- =====================================================
-- LEAVE APPROVALS POLICIES
-- =====================================================
DROP POLICY IF EXISTS "leave_approvals_select_policy" ON public.leave_approvals;
CREATE POLICY "leave_approvals_select_policy" ON public.leave_approvals
    FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
        OR
        EXISTS (
            SELECT 1 FROM public.institution_leaves il
            WHERE il.id = leave_approvals.leave_id
            AND il.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "leave_approvals_insert_policy" ON public.leave_approvals;
CREATE POLICY "leave_approvals_insert_policy" ON public.leave_approvals
    FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
        OR
        EXISTS (
            SELECT 1 FROM public.institution_leaves il
            WHERE il.id = leave_approvals.leave_id
            AND il.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "leave_approvals_update_policy" ON public.leave_approvals;
CREATE POLICY "leave_approvals_update_policy" ON public.leave_approvals
    FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
        OR
        (
            approver_id = auth.uid()
            AND EXISTS (
                SELECT 1 FROM public.institution_leaves il
                WHERE il.id = leave_approvals.leave_id
                AND il.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
            )
        )
    );

-- =====================================================
-- FUNCTION: Check if date is blocked by leave
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_date_blocked_by_leave(
    p_institution_id UUID,
    p_date DATE,
    p_department_id UUID DEFAULT NULL,
    p_semester_id UUID DEFAULT NULL,
    p_section_id UUID DEFAULT NULL
)
RETURNS TABLE (
    is_blocked BOOLEAN,
    leave_id UUID,
    leave_name VARCHAR,
    leave_type_name VARCHAR,
    color_code VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        true AS is_blocked,
        il.id AS leave_id,
        il.leave_name,
        lt.leave_type_name,
        lt.color_code
    FROM public.institution_leaves il
    JOIN public.leave_types lt ON lt.id = il.leave_type_id
    WHERE il.institution_id = p_institution_id
    AND il.status = 'approved'
    AND p_date BETWEEN il.start_date AND il.end_date
    AND (
        -- Institution-wide leave
        il.scope_level = 'institution'
        -- Department-level leave matching provided department
        OR (il.scope_level = 'department' AND p_department_id IS NOT NULL AND p_department_id = ANY(il.department_ids))
        -- Semester-level leave matching provided semester
        OR (il.scope_level = 'semester' AND p_semester_id IS NOT NULL AND p_semester_id = ANY(il.semester_ids))
        -- Section-level leave matching provided section
        OR (il.scope_level = 'section' AND p_section_id IS NOT NULL AND p_section_id = ANY(il.section_ids))
    )
    LIMIT 1;

    -- If no blocking leave found, return is_blocked = false
    IF NOT FOUND THEN
        RETURN QUERY SELECT false::BOOLEAN, NULL::UUID, NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR;
    END IF;
END;
$$;

COMMENT ON FUNCTION public.is_date_blocked_by_leave IS 'Checks if attendance marking is blocked on a given date due to approved leave';

-- =====================================================
-- FUNCTION: Get leaves for calendar month
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_leaves_for_month(
    p_institution_id UUID,
    p_year INTEGER,
    p_month INTEGER,
    p_department_id UUID DEFAULT NULL,
    p_semester_id UUID DEFAULT NULL,
    p_section_id UUID DEFAULT NULL
)
RETURNS TABLE (
    leave_id UUID,
    leave_name VARCHAR,
    leave_type_name VARCHAR,
    color_code VARCHAR,
    start_date DATE,
    end_date DATE,
    scope_level VARCHAR,
    status VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    -- Calculate month start and end dates
    v_start_date := make_date(p_year, p_month, 1);
    v_end_date := (v_start_date + INTERVAL '1 month - 1 day')::DATE;

    RETURN QUERY
    SELECT
        il.id AS leave_id,
        il.leave_name,
        lt.leave_type_name,
        lt.color_code,
        il.start_date,
        il.end_date,
        il.scope_level,
        il.status
    FROM public.institution_leaves il
    JOIN public.leave_types lt ON lt.id = il.leave_type_id
    WHERE il.institution_id = p_institution_id
    AND il.status IN ('approved', 'pending')
    AND (
        (il.start_date <= v_end_date AND il.end_date >= v_start_date)
    )
    AND (
        -- Institution-wide leave
        il.scope_level = 'institution'
        -- Or matching scope
        OR (il.scope_level = 'department' AND (p_department_id IS NULL OR p_department_id = ANY(il.department_ids)))
        OR (il.scope_level = 'semester' AND (p_semester_id IS NULL OR p_semester_id = ANY(il.semester_ids)))
        OR (il.scope_level = 'section' AND (p_section_id IS NULL OR p_section_id = ANY(il.section_ids)))
    )
    ORDER BY il.start_date;
END;
$$;

COMMENT ON FUNCTION public.get_leaves_for_month IS 'Returns all leaves for a calendar month view';

-- =====================================================
-- TRIGGERS: Updated timestamps
-- =====================================================
-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_leave_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all leave tables
DROP TRIGGER IF EXISTS update_leave_types_updated_at ON public.leave_types;
CREATE TRIGGER update_leave_types_updated_at
    BEFORE UPDATE ON public.leave_types
    FOR EACH ROW
    EXECUTE FUNCTION public.update_leave_tables_updated_at();

DROP TRIGGER IF EXISTS update_institution_leaves_updated_at ON public.institution_leaves;
CREATE TRIGGER update_institution_leaves_updated_at
    BEFORE UPDATE ON public.institution_leaves
    FOR EACH ROW
    EXECUTE FUNCTION public.update_leave_tables_updated_at();

DROP TRIGGER IF EXISTS update_leave_approval_chains_updated_at ON public.leave_approval_chains;
CREATE TRIGGER update_leave_approval_chains_updated_at
    BEFORE UPDATE ON public.leave_approval_chains
    FOR EACH ROW
    EXECUTE FUNCTION public.update_leave_tables_updated_at();

DROP TRIGGER IF EXISTS update_leave_approvals_updated_at ON public.leave_approvals;
CREATE TRIGGER update_leave_approvals_updated_at
    BEFORE UPDATE ON public.leave_approvals
    FOR EACH ROW
    EXECUTE FUNCTION public.update_leave_tables_updated_at();

-- =====================================================
-- SEED DATA: Default leave types
-- =====================================================
-- Note: These will be created when the first institution sets up leave management
-- Example leave types (not auto-inserted, just for reference):
-- INSERT INTO public.leave_types (institution_id, leave_type_code, leave_type_name, color_code, requires_approval)
-- VALUES
--   ('inst-id', 'GAZETTED', 'Gazetted Holiday', '#EF4444', false),
--   ('inst-id', 'STUDY', 'Study Leave', '#3B82F6', true),
--   ('inst-id', 'EMERGENCY', 'Emergency Closure', '#F59E0B', true),
--   ('inst-id', 'EXAM', 'Examination Leave', '#8B5CF6', false);
