-- ============================================
-- Migration: Create Student Role Function and Initialize Role
-- Created: 2025-12-27
-- Purpose: Create function to manage student system role and initialize it
-- ============================================

-- Ensure student system role exists (global, not per-institution)
-- Returns the student role ID, creating it if it doesn't exist
CREATE OR REPLACE FUNCTION public.ensure_student_role()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_role_id UUID;
    v_default_permissions JSONB;
BEGIN
    -- Check if student role exists
    SELECT id INTO v_student_role_id
    FROM custom_roles
    WHERE role_key = 'student'
    AND is_system_role = true;

    -- If exists, return the ID
    IF v_student_role_id IS NOT NULL THEN
        RETURN v_student_role_id;
    END IF;

    -- Create default student permissions
    v_default_permissions := jsonb_build_object(
        -- Core Access
        'view_dashboard', true,
        'profile.view', true,
        'profile.edit', true,

        -- Self-View Modules (RLS enforced to own records)
        'learners.view', true,
        'billing.view', true,
        'billing.receipts.view', true,
        'billing.invoices.view', true,
        'academic.view', true,
        'academic.timetables.view', true,
        'academic.attendance.view', true,

        -- Resources (read-only)
        'resources.digital.view', true,
        'resources.physical.view', true,

        -- Service Requests
        'service_requests.view', true,
        'service_requests.create', true,

        -- All other permissions default to false
        'learners.create', false,
        'learners.edit', false,
        'learners.delete', false,
        'billing.edit', false,
        'billing.create', false,
        'billing.delete', false,
        'academic.edit', false,
        'academic.create', false,
        'organizations.view', false,
        'staff.view', false,
        'users.view', false,
        'users.manage', false
    );

    -- Create the student role (global system role)
    INSERT INTO custom_roles (
        role_key,
        role_name,
        description,
        permissions,
        is_system_role
    ) VALUES (
        'student',
        'Student',
        'Default role for enrolled students with view-only access to their own records. Enforced by RLS policies.',
        v_default_permissions,
        true
    )
    RETURNING id INTO v_student_role_id;

    RAISE NOTICE 'Created student system role with ID: %', v_student_role_id;

    RETURN v_student_role_id;
END;
$$;

COMMENT ON FUNCTION ensure_student_role IS 'Creates or returns the global student system role. Called during student account creation and system initialization.';

-- Initialize the student role now
SELECT ensure_student_role() as student_role_id;
