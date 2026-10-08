-- A clinical-duty day must not read LOP while the person is still on shift.
--
-- fn_hr_clinical_punch used to write the day's attendance row at the IN punch,
-- as ABSENT, and only the OUT punch re-judged it. So a person who had punched
-- IN at 11:05 saw LOP on My Attendance for the whole shift (reported 2026-10-05).
-- The evaluator is right that a single punch is an absence -- it is wrong to
-- say so before the shift is over.
--
-- NOW: the IN punch is recorded in hr_clinical_punches only. The day stays
-- "attendance yet to be processed" -- exactly as any day with no row does -- until
-- the OUT punch, which writes the row (with both times) for the shift-timing
-- evaluator to judge. A day that was punched IN and never OUT is closed by
-- fn_hr_clinical_close_open_days after midnight IST: ABSENT, with the reason
-- "Only one punch recorded", the same wording a biometric single punch gets.

CREATE OR REPLACE FUNCTION public.fn_hr_clinical_punch(
  p_lat        numeric,
  p_lng        numeric,
  p_accuracy_m numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_today   date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_staff   record;
  v_site    record;
  v_dist    integer;
  v_rec     record;
  v_type    text;
  v_in      record;
  v_org     uuid;
  v_absent  uuid;
  v_rows    integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to mark attendance.' USING ERRCODE = '28000';
  END IF;

  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Your location could not be read. Turn on location access and try again.' USING ERRCODE = '22023';
  END IF;
  IF p_accuracy_m IS NULL OR p_accuracy_m < 0 THEN
    RAISE EXCEPTION 'Your location could not be read. Turn on location access and try again.' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.institution_id INTO v_staff
  FROM public.staff s
  WHERE s.profile_id = v_uid AND s.is_active
    AND public.fn_hr_clinical_eligible(s.id, v_today)
  ORDER BY s.id LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not approved for clinical duty attendance.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_hr_institution_included(v_staff.institution_id) THEN
    RAISE EXCEPTION 'Attendance is not managed in HR for your institution.' USING ERRCODE = '42501';
  END IF;

  SELECT x.*, round(x.d)::integer AS dist INTO v_site
  FROM (
    SELECT st.id, st.name, st.radius_m,
           2 * 6371000 * asin(sqrt(
             power(sin(radians(st.lat - p_lat) / 2), 2) +
             cos(radians(p_lat)) * cos(radians(st.lat)) *
             power(sin(radians(st.lng - p_lng) / 2), 2))) AS d
    FROM public.fn_hr_clinical_allowed_sites(v_staff.id, v_today) st
  ) x
  ORDER BY x.d LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No clinical duty site is set up for you. Ask HR to add one.' USING ERRCODE = 'P0001';
  END IF;
  v_dist := v_site.dist;
  IF v_dist > v_site.radius_m THEN
    RAISE EXCEPTION 'You are % m from % (allowed within % m). Move to the duty site and try again.',
      v_dist, v_site.name, v_site.radius_m USING ERRCODE = 'P0001';
  END IF;
  IF p_accuracy_m > v_site.radius_m THEN
    RAISE EXCEPTION 'Your location is not accurate enough (% m, % needs % m or better). Move to an open area and try again.',
      round(p_accuracy_m)::text, v_site.name, v_site.radius_m USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_staff.id::text || ':clinical:' || v_today::text, 0));

  SELECT * INTO v_rec FROM public.hr_attendance_records
  WHERE employee_id = v_staff.id AND work_date = v_today;
  IF FOUND AND v_rec.source <> 'clinical_geotag' THEN
    RAISE EXCEPTION 'Today already has attendance from %. A clinical punch cannot be added.', v_rec.source
      USING ERRCODE = 'P0001';
  END IF;

  SELECT punched_at, lat, lng, accuracy_m INTO v_in FROM public.hr_clinical_punches
  WHERE employee_id = v_staff.id AND work_date = v_today AND punch_type = 'in';

  IF NOT FOUND THEN
    v_type := 'in';
  ELSIF EXISTS (SELECT 1 FROM public.hr_clinical_punches
                WHERE employee_id = v_staff.id AND work_date = v_today AND punch_type = 'out') THEN
    RAISE EXCEPTION 'You have already punched in and out today.' USING ERRCODE = 'P0001';
  ELSIF now() < v_in.punched_at + interval '1 minute' THEN
    RAISE EXCEPTION 'You punched in a moment ago. Wait a minute before punching out.' USING ERRCODE = 'P0001';
  ELSE
    v_type := 'out';
  END IF;

  INSERT INTO public.hr_clinical_punches
    (employee_id, work_date, punch_type, site_id, lat, lng, accuracy_m, distance_m)
  VALUES
    (v_staff.id, v_today, v_type, v_site.id, p_lat, p_lng, round(p_accuracy_m)::integer, v_dist);

  -- IN writes NO attendance row: the day stays "yet to be processed" until OUT.
  IF v_type = 'out' THEN
    SELECT id INTO v_org FROM public.hr_organizations WHERE institution_id = v_staff.institution_id LIMIT 1;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Your institution has no HR organisation set up.' USING ERRCODE = 'P0001';
    END IF;
    SELECT id INTO v_absent FROM public.hr_attendance_status_types
    WHERE code = 'ABSENT' AND institution_id IS NULL;

    -- Provisional ABSENT: the route re-judges it against the shift timing in the
    -- same request. ON CONFLICT covers a row left by the earlier IN-writes design.
    INSERT INTO public.hr_attendance_records
      (employee_id, hr_organization_id, institution_id, work_date, status_type_id,
       in_at, out_at, source, day_calc, gps_lat, gps_lng, gps_accuracy_m, device_status, notes)
    VALUES
      (v_staff.id, v_org, v_staff.institution_id, v_today, v_absent,
       v_in.punched_at, now(), 'clinical_geotag', 'NONE', v_in.lat, v_in.lng, v_in.accuracy_m,
       'clinical_complete', 'Clinical duty - ' || v_site.name)
    ON CONFLICT (employee_id, work_date) DO UPDATE
      SET out_at = now(),
          in_at = COALESCE(public.hr_attendance_records.in_at, EXCLUDED.in_at),
          device_status = 'clinical_complete',
          updated_at = now()
      WHERE public.hr_attendance_records.source = 'clinical_geotag';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'Today already has attendance from another source. The punch could not be recorded.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'employee_id', v_staff.id, 'work_date', v_today, 'punch_type', v_type,
    'punched_at', now(), 'site_name', v_site.name, 'distance_m', v_dist);
