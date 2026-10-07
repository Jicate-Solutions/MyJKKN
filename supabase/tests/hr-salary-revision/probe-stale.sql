-- Raise targets, review round 7 (8 Oct 2026; from the money review's probe
-- rv-stale.sql): a department holiday approved after its days were recorded
-- (the rows are stale: their holiday_key is not the day's key now), before
-- (B1) and after (B2) the month is counted; the listing's order and the key
-- the job hands back (B1). Run by run-targets.sh after probe-schedule.sql on
-- the same database. The rehearsal's mirror re-makes its own rows whenever a
-- holiday is approved, so the days this probe needs stale are marked as
-- recorded by the job ('probe') first. Each line prints PASS or FAIL.
\set ON_ERROR_STOP 0
\set D    '00000000-0000-0000-0000-000000010001'
\set F4   '00000000-0000-0000-0000-000000010014'
\set sF4  '00000000-0000-0000-0000-000000020014'
\set A    '00000000-0000-0000-0000-0000000000a1'
\set DEPT '00000000-0000-0000-0000-00000000d0a1'
\set C4   '00000000-0000-0000-0000-0000000c0004'
\set T '{"t1_marked_by_self_min_pct": 85, "t1_mark_within_hours": 24, "t3_linked_min_pct": 60, "t4_resource_min_pct": 25, "t5_min_pulses_per_week": 1}'
SELECT set_config('t.today', '', false);
SELECT t.login(NULL);
SELECT (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '4 month')::date AS m4,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '5 month')::date AS m5,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '6 month')::date AS m6 \gset
SELECT request_id AS req FROM public.hr_salary_revision_target_plans WHERE staff_id = :'sF4' \gset
CREATE OR REPLACE FUNCTION t.info(p text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE NOTICE 'INFO %', p; END $$;
CREATE OR REPLACE FUNCTION t.dump(p_req uuid) RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT state || ' mir=' || missed_in_row || COALESCE(' note=' || run_note, '') FROM public.hr_salary_revision_target_plans WHERE request_id = p_req)
      || ' | ' || (SELECT string_agg(to_char(month, 'YYYY-MM') || ':' || status || CASE WHEN acted THEN '/' || COALESCE(action, '-') ELSE '/unacted' END, ' ' ORDER BY month)
                     FROM public.hr_salary_revision_target_months WHERE request_id = p_req)
$$;
UPDATE public.hr_salary_revision_target_plans SET missed_in_row = 2 WHERE request_id = :'req';
SELECT t.tt(:'sF4', :'A', :'C4', :'m4', (:'m6'::date - 1)) AS tt \gset
UPDATE public.timetables SET department_id = :'DEPT' WHERE id = :'tt';
-- The job recorded every day of M4 (and the lead-in week) as the resolver gave them then.
UPDATE public.hr_target_scheduled_periods SET resolver = 'probe'
 WHERE staff_id = :'sF4' AND day BETWEEN date_trunc('week', :'m4'::date)::date AND (:'m5'::date - 1);
