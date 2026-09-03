-- ============================================================================
-- HR Salary Register — frozen, institution-wise monthly pay register
-- 2026-08-30
--
-- WHY THIS EXISTS
--   The chain biometric -> approvals -> attendance month close already ends in
--   hr_attendance_period_summaries, whose per-staff day counts stop moving once
--   the month is locked. Nothing read them. hr_payslips was meant to, but its
--   generator still carries `const lopDays = 0 // deferred to attendance
--   linkage`, and it sources basic pay from hr_pay_scales, which has no rows —
--   so every staff member is skipped as "No pay scale configured". The real
--   salary figure lives in hr_staff_salaries.monthly_gross.
--
--   These two tables are the missing last link: a FROZEN register per payer
--   organisation per month, computed from the closed month's day counts and the
--   recorded salary, and exported as the salary register workbook.
--
-- NOT hr_payroll_periods / hr_payslips. That pair carries a five-signature
-- approval chain, a pay-scale matrix and PF/ESI/TDS policy tables that this
-- register does not use. Populating it to reach a report it does not need would
-- mean inventing a pay matrix that does not exist. Left untouched.
--
-- ROSTER IS THE PAYER, NOT THE WORK LOCATION.
--   hr_staff_payroll.hr_organization_id says WHO PAYS. staff.institution_id says
--   WHERE SOMEONE WORKS, and since 2026-07-31 those are deliberately different
--   questions: 36 active staff are paid by one institution and work at another
--   (10 paid by Pharmacy work at Main Office). A register is a payment document,
--   so it follows the payer. The consequence is that one register can depend on
--   SEVERAL closed attendance months — one per work location on its roster —
--   which is why source_attendance_period_ids is an array and not a single FK.
--
-- WHY FREEZE INSTEAD OF COMPUTING ON READ
--   Reopening an attendance month recomputes and REPLACES its summaries. If the
--   register were a live view, reopening August would silently rewrite a
--   register already issued and paid against. Freezing makes an issued register
--   answer "what did we pay", not "what would we pay now".
-- ============================================================================

-- ── hr_salary_register_runs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hr_salary_register_runs (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The payer. institution_id is denormalised from hr_organizations so RLS can
  -- scope without a join — role_has_institution_access takes a bare uuid.
  hr_organization_id          uuid NOT NULL REFERENCES public.hr_organizations(id) ON DELETE RESTRICT,
  institution_id              uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,

  period_year                 integer NOT NULL,
  period_month                integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),

  -- The divisor actually used for the day rate, frozen with the run.
  -- Deliberately the INSTITUTION's working days for the month, not each
  -- person's own count: someone who joined mid-month has fewer working days of
  -- their own, and dividing by that would pay them a full month's gross for a
  -- part month. The sample register shows the same figure on every row for the
  -- same reason.
  working_days_basis          numeric(5,1) NOT NULL CHECK (working_days_basis > 0),

  -- Every closed attendance month that fed this run. Plural because the roster
  -- follows the payer and its people may work across several institutions.
  source_attendance_period_ids uuid[] NOT NULL DEFAULT '{}',

  staff_total                 integer NOT NULL DEFAULT 0,
  included_count              integer NOT NULL DEFAULT 0,
  excluded_count              integer NOT NULL DEFAULT 0,

  total_gross                 numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions            numeric(14,2) NOT NULL DEFAULT 0,
  total_net                   numeric(14,2) NOT NULL DEFAULT 0,

  generated_at                timestamptz NOT NULL DEFAULT now(),
  generated_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Regenerating supersedes rather than deletes: an issued register stays
  -- readable after a correction, which is the whole point of freezing.
  superseded_by               uuid REFERENCES public.hr_salary_register_runs(id) ON DELETE SET NULL,

  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- At most ONE live run per payer-org-month. Partial, so superseded generations
-- accumulate freely behind it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_salary_register_runs_live
  ON public.hr_salary_register_runs (hr_organization_id, period_year, period_month)
  WHERE superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_hr_salary_register_runs_institution
  ON public.hr_salary_register_runs (institution_id);
CREATE INDEX IF NOT EXISTS idx_hr_salary_register_runs_org
  ON public.hr_salary_register_runs (hr_organization_id);
