-- The HR population now honours employment_categories.included_in_hr.
--
-- 20260827210000 added the flag plus fn_is_hr_staff() and v_hr_staff. This
-- migration makes them mean something, at the points where staff ENTER the HR
-- module rather than at each of the ~62 places that consume them:
--
--   * the payroll / salary / bank / no-payer directories — one FROM swap each;
--   * v_hr_leave_balance_src, which CROSS JOINs staff × leave types to
--     synthesize leave eligibility. This single predicate empties an excluded
--     staff member out of the balances page, the apply drawer's type list,
--     LeaveService.getBalance AND the apply-time "You are not eligible for X"
--     check, because all four read this view;
--   * fn_my_hr_context(), which every self-service surface resolves identity
--     through;
--   * INSERT refusal on the two request tables.
--
-- STILL A NO-OP ON DEPLOY. Every category ships included_in_hr = true, so all
-- of this is inert until HR unticks a category.
--
-- The directories are SECURITY DEFINER, so reading v_hr_staff (security_invoker)
-- inside them runs as the function owner exactly as reading staff did — the
-- swap narrows the rows and changes nothing about privilege.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Payroll directories — FROM public.staff -> FROM public.v_hr_staff
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hr_staff_payroll_directory()
 RETURNS TABLE(staff_uuid uuid, staff_code text, person_name text, role_title text, works_at_id uuid, works_at_name text, payer_org_id uuid, payer_org_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('hr.payroll.institution.view') THEN
    RAISE EXCEPTION 'hr.payroll.institution.view is required to see payroll organisations.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.id,
         s.staff_id::text,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.designation::text,
         i.id,
         i.name::text,
         o.id,
         o.name::text
    FROM public.v_hr_staff s
    JOIN public.institutions i ON i.id = s.institution_id
    LEFT JOIN public.hr_staff_payroll p ON p.staff_id = s.id
    LEFT JOIN public.hr_organizations o ON o.id = p.hr_organization_id
   WHERE COALESCE(s.is_active, false)
     AND public.role_has_institution_access(s.institution_id)
   ORDER BY (p.staff_id IS NOT NULL), i.name, s.designation, 3;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hr_staff_salary_directory()
 RETURNS TABLE(staff_uuid uuid, staff_code text, person_name text, role_title text, is_active boolean, works_at_id uuid, works_at_name text, payer_org_id uuid, payer_org_name text, salary_id uuid, salary_structure text, monthly_gross numeric, annual_gross numeric, overtime_level text, overtime_amount numeric, eligible_for_pf boolean, exempt_edli boolean, eligible_for_insurance boolean, eligible_for_gratuity boolean, eligible_for_etf boolean, effective_from date, notes text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('hr.payroll.salary.view') THEN
    RAISE EXCEPTION 'hr.payroll.salary.view is required to see employee salaries.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.id,
         s.staff_id::text,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.designation::text,
         COALESCE(s.is_active, false),
         i.id,
         i.name::text,
         o.id,
         o.name::text,
         sal.id,
         sal.salary_structure::text,
         sal.monthly_gross,
         sal.annual_gross,
         sal.overtime_level::text,
         sal.overtime_amount,
         sal.eligible_for_pf,
         sal.exempt_edli,
         sal.eligible_for_insurance,
         sal.eligible_for_gratuity,
         sal.eligible_for_etf,
         sal.effective_from,
         sal.notes
    FROM public.v_hr_staff s
    JOIN public.institutions i ON i.id = s.institution_id
    LEFT JOIN public.hr_staff_payroll p ON p.staff_id = s.id
    LEFT JOIN public.hr_organizations o ON o.id = p.hr_organization_id
    -- The salary IN FORCE only. Without superseded_by IS NULL a person who has
    -- had two raises would appear three times in a roster listing.
    LEFT JOIN public.hr_staff_salaries sal
           ON sal.staff_id = s.id AND sal.superseded_by IS NULL
   -- Active staff, PLUS anyone inactive who still holds a salary. Filtering on
   -- is_active alone would hide a relieved employee awaiting final settlement --
   -- money attached to an invisible row is the one thing this list must not do.
   WHERE (COALESCE(s.is_active, false) OR sal.id IS NOT NULL)
     AND public.role_has_institution_access(s.institution_id)
   -- Unset first: this is a work queue before it is a report.
   ORDER BY (sal.id IS NOT NULL), i.name, 3;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hr_staff_bank_directory()
 RETURNS TABLE(staff_uuid uuid, staff_code text, person_name text, role_title text, is_active boolean, works_at_id uuid, works_at_name text, payer_org_id uuid, payer_org_name text, account_id uuid, account_holder_name text, account_number text, ifsc_code text, bank_name text, branch_name text, account_type text, verified_at timestamp with time zone, effective_from date, notes text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('hr.payroll.bank.view') THEN
    RAISE EXCEPTION 'hr.payroll.bank.view is required to see employee bank accounts.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.id,
         s.staff_id::text,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.designation::text,
         COALESCE(s.is_active, false),
         i.id,
         i.name::text,
         o.id,
         o.name::text,
         b.id,
         b.account_holder_name,
         b.account_number,
         b.ifsc_code,
         b.bank_name,
         b.branch_name,
         b.account_type,
         b.verified_at,
         b.effective_from,
         b.notes
    FROM public.v_hr_staff s
    JOIN public.institutions i ON i.id = s.institution_id
    LEFT JOIN public.hr_staff_payroll p ON p.staff_id = s.id
    LEFT JOIN public.hr_organizations o ON o.id = p.hr_organization_id
    LEFT JOIN public.hr_staff_bank_accounts b
           ON b.staff_id = s.id AND b.superseded_by IS NULL
   -- Active staff, plus anyone inactive who still has an account on file --
   -- a final settlement is paid to someone who has already left.
   WHERE (COALESCE(s.is_active, false) OR b.id IS NOT NULL)
     AND public.role_has_institution_access(s.institution_id)
   -- Unrecorded first, then recorded-but-unverified, then done.
   ORDER BY (b.id IS NOT NULL), (b.verified_at IS NOT NULL), i.name, 3;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hr_staff_without_payer()
 RETURNS TABLE(staff_uuid uuid, staff_code text, person_name text, role_title text, works_at_id uuid, works_at_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('hr.payroll.institution.view') THEN
    RAISE EXCEPTION 'hr.payroll.institution.view is required to see who has no recorded payer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.id,
         s.staff_id::text,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.designation::text,
         i.id,
         i.name::text
    FROM public.v_hr_staff s
    JOIN public.institutions i ON i.id = s.institution_id
   WHERE COALESCE(s.is_active, false)
     AND NOT EXISTS (
           SELECT 1 FROM public.hr_staff_payroll p WHERE p.staff_id = s.id
         )
     AND public.role_has_institution_access(s.institution_id)
   ORDER BY i.name, s.designation, 3;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Leave eligibility — the highest-leverage predicate in the module.
--
-- Body identical to the current definition apart from the employment_categories
-- join added to BOTH legs. A join, not fn_is_hr_staff(), because leg 1 is a
-- CROSS JOIN over staff × leave types × years: a per-row function call there
-- would be evaluated hundreds of thousands of times, while the join is a hash
-- join over an existing index (idx_staff_category_id).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_hr_leave_balance_src AS
 SELECT s.id AS employee_id,
    t.id AS leave_type_id,
    y.id AS hr_academic_year_id,
    t.hr_organization_id,
    t.leave_type_name,
    t.leave_type_code,
    t.request_category,
    t.color_code,
    t.display_order,
    t.duration_type,
    t.allow_half_day,
    t.allow_hourly,
    t.max_continuous_days,
    t.min_advance_notice_days,
    t.requires_documents,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) AS entitled,
    COALESCE(b.used, 0::numeric) AS used,
    COALESCE(b.carried_forward, 0::numeric) AS carried_forward,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) + COALESCE(b.carried_forward, 0::numeric) - COALESCE(b.used, 0::numeric) AS available,
        CASE
            WHEN o.entitled_days IS NOT NULL THEN 'override'::text
            WHEN b.entitled IS NOT NULL THEN 'frozen'::text
            ELSE 'policy'::text
        END AS entitlement_source,
    b.created_at,
    b.updated_at,
    t.document_required_after_days
   FROM hr_academic_years y
     CROSS JOIN hr_leave_types t
     JOIN hr_organizations org ON org.id = t.hr_organization_id
     JOIN staff s ON s.institution_id = org.institution_id AND s.is_active
     JOIN employment_categories sec ON sec.id = s.category_id AND sec.included_in_hr
     LEFT JOIN hr_staff_details d ON d.staff_id = s.id
     LEFT JOIN hr_leave_balances b ON b.employee_id = s.id AND b.leave_type_id = t.id AND b.hr_academic_year_id = y.id
     LEFT JOIN hr_leave_entitlement_overrides o ON o.employee_id = s.id AND o.leave_type_id = t.id AND o.hr_academic_year_id = y.id
  WHERE y.frozen_at IS NULL AND t.is_active AND (t.applicable_gender::text = 'all'::text OR lower(COALESCE(s.gender, ''::text)) = t.applicable_gender::text) AND (t.applicable_cadre_ids IS NULL OR (d.cadre_id = ANY (t.applicable_cadre_ids))) AND (NOT (EXISTS ( SELECT 1
           FROM hr_leave_type_assignments a
          WHERE a.leave_type_id = t.id AND a.is_active)) OR (EXISTS ( SELECT 1
           FROM hr_leave_type_assignments a
          WHERE a.leave_type_id = t.id AND a.is_active AND (a.scope_kind::text = 'staff'::text AND a.staff_id = s.id OR a.scope_kind::text = 'department'::text AND a.department_id = s.department_id OR a.scope_kind::text = 'organization'::text))))
UNION ALL
 SELECT b.employee_id,
    b.leave_type_id,
    b.hr_academic_year_id,
    b.hr_organization_id,
    t.leave_type_name,
    t.leave_type_code,
    t.request_category,
    t.color_code,
    t.display_order,
    t.duration_type,
    t.allow_half_day,
    t.allow_hourly,
    t.max_continuous_days,
    t.min_advance_notice_days,
    t.requires_documents,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) AS entitled,
    b.used,
    b.carried_forward,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) + b.carried_forward - b.used AS available,
        CASE
            WHEN o.entitled_days IS NOT NULL THEN 'override'::text
            WHEN b.entitled IS NOT NULL THEN 'frozen'::text
            ELSE 'policy'::text
        END AS entitlement_source,
    b.created_at,
    b.updated_at,
    t.document_required_after_days
   FROM hr_leave_balances b
     JOIN hr_academic_years y ON y.id = b.hr_academic_year_id AND y.frozen_at IS NOT NULL
     JOIN hr_leave_types t ON t.id = b.leave_type_id
     -- Frozen years too: an excluded category should disappear from HR
     -- everywhere, not linger in history screens.
     JOIN staff fs ON fs.id = b.employee_id
     JOIN employment_categories fec ON fec.id = fs.category_id AND fec.included_in_hr
     LEFT JOIN hr_leave_entitlement_overrides o ON o.employee_id = b.employee_id AND o.leave_type_id = b.leave_type_id AND o.hr_academic_year_id = b.hr_academic_year_id;

