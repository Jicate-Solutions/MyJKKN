-- Salary revision rehearsal: every check runs AS ROLE authenticated (or anon)
-- with the persona's id in request.jwt.claims, exactly as PostgREST calls it.
-- Each line prints PASS <rule> or FAIL <rule>. run.sh counts them, and each
-- mutation control looks for the one FAIL its removed rule must produce.
\set ON_ERROR_STOP 0
\set D   '00000000-0000-0000-0000-000000010001'
\set H   '00000000-0000-0000-0000-000000010002'
\set PA  '00000000-0000-0000-0000-000000010003'
\set PB  '00000000-0000-0000-0000-000000010004'
\set HA  '00000000-0000-0000-0000-000000010005'
\set F1  '00000000-0000-0000-0000-000000010011'
\set F2  '00000000-0000-0000-0000-000000010012'
\set F4  '00000000-0000-0000-0000-000000010014'
\set F6  '00000000-0000-0000-0000-000000010016'
\set sD  '00000000-0000-0000-0000-000000020001'
\set sPA '00000000-0000-0000-0000-000000020003'
\set sHA '00000000-0000-0000-0000-000000020005'
\set sF1 '00000000-0000-0000-0000-000000020011'
\set sF2 '00000000-0000-0000-0000-000000020012'
\set sF3 '00000000-0000-0000-0000-000000020013'
\set sF4 '00000000-0000-0000-0000-000000020014'
\set sF5 '00000000-0000-0000-0000-000000020015'
\set sF6 '00000000-0000-0000-0000-000000020016'
\set sX  '00000000-0000-0000-0000-000000020017'
\set OB  '00000000-0000-0000-0000-000000000eb2'

-- ── 0. The data grant (ruling 1), read as postgres ──────────────────────────
SELECT t.check('migration grants the ask keys to principal, hod and hr_head only',
  (SELECT bool_and(CASE role_key
     WHEN 'principal' THEN (permissions->>'hr.payroll.salary_revision.ask_own_college')::boolean IS TRUE AND (permissions->>'hr.payroll.salary_revision.college_check')::boolean IS TRUE
     WHEN 'hod'       THEN (permissions->>'hr.payroll.salary_revision.ask_own_department')::boolean IS TRUE
     WHEN 'hr_head'   THEN (permissions->>'hr.payroll.salary_revision.ask_anyone')::boolean IS TRUE
     ELSE permissions->>'hr.payroll.salary_revision.ask' IS NULL END)
     FROM public.custom_roles));
SELECT t.check('nobody is granted hr.payroll.salary_revision.approve',
  NOT EXISTS (SELECT 1 FROM public.custom_roles WHERE permissions ? 'hr.payroll.salary_revision.approve'));

-- ── 1. anon ─────────────────────────────────────────────────────────────────
SET ROLE anon;
SELECT t.login(NULL);
SELECT t.check('anon cannot run the ask function',
  t.try(format('SELECT public.fn_hr_salary_revision_propose(%L, 1, %L)', :'sF1', 'x')) = '42501'
  AND NOT has_function_privilege('anon', 'public.fn_hr_salary_revision_propose(uuid, numeric, text)', 'EXECUTE'));
SELECT t.check('anon cannot list people', t.try('SELECT * FROM public.fn_hr_salary_revision_people()') = '42501');
SELECT t.check('anon cannot read requests', t.try('SELECT * FROM public.hr_salary_revision_requests') = '42501');
RESET ROLE;
SELECT t.check('anon holds EXECUTE on none of the new functions',
  NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
               AND (p.proname LIKE '%salary_revision%' OR p.proname = 'hr_staff_salaries_in_force')
               AND has_function_privilege('anon', p.oid, 'EXECUTE')));
SELECT t.check('signed-in users cannot call the internal functions',
  NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
               AND p.proname IN ('fn_hr_salary_revision_my_department_ids', 'hr_salary_revision_user_holds', 'hr_salary_revision_user_tier', 'hr_salary_revision_notify',
                                 'hr_salary_revision_start_date', 'hr_salary_revision_approve_one', 'hr_salary_revision_apply_due_on',
                                 'hr_salary_revision_suggestion_inputs', 'fn_hr_salary_revision_weekly_digest')
               AND has_function_privilege('authenticated', p.oid, 'EXECUTE')));

