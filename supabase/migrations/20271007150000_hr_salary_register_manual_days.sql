-- ════════════════════════════════════════════════════════════════════════════
-- Salary Register — attendance entered by hand for excluded staff (2026-10-07)
--
-- Staff with no biometric record have no attendance summary for the month, so
-- the register lists them as EXCLUDED (no_attendance_summary) with zero
-- figures — 31 people across the live registers at build time. HR (super admin
-- and HR Head) now enters their DAYS by hand; PAY is still computed from the
-- recorded salary by computeRegisterLine, the same formula as every biometric
-- row, so a hand-entered row cannot be paid on a different rule.
--
--   a) hr_salary_register_manual_days — the entered days, one row per paying
--      institution × month × staff. Stored apart from the register so a
--      REGENERATED register picks them up again instead of re-excluding the
--      person. A biometric summary, if one appears later, always wins.
--   b) hr_salary_register_lines gains entry_source ('biometric' | 'manual') and
--      a snapshot of the reason / who / when, so a hand-entered row is marked
--      on screen and in the workbook.
--
-- No new permission keys: read = hr.payroll.register.view, write =
-- hr.payroll.register.manage (HR Head alone) or is_super_admin(), exactly as the
-- register tables themselves.
-- ════════════════════════════════════════════════════════════════════════════

-- ── a) Entered days ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_salary_register_manual_days (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id     uuid NOT NULL REFERENCES public.hr_organizations(id) ON DELETE CASCADE,
  institution_id         uuid NOT NULL REFERENCES public.institutions(id),
  period_year            integer NOT NULL CHECK (period_year BETWEEN 2020 AND 2100),
  period_month           integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  staff_id               uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,

  business_working_days  numeric(5,2) NOT NULL,
  casual_leave_days      numeric(5,2) NOT NULL DEFAULT 0,
  comp_off_days          numeric(5,2) NOT NULL DEFAULT 0,
  other_paid_leave_days  numeric(5,2) NOT NULL DEFAULT 0,
  on_duty_days           numeric(5,2) NOT NULL DEFAULT 0,
  -- LOP. Worked days are DERIVED (working − the five above), never stored, so a
  -- row cannot be saved that fails to add up.
  unpaid_leave_days      numeric(5,2) NOT NULL DEFAULT 0,

  -- Only when the person has NO salary recorded; NULL means "use the salary in
  -- force", which is the normal case.
  monthly_gross          numeric(12,2),

  reason                 text NOT NULL,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_hr_salary_register_manual_days_staff_month
    UNIQUE (hr_organization_id, period_year, period_month, staff_id),
  CONSTRAINT hr_srmd_working_days_chk
    CHECK (business_working_days > 0 AND business_working_days <= 31),
  CONSTRAINT hr_srmd_days_nonneg_chk
    CHECK (casual_leave_days >= 0 AND comp_off_days >= 0 AND other_paid_leave_days >= 0
           AND on_duty_days >= 0 AND unpaid_leave_days >= 0),
  -- Half-days are real; quarter-days are a typo.
  CONSTRAINT hr_srmd_half_day_steps_chk
    CHECK (business_working_days * 2 = trunc(business_working_days * 2)
           AND casual_leave_days * 2 = trunc(casual_leave_days * 2)
           AND comp_off_days * 2 = trunc(comp_off_days * 2)
           AND other_paid_leave_days * 2 = trunc(other_paid_leave_days * 2)
           AND on_duty_days * 2 = trunc(on_duty_days * 2)
           AND unpaid_leave_days * 2 = trunc(unpaid_leave_days * 2)),
  CONSTRAINT hr_srmd_days_fit_month_chk
    CHECK (casual_leave_days + comp_off_days + other_paid_leave_days + on_duty_days + unpaid_leave_days
           <= business_working_days),
  CONSTRAINT hr_srmd_monthly_gross_chk
    CHECK (monthly_gross IS NULL OR (monthly_gross > 0 AND monthly_gross < 100000000)),
  CONSTRAINT hr_srmd_reason_chk
    CHECK (length(btrim(reason)) BETWEEN 3 AND 300)
);

COMMENT ON TABLE public.hr_salary_register_manual_days IS
  'Attendance days entered by hand (super admin / HR Head) for staff the salary register would exclude for want of an attendance summary. Pay is still computed from the salary in force. Reused on regeneration; a biometric summary takes priority.';

