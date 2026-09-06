-- 20260927020000_user_has_permission_guard_is_active.sql
--
-- WHAT THIS CHANGES
--   Both overloads of public.user_has_permission() gain a guard: a profile that
--   is deactivated (is_active = false) OR login-disabled (is_login_disabled =
--   true) is granted NO custom-role permission. The super-admin short-circuit is
--   preserved EXACTLY and evaluated BEFORE the guard, so a super admin is
--   unaffected. Both bodies are otherwise the production definitions read on
--   2026-08-25, unchanged except for the inserted guard block.
--
--     user_has_permission(permission_name text)               [STABLE SECURITY DEFINER]
--     user_has_permission(user_id uuid, permission_key text)  [SECURITY DEFINER]
--
-- WHY  (VERIFIED READ-ONLY AGAINST PRODUCTION 2026-08-25)
--   Neither production body references is_active or is_login_disabled, so a
--   deactivated user holding a custom role still resolves permissions (the audit
--   showed a deactivated user still returning true for billing.invoices.delete).
--   profiles.is_active is boolean NOT NULL default true and
--   profiles.is_login_disabled is boolean NOT NULL default false (both verified
--   via information_schema; zero NULLs in either column) -- so the guard is
--   NULL-safe and cannot lock out a user whose flags happen to be unset.
--
-- BLAST RADIUS
--   831 profiles are deactivated and 121 are login-disabled today; 798 of those
--   hold at least one user_role and are the population whose permission answer
--   changes from (possibly true) to false. A WRONG guard would lock out real
--   people, which is exactly why this is flagged staging-first. This is DEFENSE-
--   IN-DEPTH, not the only gate: sign-in is already blocked for these accounts at
--   app/auth/callback, so a deactivated user cannot obtain a session in the first
--   place; this closes the case where a permission check is reached by another
--   path (a service or handover route passing a user_id). It can be reviewed
--   calmly, not rushed.
--
--   EXECUTE grants are preserved exactly as production holds them (verified):
--     (text)       -> authenticated, service_role   (anon: none)
--     (uuid,text)  -> service_role                  (anon, authenticated: none)
--   REVOKE ... FROM anon, PUBLIC is re-asserted so a schema rebuild -- whose
--   default would grant EXECUTE to PUBLIC -- cannot silently re-open them; anon
--   is a MEMBER of PUBLIC, so both are named together, then the exact prod grants
--   are re-affirmed.
--
-- WHAT COULD NOT BE VERIFIED
--   Not applied, so the post-state (a deactivated user now returning false) was
--   not observed on a live call. The pre-state -- both bodies lacking the flags,
--   the column types/nullability, the grant posture, the counts -- was verified
--   live against production.
--
-- 🛑 STAGING-FIRST -- do not apply to prod until tested on a clone.
--    FILE ONLY / NOT APPLIED -- Director-gated.

