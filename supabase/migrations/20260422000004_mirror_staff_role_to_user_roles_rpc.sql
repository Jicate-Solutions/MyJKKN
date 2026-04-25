-- 2026-04-22 - RPC to mirror a staff row's role_key into user_roles, callable
-- from the browser by any user with staff.create permission.
--
-- Context / why this exists
-- -------------------------
-- The user_roles INSERT RLS policy requires roles.create:
--   WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('roles.create'))
-- Staff-creator roles (HOD, administrator, digital_coordinator) only have
-- staff.create — intentionally, so they cannot assign arbitrary roles to
-- arbitrary users. But the staff-creation flow derives the role from the
-- staff's own role_key, not user choice, so this specific mirror is safe.
--
-- Previously we tried to solve this by routing through /api/staff with
-- supabaseAdmin. That works only when the direct-insert path fails RLS and
-- falls back to the API route. For HOD, the direct-insert path _succeeds_
-- (staff INSERT policy: staff.create + role_has_institution_access), so the
-- API route is never called and the client-side UserRolesService.assignRoles
-- still hits the user_roles INSERT RLS block. See PR #326 (partial fix).
--
-- Authorization
-- -------------
-- This function is SECURITY DEFINER, so it bypasses RLS inside the body. The
-- safety gates are enforced explicitly:
--   1. Caller must have staff.create (or be admin/super_admin). Prevents
--      arbitrary callers from assigning roles.
--   2. Target (profile_id, role_key) must match an existing staff row.
--      Prevents drive-by role assignment to non-staff profiles or with a
--      role_key different from what the staff row carries.
--
-- search_path is pinned to close the classic definer-hijack vector.

CREATE OR REPLACE FUNCTION public.mirror_staff_role_to_user_roles(
    p_profile_id uuid,
    p_role_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role_id uuid;
    v_caller uuid := auth.uid();
BEGIN
    -- 1. Caller authorization
    IF NOT (is_super_admin() OR is_admin() OR user_has_permission('staff.create')) THEN
        RAISE EXCEPTION 'Insufficient permission to mirror staff role'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Target must be a staff-linked profile with matching role_key
    IF NOT EXISTS (
        SELECT 1 FROM staff s
        WHERE s.profile_id = p_profile_id
          AND s.role_key = p_role_key
    ) THEN
        RAISE EXCEPTION 'profile_id % is not linked to a staff row with role_key %',
            p_profile_id, p_role_key
            USING ERRCODE = '23503';
    END IF;

    -- 3. Resolve role_id
    SELECT id INTO v_role_id
    FROM custom_roles
    WHERE role_key = p_role_key;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'No custom_role found for role_key %', p_role_key
            USING ERRCODE = '23503';
    END IF;

    -- 4. Upsert (delete stale + insert fresh). Matches UserRolesService.assignRoles semantics.
    DELETE FROM user_roles WHERE user_id = p_profile_id;

    INSERT INTO user_roles (user_id, role_id, is_primary, assigned_by)
    VALUES (p_profile_id, v_role_id, true, v_caller);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mirror_staff_role_to_user_roles(uuid, text) TO authenticated;
