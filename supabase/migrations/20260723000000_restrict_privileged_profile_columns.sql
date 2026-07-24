-- ============================================================================
-- Migration: restrict_privileged_profile_columns
-- Date: 2026-07-23
-- Security fix: F3 — Mass-assignment / privilege escalation on public.profiles
--               (CWE-915). Category: privilege-escalation.
--
-- Problem
-- -------
-- The profiles UPDATE policies (profiles_update_policy in
-- 20251210_optimize_rls_policies.sql:376-385 and the FOR ALL
-- profiles_service_role_access in 20251015_rollback_broken_policies.sql:22-29)
-- only enforce ROW ownership: an authenticated user may update their OWN
-- profile row (auth.uid() = id), or service_role may update any row. RLS has
-- no column-level restriction, and no trigger blocked privileged columns. So
-- any logged-in user could run, straight from the browser with the public anon
-- key and their own session:
--     supabase.from('profiles').update({ role: 'super_admin' }).eq('id', myId)
-- and escalate to super_admin (or move themselves into another tenant via
-- institution_id, reactivate a disabled account via is_active, etc.).
--
-- Fix (load-bearing, DB-level)
-- ----------------------------
-- A BEFORE UPDATE trigger on public.profiles that rejects any change to a
-- privilege-, tenant-, account-, or identity-bearing column when the writer is
-- a PostgREST client role (anon / authenticated). The check fires only when the
-- value ACTUALLY changes (IS DISTINCT FROM), so ordinary self-service updates
-- of full_name / phone_number / avatar_url / bio / gender / designation /
-- date_of_birth / profile_completed / last_login pass through untouched.
--
-- Schema-drift safe: the protected columns are compared through
-- to_jsonb(NEW)/to_jsonb(OLD) and a column is only enforced when it actually
-- exists on this database's profiles table (the `new_row ? col` key test). This
-- matters because production and staging differ — is_login_disabled and
-- accreditation_default_college_id exist in production but not in staging. A
-- statically-referenced NEW.is_login_disabled would raise
-- "record new has no field ..." at runtime on any environment missing the
-- column, breaking EVERY profile update there. The jsonb approach checks only
-- present columns, so the same migration is correct on every environment.
--
-- is_super_admin is deliberately NOT protected here: it is a GENERATED ALWAYS
-- column (AS (role = 'super_admin')) on both staging and production, so no
-- client can ever write it directly (PostgreSQL rejects writes to generated
-- columns), and it can only change when `role` changes — which IS protected.
-- Listing it would also be actively wrong: inside a BEFORE UPDATE trigger a
-- generated column is not yet computed, so NEW.is_super_admin reads as NULL
-- while OLD holds the stored value, making it look "changed" on EVERY update
-- and blocking all legitimate self-service edits. Protecting `role` fully
-- covers the escalation path.
--
-- Trusted writers are exempt and keep working:
--   * service_role  — every server-side admin operation (role changes via
--     /api/users/[id]/role, activation via /api/users/[id]/toggle-status and
--     /api/users/manage-auth, bulk role update, the auth callback's profile
--     creation/migration, bulk-learner-upload) uses the service-role key, so
--     auth.role() = 'service_role'.
--   * internal / privileged DB roles — the SECURITY DEFINER trigger functions
--     that legitimately mirror privileged columns into profiles
--     (sync_staff_to_profiles, sync_staff_department_to_profile,
--      sync_primary_role_to_profile, auto_link_profile_to_approved_learner)
--     execute as their owner ('postgres'), and migrations run as a superuser.
--     Those effective roles are not PostgREST client roles, so they bypass.
--
-- Because RLS already restricts a client-role caller to updating only its own
-- row, this trigger's net new effect is exactly: an authenticated user can no
-- longer change these columns on their own profile. There is no legitimate
-- self-service flow that does so — onboarding (app/auth/complete-profile,
-- app/(routes)/profile) only writes personal fields + profile_completed, which
-- are NOT in the protected set.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP/CREATE TRIGGER.
--
-- Rollback / down
-- ---------------
--   DROP TRIGGER IF EXISTS trg_enforce_profile_privileged_columns ON public.profiles;
--   DROP FUNCTION IF EXISTS public.enforce_profile_privileged_columns();
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER          -- must see the CALLER's effective role (current_user)
SET search_path = public
AS $$
DECLARE
    -- Privilege-, tenant-, account-, and identity-bearing columns. Only the
    -- ones that actually exist on this database's profiles table are enforced
    -- (see the `new_row ? col` guard below), so the trigger is safe across
    -- schema drift between environments.
    -- is_super_admin intentionally excluded: GENERATED ALWAYS from role (see header).
    protected_cols CONSTANT text[] := ARRAY[
        'role', 'is_active', 'is_login_disabled',
        'institution_id', 'department_id', 'is_pre_registered',
        'learner_id', 'programme_id', 'accreditation_default_college_id'
    ];
    col      text;
    new_row  jsonb := to_jsonb(NEW);
    old_row  jsonb := to_jsonb(OLD);
BEGIN
    -- Trusted writers bypass the column guard entirely.
    --   auth.role() = 'service_role'        -> server-side admin ops (service key)
    --   current_user NOT IN (client roles)  -> SECURITY DEFINER trigger functions
    --                                          (run as owner 'postgres') and
    --                                          migrations / direct DB admin.
    IF auth.role() = 'service_role'
       OR current_user NOT IN ('anon', 'authenticated', 'authenticator') THEN
        RETURN NEW;
    END IF;

    -- Caller is a PostgREST client role (anon/authenticated). RLS already limits
    -- it to its own row; forbid changes to privileged columns on that row.
    -- Only columns that exist here (new_row ? col) and whose value actually
    -- changes (IS DISTINCT FROM, NULL-safe on jsonb) are rejected.
    FOREACH col IN ARRAY protected_cols LOOP
        IF (new_row ? col)
           AND (new_row -> col) IS DISTINCT FROM (old_row -> col) THEN
            RAISE EXCEPTION
                'Not allowed: privileged profile column "%" can only be changed by an administrator.', col
                USING ERRCODE = '42501';  -- insufficient_privilege
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_profile_privileged_columns() IS
'Security fix F3 (CWE-915): blocks anon/authenticated (PostgREST client-role) callers from changing privilege/tenant/account/identity columns on profiles. Compares columns via to_jsonb so it is safe across schema drift (only enforces columns that exist). is_super_admin is excluded because it is a generated column derived from role (which is protected). service_role and SECURITY DEFINER trigger functions (owner=postgres) bypass. Fires only on actual value changes.';

DROP TRIGGER IF EXISTS trg_enforce_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_enforce_profile_privileged_columns
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_profile_privileged_columns();

COMMIT;
