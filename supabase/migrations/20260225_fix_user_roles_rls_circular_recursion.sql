-- ================================================================
-- Fix: user_roles RLS circular recursion → HTTP 500
-- Root cause: "Managers can view all user roles" and
--             "Managers can manage user roles" both JOIN user_roles
--             inside a policy enforced ON user_roles
--             → PostgreSQL infinite recursion → stack overflow → 500.
-- Solution:   SECURITY DEFINER functions bypass RLS on read → no loop.
-- ================================================================

-- Step 1: Create get_current_user_role()
-- Reads profiles.role for auth.uid() — no reference to user_roles → safe
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Step 2: Create current_user_has_permission(permission_key)
-- Reads user_roles + custom_roles via SECURITY DEFINER → RLS bypassed
-- → calling this from a user_roles policy does NOT re-trigger that policy
CREATE OR REPLACE FUNCTION current_user_has_permission(permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        INNER JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = auth.uid()
          AND (cr.permissions ->> permission_key)::boolean = true
    );
$$;

-- Step 3: Drop the two self-referencing policies
DROP POLICY IF EXISTS "Managers can view all user roles" ON user_roles;
DROP POLICY IF EXISTS "Managers can manage user roles"  ON user_roles;

-- Step 4a: Safe SELECT policy
-- "Users can view own roles" already covers auth.uid() = user_id;
-- included here for explicitness and to fully replace the dropped policy.
CREATE POLICY "user_roles_select_managers"
    ON user_roles
    FOR SELECT
    USING (
        auth.uid() = user_id
        OR current_user_has_permission('users.manage')
        OR get_current_user_role() = 'super_admin'
    );

-- Step 4b: Safe ALL (INSERT/UPDATE/DELETE) policy
CREATE POLICY "user_roles_manage_admins"
    ON user_roles
    FOR ALL
    USING (
        current_user_has_permission('users.manage')
        OR get_current_user_role() = 'super_admin'
    )
    WITH CHECK (
        current_user_has_permission('users.manage')
        OR get_current_user_role() = 'super_admin'
    );
