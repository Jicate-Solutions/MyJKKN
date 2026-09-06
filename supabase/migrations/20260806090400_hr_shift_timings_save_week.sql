-- =====================================================================
-- fn_save_shift_timing_week — atomic week write
-- =====================================================================
-- Plan: docs/superpowers/plans/2026-08-06-hr-shift-timings.md
--
-- Why an RPC rather than service-layer logic: an effective-dated edit is
-- close-the-old-row + insert-the-successor. PostgREST has no transaction, so
-- doing that from the service can half-apply — and the failure mode is the bad
-- one: rows closed with no successor, i.e. a date range where staff have NO
-- timing at all. The partial unique index also forbids doing it in the other
-- order. One SECURITY DEFINER function makes the whole week atomic.
--
-- Two behaviours, chosen per day:
--   * correction        p_effective_from <= the live row's effective_from
--                       -> UPDATE in place, no new version
--   * scheduled change  p_effective_from >  the live row's effective_from
--                       -> close the live row at p_effective_from, insert successor
--
-- p_days is a JSONB array of:
--   { day_of_week, is_working_day, first_half_start, first_half_end,
--     second_half_start, second_half_end, grace_minutes, second_saturday_holiday }
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_save_shift_timing_week(
  p_institution_id         uuid,
  p_staff_scope            text,
  p_employment_category_id uuid,
  p_effective_from         date,
  p_days                   jsonb
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
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
      AND t.day_of_week    = v_day.day_of_week
      AND t.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
      AND t.effective_until IS NULL
      AND t.is_active;

    IF NOT FOUND THEN
      INSERT INTO public.hr_shift_timings (
        institution_id, staff_scope, employment_category_id, day_of_week,
        is_working_day, first_half_start, first_half_end,
        second_half_start, second_half_end,
        grace_minutes, second_saturday_holiday, effective_from,
        created_by, updated_by
      ) VALUES (
        p_institution_id, p_staff_scope, p_employment_category_id, v_day.day_of_week,
        v_day.is_working_day, v_day.first_half_start, v_day.first_half_end,
        v_day.second_half_start, v_day.second_half_end,
        COALESCE(v_day.grace_minutes, 0), COALESCE(v_day.second_saturday_holiday, false),
        p_effective_from, v_actor, v_actor
      );

    ELSIF p_effective_from <= v_current.effective_from THEN
      -- Correction: overwrite the live row, keep its effective_from.
      UPDATE public.hr_shift_timings
         SET is_working_day          = v_day.is_working_day,
             first_half_start        = v_day.first_half_start,
             first_half_end          = v_day.first_half_end,
             second_half_start       = v_day.second_half_start,
             second_half_end         = v_day.second_half_end,
             grace_minutes           = COALESCE(v_day.grace_minutes, 0),
             second_saturday_holiday = COALESCE(v_day.second_saturday_holiday, false),
             updated_by              = v_actor
       WHERE id = v_current.id;

    ELSE
      -- Scheduled change: close the live row, then insert its successor.
      -- Order matters — the partial unique index forbids two live rows.
      UPDATE public.hr_shift_timings
         SET effective_until = p_effective_from,
             updated_by      = v_actor
       WHERE id = v_current.id;

      INSERT INTO public.hr_shift_timings (
        institution_id, staff_scope, employment_category_id, day_of_week,
        is_working_day, first_half_start, first_half_end,
        second_half_start, second_half_end,
        grace_minutes, second_saturday_holiday, effective_from,
        created_by, updated_by
      ) VALUES (
        p_institution_id, p_staff_scope, p_employment_category_id, v_day.day_of_week,
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
$fn$;

COMMENT ON FUNCTION public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb) IS
  'Atomically write a full week of hr_shift_timings for one (institution, scope, category). Corrections update in place; a future effective_from closes the live rows and inserts successors. Self-authorizing on hr.shift_timings.manage.';

REVOKE ALL ON FUNCTION public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb) TO authenticated;
