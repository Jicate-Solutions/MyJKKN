-- ============================================================================
-- THE INSTITUTION GATE REACHES THE REST OF THE HR TABLES (2026-09-06) — PART E
--
-- fn_my_hr_organization_ids() already gates 11 LEAVE-domain tables, because
-- their policies were written against it. The other HR tables — staff details,
-- payroll, payslips, documents, benefits, forms — have their own policies that
-- never mentioned it, so an "All institutions" read still returned rows for an
-- institution excluded from the HR module.
--
-- RESTRICTIVE POLICIES, NOT REWRITES. Postgres ANDs restrictive policies with
-- the permissive ones, so each table gets ONE extra predicate and no existing
-- policy is touched. That matters here: these nine tables carry 24 policies
-- between them, and rewriting expressions I would have to read back correctly
-- is exactly how a permission sweep turns into an outage. A restrictive policy
-- can only ever narrow — it cannot accidentally widen access.
--
-- NULL LINKAGE IS ALLOWED THROUGH. A row whose institution/org/staff column is
-- NULL cannot be attributed to any institution, so it cannot be attributed to an
-- EXCLUDED one either. Blocking those would hide genuinely global rows — a
-- benefits catalog entry with institution_id NULL, for instance — which is a
-- different bug, not this feature.
--
-- service_role IS UNAFFECTED: it carries rolbypassrls, so server routes and cron
-- keep working. That is precisely why the two service-role API routes in this
-- sweep had to be filtered in their own queries instead — nothing in RLS will
-- ever apply to them.
--
-- SUPER ADMINS ARE ALSO NARROWED by these, unlike the permissive policies which
-- OR in is_super_admin(). Deliberate: "the whole HR module stops using this
-- institution" is the requirement, and the data stays reachable through
-- service_role or by re-including the institution.
--
-- Still a no-op for every INCLUDED institution.
--
-- NO EXPLICIT BEGIN/COMMIT — see the note in 20260905120000.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Three shapes of linkage, three helpers. STABLE + SECURITY DEFINER so they can
-- read hr_organizations regardless of the caller's own grants, and so Postgres
-- can cache them across the rows of one statement.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_org_included(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_org_id IS NULL
      OR EXISTS (SELECT 1 FROM public.hr_organizations o
                  WHERE o.id = p_org_id AND o.included_in_hr);
$function$;

CREATE OR REPLACE FUNCTION public.fn_hr_institution_included(p_institution_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_institution_id IS NULL
      OR EXISTS (SELECT 1 FROM public.hr_organizations o
                  WHERE o.institution_id = p_institution_id AND o.included_in_hr);
$function$;

-- Via staff.institution_id, because these tables key on the person, not a
-- tenant column.
CREATE OR REPLACE FUNCTION public.fn_hr_staff_institution_included(p_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_staff_id IS NULL
      OR EXISTS (SELECT 1
                   FROM public.staff s
                   JOIN public.hr_organizations o ON o.institution_id = s.institution_id
                  WHERE s.id = p_staff_id AND o.included_in_hr);
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_org_included(uuid)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_hr_institution_included(uuid)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_hr_staff_institution_included(uuid)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_org_included(uuid)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_institution_included(uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_staff_institution_included(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- One restrictive SELECT policy per table, on its most direct linkage.
-- ---------------------------------------------------------------------------

-- hr_organization_id
DROP POLICY IF EXISTS hr_included_gate ON public.hr_staff_details;
CREATE POLICY hr_included_gate ON public.hr_staff_details
  AS RESTRICTIVE FOR SELECT USING (public.fn_hr_org_included(hr_organization_id));

DROP POLICY IF EXISTS hr_included_gate ON public.hr_required_documents;
CREATE POLICY hr_included_gate ON public.hr_required_documents
  AS RESTRICTIVE FOR SELECT USING (public.fn_hr_org_included(hr_organization_id));

DROP POLICY IF EXISTS hr_included_gate ON public.hr_payroll_periods;
CREATE POLICY hr_included_gate ON public.hr_payroll_periods
  AS RESTRICTIVE FOR SELECT USING (public.fn_hr_org_included(hr_organization_id));

-- institution_id
DROP POLICY IF EXISTS hr_included_gate ON public.hr_benefits_catalog;
CREATE POLICY hr_included_gate ON public.hr_benefits_catalog
  AS RESTRICTIVE FOR SELECT USING (public.fn_hr_institution_included(institution_id));

DROP POLICY IF EXISTS hr_included_gate ON public.hr_forms;
CREATE POLICY hr_included_gate ON public.hr_forms
  AS RESTRICTIVE FOR SELECT USING (public.fn_hr_institution_included(institution_id));

DROP POLICY IF EXISTS hr_included_gate ON public.hr_form_submissions;
CREATE POLICY hr_included_gate ON public.hr_form_submissions
  AS RESTRICTIVE FOR SELECT USING (public.fn_hr_institution_included(institution_id));

DROP POLICY IF EXISTS hr_included_gate ON public.hr_employee_documents;
CREATE POLICY hr_included_gate ON public.hr_employee_documents
  AS RESTRICTIVE FOR SELECT USING (public.fn_hr_institution_included(institution_id));

-- staff FK
DROP POLICY IF EXISTS hr_included_gate ON public.hr_benefits_enrollments;
CREATE POLICY hr_included_gate ON public.hr_benefits_enrollments
  AS RESTRICTIVE FOR SELECT USING (public.fn_hr_staff_institution_included(staff_id));

DROP POLICY IF EXISTS hr_included_gate ON public.hr_payslips;
CREATE POLICY hr_included_gate ON public.hr_payslips
  AS RESTRICTIVE FOR SELECT USING (public.fn_hr_staff_institution_included(staff_id));

COMMENT ON FUNCTION public.fn_hr_org_included(uuid) IS
  'True when the HR organization is included in the HR module, or the id is NULL. Used by the restrictive hr_included_gate policies.';
