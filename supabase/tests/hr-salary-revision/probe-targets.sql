-- Raise targets rehearsal (20271007180207, rulings of 7 Oct 2026). Every
-- person acts AS ROLE authenticated with their id in request.jwt.claims, as
-- PostgREST calls it; fixtures and the monthly run are the SQL console (the
-- run is the cron's job). Each line prints PASS <rule> or FAIL <rule>.
--
-- The calendar: M1 is the first full month after today (the month of the
-- Director's yes), M2..M10 follow. The monthly run is called with the day it
-- runs on; the functions that read "today" (the flag, the decision, the
-- approvals job) read t.today, set below, through hr_salary_revision_ist_today.
\set ON_ERROR_STOP 0
\set D   '00000000-0000-0000-0000-000000010001'
\set H   '00000000-0000-0000-0000-000000010002'
\set PA  '00000000-0000-0000-0000-000000010003'
\set PB  '00000000-0000-0000-0000-000000010004'
\set HA  '00000000-0000-0000-0000-000000010005'
\set S   '00000000-0000-0000-0000-000000010006'
\set F1  '00000000-0000-0000-0000-000000010011'
\set F2  '00000000-0000-0000-0000-000000010012'
\set F4  '00000000-0000-0000-0000-000000010014'
\set F5  '00000000-0000-0000-0000-000000010015'
\set F6  '00000000-0000-0000-0000-000000010016'
\set F8  '00000000-0000-0000-0000-000000010019'
\set F9  '00000000-0000-0000-0000-000000010020'
\set F10 '00000000-0000-0000-0000-000000010021'
\set sHA '00000000-0000-0000-0000-000000020005'
\set sF10 '00000000-0000-0000-0000-000000020021'
\set C10 '00000000-0000-0000-0000-0000000c0011'
\set sF11 '00000000-0000-0000-0000-000000020022'
\set C11 '00000000-0000-0000-0000-0000000c0012'
\set C12 '00000000-0000-0000-0000-0000000c0013'
\set sF12 '00000000-0000-0000-0000-000000020023'
\set sH  '00000000-0000-0000-0000-000000020002'
\set sPA '00000000-0000-0000-0000-000000020003'
\set sF1 '00000000-0000-0000-0000-000000020011'
\set sF2 '00000000-0000-0000-0000-000000020012'
\set sF3 '00000000-0000-0000-0000-000000020013'
\set sF4 '00000000-0000-0000-0000-000000020014'
\set sF5 '00000000-0000-0000-0000-000000020015'
\set sF6 '00000000-0000-0000-0000-000000020016'
\set sF7 '00000000-0000-0000-0000-000000020018'
\set sF8 '00000000-0000-0000-0000-000000020019'
\set sF9 '00000000-0000-0000-0000-000000020020'
\set A   '00000000-0000-0000-0000-0000000000a1'
\set B   '00000000-0000-0000-0000-0000000000b2'
\set OA  '00000000-0000-0000-0000-000000000ea1'
\set C1  '00000000-0000-0000-0000-0000000c0001'
\set C4  '00000000-0000-0000-0000-0000000c0004'
\set C5  '00000000-0000-0000-0000-0000000c0005'
\set C6  '00000000-0000-0000-0000-0000000c0006'
\set C8  '00000000-0000-0000-0000-0000000c0008'
\set C9  '00000000-0000-0000-0000-0000000c0009'
\set KEY 'hr.salary_revision.target_rules'

-- The test clock: t.today when set, the real date otherwise.
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
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '7 month')::date AS m7,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '8 month')::date AS m8,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '9 month')::date AS m9,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '10 month')::date AS m10 \gset

-- ── 0. The setting ──────────────────────────────────────────────────────────
SELECT t.check('the seeded raise rules hold the rulings'' numbers',
  (SELECT value->'annual_increment_percent' = '5' AND value->'window_months' = '6' AND value->'pause_after_missed_months' = '3'
          AND value->'roles_waiting_for_own_targets' = '["principal"]'
          AND value->'role_targets'->'faculty' = '{"t1_marked_by_self_min_pct": 85, "t1_mark_within_hours": 24, "t3_linked_min_pct": 60, "t4_resource_min_pct": 25, "t5_min_pulses_per_week": 1}'::jsonb
     FROM public.platform_policies WHERE policy_key = :'KEY' AND scope_type = 'global'));
-- Run as the table owner (no RLS) with the caller's JWT, so the trigger alone
-- is what refuses (as the #4190 probe does for the decider row).
SELECT set_config('request.jwt.claims', json_build_object('sub', :'S', 'role', 'authenticated')::text, false);
SELECT t.check('a super admin not on the Director list cannot change the raise rules',
  t.try(format('UPDATE public.platform_policies SET value = jsonb_set(value, %L, %L) WHERE policy_key = %L',
               '{annual_increment_percent}', '10', :'KEY')) = '42501');
SELECT set_config('request.jwt.claims', json_build_object('sub', :'H', 'role', 'authenticated')::text, false);
SELECT t.check('the HR head cannot change the raise rules',
  t.try(format('UPDATE public.platform_policies SET value = jsonb_set(value, %L, %L) WHERE policy_key = %L',
               '{annual_increment_percent}', '10', :'KEY')) = '42501');
SELECT set_config('request.jwt.claims', json_build_object('sub', :'D', 'role', 'authenticated')::text, false);
-- (Each write is its own statement: a check's uncorrelated subquery runs
-- BEFORE the function calls in the same SELECT.)
SELECT t.try(format('UPDATE public.platform_policies SET value = jsonb_set(value, %L, %L) WHERE policy_key = %L',
             '{window_months}', '7', :'KEY')) AS d_edit1 \gset
SELECT t.try(format('UPDATE public.platform_policies SET value = jsonb_set(value, %L, %L) WHERE policy_key = %L',
             '{window_months}', '6', :'KEY')) AS d_edit2 \gset
SELECT t.check('the Director changes the raise rules',
  :'d_edit1' = 'ok' AND :'d_edit2' = 'ok'
  AND (SELECT updated_by = :'D'::uuid AND value->'window_months' = '6' FROM public.platform_policies WHERE policy_key = :'KEY'),
  :'d_edit1' || ' ' || :'d_edit2');
SELECT t.check('a malformed raise rules value is refused, even from the Director',
  t.try(format('UPDATE public.platform_policies SET value = jsonb_set(value, %L, %L) WHERE policy_key = %L',
               '{annual_increment_percent}', '0', :'KEY')) = '22023'
  AND t.try(format('UPDATE public.platform_policies SET value = value - %L WHERE policy_key = %L', 'role_targets', :'KEY')) = '22023'
  AND t.try(format('UPDATE public.platform_policies SET value = jsonb_set(value, %L, %L) WHERE policy_key = %L',
                   '{role_targets,faculty,t5_min_pulses_per_week}', '"weekly"', :'KEY')) = '22023');
SELECT t.check('a signed-in Director cannot delete the raise rules (switch off instead)',
  t.try(format('DELETE FROM public.platform_policies WHERE policy_key = %L', :'KEY')) = '42501');
SELECT t.login(NULL);
SELECT t.check('the Director''s change is in the policy log',
  (SELECT count(*) FROM public.hr_policy_audit_log WHERE policy_key = :'KEY' AND edited_by = :'D') = 2);

-- Round 2 (7 Oct): give the 'hod' role targets too, so the HOD, who also
-- holds the faculty role, matches two target sets.
UPDATE public.platform_policies
   SET value = jsonb_set(value, '{role_targets,hod}', value->'role_targets'->'faculty')
 WHERE policy_key = :'KEY';

-- Round 4, default y: who teaches. F11 (role key 'assistant_professor') and
-- the principal PA both taught in the 90 days before the yes; H did not.
SELECT t.tt(:'sF11', :'A', :'C11', public.hr_salary_revision_ist_today() - 60, public.hr_salary_revision_ist_today() - 1) AS tt11 \gset
-- Default dd/kk (round 5): F11's semester ended yesterday and the daily job
-- switched it off; it was made recently, but F11 first-marked a period in it.
UPDATE public.timetables SET is_active = false WHERE id = :'tt11';
INSERT INTO public.attendance_first_marks (timetable_id, attendance_date, period_name, ordinal, marker_profile_id, first_marked_at)
VALUES (:'tt11', public.hr_salary_revision_ist_today() - 10, 'Period 1', 1, '00000000-0000-0000-0000-000000010022', now() - interval '10 days');
SELECT t.tt(:'sPA', :'A', :'C12', public.hr_salary_revision_ist_today() - 60, public.hr_salary_revision_ist_today() - 1) AS ttpa \gset
-- H taught once, long ago (a timetable that ended 200 days before the yes): not teaching now.
SELECT t.tt(:'sH', :'A', '00000000-0000-0000-0000-0000000c0014', public.hr_salary_revision_ist_today() - 400, public.hr_salary_revision_ist_today() - 200) AS tth \gset
UPDATE public.timetables SET created_at = now() - interval '400 days' WHERE id = :'tth';
-- Default kk: a timetable made today covering H's last 30 days, never marked by H.
SELECT t.tt(:'sH', :'A', '00000000-0000-0000-0000-0000000c0016', public.hr_salary_revision_ist_today() - 30, public.hr_salary_revision_ist_today() - 1) AS tth2 \gset

-- Round 6: measurement is seeded OFF; this file exercises the measurement,
-- so it switches it ON (as the SQL console) before any raise is approved.
-- probe-targets-off.sql covers everything with the switch OFF.
UPDATE public.platform_policies SET value = 'true'::jsonb WHERE policy_key = 'hr.salary_revision.target_measurement_on';

-- ── 1. The asks (HR head for everyone; the principal for the HR head) ──────
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sF1', 52500, 'Teaching load') AS req_f1 \gset
SELECT public.fn_hr_salary_revision_propose(:'sF2', 41000, 'Small step') AS req_f2 \gset
SELECT public.fn_hr_salary_revision_propose(:'sF4', 60000, 'Second lab') AS req_f4 \gset
SELECT public.fn_hr_salary_revision_propose(:'sF5', 66000, 'Results') AS req_f5 \gset
SELECT public.fn_hr_salary_revision_propose(:'sF6', 40000, 'On the list') AS req_f6 \gset
SELECT public.fn_hr_salary_revision_propose(:'sF7', 25000, 'Saturdays') AS req_f7 \gset
SELECT public.fn_hr_salary_revision_propose(:'sF3', 60000, 'Leaving soon') AS req_f3 \gset
SELECT public.fn_hr_salary_revision_propose(:'sF8', 34000, 'New lab') AS req_f8 \gset
SELECT public.fn_hr_salary_revision_propose(:'sPA', 130000, 'Two colleges') AS req_pa \gset
SELECT public.fn_hr_salary_revision_propose(:'sHA', 90000, 'Two roles') AS req_ha \gset
SELECT public.fn_hr_salary_revision_propose(:'sF11', 34000, 'Teaches') AS req_f11 \gset
SELECT t.login(:'PA');
SELECT public.fn_hr_salary_revision_propose(:'sH', 100000, 'HR load') AS req_h \gset
RESET ROLE;
SELECT t.check('all twelve asks wait for the Director',
  (SELECT count(*) FROM public.hr_salary_revision_requests WHERE status = 'waiting_director') = 12);

-- ── 2. Fail closed: no rules, no yes ────────────────────────────────────────
UPDATE public.platform_policies SET is_active = false WHERE policy_key = :'KEY';
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_f2')) AS closed \gset
RESET ROLE;
SELECT t.check('with the raise rules switched off, the yes is refused and nothing changes',
  :'closed' LIKE '55000 The raise rules setting%'
  AND (SELECT status = 'waiting_director' FROM public.hr_salary_revision_requests WHERE id = :'req_f2')
  AND NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_target_plans), :'closed');