END;
$function$;

-- Closes the days that were punched IN and never OUT, once their date is past.
CREATE OR REPLACE FUNCTION public.fn_hr_clinical_close_open_days()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_absent uuid;
  r        record;
  v_org    uuid;
  v_closed integer := 0;
BEGIN
  SELECT id INTO v_absent FROM public.hr_attendance_status_types
  WHERE code = 'ABSENT' AND institution_id IS NULL;

  FOR r IN
    SELECT p.employee_id, p.work_date, p.punched_at, p.lat, p.lng, p.accuracy_m,
           s.institution_id, st.name AS site_name
    FROM public.hr_clinical_punches p
    JOIN public.staff s ON s.id = p.employee_id
    JOIN public.hr_clinical_duty_sites st ON st.id = p.site_id
    WHERE p.punch_type = 'in'
      AND p.work_date < v_today
      AND NOT EXISTS (SELECT 1 FROM public.hr_clinical_punches o
                      WHERE o.employee_id = p.employee_id AND o.work_date = p.work_date
                        AND o.punch_type = 'out')
      AND NOT EXISTS (SELECT 1 FROM public.hr_attendance_records a
                      WHERE a.employee_id = p.employee_id AND a.work_date = p.work_date)
  LOOP
    SELECT id INTO v_org FROM public.hr_organizations WHERE institution_id = r.institution_id LIMIT 1;
    CONTINUE WHEN v_org IS NULL;
    BEGIN
      INSERT INTO public.hr_attendance_records
        (employee_id, hr_organization_id, institution_id, work_date, status_type_id,
         in_at, source, day_calc, first_half_attended, second_half_attended,
         gps_lat, gps_lng, gps_accuracy_m, device_status, notes)
      VALUES
        (r.employee_id, v_org, r.institution_id, r.work_date, v_absent,
         r.punched_at, 'clinical_geotag', 'NONE', false, false,
         r.lat, r.lng, r.accuracy_m, 'clinical_missing_out',
         'Clinical duty - ' || r.site_name || '. Only one punch recorded ('
           || to_char(r.punched_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') || '). Missing OUT.');
      v_closed := v_closed + 1;
    EXCEPTION WHEN OTHERS THEN
      -- A closed month refuses the write; HR corrects those by regularization.
      RAISE WARNING 'fn_hr_clinical_close_open_days: % % not closed: %', r.employee_id, r.work_date, SQLERRM;
    END;
  END LOOP;
  RETURN v_closed;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_clinical_close_open_days() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_clinical_close_open_days() TO service_role;

-- 00:10 IST daily (pg_cron runs in UTC).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'hr-clinical-close-open-days';
SELECT cron.schedule('hr-clinical-close-open-days', '40 18 * * *',
                     $cron$SELECT public.fn_hr_clinical_close_open_days()$cron$);
