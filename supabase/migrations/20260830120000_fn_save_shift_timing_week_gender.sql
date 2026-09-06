-- The week writer becomes gender-aware.
--
-- Every lookup and every effective-dating UPDATE inside this function gains
-- `applicable_gender = p_applicable_gender`. Without that, saving a Female week
-- would find the 'all' week as "the current row", close it off and overwrite it
-- — the two rows the whole feature exists to keep side by side would collapse
-- into one, silently, and the institution's general timing would vanish.
--
-- ADDING A PARAMETER CREATES A NEW OVERLOAD, it does not replace. The old
-- 5-argument signature must be dropped or every call becomes ambiguous. The new
-- parameter is last and defaults to 'all', so any caller not yet updated keeps
-- writing the general week exactly as before.

DROP FUNCTION IF EXISTS public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb);

CREATE OR REPLACE FUNCTION public.fn_save_shift_timing_week(
  p_institution_id uuid,
  p_staff_scope text,
  p_employment_category_id uuid,
  p_effective_from date,
  p_days jsonb,
  p_applicable_gender text DEFAULT 'all'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day      record;
  v_current  public.hr_shift_timings%ROWTYPE;
  v_written  integer := 0;
  v_actor    uuid := auth.uid();
BEGIN
  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('hr.shift_timings.manage')
        AND public.role_has_institution_access(p_institution_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to configure shift timings for this institution'
      USING ERRCODE = '42501';
  END IF;

  IF p_staff_scope NOT IN ('teaching','non_teaching','category') THEN
    RAISE EXCEPTION 'Invalid staff_scope: %', p_staff_scope USING ERRCODE = '22023';
  END IF;

  -- Mirrors hr_shift_timings_applicable_gender_chk so a bad value is refused
  -- with a message naming the parameter rather than a raw constraint violation.
  IF p_applicable_gender NOT IN ('all','male','female','bigender') THEN
    RAISE EXCEPTION 'Invalid applicable_gender: %', p_applicable_gender USING ERRCODE = '22023';
  END IF;

  IF (p_staff_scope = 'category') <> (p_employment_category_id IS NOT NULL) THEN
    RAISE EXCEPTION 'staff_scope=category requires an employment_category_id, and vice versa'
      USING ERRCODE = '22023';
  END IF;

  FOR v_day IN
    SELECT *
    FROM jsonb_to_recordset(p_days) AS d(
      day_of_week smallint,
      is_working_day boolean,
      first_half_start time,
      first_half_end time,
      second_half_start time,
      second_half_end time,
      grace_minutes integer,
      second_saturday_holiday boolean
    )
  LOOP
    SELECT * INTO v_current
    FROM public.hr_shift_timings t
    WHERE t.institution_id = p_institution_id
      AND t.staff_scope    = p_staff_scope
      AND t.applicable_gender = p_applicable_gender
      AND t.day_of_week    = v_day.day_of_week
      AND t.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
      AND t.effective_until IS NULL
      AND t.is_active;

    IF NOT FOUND THEN
      INSERT INTO public.hr_shift_timings (
        institution_id, staff_scope, employment_category_id, applicable_gender, day_of_week,
        is_working_day, first_half_start, first_half_end,
        second_half_start, second_half_end,
        grace_minutes, second_saturday_holiday, effective_from,
        created_by, updated_by
      ) VALUES (
        p_institution_id, p_staff_scope, p_employment_category_id, p_applicable_gender, v_day.day_of_week,
        v_day.is_working_day, v_day.first_half_start, v_day.first_half_end,
        v_day.second_half_start, v_day.second_half_end,
        COALESCE(v_day.grace_minutes, 0), COALESCE(v_day.second_saturday_holiday, false),
        p_effective_from, v_actor, v_actor
      );

    ELSIF p_effective_from <= v_current.effective_from THEN
      UPDATE public.hr_shift_timings h
         SET is_active  = false,
             updated_by = v_actor
       WHERE h.institution_id = p_institution_id
         AND h.staff_scope    = p_staff_scope
         AND h.applicable_gender = p_applicable_gender
         AND h.day_of_week    = v_day.day_of_week
         AND h.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
         AND h.id <> v_current.id
         AND h.is_active
         AND h.effective_from >= p_effective_from;

      UPDATE public.hr_shift_timings h
         SET effective_until = p_effective_from,
             updated_by      = v_actor
       WHERE h.institution_id = p_institution_id
         AND h.staff_scope    = p_staff_scope
         AND h.applicable_gender = p_applicable_gender
         AND h.day_of_week    = v_day.day_of_week
         AND h.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
         AND h.id <> v_current.id
         AND h.is_active
         AND h.effective_from < p_effective_from
         AND (h.effective_until IS NULL OR h.effective_until > p_effective_from);

      UPDATE public.hr_shift_timings
         SET is_working_day          = v_day.is_working_day,
             first_half_start        = v_day.first_half_start,
             first_half_end          = v_day.first_half_end,
             second_half_start       = v_day.second_half_start,
             second_half_end         = v_day.second_half_end,
             grace_minutes           = COALESCE(v_day.grace_minutes, 0),
             second_saturday_holiday = COALESCE(v_day.second_saturday_holiday, false),
             effective_from          = p_effective_from,
             updated_by              = v_actor
       WHERE id = v_current.id;

    ELSE
      UPDATE public.hr_shift_timings
         SET effective_until = p_effective_from,
             updated_by      = v_actor
       WHERE id = v_current.id;

      INSERT INTO public.hr_shift_timings (
        institution_id, staff_scope, employment_category_id, applicable_gender, day_of_week,
        is_working_day, first_half_start, first_half_end,
        second_half_start, second_half_end,
        grace_minutes, second_saturday_holiday, effective_from,
        created_by, updated_by
      ) VALUES (
        p_institution_id, p_staff_scope, p_employment_category_id, p_applicable_gender, v_day.day_of_week,
        v_day.is_working_day, v_day.first_half_start, v_day.first_half_end,
        v_day.second_half_start, v_day.second_half_end,
        COALESCE(v_day.grace_minutes, 0), COALESCE(v_day.second_saturday_holiday, false),
        p_effective_from, v_actor, v_actor
      );
    END IF;

    v_written := v_written + 1;
  END LOOP;

  RETURN v_written;
END;
$function$;
