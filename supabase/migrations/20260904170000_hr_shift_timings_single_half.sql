-- A working day may have ONE half (2026-09-04).
--
-- WHY. Some institutions run a half-day Saturday — 09:00 to 14:00 and nothing
-- after — and the row could not say so: hr_shift_timings_times_present_chk
-- demanded all four times on any working day, so the only way to model a
-- morning-only Saturday was to invent an afternoon. That afternoon then judged
-- every Saturday punch-out as an early leave.
--
-- THE RULE NOW. On a working day each half is all-or-nothing (both its times or
-- neither) and at least one half is present. Ordering checks apply within a
-- half, and between the halves only when both exist.
--
-- WHAT READS IT. evaluateDay() (the biometric verdict) treats the day's FIRST
-- session — the morning when there is one, the lone afternoon on a
-- second-half-only day — as the grace-gated one, and a single-session day is
-- PRESENT or ABSENT, never HALF_DAY. fn_resolve_shift_timing's grace_deadline
-- moves onto the same first session below. fn_shift_window and the bulk
-- resolver already pass NULLs through untouched.

ALTER TABLE public.hr_shift_timings DROP CONSTRAINT IF EXISTS hr_shift_timings_times_present_chk;
ALTER TABLE public.hr_shift_timings ADD CONSTRAINT hr_shift_timings_times_present_chk
  CHECK (
       (is_working_day = false
        AND first_half_start IS NULL AND first_half_end IS NULL
        AND second_half_start IS NULL AND second_half_end IS NULL)
    OR (is_working_day = true
        AND (first_half_start  IS NULL) = (first_half_end  IS NULL)
        AND (second_half_start IS NULL) = (second_half_end IS NULL)
        AND (first_half_start IS NOT NULL OR second_half_start IS NOT NULL))
  );

ALTER TABLE public.hr_shift_timings DROP CONSTRAINT IF EXISTS hr_shift_timings_order_chk;
ALTER TABLE public.hr_shift_timings ADD CONSTRAINT hr_shift_timings_order_chk
  CHECK (
       is_working_day = false
    OR (
          (first_half_start  IS NULL OR first_half_end  > first_half_start)
      AND (second_half_start IS NULL OR second_half_end > second_half_start)
      AND (first_half_start IS NULL OR second_half_start IS NULL
           OR (second_half_start >= first_half_start AND second_half_end >= first_half_end))
    )
  );

COMMENT ON CONSTRAINT hr_shift_timings_times_present_chk ON public.hr_shift_timings IS
  'A working day has one or both halves, each all-or-nothing; a non-working day has none (2026-09-04).';

-- grace_deadline: the day's first session, not always the first half.
CREATE OR REPLACE FUNCTION public.fn_resolve_shift_timing(p_staff_id uuid, p_date date)
 RETURNS TABLE(timing_id uuid, institution_id uuid, staff_scope text, employment_category_id uuid, applicable_gender text, day_of_week smallint, is_working_day boolean, first_half_start time without time zone, first_half_end time without time zone, second_half_start time without time zone, second_half_end time without time zone, grace_minutes integer, grace_deadline time without time zone, matched_by text)
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
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) OR NOT t.is_working_day THEN NULL
         ELSE (COALESCE(t.first_half_start, t.second_half_start)
               + make_interval(mins => t.grace_minutes))::time END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN 'second_saturday_holiday'
         ELSE t.staff_scope END
  FROM public.fn_shift_timing_pick(
         v_institution_id, v_category_id, v_is_teaching, v_gender, v_dow, p_date, v_pattern_id) t;
END;
$function$;
