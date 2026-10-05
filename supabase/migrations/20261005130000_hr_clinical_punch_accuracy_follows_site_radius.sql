-- The punch refused any reading worse than a flat 100 m. Laptops and indoor
-- Wi-Fi routinely report 100-500 m (a tester was refused at 124 m), while phone
-- GPS is 5-30 m. The limit now follows the SITE: a reading is accepted when the
-- device's own error is no bigger than the duty site's radius, so HR controls how
-- strict a site is by the radius it sets. A 100 m site still refuses 124 m.

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
  v_in_at   timestamptz;
  v_org     uuid;
  v_absent  uuid;
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

  SELECT punched_at INTO v_in_at FROM public.hr_clinical_punches
  WHERE employee_id = v_staff.id AND work_date = v_today AND punch_type = 'in';

  IF v_in_at IS NULL THEN
    v_type := 'in';
  ELSIF EXISTS (SELECT 1 FROM public.hr_clinical_punches
                WHERE employee_id = v_staff.id AND work_date = v_today AND punch_type = 'out') THEN
    RAISE EXCEPTION 'You have already punched in and out today.' USING ERRCODE = 'P0001';
  ELSIF now() < v_in_at + interval '1 minute' THEN
    RAISE EXCEPTION 'You punched in a moment ago. Wait a minute before punching out.' USING ERRCODE = 'P0001';
  ELSE
    v_type := 'out';
  END IF;

  INSERT INTO public.hr_clinical_punches
    (employee_id, work_date, punch_type, site_id, lat, lng, accuracy_m, distance_m)
  VALUES
    (v_staff.id, v_today, v_type, v_site.id, p_lat, p_lng, round(p_accuracy_m)::integer, v_dist);

  IF v_type = 'in' THEN
    SELECT id INTO v_org FROM public.hr_organizations WHERE institution_id = v_staff.institution_id LIMIT 1;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Your institution has no HR organisation set up.' USING ERRCODE = 'P0001';
    END IF;
    SELECT id INTO v_absent FROM public.hr_attendance_status_types
    WHERE code = 'ABSENT' AND institution_id IS NULL;

    INSERT INTO public.hr_attendance_records
      (employee_id, hr_organization_id, institution_id, work_date, status_type_id,
       in_at, source, day_calc, gps_lat, gps_lng, gps_accuracy_m, device_status, notes)
    VALUES
      (v_staff.id, v_org, v_staff.institution_id, v_today, v_absent,
       now(), 'clinical_geotag', 'NONE', p_lat, p_lng, round(p_accuracy_m)::integer,
       'clinical_in_progress', 'Clinical duty - ' || v_site.name);
  ELSE
    UPDATE public.hr_attendance_records
       SET out_at = now(), device_status = 'clinical_complete', updated_at = now()
     WHERE employee_id = v_staff.id AND work_date = v_today;
  END IF;

  RETURN jsonb_build_object(
    'employee_id', v_staff.id, 'work_date', v_today, 'punch_type', v_type,
    'punched_at', now(), 'site_name', v_site.name, 'distance_m', v_dist);
END;
$function$;
