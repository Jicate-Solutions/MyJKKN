-- CLOSING THE ATTENDANCE MONTH. One row per (institution, year, month).
--
-- WHY NOT hr_payroll_periods
-- --------------------------
-- That table already has a `locked` status, and reusing it was the obvious
-- move. It is the wrong shape for two reasons:
--
--   1. ITS LOCK IS AT THE WRONG END OF THE PIPELINE. `locked` is the FINAL
--      stage, reached only after `distributed` -- payslips are generated and
--      handed out, THEN the month locks. Freezing attendance has to happen
--      BEFORE payroll reads the day counts, not after.
--   2. IT CARRIES A FIVE-SIGNATURE CHAIN (CAO, Accounts, Chairperson,
--      Director) because it authorises MONEY. Closing attendance is one HR
--      Head action. Putting it behind the payroll chain would mean nobody can
--      close a month until the Chairperson has signed something unrelated.
--
-- hr_payroll_periods is also scoped by hr_organization_id and engine_type. An
-- attendance month is neither -- it is simply an institution and a month.
--
-- TWO STATES, NOT MORE. open -> locked. A 'processing' state was considered
-- and dropped: computing the summaries and locking are one action, and a
-- transient state that nothing can be done in is just a way to get stuck.

CREATE TABLE IF NOT EXISTS public.hr_attendance_periods (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id     uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  period_year        integer NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  period_month       integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),

  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked')),

  locked_at          timestamptz,
  locked_by          uuid,
  -- Set when the lock was taken with pending requests still outstanding. Those
  -- requests are auto-rejected with a stamped reason rather than left in limbo,
  -- so this flag marks a month whose close involved a judgement call.
  forced             boolean NOT NULL DEFAULT false,
  force_reason       text,

  reopened_at        timestamptz,
  reopened_by        uuid,
  reopen_reason      text,

  -- Frozen at lock time. NOT recomputed on read: the whole point is that a
  -- payslip generated against this month can be reconciled later even after
  -- shift timings or holidays are edited.
  working_days_count integer,
  staff_count        integer,

  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,
  updated_by         uuid,

  CONSTRAINT hr_attendance_periods_unique UNIQUE (institution_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS hr_attendance_periods_lookup_idx
  ON public.hr_attendance_periods (period_year, period_month, status);

DROP TRIGGER IF EXISTS trg_hr_attendance_periods_updated_at ON public.hr_attendance_periods;
CREATE TRIGGER trg_hr_attendance_periods_updated_at
  BEFORE UPDATE ON public.hr_attendance_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- The frozen day counts, one row per (period, staff member).
--
-- DERIVED FROM hr_attendance_records, NOT FROM A CALENDAR RULE. The evaluator
-- already writes WEEKLY_OFF from hr_shift_timings, so working days are simply
-- "days that are neither a weekly off nor a holiday". Recomputing them from
-- "calendar minus Sundays" -- which is what fn_prepare_payroll_period does --
-- would be a THIRD independent definition of a working day, and it is already
-- wrong: Saturday is a working day at all 14 institutions, and that same
-- assumption left every Saturday uncharged in the leave engine until it was
-- fixed on 2026-08-20.
CREATE TABLE IF NOT EXISTS public.hr_attendance_period_summaries (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id              uuid NOT NULL REFERENCES public.hr_attendance_periods(id) ON DELETE CASCADE,
  staff_id               uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,

  -- numeric(5,1) throughout: a half day is 0.5, and an integer column would
  -- silently round it into a full day of pay.
  working_days           numeric(5,1) NOT NULL DEFAULT 0,
  present_days           numeric(5,1) NOT NULL DEFAULT 0,
  half_days              integer      NOT NULL DEFAULT 0,
  absent_days            numeric(5,1) NOT NULL DEFAULT 0,
  weekly_off_days        integer      NOT NULL DEFAULT 0,
  holiday_days           integer      NOT NULL DEFAULT 0,
  leave_days             numeric(5,1) NOT NULL DEFAULT 0,
  on_duty_days           numeric(5,1) NOT NULL DEFAULT 0,
  comp_off_days          numeric(5,1) NOT NULL DEFAULT 0,

  -- Loss of pay: working days neither attended nor covered by an approved
  -- absence. This is the number payroll prorates on.
  lop_days               numeric(5,1) NOT NULL DEFAULT 0,
  payable_days           numeric(5,1) NOT NULL DEFAULT 0,

  -- {"CL": 2, "ML": 1} -- per leave-type code, so a payslip can print "CL 2"
  -- rather than a pooled "leave 3" that cannot distinguish paid from unpaid.
  leave_by_type          jsonb        NOT NULL DEFAULT '{}'::jsonb,

  short_time_off_minutes integer      NOT NULL DEFAULT 0,
  late_minutes           integer      NOT NULL DEFAULT 0,
  excused_minutes        integer      NOT NULL DEFAULT 0,

  -- Days the evaluator could not judge at lock time. Kept because a payslip
  -- built on top of unresolved days should say so.
  unprocessed_days       integer      NOT NULL DEFAULT 0,

  computed_at            timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT hr_attendance_period_summaries_unique UNIQUE (period_id, staff_id)
);

CREATE INDEX IF NOT EXISTS hr_attendance_period_summaries_staff_idx
  ON public.hr_attendance_period_summaries (staff_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_attendance_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_attendance_period_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_attendance_periods_service_role ON public.hr_attendance_periods;
CREATE POLICY hr_attendance_periods_service_role ON public.hr_attendance_periods
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Reading WHETHER a month is closed is not sensitive -- it is a fact every
-- employee needs, because it is the reason their leave form refuses. Gated on
-- the ordinary self-service attendance key rather than the manage key.
DROP POLICY IF EXISTS hr_attendance_periods_select ON public.hr_attendance_periods;
CREATE POLICY hr_attendance_periods_select ON public.hr_attendance_periods
  FOR SELECT USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.attendance.period.view'))
    OR (SELECT public.user_has_permission('hr.attendance.view_self'))
  );

DROP POLICY IF EXISTS hr_attendance_periods_write ON public.hr_attendance_periods;
CREATE POLICY hr_attendance_periods_write ON public.hr_attendance_periods
  FOR ALL USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.attendance.period.manage'))
  ) WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.attendance.period.manage'))
  );

