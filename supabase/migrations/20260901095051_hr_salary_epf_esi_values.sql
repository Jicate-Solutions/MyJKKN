-- ============================================================================
-- EPF / ESI VALUES ON EMPLOYEE SALARIES (2026-09-01)
--
-- hr_staff_salaries recorded WHETHER someone was PF-eligible and nothing about
-- HOW MUCH, and carried no ESI concept at all. HR needs the per-employee figure
-- against the salary record so the Salary Register can deduct it and a statutory
-- return can be read off the register.
--
-- ONE RUPEE FIGURE EACH, not an employee/employer split and not a percentage.
-- The register deducts it IN FULL regardless of unpaid days — the stored number
-- is the number deducted, which is the whole point of holding it per person
-- rather than deriving it from a policy (that is what deduction-engine.ts does,
-- on the dead hr_payslips path, from institution-level rates).
--
-- ELIGIBILITY REUSES eligible_for_pf, RELABELLED "EPF" IN THE UI. PF and EPF are
-- the same statutory scheme; a second flag could disagree with the first on the
-- same row. ESI is genuinely new and gets its own flag.
--
-- BOTH FUNCTIONS ARE DROPPED AND RECREATED, NOT `CREATE OR REPLACE`d. See the
-- blocks below — for one it is a correctness requirement, for the other Postgres
-- refuses outright.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. hr_staff_salaries — the figures
--
-- No index on any of these: they are neither foreign keys nor query predicates.
-- Nothing filters or joins on a contribution amount; they are read as part of a
-- row already located by staff_id.
--
-- No RLS work either. hr_staff_salaries_select / _write / _service_role are
-- row-level and name no column list, so new columns inherit them, and the table
-- has no column-level grants.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_staff_salaries
  ADD COLUMN IF NOT EXISTS epf_amount       numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eligible_for_esi boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS esi_amount       numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.hr_staff_salaries
  DROP CONSTRAINT IF EXISTS hr_staff_salaries_epf_amount_non_negative,
  DROP CONSTRAINT IF EXISTS hr_staff_salaries_esi_amount_non_negative;

ALTER TABLE public.hr_staff_salaries
  ADD CONSTRAINT hr_staff_salaries_epf_amount_non_negative CHECK (epf_amount >= 0),
  ADD CONSTRAINT hr_staff_salaries_esi_amount_non_negative CHECK (esi_amount >= 0);

COMMENT ON COLUMN public.hr_staff_salaries.epf_amount IS
  'Monthly EPF contribution in rupees. Meaningful only when eligible_for_pf; forced to 0 otherwise by fn_hr_set_staff_salary.';
COMMENT ON COLUMN public.hr_staff_salaries.eligible_for_esi IS
  'Whether ESI is deducted for this person. Added 2026-09-01; there was no ESI concept on this table before.';
COMMENT ON COLUMN public.hr_staff_salaries.esi_amount IS
  'Monthly ESI contribution in rupees. Meaningful only when eligible_for_esi; forced to 0 otherwise.';

-- ---------------------------------------------------------------------------
-- 2. hr_salary_register_lines — the deductions, broken out
--
-- Their own columns rather than folded silently into total_deductions: a
-- register that cannot say WHY a deduction is what it is cannot be used to file
-- a return. total_deductions still carries them, so net_pay and the per-payer
-- split subtotals keep their existing arithmetic.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_salary_register_lines
  ADD COLUMN IF NOT EXISTS epf_deduction numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS esi_deduction numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.hr_salary_register_lines.epf_deduction IS
  'EPF withheld on this line, included in total_deductions. Snapshotted from hr_staff_salaries.epf_amount at generation.';
COMMENT ON COLUMN public.hr_salary_register_lines.esi_deduction IS
  'ESI withheld on this line, included in total_deductions.';

-- ---------------------------------------------------------------------------
-- 3. fn_hr_set_staff_salary — DROPPED FIRST, DELIBERATELY
--
-- `CREATE OR REPLACE FUNCTION` with a different parameter list creates an
-- OVERLOAD; it does not replace. PostgREST would then see a 13-arg and a 16-arg
-- candidate and answer PGRST203 "could not choose the best candidate function"
-- on EVERY call — taking down the salary dialog and the bulk importer at once,
-- from a migration that reported success.
--
-- The DROP also takes the EXECUTE grant with it, which is re-issued at the end.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_hr_set_staff_salary(
  uuid, uuid, numeric, date, text, text, numeric,
  boolean, boolean, boolean, boolean, boolean, text
);