-- ── 2. HOD of department A1 ─────────────────────────────────────────────────
SET ROLE authenticated;
SELECT t.login(:'HA');
SELECT t.check('HOD sees only own department people (F1, F4, PA, self)',
  (SELECT array_agg(staff_code ORDER BY staff_code) FROM public.fn_hr_salary_revision_people())
    = ARRAY['F11', 'F14', 'H05', 'P03']);
SELECT public.fn_hr_salary_revision_propose(:'sF1', 50000, 'Strong results this year') AS req_f1 \gset
SELECT t.check('HOD request goes to the principal first',
  (SELECT route = 'via_principal' AND status = 'waiting_principal' AND asked_as = 'hod'
     FROM public.hr_salary_revision_requests WHERE id = :'req_f1'));
SELECT t.check('HOD cannot ask outside own department',
  t.try(format('SELECT public.fn_hr_salary_revision_propose(%L, 45000, %L)', :'sF2', 'x')) = '42501');
SELECT t.check('HOD cannot ask for another college',
  t.try(format('SELECT public.fn_hr_salary_revision_propose(%L, 55000, %L)', :'sF3', 'x')) = '42501');
SELECT t.check('nobody can ask for a person outside HR',
  t.try(format('SELECT public.fn_hr_salary_revision_propose(%L, 25000, %L)', :'sX', 'x')) = 'P0002');
SELECT t.check('a blank reason is refused',
  t.try(format('SELECT public.fn_hr_salary_revision_propose(%L, 55000, %L)', :'sF4', '   ')) = '22023');
SELECT public.fn_hr_salary_revision_propose(:'sF4', 55000, 'Took over the second lab section') AS req_f4 \gset
SELECT public.fn_hr_salary_revision_propose(:'sHA', 85000, 'Asking for my own revision') AS req_self \gset
SELECT public.fn_hr_salary_revision_propose(:'sPA', 125000, 'The principal carries two colleges now') AS req_senior \gset
SELECT t.check('asking for oneself is flagged', (SELECT is_self AND NOT is_for_senior FROM public.hr_salary_revision_requests WHERE id = :'req_self'));
SELECT t.check('asking for a senior is flagged and skips the principal',
  (SELECT is_for_senior AND route = 'direct' AND status = 'waiting_director' FROM public.hr_salary_revision_requests WHERE id = :'req_senior'));
SELECT t.check('HOD cannot give the final yes',
  t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_f1')) = '42501');
SELECT t.check('HOD cannot do the principal''s check',
  t.try(format('SELECT public.fn_hr_salary_revision_college_decide(%L, true)', :'req_f1')) = '42501');
SELECT t.check('HOD cannot open the Director''s list', t.try('SELECT * FROM public.fn_hr_salary_revision_list(''director'')') = '42501');
SELECT t.check('HOD cannot write the table directly',
  t.try(format('UPDATE public.hr_salary_revision_requests SET status = %L WHERE id = %L', 'approved', :'req_f1')) = '42501'
  AND t.try(format('INSERT INTO public.hr_salary_revision_comments (request_id, author_id, body) VALUES (%L, %L, %L)', :'req_f1', :'HA', 'x')) = '42501');
SELECT t.check('HOD cannot read pay outside the workflow', (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id <> :'sHA') = 0);
SELECT t.check('HOD sees the four requests they asked', (SELECT count(*) FROM public.hr_salary_revision_requests) = 4);

-- ── 3. Principal of college A ───────────────────────────────────────────────
SELECT t.login(:'PA');
SELECT t.check('principal sees own college people only',
  (SELECT bool_and(institution_name = 'College A') AND count(*) = 8 FROM public.fn_hr_salary_revision_people()));
SELECT t.check('a second request for a person is refused while one is open',
  t.try(format('SELECT public.fn_hr_salary_revision_propose(%L, 51000, %L)', :'sF1', 'x')) = '23505');
SELECT t.check('principal cannot ask for another college',
  t.try(format('SELECT public.fn_hr_salary_revision_propose(%L, 55000, %L)', :'sF3', 'x')) = '42501');
SELECT t.check('the second asker can comment on the waiting request',
  t.try(format('SELECT public.fn_hr_salary_revision_comment(%L, %L)', :'req_f1', 'I support this')) = 'ok');
SELECT public.fn_hr_salary_revision_propose(:'sF2', 45000, 'Covers the evening batch') AS req_f2 \gset
SELECT t.check('principal request goes straight to the Director',
  (SELECT route = 'direct' AND status = 'waiting_director' AND asked_as = 'principal' FROM public.hr_salary_revision_requests WHERE id = :'req_f2'));
SELECT t.check('principal cannot see a request about their own pay',
  NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_requests WHERE id = :'req_senior')
  AND (SELECT public.fn_hr_salary_revision_get(:'req_senior')) IS NULL);