-- F4 marks every day on time EXCEPT the 20th-25th: the department was closed.
SELECT t.teach(:'tt', :'F4', :'C4', :'m4',
               (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m4')) g WHERE g NOT BETWEEN 20 AND 25), NULL, NULL, NULL,
               t.all_days(:'m4'), (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m4'), 2) g), t.all_days(:'m4'));
-- The department's closure for the 20th-25th is approved after those days were recorded.
INSERT INTO public.institution_leaves (institution_id, leave_type_id, leave_name, start_date, end_date, status, requested_by,
                                      scope_level, department_ids)
VALUES (:'A', '00000000-0000-0000-0000-0000000001e1', 'Dept closure', (:'m4'::date + 19), (:'m4'::date + 24), 'approved', :'D',
        'department', ARRAY[:'DEPT']::uuid[]);
SELECT count(*) AS stale FROM public.hr_target_schedule_needs(:'m5', 100000) n
 WHERE n.staff_id = :'sF4' AND n.reason = 'holidays_changed' AND n.day BETWEEN :'m4' AND (:'m5'::date - 1) \gset
SELECT t.info('days of M4 the job still has to record again (holidays_changed): ' || :'stale');
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS r1 \gset
SELECT t.info('run on M5 before those days are recorded again: ' || t.dump(:'req'));
SELECT t.check('B1-S2a a finished month whose recorded days are stale (holiday approved since) is not counted yet (default oo), so no pause',
  :'stale'::int = 6
  AND NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m4' AND status = 'missed')
  AND (SELECT state = 'released' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'),
  t.dump(:'req'));
-- B1: every person's days whose holidays changed are listed before anyone's
-- missing days. A night is picked on which someone other than F4 is worked
-- out first, and everyone but F4 is given a missing day: in the old order
-- (one person at a time) that person's missing day came before F4's stale ones.
SELECT d::date AS dord
  FROM generate_series(:'m5'::date, (:'m5'::date + 27), interval '1 day') d
 WHERE (SELECT r.staff_id FROM public.hr_target_schedule_ranges(d::date) r
         ORDER BY md5(r.staff_id::text || d::date::text), r.staff_id LIMIT 1) <> :'sF4'::uuid
 ORDER BY d LIMIT 1 \gset
DELETE FROM public.hr_target_scheduled_periods sp
 USING public.hr_target_schedule_ranges(:'dord') r
 WHERE r.staff_id <> :'sF4'::uuid AND sp.staff_id = r.staff_id AND sp.day = r.from_day;
CREATE TEMP TABLE b1_order AS
  SELECT * FROM public.hr_target_schedule_needs(:'dord', 100000)
    WITH ORDINALITY AS n(staff_id, day, institution_ids, reason, holiday_key, ord);
SELECT t.check('B1 every person''s days whose holidays changed are listed before anyone''s missing days',
  (SELECT count(*) FROM b1_order WHERE staff_id = :'sF4' AND reason = 'holidays_changed') >= 6
  AND EXISTS (SELECT 1 FROM b1_order WHERE reason = 'missing' AND staff_id <> :'sF4')
  AND (SELECT max(ord) FROM b1_order WHERE reason = 'holidays_changed')
      < (SELECT min(ord) FROM b1_order WHERE reason = 'missing'),
  (SELECT string_agg(reason || '@' || ord, ' ' ORDER BY ord) FROM b1_order WHERE reason <> 'live'));
SELECT t.check('B1 each day listed carries its holiday key as it is now',
  NOT EXISTS (SELECT 1 FROM b1_order
               WHERE holiday_key IS DISTINCT FROM public.hr_target_schedule_holiday_key(institution_ids, day)));
-- The job reaches them: the resolver now gives no class on the closure days.
SELECT count(public.hr_target_schedule_record(:'sF4', d::date, '[]'::jsonb, 'probe', :'m5'))
  FROM generate_series((:'m4'::date + 19), (:'m4'::date + 24), interval '1 day') d \gset
SELECT bool_and(met) AS fresh_met FROM public.hr_salary_revision_target_measure(:'sF4', :'m4', :'T') \gset
SELECT t.info('measured on the fresh record M4 would be met: ' || :'fresh_met');
SELECT public.hr_salary_revision_targets_run_on((:'m5'::date + 1)) AS r2 \gset
SELECT t.info('run on M5+1 after re-recording: ' || t.dump(:'req'));
SELECT t.check('B1-S2b once re-recorded, M4 is met on what was scheduled: not paused on the closure days',
  :'fresh_met'::boolean
  AND (SELECT status IN ('met') FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m4')
  AND (SELECT state = 'released' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'),
  t.dump(:'req'));

-- ── B2. A holiday approved after a month was counted ────────────────────────
-- M5: F4 marks every day on time except the 10th-15th (nobody marks them),
-- everything else done: missed. Its days are the job's ('probe') rows.
UPDATE public.hr_target_scheduled_periods SET resolver = 'probe'
 WHERE staff_id = :'sF4' AND day BETWEEN date_trunc('week', :'m5'::date)::date AND (:'m6'::date - 1);
SELECT t.teach(:'tt', :'F4', :'C4', :'m5',
               (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m5')) g WHERE g NOT BETWEEN 10 AND 15), NULL, NULL, NULL,
               t.all_days(:'m5'), (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m5'), 2) g), t.all_days(:'m5'));
SELECT count(*) AS pay_b2 FROM public.hr_staff_salaries WHERE staff_id = :'sF4' \gset
SELECT public.hr_salary_revision_targets_run_on(:'m6') AS b2r1 \gset
SELECT t.check('B2 setup: M5 is counted missed (six days nobody marked): one miss in a row, still paid',
  (SELECT status = 'missed' AND acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m5')
  AND (SELECT state = 'released' AND missed_in_row = 1 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'),
  t.dump(:'req'));
-- The department's closure for the 10th-15th of M5 is approved after M5 was counted.
INSERT INTO public.institution_leaves (institution_id, leave_type_id, leave_name, start_date, end_date, status, requested_by,
                                      scope_level, department_ids)
VALUES (:'A', '00000000-0000-0000-0000-0000000001e1', 'Dept closure 2', (:'m5'::date + 9), (:'m5'::date + 14), 'approved', :'D',
        'department', ARRAY[:'DEPT']::uuid[]);
SELECT public.hr_salary_revision_targets_run_on((:'m6'::date + 1)) AS b2r2 \gset
SELECT t.check('B2 before those days are recorded again, M5 is not measured again on the old record: still missed, its holiday key still the old one',
  (SELECT status = 'missed' AND holiday_key IS DISTINCT FROM public.hr_salary_revision_target_holiday_key(
            :'sF4', date_trunc('week', :'m5'::date)::date, (:'m6'::date - 1))
     FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m5')
  AND (SELECT state = 'released' AND missed_in_row = 1 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req'),
  t.dump(:'req'));
-- The job records them again, with the key the listing gave (the resolver
-- gives no class on the closure days).
SELECT count(public.hr_target_schedule_record(n.staff_id, n.day, '[]'::jsonb, 'probe', (:'m6'::date + 1), n.holiday_key)) AS b2rec
  FROM public.hr_target_schedule_needs((:'m6'::date + 1), 100000) n
 WHERE n.staff_id = :'sF4' AND n.reason = 'holidays_changed' AND n.day BETWEEN :'m5' AND (:'m6'::date - 1) \gset
SELECT public.hr_salary_revision_targets_run_on((:'m6'::date + 2)) AS b2r3 \gset
SELECT t.check('B2 once recorded again, M5 is measured again: met on what was scheduled, the miss out of the count, still paid, nothing written',
  :'b2rec'::int = 6
  AND (SELECT status = 'met' FROM public.hr_salary_revision_target_months WHERE request_id = :'req' AND month = :'m5')
  AND (SELECT state = 'released' AND missed_in_row = 0 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req')
  AND (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = :'sF4') = :'pay_b2'::int,
  :'b2rec' || ' recorded; ' || t.dump(:'req'));

-- ── B1. The key stored is the one worked out before the day was read ───────
-- The listing gives the 1st of M6 with its key; a holiday is approved while
-- the resolver reads the day; the job records it with the listing's key.
SELECT public.hr_target_schedule_holiday_key(public.hr_target_schedule_institutions(:'sF4'), :'m6'::date) AS k_before \gset
INSERT INTO public.institution_leaves (institution_id, leave_type_id, leave_name, start_date, end_date, status, requested_by,
                                      scope_level, department_ids)
VALUES (:'A', '00000000-0000-0000-0000-0000000001e1', 'Dept day', :'m6', :'m6', 'approved', :'D',
        'department', ARRAY[:'DEPT']::uuid[]);
SELECT public.hr_target_schedule_record(:'sF4', :'m6', '[]'::jsonb, 'probe', (:'m6'::date + 2), :'k_before') AS b1rec \gset
SELECT t.check('B1 a holiday approved while the day was read: the row keeps the key from before the read, so the day is stale and asked for again',
  (SELECT holiday_key = :'k_before' FROM public.hr_target_scheduled_periods WHERE staff_id = :'sF4' AND day = :'m6')
  AND EXISTS (SELECT 1 FROM public.hr_target_schedule_needs((:'m6'::date + 2), 100000) n
               WHERE n.staff_id = :'sF4' AND n.day = :'m6'::date AND n.reason = 'holidays_changed'));
SELECT t.check('B1 a holiday key that is not one the listing gives is refused',
  t.try(format('SELECT public.hr_target_schedule_record(%L, %L, %L, %L, %L, %L)', :'sF4', :'m6', '[]', 'probe',
               (:'m6'::date + 2), 'not-a-key')) = '22023');
