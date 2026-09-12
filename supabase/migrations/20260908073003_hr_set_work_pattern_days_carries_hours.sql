-- fn_hr_set_work_pattern_days learns to write per-day hours alongside the mask.
--
-- DROP + CREATE, not a defaulted extra parameter: adding one would leave the
-- 4-arg version in place as an overload, and PostgREST resolves overloads by
-- the argument names a request happens to send -- so the old body could still
-- be reached and would silently discard the hours. One signature, no ambiguity.
--
-- The ACL is restored to exactly what it was (postgres, authenticated,
-- service_role). REVOKE FIRST: a bare re-CREATE hands EXECUTE to PUBLIC.
DROP FUNCTION IF EXISTS public.fn_hr_set_work_pattern_days(uuid, smallint[], date, text);

CREATE FUNCTION public.fn_hr_set_work_pattern_days(
  p_pattern_id uuid,
  p_working_days smallint[],
  p_effective_from date,
  p_notes text DEFAULT NULL::text,
  p_day_hours jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pattern    public.hr_work_patterns%ROWTYPE;
  v_actor      uuid := auth.uid();
  v_days       smallint[];
  v_current    public.hr_work_pattern_weeks%ROWTYPE;
  v_superseded boolean := false;
  v_week_id    uuid;
  v_prev_week  uuid;
  v_hours      integer := 0;
BEGIN
  SELECT * INTO v_pattern FROM public.hr_work_patterns WHERE id = p_pattern_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work pattern % not found', p_pattern_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('hr.shift_timings.manage')
        AND public.role_has_institution_access(v_pattern.institution_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to configure work patterns at this institution'
      USING ERRCODE = '42501';
  END IF;

  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'An effective date is required' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT d ORDER BY d) INTO v_days
    FROM unnest(COALESCE(p_working_days, ARRAY[]::smallint[])) AS d
   WHERE d BETWEEN 1 AND 7;
  IF v_days IS NULL OR cardinality(v_days) = 0 THEN
    RAISE EXCEPTION 'Pick at least one working day' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current
    FROM public.hr_work_pattern_weeks
   WHERE work_pattern_id = p_pattern_id
     AND effective_until IS NULL
   ORDER BY effective_from DESC
   LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.hr_work_pattern_weeks (
      work_pattern_id, working_days, effective_from, notes, created_by, updated_by
    ) VALUES (
      p_pattern_id, v_days, p_effective_from, p_notes, v_actor, v_actor
    ) RETURNING id INTO v_week_id;

  ELSIF p_effective_from <= v_current.effective_from THEN
    DELETE FROM public.hr_work_pattern_weeks
     WHERE work_pattern_id = p_pattern_id
       AND id <> v_current.id
       AND effective_from >= p_effective_from;

    UPDATE public.hr_work_pattern_weeks
       SET effective_until = p_effective_from,
           updated_by      = v_actor
     WHERE work_pattern_id = p_pattern_id
       AND id <> v_current.id
       AND effective_from < p_effective_from
       AND (effective_until IS NULL OR effective_until > p_effective_from);

    UPDATE public.hr_work_pattern_weeks
       SET working_days   = v_days,
           effective_from = p_effective_from,
           notes          = p_notes,
           updated_by     = v_actor
     WHERE id = v_current.id;

    v_week_id   := v_current.id;
    v_prev_week := v_current.id;

  ELSE
    UPDATE public.hr_work_pattern_weeks
       SET effective_until = p_effective_from,
           updated_by      = v_actor
     WHERE id = v_current.id;

    INSERT INTO public.hr_work_pattern_weeks (
      work_pattern_id, working_days, effective_from, notes, created_by, updated_by
    ) VALUES (
      p_pattern_id, v_days, p_effective_from, p_notes, v_actor, v_actor
    ) RETURNING id INTO v_week_id;

    v_prev_week  := v_current.id;
    v_superseded := true;
  END IF;

  -- A day that has left the mask cannot keep its hours: the mask trigger would
  -- refuse the row on the next touch, and a stale row would resolve nothing.
  DELETE FROM public.hr_work_pattern_week_days
   WHERE week_id = v_week_id
     AND NOT (day_of_week = ANY (v_days));

  IF p_day_hours IS NOT NULL THEN
    -- Explicit set: these rows ARE the hours. An empty array clears them.
    DELETE FROM public.hr_work_pattern_week_days WHERE week_id = v_week_id;

    INSERT INTO public.hr_work_pattern_week_days (
      week_id, day_of_week, attendance_mode, required_minutes,
      first_half_start, first_half_end, second_half_start, second_half_end,
      grace_minutes, created_by, updated_by
    )
    SELECT v_week_id,
           (e->>'day_of_week')::smallint,
           COALESCE(e->>'attendance_mode', 'span'),
           NULLIF(e->>'required_minutes', '')::integer,
           NULLIF(e->>'first_half_start', '')::time,
           NULLIF(e->>'first_half_end', '')::time,
           NULLIF(e->>'second_half_start', '')::time,
           NULLIF(e->>'second_half_end', '')::time,
           COALESCE(NULLIF(e->>'grace_minutes', '')::integer, 0),
           v_actor, v_actor
      FROM jsonb_array_elements(p_day_hours) AS e;

  ELSIF v_superseded AND v_prev_week IS NOT NULL THEN
    -- CARRIED FORWARD, not dropped. A supersede creates a fresh week row, so a
    -- caller that only moved the effective date would otherwise silently lose
    -- every configured hour and hand those days back to the institution shift.
    INSERT INTO public.hr_work_pattern_week_days (
      week_id, day_of_week, attendance_mode, required_minutes,
      first_half_start, first_half_end, second_half_start, second_half_end,
      grace_minutes, created_by, updated_by
    )
    SELECT v_week_id, d.day_of_week, d.attendance_mode, d.required_minutes,
           d.first_half_start, d.first_half_end, d.second_half_start, d.second_half_end,
           d.grace_minutes, v_actor, v_actor
      FROM public.hr_work_pattern_week_days d
     WHERE d.week_id = v_prev_week
       AND d.day_of_week = ANY (v_days);
  END IF;

  SELECT count(*) INTO v_hours
    FROM public.hr_work_pattern_week_days WHERE week_id = v_week_id;

  RETURN jsonb_build_object(
    'pattern_id',      p_pattern_id,
    'week_id',         v_week_id,
    'working_days',    to_jsonb(v_days),
    'effective_from',  p_effective_from,
    'superseded',      v_superseded,
    'days_with_hours', v_hours
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_set_work_pattern_days(uuid, smallint[], date, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_hr_set_work_pattern_days(uuid, smallint[], date, text, jsonb)
  TO authenticated, service_role;
