-- Raise targets rehearsal, round 6 (7 Oct 2026): MEASUREMENT SWITCHED OFF
-- (default ll, the shipped state). Same people and helpers as
-- probe-targets.sql, on a fresh database. With the switch OFF the only pay
-- change a raise makes is its increment on the start date; the held part
-- stays held. Switching ON starts the window then and classifies then.
\set ON_ERROR_STOP 0
\set D   '00000000-0000-0000-0000-000000010001'
\set H   '00000000-0000-0000-0000-000000010002'
\set S   '00000000-0000-0000-0000-000000010006'
\set F1  '00000000-0000-0000-0000-000000010011'
\set sF1 '00000000-0000-0000-0000-000000020011'
\set sF2 '00000000-0000-0000-0000-000000020012'
\set sF4 '00000000-0000-0000-0000-000000020014'
\set sF11 '00000000-0000-0000-0000-000000020022'
\set A   '00000000-0000-0000-0000-0000000000a1'
\set OA  '00000000-0000-0000-0000-000000000ea1'
\set C1  '00000000-0000-0000-0000-0000000c0001'
\set C11 '00000000-0000-0000-0000-0000000c0012'
\set SW  'hr.salary_revision.target_measurement_on'
-- Round 7 people: F8, F9, F10, F12 (A1, pay 30,000) and HA (the HOD, 80,000).
\set HA  '00000000-0000-0000-0000-000000010005'
\set sHA '00000000-0000-0000-0000-000000020005'
\set F8  '00000000-0000-0000-0000-000000010019'
\set F10 '00000000-0000-0000-0000-000000010021'
\set sF8  '00000000-0000-0000-0000-000000020019'
\set sF9  '00000000-0000-0000-0000-000000020020'
\set sF10 '00000000-0000-0000-0000-000000020021'
\set sF12 '00000000-0000-0000-0000-000000020023'

CREATE OR REPLACE FUNCTION public.hr_salary_revision_ist_today()
RETURNS date LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT COALESCE(NULLIF(current_setting('t.today', true), '')::date, (now() AT TIME ZONE 'Asia/Kolkata')::date)
$$;
SELECT set_config('t.today', '', false);
SELECT (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '1 month')::date AS m1,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '2 month')::date AS m2,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '3 month')::date AS m3,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '4 month')::date AS m4,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '5 month')::date AS m5,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '6 month')::date AS m6,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '7 month')::date AS m7 \gset

-- ── 0. The switch ───────────────────────────────────────────────────────────
SELECT t.check('the measurement switch is seeded OFF',
  (SELECT value = 'false'::jsonb AND is_active FROM public.platform_policies WHERE policy_key = :'SW')
  AND public.hr_salary_revision_target_measurement_on() IS FALSE);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'S', 'role', 'authenticated')::text, false);
SELECT t.check('a super admin not on the Director list cannot switch measurement on',
  t.try(format('UPDATE public.platform_policies SET value = %L WHERE policy_key = %L', 'true', :'SW')) = '42501');
SELECT set_config('request.jwt.claims', json_build_object('sub', :'H', 'role', 'authenticated')::text, false);
SELECT t.check('the HR head cannot switch measurement on',
  t.try(format('UPDATE public.platform_policies SET value = %L WHERE policy_key = %L', 'true', :'SW')) = '42501');
SELECT set_config('request.jwt.claims', json_build_object('sub', :'D', 'role', 'authenticated')::text, false);
SELECT t.check('the switch holds only true or false, and a signed-in Director cannot delete it',
  t.try(format('UPDATE public.platform_policies SET value = %L WHERE policy_key = %L', '"yes"', :'SW')) = '22023'
  AND t.try(format('DELETE FROM public.platform_policies WHERE policy_key = %L', :'SW')) = '42501');
