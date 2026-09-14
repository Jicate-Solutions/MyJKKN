-- Two advisor findings on objects added by 20260908072455.

-- 1. Pin the search_path. Plain STABLE, not SECURITY DEFINER, so this is not a
--    privilege hole -- but every caller IS a SECURITY DEFINER wrapper, and a
--    mutable search_path inside one is how an unqualified name gets resolved
--    against a schema the caller controls.
CREATE OR REPLACE FUNCTION public.fn_work_pattern_day_hours(
  p_pattern_id uuid, p_date date, p_dow smallint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
           'attendance_mode',   d.attendance_mode,
           'required_minutes',  d.required_minutes,
           'first_half_start',  d.first_half_start,
           'first_half_end',    d.first_half_end,
           'second_half_start', d.second_half_start,
           'second_half_end',   d.second_half_end,
           'grace_minutes',     d.grace_minutes)
  FROM public.hr_work_pattern_weeks w
  JOIN public.hr_work_pattern_week_days d
    ON d.week_id = w.id AND d.day_of_week = p_dow
  WHERE w.work_pattern_id = p_pattern_id
    AND w.effective_from <= p_date
    AND (w.effective_until IS NULL OR w.effective_until > p_date)
  ORDER BY w.effective_from DESC
  LIMIT 1;
$function$;

-- 2. A TRIGGER function has no business being reachable over PostgREST. The
--    default grant to PUBLIC published it at /rest/v1/rpc/hr_trig_wpwd_day_in_mask
--    for anon and authenticated alike. It would fail there (a trigger function
--    called directly raises), but an ungated SECURITY DEFINER entry point that
--    only fails by accident is not a control.
REVOKE ALL ON FUNCTION public.hr_trig_wpwd_day_in_mask() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_trig_wpwd_day_in_mask() FROM anon, authenticated;