SELECT t.check('principal sees the college''s other requests', (SELECT count(*) FROM public.hr_salary_revision_requests) = 4);
SELECT t.check('principal''s check list has the three HOD requests',
  (SELECT count(*) FROM public.fn_hr_salary_revision_list('college')) = 3);
SELECT t.login(:'PB');
SELECT t.check('other college principal cannot check',
  t.try(format('SELECT public.fn_hr_salary_revision_college_decide(%L, true)', :'req_f1')) = '42501'
  );
SELECT t.login(:'PA');
SELECT t.check('principal cannot approve',
  t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_f2')) = '42501');
SELECT t.check('stopping needs a reason',
  t.try(format('SELECT public.fn_hr_salary_revision_college_decide(%L, false, %L)', :'req_self', '')) = '22023');
SELECT t.check('principal agrees: the request goes to the Director',
  public.fn_hr_salary_revision_college_decide(:'req_f1', true, 'Agreed') = 'waiting_director');
SELECT t.check('principal agrees on the second one', public.fn_hr_salary_revision_college_decide(:'req_f4', true) = 'waiting_director');
SELECT t.check('principal stops the HOD''s own request with a reason',
  public.fn_hr_salary_revision_college_decide(:'req_self', false, 'Wait for the appraisal') = 'stopped');

-- ── 4. Principal of college B ───────────────────────────────────────────────
SELECT t.login(:'PB');
SELECT t.check('another college''s principal sees none of college A''s requests', (SELECT count(*) FROM public.hr_salary_revision_requests) = 0);
SELECT public.fn_hr_salary_revision_propose(:'sF5', 65000, 'Placement results') AS req_f5b \gset

-- ── 5. HR head ──────────────────────────────────────────────────────────────
SELECT t.login(:'H');
SELECT t.check('HR head may ask for anyone (both colleges listed)',
  (SELECT count(DISTINCT institution_id) FROM public.fn_hr_salary_revision_people()) = 2);
SELECT public.fn_hr_salary_revision_propose(:'sF3', 52000, 'Market rate for the role') AS req_f3 \gset
SELECT public.fn_hr_salary_revision_propose(:'sF6', 30000, 'Moved to half-time at their request') AS req_cut \gset
SELECT t.check('HR head request goes straight to the Director',
  (SELECT route = 'direct' AND asked_as = 'hr_head' FROM public.hr_salary_revision_requests WHERE id = :'req_f3'));
SELECT t.check('a pay cut is marked', (SELECT is_cut FROM public.hr_salary_revision_requests WHERE id = :'req_cut'));
SELECT t.check('HR head cannot give the final yes',
  t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_f3')) = '42501');

-- ── 6. A team member ────────────────────────────────────────────────────────
SELECT t.login(:'F1');
SELECT t.check('team member cannot see requests about anyone, even themselves',
  (SELECT count(*) FROM public.hr_salary_revision_requests) = 0
  AND (SELECT count(*) FROM public.hr_salary_revision_comments) = 0
  AND (SELECT count(*) FROM public.fn_hr_salary_revision_list('all')) = 0);
SELECT t.check('team member cannot ask', t.try('SELECT * FROM public.fn_hr_salary_revision_people()') = '42501');
SELECT t.check('team member has no outcome before a yes', (SELECT count(*) FROM public.hr_salary_revision_outcomes) = 0);

-- ── 7. The Director ─────────────────────────────────────────────────────────
-- Payroll is already working on NEXT month for college B: a live register.
RESET ROLE;
INSERT INTO public.hr_salary_register_runs (hr_organization_id, period_year, period_month)
VALUES (:'OB', EXTRACT(YEAR FROM (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '1 month'))::int,
               EXTRACT(MONTH FROM (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '1 month'))::int);
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the Director''s list shows everything', (SELECT count(*) FROM public.fn_hr_salary_revision_list('director')) = 8);
SELECT t.check('saying no needs a reason',
  t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, false)', :'req_f4')) = '22023');
SELECT t.check('the Director says no with a reason',
  public.fn_hr_salary_revision_director_decide(:'req_f4', false, NULL, 'The budget for this year is closed') = 'refused');
SELECT t.check('the Director approves with a changed amount',
  public.fn_hr_salary_revision_director_decide(:'req_f1', true, 52500) = 'approved');
SELECT t.check('approved raise starts on the 1st of next month, at his figure',
  (SELECT final_monthly_gross = 52500 AND asked_monthly_gross = 50000
          AND starts_on = (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '1 month')::date
     FROM public.hr_salary_revision_requests WHERE id = :'req_f1'));
SELECT t.check('a batch with one request no longer waiting approves nothing',
  t.try(format('SELECT public.fn_hr_salary_revision_director_approve_many(ARRAY[%L, %L]::uuid[])', :'req_f3', :'req_f4')) = '55000'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_f3') = 'waiting_director');
SELECT t.check('bulk approve approves every ticked request',
  public.fn_hr_salary_revision_director_approve_many(ARRAY[:'req_f3', :'req_f5b']::uuid[]) = 2);
SELECT t.check('a month payroll is already working on is skipped',
  (SELECT bool_and(starts_on = (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '2 month')::date)
     FROM public.hr_salary_revision_requests WHERE id IN (:'req_f3', :'req_f5b')));
SELECT t.check('the Director approves the pay cut', public.fn_hr_salary_revision_director_decide(:'req_cut', true) = 'approved');
SELECT t.check('the approved pay cut stays marked as a cut',
  (SELECT final_is_cut AND is_cut FROM public.hr_salary_revision_requests WHERE id = :'req_cut'));
SELECT t.check('a decided request takes no more comments',
  t.try(format('SELECT public.fn_hr_salary_revision_comment(%L, %L)', :'req_f1', 'late')) = '55000');

-- ── 8. Who sees the reason for a no (ruling 14) ─────────────────────────────
SELECT t.login(:'HA');
SELECT t.check('the asker sees the reason for the no',
  (SELECT count(*) FROM public.hr_salary_revision_decision_notes WHERE request_id = :'req_f4') = 1
  AND (public.fn_hr_salary_revision_get(:'req_f4') -> 'decision_note' ->> 'reason') = 'The budget for this year is closed');
SELECT t.check('the HOD sees why the principal stopped it',
  (SELECT count(*) FROM public.hr_salary_revision_decision_notes WHERE request_id = :'req_self') = 1);
SELECT t.check('HOD does not see requests from outside their department',
  NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_requests WHERE staff_id IN (:'sF2', :'sF3', :'sF5', :'sF6')));
SELECT t.check('the asker sees the Director''s figure',
  (SELECT final_monthly_gross FROM public.hr_salary_revision_requests WHERE id = :'req_f1') = 52500);
SELECT t.login(:'PA');
SELECT t.check('the principal sees the reason for a no on an HOD''s request',
  (SELECT count(*) FROM public.hr_salary_revision_decision_notes WHERE request_id = :'req_f4') = 1);
SELECT t.login(:'H');
SELECT t.check('HR head sees the refused request but not the reason',
  (SELECT count(*) FROM public.hr_salary_revision_requests WHERE id = :'req_f4') = 1
  AND (SELECT count(*) FROM public.hr_salary_revision_decision_notes) = 0
  AND (public.fn_hr_salary_revision_get(:'req_f4') -> 'decision_note') = 'null'::jsonb);
SELECT t.login(:'F4');
SELECT t.check('the person is never told about a no',
  (SELECT count(*) FROM public.hr_salary_revision_requests) = 0
  AND (SELECT count(*) FROM public.hr_salary_revision_decision_notes) = 0
  AND (SELECT count(*) FROM public.hr_salary_revision_outcomes) = 0);

-- ── 9. Told only after a yes (ruling 5) ─────────────────────────────────────
SELECT t.login(:'F1');
SELECT t.check('the person sees their own outcome after the yes',
  (SELECT count(*) = 1 AND bool_and(new_monthly_gross = 52500 AND previous_monthly_gross = 48000 AND NOT is_cut)
     FROM public.hr_salary_revision_outcomes));
SELECT t.check('the person cannot see anybody else''s outcome',
  (SELECT count(*) FROM public.hr_salary_revision_outcomes WHERE staff_id <> :'sF1') = 0);
RESET ROLE;
SELECT t.check('the person got one in-app notice, about the new pay',
  (SELECT count(*) = 1 AND bool_and(n.title = 'Your monthly pay is changing' AND n.body LIKE '%₹52,500%')
     FROM public.user_notifications u JOIN public.notifications n ON n.id = u.notification_id
    WHERE u.user_id = :'F1'));
SELECT t.check('nobody tells the person about a no', NOT EXISTS (SELECT 1 FROM public.user_notifications WHERE user_id = :'F4'));
SELECT t.check('the pay cut notice says it is a cut',
  EXISTS (SELECT 1 FROM public.user_notifications u JOIN public.notifications n ON n.id = u.notification_id
           WHERE u.user_id = :'F6' AND n.body LIKE '%pay cut%'));
SELECT t.check('the HOD was told of the yes (with the changed figure), the no and the stop',
  (SELECT count(*) FROM public.user_notifications u JOIN public.notifications n ON n.id = u.notification_id
    WHERE u.user_id = :'HA') = 3
  AND EXISTS (SELECT 1 FROM public.user_notifications u JOIN public.notifications n ON n.id = u.notification_id
               WHERE u.user_id = :'HA' AND n.body LIKE '%you asked for ₹50,000%'));
SELECT t.check('the principal was asked to check the three HOD requests',
  (SELECT count(*) FROM public.user_notifications u JOIN public.notifications n ON n.id = u.notification_id
    WHERE u.user_id = :'PA' AND n.title = 'A salary revision needs your check') = 3);

-- ── 10. The new pay is written on its start date, not before ────────────────
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.check('an approved raise still counts as open (no second request)',
  t.try(format('SELECT public.fn_hr_salary_revision_propose(%L, 60000, %L)', :'sF1', 'x')) = '23505');
SELECT t.login(:'F1');
SELECT t.check('a team member cannot run the apply step', t.try('SELECT public.fn_hr_salary_revision_apply_due()') = '42501');
SELECT t.login(:'D');
SELECT t.check('nothing is written before the start date', public.fn_hr_salary_revision_apply_due() = 0);
RESET ROLE;
SELECT t.check('the pay in force is unchanged the day after the yes',
  (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL) = 48000);
SELECT public.hr_salary_revision_ist_today() AS today,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '1 month')::date AS start1,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '2 month')::date AS start2,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '1 month' - interval '1 day')::date AS month_end,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '2 month' - interval '1 day')::date AS next_month_end \gset
SELECT t.check('on the start date the two raises due are written', public.hr_salary_revision_apply_due_on(:'start1') = 2);
SELECT t.check('running it again writes nothing more', public.hr_salary_revision_apply_due_on(:'start1') = 0);
SELECT t.check('the written row starts on the 1st and keeps who pays, PF and the allowance',
  (SELECT effective_from = :'start1'::date AND monthly_gross = 52500 AND eligible_for_pf AND epf_amount = 1800
          AND allowance_amount = 2500 AND allowance_label = 'Conveyance' AND notes LIKE '%request%'
          AND hr_organization_id = '00000000-0000-0000-0000-000000000ea1'
     FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL));
