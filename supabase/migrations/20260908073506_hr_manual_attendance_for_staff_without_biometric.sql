-- ============================================================================
-- Manual attendance, for the staff a biometric machine never sees.
--
-- WHY. On 2026-09-08, 239 of 503 HR staff had no August attendance row at all:
-- Dental 126 of 130, JKKN Matric Hr Sec School 55 of 55, Nattraja Vidhyalya
-- CBSE 33 of 33, plus ~25 scattered individuals whose device is off-campus.
-- Every one of them reaches the salary register as 'no_attendance_summary' and
-- is paid nothing. Two entire schools run manually as a matter of course, so
-- this is a supported mode, not an exception.
--
-- THE GENERATOR IS NOT PART OF THE CLOSE, deliberately. HR runs it, reviews and
-- corrects the days, and only then closes. A close that fabricated attendance
-- would make "nobody attended" indistinguishable from "everybody did" — the
-- exact silent-success failure the institution-drift bug demonstrated.
-- ============================================================================

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS attendance_mode text NOT NULL DEFAULT 'biometric';

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_attendance_mode_check;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_attendance_mode_check
  CHECK (attendance_mode IN ('biometric', 'manual'));

-- Partial: the manual set is the minority and the only one ever scanned for.
CREATE INDEX IF NOT EXISTS staff_manual_attendance_idx
  ON public.staff (institution_id) WHERE attendance_mode = 'manual';

COMMENT ON COLUMN public.staff.attendance_mode IS
  'biometric = days come from a punch import. manual = days are generated from this person''s schedule by fn_hr_generate_manual_attendance and corrected by hand, because no machine covers them. ONE axis on purpose: an institution is made manual by marking its staff, not by a second flag that would have to be reconciled with this one.';


-- The generator. Idempotent and strictly additive.
CREATE OR REPLACE FUNCTION public.fn_hr_generate_manual_attendance(
  p_institution_id uuid,
  p_year integer,
  p_month integer,
  p_staff_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start   date;
  v_end     date;
  v_org     uuid;
  v_present uuid;
  v_woff    uuid;
  v_holiday uuid;
  v_created integer := 0;
  v_staff   integer := 0;
  v_locked  record;
BEGIN
  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Month must be 1-12, got %', p_month USING ERRCODE = '22023';
  END IF;

  IF NOT (public.is_super_admin()
          OR public.user_has_permission('hr.attendance.manual.generate')) THEN
    RAISE EXCEPTION 'hr.attendance.manual.generate is required to generate manual attendance.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.fn_hr_institution_included(p_institution_id) THEN
    RAISE EXCEPTION 'This institution is excluded from the HR module.' USING ERRCODE = '23514';
  END IF;

  v_start := make_date(p_year, p_month, 1);
  v_end   := (v_start + interval '1 month - 1 day')::date;

  -- Said plainly here rather than left to the row trigger, which would report
  -- one refused row instead of the reason the whole run cannot proceed.
  SELECT ap.period_year, ap.period_month, ap.locked_at INTO v_locked
    FROM public.hr_attendance_periods ap
   WHERE ap.institution_id = p_institution_id
     AND ap.period_year = p_year AND ap.period_month = p_month
     AND ap.status = 'locked';
  IF FOUND THEN
    RAISE EXCEPTION
      'Attendance for %-% is already closed (locked %). Reopen the month before generating.',
      v_locked.period_year, lpad(v_locked.period_month::text, 2, '0'),
      to_char(v_locked.locked_at, 'DD Mon YYYY')
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_org FROM public.hr_organizations WHERE institution_id = p_institution_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'This institution has no HR organisation, so attendance has nowhere to belong.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_present FROM public.hr_attendance_status_types WHERE code = 'PRESENT'     AND institution_id IS NULL;
  SELECT id INTO v_woff    FROM public.hr_attendance_status_types WHERE code = 'WEEKLY_OFF'  AND institution_id IS NULL;
  SELECT id INTO v_holiday FROM public.hr_attendance_status_types WHERE code = 'HOLIDAY'     AND institution_id IS NULL;

  WITH roster AS (
    SELECT v.id, v.category_id, ec.is_teaching, v.gender
      FROM public.v_hr_staff v
      JOIN public.employment_categories ec ON ec.id = v.category_id
      JOIN public.staff s ON s.id = v.id
     WHERE v.institution_id = p_institution_id
       AND v.is_active
       AND s.attendance_mode = 'manual'
       AND (p_staff_ids IS NULL OR v.id = ANY (p_staff_ids))
  ), days AS (
    SELECT gs::date AS d FROM generate_series(v_start, v_end, interval '1 day') gs
  ), hol AS (
    SELECT h.holiday_date FROM public.fn_hr_calendar_holiday_dates(p_institution_id, v_start, v_end) h
  ), resolved AS (
    SELECT r.id AS staff_id,
           dd.d AS work_date,
           EXISTS (SELECT 1 FROM hol WHERE hol.holiday_date = dd.d) AS is_holiday,
           COALESCE(
             CASE WHEN (EXTRACT(ISODOW FROM dd.d) = 6
                        AND EXTRACT(DAY FROM dd.d) BETWEEN 8 AND 14
                        AND t.second_saturday_holiday) THEN false
                  ELSE t.is_working_day END,
             false) AS is_working
      FROM roster r
      CROSS JOIN days dd
      LEFT JOIN LATERAL public.fn_shift_timing_pick(
        p_institution_id, r.category_id, r.is_teaching, r.gender,
        EXTRACT(ISODOW FROM dd.d)::smallint, dd.d,
        public.fn_staff_work_pattern_id(r.id, dd.d)) t ON true
  ), written AS (
    INSERT INTO public.hr_attendance_records (
      employee_id, hr_organization_id, institution_id, work_date, status_type_id,
      source, day_calc, notes
    )
    SELECT rs.staff_id, v_org, p_institution_id, rs.work_date,
           CASE WHEN rs.is_holiday     THEN v_holiday
                WHEN NOT rs.is_working THEN v_woff
                ELSE v_present END,
           'manual',
           CASE WHEN rs.is_holiday OR NOT rs.is_working THEN 'NONE' ELSE 'FULL' END,
           'Generated: this staff member is not covered by a biometric device.'
      FROM resolved rs
    -- NEVER OVERWRITE. A real punch, a regularisation or an HR correction on
    -- the same day already says something truer than a generated PRESENT, so a
    -- re-run only fills the gaps it finds.
    ON CONFLICT (employee_id, work_date) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_created FROM written;

  SELECT count(*) INTO v_staff
    FROM public.v_hr_staff v JOIN public.staff s ON s.id = v.id
   WHERE v.institution_id = p_institution_id AND v.is_active
     AND s.attendance_mode = 'manual'
     AND (p_staff_ids IS NULL OR v.id = ANY (p_staff_ids));

  RETURN jsonb_build_object(
    'institution_id', p_institution_id,
    'year',  p_year,
    'month', p_month,
    'staff_considered', v_staff,
    'days_created',     v_created
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_generate_manual_attendance(uuid, integer, integer, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_hr_generate_manual_attendance(uuid, integer, integer, uuid[])
  TO authenticated, service_role;


-- The key, AND the grant. A key declared in the catalog but granted to nobody
-- renders an empty screen and reads as a broken feature.
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('hr.attendance.manual.generate', true),
       updated_at  = now()
 WHERE role_key = 'hr_head';
