-- ============================================================================
-- Teach user_has_permission() to read Director handovers — as its LAST resort.
--
-- Date: 2026-08-04
-- Spec: specs/director-desk/SPEC.md
-- Depends on: 20260811100000_director_handovers_spine.sql
--
-- ⚠️  THIS IS THE HIGHEST-BLAST-RADIUS FUNCTION ON THE PLATFORM.
--     4,093 call sites across 595 migration files. Every RLS policy that gates
--     anything routes through it. If it breaks or slows down, every page on
--     jkkn.ai breaks. Read the three guarantees below before changing anything.
--
-- GUARANTEE 1 — the first three checks are untouched.
-- The super-admin bypass, the multi-role OR-merge, and the legacy
-- profiles.role fallback are reproduced verbatim from 20260603153624. The ONLY
-- edit is that the legacy check's `RETURN EXISTS(...)` becomes
-- `IF EXISTS(...) THEN RETURN true; END IF;` so a fourth check can follow it.
-- Same inputs, same answers, for every user who already had access.
--
-- GUARANTEE 2 — zero added cost on the normal path.
-- The handover lookup is reached ONLY when all three role checks have already
-- returned false. A user who holds a page by role never touches the handover
-- table. Only a user who would otherwise be DENIED pays one indexed lookup
-- (partial index on live rows + GIN on the key array). The denial path was
-- already the cheap path, and it stays cheap.
--
-- GUARANTEE 3 — volatility is preserved.
-- The (text) overload stays STABLE so the planner keeps folding it into a
-- once-per-statement InitPlan instead of re-evaluating per row — the entire
-- point of 20260603153624. fn_handover_grants_key is STABLE to match; a
-- VOLATILE callee would silently destroy that optimisation across hundreds of
-- policies and turn this into a platform-wide performance regression.
--
-- VALIDATION BEFORE APPLYING (feedback_validate_migration_via_mgmt_api_begin_rollback)
-- Rehearse in BEGIN..ROLLBACK, and verify residue is 0 in a SEPARATE call —
-- the management API wraps a whole batch in one transaction, so a verify query
-- sent alongside the rollback proves nothing
-- (feedback_mgmt_api_wraps_whole_batch_in_one_txn).
--
-- The regression test that matters is NOT "does the new grant work" but "does
-- every existing holder still get true". Assert both, as a real role holder and
-- never as a super admin — they short-circuit at check one and prove nothing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (text) overload — the RLS-critical one. STABLE preserved.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
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

    -- ---- NEW: Director handover, the last resort -------------------------
    -- Reached only when every role check above has said no. This is what makes
    -- "assigning someone IS the permission" true across all 4,093 call sites
    -- without rewriting a single policy.
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

-- ----------------------------------------------------------------------------
-- (uuid, text) overload — called standalone via RPC, not in row predicates.
-- Volatility intentionally left as-is (see 20260603153624): marking it STABLE
-- buys nothing here and would be an unrelated change smuggled into a
-- high-risk migration.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_permission(user_id uuid, permission_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

NOTIFY pgrst, 'reload schema';
