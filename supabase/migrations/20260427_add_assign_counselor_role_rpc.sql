-- 2026-04-27 - RPC to assign the counselor role to a user, callable from the
-- browser by any user with admission.counselors.create permission.
--
-- Context / why this exists
-- -------------------------
-- The user_roles INSERT RLS policy requires roles.create:
--   WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('roles.create'))
-- The admission, admission_staff, and counselor roles deliberately do NOT have
-- roles.create — they should not be able to assign arbitrary roles to arbitrary
-- users. But the counselor add-flow only ever assigns ONE specific role
-- (counselor) to ONE specific kind of profile (one with an admission_counselors
-- row), so this targeted RPC is safe.
--
-- Without this RPC, the previous client-side `supabase.from('user_roles').insert(...)`
-- in app/(routes)/admission/counselors/_components/add-counselor-dialog.tsx
-- silently failed when the caller lacked roles.create. The Supabase JS SDK
-- returns RLS denials in {error}, not as a thrown exception, and the dialog
-- never destructured the error, so the user saw "Counselor added successfully"
-- while user_roles stayed empty. Two counselors created on 2026-04-27 04:37 UTC
-- ended up in admission_counselors with no corresponding user_roles row.
--
-- Mirrors the pattern of mirror_staff_role_to_user_roles() (migration
-- 20260422000004) which solved the same RLS problem for the staff flow.
--
-- Authorization
-- -------------
-- SECURITY DEFINER, so RLS is bypassed inside the body. Safety gates:
--   1. Caller must have admission.counselors.create (or be admin/super_admin).
--   2. Target must already have an admission_counselors row, so this can't be
--      used to drive-by-assign counselor to arbitrary profiles.
--
-- search_path is pinned to close the classic definer-hijack vector.

CREATE OR REPLACE FUNCTION public.assign_counselor_role(
    p_user_id uuid,
    p_is_primary boolean DEFAULT true
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
    IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.counselors.create')) THEN
        RAISE EXCEPTION 'Insufficient permission to assign counselor role'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Target must already have an admission_counselors row.
    -- Prevents drive-by role assignment to arbitrary profiles.
    IF NOT EXISTS (
        SELECT 1 FROM admission_counselors
        WHERE user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'No admission_counselors row exists for user_id %', p_user_id
            USING ERRCODE = '23503';
    END IF;

    -- 3. Resolve counselor role_id
    SELECT id INTO v_role_id
    FROM custom_roles
    WHERE role_key = 'counselor';

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'No custom_role found for role_key counselor'
            USING ERRCODE = '23503';
    END IF;

    -- 4. Idempotent: skip if already assigned (matches existing client-side
    -- "if existing return" guard, which we keep on the client side too as a
    -- micro-optimization to avoid a needless RPC call).
    IF EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = p_user_id AND role_id = v_role_id
    ) THEN
        RETURN;
    END IF;

    -- 5. Demote any existing primary row first. The partial unique index
    -- idx_user_roles_primary_unique (user_id WHERE is_primary=true) is
    -- checked at INSERT time, before the sync_primary_role_trigger AFTER-
    -- INSERT step that would otherwise demote it. Without this pre-demote,
    -- counselor candidates who already have a primary role from the
    -- auto_assign_student_role trigger (every learner does) hit a 23505
    -- unique violation. Doing this in the same SECURITY DEFINER tx keeps
    -- it atomic.
    IF COALESCE(p_is_primary, true) = true THEN
        UPDATE user_roles
        SET is_primary = false
        WHERE user_id = p_user_id
          AND is_primary = true;
    END IF;

    -- 6. Insert. With is_primary=true, the sync_primary_role_trigger fires
    -- and mirrors 'counselor' into profiles.role — matching the historical
    -- pattern (all 8 successful counselors as of 2026-04-27 have
    -- is_primary=true and profiles.role='counselor').
    INSERT INTO user_roles (user_id, role_id, is_primary, assigned_by)
    VALUES (p_user_id, v_role_id, COALESCE(p_is_primary, true), v_caller);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_counselor_role(uuid, boolean) TO authenticated;