-- ---------------------------------------------------------------------------
-- 3. Self-service identity gains the flag.
--
-- Returns the row WITH hr_included rather than returning nothing for an
-- excluded staff member: filtering them out here would make every HR page say
-- "No staff record linked", which is both wrong and unhelpful. The UI reads the
-- flag and says what is actually true.
--
-- RETURNS TABLE gains a column, so DROP first; DROP discards EXECUTE, re-granted.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fn_my_hr_context();

CREATE FUNCTION public.fn_my_hr_context()
 RETURNS TABLE(staff_id uuid, profile_id uuid, hr_organization_id uuid, institution_id uuid, first_name text, last_name text, email text, employee_code text, hr_included boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id,
    s.profile_id,
    -- Institution first. hr_staff_details drifts, and the rest of the leave
    -- module resolves the organisation from the institution.
    COALESCE(o.id, d.hr_organization_id),
    s.institution_id,
    s.first_name::text,
    s.last_name::text,
    s.email::text,
    COALESCE(d.hr_employee_code, s.staff_id)::text,
    COALESCE(ec.included_in_hr, false)
  FROM public.staff s
  LEFT JOIN public.hr_staff_details d ON d.staff_id = s.id
  LEFT JOIN public.hr_organizations o ON o.institution_id = s.institution_id
  LEFT JOIN public.employment_categories ec ON ec.id = s.category_id
  WHERE s.profile_id = auth.uid()
    AND s.is_active
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.fn_my_hr_context() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_my_hr_context() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Requests cannot be RAISED for a staff member outside HR.
--
-- INSERT only, deliberately. UPDATE and DELETE stay open so that a request
-- already pending when its category is excluded can still be approved or
-- rejected — blocking those would strand rows in the approval queues forever,
-- the same trap the comp-off month-lock hit earlier today.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hr_trig_block_non_hr_staff_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.fn_is_hr_staff(NEW.employee_id) THEN
    RAISE EXCEPTION
      'This staff member''s employment category is not managed in HR, so % cannot be raised for them.',
      COALESCE(TG_ARGV[0], 'a request')
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.hr_trig_block_non_hr_staff_request() IS
  'Refuses new HR requests for staff whose employment category has included_in_hr = false. INSERT only, so existing pending rows stay decidable.';

DROP TRIGGER IF EXISTS trg_hla_block_non_hr_staff ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_block_non_hr_staff
  BEFORE INSERT ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_block_non_hr_staff_request('leave or short time off');

DROP TRIGGER IF EXISTS trg_hcoc_block_non_hr_staff ON public.hr_comp_off_credits;
CREATE TRIGGER trg_hcoc_block_non_hr_staff
  BEFORE INSERT ON public.hr_comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_block_non_hr_staff_request('compensatory off');

COMMIT;