CREATE FUNCTION public.fn_hr_set_staff_salary(
  p_staff_id               uuid,
  p_hr_organization_id     uuid,
  p_monthly_gross          numeric,
  p_effective_from         date,
  p_salary_structure       text    DEFAULT 'Monthly',
  p_overtime_level         text    DEFAULT 'No overtime',
  p_overtime_amount        numeric DEFAULT 0,
  p_eligible_for_pf        boolean DEFAULT false,
  p_exempt_edli            boolean DEFAULT false,
  p_eligible_for_insurance boolean DEFAULT false,
  p_eligible_for_gratuity  boolean DEFAULT false,
  p_eligible_for_etf       boolean DEFAULT false,
  p_notes                  text    DEFAULT NULL,
  p_epf_amount             numeric DEFAULT 0,
  p_eligible_for_esi       boolean DEFAULT false,
  p_esi_amount             numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_id  uuid := gen_random_uuid();
  v_current record;
  v_epf     numeric;
  v_esi     numeric;
BEGIN
  IF p_staff_id IS NULL OR p_hr_organization_id IS NULL THEN
    RAISE EXCEPTION 'Staff and payroll organisation are both required'
      USING ERRCODE = '22023';
  END IF;
  IF p_monthly_gross IS NULL OR p_monthly_gross <= 0 THEN
    RAISE EXCEPTION 'Monthly salary must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'Effective date is required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_epf_amount, 0) < 0 OR COALESCE(p_esi_amount, 0) < 0 THEN
    RAISE EXCEPTION 'EPF and ESI amounts cannot be negative' USING ERRCODE = '22023';
  END IF;

  -- An amount against a flag that is OFF is zeroed, not rejected. The bulk
  -- importer feeds this from a spreadsheet where a leftover figure beside a "No"
  -- is a formatting slip, and a hard failure there would abort a 754-row import.
  v_epf := CASE WHEN p_eligible_for_pf  THEN COALESCE(p_epf_amount, 0) ELSE 0 END;
  v_esi := CASE WHEN p_eligible_for_esi THEN COALESCE(p_esi_amount, 0) ELSE 0 END;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_staff_id::text || ':salary', 0));

  SELECT * INTO v_current
    FROM public.hr_staff_salaries
   WHERE staff_id = p_staff_id AND superseded_by IS NULL;

  -- Re-writing an IDENTICAL record would bury the real history under duplicates,
  -- so the incumbent is returned untouched instead.
  --
  -- COMPARES THE WHOLE PAYLOAD (widened 2026-09-01). It used to test only
  -- monthly_gross and effective_from, which meant changing a flag, the overtime
  -- or the notes saved NOTHING and still reported success. Adding EPF/ESI made
  -- that the common case: tick ESI, type 165, save, nothing happens.
  --
  -- IS DISTINCT FROM throughout, not <>. p_notes is nullable and `x <> NULL` is
  -- NULL rather than false — a plain <> chain would evaluate to NULL, be read as
  -- "not different", and silently restore the exact bug this widening fixes.
  IF FOUND
     AND v_current.monthly_gross          IS NOT DISTINCT FROM p_monthly_gross
     AND v_current.effective_from         IS NOT DISTINCT FROM p_effective_from
     AND v_current.hr_organization_id     IS NOT DISTINCT FROM p_hr_organization_id
     AND v_current.salary_structure       IS NOT DISTINCT FROM p_salary_structure
     AND v_current.overtime_level         IS NOT DISTINCT FROM p_overtime_level
     AND v_current.overtime_amount        IS NOT DISTINCT FROM COALESCE(p_overtime_amount, 0)
     AND v_current.eligible_for_pf        IS NOT DISTINCT FROM p_eligible_for_pf
     AND v_current.exempt_edli            IS NOT DISTINCT FROM p_exempt_edli
     AND v_current.eligible_for_insurance IS NOT DISTINCT FROM p_eligible_for_insurance
     AND v_current.eligible_for_gratuity  IS NOT DISTINCT FROM p_eligible_for_gratuity
     AND v_current.eligible_for_etf       IS NOT DISTINCT FROM p_eligible_for_etf
     AND v_current.epf_amount             IS NOT DISTINCT FROM v_epf
     AND v_current.eligible_for_esi       IS NOT DISTINCT FROM p_eligible_for_esi
     AND v_current.esi_amount             IS NOT DISTINCT FROM v_esi
     AND v_current.notes                  IS NOT DISTINCT FROM p_notes THEN
    RETURN v_current.id;
  END IF;

  IF FOUND THEN
    UPDATE public.hr_staff_salaries
       SET superseded_by = v_new_id, updated_at = now(), updated_by = auth.uid()
     WHERE id = v_current.id;
  END IF;

  INSERT INTO public.hr_staff_salaries (
    id, staff_id, hr_organization_id, salary_structure, monthly_gross,
    overtime_level, overtime_amount, eligible_for_pf, exempt_edli,
    eligible_for_insurance, eligible_for_gratuity, eligible_for_etf,
    epf_amount, eligible_for_esi, esi_amount,
    effective_from, notes, created_by, updated_by
  ) VALUES (
    v_new_id, p_staff_id, p_hr_organization_id, p_salary_structure, p_monthly_gross,
    p_overtime_level, p_overtime_amount, p_eligible_for_pf, p_exempt_edli,
    p_eligible_for_insurance, p_eligible_for_gratuity, p_eligible_for_etf,
    v_epf, p_eligible_for_esi, v_esi,
    p_effective_from, p_notes, auth.uid(), auth.uid()
  );

  RETURN v_new_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. hr_staff_salary_directory() — DROPPED FIRST BECAUSE POSTGRES INSISTS
