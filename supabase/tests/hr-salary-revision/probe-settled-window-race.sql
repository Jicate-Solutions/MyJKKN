\ir probe-settled-common.sql
-- Review round 10 (X1, 8 Oct 2026): the window check needs every window month
-- SETTLED, not only acted on. The rehearsal's copy of
-- hr_target_schedule_missing_days approves a department holiday (once, when
-- t.race is on) right after counting the days, standing in for one approved by
-- someone else while the run is between its keys and the measure (as in
-- probe-settled-race.sql). A WAITING part with a one-month window (M4): the M5
-- run counts M4 missed, on keys from before that holiday, so M4 is NOT settled,
-- yet nothing stopped the run (v_stop stays clear). The window must not go back
-- to the Director until the next run has measured M4 again on today's keys.
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
DELETE FROM public.hr_salary_revision_target_months WHERE request_id = :'req';
UPDATE public.hr_salary_revision_target_plans SET state = 'waiting', window_start = :'m4', window_months = 1, missed_in_row = 0, last_run_on = NULL WHERE request_id = :'req';
SELECT t.bad_month(:'tt', :'F4', :'C4', :'m4');
SELECT set_config('t.race_from', (:'m4'::date + 19)::text, false);
SELECT set_config('t.race', 'on', false);
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS r1 \gset
SELECT t.info('RV5-R holiday approved mid-run, run m5 (window over): ' || t.dump(:'req'));
SELECT t.check('RV5-R the window must not go back to the Director while its last month, counted missed on keys from before a holiday approved mid-run, is not settled',
  current_setting('t.race') = 'off'
  AND (SELECT status = 'missed' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m4')
  AND NOT public.hr_salary_revision_target_month_settled(:'req', :'sF4', :'m4')
  AND (SELECT state = 'waiting' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'),
  t.dump(:'req'));
SELECT count(*) AS inr FROM public.hr_target_schedule_ranges((:'m5'::date + 1)) WHERE staff_id = :'sF4' \gset
SELECT count(public.hr_target_schedule_record(n.staff_id, n.day, '[]'::jsonb, 'probe', (:'m5'::date + 1), n.holiday_key)) AS rec
  FROM public.hr_target_schedule_needs((:'m5'::date + 1), 100000) n WHERE n.staff_id = :'sF4' AND n.reason = 'holidays_changed' \gset
SELECT public.hr_salary_revision_targets_run_on((:'m5'::date + 1)) AS r2 \gset
SELECT t.info('RV5-R in ranges=' || :'inr' || ' re-recorded=' || :'rec' || ', run m5+1: ' || t.dump(:'req'));
-- Here the days M4 reads are still complete on the record (no day is asked for
-- again: rec is 0), so the next run measures M4 again straight away.
SELECT t.check('RV5-R2 still in the schedule ranges while it waits; the next run measures M4 again on today''s keys (still missed, now settled) and only then the window goes back to the Director',
  :'inr'::int = 1
  AND public.hr_salary_revision_target_month_settled(:'req', :'sF4', :'m4')
  AND (SELECT status = 'missed' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m4')
  AND (SELECT state = 'back_to_director' AND state_reason = 'window_over' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'),
  t.dump(:'req'));
