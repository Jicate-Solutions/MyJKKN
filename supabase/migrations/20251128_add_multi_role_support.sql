-- Migration: Add Multi-Role Support
-- Description: Creates user_roles junction table for many-to-many relationship between profiles and custom_roles
-- Date: 2025-11-28

-- ============================================================================
-- Step 1: Create the user_roles junction table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

    -- Ensure unique user-role combinations
    CONSTRAINT user_roles_unique_assignment UNIQUE(user_id, role_id)
);

-- Comment on table
COMMENT ON TABLE user_roles IS 'Junction table for many-to-many relationship between users and roles';
COMMENT ON COLUMN user_roles.is_primary IS 'Indicates if this is the user primary role for display purposes';
COMMENT ON COLUMN user_roles.assigned_by IS 'The user who assigned this role';

-- ============================================================================
-- Step 2: Create indexes for fast lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_assigned_at ON user_roles(assigned_at);

-- Partial unique index to ensure only one primary role per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_primary_unique
    ON user_roles(user_id)
    WHERE is_primary = true;

-- ============================================================================
-- Step 3: Enable RLS on user_roles table
-- ============================================================================

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Step 4: Create RLS policies for user_roles
-- ============================================================================

-- Policy: Users can view their own roles
CREATE POLICY "Users can view own roles"
    ON user_roles
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users with users.manage permission can view all user roles
CREATE POLICY "Managers can view all user roles"
    ON user_roles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON ur.user_id = p.id
            JOIN custom_roles cr ON cr.id = ur.role_id
            WHERE p.id = auth.uid()
            AND (cr.permissions->>'users.manage')::boolean = true
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'super_admin'
        )
    );

-- Policy: Users with users.manage permission can manage user roles
CREATE POLICY "Managers can manage user roles"
    ON user_roles
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON ur.user_id = p.id
            JOIN custom_roles cr ON cr.id = ur.role_id
            WHERE p.id = auth.uid()
            AND (cr.permissions->>'users.manage')::boolean = true
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON ur.user_id = p.id
            JOIN custom_roles cr ON cr.id = ur.role_id
            WHERE p.id = auth.uid()
            AND (cr.permissions->>'users.manage')::boolean = true
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'super_admin'
        )
    );

-- ============================================================================
-- Step 5: Migrate existing single roles to junction table
-- ============================================================================

-- Insert existing profile roles into user_roles as primary roles
INSERT INTO user_roles (user_id, role_id, is_primary, assigned_at)
SELECT
    p.id as user_id,
    cr.id as role_id,
    true as is_primary,
    COALESCE(p.created_at, NOW()) as assigned_at
FROM profiles p
INNER JOIN custom_roles cr ON cr.role_key = p.role
WHERE p.role IS NOT NULL
AND NOT EXISTS (
    -- Don't insert if already exists (idempotent)
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = p.id AND ur.role_id = cr.id
);

-- ============================================================================
-- Step 6: Create helper function to get merged permissions for a user
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_merged_permissions(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    merged_perms JSONB := '{}';
    role_perms JSONB;
BEGIN
    -- Loop through all roles assigned to the user
    FOR role_perms IN
        SELECT cr.permissions
        FROM user_roles ur
        INNER JOIN custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = p_user_id
    LOOP
        -- Merge permissions using Union (OR) logic
        -- If any role grants a permission, it's granted
        SELECT jsonb_object_agg(
            key,
            CASE
                WHEN merged_perms ? key THEN
                    (merged_perms->>key)::boolean OR (role_perms->>key)::boolean
                ELSE
                    (role_perms->>key)::boolean
            END
        )
        INTO merged_perms
        FROM jsonb_each_text(merged_perms || role_perms);
    END LOOP;

    RETURN merged_perms;
END;
$$;

COMMENT ON FUNCTION get_user_merged_permissions IS 'Returns merged permissions from all roles assigned to a user using Union (OR) logic';

-- ============================================================================
-- Step 7: Create helper function to get user roles with role details
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_roles_with_details(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    role_id UUID,
    is_primary BOOLEAN,
    assigned_at TIMESTAMPTZ,
    assigned_by UUID,
    role_key TEXT,
    role_name TEXT,
    role_description TEXT,
    permissions JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ur.id,
        ur.user_id,
        ur.role_id,
        ur.is_primary,
        ur.assigned_at,
        ur.assigned_by,
        cr.role_key,
        cr.role_name,
        cr.description as role_description,
        cr.permissions
    FROM user_roles ur
    INNER JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = p_user_id
    ORDER BY ur.is_primary DESC, ur.assigned_at ASC;
END;
$$;

COMMENT ON FUNCTION get_user_roles_with_details IS 'Returns all roles assigned to a user with full role details';

-- ============================================================================
-- Step 8: Create trigger to sync primary role to profiles.role for backward compatibility
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_primary_role_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    primary_role_key TEXT;
BEGIN
    -- When a role is marked as primary, update profiles.role
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        IF NEW.is_primary = true THEN
            -- Get the role_key for this role
            SELECT cr.role_key INTO primary_role_key
            FROM custom_roles cr
            WHERE cr.id = NEW.role_id;

            -- Update the profiles.role column
            UPDATE profiles
            SET role = primary_role_key, updated_at = NOW()
            WHERE id = NEW.user_id;

            -- Unset primary flag on other roles for this user
            UPDATE user_roles
            SET is_primary = false
            WHERE user_id = NEW.user_id
            AND id != NEW.id
            AND is_primary = true;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS sync_primary_role_trigger ON user_roles;
CREATE TRIGGER sync_primary_role_trigger
    AFTER INSERT OR UPDATE OF is_primary ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION sync_primary_role_to_profile();

COMMENT ON FUNCTION sync_primary_role_to_profile IS 'Syncs primary role to profiles.role column for backward compatibility';

-- ============================================================================
-- Done! The user_roles table is ready for use.
-- ============================================================================
