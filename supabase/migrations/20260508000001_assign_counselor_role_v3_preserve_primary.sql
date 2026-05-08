-- =====================================================================
-- Counselor Taxonomy Phase 3.2 — preserve existing primary role on assignment
-- Date: 2026-05-08
-- Spec:  follow-up to 20260430_assign_counselor_role_accept_role_key.sql
--
-- Bug context
-- -----------
-- Prior to this migration, assign_counselor_role(p_user_id, p_is_primary,
-- p_role_key) had p_is_primary DEFAULT true. The Add Counselor dialog at
-- app/(routes)/admission/counselors/_components/add-counselor-dialog.tsx
-- never sent p_is_primary, so PostgREST filled in the SQL DEFAULT and
-- every counselor assignment ran the demote-then-insert-primary path.
--
-- Combined with the AFTER-INSERT trigger sync_primary_role_to_profile()
-- (defined in 20251128_add_multi_role_support.sql, last replaced in
-- 20260430_counselor_taxonomy_phase3_rename_and_expo.sql), this caused:
--   1. The user's existing primary user_roles row was demoted (is_primary=false).
--   2. The new counselor role was inserted as is_primary=true.
--   3. The trigger mirrored the new counselor key into profiles.role,
--      overwriting the user's prior identity (e.g. 'student').
--
-- Symptom: a learner added as a learner_counselor / staff_counselor / etc.
-- had their profiles.role flipped to the counselor key. Both rows still
-- existed in user_roles, but downstream modules that gate on profiles.role
-- (admission lead routing, counselor list enrichment by admission_counselor /
-- expo_counselor only) stopped recognizing the user.
--
-- Fix
-- ---
-- New default behavior: PRESERVE the user's existing primary. The new
-- counselor role is inserted with is_primary=false whenever the user
-- already has any other primary user_roles row. Only when the user has NO
-- primary at all (rare, broken-data case) does the new counselor row
-- become primary — keeping the historical "first role wins" semantics.
--
-- Caller can still force the old behavior with explicit p_is_primary=true,
-- or force non-primary with p_is_primary=false. The default is now NULL
-- (auto-decide).
--
-- Backwards compatibility
-- -----------------------
-- The function signature gains a NULL default in place of `true`. Existing
-- 3-arg callers passing an explicit boolean are unaffected. Callers that
-- omit p_is_primary now get auto-detect instead of forced primary — this
-- is the desired correction. No callers in the codebase pass an explicit
-- p_is_primary=true today; the dialog never sent it at all.
--
-- Idempotent: CREATE OR REPLACE on the same 3-arg signature.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.assign_counselor_role(
  p_user_id    uuid,
  p_is_primary boolean DEFAULT NULL,
  p_role_key   text    DEFAULT 'admission_counselor'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role_id        uuid;
    v_caller         uuid := auth.uid();
    v_has_primary    boolean;
    v_make_primary   boolean;
    v_allowed_keys   text[] := ARRAY[
      'admission_counselor',
      'expo_counselor',
      'learner_counselor',
      'staff_counselor'
    ];
BEGIN
    IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.counselors.create')) THEN
        RAISE EXCEPTION 'Insufficient permission to assign counsellor role'
            USING ERRCODE = '42501';
    END IF;

    IF NOT (COALESCE(p_role_key, 'admission_counselor') = ANY(v_allowed_keys)) THEN
        RAISE EXCEPTION 'role_key % is not assignable through assign_counselor_role (allowed: %)',
            p_role_key, v_allowed_keys
            USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM admission_counselors
         WHERE user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'No admission_counselors row exists for user_id %', p_user_id
            USING ERRCODE = '23503';
    END IF;

    SELECT id INTO v_role_id
      FROM custom_roles
     WHERE role_key = COALESCE(p_role_key, 'admission_counselor');

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'No custom_role found for role_key %', p_role_key
            USING ERRCODE = '23503';
    END IF;

    IF EXISTS (
        SELECT 1 FROM user_roles
         WHERE user_id = p_user_id
           AND role_id = v_role_id
    ) THEN
        RETURN;
    END IF;

    -- Decide is_primary:
    --   - explicit TRUE  → caller forces primary (historical behavior; demote-then-insert)
    --   - explicit FALSE → caller forces additive (no demote, never primary)
    --   - NULL (default) → auto: primary only if user has no other primary yet
    SELECT EXISTS (
        SELECT 1 FROM user_roles
         WHERE user_id = p_user_id AND is_primary = true
    ) INTO v_has_primary;

    v_make_primary := CASE
        WHEN p_is_primary IS TRUE  THEN true
        WHEN p_is_primary IS FALSE THEN false
        ELSE NOT v_has_primary
    END;

    -- Only demote when this insert will actually be primary. Required to
    -- satisfy the partial unique index idx_user_roles_primary_unique
    -- (user_id WHERE is_primary=true) before the AFTER-INSERT trigger
    -- sync_primary_role_to_profile fires.
    IF v_make_primary THEN
        UPDATE user_roles
           SET is_primary = false
         WHERE user_id = p_user_id
           AND is_primary = true;
    END IF;

    INSERT INTO user_roles (user_id, role_id, is_primary, assigned_by)
    VALUES (p_user_id, v_role_id, v_make_primary, v_caller);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.assign_counselor_role(uuid, boolean, text) TO authenticated;

-- Verification:
--   SELECT proname, pg_get_function_arguments(oid)
--     FROM pg_proc
--    WHERE proname = 'assign_counselor_role';
--   Expect:
--     "p_user_id uuid, p_is_primary boolean DEFAULT NULL::boolean, p_role_key text DEFAULT 'admission_counselor'::text"