-- The UNIQUE leads with hr_organization_id; the rest of the FKs get their own.
CREATE INDEX IF NOT EXISTS idx_hr_srmd_institution ON public.hr_salary_register_manual_days (institution_id);
CREATE INDEX IF NOT EXISTS idx_hr_srmd_staff       ON public.hr_salary_register_manual_days (staff_id);
CREATE INDEX IF NOT EXISTS idx_hr_srmd_created_by  ON public.hr_salary_register_manual_days (created_by);
CREATE INDEX IF NOT EXISTS idx_hr_srmd_updated_by  ON public.hr_salary_register_manual_days (updated_by);

DROP TRIGGER IF EXISTS trg_hr_salary_register_manual_days_touch ON public.hr_salary_register_manual_days;
CREATE TRIGGER trg_hr_salary_register_manual_days_touch
  BEFORE UPDATE ON public.hr_salary_register_manual_days
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

ALTER TABLE public.hr_salary_register_manual_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_salary_register_manual_days_select ON public.hr_salary_register_manual_days;
CREATE POLICY hr_salary_register_manual_days_select
  ON public.hr_salary_register_manual_days
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('hr.payroll.register.view'))
      AND (SELECT public.role_has_institution_access(institution_id))
    )
  );

-- institution_id is pinned to the organisation's own institution, so a manager
-- of one college cannot file days against another college's register.
DROP POLICY IF EXISTS hr_salary_register_manual_days_insert ON public.hr_salary_register_manual_days;
CREATE POLICY hr_salary_register_manual_days_insert
  ON public.hr_salary_register_manual_days
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hr_organizations o
       WHERE o.id = hr_salary_register_manual_days.hr_organization_id
         AND o.institution_id = hr_salary_register_manual_days.institution_id
    )
    AND (
      (SELECT public.is_super_admin())
      OR (
        (SELECT public.user_has_permission('hr.payroll.register.manage'))
        AND (SELECT public.role_has_institution_access(institution_id))
      )
    )
  );

DROP POLICY IF EXISTS hr_salary_register_manual_days_update ON public.hr_salary_register_manual_days;
CREATE POLICY hr_salary_register_manual_days_update
  ON public.hr_salary_register_manual_days
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('hr.payroll.register.manage'))
      AND (SELECT public.role_has_institution_access(institution_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hr_organizations o
       WHERE o.id = hr_salary_register_manual_days.hr_organization_id
         AND o.institution_id = hr_salary_register_manual_days.institution_id
    )
    AND (
      (SELECT public.is_super_admin())
      OR (
        (SELECT public.user_has_permission('hr.payroll.register.manage'))
        AND (SELECT public.role_has_institution_access(institution_id))
      )
    )
  );

-- No DELETE policy: an entry is corrected, never silently removed.

DROP POLICY IF EXISTS hr_salary_register_manual_days_service_role ON public.hr_salary_register_manual_days;
CREATE POLICY hr_salary_register_manual_days_service_role
  ON public.hr_salary_register_manual_days
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.hr_salary_register_manual_days FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.hr_salary_register_manual_days TO authenticated;

-- ── b) Mark hand-entered register rows ──────────────────────────────────────

ALTER TABLE public.hr_salary_register_lines
  ADD COLUMN IF NOT EXISTS entry_source text NOT NULL DEFAULT 'biometric',
  ADD COLUMN IF NOT EXISTS manual_entry_id uuid
    REFERENCES public.hr_salary_register_manual_days(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manual_reason text,
  ADD COLUMN IF NOT EXISTS manual_entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manual_entered_at timestamptz;

ALTER TABLE public.hr_salary_register_lines
  DROP CONSTRAINT IF EXISTS ck_hr_salary_register_lines_entry_source;
ALTER TABLE public.hr_salary_register_lines
  ADD CONSTRAINT ck_hr_salary_register_lines_entry_source
  CHECK (entry_source IN ('biometric', 'manual'));

CREATE INDEX IF NOT EXISTS idx_hr_salary_register_lines_manual_entry
  ON public.hr_salary_register_lines (manual_entry_id);
CREATE INDEX IF NOT EXISTS idx_hr_salary_register_lines_manual_entered_by
  ON public.hr_salary_register_lines (manual_entered_by);

COMMENT ON COLUMN public.hr_salary_register_lines.entry_source IS
  '''biometric'' = days from the frozen attendance summary; ''manual'' = days entered by hand (hr_salary_register_manual_days).';
