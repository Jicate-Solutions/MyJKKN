-- HR Payroll — per-employee salary, the store payroll was missing.
--
-- WHY NOT hr_pay_scales
-- ---------------------
-- That table is keyed on designation_id / cadre_id: it answers "what does an
-- Assistant Professor Grade I earn". The salary sheet answers "what does
-- NOT100 earn" — 62 rows, one per person, ₹7,000 to ₹80,000 with no designation
-- pattern. Storing individuals there would mean one scale row per employee with
-- designation_id NULL, which breaks the designation model for everyone who uses
-- it properly and makes PayslipGenerator's designation lookup ambiguous.
--
-- WHY NOT A COLUMN ON staff
-- -------------------------
-- The same reason hr_staff_payroll is its own table, recorded in
-- lib/constants/permissions.ts: RLS is row-level, so a salary column would be
-- readable by everyone who can read the staff row — and StaffService,
-- /api/api-management/staff and the MCP server all select('*'). Salary is more
-- sensitive than the payroll-organisation flag that argument was first made
-- for, not less.
--
-- FLAT, NOT COMPONENT-SPLIT
-- -------------------------
-- The sheet carries ONE number per person. Gross_Annual_Salary = Basic_Salary
-- x 12 held on all 62 rows without exception, so Basic_Salary is the whole
-- monthly pay and not a basic component. hr_pay_components (98 rows: BASIC, CA,
-- MA, SA flat; DA, HRA, LTA percent_of_basic) is left untouched — nothing in
-- the source says how to split these figures, and inventing a split would put
-- numbers on a payslip that nobody authorised. annual_gross is GENERATED from
-- monthly_gross for the same reason: two stored copies of one fact drift.
--
-- EFFECTIVE-DATED, NEVER OVERWRITTEN
-- ----------------------------------
-- A raise supersedes rather than replaces: an already-generated payslip must
-- stay explicable against the salary in force when it ran. Same superseded_by
-- shape hr_pay_scales already uses.

CREATE TABLE IF NOT EXISTS public.hr_staff_salaries (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id               uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  -- Who pays. Denormalised from hr_staff_payroll so a salary row is scopeable
  -- without a join, and because a transfer must not silently retag history.
  hr_organization_id     uuid NOT NULL REFERENCES public.hr_organizations(id),

  salary_structure       text NOT NULL DEFAULT 'Monthly'
                           CHECK (salary_structure IN ('Monthly','Weekly','Daily','Hourly')),
  monthly_gross          numeric(12,2) NOT NULL CHECK (monthly_gross > 0),
  annual_gross           numeric(14,2) GENERATED ALWAYS AS (monthly_gross * 12) STORED,

  overtime_level         text NOT NULL DEFAULT 'No overtime'
                           CHECK (overtime_level IN ('No overtime','Grade','Employee')),
  overtime_amount        numeric(12,2) NOT NULL DEFAULT 0 CHECK (overtime_amount >= 0),

  eligible_for_pf        boolean NOT NULL DEFAULT false,
  exempt_edli            boolean NOT NULL DEFAULT false,
  eligible_for_insurance boolean NOT NULL DEFAULT false,
  eligible_for_gratuity  boolean NOT NULL DEFAULT false,
  eligible_for_etf       boolean NOT NULL DEFAULT false,

  effective_from         date NOT NULL,
  -- Set when a later row replaces this one. NULL = the salary in force.
  superseded_by          uuid REFERENCES public.hr_staff_salaries(id),
  notes                  text,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid
);

-- One CURRENT salary per staff member. Partial, so superseded history is
-- unbounded while the live row stays singular — a second live row would make
-- "what does this person earn" unanswerable.
CREATE UNIQUE INDEX IF NOT EXISTS hr_staff_salaries_one_current
  ON public.hr_staff_salaries (staff_id)
  WHERE superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS hr_staff_salaries_org_idx
  ON public.hr_staff_salaries (hr_organization_id);
CREATE INDEX IF NOT EXISTS hr_staff_salaries_effective_idx
  ON public.hr_staff_salaries (staff_id, effective_from DESC);

DROP TRIGGER IF EXISTS trg_hr_staff_salaries_updated_at ON public.hr_staff_salaries;
CREATE TRIGGER trg_hr_staff_salaries_updated_at
  BEFORE UPDATE ON public.hr_staff_salaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — its own keys, mirroring hr_staff_payroll's shape.
-- ---------------------------------------------------------------------------
-- Deliberately NOT reusing hr.payroll.institution.*: those say who may see
-- which organisation pays someone. Seeing the amount is a different decision,
-- and an HR user who may maintain the payer directory is not automatically
-- entitled to everyone's pay.
ALTER TABLE public.hr_staff_salaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_staff_salaries_service_role ON public.hr_staff_salaries;
CREATE POLICY hr_staff_salaries_service_role ON public.hr_staff_salaries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS hr_staff_salaries_select ON public.hr_staff_salaries;
CREATE POLICY hr_staff_salaries_select ON public.hr_staff_salaries
  FOR SELECT USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.salary.view'))
    -- Your own salary. Reading your own pay needs no HR permission, and a
    -- payslip screen would otherwise be unbuildable for ordinary staff.
    OR staff_id IN (SELECT unnest(public.fn_my_staff_ids()))
  );

DROP POLICY IF EXISTS hr_staff_salaries_write ON public.hr_staff_salaries;
CREATE POLICY hr_staff_salaries_write ON public.hr_staff_salaries
  FOR ALL USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.salary.manage'))
  ) WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.salary.manage'))
  );

COMMENT ON TABLE public.hr_staff_salaries IS
  'Per-employee salary in force, effective-dated. Flat monthly gross — see the migration header for why it is not split into hr_pay_components and not stored on hr_pay_scales.';
COMMENT ON COLUMN public.hr_staff_salaries.annual_gross IS
  'GENERATED monthly_gross * 12. The source sheet satisfied this on all 62 rows; storing it separately would let the two drift.';
COMMENT ON COLUMN public.hr_staff_salaries.superseded_by IS
  'The row that replaced this one. NULL = in force. A raise supersedes so an already-generated payslip stays explicable.';

-- ---------------------------------------------------------------------------
-- Grants. A key in lib/constants/permissions.ts does nothing until it is in a
-- role's JSONB — declaring it alone renders an empty page.
-- ---------------------------------------------------------------------------
-- The three roles that already hold hr.payroll.institution.manage today.
UPDATE public.custom_roles
   SET permissions = permissions
         || jsonb_build_object('hr.payroll.salary.view', true,
                               'hr.payroll.salary.manage', true),
       updated_at = now()
 WHERE is_active
   AND role_key IN ('hr_admin', 'hr_head', 'hr_manager');
