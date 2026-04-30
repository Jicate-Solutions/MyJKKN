-- =====================================================================
-- Counselor Taxonomy Phase 3.1 — make assign_counselor_role role-key aware
-- Spec:  specs/counselor-taxonomy-spec.md (Phase 3 follow-up)
-- Background:
--   The 2026-04-30 rename migration left assign_counselor_role hard-coded to
--   role_key='admission_counselor'. The /admission/counselors Add Counselor
--   dialog needs to assign expo_counselor (and optionally learner_counselor /
--   staff_counselor) the same way. Adding an optional p_role_key parameter
--   keeps every existing caller working (default = 'admission_counselor') and
--   only opens the door for the dialog to pick a sibling role.
--
-- Allowlist:
--   admission_counselor, expo_counselor, learner_counselor, staff_counselor
--   (health_counselor is intentionally excluded — its confidentiality contract
--   means it should never be assigned through a generic admin UI; only Role
--   Management grants it.)
--
-- Idempotency: CREATE OR REPLACE FUNCTION; safe to re-run.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.assign_counselor_role(
  p_user_id    uuid,
  p_is_primary boolean DEFAULT true,
  p_role_key   text    DEFAULT 'admission_counselor'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role_id     uuid;
    v_caller      uuid := auth.uid();
    v_allowed_keys text[] := ARRAY[
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

    -- Demote any existing primary first to satisfy partial unique index
    -- idx_user_roles_primary_unique (user_id WHERE is_primary=true).
    IF COALESCE(p_is_primary, true) = true THEN
        UPDATE user_roles
           SET is_primary = false
         WHERE user_id = p_user_id
           AND is_primary = true;
    END IF;

    INSERT INTO user_roles (user_id, role_id, is_primary, assigned_by)
    VALUES (p_user_id, v_role_id, COALESCE(p_is_primary, true), v_caller);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.assign_counselor_role(uuid, boolean, text) TO authenticated;

-- The 2-arg variant is preserved automatically (CREATE OR REPLACE on the
-- 2-arg signature is a NO-OP here because the 3-arg version is a brand-new
-- overload). To prevent ambiguity we DROP the old 2-arg signature so callers
-- always resolve to the 3-arg function with p_role_key defaulted.
-- This is safe because the 3-arg version handles the original 2-arg call site
-- (rpc('assign_counselor_role', { p_user_id, p_is_primary }) — Supabase fills
-- p_role_key with the DEFAULT 'admission_counselor').
DROP FUNCTION IF EXISTS public.assign_counselor_role(uuid, boolean);

-- Verification:
--   SELECT proname, pg_get_function_arguments(oid)
--     FROM pg_proc
--    WHERE proname = 'assign_counselor_role';
--   Expect a single row:
--     "p_user_id uuid, p_is_primary boolean DEFAULT true, p_role_key text DEFAULT 'admission_counselor'::text"
