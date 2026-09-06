-- =====================================================================
-- hr_attendance_records — biometric fields, day_calc guard, and the two
-- missing RLS policies that are the reason the table is empty
-- =====================================================================
-- Plan: docs/superpowers/plans/2026-08-06-biometric-attendance-ingestion.md
--
-- This table is the canonical per-day staff attendance store: keyed on
-- staff.id, carries both tenancy columns, has a governed status FK and a
-- UNIQUE (employee_id, work_date). It has never held a row because it has
-- NO SELECT POLICY AND NO INSERT POLICY — only UPDATE and DELETE. Nothing
-- could read or write it. That is fixed here.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Columns carried straight from the device export
-- ---------------------------------------------------------------------
ALTER TABLE public.hr_attendance_records
  ADD COLUMN IF NOT EXISTS overtime_minutes integer NULL,
  ADD COLUMN IF NOT EXISTS break_minutes    integer NULL,
  ADD COLUMN IF NOT EXISTS device_status    text    NULL;

-- ---------------------------------------------------------------------
-- Columns WE compute against hr_shift_timings
-- ---------------------------------------------------------------------
ALTER TABLE public.hr_attendance_records
  ADD COLUMN IF NOT EXISTS first_half_attended  boolean NULL,
  ADD COLUMN IF NOT EXISTS second_half_attended boolean NULL,
  ADD COLUMN IF NOT EXISTS late_minutes         integer NULL,
  ADD COLUMN IF NOT EXISTS shift_timing_id      uuid    NULL
    REFERENCES public.hr_shift_timings(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- Provenance: which machine, and under which code, produced this row
-- ---------------------------------------------------------------------
ALTER TABLE public.hr_attendance_records
  ADD COLUMN IF NOT EXISTS biometric_institution_id uuid NULL
    REFERENCES public.institutions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS biometric_code text NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_attendance_records_minutes_chk') THEN
    ALTER TABLE public.hr_attendance_records
      ADD CONSTRAINT hr_attendance_records_minutes_chk CHECK (
        (overtime_minutes IS NULL OR overtime_minutes >= 0) AND
        (break_minutes    IS NULL OR break_minutes    >= 0) AND
        (late_minutes     IS NULL OR late_minutes     >= 0)
      );
  END IF;

  -- day_calc shipped as an unconstrained varchar defaulting to 'FULL'.
  -- NONE = present on site but covering neither half window.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_attendance_records_day_calc_chk') THEN
    ALTER TABLE public.hr_attendance_records
      ADD CONSTRAINT hr_attendance_records_day_calc_chk
      CHECK (day_calc IS NULL OR day_calc IN ('FULL','HALF','NONE'));
  END IF;
END $$;

COMMENT ON COLUMN public.hr_attendance_records.device_status IS
  'The machine''s own verdict, stored verbatim (P/A). NEVER used in place of status_type_id — the machines have no weekly-off configured and mark every Sunday Absent. Kept so disagreements stay auditable.';
COMMENT ON COLUMN public.hr_attendance_records.shift_timing_id IS
  'The hr_shift_timings row that produced this verdict. Lets a disputed half-day be explained with the rule that was actually in force that day, not today''s config.';
COMMENT ON COLUMN public.hr_attendance_records.late_minutes IS
  'Minutes past (first_half_start + grace_minutes). Recorded and flagged; per the agreed policy the day still counts as full.';

CREATE INDEX IF NOT EXISTS hr_attendance_records_shift_timing
  ON public.hr_attendance_records (shift_timing_id)
  WHERE shift_timing_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- WEEKLY_OFF status type.
-- The machines report Sundays as 'A' with WO=0 (192 of them in the July
-- export). HOLIDAY would be semantically wrong for a recurring weekly rest
-- day, so the vocabulary gains one system row.
-- ---------------------------------------------------------------------
INSERT INTO public.hr_attendance_status_types
  (institution_id, code, label, affects_lop, affects_leave_balance, late_grace_minutes, is_system, is_active)
SELECT NULL, 'WEEKLY_OFF', 'Weekly Off', false, false, 0, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_attendance_status_types WHERE code = 'WEEKLY_OFF' AND institution_id IS NULL
);

-- ---------------------------------------------------------------------
-- The missing policies.
-- Mirrors the hr_attendance_status_types idiom; the (SELECT fn()) wrapping
-- forces once-per-query evaluation (the 57014 statement-timeout fix).
--
-- institution_id is nullable on this table, so the permission branches require
-- it to be present — a row with no institution is visible only to the person
-- it belongs to, and to admins.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS hr_attendance_records_select ON public.hr_attendance_records;
CREATE POLICY hr_attendance_records_select ON public.hr_attendance_records
  FOR SELECT USING (
       (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR EXISTS (
         SELECT 1 FROM public.staff s
          WHERE s.id = hr_attendance_records.employee_id
            AND s.profile_id = auth.uid()
       )
    OR ((SELECT public.user_has_permission('hr.attendance.view_all'))
        AND institution_id IS NOT NULL
        AND public.role_has_institution_access(institution_id))
    OR ((SELECT public.user_has_permission('hr.attendance.override'))
        AND institution_id IS NOT NULL
        AND public.role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_attendance_records_insert ON public.hr_attendance_records;
CREATE POLICY hr_attendance_records_insert ON public.hr_attendance_records
  FOR INSERT WITH CHECK (
       (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.attendance.override'))
        AND institution_id IS NOT NULL
        AND public.role_has_institution_access(institution_id))
  );