SELECT t.check('the request is marked applied, pointing at the new row',
  (SELECT r.status = 'applied' AND r.applied_salary_id = s.id
     FROM public.hr_salary_revision_requests r JOIN public.hr_staff_salaries s ON s.staff_id = r.staff_id AND s.superseded_by IS NULL
    WHERE r.id = :'req_f1'));
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.check('this month''s register still reads the old pay after the raise is written',
  (SELECT monthly_gross FROM public.hr_staff_salaries_in_force(ARRAY[:'sF1']::uuid[], :'month_end')) = 48000);
SELECT t.check('next month''s register reads the new pay',
  (SELECT monthly_gross FROM public.hr_staff_salaries_in_force(ARRAY[:'sF1']::uuid[], :'next_month_end')) = 52500);
SELECT t.check('the in-force read walks further back through history',
  (SELECT monthly_gross FROM public.hr_staff_salaries_in_force(ARRAY[:'sF1']::uuid[], '2026-01-31')) = 45000);
SELECT t.check('the old register read (current row) would have given this month the new pay',
  (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL) = 52500);
SELECT t.check('people with no future-dated row read exactly as before',
  (SELECT count(*) FROM public.hr_staff_salaries_in_force(ARRAY[:'sF2', :'sF3', :'sF5']::uuid[], :'month_end')) = 3
  AND (SELECT bool_and(i.id = s.id) FROM public.hr_staff_salaries_in_force(ARRAY[:'sF2', :'sF3', :'sF5']::uuid[], :'month_end') i
         JOIN public.hr_staff_salaries s ON s.staff_id = i.staff_id AND s.superseded_by IS NULL));