CREATE INDEX IF NOT EXISTS idx_hr_salary_register_runs_period
  ON public.hr_salary_register_runs (period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_hr_salary_register_runs_superseded_by
  ON public.hr_salary_register_runs (superseded_by);


-- ── hr_salary_register_lines ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hr_salary_register_lines (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                 uuid NOT NULL REFERENCES public.hr_salary_register_runs(id) ON DELETE CASCADE,
  staff_id               uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  serial_no              integer NOT NULL,

  -- IDENTITY IS SNAPSHOTTED, NOT JOINED AT READ TIME. A transfer, a rename or
  -- a designation change after payday must not rewrite the register that was
  -- issued. employee_code is staff.staff_id (the current, permanent,
  -- institution-coded value) — NOT legacy_staff_id.
  employee_code          text,
  staff_name             text NOT NULL,
  designation            text,
  department_name        text,
  date_of_joining        date,
  bank_account_number    text,

  -- Day counts, from the FROZEN hr_attendance_period_summaries row.
  --   business_working_days = the run's institution standard (same on every row)
  --   paid_leave_days       = paid leave excluding OD-typed leave, plus comp-off
  --   unpaid_leave_days     = lop_days (working days neither attended nor paid-covered)
  --   on_duty_days          = ON_DUTY attendance status PLUS OD-typed leave days
  -- The register's identities hold: worked = business - paid_leave - unpaid - on_duty,
  -- and paid_days = business - unpaid_leave_days.
  business_working_days  numeric(5,1) NOT NULL DEFAULT 0,
  paid_leave_days        numeric(5,1) NOT NULL DEFAULT 0,
  unpaid_leave_days      numeric(5,1) NOT NULL DEFAULT 0,
  on_duty_days           numeric(5,1) NOT NULL DEFAULT 0,
  worked_days            numeric(5,1) NOT NULL DEFAULT 0,
  paid_days              numeric(5,1) NOT NULL DEFAULT 0,

  -- Money. In this register Actual Gross and Basic Pay are the same figure —
  -- there is no component breakdown — but both are stored so a future
  -- multi-component structure does not need a schema change to be representable.
  actual_gross           numeric(12,2) NOT NULL DEFAULT 0,
  basic_pay              numeric(12,2) NOT NULL DEFAULT 0,
  unpaid_leave_deduction numeric(12,2) NOT NULL DEFAULT 0,
  total_earnings         numeric(12,2) NOT NULL DEFAULT 0,
  total_deductions       numeric(12,2) NOT NULL DEFAULT 0,

  -- A one-off correction that the formula cannot produce — a prior month's
  -- recovery, most often. In the sample register 4 of 13 rows had a Net Pay
  -- that did not equal Earnings minus Deductions, explained only by a hand
  -- note. Storing the amount keeps the register self-consistent AND auditable
  -- instead of the arithmetic silently not adding up.
  adjustment_amount      numeric(12,2) NOT NULL DEFAULT 0,
  net_pay                numeric(12,2) NOT NULL DEFAULT 0,
  remarks                text,

  -- Excluded people stay ON the register as rows so the gap is countable and
  -- nameable. Dropping them would make "who did we not pay, and why" unanswerable.
  is_included            boolean NOT NULL DEFAULT true,
  exclusion_reason       text,

  -- Which closed month this person's day counts came from. Varies across the
  -- roster when people work outside the paying institution.
  attendance_period_id   uuid REFERENCES public.hr_attendance_periods(id) ON DELETE SET NULL,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_hr_salary_register_lines_run_staff UNIQUE (run_id, staff_id),
  -- An excluded row must say why; an included row must not carry a stale reason.
  CONSTRAINT ck_hr_salary_register_lines_exclusion
    CHECK ((is_included AND exclusion_reason IS NULL)
        OR (NOT is_included AND exclusion_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_hr_salary_register_lines_run
  ON public.hr_salary_register_lines (run_id);
CREATE INDEX IF NOT EXISTS idx_hr_salary_register_lines_staff
  ON public.hr_salary_register_lines (staff_id);
CREATE INDEX IF NOT EXISTS idx_hr_salary_register_lines_period
  ON public.hr_salary_register_lines (attendance_period_id);


-- ── updated_at ─────────────────────────────────────────────────────────────
-- Reuses the generic fn_touch_updated_at rather than adding an 87th
-- table-specific copy of `NEW.updated_at := now()`.
DROP TRIGGER IF EXISTS trg_hr_salary_register_runs_touch ON public.hr_salary_register_runs;
CREATE TRIGGER trg_hr_salary_register_runs_touch
  BEFORE UPDATE ON public.hr_salary_register_runs
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_hr_salary_register_lines_touch ON public.hr_salary_register_lines;
CREATE TRIGGER trg_hr_salary_register_lines_touch
  BEFORE UPDATE ON public.hr_salary_register_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();


-- ── RLS ────────────────────────────────────────────────────────────────────
-- Enabled in the same migration that creates the tables. PostgREST publishes a
-- table the moment it exists; a table without RLS is a public endpoint, not a
-- pending task.
--
-- Every helper call is wrapped in (SELECT ...) so Postgres evaluates it ONCE as
-- an InitPlan instead of per row. The unwrapped form is what produced the 57014
-- statement timeouts elsewhere in this schema.
--
-- Unlike its sibling hr_staff_salaries, this pair also scopes on
-- role_has_institution_access: a register is inherently a per-institution
-- document, and 735 policies in this schema already gate that way. HR Head is
-- institution_scope='all' so it passes for every institution; a future
-- 'own'-scoped payroll role is correctly confined by it.
--
-- No self-read policy. hr_staff_salaries lets people read their OWN pay row;
-- that does not extend here, because a register row also exposes colleagues'
-- context and there is no employee-facing payslip surface yet. Widening the
-- read path before a screen exists for it would only enlarge the blast radius.
ALTER TABLE public.hr_salary_register_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_salary_register_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_salary_register_runs_select ON public.hr_salary_register_runs;
CREATE POLICY hr_salary_register_runs_select
  ON public.hr_salary_register_runs FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('hr.payroll.register.view'))
      AND (SELECT public.role_has_institution_access(institution_id))
    )
  );

DROP POLICY IF EXISTS hr_salary_register_runs_write ON public.hr_salary_register_runs;
CREATE POLICY hr_salary_register_runs_write
  ON public.hr_salary_register_runs FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('hr.payroll.register.manage'))
      AND (SELECT public.role_has_institution_access(institution_id))
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('hr.payroll.register.manage'))
      AND (SELECT public.role_has_institution_access(institution_id))
    )
  );

