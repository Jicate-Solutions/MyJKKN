-- HR Attendance — record WHY a late day counts as present.
--
-- evaluateDay() can now reinstate a half whose missing minutes are fully
-- covered by an approved short-time-off window (see lib/hr/biometric/
-- evaluate-day.ts). Without somewhere to put that, HR would see a 09:24 arrival
-- against an 09:05 deadline reading PRESENT with nothing on screen explaining
-- it — indistinguishable from the bug we spent 2026-08-20 fixing.
--
-- late_minutes deliberately stays RAW. It answers "how late was this person";
-- excused_minutes answers "how much of the shortfall was covered". Collapsing
-- them would lose the first question, which is the one attendance reports ask.

ALTER TABLE public.hr_attendance_records
  ADD COLUMN IF NOT EXISTS excused_minutes integer,
  ADD COLUMN IF NOT EXISTS excused_by_application_ids uuid[];

COMMENT ON COLUMN public.hr_attendance_records.excused_minutes IS
  'Minutes of a required half-window reinstated by an approved short-time-off permission. NULL = never evaluated for excusal; 0 = evaluated, nothing excused.';
COMMENT ON COLUMN public.hr_attendance_records.excused_by_application_ids IS
  'hr_leave_applications ids of the permissions that did the reinstating. No FK: these rows outlive an application that is later purged, and an orphaned id is better than losing the audit of why a day counted.';

-- ---------------------------------------------------------------------------
-- A shift window lookup that a service-role context can actually call.
-- ---------------------------------------------------------------------------
-- fn_resolve_shift_timing and fn_resolve_shift_timings_bulk both guard on
-- is_super_admin / is_admin / hr.shift_timings.view / hr.attendance.override.
-- All four are false when auth.uid() is NULL, so neither can be used from a
-- service-role client — which is exactly what recomputing a day on leave
-- approval needs, because an HR Manager holding hr.leave.approve holds none of
-- those four and cannot write hr_attendance_records either.
--
-- This variant carries the identical resolution — institution + ISO day_of_week
-- + effective window + staff_scope precedence (category beats teaching /
-- non_teaching) + the second-Saturday override — with no authorisation gate,
-- for the same reason hr_is_working_day has none: it returns an institution's
-- working-hours calendar for one date. No punches, no verdicts, nothing about
-- the person beyond which shift pattern applies to them.
CREATE OR REPLACE FUNCTION public.fn_shift_window(p_staff_id uuid, p_date date)
RETURNS TABLE (
  timing_id          uuid,
  is_working_day     boolean,
  first_half_start   time without time zone,
  first_half_end     time without time zone,
  second_half_start  time without time zone,
  second_half_end    time without time zone,
  grace_minutes      integer,
  matched_by         text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_institution_id uuid;
  v_category_id    uuid;
  v_is_teaching    boolean;
  v_dow            smallint;
  v_second_sat     boolean;
BEGIN
  IF p_staff_id IS NULL OR p_date IS NULL THEN
    RETURN;
  END IF;

  SELECT s.institution_id, s.category_id, ec.is_teaching
    INTO v_institution_id, v_category_id, v_is_teaching
  FROM public.staff s
  JOIN public.employment_categories ec ON ec.id = s.category_id
  WHERE s.id = p_staff_id;

  IF v_institution_id IS NULL THEN
    RETURN;
  END IF;

  v_dow        := EXTRACT(ISODOW FROM p_date)::smallint;
  v_second_sat := (v_dow = 6 AND EXTRACT(DAY FROM p_date) BETWEEN 8 AND 14);

  RETURN QUERY
  SELECT
    t.id,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN false ELSE t.is_working_day END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_start  END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_end    END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_start END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_end   END,
    t.grace_minutes,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN 'second_saturday_holiday'
         ELSE t.staff_scope END
  FROM public.hr_shift_timings t
  WHERE t.institution_id = v_institution_id
    AND t.day_of_week    = v_dow
    AND t.is_active
    AND t.effective_from <= p_date
    AND (t.effective_until IS NULL OR t.effective_until > p_date)
    AND (
         (t.staff_scope = 'category'     AND t.employment_category_id = v_category_id)
      OR (t.staff_scope = 'teaching'     AND v_is_teaching)
      OR (t.staff_scope = 'non_teaching' AND NOT v_is_teaching)
    )
  ORDER BY CASE t.staff_scope WHEN 'category' THEN 0 ELSE 1 END,
           t.effective_from DESC
  LIMIT 1;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_shift_window(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_shift_window(uuid, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_shift_window(uuid, date) IS
  'Shift window for one staff member on one date, second-Saturday rule included. Ungated on purpose — it returns a working-hours calendar, not staff data — so a service-role recompute after a leave decision can resolve it.';
