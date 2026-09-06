-- ============================================================================
-- INSTITUTIONS CAN BE EXCLUDED FROM THE HR MODULE (2026-09-06) — PART A
--
-- Staff have long been filtered into HR by CATEGORY
-- (employment_categories.included_in_hr). This adds the second axis HR asked
-- for: whole institutions that are not part of the HR module at all.
--
-- WHY THE FLAG GOES ON hr_organizations AND NOT ON institutions.
--
-- The obvious move is to copy the category pattern -- a boolean read by a view.
-- That pattern is weaker than it looks: `included_in_hr` is enforced in exactly
-- four objects (v_hr_staff, v_hr_leave_balance_src, fn_is_hr_staff,
-- fn_my_hr_context), and v_hr_staff is read by only four database functions and
-- eight TypeScript files, while 20+ HR services query `staff` directly. A second
-- flag in the same position would inherit the same partial coverage.
--
-- hr_organizations is where the leverage is. Four functions resolve which HR
-- orgs a caller can see, and fn_my_hr_organization_ids() alone backs 23 RLS
-- policies across 11 tables. Filtering there puts the institution gate INSIDE
-- the row-security path, which the category gate never reached. It is also the
-- HR module's own tenant table -- it already carries is_payroll_entity -- so an
-- HR-scoped flag belongs there rather than on the institutions table every other
-- module shares.
--
-- DEFAULT TRUE MAKES THIS MIGRATION A NO-OP. Every one of the 14 organizations
-- stays included, so no staff, balance or application changes visibility until
-- somebody flips a toggle. Baseline measured immediately before applying:
-- 573 HR staff, 5,776 balances, 1,222 applications. Those numbers must be
-- identical afterwards, and that is the check that this part is safe.
--
-- sync_institution_to_hr_org is deliberately NOT changed: a newly created
-- institution keeps getting an HR organization, now with included_in_hr = true.
-- Defaulting new institutions to excluded would reproduce the silent-empty-state
-- failure that the category flag's TRUE default exists to avoid.
-- ============================================================================

ALTER TABLE public.hr_organizations
  ADD COLUMN IF NOT EXISTS included_in_hr boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.hr_organizations.included_in_hr IS
  'False excludes this institution from the HR module entirely: its staff leave every HR list, and its own staff lose HR self-service. Data is retained and hidden, never deleted — re-enabling restores everything. Default true.';

-- ---------------------------------------------------------------------------
-- The four org resolvers
--
-- NOTE THE PARENTHESES. Each of these had a WHERE built from OR'd branches.
-- Appending "AND o.included_in_hr" without wrapping them would bind to the LAST
-- branch only (A OR B AND C parses as A OR (B AND C)), leaving the first branch
-- ungated — an excluded institution would stay visible to exactly the callers
-- who reach it through that branch, which is the hardest kind of gap to notice.
--
-- Signatures are unchanged, so CREATE OR REPLACE keeps each function's existing
-- ACL. No DROP, and therefore no re-GRANT: a DROP here would take the grants
-- with it and hand EXECUTE back to PUBLIC, which includes anon.
-- ---------------------------------------------------------------------------

-- Backs 23 RLS policies across 11 tables. The single highest-leverage line in
-- this migration, and the one to check first if HR ever goes empty.
CREATE OR REPLACE FUNCTION public.fn_my_hr_organization_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT o.id), ARRAY[]::uuid[])
  FROM public.hr_organizations o
  WHERE o.included_in_hr
    AND (
      public.role_has_institution_access(o.institution_id)
      OR o.institution_id IN (
           SELECT s.institution_id FROM public.staff s
           WHERE s.profile_id = auth.uid() AND s.is_active
         )
    );
$function$;

-- The institution picker. Filtering here is what removes an excluded
-- institution from every HR dropdown, for super admins too.
CREATE OR REPLACE FUNCTION public.fn_hr_orgs_for_institutions()
RETURNS TABLE(institution_id uuid, hr_organization_id uuid, organization_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT o.institution_id, o.id, o.name
  FROM public.hr_organizations o
  WHERE o.institution_id IS NOT NULL
    AND o.included_in_hr
    AND public.role_has_institution_access(o.institution_id)
$function$;

CREATE OR REPLACE FUNCTION public.fn_my_designated_hr_org_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH own AS (
    SELECT s.institution_id AS id
    FROM public.staff s
    WHERE s.profile_id = auth.uid() AND s.is_active
  )
  SELECT COALESCE(array_agg(DISTINCT o.id), ARRAY[]::uuid[])
  FROM public.hr_organizations o
  WHERE o.included_in_hr
    AND (
      o.institution_id IN (SELECT id FROM own)
      OR o.institution_id IN (
           SELECT sib.id
           FROM public.institutions sib
           JOIN public.institutions mine ON mine.counselling_code = sib.counselling_code
           WHERE mine.counselling_code IS NOT NULL
             AND mine.id IN (SELECT id FROM own)
         )
      OR o.institution_id IN (
           SELECT uia.institution_id
           FROM public.user_institution_access uia
           WHERE uia.user_id = auth.uid() AND uia.is_active
         )
    );
$function$;

CREATE OR REPLACE FUNCTION public.hr_staff_visible_org_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT o.id), ARRAY[]::uuid[])
  FROM public.hr_organizations o
  JOIN public.staff s ON s.institution_id = o.institution_id
  WHERE o.included_in_hr
    AND s.profile_id = auth.uid();
$function$;