SELECT t.login(NULL);
DELETE FROM public.platform_policies WHERE policy_key = :'SW';
SELECT t.check('with the switch row missing, measurement counts as OFF (fail closed)',
  public.hr_salary_revision_target_measurement_on() IS FALSE);
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, data_type, is_active)
VALUES (:'SW', 'global', NULL, 'true'::jsonb, 'boolean', false);
SELECT t.check('a switch row that is itself switched off counts as OFF, even holding true',
  public.hr_salary_revision_target_measurement_on() IS FALSE);
UPDATE public.platform_policies SET value = 'false'::jsonb, is_active = true WHERE policy_key = :'SW';
-- Round 7: changes by the server key are logged too.
SET ROLE service_role;
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
UPDATE public.platform_policies SET value = 'true'::jsonb WHERE policy_key = :'SW';
UPDATE public.platform_policies SET value = 'false'::jsonb WHERE policy_key = :'SW';
-- Round 8: renaming the switch away (it then reads as missing, OFF) and back.
UPDATE public.platform_policies SET policy_key = 't.renamed' WHERE policy_key = :'SW';
UPDATE public.platform_policies SET policy_key = :'SW' WHERE policy_key = 't.renamed';
RESET ROLE;
SELECT t.login(NULL);
SELECT t.check('every switch change is logged, by the SQL console and the server key too (who and how)',
  (SELECT count(*) FROM public.hr_salary_revision_target_setting_log
    WHERE policy_key = :'SW' AND changed_via = 'console' AND changed_by IS NULL AND action = 'delete') = 1
  AND (SELECT count(*) FROM public.hr_salary_revision_target_setting_log
    WHERE policy_key = :'SW' AND changed_via = 'console' AND action = 'insert' AND new_value = 'true'::jsonb AND new_is_active IS FALSE) = 1
  AND (SELECT count(*) FROM public.hr_salary_revision_target_setting_log
    WHERE policy_key = :'SW' AND changed_via = 'server_key' AND changed_by IS NULL AND action = 'update'
      AND ((old_value = 'false'::jsonb AND new_value = 'true'::jsonb) OR (old_value = 'true'::jsonb AND new_value = 'false'::jsonb))) = 2,
  (SELECT string_agg(action || '/' || changed_via || '/' || COALESCE(new_value::text, '-'), ', ' ORDER BY changed_at) FROM public.hr_salary_revision_target_setting_log WHERE policy_key = :'SW'));
SET ROLE authenticated;
SELECT t.login(:'H');
RESET ROLE;
SELECT t.login(NULL);
SELECT t.check('renaming the switch away by the server key is logged under its own name, and so is renaming it back',
  (SELECT count(*) FROM public.hr_salary_revision_target_setting_log
    WHERE policy_key = :'SW' AND changed_via = 'server_key' AND action = 'update'
      AND old_value = 'false'::jsonb AND new_value = 'false'::jsonb) = 2,
  (SELECT string_agg(policy_key || '/' || action || '/' || changed_via, ', ' ORDER BY changed_at) FROM public.hr_salary_revision_target_setting_log));
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.check('only the Director list reads the setting log',
  (SELECT count(*) FROM public.hr_salary_revision_target_setting_log) = 0
  AND t.try('DELETE FROM public.hr_salary_revision_target_setting_log') = '42501');
SELECT t.login(:'D');
SELECT t.check('the Director reads the setting log, and cannot change it',
  (SELECT count(*) FROM public.hr_salary_revision_target_setting_log WHERE policy_key = :'SW') >= 5
  AND t.try('UPDATE public.hr_salary_revision_target_setting_log SET changed_via = ''console''') = '42501');
RESET ROLE;
SELECT t.login(NULL);

