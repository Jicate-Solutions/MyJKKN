\ir probe-settled-common.sql
-- Round 8 (U3, 8 Oct 2026): the keys a month is stored with are the ones worked
-- out BEFORE its days were checked. To stand in for a department holiday
-- approved by someone else while the run is between those two steps, the
-- rehearsal's copy of hr_target_schedule_missing_days approves one (once,
-- when t.race is on) right after counting the days, returning the count it
-- had. M4 (taught, marked by someone else: missed) is then measured on days
-- that are stale by the time it is stored: it must be stored with the keys
-- from before, so it is NOT settled and is measured again once its days are
-- recorded again.
CREATE OR REPLACE FUNCTION public.hr_target_schedule_missing_days(p_staff_id uuid, p_from date, p_to date)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v integer;
BEGIN
  SELECT GREATEST((p_to - p_from + 1) - (SELECT count(*)::int FROM public.hr_target_scheduled_periods sp
                                          CROSS JOIN (SELECT public.hr_target_schedule_institutions(p_staff_id) AS ids) i
                                          WHERE sp.staff_id = p_staff_id AND sp.day BETWEEN p_from AND p_to
                                            AND sp.holiday_key = public.hr_target_schedule_holiday_key(i.ids, sp.day)), 0)
    INTO v;
  IF current_setting('t.race', true) = 'on' THEN
    PERFORM set_config('t.race', 'off', false);
    INSERT INTO public.institution_leaves (institution_id, leave_type_id, leave_name, start_date, end_date, status, requested_by,
                                           scope_level, department_ids)
    VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000001e1', 'Dept closure (race)',
            current_setting('t.race_from')::date, current_setting('t.race_from')::date + 5, 'approved',
            '00000000-0000-0000-0000-000000010001', 'department', ARRAY['00000000-0000-0000-0000-00000000d0a1']::uuid[]);
  END IF;
  RETURN v;
END;
$function$;
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m4');
SELECT set_config('t.race_from', (:'m4'::date + 19)::text, false);
SELECT set_config('t.race', 'on', false);
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS r1 \gset
SELECT t.info('U3 holiday approved mid-run, run m5: ' || t.dump(:'req'));
SELECT t.check('R8-U3 a holiday approved between the keys and the measure: the month keeps the keys from before, so it is not settled and is measured again once its days are recorded again',
  current_setting('t.race') = 'off'
  AND (SELECT status = 'missed' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m4')
  AND NOT public.hr_salary_revision_target_month_settled(:'req', :'sF4', :'m4'),
  t.dump(:'req'));
