-- ════════════════════════════════════════════════════════════════════════════
-- 20260521_role_has_institution_access_cas_aware.sql
-- ────────────────────────────────────────────────────────────────────────────
-- Make role_has_institution_access(uuid) treat CAS Aided + Self-Financing
-- institutions as one logical institution per shared counselling_code.
--
-- WHAT WAS BROKEN
--   The function previously required the target institution to equal the
--   user's own profile.institution_id (or be granted via user_institution_access).
--   For CAS colleges the institution is split into two MyJKKN UUIDs that share
--   one counselling_code — the same logical college. RLS policies calling
--   role_has_institution_access(check_institution_id) therefore rejected the
--   sibling UUID, even though every BoS/admission/staff workflow on top
--   already treats the pair as one institution.
--
-- REPRO (2026-05-21)
--   User: gokila.s@jkkn.ac.in  (role=hod, inst=a33138b6… — CAS Aided)
--   Op:   POST /api/bos/boards/[id]/programmes (UPSERT on conflict)
--   The board's existing UCM row had institutions_id=b0b8a724… (CAS Self).
--   UPSERT resolved to UPDATE; USING clause checked the existing row's
--   institutions_id; role_has_institution_access(b0b8a724…) returned FALSE
--   even though Gokila's a33138b6… is the same college. 42501.
--
--   Confirmed by impersonated tests under Gokila's auth:
--     • upsert PCM (existing inst=a33138b6, own)  → OK
--     • upsert UCM (existing inst=b0b8a724, CAS sibling)  → 42501
--   Holding everything else equal isolated the variable to the existing row's
--   institution UUID.
--
-- THE FIX
--   Insert a counselling_code sibling check between the own-institution branch
--   and the user_institution_access branch. NULL counselling_code is excluded
--   so non-CAS institutions don't accidentally become siblings of each other.
--
-- IMPACT
--   Every RLS policy that calls role_has_institution_access now treats the
--   user's CAS sibling as accessible. This is the *intended* behavior across
--   the codebase — bos-access.ts already resolves siblings on the application
--   side via resolveInstitutionContext, but DB-side policies were a lagging
--   layer. After this migration the two layers agree.
--   For non-CAS users (counselling_code NULL or unique) the function is
--   byte-for-byte equivalent to the previous version.
--
-- ROLLBACK
--   Restore the previous CREATE OR REPLACE FUNCTION body from
--   supabase/setup/02_functions.sql:6772-6829.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.role_has_institution_access(check_institution_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- NULL institution_id: always accessible (system-wide records)
    IF check_institution_id IS NULL THEN
        RETURN true;
    END IF;

    -- Super admin: always access all
    IF is_super_admin() THEN
        RETURN true;
    END IF;

    -- Check if ANY of user's roles has institution_scope = 'all'
    IF EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN custom_roles cr ON ur.role_id = cr.id
        WHERE ur.user_id = auth.uid()
          AND cr.institution_scope = 'all'
    ) THEN
        RETURN true;
    END IF;

    -- Legacy fallback: check profiles.role for scope
    IF EXISTS (
        SELECT 1
        FROM profiles p
        JOIN custom_roles cr ON p.role = cr.role_key
        WHERE p.id = auth.uid()
          AND cr.institution_scope = 'all'
    ) THEN
        RETURN true;
    END IF;

    -- Check own institution
    IF check_institution_id = get_current_user_institution_id() THEN
        RETURN true;
    END IF;

    -- CAS sibling check (NEW 2026-05-21):
    -- Two institutions sharing the same non-NULL counselling_code are siblings
    -- (CAS Aided + Self-Financing). Access to one ⇒ access to the other.
    IF EXISTS (
        SELECT 1
        FROM institutions i_self
        JOIN institutions i_sibling
          ON i_sibling.counselling_code = i_self.counselling_code
        WHERE i_self.id = get_current_user_institution_id()
          AND i_sibling.id = check_institution_id
          AND i_self.counselling_code IS NOT NULL
    ) THEN
        RETURN true;
    END IF;

    -- Check user_institution_access table (cross-institution grants)
    IF EXISTS (
        SELECT 1
        FROM user_institution_access uia
        WHERE uia.user_id = auth.uid()
          AND uia.institution_id = check_institution_id
          AND uia.is_active = true
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$function$;

COMMENT ON FUNCTION public.role_has_institution_access(uuid) IS
  'Returns true when the caller may access rows owned by check_institution_id. '
  'Recognizes super-admin, ''all'' scope roles, own institution, CAS counselling_code '
  'siblings (Aided+Self), and explicit user_institution_access grants. '
  'CAS-aware as of 2026-05-21.';
