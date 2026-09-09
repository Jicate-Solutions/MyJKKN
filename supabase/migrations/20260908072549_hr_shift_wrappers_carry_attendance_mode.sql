-- All three wrappers delegate to fn_shift_timing_pick but PROJECT A SUBSET of
-- its columns, so without this the overlay stops at the wrapper and the
-- recompute/import paths keep judging a duration day with span logic.
--
-- DROP + CREATE, not REPLACE: adding an output column changes the return type,
-- which CREATE OR REPLACE refuses. A DROP takes the ACL with it and a bare
-- re-CREATE hands EXECUTE back to PUBLIC, so each one is REVOKE-then-GRANTed
-- to exactly what it had. fn_resolve_shift_timing additionally had a stale
-- PUBLIC grant (=X/postgres) that is deliberately NOT restored -- it is gated
-- internally, but PUBLIC includes anon and its two siblings never had it.

DROP FUNCTION IF EXISTS public.fn_shift_window(uuid, date);
CREATE FUNCTION public.fn_shift_window(p_staff_id uuid, p_date date)
 RETURNS TABLE(timing_id uuid, is_working_day boolean,
               first_half_start time without time zone, first_half_end time without time zone,
               second_half_start time without time zone, second_half_end time without time zone,
               grace_minutes integer, matched_by text,
               attendance_mode text, required_minutes integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_institution_id uuid;
  v_category_id    uuid;
  v_is_teaching    boolean;
  v_gender         text;
  v_pattern_id     uuid;
  v_dow            smallint;
  v_second_sat     boolean;
BEGIN
  IF p_staff_id IS NULL OR p_date IS NULL THEN RETURN; END IF;

  SELECT s.institution_id, s.category_id, ec.is_teaching, s.gender
    INTO v_institution_id, v_category_id, v_is_teaching, v_gender
  FROM public.staff s
  JOIN public.employment_categories ec ON ec.id = s.category_id
  WHERE s.id = p_staff_id;

  IF v_institution_id IS NULL THEN RETURN; END IF;

  v_pattern_id := public.fn_staff_work_pattern_id(p_staff_id, p_date);
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
         ELSE t.staff_scope END,
    -- A second-Saturday holiday blanks the mode too, so the day cannot arrive
    -- as "any 60 minutes" on a date nobody works.
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN 'span' ELSE t.attendance_mode END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.required_minutes END
  FROM public.fn_shift_timing_pick(
         v_institution_id, v_category_id, v_is_teaching, v_gender, v_dow, p_date, v_pattern_id) t;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_shift_window(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_shift_window(uuid, date) TO authenticated, service_role;


DROP FUNCTION IF EXISTS public.fn_resolve_shift_timing(uuid, date);
CREATE FUNCTION public.fn_resolve_shift_timing(p_staff_id uuid, p_date date)
 RETURNS TABLE(timing_id uuid, institution_id uuid, staff_scope text, employment_category_id uuid,
               applicable_gender text, day_of_week smallint, is_working_day boolean,
               first_half_start time without time zone, first_half_end time without time zone,
               second_half_start time without time zone, second_half_end time without time zone,
               grace_minutes integer, grace_deadline time without time zone, matched_by text,
               attendance_mode text, required_minutes integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_institution_id uuid;
  v_category_id    uuid;
  v_is_teaching    boolean;
  v_gender         text;
  v_pattern_id     uuid;
  v_dow            smallint;
  v_second_sat     boolean;
BEGIN
  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.staff s
                WHERE s.id = p_staff_id AND s.profile_id = auth.uid())
    OR (public.user_has_permission('hr.shift_timings.view')
        AND EXISTS (SELECT 1 FROM public.staff s
                     WHERE s.id = p_staff_id
                       AND public.role_has_institution_access(s.institution_id)))
  ) THEN
    RAISE EXCEPTION 'Not authorized to resolve shift timing for this staff member'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.institution_id, s.category_id, ec.is_teaching, s.gender
    INTO v_institution_id, v_category_id, v_is_teaching, v_gender
  FROM public.staff s
  JOIN public.employment_categories ec ON ec.id = s.category_id
  WHERE s.id = p_staff_id;

  IF v_institution_id IS NULL THEN RETURN; END IF;

  v_pattern_id := public.fn_staff_work_pattern_id(p_staff_id, p_date);
  v_dow        := EXTRACT(ISODOW FROM p_date)::smallint;
  v_second_sat := (v_dow = 6 AND EXTRACT(DAY FROM p_date) BETWEEN 8 AND 14);

  RETURN QUERY
  SELECT
    t.id,
    t.institution_id,
    t.staff_scope,
    t.employment_category_id,
    t.applicable_gender,
    t.day_of_week,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN false ELSE t.is_working_day END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_start  END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_end    END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_start END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_end   END,
    t.grace_minutes,
    -- The FIRST SESSION of the day: the morning when there is one, the lone
    -- afternoon on a second-half-only day. Grace applies to whichever it is.
    -- A duration day has no session start to be late against, so no deadline.
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) OR NOT t.is_working_day
              OR t.attendance_mode = 'duration' THEN NULL
         ELSE (COALESCE(t.first_half_start, t.second_half_start)
               + make_interval(mins => t.grace_minutes))::time END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN 'second_saturday_holiday'
         ELSE t.staff_scope END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN 'span' ELSE t.attendance_mode END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.required_minutes END
  FROM public.fn_shift_timing_pick(
         v_institution_id, v_category_id, v_is_teaching, v_gender, v_dow, p_date, v_pattern_id) t;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_resolve_shift_timing(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_resolve_shift_timing(uuid, date) TO authenticated, service_role;


DROP FUNCTION IF EXISTS public.fn_resolve_shift_timings_bulk(uuid[], date, date);
CREATE FUNCTION public.fn_resolve_shift_timings_bulk(p_staff_ids uuid[], p_from date, p_to date)
 RETURNS TABLE(staff_id uuid, work_date date, timing_id uuid, is_working_day boolean,
               first_half_start time without time zone, first_half_end time without time zone,
               second_half_start time without time zone, second_half_end time without time zone,
               grace_minutes integer, matched_by text,
               attendance_mode text, required_minutes integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR public.user_has_permission('hr.shift_timings.view')
    OR public.user_has_permission('hr.attendance.override')
  ) THEN
    RAISE EXCEPTION 'Not authorized to resolve shift timings'
      USING ERRCODE = '42501';
  END IF;

  IF p_to < p_from THEN
    RAISE EXCEPTION 'p_to must not be earlier than p_from' USING ERRCODE = '22023';
  END IF;

  IF (p_to - p_from) > 400 THEN
    RAISE EXCEPTION 'Date range too wide (% days); resolve at most 400 days at a time', (p_to - p_from)
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH s AS (
    SELECT st.id, st.institution_id, st.category_id, ec.is_teaching, st.gender
    FROM public.staff st
    JOIN public.employment_categories ec ON ec.id = st.category_id
    WHERE st.id = ANY(p_staff_ids)
  ), d AS (
    SELECT gs::date AS wd FROM generate_series(p_from, p_to, interval '1 day') gs
  )
  SELECT
    s.id,
    d.wd,
    t.id,
    CASE WHEN t.id IS NULL THEN NULL
         WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN false
         ELSE t.is_working_day END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_start  END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_end    END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_start END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_end   END,
    t.grace_minutes,
    CASE WHEN t.id IS NULL THEN NULL
         WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN 'second_saturday_holiday'
         ELSE t.staff_scope END,
    CASE WHEN t.id IS NULL THEN NULL
         WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN 'span'
         ELSE t.attendance_mode END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.required_minutes END
  FROM s
  CROSS JOIN d
  LEFT JOIN LATERAL public.fn_shift_timing_pick(
    s.institution_id, s.category_id, s.is_teaching, s.gender,
    EXTRACT(ISODOW FROM d.wd)::smallint, d.wd,
    public.fn_staff_work_pattern_id(s.id, d.wd)) t ON true;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_resolve_shift_timings_bulk(uuid[], date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_resolve_shift_timings_bulk(uuid[], date, date) TO authenticated, service_role;