DROP POLICY IF EXISTS hr_salary_register_runs_service_role ON public.hr_salary_register_runs;
CREATE POLICY hr_salary_register_runs_service_role
  ON public.hr_salary_register_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Lines inherit their parent's verdict. EXISTS against the run rather than a
-- duplicated predicate, so the two can never drift apart.
DROP POLICY IF EXISTS hr_salary_register_lines_select ON public.hr_salary_register_lines;
CREATE POLICY hr_salary_register_lines_select
  ON public.hr_salary_register_lines FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.hr_salary_register_runs r
       WHERE r.id = hr_salary_register_lines.run_id
         AND (SELECT public.user_has_permission('hr.payroll.register.view'))
         AND (SELECT public.role_has_institution_access(r.institution_id))
    )
  );

DROP POLICY IF EXISTS hr_salary_register_lines_write ON public.hr_salary_register_lines;
CREATE POLICY hr_salary_register_lines_write
  ON public.hr_salary_register_lines FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.hr_salary_register_runs r
       WHERE r.id = hr_salary_register_lines.run_id
         AND (SELECT public.user_has_permission('hr.payroll.register.manage'))
         AND (SELECT public.role_has_institution_access(r.institution_id))
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.hr_salary_register_runs r
       WHERE r.id = hr_salary_register_lines.run_id
         AND (SELECT public.user_has_permission('hr.payroll.register.manage'))
         AND (SELECT public.role_has_institution_access(r.institution_id))
    )
  );

DROP POLICY IF EXISTS hr_salary_register_lines_service_role ON public.hr_salary_register_lines;
CREATE POLICY hr_salary_register_lines_service_role
  ON public.hr_salary_register_lines FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ── Grants ─────────────────────────────────────────────────────────────────
-- REVOKE FROM anon, not FROM public: revoking from public also strips the
-- grants authenticated inherits through it.
REVOKE ALL ON public.hr_salary_register_runs  FROM anon;
REVOKE ALL ON public.hr_salary_register_lines FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_salary_register_runs  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_salary_register_lines TO authenticated;


-- ── Permission grants ──────────────────────────────────────────────────────
-- A permission key only EXISTS for a role once it is in that role's JSONB.
-- Declaring it in lib/constants/permissions.ts does nothing on its own — the
-- page would render empty with no error. Granted here, in the same migration.
--
-- HR Head only. It is the sole role already holding all four keys a run has to
-- read through: hr.payroll.institution.view (the roster), hr.payroll.salary.view
-- (the amount), hr.payroll.bank.view (the destination) and
-- hr.attendance.period.view (the day counts). Granting the register keys to a
-- role missing any of those would produce a run that silently omits people —
-- RLS returns zero rows and no error. Super admins pass via is_super_admin().
UPDATE public.custom_roles
   SET permissions = permissions
       || jsonb_build_object('hr.payroll.register.view',   true,
                             'hr.payroll.register.manage', true),
       updated_at = now()
 WHERE role_name = 'HR Head';


COMMENT ON TABLE public.hr_salary_register_runs IS
  'Frozen monthly salary register per PAYER organisation (hr_staff_payroll), computed from closed attendance months + hr_staff_salaries. Not hr_payroll_periods.';
COMMENT ON TABLE public.hr_salary_register_lines IS
  'One row per roster member of a register run, included or excluded. Identity and figures are snapshotted so a later transfer or rename cannot rewrite an issued register.';
COMMENT ON COLUMN public.hr_salary_register_runs.working_days_basis IS
  'The day-rate divisor, frozen. The INSTITUTION month standard, not per-staff working days — dividing by a mid-month joiner''s own count would pay them a full month.';
COMMENT ON COLUMN public.hr_salary_register_runs.source_attendance_period_ids IS
  'Every closed attendance month feeding this run. Plural: the roster follows the payer, whose people may work across several institutions.';