--
-- The RETURNS TABLE gains three columns, and `CREATE OR REPLACE` on a changed
-- return type fails outright with "cannot change return type of existing
-- function". Unlike the function above there is no silent-overload trap here
-- (the argument list is unchanged) — the migration simply would not apply.
--
-- Everything load-bearing is preserved verbatim: the permission gate that RAISES
-- rather than returning zero rows (so an empty list means "no staff in scope",
-- never "you are not allowed"), STABLE SECURITY DEFINER with a pinned
-- search_path, v_hr_staff as the source (employment_categories.included_in_hr
-- gates the whole HR module), role_has_institution_access, and the ORDER BY that
-- floats people with no salary to the top — that queue is why the screen exists.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.hr_staff_salary_directory();

CREATE FUNCTION public.hr_staff_salary_directory()
RETURNS TABLE(
  staff_uuid uuid, staff_code text, person_name text, role_title text,
  is_active boolean, works_at_id uuid, works_at_name text,
  payer_org_id uuid, payer_org_name text,
  salary_id uuid, salary_structure text, monthly_gross numeric, annual_gross numeric,
  overtime_level text, overtime_amount numeric,
  eligible_for_pf boolean, exempt_edli boolean, eligible_for_insurance boolean,
  eligible_for_gratuity boolean, eligible_for_etf boolean,
  epf_amount numeric, eligible_for_esi boolean, esi_amount numeric,
  effective_from date, notes text
)
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
         sal.epf_amount,
         sal.eligible_for_esi,
         sal.esi_amount,
         sal.effective_from,
         sal.notes
    FROM public.v_hr_staff s
    JOIN public.institutions i ON i.id = s.institution_id
    LEFT JOIN public.hr_staff_payroll p ON p.staff_id = s.id
    LEFT JOIN public.hr_organizations o ON o.id = p.hr_organization_id
    LEFT JOIN public.hr_staff_salaries sal
           ON sal.staff_id = s.id AND sal.superseded_by IS NULL
   WHERE (COALESCE(s.is_active, false) OR sal.id IS NOT NULL)
     AND public.role_has_institution_access(s.institution_id)
   ORDER BY (sal.id IS NOT NULL), i.name, 3;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. RESTORE THE GRANTS THE DROP TOOK, AND REVOKE THE ONES POSTGRES ADDED BACK
--
-- Two separate problems, and only the first is obvious:
--
--   a) DROP FUNCTION discards the old grants. Without the GRANTs below every
--      caller gets 42501 and the screen reads as a permissions regression.
--
--   b) A NEWLY CREATED FUNCTION IS EXECUTABLE BY PUBLIC — which includes anon.
--      Postgres grants EXECUTE to PUBLIC on every new function, so recreating
--      these silently widened them past where the original migrations left them
--      (`REVOKE ALL ... FROM anon`). Both functions still refuse an anonymous
--      caller on their own merits — the directory RAISES on the permission
--      check, and the setter is SECURITY INVOKER so RLS gates the write — but
--      relying on that is exactly the defence-in-depth erosion the drop was not
--      supposed to cause. REVOKE FROM PUBLIC first, then grant deliberately.
--
-- REVOKE ... FROM PUBLIC does not remove a grant held by anon directly, so anon
-- is named as well rather than assumed.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_hr_set_staff_salary(
  uuid, uuid, numeric, date, text, text, numeric,
  boolean, boolean, boolean, boolean, boolean, text,
  numeric, boolean, numeric
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.hr_staff_salary_directory() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_hr_set_staff_salary(
  uuid, uuid, numeric, date, text, text, numeric,
  boolean, boolean, boolean, boolean, boolean, text,
  numeric, boolean, numeric
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.hr_staff_salary_directory() TO authenticated, service_role;

COMMIT;