UPDATE public.platform_policies SET is_active = true WHERE policy_key = :'KEY';

-- ── 3. The yes splits ───────────────────────────────────────────────────────
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the Director approves all twelve',
  (SELECT bool_and(t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', x)) = 'ok')
     FROM unnest(ARRAY[:'req_f1', :'req_f2', :'req_f4', :'req_f5', :'req_f6', :'req_f7', :'req_f3', :'req_f8', :'req_pa', :'req_h', :'req_ha', :'req_f11']) x));
RESET ROLE;
SELECT t.check('the yes splits a raise: 5% of the pay now as the increment, the rest held',
  (SELECT base_monthly_gross = 48000 AND increment_amount = 2400 AND held_amount = 2100 AND state = 'waiting'
          AND target_role = 'faculty' AND window_start = :'m1'::date AND window_months = 6
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1'),
  (SELECT row_to_json(p)::text FROM public.hr_salary_revision_target_plans p WHERE request_id = :'req_f1'));
SELECT t.check('a raise below the increment is all increment, nothing held',
  (SELECT increment_amount = 1000 AND held_amount = 0 AND state = 'none'
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f2'));
SELECT t.check('the role''s targets and thresholds are kept with the raise',
  (SELECT rules->'targets' = '{"t1_marked_by_self_min_pct": 85, "t1_mark_within_hours": 24, "t3_linked_min_pct": 60, "t4_resource_min_pct": 25, "t5_min_pulses_per_week": 1}'::jsonb
          AND rules->>'pause_after_missed_months' = '3'
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1'));
SELECT t.check('a Director-list member''s held part is listed at the yes, never measured',
  (SELECT state = 'held_listed' AND state_reason = 'director_list' AND held_amount = 3250
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f6'));
SELECT t.check('the principal''s own raise gets no target-based part, even holding the faculty role',
  (SELECT state = 'held_listed' AND state_reason = 'waits_for_own_targets:principal' AND increment_amount = 6000 AND held_amount = 4000
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_pa'),
  (SELECT state || ' ' || COALESCE(state_reason, '') FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_pa'));
SELECT t.check('two roles with targets: listed for the Director, not measured',
  (SELECT state = 'held_listed' AND state_reason = 'several_target_roles:faculty,hod'
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_ha'),
  (SELECT state || ' ' || COALESCE(state_reason, '') FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_ha'));
SELECT t.check('a teacher whose role key is not ''faculty'' gets the faculty targets (they teach; their semester ended and was switched off; they marked in it)',
  (SELECT state = 'waiting' AND target_role = 'faculty' AND rules->'targets'->>'t1_marked_by_self_min_pct' = '85'
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f11'),
  (SELECT state || ' ' || COALESCE(state_reason, '') || ' ' || COALESCE(target_role, '') FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f11'));
SELECT t.check('someone who does not teach gets no target-based part: parked, no teaching timetable (a timetable made just now and never marked does not count)',
  (SELECT state = 'held_listed' AND state_reason = 'no_teaching_timetable' AND held_amount = 5500
     FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_h'),
  (SELECT state || ' ' || COALESCE(state_reason, '') FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_h'));
SELECT t.check('the request keeps the Director''s whole figure and no new status',
  (SELECT final_monthly_gross = 52500 AND status = 'approved' FROM public.hr_salary_revision_requests WHERE id = :'req_f1'));
SELECT t.check('the person''s outcome is the pay that starts: pay now + increment',
  (SELECT previous_monthly_gross = 48000 AND new_monthly_gross = 50400 FROM public.hr_salary_revision_outcomes WHERE request_id = :'req_f1'));
SELECT t.check('the person is told the new pay and the held amount',
  EXISTS (SELECT 1 FROM public.user_notifications u JOIN public.notifications n ON n.id = u.notification_id
           WHERE u.user_id = :'F1' AND n.body LIKE '%will be ₹50,400 (it is ₹48,000 now). Another ₹2,100 a month is held back%'));

-- A config edit after the yes: the raise keeps its copy.
UPDATE public.platform_policies SET value = jsonb_set(value, '{role_targets,faculty,t1_marked_by_self_min_pct}', '99')
 WHERE policy_key = :'KEY';
SELECT t.check('a change to the raise rules after the yes leaves the raise''s own copy alone',
  (SELECT rules->'targets'->>'t1_marked_by_self_min_pct' = '85' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1')
  AND (SELECT value->'role_targets'->'faculty'->>'t1_marked_by_self_min_pct' = '99' FROM public.platform_policies WHERE policy_key = :'KEY'));

-- ── 4. The start date: pay + increment only ─────────────────────────────────
SELECT set_config('t.today', :'m1', false);
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_apply_due() AS applied \gset
RESET ROLE;
SELECT t.check('on the start date the HR head''s run writes all twelve',
  :'applied'::int = 12 AND (SELECT count(*) FROM public.hr_salary_revision_requests WHERE status = 'applied') = 12,
  (SELECT string_agg(apply_note, ' | ') FROM public.hr_salary_revision_requests WHERE apply_note IS NOT NULL));
SELECT t.check('the start date writes pay + increment, not the held part',
  (SELECT monthly_gross = 50400 AND effective_from = :'m1'::date FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL));
SELECT t.check('a Director-list member''s increment is written when HR runs the approvals job (the apply marker)',
  (SELECT monthly_gross = 36750 FROM public.hr_staff_salaries WHERE staff_id = :'sF6' AND superseded_by IS NULL));

-- Default p: one held raise at a time.
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.msg(format('SELECT public.fn_hr_salary_revision_propose(%L, 60000, %L)', :'sF1', 'Again')) AS second_ask \gset
RESET ROLE;
SELECT t.check('a new raise is refused while the earlier held part is open',
  :'second_ask' = '55000 This person has an earlier raise whose held part is still open. Finish or lapse the earlier held raise first.'
  AND (SELECT count(*) FROM public.hr_salary_revision_requests WHERE staff_id = :'sF1') = 1, :'second_ask');
-- An ask made before the rule (written straight in, as an older request would be).
INSERT INTO public.hr_salary_revision_requests (id, staff_id, institution_id, asked_by, asked_as, route,
  current_monthly_gross, asked_monthly_gross, reason, status, subject_profile_id, subject_was_list_member)
VALUES ('00000000-0000-0000-0000-0000000e0001', :'sF1', :'A', :'H', 'hr_head', 'direct', 50400, 56000, 'older ask', 'waiting_director', :'F1', false);
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', '00000000-0000-0000-0000-0000000e0001')) AS old_yes \gset
RESET ROLE;
SELECT t.check('an older ask cannot be approved while the earlier held part is open',
  :'old_yes' LIKE '55000 This person has an earlier raise whose held part is still open%'
  AND NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_target_plans WHERE request_id = '00000000-0000-0000-0000-0000000e0001'), :'old_yes');
DELETE FROM public.hr_salary_revision_requests WHERE id = '00000000-0000-0000-0000-0000000e0001';
-- Round 4: a PARKED held part blocks a second raise too (the principal's own).
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.msg(format('SELECT public.fn_hr_salary_revision_propose(%L, 140000, %L)', :'sPA', 'Again')) AS pa_again \gset
RESET ROLE;
SELECT t.check('a new raise is refused while an earlier held part is parked (the principal''s own)',
  :'pa_again' LIKE '55000 This person has an earlier raise whose held part is still open.%', :'pa_again');
INSERT INTO public.hr_salary_revision_requests (id, staff_id, institution_id, asked_by, asked_as, route,
  current_monthly_gross, asked_monthly_gross, reason, status, subject_profile_id, subject_was_list_member)
VALUES ('00000000-0000-0000-0000-0000000e0002', :'sH', :'A', :'PA', 'principal', 'direct', 94500, 99000, 'older ask', 'waiting_director', :'H', false);
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', '00000000-0000-0000-0000-0000000e0002')) AS old_yes_h \gset
RESET ROLE;
SELECT t.check('an older ask cannot be approved while an earlier held part is parked (not teaching)',
  :'old_yes_h' LIKE '55000 This person has an earlier raise whose held part is still open%', :'old_yes_h');
DELETE FROM public.hr_salary_revision_requests WHERE id = '00000000-0000-0000-0000-0000000e0002';

-- People change: F7 moves to college B, F3 leaves, F8 joins the Director list.
UPDATE public.staff SET institution_id = :'B', department_id = NULL WHERE id = :'sF7';
UPDATE public.staff SET is_active = false WHERE id = :'sF3';
UPDATE public.platform_policies
   SET value = value || to_jsonb(ARRAY[:'F8'])
 WHERE policy_key = 'platform.the_director_profile_ids';

-- ── 5. Teaching: the fixtures ───────────────────────────────────────────────
-- Fixtures are written as the SQL console (no signed-in user), so the stamp
-- trigger leaves the server stamps the fixtures carry as they are.
SELECT t.login(NULL);
SELECT t.spine(:'C1', :'F1', false), t.spine(:'C4', :'F4', false), t.spine(:'C5', :'F5', false),
       t.spine(:'C6', :'F6', false), t.spine(:'C8', :'F8', false), t.spine(:'C10', :'F10', false);
SELECT t.tt(:'sF1', :'A', :'C1', :'m1', (:'m4'::date - 1)) AS tt1a \gset
SELECT t.tt(:'sF1', :'A', :'C1', :'m5', (:'m9'::date - 1)) AS tt1b \gset
SELECT t.tt(:'sF4', :'A', :'C4', :'m1', (:'m8'::date - 1)) AS tt4 \gset
SELECT t.tt(:'sF5', :'B', :'C5', :'m1', (:'m2'::date - 1)) AS tt5 \gset
SELECT t.tt(:'sF6', :'A', :'C6', :'m1', (:'m2'::date - 1)) AS tt6 \gset
SELECT t.tt(:'sF8', :'A', :'C8', :'m1', (:'m2'::date - 1)) AS tt8 \gset
SELECT t.tt(:'sF5', :'B', :'C5', :'m3', (:'m7'::date - 1)) AS tt5b \gset
SELECT t.tt(:'sF10', :'A', :'C10', :'m2', (:'m3'::date - 1)) AS tt10 \gset
-- F1: M1 misses one target (pulses only in its first seven days), M2 meets
-- all five at 90% marking (above 85, below the 99 set after the yes), M3
-- missed, M4 no classes at all, M5 and M6 missed, M7 met.
SELECT t.teach(:'tt1a', :'F1', :'C1', :'m1', t.all_days(:'m1'), NULL, NULL, NULL, t.all_days(:'m1'),
               (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m1'), 2) g), ARRAY[1, 2, 3, 4, 5, 6, 7]);
SELECT t.teach(:'tt1a', :'F1', :'C1', :'m2',
               (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m2') - 3) g), NULL,
               ARRAY[t.days_in(:'m2') - 2, t.days_in(:'m2') - 1, t.days_in(:'m2')], NULL,
               (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m2') - 3) g),
               (SELECT array_agg(g) FROM generate_series(1, t.days_in(:'m2'), 2) g), t.all_days(:'m2'));
SELECT t.bad_month(:'tt1a', :'F1', :'C1', :'m3');
SELECT t.bad_month(:'tt1b', :'F1', :'C1', :'m5'), t.bad_month(:'tt1b', :'F1', :'C1', :'m6');
SELECT t.good_month(:'tt1b', :'F1', :'C1', :'m7');
-- F4: six months with no pulse at all (T5 missed), then a full month 7.
SELECT t.teach(:'tt4', :'F4', :'C4', m::date, t.all_days(m::date), NULL, NULL, NULL, t.all_days(m::date),
               (SELECT array_agg(g) FROM generate_series(1, t.days_in(m::date), 2) g), NULL)
  FROM generate_series(:'m1'::date, :'m6'::date, interval '1 month') m;
SELECT t.good_month(:'tt4', :'F4', :'C4', :'m7');
-- F5, F6, F8: M1 with every target met.
SELECT t.good_month(:'tt5', :'F5', :'C5', :'m1'), t.good_month(:'tt6', :'F6', :'C6', :'m1'),
       t.good_month(:'tt8', :'F8', :'C8', :'m1');
-- F5 after release: M3 missed, M4 met, M5 and M6 missed. F10: M2 met.
SELECT t.bad_month(:'tt5b', :'F5', :'C5', :'m3'), t.good_month(:'tt5b', :'F5', :'C5', :'m4'),
       t.bad_month(:'tt5b', :'F5', :'C5', :'m5'), t.bad_month(:'tt5b', :'F5', :'C5', :'m6');
SELECT t.good_month(:'tt10', :'F10', :'C10', :'m2');

-- ── 6. The principal's flag, during the month ───────────────────────────────
SELECT set_config('t.today', (:'m1'::date + 14)::text, false);
SET ROLE authenticated;
SELECT t.login(:'PB');
SELECT t.check('the principal of the college flags a month with a note',
  t.try(format('SELECT public.fn_hr_salary_revision_target_flag(%L, %L, %L)', :'req_f5', :'m1', 'Exams: classes stopped for a week')) = 'ok');
SELECT t.check('a flag needs a note',
  t.try(format('SELECT public.fn_hr_salary_revision_target_flag(%L, %L, %L)', :'req_f5', :'m1', '  ')) = '22023');
SELECT t.check('a month already flagged cannot be flagged again',
  t.try(format('SELECT public.fn_hr_salary_revision_target_flag(%L, %L, %L)', :'req_f5', :'m1', 'again')) = '55000');
SELECT t.login(:'PA');
SELECT t.check('another college''s principal cannot flag the month',
  t.try(format('SELECT public.fn_hr_salary_revision_target_flag(%L, %L, %L)', :'req_f5', :'m1', 'x')) = '42501');
SELECT t.check('a principal cannot flag a month of their own raise',
  t.try(format('SELECT public.fn_hr_salary_revision_target_flag(%L, %L, %L)', :'req_pa', :'m1', 'x')) = '42501');
SELECT t.check('a month outside the raise''s window cannot be flagged',
  t.try(format('SELECT public.fn_hr_salary_revision_target_flag(%L, %L, %L)', :'req_f1', :'m3', 'x')) = '22023');
SELECT t.login(:'HA');
SELECT t.check('a head of department (no principal''s check) cannot flag a month',
  t.try(format('SELECT public.fn_hr_salary_revision_target_flag(%L, %L, %L)', :'req_f1', :'m1', 'x')) = '42501');
SELECT t.login(:'F5');
SELECT t.check('the person sees their own plan and months, never the principal''s note',
  (SELECT count(*) FROM public.fn_hr_salary_revision_my_targets() WHERE request_id = :'req_f5') = 1
  AND (SELECT jsonb_array_length(months) FROM public.fn_hr_salary_revision_my_targets() WHERE request_id = :'req_f5') = 1
  AND (SELECT count(*) FROM public.hr_salary_revision_target_flags) = 0
  AND t.try(format('SELECT public.fn_hr_salary_revision_target_flag(%L, %L, %L)', :'req_f5', :'m1', 'mine')) = '42501');
SELECT t.check('the person cannot write their own plan or months',
  t.try(format('UPDATE public.hr_salary_revision_target_plans SET held_amount = 0 WHERE request_id = %L', :'req_f5')) = '42501'
  AND t.try(format('UPDATE public.hr_salary_revision_target_months SET status = %L WHERE request_id = %L', 'met', :'req_f5')) = '42501');
SELECT t.login(:'F2');
SELECT t.check('a colleague sees nobody else''s targets (only their own, through their own view)',
  (SELECT count(*) FROM public.hr_salary_revision_target_plans) = 0
  AND (SELECT count(*) FROM public.fn_hr_salary_revision_my_targets()) = 1
  AND (SELECT request_id FROM public.fn_hr_salary_revision_my_targets()) = :'req_f2'::uuid);
SELECT t.login(:'PB');
SELECT t.check('the principal reads the flag; another college''s raise stays hidden',
  (SELECT count(*) FROM public.hr_salary_revision_target_flags WHERE request_id = :'req_f5') = 1
  AND (SELECT count(*) FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1') = 0);
SELECT t.login(:'HA');
SELECT t.check('the head of department sees the targets of a raise in their department',
  (SELECT count(*) FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1') = 1);
RESET ROLE;

-- F10: asked and approved late in M1 (start M2); HR then changes the pay.
SELECT set_config('t.today', (:'m1'::date + 19)::text, false);
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sF10', 34000, 'Late') AS req_f10 \gset
SELECT t.login(:'D');
SELECT public.fn_hr_salary_revision_director_decide(:'req_f10', true) AS f10_yes \gset
RESET ROLE;
SELECT t.login(NULL);
SELECT public.fn_hr_set_staff_salary(p_staff_id => :'sF10', p_hr_organization_id => :'OA', p_monthly_gross => 30500, p_effective_from => (:'m1'::date + 19)) AS f10_edit \gset
SELECT set_config('t.today', :'m2', false);
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_apply_due() AS applied2 \gset
RESET ROLE;
SELECT t.check('the pay changed since the yes: the start date writes nothing, notes it, and lists it',
  (SELECT monthly_gross = 30500 FROM public.hr_staff_salaries WHERE staff_id = :'sF10' AND superseded_by IS NULL)
  AND (SELECT status = 'approved' AND apply_note LIKE 'The pay in force (₹30,500) is no longer the pay this raise was split from.%'
         FROM public.hr_salary_revision_requests WHERE id = :'req_f10'),
  (SELECT status || ' ' || COALESCE(apply_note, '') FROM public.hr_salary_revision_requests WHERE id = :'req_f10'));
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the Director''s list shows the start date that wrote nothing',
  EXISTS (SELECT 1 FROM public.fn_hr_salary_revision_targets_listed() WHERE request_id = :'req_f10' AND why LIKE 'start date: The pay in force%'));
RESET ROLE;

-- Default ff: two earlier nights on which F1's run timed out (the route
-- records the attempt first, in its own call). Test-only: a trigger makes
-- F1's month write slow, so the time-out is certain (no race).
SELECT t.login(NULL);
CREATE FUNCTION t.slow_month() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.request_id::text = current_setting('t.slow_request', true) THEN PERFORM pg_sleep(0.3); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER t_slow_month BEFORE INSERT OR UPDATE ON public.hr_salary_revision_target_months
  FOR EACH ROW EXECUTE FUNCTION t.slow_month();
SELECT set_config('t.slow_request', :'req_f1', false);
SELECT public.hr_salary_revision_targets_attempt(:'req_f1', :'m2'::date - 2) AS a1 \gset
SET statement_timeout = '100ms';
SELECT t.try_timeout(format('SELECT public.hr_salary_revision_targets_run_one(%L, %L)', :'req_f1', :'m2'::date - 2)) AS t1x \gset
RESET statement_timeout;
SELECT public.hr_salary_revision_targets_attempt(:'req_f1', :'m2'::date - 1) AS a2 \gset
SET statement_timeout = '100ms';
SELECT t.try_timeout(format('SELECT public.hr_salary_revision_targets_run_one(%L, %L)', :'req_f1', :'m2'::date - 1)) AS t2x \gset
RESET statement_timeout;
SELECT public.hr_salary_revision_targets_attempt(:'req_f1', :'m2') AS a3 \gset
SELECT public.hr_salary_revision_targets_attempt(:'req_f1', :'m2') AS a3again \gset
-- Default bb: one person per call. A time-out on F1 undoes only F1.
SET statement_timeout = '100ms';
SELECT t.try_timeout(format('SELECT public.hr_salary_revision_targets_run_one(%L, %L)', :'req_f1', :'m2')) AS f1_timeout \gset
RESET statement_timeout;
SELECT set_config('t.slow_request', '', false);
DROP TRIGGER t_slow_month ON public.hr_salary_revision_target_months;
SELECT public.hr_salary_revision_targets_run_one(:'req_f5', :'m2') AS f5_alone \gset
SELECT t.check('a time-out on one person leaves the others'' results written, and that person first in line',
  :'f1_timeout' = '57014'
  AND NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f1')
  AND (SELECT last_run_on IS NULL FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1')
  AND EXISTS (SELECT 1 FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f5' AND month = :'m1')
  AND :'req_f1'::uuid IN (SELECT * FROM public.hr_salary_revision_targets_due(:'m2'))
  AND :'req_f5'::uuid NOT IN (SELECT * FROM public.hr_salary_revision_targets_due(:'m2')),
  :'f1_timeout');
SELECT t.check('a raise that did not finish on 3 nights in a row goes last and is listed for the Director',
  :'a3again'::int = 3
  AND (SELECT (array_agg(x))[count(*)] FROM public.hr_salary_revision_targets_due(:'m2') x) = :'req_f1'::uuid,
  :'a1' || ',' || :'a2' || ',' || :'a3' || ',' || :'a3again');
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the Director''s list shows the raise that kept timing out, with the reason',
  EXISTS (SELECT 1 FROM public.fn_hr_salary_revision_targets_listed()
           WHERE request_id = :'req_f1' AND why LIKE 'run: The monthly check did not finish on 3 nights in a row%'));
RESET ROLE;
SELECT t.login(NULL);
-- Default bb: at most p_max_months per call (F11 has two months to measure).
SELECT public.hr_salary_revision_targets_run_one(:'req_f11', :'m2', 1) AS f11_capped \gset
SELECT t.check('one call measures at most the set number of months; the rest wait for the next run',
  (SELECT count(*) FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f11') = 1);

-- ── 7. Run 1: on the 1st of M2 (month 1 counted) ────────────────────────────
SELECT public.hr_salary_revision_targets_run_on(:'m2') AS w1 \gset
SELECT t.check('month 1 with one target missed is counted as missed, and nothing is paid',
  (SELECT status = 'missed' AND acted AND action = 'none'
          AND results @> '[{"target":"t1","met":true},{"target":"t2","met":true},{"target":"t3","met":true},{"target":"t4","met":true},{"target":"t5","met":false}]'
     FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f1' AND month = :'m1')
  AND (SELECT monthly_gross = 50400 FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL)
  AND (SELECT state = 'waiting' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1'),
  (SELECT status || ' ' || results::text FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f1' AND month = :'m1'));
SELECT t.check('a finished run clears the count of nights that did not finish',
  (SELECT failed_nights = 0 AND last_run_on = :'m2'::date FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1'));
SELECT measured_at AS f4_m2_at FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND month = :'m2' \gset
SELECT public.hr_salary_revision_targets_run_one(:'req_f4', :'m2') AS f4_again \gset
SELECT t.check('a second, overlapping call for a raise already run that day changes nothing',
  :'f4_again'::int = 0
  AND (SELECT measured_at = :'f4_m2_at'::timestamptz FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND month = :'m2'));
SELECT t.check('the current month is measured so far, not counted',
  (SELECT status = 'in_progress' AND NOT acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f1' AND month = :'m2'));
SELECT t.check('a flagged month is counted as neither met nor missed: all five met, still nothing paid',
  (SELECT status = 'flagged' AND NOT acted AND results @> '[{"target":"t5","met":true},{"target":"t1","met":true}]'
     FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f5' AND month = :'m1')
  AND (SELECT monthly_gross = 63000 FROM public.hr_staff_salaries WHERE staff_id = :'sF5' AND superseded_by IS NULL)
  AND (SELECT state = 'waiting' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f5'),
  (SELECT status FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f5' AND month = :'m1'));
SELECT t.check('a Director-list member is never released by the run, every target met',
  (SELECT state = 'held_listed' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f6')
  AND (SELECT monthly_gross = 36750 FROM public.hr_staff_salaries WHERE staff_id = :'sF6' AND superseded_by IS NULL));
SELECT t.check('someone put on the Director list after the yes is not released either',
  (SELECT state = 'held_listed' AND state_reason = 'director_list' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f8')
  AND (SELECT monthly_gross = 31500 FROM public.hr_staff_salaries WHERE staff_id = :'sF8' AND superseded_by IS NULL),
  (SELECT state || ' ' || COALESCE(state_reason, '') FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f8'));
SELECT t.check('moving to another college while waiting: the held part lapses, listed',
  (SELECT state = 'lapsed' AND state_reason = 'moved_college' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f7'));
SELECT t.check('leaving while waiting: the held part lapses, listed',
  (SELECT state = 'lapsed' AND state_reason = 'left' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f3'));
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the Director''s list shows the flagged month with its note and numbers, and the held and lapsed parts',
  (SELECT count(*) FROM public.fn_hr_salary_revision_targets_listed() l
    WHERE (l.request_id = :'req_f5' AND l.month = :'m1' AND l.why = 'flagged: Exams: classes stopped for a week' AND jsonb_array_length(l.results) = 5)
       OR (l.request_id IN (:'req_f6', :'req_f8', :'req_pa', :'req_h', :'req_ha', :'req_f7', :'req_f3') AND l.month IS NULL AND l.why NOT LIKE 'start date:%')) = 8);
SELECT t.login(:'S');
SELECT t.check('nobody else gets the Director''s list', t.try('SELECT * FROM public.fn_hr_salary_revision_targets_listed()') = '42501');
RESET ROLE;

-- ── 8. Flags after counting; the Director decides ───────────────────────────
SELECT set_config('t.today', (:'m2'::date + 3)::text, false);
SET ROLE authenticated;
SELECT t.login(:'PA');
SELECT t.check('a month already counted cannot be flagged',
  t.try(format('SELECT public.fn_hr_salary_revision_target_flag(%L, %L, %L)', :'req_f1', :'m1', 'late')) = '55000');
SELECT t.check('the principal flags this month for F4',
  t.try(format('SELECT public.fn_hr_salary_revision_target_flag(%L, %L, %L)', :'req_f4', :'m2', 'Lab rebuilt; pulses impossible')) = 'ok');
SELECT t.login(:'D');
SELECT t.check('the Director cannot decide a month that is not over',
  t.try(format('SELECT public.fn_hr_salary_revision_target_decide(%L, %L, false)', :'req_f4', :'m2')) = '55000');
SELECT t.check('the Director cannot decide a month nobody flagged',
  t.try(format('SELECT public.fn_hr_salary_revision_target_decide(%L, %L, true)', :'req_f1', :'m1')) = '55000');
SELECT t.login(:'S');
SELECT t.check('a super admin not on the Director list cannot decide a flagged month',
  t.try(format('SELECT public.fn_hr_salary_revision_target_decide(%L, %L, true)', :'req_f5', :'m1')) = '42501');
SELECT t.login(:'D');
SELECT t.msg(format('SELECT public.fn_hr_salary_revision_target_decide(%L, %L, true, %L)', :'req_f5', :'m1', 'Fair')) AS f5_decided \gset
SELECT t.check('the Director decides the flagged month: met',
  :'f5_decided' = 'ok'
  AND (SELECT status = 'decided_met' FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f5' AND month = :'m1'),
  :'f5_decided');
RESET ROLE;

-- ── 9. Run 2: on the 12th of M2, not a 1st ─────────────────────────────────
SELECT public.hr_salary_revision_targets_run_on((:'m2'::date + 11)) AS w2 \gset
SELECT t.check('a month the Director decides as met releases the held part, from the NEXT 1st (never backdated)',
  (SELECT monthly_gross = 66000 AND effective_from = :'m3'::date FROM public.hr_staff_salaries WHERE staff_id = :'sF5' AND superseded_by IS NULL)
  AND (SELECT state = 'released' AND held_paid_from = :'m3'::date FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f5'),
  (SELECT monthly_gross || ' from ' || effective_from FROM public.hr_staff_salaries WHERE staff_id = :'sF5' AND superseded_by IS NULL));

-- ── 10. Run 3: on the 1st of M3 (month 2 met) ──────────────────────────────
SELECT public.hr_salary_revision_targets_run_on(:'m3') AS w3 \gset
SELECT t.check('the first month with all five met releases the held part on the 1st of the next month, at pay + held',
  (SELECT monthly_gross = 52500 AND effective_from = :'m3'::date AND notes LIKE 'Held part of a salary revision paid: targets met%'
     FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL)
  AND (SELECT state = 'released' AND held_paid_from = :'m3'::date AND missed_in_row = 0
         FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1'),
  (SELECT monthly_gross || ' from ' || effective_from FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL));
SELECT t.check('month 2 was measured on the raise''s own copy (85), not the edited setting (99)',
  (SELECT status = 'met' AND action = 'released'
          AND results @> '[{"target":"t1","met":true}]'
     FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f1' AND month = :'m2'));
SELECT t.check('the monthly run skips a raise not yet written (F10, its start date wrote nothing)',
  NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f10')
  AND (SELECT monthly_gross = 30500 FROM public.hr_staff_salaries WHERE staff_id = :'sF10' AND superseded_by IS NULL));
SELECT t.check('a flagged month waits for the Director: F4''s month 2 is not counted',
  (SELECT status = 'flagged' AND NOT acted FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND month = :'m2'));

-- ── 11. The pay guard's second marker refuses anything but the planned write ─
SELECT set_config('app.hr_salary_revision_target_pay', :'req_f1', false);
SELECT t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 50400, p_effective_from => %L)', :'sF1', :'OA', :'m5')) AS forged \gset
SELECT t.check('the marker alone (no planned step) is refused, even for the SQL console', :'forged' LIKE '42501 The held part of a raise%', :'forged');
UPDATE public.hr_salary_revision_target_plans SET pending_action = 'pause', pending_effective_from = :'m5' WHERE request_id = :'req_f1';
SELECT t.check('the marker with the wrong amount is refused',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 50401, p_effective_from => %L)', :'sF1', :'OA', :'m5')) LIKE '42501 The held part of a raise%');
SELECT t.check('the marker on the wrong person is refused',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 38900, p_effective_from => %L)', :'sF2', :'OA', :'m5')) LIKE '42501 The held part of a raise%');
SELECT t.check('the marker on the wrong date is refused',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 50400, p_effective_from => %L)', :'sF1', :'OA', :'m6')) LIKE '42501 The held part of a raise%');
-- The planned pause at the right amount and date, but the yes is not stamped under #4190's rules.
UPDATE public.hr_salary_revision_requests SET decided_under_rules = false WHERE id = :'req_f1';
SELECT t.check('the marker for a yes not stamped under #4190''s rules is refused',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 50400, p_effective_from => %L)', :'sF1', :'OA', :'m5')) LIKE '42501 The held part of a raise%');
UPDATE public.hr_salary_revision_requests SET decided_under_rules = true WHERE id = :'req_f1';
UPDATE public.hr_salary_revision_target_plans SET pending_action = 'resume', pending_effective_from = :'m5' WHERE request_id = :'req_f1';
SELECT t.check('the marker for a step the state does not call for (resume while paid) is refused',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 54600, p_effective_from => %L)', :'sF1', :'OA', :'m5')) LIKE '42501 The held part of a raise%');
UPDATE public.hr_salary_revision_target_plans SET pending_action = NULL, pending_effective_from = NULL WHERE request_id = :'req_f1';
-- Someone on the Director list: the planned release at the right amount and date.
UPDATE public.hr_salary_revision_target_plans SET state = 'waiting', pending_action = 'release', pending_effective_from = :'m5' WHERE request_id = :'req_f8';
SELECT set_config('app.hr_salary_revision_target_pay', :'req_f8', false);
SELECT t.check('the marker never writes the pay of someone on the Director list',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 34000, p_effective_from => %L)', :'sF8', :'OA', :'m5')) LIKE '42501 The held part of a raise%');
UPDATE public.hr_salary_revision_target_plans SET state = 'held_listed', pending_action = NULL, pending_effective_from = NULL WHERE request_id = :'req_f8';
SELECT set_config('app.hr_salary_revision_target_pay', '', false);
SELECT t.check('after the refused writes the pay is unchanged',
  (SELECT monthly_gross = 52500 FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL)
  AND (SELECT monthly_gross = 41000 FROM public.hr_staff_salaries WHERE staff_id = :'sF2' AND superseded_by IS NULL));

-- ── 12. Months 3-6: the pause ───────────────────────────────────────────────
SELECT set_config('t.today', (:'m3'::date + 5)::text, false);
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the Director decides F4''s flagged month: missed',
  t.try(format('SELECT public.fn_hr_salary_revision_target_decide(%L, %L, false)', :'req_f4', :'m2')) = 'ok');
RESET ROLE;
-- Default dd (probe A): F1's first timetable ended on the last day of M3 and
-- the daily job switched it off; M3 still counts on its dates.
UPDATE public.timetables SET is_active = false WHERE id = :'tt1a';
SELECT public.hr_salary_revision_targets_run_on(:'m4') AS w4 \gset
SELECT t.check('a missed month after release counts one, nothing changes yet (its timetable, switched off after it ended, still counted)',
  (SELECT missed_in_row = 1 AND state = 'released' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1'));
SELECT public.hr_salary_revision_targets_run_on(:'m5') AS w5 \gset
SELECT t.check('a month with no classes counts neither way',
  (SELECT status = 'not_counted' FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f1' AND month = :'m4')
  AND (SELECT missed_in_row = 1 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1'));
SELECT public.hr_salary_revision_targets_run_on(:'m6') AS w6 \gset
SELECT t.check('two missed months in a row: still paid',
  (SELECT missed_in_row = 2 AND state = 'released' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1')
  AND (SELECT monthly_gross = 52500 FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL));
SELECT public.hr_salary_revision_targets_run_on(:'m7') AS w7 \gset
SELECT t.check('three missed months in a row pause the held part: pay - held, from the 1st',
  (SELECT monthly_gross = 50400 AND effective_from = :'m7'::date FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL)
  AND (SELECT state = 'paused' AND paused_from = :'m7'::date FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1'),
  (SELECT monthly_gross || ' from ' || effective_from FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL));
SELECT t.check('no claw-back: the months already paid keep their pay rows untouched',
  (SELECT count(*) = 1 AND bool_and(monthly_gross = 52500)
     FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND effective_from = :'m3'::date)
  AND NOT EXISTS (SELECT 1 FROM public.hr_staff_salaries WHERE staff_id = :'sF1'
                   AND effective_from > :'m3'::date AND effective_from < :'m7'::date));
SELECT t.check('not met by month 6: back to the Director with the numbers, nothing held paid',
  (SELECT state = 'back_to_director' AND state_reason = 'window_over' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4')
  AND (SELECT monthly_gross = 54600 FROM public.hr_staff_salaries WHERE staff_id = :'sF4' AND superseded_by IS NULL)
  AND (SELECT count(*) = 6 FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND acted),
  (SELECT state FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4'));
SELECT t.check('a met month after release starts the missed-in-a-row count again (F5: missed, met, missed, missed: still paid)',
  (SELECT state = 'released' AND missed_in_row = 2 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f5')
  AND (SELECT monthly_gross = 66000 FROM public.hr_staff_salaries WHERE staff_id = :'sF5' AND superseded_by IS NULL),
  (SELECT state || ' ' || missed_in_row FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f5'));
SELECT t.check('the Director''s month decision counted: missed, nothing paid',
  (SELECT status = 'decided_missed' AND acted AND action = 'none' FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f4' AND month = :'m2'));

UPDATE public.platform_policies SET value = value || to_jsonb(ARRAY[:'F5'])
 WHERE policy_key = 'platform.the_director_profile_ids';

-- ── 13. Run on the 2nd of M8: month 7 met ───────────────────────────────────
SELECT public.hr_salary_revision_targets_run_on((:'m8'::date + 1)) AS w8 \gset
SELECT t.check('back on target: the held part is paid again, from the next 1st',
  (SELECT monthly_gross = 52500 AND effective_from = :'m9'::date FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL)
  AND (SELECT state = 'released' AND paused_from IS NULL FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1'),
  (SELECT monthly_gross || ' from ' || effective_from FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL));
-- Default aa: once paid, only the months the pause rule can use are measured.
-- F1 is run next at M12: M8 (left "so far" by run 8) is too old and is closed
-- unmeasured; M9-M11 are measured.
SELECT public.hr_salary_revision_targets_run_one(:'req_f1', (:'m8'::date + interval '4 month')::date) AS f1_late \gset
SELECT t.check('a paid held part is measured only for the months the pause rule can use',
  (SELECT status = 'not_counted' AND results = '[]'::jsonb FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f1' AND month = :'m8')
  AND (SELECT count(*) FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f1' AND month > :'m8') >= 3,
  (SELECT string_agg(month || ':' || status, ', ' ORDER BY month) FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f1'));
SELECT t.check('nothing is paid after the window, even for a month with all five met',
  (SELECT monthly_gross = 54600 FROM public.hr_staff_salaries WHERE staff_id = :'sF4' AND superseded_by IS NULL)
  AND (SELECT state = 'back_to_director' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4'));
SELECT t.check('someone put on the Director list after the held part was paid: skipped and listed, pay untouched',
  (SELECT run_note LIKE 'Now on the Director list%' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f5')
  AND (SELECT monthly_gross = 66000 FROM public.hr_staff_salaries WHERE staff_id = :'sF5' AND superseded_by IS NULL)
  AND NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f5' AND month = :'m7' AND acted));
SELECT t.check('a second run on the same day writes nothing',
  public.hr_salary_revision_targets_run_on((:'m8'::date + 1)) = 0);
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the window that ran out, and the run''s note, are on the Director''s list',
  EXISTS (SELECT 1 FROM public.fn_hr_salary_revision_targets_listed() WHERE request_id = :'req_f4' AND state = 'back_to_director')
  AND EXISTS (SELECT 1 FROM public.fn_hr_salary_revision_targets_listed() WHERE request_id = :'req_f5' AND why LIKE 'run: Now on the Director list%'));
-- Default p: the Director lapses an earlier held part; then a new raise may be asked for.
SELECT t.login(:'S');
SELECT t.check('nobody but the Director lapses a held part',
  t.try(format('SELECT public.fn_hr_salary_revision_target_lapse(%L, %L)', :'req_f1', 'x')) = '42501');
SELECT t.login(:'D');
SELECT t.check('a lapse needs a note', t.try(format('SELECT public.fn_hr_salary_revision_target_lapse(%L, %L)', :'req_f1', ' ')) = '22023');
SELECT t.msg(format('SELECT public.fn_hr_salary_revision_target_lapse(%L, %L)', :'req_f1', 'New pay scale')) AS lapsed \gset
SELECT t.check('the Director lapses the held part: listed, and nobody''s pay changes',
  :'lapsed' = 'ok'
  AND (SELECT state = 'lapsed' AND state_reason = 'lapsed_by_director' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f1')
  AND (SELECT monthly_gross = 52500 FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL)
  AND EXISTS (SELECT 1 FROM public.fn_hr_salary_revision_targets_listed() WHERE request_id = :'req_f1' AND why = 'lapsed_by_director: New pay scale'),
  :'lapsed');
SELECT t.login(:'F1');
SELECT t.check('the person''s own view shows numbers, state and dates only: never the lapse note, run notes or the reason',
  (SELECT state = 'lapsed' AND NOT (to_jsonb(x) ?| ARRAY['lapse_note', 'run_note', 'state_reason'])
     FROM public.fn_hr_salary_revision_my_targets() x WHERE request_id = :'req_f1')
  AND (SELECT count(*) FROM public.hr_salary_revision_target_plans) = 0);
SELECT t.login(:'H');
SELECT t.check('after the lapse a new raise may be asked for',
  t.try(format('SELECT public.fn_hr_salary_revision_propose(%L, 56000, %L)', :'sF1', 'Next year')) = 'ok');
SELECT t.login(:'D');
SELECT t.check('the Director lapses the principal''s parked held part',
  t.try(format('SELECT public.fn_hr_salary_revision_target_lapse(%L, %L)', :'req_pa', 'Principal targets later')) = 'ok');
SELECT t.login(:'H');
SELECT t.check('after that lapse a new raise for the principal may be asked for',
  t.try(format('SELECT public.fn_hr_salary_revision_propose(%L, 140000, %L)', :'sPA', 'Next')) = 'ok');
SELECT t.login(:'D');
SELECT t.check('a lapse is refused for a raise with no held part to lapse',
  t.msg(format('SELECT public.fn_hr_salary_revision_target_lapse(%L, %L)', :'req_f2', 'x')) = '55000 This raise has no held part to lapse.');
RESET ROLE;
-- F6 is on the Director list (so passes the Director-list gate) but is not
-- the Director himself: never on F6's own raise. A flagged, finished month on
-- F6's plan, written as the console.
INSERT INTO public.hr_salary_revision_target_months (request_id, month, status) VALUES (:'req_f6', :'m1', 'flagged');
INSERT INTO public.hr_salary_revision_target_flags (request_id, month, flagged_by, note) VALUES (:'req_f6', :'m1', :'PA', 'test');
SET ROLE authenticated;
SELECT t.login(:'F6');
SELECT t.msg(format('SELECT public.fn_hr_salary_revision_target_decide(%L, %L, true)', :'req_f6', :'m1')) AS f6_decide \gset
SELECT t.msg(format('SELECT public.fn_hr_salary_revision_target_lapse(%L, %L)', :'req_f6', 'mine')) AS f6_lapse \gset
-- Round 8: the Director's list never shows F6 their own raise (its notes).
SELECT count(*) AS f6_listed_own FROM public.fn_hr_salary_revision_targets_listed() WHERE request_id = :'req_f6' \gset
SELECT t.login(:'D');
SELECT count(*) AS d_listed_f6 FROM public.fn_hr_salary_revision_targets_listed() WHERE request_id = :'req_f6' \gset
RESET ROLE;
SELECT t.check('a Director-list member never sees their own raise on the Director''s list (no notes); the Director does',
  :'f6_listed_own'::int = 0 AND :'d_listed_f6'::int >= 1, :'f6_listed_own' || '/' || :'d_listed_f6');
-- (Read back as the console: since round 7 the tables never show F6 their own held part.)
SELECT t.login(NULL);
SELECT t.check('a Director-list member who is not the Director cannot decide a month of their own raise',
  :'f6_decide' LIKE '%You cannot decide on a raise for yourself.%'
  AND (SELECT status FROM public.hr_salary_revision_target_months WHERE request_id = :'req_f6' AND month = :'m1') = 'flagged');
SELECT t.check('a Director-list member who is not the Director cannot lapse their own held part',
  :'f6_lapse' LIKE '%You cannot decide on a raise for yourself.%'
  AND (SELECT state FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f6') = 'held_listed');
-- Default x: F10's start date wrote nothing (the pay had changed). The next
-- run of the approvals job finds the start date passed: back to the Director,
-- and the held part lapses so it blocks nothing.
SELECT t.login(NULL);
SELECT public.hr_salary_revision_apply_due_on(:'m3') AS f10_missed \gset
SELECT t.check('a request that leaves approved unwritten lapses its held part, and it is listed',
  (SELECT status = 'waiting_director' FROM public.hr_salary_revision_requests WHERE id = :'req_f10')
  AND (SELECT state = 'lapsed' AND state_reason = 'start_missed' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f10'),
  (SELECT state || ' ' || COALESCE(state_reason, '') FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f10'));
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the lapsed part is on the Director''s list',
  EXISTS (SELECT 1 FROM public.fn_hr_salary_revision_targets_listed() WHERE request_id = :'req_f10' AND why = 'start_missed'));
SELECT public.fn_hr_salary_revision_director_decide(:'req_f10', false, NULL, 'Ask again') AS f10_no \gset
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sF10', 33000, 'Again') AS req_f10b \gset
SELECT t.check('after that a new raise for them can be asked for',
  :'req_f10b' ~ '^[0-9a-f-]{36}$', :'req_f10b');
RESET ROLE;
-- #4190 rule 8 (default v): a record linked to no account.
SELECT t.login(NULL);
UPDATE public.hr_salary_revision_requests SET subject_profile_id = NULL WHERE id = :'req_f4';
UPDATE public.staff SET profile_id = NULL WHERE id = :'sF4';
UPDATE public.hr_salary_revision_target_plans SET state = 'waiting', pending_action = 'release', pending_effective_from = :'m9' WHERE request_id = :'req_f4';
SELECT set_config('app.hr_salary_revision_target_pay', :'req_f4', false);
SELECT t.check('the marker never writes the pay of a record linked to no account',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 60000, p_effective_from => %L)', :'sF4', :'OA', :'m9')) LIKE '42501 The held part of a raise%');
SELECT set_config('app.hr_salary_revision_target_pay', '', false);
UPDATE public.hr_salary_revision_target_plans SET pending_action = NULL, pending_effective_from = NULL WHERE request_id = :'req_f4';
SELECT public.hr_salary_revision_targets_run_on(:'m9') AS w9 \gset
SELECT t.check('the monthly run skips a record linked to no account and lists it',
  (SELECT state = 'waiting' AND run_note LIKE 'Linked to no account%' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4')
  AND (SELECT monthly_gross = 54600 FROM public.hr_staff_salaries WHERE staff_id = :'sF4' AND superseded_by IS NULL),
  (SELECT state || ' ' || COALESCE(run_note, '') FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f4'));

-- ── 14. Who may run the monthly check ───────────────────────────────────────
SET ROLE authenticated;
SELECT t.login(:'F1');
SELECT t.check('a team member cannot run the monthly check', t.try('SELECT public.fn_hr_salary_revision_targets_run()') = '42501');
SELECT t.login(:'D');
SELECT t.check('the Director cannot run it by hand either', t.try('SELECT public.fn_hr_salary_revision_targets_run()') = '42501');
RESET ROLE;
SET ROLE anon;
SELECT t.login(NULL);
SELECT t.check('anon cannot run the monthly check', t.try('SELECT public.fn_hr_salary_revision_targets_run()') = '42501');
RESET ROLE;
SELECT t.login(:'F1');
SELECT t.check('the run refuses a session carrying a signed-in user, even the database owner''s',
  t.msg('SELECT public.fn_hr_salary_revision_targets_run()') LIKE '42501 Only the scheduled job%');
SELECT t.login(NULL);
SELECT set_config('t.today', (:'m8'::date + 2)::text, false);
SET ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SELECT t.check('the service role (the cron) runs it', t.try('SELECT public.fn_hr_salary_revision_targets_run()') = 'ok');
RESET ROLE;
SELECT t.login(NULL);
SELECT t.check('signed-in users cannot call the new internal functions',
  NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
               AND p.proname IN ('hr_salary_revision_target_rules_ok', 'hr_salary_revision_target_rules',
                                 'hr_salary_revision_target_measure', 'hr_salary_revision_target_role_keys',
                                 'hr_salary_revision_target_plan_write', 'hr_salary_revision_target_pay',
                                 'hr_salary_revision_targets_run_on', 'fn_hr_salary_revision_targets_run',
                                 'fn_guard_hr_salary_revision_target_rules', 'fn_audit_hr_salary_revision_target_rules')
               AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE'))));
SELECT t.check('anon holds EXECUTE on none of the raise-target functions, and reads none of the tables',
  NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
               AND p.proname LIKE '%salary_revision_target%' AND has_function_privilege('anon', p.oid, 'EXECUTE'))
  AND NOT has_table_privilege('anon', 'public.hr_salary_revision_target_plans', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.hr_salary_revision_target_flags', 'SELECT'));

-- ── 15. Who first marked a period: the server's record (default q) ─────────
-- A timetable and days nobody's targets read.
\set TZ '00000000-0000-0000-0000-00000000077a'
SET ROLE authenticated;
SELECT t.login(:'F9');
INSERT INTO public.student_attendance (attendance_date, marked_by, institution_id, timetable_id, section_id, attendance_data)
VALUES (:'m10'::date + 25, :'F9', :'A', :'TZ', :'TZ',
  jsonb_build_object('z1', jsonb_build_object('period_name', 'P1', 'students', '[{"status": "Present"}]'::jsonb,
    'marked_by_details', jsonb_build_object('marker_id', :'F1', 'marked_at', '2020-01-01T00:00:00Z'))));
RESET ROLE;
SELECT marker_profile_id AS fm_marker, first_marked_at AS fm_time FROM public.attendance_first_marks
 WHERE timetable_id = :'TZ' AND period_name = 'P1' AND ordinal = 1 \gset
SELECT t.check('the first marking is recorded with the signed-in marker and the server''s time, not what the browser sent',
  :'fm_marker' = :'F9' AND :'fm_time'::timestamptz > now() - interval '1 hour', :'fm_marker' || ' ' || :'fm_time');
SELECT t.check('the attendance row is left exactly as the app wrote it (its own marker_id untouched)',
  (SELECT attendance_data->'z1'->'marked_by_details'->>'marker_id' = :'F1' FROM public.student_attendance WHERE timetable_id = :'TZ'));
-- Every way a later marker could try to take the period over, as F2:
SET ROLE authenticated;
SELECT t.login(:'F2');
-- (1) clear the period, then mark it again
UPDATE public.student_attendance SET attendance_data = jsonb_set(attendance_data, '{z1,students}', '[]') WHERE timetable_id = :'TZ';
UPDATE public.student_attendance SET attendance_data = jsonb_set(attendance_data, '{z1,students}', '[{"status": "Absent"}]') WHERE timetable_id = :'TZ';
-- (2) re-key it under a new entry key with the same period name
UPDATE public.student_attendance
   SET attendance_data = (attendance_data - 'z1') || jsonb_build_object('z9', attendance_data->'z1') WHERE timetable_id = :'TZ';
-- (3) remove the period ("Remove period attendance"), then mark it again
UPDATE public.student_attendance SET attendance_data = attendance_data - 'z9' WHERE timetable_id = :'TZ';
UPDATE public.student_attendance
   SET attendance_data = attendance_data || jsonb_build_object('z1', jsonb_build_object('period_name', 'P1', 'students', '[{"status": "Present"}]'::jsonb))
 WHERE timetable_id = :'TZ';
-- (4) delete the day's row and insert it again
DELETE FROM public.student_attendance WHERE timetable_id = :'TZ';
INSERT INTO public.student_attendance (attendance_date, marked_by, institution_id, timetable_id, section_id, attendance_data)
VALUES (:'m10'::date + 25, :'F2', :'A', :'TZ', :'TZ',
  jsonb_build_object('z1', jsonb_build_object('period_name', 'P1', 'students', '[{"status": "Present"}]'::jsonb)));
RESET ROLE;
SELECT t.check('clearing and re-marking, re-keying, removing and re-marking, or deleting and re-inserting the row never move the first marker or time',
  (SELECT count(*) = 1 AND bool_and(marker_profile_id = :'F9'::uuid AND first_marked_at = :'fm_time'::timestamptz)
     FROM public.attendance_first_marks WHERE timetable_id = :'TZ' AND period_name = 'P1'),
  (SELECT string_agg(ordinal || ':' || COALESCE(marker_profile_id::text, '-') || '@' || first_marked_at, ', ') FROM public.attendance_first_marks WHERE timetable_id = :'TZ'));
SET ROLE authenticated;
SELECT t.login(:'F2');
UPDATE public.student_attendance
   SET attendance_data = attendance_data || jsonb_build_object('z2', jsonb_build_object('period_name', 'P1', 'students', '[{"status": "Present"}]'::jsonb))
 WHERE timetable_id = :'TZ';
RESET ROLE;
SELECT t.check('a second period of the same name, first marked later by a colleague, is that colleague''s',
  (SELECT marker_profile_id = :'F2'::uuid FROM public.attendance_first_marks WHERE timetable_id = :'TZ' AND period_name = 'P1' AND ordinal = 2));
-- A forged write with the server key, dated 2020 and naming F9.
SET ROLE service_role;
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role', 'sub', :'F9')::text, false);
INSERT INTO public.student_attendance (attendance_date, marked_by, institution_id, timetable_id, section_id, attendance_data)
VALUES (:'m10'::date + 26, :'F9', :'A', :'TZ', :'TZ',
  jsonb_build_object('s1', jsonb_build_object('period_name', 'P2', 'students', '[{"status": "Present"}]'::jsonb,
    'marked_by_details', jsonb_build_object('marker_id', :'F9', 'marked_at', '2020-01-01T00:00:00Z'))));
RESET ROLE;
SELECT t.login(NULL);
SELECT t.check('a write with the server key is recorded with no marker and the server''s own time (never counts)',
  (SELECT marker_profile_id IS NULL AND first_marked_at > now() - interval '1 hour'
     FROM public.attendance_first_marks WHERE timetable_id = :'TZ' AND period_name = 'P2'));
SET ROLE authenticated;
SELECT t.login(:'F9');
SELECT t.check('nobody signed in can write, change or delete the record, and each reads only their own',
  t.try(format('INSERT INTO public.attendance_first_marks (timetable_id, attendance_date, period_name, ordinal, marker_profile_id) VALUES (%L, %L, %L, 1, %L)', :'TZ', :'m10', 'P9', :'F9')) = '42501'
  AND t.try(format('UPDATE public.attendance_first_marks SET marker_profile_id = %L', :'F9')) = '42501'
  AND t.try('DELETE FROM public.attendance_first_marks') = '42501'
  AND (SELECT count(*) FROM public.attendance_first_marks) = 1);
RESET ROLE;

-- ── 16. The measurement, target by target (F9, month 10, as the console) ────
SELECT t.login(NULL);
-- F9 teaches course C9 every day from the 1st to the 20th, course C9b on the
-- 3rd, two periods both called 'Period X' on the 21st (only ONE of them
-- marked), and a period with no name on the 22nd. The 5th is a college
-- off-day, the 6th an approved college leave, the 7th a leave still pending
-- (it counts): 18 + 1 + 2 = 21 periods (the nameless one left out).
\set C9b '00000000-0000-0000-0000-0000000c0010'
SELECT t.tt(:'sF9', :'A', :'C9', :'m10', (:'m10'::date + 19)) AS tt9 \gset
SELECT t.tt(:'sF9', :'A', :'C9b', (:'m10'::date + 2), (:'m10'::date + 2)) AS tt9b \gset
SELECT t.tt(:'sF9', :'A', :'C9', (:'m10'::date + 20), (:'m10'::date + 20)) AS tt9d \gset
SELECT t.tt(:'sF9', :'A', :'C9', (:'m10'::date + 21), (:'m10'::date + 21)) AS tt9e \gset
UPDATE public.timetables
   SET periods = '[{"id":"p1","period_name":"Period X","end_time":"10:00"},{"id":"p2","period_name":"Period X","end_time":"11:00"}]',
       timetable_data = (SELECT jsonb_object_agg(k, v || jsonb_build_object('p2', v->'p1')) FROM jsonb_each(timetable_data) e(k, v))
 WHERE id = :'tt9d';
UPDATE public.timetables SET periods = '[{"id":"p1","end_time":"10:00"}]' WHERE id = :'tt9e';
INSERT INTO public.institution_off_days (institution_id, off_date) VALUES (:'A', (:'m10'::date + 4));
INSERT INTO public.institution_leaves (institution_id, leave_type_id, leave_name, start_date, end_date, status, requested_by)
VALUES (:'A', '00000000-0000-0000-0000-0000000001e1', 'Festival', (:'m10'::date + 5), (:'m10'::date + 5), 'approved', :'D'),
       (:'A', '00000000-0000-0000-0000-0000000001e1', 'Maybe', (:'m10'::date + 6), (:'m10'::date + 6), 'pending', :'D');
-- C9: an AI lesson F9 reviewed and published; a draft of F9's own still
-- waiting; a colleague's draft (does not count against F9).
SELECT t.spine(:'C9', :'F9', true);
INSERT INTO public.curriculum_lesson (institution_id, course_id, title, status, source, created_by)
VALUES (:'A', :'C9', 'Colleague draft', 'draft', 'faculty', :'F2');
-- C9b: ONLY a lesson F9 typed and published themselves.
INSERT INTO public.curriculum_lesson (institution_id, course_id, title, status, source, created_by, approved_by, approved_at)
VALUES (:'A', :'C9b', 'Typed', 'published', 'faculty', :'F9', :'F9', now());
-- C9: on time on 15 days, late on the 18th, someone else on the 19th, no
-- marker on the 20th; 11 lessons linked; material on 4 days (the 1st twice);
-- a pulse F9 opened on the 2nd.
SELECT t.teach(:'tt9', :'F9', :'C9', :'m10', ARRAY[1,2,3,4,7,8,9,10,11,12,13,14,15,16,17], ARRAY[18], ARRAY[19], ARRAY[20],
               ARRAY[1,2,3,4,7,8,9,10,11,12,13], ARRAY[1,2,3,4], ARRAY[2]);
-- Material that does not count: switched off (the 7th), posted two days late (the 8th).
INSERT INTO public.session_resource (timetable_id, attendance_date, period_id, title, url, posted_by, is_active)
VALUES (:'tt9', :'m10'::date + 6, 'a1', 'Off', 'https://example.test/o', :'F9', false);
INSERT INTO public.session_resource (timetable_id, attendance_date, period_id, title, url, posted_by, posted_at)
VALUES (:'tt9', :'m10'::date + 7, 'a1', 'Late', 'https://example.test/l', :'F9', ((:'m10'::date + 9) + time '09:00') AT TIME ZONE 'Asia/Kolkata');
-- Pulses that do not count: a placeholder F9 made on the 9th whose class poll
-- was drafted and then closed without ever opening (both rows touched since);
-- one opened automatically (no one's, the 16th); and on the 17th F9's
-- placeholder whose poll the automation opened (the poll is no one's).
INSERT INTO public.scf_live_pulse (id, timetable_id, attendance_date, period_id, created_by, is_open, issued_at, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-0000000f0009', :'tt9', :'m10'::date + 8, 'a1', :'F9', false,
        '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO public.induction_session_poll (context_type, context_id, status, issued_at, created_by, created_at, updated_at)
VALUES ('class_session', '00000000-0000-0000-0000-0000000f0009', 'closed', NULL, :'F9', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO public.scf_live_pulse (timetable_id, attendance_date, period_id, created_by, issued_at)
VALUES (:'tt9', (:'m10'::date + 15), 'a1', NULL, ((:'m10'::date + 15) + time '10:00') AT TIME ZONE 'Asia/Kolkata');
INSERT INTO public.scf_live_pulse (id, timetable_id, attendance_date, period_id, created_by, is_open)
VALUES ('00000000-0000-0000-0000-0000000f0017', :'tt9', :'m10'::date + 16, 'a1', :'F9', false);
INSERT INTO public.induction_session_poll (context_type, context_id, status, issued_at, created_by)
VALUES ('class_session', '00000000-0000-0000-0000-0000000f0017', 'closed', ((:'m10'::date + 16) + time '10:00') AT TIME ZONE 'Asia/Kolkata', NULL);
-- Default z: the 17th's attendance was saved three days AHEAD of the day.
UPDATE public.attendance_first_marks SET first_marked_at = ((:'m10'::date + 13) + time '09:30') AT TIME ZONE 'Asia/Kolkata'
 WHERE timetable_id = :'tt9' AND attendance_date = (:'m10'::date + 16);
-- C9b: marked on time on the 3rd, lesson linked. Period X: one of two marked.
SELECT t.teach(:'tt9b', :'F9', :'C9b', :'m10', ARRAY[3], NULL, NULL, NULL, ARRAY[3], NULL, NULL);
-- C9b's period is 'Period 2' (one teacher cannot take two 'Period 1's at once).
UPDATE public.attendance_first_marks SET period_name = 'Period 2',
       first_marked_at = ((:'m10'::date + 2) + time '10:30') AT TIME ZONE 'Asia/Kolkata' WHERE timetable_id = :'tt9b';
UPDATE public.student_attendance SET attendance_data = jsonb_set(attendance_data, '{a1,period_name}', '"Period 2"') WHERE timetable_id = :'tt9b';
UPDATE public.timetables SET periods = '[{"id":"p1","period_name":"Period 2","start_time":"10:00","end_time":"11:00"}]' WHERE id = :'tt9b';
SELECT t.teach(:'tt9d', :'F9', :'C9', :'m10', ARRAY[21], NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.attendance_first_marks (timetable_id, attendance_date, period_name, ordinal, marker_profile_id, first_marked_at)
VALUES (:'tt9d', :'m10'::date + 20, 'Period X', 1, :'F9', ((:'m10'::date + 20) + time '09:30') AT TIME ZONE 'Asia/Kolkata');
UPDATE public.student_attendance SET attendance_data = jsonb_set(attendance_data, '{a1,period_name}', '"Period X"')
 WHERE timetable_id = :'tt9d';
-- Default dd: tt9 has ended and is switched off; a newer copy of it (a
-- replacement, never marked) covers the same days and period. Each period counts once.
UPDATE public.timetables SET is_active = false WHERE id = :'tt9';
SELECT t.tt(:'sF9', :'A', :'C9', :'m10', (:'m10'::date + 19)) AS tt9r \gset
-- Default ee: pulses opened LATER for past weeks: a direct one for the 10th and
-- a poll for the 11th, both opened on the 26th.
INSERT INTO public.scf_live_pulse (timetable_id, attendance_date, period_id, created_by, is_open, issued_at, created_at)
VALUES (:'tt9', :'m10'::date + 9, 'a1', :'F9', true, ((:'m10'::date + 25) + time '10:00') AT TIME ZONE 'Asia/Kolkata',
        ((:'m10'::date + 25) + time '10:00') AT TIME ZONE 'Asia/Kolkata');
INSERT INTO public.scf_live_pulse (id, timetable_id, attendance_date, period_id, created_by, is_open, issued_at, created_at)
VALUES ('00000000-0000-0000-0000-0000000f0011', :'tt9', :'m10'::date + 10, 'a1', :'F9', false,
        ((:'m10'::date + 25) + time '09:00') AT TIME ZONE 'Asia/Kolkata', ((:'m10'::date + 25) + time '09:00') AT TIME ZONE 'Asia/Kolkata');
INSERT INTO public.induction_session_poll (context_type, context_id, status, issued_at, created_by)
VALUES ('class_session', '00000000-0000-0000-0000-0000000f0011', 'closed', ((:'m10'::date + 25) + time '09:05') AT TIME ZONE 'Asia/Kolkata', :'F9');
\set T '{"t1_marked_by_self_min_pct": 85, "t1_mark_within_hours": 24, "t3_linked_min_pct": 60, "t4_resource_min_pct": 25, "t5_min_pulses_per_week": 1}'
-- Course-weeks (Monday to Sunday) F9 teaches: C9 on 19 named days, C9b on the 3rd.
SELECT (SELECT count(DISTINCT date_trunc('week', :'m10'::date + d - 1))
          FROM unnest(ARRAY[1,2,3,4,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]) d) + 1 AS weeks \gset
CREATE TEMP TABLE m AS SELECT * FROM public.hr_salary_revision_target_measure(:'sF9', :'m10', :'T');
SELECT t.check('T1 leaves out off-days, approved college leaves and nameless periods (not pending leaves); an ended, switched-off timetable still counts, its replacement does not count twice',
  (SELECT denominator = 21 FROM m WHERE target = 't1'), (SELECT denominator::text FROM m WHERE target = 't1'));
SELECT t.check('T1 counts only periods the server stamped as theirs within 24 h of the end and not before the start, each period once: not late, not early, not someone else''s, not unstamped, not a second period of the same name',
  (SELECT numerator = 16 FROM m WHERE target = 't1'), (SELECT numerator::text FROM m WHERE target = 't1'));
SELECT t.check('T1 at 16 of 21 (76%) is below 85%', (SELECT NOT met FROM m WHERE target = 't1'));
SELECT t.check('T2 is not met with their own draft left, or with only a lesson they typed and published themselves',
  (SELECT numerator = 0 AND denominator = 2 AND NOT met FROM m WHERE target = 't2'));
SELECT t.check('T4 counts their own periods with material posted by the end of the day and still on (4 of 21 is below 25%)',
  (SELECT numerator = 4 AND denominator = 21 AND NOT met FROM m WHERE target = 't4'), (SELECT numerator::text FROM m WHERE target = 't4'));
SELECT t.check('T5 counts only pulses they opened in that week: not a poll drafted and closed, not one the automation opened, not one opened later for a past week',
  (SELECT numerator = 1 AND denominator = :'weeks'::int AND NOT met FROM m WHERE target = 't5'),
  (SELECT numerator || '/' || denominator || ' expected 1/' || :'weeks' FROM m WHERE target = 't5'));
-- Fix most of it: the 18th marked on time, F9's own C9 draft approved (the
-- colleague's draft stays), two more posts, a pulse on every day taught.
UPDATE public.attendance_first_marks SET first_marked_at = ((:'m10'::date + 17) + time '09:30') AT TIME ZONE 'Asia/Kolkata'
 WHERE timetable_id = :'tt9' AND attendance_date = (:'m10'::date + 17);
-- The 17th marked again on its own day, during the session: counts.
UPDATE public.attendance_first_marks SET first_marked_at = ((:'m10'::date + 16) + time '09:30') AT TIME ZONE 'Asia/Kolkata'
 WHERE timetable_id = :'tt9' AND attendance_date = (:'m10'::date + 16);
-- The 9th's poll is opened (then closed again): that week counts through the poll alone.
UPDATE public.induction_session_poll SET issued_at = ((:'m10'::date + 8) + time '10:00') AT TIME ZONE 'Asia/Kolkata', status = 'closed'
 WHERE context_id = '00000000-0000-0000-0000-0000000f0009';
UPDATE public.curriculum_lesson SET status = 'published', approved_by = :'F9' WHERE course_id = :'C9' AND status = 'draft' AND created_by = :'F9';
SELECT t.teach(:'tt9', :'F9', :'C9', :'m10', NULL, NULL, NULL, NULL, NULL, ARRAY[9, 10],
               (SELECT array_agg(d) FROM unnest(ARRAY[1,2,3,4,7,8,9,10,11,12,13,14,15,16,17,18,19,20]) d
                 WHERE date_trunc('week', :'m10'::date + d - 1) <> date_trunc('week', :'m10'::date + 8)));
SELECT t.teach(:'tt9b', :'F9', :'C9b', :'m10', NULL, NULL, NULL, NULL, NULL, NULL, ARRAY[3]);
SELECT t.teach(:'tt9d', :'F9', :'C9', :'m10', NULL, NULL, NULL, NULL, NULL, NULL, ARRAY[21]);
-- Material for the one marked 'Period X' on the 21st: it is that period's, not both.
INSERT INTO public.session_resource (timetable_id, attendance_date, period_id, title, url, posted_by)
VALUES (:'tt9d', :'m10'::date + 20, 'a1', 'X notes', 'https://example.test/x', :'F9');
-- A direct pulse closed afterwards still counts (the week of the 16th).
UPDATE public.scf_live_pulse SET is_open = false, updated_at = now()
 WHERE created_by = :'F9' AND date_trunc('week', attendance_date) = date_trunc('week', :'m10'::date + 15)
   AND NOT EXISTS (SELECT 1 FROM public.induction_session_poll ip WHERE ip.context_id = scf_live_pulse.id);
DROP TABLE m;
CREATE TEMP TABLE m AS SELECT * FROM public.hr_salary_revision_target_measure(:'sF9', :'m10', :'T');
SELECT t.check('T1 at 18 of 21 (86%) is met: a marking during the session counts', (SELECT numerator = 18 AND met FROM m WHERE target = 't1'));
SELECT t.check('T2: a colleague''s draft does not count against them; a self-typed lesson still does not count',
  (SELECT numerator = 1 AND denominator = 2 AND NOT met FROM m WHERE target = 't2'));
SELECT t.check('T3 is counted only once T2 is met: 11 of 17 linked on the approved course, still not met',
  (SELECT numerator = 11 AND denominator = 17 AND NOT met FROM m WHERE target = 't3'), (SELECT numerator || '/' || denominator FROM m WHERE target = 't3'));
SELECT t.check('T4 at 7 of 21 (33%) is met: material for one of two same-named periods counts once',
  (SELECT numerator = 7 AND met FROM m WHERE target = 't4'), (SELECT numerator::text FROM m WHERE target = 't4'));
SELECT t.check('T5 is met with a pulse they opened in every course-week (one week only through a poll that reached open, one only through direct pulses closed since)',
  (SELECT numerator = :'weeks'::int AND met FROM m WHERE target = 't5'));
INSERT INTO public.curriculum_lesson (institution_id, course_id, title, status, source, created_by, approved_by, approved_at)
VALUES (:'A', :'C9b', 'AI lesson', 'published', 'title_ai', :'F9', :'F9', now());
DROP TABLE m;
CREATE TEMP TABLE m AS SELECT * FROM public.hr_salary_revision_target_measure(:'sF9', :'m10', :'T');
SELECT t.check('T2 is met once they reviewed a lesson they did not write for each course', (SELECT numerator = 2 AND met FROM m WHERE target = 't2'));
SELECT t.check('T3 at 12 of 18 (67%) is met once T2 is met',
  (SELECT numerator = 12 AND denominator = 18 AND met FROM m WHERE target = 't3'), (SELECT numerator || '/' || denominator FROM m WHERE target = 't3'));
-- Default ii: F9's own approved leave on the 19th (a day a colleague marked):
-- that period leaves T1's and T4's counts; a pending leave would not.
INSERT INTO public.hr_leave_applications (employee_id, start_date, end_date, status)
VALUES (:'sF9', :'m10'::date + 18, :'m10'::date + 18, 'approved'), (:'sF9', :'m10'::date + 13, :'m10'::date + 13, 'pending');
DROP TABLE m;
CREATE TEMP TABLE m AS SELECT * FROM public.hr_salary_revision_target_measure(:'sF9', :'m10', :'T');
SELECT t.check('the teacher''s own approved leave days leave the counts (not pending leave)',
  (SELECT denominator = 20 AND numerator = 18 FROM m WHERE target = 't1') AND (SELECT denominator = 20 FROM m WHERE target = 't4'),
  (SELECT numerator || '/' || denominator FROM m WHERE target = 't1'));
DELETE FROM public.hr_leave_applications WHERE employee_id = :'sF9';
SELECT t.check('a month with no classes has nothing to count',
  (SELECT bool_and(denominator = 0 AND NOT met) FROM public.hr_salary_revision_target_measure(:'sF9', :'m9', :'T')));

-- ── 17. Default x: the person leaves before the start date ──────────────────
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT public.fn_hr_salary_revision_director_decide(:'req_f10b', true) AS f10b_yes \gset
RESET ROLE;
SELECT t.login(NULL);
SELECT starts_on AS f10b_start FROM public.hr_salary_revision_requests WHERE id = :'req_f10b' \gset
SELECT t.check('the second raise for F10 is split and waiting for targets',
  (SELECT state = 'waiting' AND held_amount > 0 FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f10b'));
UPDATE public.staff SET is_active = false WHERE id = :'sF10';
SELECT public.hr_salary_revision_apply_due_on(:'f10b_start') AS f10b_run \gset
SELECT t.check('someone who leaves before the start date: the raise is cancelled and its held part lapses, listed',
  (SELECT status = 'cancelled' FROM public.hr_salary_revision_requests WHERE id = :'req_f10b')
  AND (SELECT state = 'lapsed' AND state_reason = 'left_before_start' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f10b'),
  (SELECT state || ' ' || COALESCE(state_reason, '') FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f10b'));

-- ── 18. Teaches, but the setting has no faculty targets (fails closed) ──────
UPDATE public.platform_policies SET value = value #- '{role_targets,faculty}' WHERE policy_key = :'KEY';
SELECT t.tt(:'sF12', :'A', '00000000-0000-0000-0000-0000000c0015', public.hr_salary_revision_ist_today() - 30, public.hr_salary_revision_ist_today() - 1) AS tt12 \gset
UPDATE public.timetables SET created_at = now() - interval '200 days' WHERE id = :'tt12';
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sF12', 34000, 'Teaches, no set') AS req_f12 \gset
SELECT t.login(:'D');
SELECT public.fn_hr_salary_revision_director_decide(:'req_f12', true) AS f12_yes \gset
RESET ROLE;
SELECT t.login(NULL);
SELECT t.check('someone who teaches while the setting has no faculty targets gets no target-based part (listed)',
  (SELECT state = 'held_listed' AND state_reason = 'no_targets_for_role' FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f12'),
  (SELECT state || ' ' || COALESCE(state_reason, '') FROM public.hr_salary_revision_target_plans WHERE request_id = :'req_f12'));
