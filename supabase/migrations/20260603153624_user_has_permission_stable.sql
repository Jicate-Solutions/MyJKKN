-- Mark user_has_permission(text) STABLE (was default VOLATILE). It only READS
-- profiles/user_roles/custom_roles and has no side effects, so within a single
-- statement it returns the same result for the same args — the definition of
-- STABLE. This lets the planner fold it into a once-per-statement InitPlan in the
-- HUNDREDS of RLS policies that call user_has_permission('<key>'), instead of
-- re-evaluating it per row (it scans 3 tables each call). Body is byte-identical
-- to the prior version; only the volatility marker changes. The (uuid, text)
-- overload is intentionally left as-is (called standalone via RPC, not in a row
-- predicate, so volatility there gives no caching benefit).
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
    RETURN EXISTS (
        SELECT 1 FROM profiles p
        JOIN custom_roles cr ON p.role = cr.role_key
        WHERE p.id = auth.uid()
        AND (cr.permissions->>permission_name)::boolean = true
    );
END;
$function$;

NOTIFY pgrst, 'reload schema';