DROP POLICY IF EXISTS hr_attendance_period_summaries_service_role ON public.hr_attendance_period_summaries;
CREATE POLICY hr_attendance_period_summaries_service_role ON public.hr_attendance_period_summaries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Day counts drive pay, so the read gate is the period key OR your own row.
DROP POLICY IF EXISTS hr_attendance_period_summaries_select ON public.hr_attendance_period_summaries;
CREATE POLICY hr_attendance_period_summaries_select ON public.hr_attendance_period_summaries
  FOR SELECT USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.attendance.period.view'))
    OR staff_id IN (SELECT unnest(public.fn_my_staff_ids()))
  );

DROP POLICY IF EXISTS hr_attendance_period_summaries_write ON public.hr_attendance_period_summaries;
CREATE POLICY hr_attendance_period_summaries_write ON public.hr_attendance_period_summaries
  FOR ALL USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.attendance.period.manage'))
  ) WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.attendance.period.manage'))
  );

COMMENT ON TABLE public.hr_attendance_periods IS
  'Attendance month close, per institution. Upstream of hr_payroll_periods: freeze the day counts BEFORE payroll reads them, not after distribution.';
COMMENT ON COLUMN public.hr_attendance_periods.forced IS
  'Locked while requests were still pending. Those requests were auto-rejected with a stamped reason rather than silently denied.';
COMMENT ON TABLE public.hr_attendance_period_summaries IS
  'Frozen per-staff day counts. Derived from hr_attendance_records so working days match the evaluator, not a separate calendar rule.';

-- ---------------------------------------------------------------------------
-- Grants. HR HEAD closes the month; the Super Administrator passes through
-- is_super_admin(). Reopening is super-admin-only and is enforced in the RPC,
-- not by a third key.
-- ---------------------------------------------------------------------------
UPDATE public.custom_roles
   SET permissions = permissions
         || jsonb_build_object('hr.attendance.period.view',   true,
                               'hr.attendance.period.manage', true),
       updated_at = now()
 WHERE is_active AND role_key = 'hr_head';

-- Everyone else stored as an explicit denial: Role Management rewrites the
-- whole catalogue on save, and a key-presence test reads an absent key and a
-- false one differently.
UPDATE public.custom_roles
   SET permissions = permissions
         || jsonb_build_object('hr.attendance.period.view',   false,
                               'hr.attendance.period.manage', false),
       updated_at = now()
 WHERE is_active AND role_key NOT IN ('hr_head', 'super_admin');