-- ── 1. The split at the yes, measurement OFF ────────────────────────────────
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sF1', 52500, 'Above five per cent') AS req_f1 \gset
SELECT public.fn_hr_salary_revision_propose(:'sF2', 41000, 'Below five per cent') AS req_f2 \gset
SELECT public.fn_hr_salary_revision_propose(:'sF4', 54600, 'Exactly five per cent') AS req_f4 \gset
SELECT public.fn_hr_salary_revision_propose(:'sF11', 34000, 'Teaches later') AS req_f11 \gset
SELECT t.login(:'D');
SELECT t.check('the Director approves all four with measurement OFF',
  (SELECT bool_and(t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', x)) = 'ok')
     FROM unnest(ARRAY[:'req_f1', :'req_f2', :'req_f4', :'req_f11']) x));
RESET ROLE;
SELECT t.check('above 5%: the increment is 5% of the pay now, the rest held, waiting for measurement, not classified',
  (SELECT base_monthly_gross = 48000 AND increment_amount = 2400 AND held_amount = 2100
          AND state = 'awaiting_measurement' AND target_role IS NULL AND rules->>'targets' IS NULL
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1'),
  (SELECT state || ' ' || COALESCE(target_role, '-') FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1'));
SELECT t.check('below 5%: all increment, nothing held',
  (SELECT increment_amount = 1000 AND held_amount = 0 AND state = 'none' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f2'));
SELECT t.check('exactly 5%: all increment, nothing held',
  (SELECT increment_amount = 2600 AND held_amount = 0 AND state = 'none' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4'));

-- ── 1b. Round 7: the pay in force at the yes, rounded rupees, a cut, paise ───
-- F9's pay is 20,010 before the ask: 5% is 1,000.50, rounded to 1,001.
SELECT t.login(NULL);
BEGIN;
UPDATE public.hr_staff_salaries SET superseded_by = '00000000-0000-0000-0000-000000030901'
 WHERE staff_id = :'sF9' AND superseded_by IS NULL;
INSERT INTO public.hr_staff_salaries (id, staff_id, hr_organization_id, monthly_gross, effective_from)
VALUES ('00000000-0000-0000-0000-000000030901', :'sF9', :'OA', 20010, current_date);
COMMIT;
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sF8', 34000, 'Pay changes before the yes') AS req_f8 \gset
SELECT public.fn_hr_salary_revision_propose(:'sF9', 22000, 'Rounded rupees') AS req_f9 \gset
SELECT public.fn_hr_salary_revision_propose(:'sF10', 28000, 'A pay cut') AS req_f10 \gset
SELECT public.fn_hr_salary_revision_propose(:'sF12', 31500.50, 'Paise') AS req_f12 \gset
SELECT t.login(:'HA');
SELECT public.fn_hr_salary_revision_propose(:'sHA', 90000, 'Asking for my own raise') AS req_ha \gset
RESET ROLE;
-- F8's pay changes AFTER the ask and before the yes: 31,000 is in force at the yes.
SELECT t.login(NULL);
BEGIN;
UPDATE public.hr_staff_salaries SET superseded_by = '00000000-0000-0000-0000-000000030801'
 WHERE staff_id = :'sF8' AND superseded_by IS NULL;
INSERT INTO public.hr_staff_salaries (id, staff_id, hr_organization_id, monthly_gross, effective_from)
VALUES ('00000000-0000-0000-0000-000000030801', :'sF8', :'OA', 31000, current_date);
COMMIT;
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the Director approves the five round-7 asks with measurement OFF',
  (SELECT bool_and(t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', x)) = 'ok')
     FROM unnest(ARRAY[:'req_f8', :'req_f9', :'req_f10', :'req_f12', :'req_ha']) x));
RESET ROLE;
SELECT t.check('the split is on the pay IN FORCE at the yes, not the pay when it was asked',
  (SELECT current_monthly_gross = 30000 FROM public.hr_salary_revision_requests WHERE id = :'req_f8')
  AND (SELECT base_monthly_gross = 31000 AND increment_amount = 1550 AND held_amount = 1450 AND state = 'awaiting_measurement'
         FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f8')
  AND EXISTS (SELECT 1 FROM public.user_notifications u JOIN public.notifications n ON n.id = u.notification_id
               WHERE u.user_id = :'F8' AND n.body LIKE '%will be ₹32,550 (it is ₹31,000 now). Another ₹1,450 a month is held back%'),
  (SELECT row_to_json(p)::text FROM public.hr_salary_revision_target_plans p WHERE request_id = :'req_f8'));
SELECT t.check('the increment is rounded to the rupee, not cut down (5% of 20,010 = 1,000.50 -> 1,001)',
  (SELECT base_monthly_gross = 20010 AND increment_amount = 1001 AND held_amount = 989
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f9'),
  (SELECT increment_amount || ' / ' || held_amount FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f9'));
SELECT t.check('a pay cut has no increment and nothing held: the cut is written whole, and the message says it is a cut',
  (SELECT base_monthly_gross = 30000 AND increment_amount = -2000 AND held_amount = 0 AND state = 'none'
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f10')
  AND (SELECT previous_monthly_gross = 30000 AND new_monthly_gross = 28000 FROM public.hr_salary_revision_outcomes WHERE request_id = :'req_f10')
  AND EXISTS (SELECT 1 FROM public.user_notifications u JOIN public.notifications n ON n.id = u.notification_id
               WHERE u.user_id = :'F10' AND n.body LIKE '%will be ₹28,000 (it is ₹30,000 now). This is a pay cut.'
                 AND n.body NOT LIKE '%held%'),
  (SELECT string_agg(n.body, ' | ') FROM public.user_notifications u JOIN public.notifications n ON n.id = u.notification_id WHERE u.user_id = :'F10'));
SELECT t.check('a held part under a rupee (paise in the ask) is paid with the increment: nothing held',
  (SELECT increment_amount = 1500.50 AND held_amount = 0 AND state = 'none'
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f12')
  AND (SELECT new_monthly_gross = 31500.50 FROM public.hr_salary_revision_outcomes WHERE request_id = :'req_f12'),
  (SELECT increment_amount || ' / ' || held_amount || ' / ' || state FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f12'));

-- ── 2. The start date: the increment is the only pay change ────────────────
SELECT set_config('t.today', :'m1', false);
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_apply_due() AS applied \gset
RESET ROLE;
SELECT t.login(NULL);
SELECT t.check('on the start date each raise writes pay + increment (the exact figure at, above and below 5%)',
  (SELECT monthly_gross = 50400 AND effective_from = :'m1'::date FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL)
  AND (SELECT monthly_gross = 41000 FROM public.hr_staff_salaries WHERE staff_id = :'sF2' AND superseded_by IS NULL)
  AND (SELECT monthly_gross = 54600 FROM public.hr_staff_salaries WHERE staff_id = :'sF4' AND superseded_by IS NULL)
  AND (SELECT monthly_gross = 31500 FROM public.hr_staff_salaries WHERE staff_id = :'sF11' AND superseded_by IS NULL));
SELECT t.check('round 7 on the start date: pay in force + increment, the cut whole, the paise whole',
  (SELECT monthly_gross = 32550 FROM public.hr_staff_salaries WHERE staff_id = :'sF8' AND superseded_by IS NULL)
  AND (SELECT monthly_gross = 21011 FROM public.hr_staff_salaries WHERE staff_id = :'sF9' AND superseded_by IS NULL)
  AND (SELECT monthly_gross = 28000 FROM public.hr_staff_salaries WHERE staff_id = :'sF10' AND superseded_by IS NULL)
  AND (SELECT monthly_gross = 31500.50 FROM public.hr_staff_salaries WHERE staff_id = :'sF12' AND superseded_by IS NULL),
  (SELECT string_agg(staff_id || '=' || monthly_gross, ', ') FROM public.hr_staff_salaries
    WHERE staff_id IN (:'sF8', :'sF9', :'sF10', :'sF12') AND superseded_by IS NULL));
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.check('nothing held under a rupee means nothing blocks the next raise',
  t.try(format('SELECT public.fn_hr_salary_revision_propose(%L, 33000, %L)', :'sF12', 'Next year')) = 'ok');
RESET ROLE;
SELECT t.login(NULL);

-- F1 meets every target in months 1-5 (it would be released if measured).
SELECT t.spine(:'C1', :'F1', false);
SELECT t.tt(:'sF1', :'A', :'C1', :'m1', (:'m7'::date - 1)) AS tt1 \gset
SELECT t.good_month(:'tt1', :'F1', :'C1', m::date) FROM generate_series(:'m1'::date, :'m5'::date, interval '1 month') m;
SELECT t.bad_month(:'tt1', :'F1', :'C1', :'m6');

-- ── 3. The nightly run with measurement OFF ─────────────────────────────────
SELECT public.hr_salary_revision_targets_run_on(:'m2') AS r2 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m3') AS r3 \gset
SELECT public.hr_salary_revision_targets_run_on(:'m4') AS r4 \gset
SELECT t.check('measurement OFF: each month is recorded as not measured, and nothing else happens',
  :'r2'::int + :'r3'::int + :'r4'::int = 0
  AND (SELECT bool_and(status = 'not_measured') AND count(*) = 3 FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f1')
  AND (SELECT state = 'awaiting_measurement' AND target_role IS NULL AND window_start = :'m1'::date
         FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1')
  AND (SELECT monthly_gross = 50400 FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL),
  (SELECT string_agg(month || ':' || status, ', ') FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f1'));
-- Nothing can write the held part while it waits: the planned release, at the
-- right amount and date, is refused by the pay guard.
UPDATE public.hr_salary_revision_target_plans SET pending_action = 'release', pending_effective_from = :'m5' WHERE request_id = :'req_f1';
SELECT set_config('app.hr_salary_revision_target_pay', :'req_f1', false);
SELECT t.check('the held part cannot be written while it waits for measurement (pay guard)',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 52500, p_effective_from => %L)', :'sF1', :'OA', :'m5')) LIKE '42501 The held part of a raise%');
SELECT set_config('app.hr_salary_revision_target_pay', '', false);
UPDATE public.hr_salary_revision_target_plans SET pending_action = NULL, pending_effective_from = NULL WHERE request_id = :'req_f1';
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.check('a held part waiting for measurement still blocks a second raise',
  t.msg(format('SELECT public.fn_hr_salary_revision_propose(%L, 60000, %L)', :'sF1', 'Again')) LIKE '55000 This person has an earlier raise whose held part is still open.%');
SELECT t.login(:'D');
SELECT t.check('the Director''s list shows each held part waiting for measurement',
  (SELECT count(*) FROM public.fn_hr_salary_revision_targets_listed()
    WHERE request_id IN (:'req_f1', :'req_f11') AND why = 'awaiting_measurement') = 2);
SELECT t.login(:'F1');
SELECT t.check('the person sees their held amount and that targets are being set up',
  (SELECT state = 'awaiting_measurement' AND held_amount = 2100 FROM public.fn_hr_salary_revision_my_targets() WHERE request_id = :'req_f1'));
RESET ROLE;

-- ── 3b. Round 7: a self-asker never reads the notes on their own held part ──
-- A principal's flag on one of HA's months (as the console), then the
-- Director lapses HA's held part with a note.
SELECT t.login(NULL);
INSERT INTO public.hr_salary_revision_target_flags (request_id, month, flagged_by, note)
VALUES (:'req_ha', :'m2', :'D', 'A private flag note');
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.try(format('SELECT public.fn_hr_salary_revision_target_lapse(%L, %L)', :'req_ha', 'A private lapse note')) AS ha_lapse \gset
SELECT t.login(:'HA');
SELECT t.check('a self-asker sees their own request, but not its plan, months or flags (no notes)',
  :'ha_lapse' = 'ok'
  AND (SELECT count(*) FROM public.hr_salary_revision_requests WHERE id = :'req_ha') = 1
  AND (SELECT count(*) FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_ha') = 0
  AND (SELECT count(*) FROM public.hr_salary_revision_target_months WHERE request_id = :'req_ha') = 0
  AND (SELECT count(*) FROM public.hr_salary_revision_target_flags WHERE request_id = :'req_ha') = 0,
  :'ha_lapse');
SELECT t.check('the self-asker''s own view: numbers, state and dates, no note anywhere',
  (SELECT state = 'lapsed' AND held_amount = 6000 AND increment_amount = 4000
          AND row_to_json(m)::text NOT LIKE '%private%'
     FROM public.fn_hr_salary_revision_my_targets() m WHERE request_id = :'req_ha'));
SELECT t.login(:'H');
SELECT t.check('the HR head still sees the plan with its notes, and the flag',
  (SELECT lapse_note = 'A private lapse note' AND state_reason = 'lapsed_by_director'
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_ha')
  AND (SELECT count(*) FROM public.hr_salary_revision_target_flags WHERE request_id = :'req_ha') = 1);
RESET ROLE;
SELECT t.login(NULL);

-- ── 4. Switching measurement ON (the Director, in month 4) ─────────────────
-- F11 had no timetable at the yes; by now it has taught for months.
SELECT t.login(NULL);
SELECT t.tt(:'sF11', :'A', :'C11', :'m1', (:'m7'::date - 1)) AS tt11 \gset
UPDATE public.timetables SET created_at = now() - interval '400 days' WHERE id = :'tt11';
SELECT set_config('request.jwt.claims', json_build_object('sub', :'D', 'role', 'authenticated')::text, false);
SELECT t.try(format('UPDATE public.platform_policies SET value = %L WHERE policy_key = %L', 'true', :'SW')) AS sw_on \gset
SELECT t.login(NULL);
SELECT t.check('the Director switches measurement on, and it is logged',
  :'sw_on' = 'ok' AND public.hr_salary_revision_target_measurement_on() IS TRUE
  AND EXISTS (SELECT 1 FROM public.hr_policy_audit_log WHERE policy_key = :'SW' AND edited_by = :'D' AND reason LIKE 'Switched target measurement ON%')
  AND EXISTS (SELECT 1 FROM public.hr_salary_revision_target_setting_log WHERE policy_key = :'SW' AND changed_by = :'D'
                AND changed_via = 'signed_in' AND new_value = 'true'::jsonb),
  :'sw_on');
SELECT public.hr_salary_revision_targets_run_on((:'m4'::date + 5)) AS r_on \gset
SELECT t.check('switching ON classifies each waiting held part THEN (a teacher by their timetable now) and starts its window next month',
  (SELECT state = 'waiting' AND target_role = 'faculty' AND window_start = :'m5'::date AND rules->'targets' IS NOT NULL
          AND rules->>'annual_increment_percent' = '5'
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1')
  AND (SELECT state = 'waiting' AND target_role = 'faculty' AND window_start = :'m5'::date
         FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f11'),
  (SELECT string_agg(request_id || ':' || state || '/' || COALESCE(target_role, '-') || '/' || window_start, ' ; ')
     FROM public.hr_salary_revision_target_plans WHERE request_id IN (:'req_f1', :'req_f11')));
SELECT t.check('the months while OFF stay not measured and release nothing',
  (SELECT monthly_gross = 50400 FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL)
  AND (SELECT count(*) FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f1' AND status <> 'not_measured') = 0);
SELECT public.hr_salary_revision_targets_run_on(:'m6') AS r6 \gset
SELECT t.check('with measurement ON, the first month of the window with every target met releases the held part',
  (SELECT monthly_gross = 52500 AND effective_from = :'m6'::date FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL)
  AND (SELECT state = 'released' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1'));

-- ── 5. Switched OFF again: a paid held part is left exactly as it is ────────
SELECT set_config('request.jwt.claims', json_build_object('sub', :'D', 'role', 'authenticated')::text, false);
SELECT t.try(format('UPDATE public.platform_policies SET value = %L WHERE policy_key = %L', 'false', :'SW')) AS sw_off \gset
SELECT t.login(NULL);
SELECT public.hr_salary_revision_targets_run_on(:'m7') AS r7 \gset
-- Round 8 (U2, 8 Oct 2026): only THIS month (M7) is closed as not measured;
-- M6, finished but not counted yet ("so far"), stays waiting and is counted
-- once measurement is ON again.
SELECT t.check('switched OFF again: this month is closed as not measured, a finished month not counted yet stays waiting, and the pay is untouched',
  :'sw_off' = 'ok'
  AND (SELECT status = 'not_measured' FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f1' AND month = :'m7')
  AND (SELECT status = 'in_progress' AND NOT acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f1' AND month = :'m6')
  AND (SELECT state = 'released' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1')
  AND (SELECT monthly_gross = 52500 FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL));

-- ── 6. Round 7: the first-mark record never fails an attendance save ───────
\set TB '00000000-0000-0000-0000-00000000077b'
SET ROLE authenticated;
SELECT t.login(:'F1');
SELECT string_agg(t.msg(format(
      'INSERT INTO public.student_attendance (attendance_date, marked_by, institution_id, timetable_id, section_id, attendance_data) VALUES (%L, %L, %L, %L, %L, %L)',
      :'m1'::date + i, :'F1', :'A', :'TB', :'TB',
      jsonb_build_object('bad', jsonb_build_object('period_name', 'Odd', 'students', v),
                         'good', jsonb_build_object('period_name', 'Fine', 'students', '[{"status": "Present"}]'::jsonb)))), ' | ' ORDER BY i) AS odd_saves
  FROM (VALUES (1, '"forty"'::jsonb), (2, '40'::jsonb), (3, '{"a": 1}'::jsonb), (4, 'null'::jsonb)) x(i, v) \gset
SELECT t.check('an attendance save goes ahead whatever "students" holds (text, number, object, JSON null)',
  :'odd_saves' = 'ok | ok | ok | ok'
  AND (SELECT count(*) FROM public.student_attendance WHERE timetable_id = :'TB') = 4, :'odd_saves');
SELECT t.check('a 3 KB period name saves, and is stamped under a short key',
  t.try(format(
      'INSERT INTO public.student_attendance (attendance_date, marked_by, institution_id, timetable_id, section_id, attendance_data) VALUES (%L, %L, %L, %L, %L, %L)',
      :'m1'::date + 5, :'F1', :'A', :'TB', :'TB',
      jsonb_build_object('long', jsonb_build_object('period_name', repeat('Lab session ', 256), 'students', '[{"status": "Present"}]'::jsonb)))) = 'ok');
-- Make the record itself refuse a period name (as the console), then save one:
-- the save still goes ahead (a warning, no stamp).
RESET ROLE;
SELECT t.login(NULL);
ALTER TABLE public.attendance_first_marks ADD CONSTRAINT t_refuse_boom CHECK (period_name <> 'Boom') NOT VALID;
SET ROLE authenticated;
SELECT t.login(:'F1');
SELECT t.try(format(
    'INSERT INTO public.student_attendance (attendance_date, marked_by, institution_id, timetable_id, section_id, attendance_data) VALUES (%L, %L, %L, %L, %L, %L)',
    :'m1'::date + 6, :'F1', :'A', :'TB', :'TB',
    jsonb_build_object('x', jsonb_build_object('period_name', 'Boom', 'students', '[{"status": "Present"}]'::jsonb)))) AS boom \gset
RESET ROLE;
SELECT t.login(NULL);
ALTER TABLE public.attendance_first_marks DROP CONSTRAINT t_refuse_boom;
-- Round 8: a malformed sign-in claim (a sub that is not a uuid) never fails the save.
SELECT set_config('request.jwt.claims', '{"sub": "not-a-uuid", "role": "authenticated"}', false);
SELECT t.try(format(
    'INSERT INTO public.student_attendance (attendance_date, marked_by, institution_id, timetable_id, section_id, attendance_data) VALUES (%L, %L, %L, %L, %L, %L)',
    :'m1'::date + 7, :'F1', :'A', :'TB', :'TB',
    jsonb_build_object('y', jsonb_build_object('period_name', 'Claim', 'students', '[{"status": "Present"}]'::jsonb)))) AS badclaim \gset
SELECT t.login(NULL);
SELECT t.check('a malformed sign-in claim never fails an attendance save',
  :'badclaim' = 'ok'
  AND EXISTS (SELECT 1 FROM public.student_attendance WHERE timetable_id = :'TB' AND attendance_date = :'m1'::date + 7), :'badclaim');
SELECT t.check('if the record itself fails, the attendance save still goes ahead (no stamp)',
  :'boom' = 'ok'
  AND EXISTS (SELECT 1 FROM public.student_attendance WHERE timetable_id = :'TB' AND attendance_date = :'m1'::date + 6)
  AND NOT EXISTS (SELECT 1 FROM public.attendance_first_marks WHERE timetable_id = :'TB' AND period_name = 'Boom'), :'boom');
SELECT t.check('the stamps: each good period once per day, nothing for the odd ones, the long name under its key',
  (SELECT count(*) FROM public.attendance_first_marks WHERE timetable_id = :'TB' AND period_name = 'Fine') = 4
  AND NOT EXISTS (SELECT 1 FROM public.attendance_first_marks WHERE timetable_id = :'TB' AND period_name = 'Odd')
  AND (SELECT length(period_name) < 200 AND period_name = public.attendance_first_mark_period_key(btrim(repeat('Lab session ', 256)))
              AND marker_profile_id = :'F1'::uuid
         FROM public.attendance_first_marks WHERE timetable_id = :'TB' AND attendance_date = :'m1'::date + 5),
  (SELECT string_agg(attendance_date || ':' || left(period_name, 20), ', ') FROM public.attendance_first_marks WHERE timetable_id = :'TB'));
SELECT t.check('a long period name keeps its own stamp (two names alike for 150 characters stay apart)',
  length(public.attendance_first_mark_period_key(repeat('a', 300))) < 200
  AND public.attendance_first_mark_period_key(repeat('a', 300)) <> public.attendance_first_mark_period_key(repeat('a', 299) || 'b')
  AND public.attendance_first_mark_period_key('Period 1') = 'Period 1');
-- The monthly measure reads the same odd shapes without failing: F1's month 1
-- measures the same with an odd entry added to one of its days.
\set T '{"t1_marked_by_self_min_pct": 85, "t1_mark_within_hours": 24, "t3_linked_min_pct": 60, "t4_resource_min_pct": 25, "t5_min_pulses_per_week": 1}'
SELECT string_agg(target || ':' || numerator || '/' || denominator, ' ' ORDER BY target) AS meas_before
  FROM public.hr_salary_revision_target_measure(:'sF1', :'m1', :'T') \gset
INSERT INTO public.student_attendance (attendance_date, marked_by, institution_id, timetable_id, section_id, attendance_data)
SELECT :'m1'::date + 2, :'F1', :'A', :'tt1', '00000000-0000-0000-0000-00000000005e',
       jsonb_build_object('o1', jsonb_build_object('period_name', 'Period 1', 'students', '"forty"'::jsonb),
                          'o2', jsonb_build_object('period_name', 'Period 1', 'students', 'null'::jsonb),
                          'o3', jsonb_build_object('period_name', 'Period 1', 'students', '{"a": 1}'::jsonb));
SELECT t.msg(format('SELECT count(*) FROM public.hr_salary_revision_target_measure(%L, %L, %L)', :'sF1', :'m1', :'T')) AS meas_try \gset
SELECT string_agg(target || ':' || numerator || '/' || denominator, ' ' ORDER BY target) AS meas_after
  FROM public.hr_salary_revision_target_measure(:'sF1', :'m1', :'T') \gset
SELECT t.check('the monthly measure reads odd "students" without failing, and counts the same',
  :'meas_try' = 'ok' AND :'meas_after' = :'meas_before', :'meas_try' || ' | ' || :'meas_before' || ' -> ' || :'meas_after');