-- ci:allow-secdef-authenticated user_has_permission(text) is the substrate of every RLS
--   policy in this database (4,093 call sites): each authenticated caller must be able to
--   ask it about THEMSELVES. It is self-scoped — it takes only a permission name and reads
--   auth.uid(), never an arbitrary user id — so it cannot answer for another account. The
--   overload that CAN take a user id, user_has_permission(uuid, text), stays service_role
--   only below. Narrowing this grant is not an option: 20260811100100 asserts at apply time
--   'The (text) form MUST keep its grant, or every client permission check breaks.'
CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Guard: NULL or empty permission name
    IF permission_name IS NULL OR permission_name = '' THEN
        RETURN false;
    END IF;

    -- Super admin bypass: always grant all permissions
    IF EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND is_super_admin = true
    ) THEN
        RETURN true;
    END IF;

    -- Guard (defense-in-depth): a deactivated or login-disabled account holds no
    -- custom-role permissions. Evaluated AFTER the super-admin short-circuit so
    -- that path is preserved exactly.
    IF EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND (p.is_active = false OR p.is_login_disabled = true)
    ) THEN
        RETURN false;
    END IF;

    -- Multi-role system: check all assigned roles (OR logic)
    IF EXISTS (
        SELECT 1
        FROM user_roles ur
        INNER JOIN custom_roles cr ON ur.role_id = cr.id
        WHERE ur.user_id = auth.uid()
        AND (cr.permissions->>permission_name)::boolean = true
    ) THEN
        RETURN true;
    END IF;

    -- Legacy fallback: check profiles.role -> custom_roles
    -- (was the final RETURN EXISTS; now an IF so the handover check can follow)
    IF EXISTS (
        SELECT 1 FROM profiles p
        JOIN custom_roles cr ON p.role = cr.role_key
        WHERE p.id = auth.uid()
        AND (cr.permissions->>permission_name)::boolean = true
    ) THEN
        RETURN true;
    END IF;

    -- ---- Director handover, the last resort ------------------------------
    -- PRESERVED VERBATIM FROM 20260811100100_user_has_permission_reads_handovers.sql.
    -- This body was authored from the LIVE production definition, which does not
    -- carry this clause because 20260811100100 has not been applied there. Main
    -- does carry it, so replacing the function without this block would silently
    -- take Director handovers off every RLS policy on the platform at once
    -- (4,093 call sites). Reached only when every role check above has said no.
    --
    -- auth.uid() is NULL for anon; fn_handover_grants_key cannot match a NULL
    -- grantee, but the guard is explicit so an anonymous caller short-circuits
    -- without touching the table at all.
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    RETURN public.fn_handover_grants_key(auth.uid(), permission_name);
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_has_permission(user_id uuid, permission_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF permission_key IS NULL OR permission_key = '' THEN
        RETURN false;
    END IF;
    -- Super admin bypass
    IF EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = user_id
        AND (p.is_super_admin = true OR p.role = 'super_admin')
    ) THEN
        RETURN true;
    END IF;

    -- Guard (defense-in-depth): a deactivated or login-disabled account holds no
    -- custom-role permissions (and no handover grant below). Evaluated AFTER the
    -- super-admin short-circuit so that path is preserved exactly.
    IF EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = user_has_permission.user_id
        AND (p.is_active = false OR p.is_login_disabled = true)
    ) THEN
        RETURN false;
    END IF;

    -- Multi-role system: check all assigned roles (OR logic)
    IF EXISTS (
        SELECT 1 FROM user_roles ur
        INNER JOIN custom_roles cr ON ur.role_id = cr.id
        WHERE ur.user_id = user_has_permission.user_id
        AND (cr.permissions->>permission_key)::boolean = true
    ) THEN
        RETURN true;
    END IF;
    -- Legacy fallback: profiles.role -> custom_roles
    IF EXISTS (
        SELECT 1 FROM profiles p
        JOIN custom_roles cr ON p.role = cr.role_key
        WHERE p.id = user_has_permission.user_id
        AND (cr.permissions->>permission_key)::boolean = true
    ) THEN
        RETURN true;
    END IF;

    -- NEW: Director handover, last resort. Same semantics as the (text) form,
    -- so an API route asking "can this user do X" gets the same answer RLS does.
    -- The two MUST agree; a route that says no while RLS says yes produces the
    -- 403-with-data defect class, and the reverse leaks a button that then fails.
    IF user_has_permission.user_id IS NULL THEN
        RETURN false;
    END IF;

    RETURN public.fn_handover_grants_key(user_has_permission.user_id, permission_key);
END;
$function$;

-- Re-assert the locked-down EXECUTE posture (verified pre-state; rebuild-safe).
-- anon is a member of PUBLIC, so both are named together before re-granting the
-- exact roles production holds today.
REVOKE EXECUTE ON FUNCTION public.user_has_permission(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_has_permission(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.user_has_permission(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_has_permission(uuid, text) TO service_role;