SELECT t.login(:'HA');
SELECT t.check('the in-force read keeps the caller''s own RLS (HOD reads only their own pay)',
  (SELECT count(*) FROM public.hr_staff_salaries_in_force(ARRAY[:'sF1', :'sHA']::uuid[], :'month_end')) = 1);
RESET ROLE;
SELECT t.check('the college B raises wait for the month after',
  public.hr_salary_revision_apply_due_on(:'start2') = 2);

-- ── 11. The database enforces one open request ──────────────────────────────
SELECT t.check('the unique index refuses a second open request even without the function',
  t.try(format($q$INSERT INTO public.hr_salary_revision_requests (staff_id, institution_id, asked_by, asked_as, route,
     current_monthly_gross, asked_monthly_gross, reason, status)
     SELECT staff_id, institution_id, asked_by, asked_as, route, current_monthly_gross, 99999, 'dup', status
       FROM public.hr_salary_revision_requests WHERE id = %L$q$, :'req_f2')) = '23505');

-- ── 12. The weekly reminder ─────────────────────────────────────────────────
SELECT t.login(NULL);
SELECT t.check('the weekly reminder counts everything waiting', public.fn_hr_salary_revision_weekly_digest() = 2);
SELECT t.check('it reaches the Director once, even when run twice',
  public.fn_hr_salary_revision_weekly_digest() = 2
  AND (SELECT count(*) FROM public.user_notifications u JOIN public.notifications n ON n.id = u.notification_id
        WHERE u.user_id = :'D' AND n.title = 'Salary revisions waiting for you') = 1);
SELECT t.check('nothing was approved by the reminder',
  (SELECT count(*) FROM public.hr_salary_revision_requests WHERE status = 'waiting_director') = 2);
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('a signed-in user cannot send the reminder', t.try('SELECT public.fn_hr_salary_revision_weekly_digest()') = '42501');
RESET ROLE;
