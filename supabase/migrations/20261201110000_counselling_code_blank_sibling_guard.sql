-- ============================================================================
-- Close the blank-counselling_code sibling hole in role_has_institution_access
-- Created: 2026-09-12
--
-- THE HOLE
--   role_has_institution_access() treats two institutions that share a
--   counselling_code as "CAS siblings" (Aided + Self-Financing are one
--   admissions entity), and grants access to one from the other. The guard on
--   that rule was:
--       AND i_self.counselling_code IS NOT NULL
--   IS NOT NULL does not exclude the EMPTY STRING. Two institutions with
--   counselling_code = '' would therefore become mutual siblings the instant
--   they existed, and this function backs 777 RLS policies — so the blast
--   radius is the whole platform, not one screen.
--
--   Verified on production 2026-09-12: the column is nullable, has NO default,
--   and carries ZERO rows in pg_constraint. Nothing prevented that state; it
--   simply had not happened yet. 14 institutions, 0 empty, 0 whitespace-only,
--   0 untrimmed. Clean by luck, not by design.
--
-- WHY THIS IS SAFE TO APPLY TO A FUNCTION 777 POLICIES DEPEND ON
--   The change can only ever turn a TRUE into a FALSE, and only for a code
--   that is blank or whitespace. Evaluated over all 196 institution pairs on
--   production, the sibling relation is IDENTICAL before and after:
--   16 sibling pairs both ways, 0 behaviour changes. It is a no-op on today's
--   data and a guard on tomorrow's.
--
-- TWO LAYERS, DELIBERATELY
--   1. The function guard fixes the authorization rule even if bad data exists.
--   2. The CHECK constraint stops the bad data existing at all. Either alone
--      would do; together, neither a future writer nor a future edit of this
--      function can reopen it silently.
--
-- GRANTS ARE NOT TOUCHED. CREATE OR REPLACE preserves the existing ACL, and
-- that ACL is load-bearing: `anon` holds EXECUTE because RLS policy
-- expressions are evaluated as the querying role, so unauthenticated pages
-- whose tables carry these policies need it. The explicit GRANTs below restate
-- the CURRENT production ACL exactly (verified via pg_proc.proacl) — they are
-- idempotent, they document that anon access is intended rather than
-- accidental, and they satisfy scripts/ci/check-secdef-anon-revoke.mjs, whose
-- intentional-public escape hatch this is. DO NOT "harden" this by revoking
-- anon: that breaks every unauthenticated page in one commit.
-- ============================================================================

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
    --
    -- 2026-09-12: the blank guard below is the fix. IS NOT NULL alone let a
    -- pair of institutions with counselling_code = '' become mutual siblings.
    -- A NULL code never joins (NULL = NULL is not true), so the equality join
    -- already handles NULLs; the empty string is what slipped through, because
    -- '' = '' IS true.
    IF EXISTS (
        SELECT 1
        FROM institutions i_self
        JOIN institutions i_sibling
          ON i_sibling.counselling_code = i_self.counselling_code
        WHERE i_self.id = get_current_user_institution_id()
          AND i_sibling.id = check_institution_id
          AND i_self.counselling_code IS NOT NULL
          AND btrim(i_self.counselling_code) <> ''
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

-- Restates the current production ACL verbatim. See the header: anon EXECUTE
-- is required and intentional here. ci:allow-secdef-anon role_has_institution_access
-- is evaluated inside 777 RLS policies, including on tables reachable by anon;
-- without EXECUTE those policies error instead of returning false.
GRANT EXECUTE ON FUNCTION public.role_has_institution_access(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.role_has_institution_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.role_has_institution_access(uuid) TO service_role;

-- Layer 2: make the bad state unrepresentable. NULL stays legal — it is how an
-- institution says "no counselling code" and it never joins. Blank and
-- whitespace-only are rejected. Verified 0 existing rows violate this, so the
-- constraint validates immediately rather than needing NOT VALID.
ALTER TABLE public.institutions
  DROP CONSTRAINT IF EXISTS institutions_counselling_code_not_blank;

ALTER TABLE public.institutions
  ADD CONSTRAINT institutions_counselling_code_not_blank
  CHECK (counselling_code IS NULL OR btrim(counselling_code) <> '');
