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
\set S   '00000000-0000-0000-0000-000000010006'
\set F7  '00000000-0000-0000-0000-000000010018'
\set sF7 '00000000-0000-0000-0000-000000020018'
\set OB  '00000000-0000-0000-0000-000000000eb2'

-- 7 Oct 2026 (target-gated raises, 20271007180207, stacked on this PR): the
-- pay written on the start date is the pay at the yes plus the annual
-- increment (the set percent of it, or the whole raise if smaller); the rest
-- is held. Worked out here from the setting itself, not from what the code
-- wrote. Without that file (this PR alone) there is no setting and the whole
-- figure is written, as before.
CREATE OR REPLACE FUNCTION t.on_start(p_base numeric, p_final numeric) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN p_final <= p_base THEN p_final
              ELSE p_base + LEAST(round(p_base * COALESCE(
                     (SELECT (value->>'annual_increment_percent')::numeric FROM public.platform_policies
                       WHERE policy_key = 'hr.salary_revision.target_rules' AND scope_type = 'global' AND is_active),
                     100) / 100), p_final - p_base) END
$$;
GRANT EXECUTE ON FUNCTION t.on_start(numeric, numeric) TO anon, authenticated;
-- 7 Oct 2026: one held raise at a time. Before a second raise for the same
-- person, the Director lapses the earlier held part (here as the console;
-- nobody's pay changes). Without that file there is nothing to lapse.
CREATE OR REPLACE FUNCTION t.lapse_open_held(p_staff uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('public.hr_salary_revision_target_plans') IS NOT NULL THEN
    EXECUTE 'UPDATE public.hr_salary_revision_target_plans SET state = ''lapsed'', state_reason = ''lapsed_by_director'''
         || ' WHERE staff_id = $1 AND state NOT IN (''none'', ''lapsed'')' USING p_staff;
  END IF;
END $$;

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
SELECT t.check('HOD sees only own department people (F1, F4, F7, PA, self)',
  (SELECT array_agg(staff_code ORDER BY staff_code) FROM public.fn_hr_salary_revision_people())
    = ARRAY['F11', 'F14', 'F18', 'H05', 'P03']);
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
-- 1 Oct 2026: a second A1 request for the principal's check, which the
-- principal stops (the HOD's own request no longer goes to the principal).
SELECT public.fn_hr_salary_revision_propose(:'sF7', 23000, 'Runs the lab on Saturdays') AS req_f7h \gset
SELECT t.check('asking for oneself is flagged', (SELECT is_self AND NOT is_for_senior FROM public.hr_salary_revision_requests WHERE id = :'req_self'));
SELECT t.check('an HOD''s own raise goes straight to the Director',
  (SELECT route = 'direct' AND status = 'waiting_director' AND asked_as = 'hod' AND is_self
     FROM public.hr_salary_revision_requests WHERE id = :'req_self')
  AND (SELECT route = 'via_principal' AND status = 'waiting_principal' FROM public.hr_salary_revision_requests WHERE id = :'req_f7h'),
  (SELECT route || ' | ' || status FROM public.hr_salary_revision_requests WHERE id = :'req_self'));
SELECT t.check('the HOD cannot decide their own raise',
  t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_self')) = '42501'
  AND t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, false, NULL, %L)', :'req_self', 'no')) = '42501'
  AND t.try(format('SELECT public.fn_hr_salary_revision_college_decide(%L, true)', :'req_self')) = '42501'
  AND t.try(format('SELECT public.fn_hr_salary_revision_director_approve_many(ARRAY[%L]::uuid[])', :'req_self')) = '42501'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_self') = 'waiting_director');
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
SELECT t.check('HOD sees the five requests they asked', (SELECT count(*) FROM public.hr_salary_revision_requests) = 5);

-- ── 3. Principal of college A ───────────────────────────────────────────────
SELECT t.login(:'PA');
SELECT t.check('principal sees own college people only',
  (SELECT bool_and(institution_name = 'College A') AND count(*) = 9 FROM public.fn_hr_salary_revision_people()));
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
SELECT t.check('principal sees the college''s other requests', (SELECT count(*) FROM public.hr_salary_revision_requests) = 5);
SELECT t.check('principal''s check list has the three HOD requests (not the HOD''s own)',
  (SELECT count(*) FROM public.fn_hr_salary_revision_list('college')) = 3);
SELECT t.login(:'PB');
SELECT t.check('other college principal cannot check',
  t.try(format('SELECT public.fn_hr_salary_revision_college_decide(%L, true)', :'req_f1')) = '42501'
  );
SELECT t.login(:'PA');
SELECT t.check('principal cannot approve',
  t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_f2')) = '42501');
SELECT t.check('a principal cannot decide an HOD''s own raise',
  t.try(format('SELECT public.fn_hr_salary_revision_college_decide(%L, true)', :'req_self')) = '55000'
  AND t.try(format('SELECT public.fn_hr_salary_revision_college_decide(%L, false, %L)', :'req_self', 'no')) = '55000'
  AND t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_self')) = '42501'
  AND t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, false, NULL, %L)', :'req_self', 'no')) = '42501'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_self') = 'waiting_director');
SELECT t.check('stopping needs a reason',
  t.try(format('SELECT public.fn_hr_salary_revision_college_decide(%L, false, %L)', :'req_f7h', '')) = '22023');
SELECT t.check('principal agrees: the request goes to the Director',
  public.fn_hr_salary_revision_college_decide(:'req_f1', true, 'Agreed') = 'waiting_director');
SELECT t.check('principal agrees on the second one', public.fn_hr_salary_revision_college_decide(:'req_f4', true) = 'waiting_director');
SELECT t.check('principal stops an HOD request with a reason',
  public.fn_hr_salary_revision_college_decide(:'req_f7h', false, 'Wait for the appraisal') = 'stopped');
-- 30 Sep: PA sits in department A1, so for an A1 person PA is principal AND
-- the head of the department: no separate check, straight to the Director, marked.
SELECT public.fn_hr_salary_revision_propose(:'sF7', 24000, 'Joined last year and already runs the lab') AS req_f7 \gset
SELECT t.check('a principal who is also the head of the department goes straight to the Director, marked',
  (SELECT asker_is_also_hod AND route = 'direct' AND status = 'waiting_director'
     FROM public.hr_salary_revision_requests WHERE id = :'req_f7')
  AND (SELECT NOT asker_is_also_hod FROM public.hr_salary_revision_requests WHERE id = :'req_f2'));

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
-- 30 Sep: a super admin who is NOT on the Director list is not the Director.
SELECT t.login(:'S');
SELECT t.check('a super admin who is not on the list cannot give the final yes',
  t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_f2')) = '42501'
  AND t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, false, NULL, %L)', :'req_f2', 'no')) = '42501'
  AND t.try('SELECT * FROM public.fn_hr_salary_revision_list(''director'')') = '42501'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_f2') = 'waiting_director');
SELECT t.login(:'D');
SELECT t.check('the Director''s list shows everything', (SELECT count(*) FROM public.fn_hr_salary_revision_list('director')) = 10);
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
-- 30 Sep: the Director sees TODAY's band, with a note when it changed since the ask.
SELECT t.check('no band change yet: no note',
  (SELECT bool_and(NOT band_changed) FROM public.fn_hr_salary_revision_list('director')));
RESET ROLE;
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value)
VALUES ('hr.pay_scales', 'institution', '00000000-0000-0000-0000-0000000000a1', '{"pay_matrix": [{"designation": "Assistant Professor", "basic_pay": 60000}]}');
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the Director is told the band changed since the request, college A only',
  (SELECT band_changed FROM public.fn_hr_salary_revision_list('director') WHERE id = :'req_f2')
  AND (SELECT NOT band_changed FROM public.fn_hr_salary_revision_list('director') WHERE id = :'req_f3'));
SELECT t.login(:'PA');
SELECT t.check('nobody but the Director gets the band-changed note',
  (SELECT bool_and(NOT band_changed) FROM public.fn_hr_salary_revision_list('mine')));
SELECT t.login(:'D');

-- ── 8. Who sees the reason for a no (ruling 14) ─────────────────────────────
SELECT t.login(:'HA');
SELECT t.check('the asker sees the reason for the no',
  (SELECT count(*) FROM public.hr_salary_revision_decision_notes WHERE request_id = :'req_f4') = 1
  AND (public.fn_hr_salary_revision_get(:'req_f4') -> 'decision_note' ->> 'reason') = 'The budget for this year is closed');
SELECT t.check('the HOD sees why the principal stopped it',
  (SELECT count(*) FROM public.hr_salary_revision_decision_notes WHERE request_id = :'req_f7h') = 1);
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
  (SELECT count(*) = 1 AND bool_and(new_monthly_gross = t.on_start(48000, 52500) AND previous_monthly_gross = 48000 AND NOT is_cut)
     FROM public.hr_salary_revision_outcomes));
SELECT t.check('the person cannot see anybody else''s outcome',
  (SELECT count(*) FROM public.hr_salary_revision_outcomes WHERE staff_id <> :'sF1') = 0);
RESET ROLE;
SELECT t.check('the person got one in-app notice, about the new pay',
  (SELECT count(*) = 1 AND bool_and(n.title = 'Your monthly pay is changing'
                                    AND n.body LIKE '%' || public.hr_salary_revision_rupees(t.on_start(48000, 52500)) || '%')
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
SELECT t.check('a team member cannot read comments on a request they may not see',
  (SELECT count(*) FROM public.hr_salary_revision_comments) = 0);
SELECT t.login(:'HA');
SELECT t.check('the asker reads the comments on their own request',
  (SELECT count(*) FROM public.hr_salary_revision_comments WHERE request_id = :'req_f1') >= 1);
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
  (SELECT effective_from = :'start1'::date AND monthly_gross = t.on_start(48000, 52500) AND eligible_for_pf AND epf_amount = 1800
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
  (SELECT monthly_gross FROM public.hr_staff_salaries_in_force(ARRAY[:'sF1']::uuid[], :'next_month_end')) = t.on_start(48000, 52500));
SELECT t.check('the in-force read walks further back through history',
  (SELECT monthly_gross FROM public.hr_staff_salaries_in_force(ARRAY[:'sF1']::uuid[], '2026-01-31')) = 45000);
SELECT t.check('the old register read (current row) would have given this month the new pay',
  (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sF1' AND superseded_by IS NULL) = t.on_start(48000, 52500));
SELECT t.check('people with no future-dated row read exactly as before',
  (SELECT count(*) FROM public.hr_staff_salaries_in_force(ARRAY[:'sF2', :'sF3', :'sF5']::uuid[], :'month_end')) = 3
  AND (SELECT bool_and(i.id = s.id) FROM public.hr_staff_salaries_in_force(ARRAY[:'sF2', :'sF3', :'sF5']::uuid[], :'month_end') i
         JOIN public.hr_staff_salaries s ON s.staff_id = i.staff_id AND s.superseded_by IS NULL));
SELECT t.login(:'HA');
SELECT t.check('the in-force read keeps the caller''s own RLS (HOD reads only their own pay)',
  (SELECT count(*) FROM public.hr_staff_salaries_in_force(ARRAY[:'sF1', :'sHA']::uuid[], :'month_end')) = 1);
RESET ROLE;
-- 30 Sep: F5 leaves before the start date. The raise is cancelled, both told, nothing written.
UPDATE public.staff SET is_active = false WHERE id = :'sF5';
SELECT t.check('the college B raises wait for the month after',
  public.hr_salary_revision_apply_due_on(:'start2') = 1);
SELECT t.check('a raise for someone who left is cancelled, not written',
  (SELECT status = 'cancelled' AND cancelled_at IS NOT NULL AND cancel_note LIKE 'Cancelled:%' AND applied_salary_id IS NULL
     FROM public.hr_salary_revision_requests WHERE id = :'req_f5b')
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sF5' AND superseded_by IS NULL) = 60000);
SELECT t.check('the Director and the asker are told about the cancellation',
  (SELECT count(DISTINCT u.user_id) FROM public.user_notifications u JOIN public.notifications n ON n.id = u.notification_id
    WHERE n.title = 'A salary revision was cancelled'
      AND u.user_id IN (:'D', (SELECT asked_by FROM public.hr_salary_revision_requests WHERE id = :'req_f5b'))) = 2
  AND NOT EXISTS (SELECT 1 FROM public.user_notifications u JOIN public.notifications n ON n.id = u.notification_id
                   WHERE n.title = 'A salary revision was cancelled' AND u.user_id = :'S'));
-- 30 Sep: a start date that passed unapplied is never written late. F7's raise
-- is approved for start1; the job is (pretend) run a day late.
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the Director approves F7', public.fn_hr_salary_revision_director_decide(:'req_f7', true) = 'approved');
RESET ROLE;
SELECT t.check('a day-late run writes nothing', public.hr_salary_revision_apply_due_on((:'start1'::date + 1)) = 0);
SELECT t.check('a missed start goes back to the Director instead of being written late',
  (SELECT status = 'waiting_director' AND starts_on IS NULL AND final_monthly_gross IS NULL AND apply_note LIKE 'The start date%'
     FROM public.hr_salary_revision_requests WHERE id = :'req_f7')
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sF7' AND superseded_by IS NULL) = 20000,
  (SELECT status || ' | ' || COALESCE(starts_on::text, 'no start') || ' | ' || COALESCE(apply_note, 'no note') FROM public.hr_salary_revision_requests WHERE id = :'req_f7'));
SELECT t.check('the Director and the asker are told about the missed start',
  (SELECT count(DISTINCT u.user_id) FROM public.user_notifications u JOIN public.notifications n ON n.id = u.notification_id
    WHERE n.title = 'A salary revision missed its start date' AND u.user_id IN (:'D', :'PA')) = 2);
-- 7 Oct 2026 (#4140's head 9c66d7a7ad): the missed start no longer deletes the
-- person's outcome row; the fresh yes overwrites it (upsert on request_id).
SELECT t.check('a missed start keeps the person''s outcome row',
  (SELECT count(*) FROM public.hr_salary_revision_outcomes WHERE request_id = :'req_f7') = 1);
SET ROLE authenticated;
SELECT t.login(:'D');
-- At a new figure (25000, asked 24000), so the outcome row can show it was
-- overwritten. t.try, so a refused yes prints FAIL here rather than ERROR.
SELECT t.check('the Director gives F7 a fresh yes',
  t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true, 25000)', :'req_f7')) = 'ok');
SELECT t.check('the fresh yes carries a fresh start date',
  (SELECT starts_on = :'start1'::date AND final_monthly_gross = 25000 FROM public.hr_salary_revision_requests WHERE id = :'req_f7'));
RESET ROLE;
SELECT t.check('a fresh yes after a missed start leaves one outcome row, at the fresh yes',
  (SELECT count(*) = 1 AND bool_and(o.new_monthly_gross = t.on_start(o.previous_monthly_gross, r.final_monthly_gross)
                                     AND o.starts_on = r.starts_on AND r.final_monthly_gross = 25000
                                     AND o.staff_id = r.staff_id AND o.new_monthly_gross = t.on_start(20000, 25000))
     FROM public.hr_salary_revision_outcomes o JOIN public.hr_salary_revision_requests r ON r.id = o.request_id
    WHERE o.request_id = :'req_f7'),
  (SELECT string_agg(o.new_monthly_gross::text || ' from ' || o.starts_on::text, ', ')
     FROM public.hr_salary_revision_outcomes o WHERE o.request_id = :'req_f7'));
SELECT t.check('the fresh yes is written on its own start date', public.hr_salary_revision_apply_due_on(:'start1') = 1);
SELECT t.check('the fresh yes is the pay in force',
  (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sF7' AND superseded_by IS NULL) = t.on_start(20000, 25000)
  AND (SELECT status = 'applied' FROM public.hr_salary_revision_requests WHERE id = :'req_f7')
  AND (SELECT count(*) FROM public.hr_salary_revision_outcomes WHERE request_id = :'req_f7') = 1);

-- ── 11. The database enforces one open request ──────────────────────────────
SELECT t.check('the unique index refuses a second open request even without the function',
  t.try(format($q$INSERT INTO public.hr_salary_revision_requests (staff_id, institution_id, asked_by, asked_as, route,
     current_monthly_gross, asked_monthly_gross, reason, status)
     SELECT staff_id, institution_id, asked_by, asked_as, route, current_monthly_gross, 99999, 'dup', status
       FROM public.hr_salary_revision_requests WHERE id = %L$q$, :'req_f2')) = '23505');

-- ── 12. The weekly reminder ─────────────────────────────────────────────────
SELECT t.login(NULL);
SELECT t.check('the weekly reminder counts everything waiting', public.fn_hr_salary_revision_weekly_digest() = 3);
SELECT t.check('it reaches the Director once, even when run twice',
  public.fn_hr_salary_revision_weekly_digest() = 3
  AND (SELECT count(*) FROM public.user_notifications u JOIN public.notifications n ON n.id = u.notification_id
        WHERE u.user_id = :'D' AND n.title = 'Salary revisions waiting for you') = 1);
SELECT t.check('the reminder does not reach a super admin who is not on the list',
  NOT EXISTS (SELECT 1 FROM public.user_notifications u JOIN public.notifications n ON n.id = u.notification_id
               WHERE u.user_id = :'S' AND n.title = 'Salary revisions waiting for you'));
SELECT t.check('nothing was approved by the reminder',
  (SELECT count(*) FROM public.hr_salary_revision_requests WHERE status = 'waiting_director') = 3);
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('a signed-in user cannot send the reminder', t.try('SELECT public.fn_hr_salary_revision_weekly_digest()') = '42501');
RESET ROLE;

-- ── 13. Who may decide (the Director's rulings of 1 Oct 2026) ───────────────
-- I stands for isvarya@ (on the Director list, NOT the Director himself), L for
-- a third person on the list. D is the Director himself once the decider row
-- names him. Added here, at the end, so every count above stays as it was.
\set I   '00000000-0000-0000-0000-000000010007'
\set L   '00000000-0000-0000-0000-000000010008'
\set sI  '00000000-0000-0000-0000-000000020007'
\set sL  '00000000-0000-0000-0000-000000020008'
\set KEY 'hr.salary_revision.list_member_raise_decider_profile_id'
SELECT t.login(NULL);
SELECT t.check('the migration seeds no decider when director@ has no verified account (fail closed)',
  NOT EXISTS (SELECT 1 FROM public.platform_policies WHERE policy_key = :'KEY'));
INSERT INTO public.profiles (id, full_name, role, is_super_admin, institution_id) VALUES
  (:'I', 'List member I', 'super_admin', true,  '00000000-0000-0000-0000-0000000000a1'),
  (:'L', 'List member L', 'faculty',     false, '00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.staff (id, profile_id, institution_id, department_id, category_id,
                          first_name, last_name, staff_id, designation, date_of_joining) VALUES
  (:'sI', :'I', '00000000-0000-0000-0000-0000000000a1', NULL, '00000000-0000-0000-0000-000000000c01', 'List', 'I', 'I07', 'Joint MD', '2011-06-01'),
  (:'sL', :'L', '00000000-0000-0000-0000-0000000000a1', NULL, '00000000-0000-0000-0000-000000000c01', 'List', 'L', 'L08', 'Dean', '2014-06-01');
INSERT INTO public.hr_staff_salaries (staff_id, hr_organization_id, monthly_gross, effective_from)
VALUES (:'sI', '00000000-0000-0000-0000-000000000ea1', 150000, '2026-04-01'),
       (:'sL', '00000000-0000-0000-0000-000000000ea1', 100000, '2026-04-01');
UPDATE public.platform_policies SET value = jsonb_build_array(:'D', :'I', :'L')
 WHERE policy_key = 'platform.the_director_profile_ids';

-- While no decider row exists, nobody can tell which list member is the
-- Director himself: a raise for anyone on the list is refused when asked for.
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.check('the Director''s own raise is refused when asked for, even before the decider row exists',
  t.msg(format('SELECT public.fn_hr_salary_revision_propose(%L, 210000, %L)', :'sD', 'x'))
    LIKE '55000 This person is on the Director list, and a raise for someone on the Director list cannot be asked for yet:%'
  AND NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_requests WHERE staff_id = :'sD'),
  t.msg(format('SELECT public.fn_hr_salary_revision_propose(%L, 210000, %L)', :'sD', 'x')));
SELECT t.check('a Director-list member''s raise cannot be asked for while the decider row is missing',
  t.try(format('SELECT public.fn_hr_salary_revision_propose(%L, 110000, %L)', :'sL', 'x')) = '55000'
  AND NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_requests WHERE staff_id = :'sL'));

-- A request for the Director himself that was asked before these rules
-- existed (written as the table owner, as such a row would stand today).
RESET ROLE;
SELECT t.login(NULL);
-- subject_profile_id as the migration's backfill writes it for older requests.
INSERT INTO public.hr_salary_revision_requests (staff_id, subject_profile_id, institution_id, asked_by, asked_as, route,
  current_monthly_gross, asked_monthly_gross, reason, status)
VALUES (:'sD', :'D', '00000000-0000-0000-0000-0000000000a1', :'H', 'hr_head', 'direct', 200000, 210000,
        'Asked before the rules of 1 Oct 2026', 'waiting_director')
RETURNING id AS req_d \gset

-- The decider row is written (as the SQL console would), I and L are asked
-- for, and the row is then deleted again to prove the decision fails closed.
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, data_type, is_active)
VALUES (:'KEY', 'global', NULL, to_jsonb(:'D'::text), 'string', true);
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sI', 160000, 'Joint MD revision') AS req_i \gset
SELECT public.fn_hr_salary_revision_propose(:'sL', 110000, 'Dean revision') AS req_l \gset
RESET ROLE;
SELECT t.login(NULL);
DELETE FROM public.platform_policies WHERE policy_key = :'KEY';
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('a Director-list member''s raise cannot be decided while the decider row is missing (fail closed)',
  t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_l')) = '55000'
  AND t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, false, NULL, %L)', :'req_l', 'no')) = '55000'
  AND t.try(format('SELECT public.fn_hr_salary_revision_director_approve_many(ARRAY[%L]::uuid[])', :'req_l')) = '55000'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_l') = 'waiting_director',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_l')));
SELECT t.check('nobody is the decider while the row is missing',
  t.is_decider() IS FALSE);

-- The decider row, written as the SQL console would.
RESET ROLE;
SELECT t.login(NULL);
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, data_type, is_active)
VALUES (:'KEY', 'global', NULL, to_jsonb(:'D'::text), 'string', true);
SELECT t.check('the SQL console can write the decider row',
  (SELECT value = to_jsonb(:'D'::text) FROM public.platform_policies WHERE policy_key = :'KEY'));
SELECT t.check('a change made in the SQL console names nobody, so writes no audit row',
  NOT EXISTS (SELECT 1 FROM public.hr_policy_audit_log WHERE policy_key = :'KEY'));

SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.check('the Director''s own raise is refused when asked for',
  t.msg(format('SELECT public.fn_hr_salary_revision_propose(%L, 220000, %L)', :'sD', 'x'))
    = '42501 The Director''s own pay is decided outside MyJKKN.',
  t.msg(format('SELECT public.fn_hr_salary_revision_propose(%L, 220000, %L)', :'sD', 'x')));

SELECT t.login(:'D');
SELECT t.check('the Director himself is the decider; the screen can ask',
  t.is_decider() IS TRUE);
-- RULE 1, the Director himself (his request was asked before the row existed).
SELECT t.check('the Director cannot approve his own raise',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_d'))
    = '42501 You cannot decide on a raise for yourself.'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_d') = 'waiting_director',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_d')));
SELECT t.check('the Director cannot refuse his own raise',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, false, NULL, %L)', :'req_d', 'no'))
    = '42501 You cannot decide on a raise for yourself.'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_d') = 'waiting_director');
SELECT t.check('a batch with the Director''s own raise ticked approves nothing and says why',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_approve_many(ARRAY[%L, %L]::uuid[])', :'req_d', :'req_senior'))
    LIKE '42501 One of the ticked requests is a raise for yourself.%nothing was approved%'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_senior') = 'waiting_director'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_d') = 'waiting_director',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_approve_many(ARRAY[%L, %L]::uuid[])', :'req_d', :'req_senior')));

-- RULE 1, a list member who is not the Director himself.
SELECT t.login(:'I');
SELECT t.check('a list member is not the decider',
  t.is_decider() IS FALSE);
SELECT t.check('a list member cannot approve their own raise',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_i'))
    = '42501 You cannot decide on a raise for yourself.'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_i') = 'waiting_director',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_i')));
SELECT t.check('a list member cannot refuse their own raise',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, false, NULL, %L)', :'req_i', 'no'))
    = '42501 You cannot decide on a raise for yourself.');
SELECT t.check('a mixed batch with a list member''s own raise approves nothing',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_approve_many(ARRAY[%L, %L]::uuid[])', :'req_i', :'req_f2'))
    LIKE '42501 One of the ticked requests is a raise for yourself.%'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_f2') = 'waiting_director');

-- RULE 2: another list member's raise (L's), and the Director's own (D's).
SELECT t.check('a Director-list member''s raise cannot be approved by another list member',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_l'))
    = '42501 This raise is for someone on the Director list. Only the Director himself can decide it.'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_l') = 'waiting_director',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_l')));
SELECT t.check('a Director-list member''s raise cannot be refused by another list member',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, false, NULL, %L)', :'req_l', 'no'))
    = '42501 This raise is for someone on the Director list. Only the Director himself can decide it.'
  AND t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_d'))
    = '42501 This raise is for someone on the Director list. Only the Director himself can decide it.');
SELECT t.check('a batch with a Director-list member''s raise approves nothing for another list member',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_approve_many(ARRAY[%L, %L]::uuid[])', :'req_l', :'req_f2'))
    LIKE '42501 1 of the 2 ticked requests are raises for someone on the Director list.%nothing was approved%'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_f2') = 'waiting_director'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_l') = 'waiting_director',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_approve_many(ARRAY[%L, %L]::uuid[])', :'req_l', :'req_f2')));
-- A normal raise: either list member may decide it.
SELECT t.check('a normal raise is still approved by a list member who is not the Director himself',
  public.fn_hr_salary_revision_director_approve_many(ARRAY[:'req_f2']::uuid[]) = 1);

SELECT t.login(:'D');
SELECT t.check('the Director himself approves a Director-list member''s raise',
  public.fn_hr_salary_revision_director_decide(:'req_l', true) = 'approved');
SELECT t.check('the Director himself refuses a Director-list member''s raise',
  public.fn_hr_salary_revision_director_decide(:'req_i', false, NULL, 'Not this year') = 'refused');
SELECT t.check('a normal raise is still approved by the Director himself',
  public.fn_hr_salary_revision_director_decide(:'req_senior', true) = 'approved');
SELECT t.check('the Director''s own raise is still waiting: nobody in MyJKKN can decide it',
  (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_d') = 'waiting_director');

-- The decider row: only the Director list may change it. Run as the table
-- owner (no RLS) with the caller's JWT, so the trigger alone is what refuses.
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'S', 'role', 'authenticated')::text, false);
SELECT t.check('a super admin not on the Director list cannot change who decides',
  t.msg(format('UPDATE public.platform_policies SET value = to_jsonb(%L::text) WHERE policy_key = %L', :'S', :'KEY'))
    = '42501 Only the Director can change who decides raises for people on the Director list.'
  AND t.try(format('DELETE FROM public.platform_policies WHERE policy_key = %L', :'KEY')) = '42501'
  AND (SELECT value = to_jsonb(:'D'::text) FROM public.platform_policies WHERE policy_key = :'KEY'));
-- Default taken (1 Oct 2026): only the person the row names NOW may change it.
SELECT set_config('request.jwt.claims', json_build_object('sub', :'L', 'role', 'authenticated')::text, false);
SELECT t.check('another list member who is not named in the setting cannot change it',
  t.msg(format('UPDATE public.platform_policies SET value = to_jsonb(%L::text) WHERE policy_key = %L', :'L', :'KEY'))
    = '42501 Only the person this setting names now can change it.'
  AND t.msg(format('UPDATE public.platform_policies SET is_active = false WHERE policy_key = %L', :'KEY'))
    = '42501 Only the person this setting names now can change it.'
  AND (SELECT value = to_jsonb(:'D'::text) AND is_active FROM public.platform_policies WHERE policy_key = :'KEY'));
SELECT set_config('request.jwt.claims', json_build_object('sub', :'D', 'role', 'authenticated')::text, false);
SELECT t.msg(format('UPDATE public.platform_policies SET value = to_jsonb(%L::text) WHERE policy_key = %L', :'I', :'KEY')) AS list_edit \gset
SELECT t.check('the person the setting names can change it, and is recorded',
  :'list_edit' = 'ok'
  AND (SELECT updated_by = :'D'::uuid FROM public.platform_policies WHERE policy_key = :'KEY'),
  :'list_edit');
SELECT t.check('the change is written to the policy audit log, naming who made it',
  (SELECT count(*) = 1 AND bool_and(a.edited_by = :'D'::uuid AND a.action = 'publish'
                                    AND a.old_value = to_jsonb(:'D'::text) AND a.new_value = to_jsonb(:'I'::text)
                                    AND a.policy_id = pp.id AND a.reason LIKE 'Changed who decides raises%')
     FROM public.hr_policy_audit_log a JOIN public.platform_policies pp ON pp.policy_key = a.policy_key
    WHERE a.policy_key = :'KEY'));
-- The row now names I.
SELECT set_config('request.jwt.claims', json_build_object('sub', :'I', 'role', 'authenticated')::text, false);
SELECT t.check('someone on the Director list cannot delete it (switch it off instead), so its record stays',
  t.msg(format('DELETE FROM public.platform_policies WHERE policy_key = %L', :'KEY'))
    = '42501 Switch this setting off instead of deleting it, so the change stays on record.'
  AND (SELECT count(*) FROM public.hr_policy_audit_log WHERE policy_key = :'KEY') = 1);
SELECT t.msg(format('UPDATE public.platform_policies SET is_active = false WHERE policy_key = %L', :'KEY')) AS off_edit \gset
SELECT t.check('switching it off is allowed and recorded',
  :'off_edit' = 'ok'
  AND (SELECT count(*) FROM public.hr_policy_audit_log WHERE policy_key = :'KEY' AND reason LIKE '%switched off%') = 1,
  :'off_edit' || ' | ' || (SELECT string_agg(reason, ' / ') FROM public.hr_policy_audit_log WHERE policy_key = :'KEY'));
SELECT t.login(NULL);
UPDATE public.platform_policies SET value = to_jsonb(:'D'::text), is_active = true WHERE policy_key = :'KEY';
SELECT t.check('the decider row must name one existing account',
  t.try(format('UPDATE public.platform_policies SET value = to_jsonb(%L::text) WHERE policy_key = %L', '00000000-0000-0000-0000-0000000000ff', :'KEY')) = '22023'
  AND t.try(format('UPDATE public.platform_policies SET value = %L::jsonb WHERE policy_key = %L', '["x"]', :'KEY')) = '22023');
-- Named, but not on the Director list: fails closed too. I's second request
-- is asked while the row still names D, then the row is pointed at F1.
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sI', 165000, 'Second revision') AS req_i2 \gset
RESET ROLE;
SELECT t.login(NULL);
UPDATE public.platform_policies SET value = to_jsonb(:'F1'::text), is_active = true WHERE policy_key = :'KEY';
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('a decider who is not on the Director list counts as no decider (fail closed)',
  t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_i2')) = '55000'
  AND t.is_decider() IS FALSE);
SELECT t.login(:'H');
SELECT t.check('nor can a raise for someone on the Director list be asked for then',
  t.try(format('SELECT public.fn_hr_salary_revision_propose(%L, 120000, %L)', :'sL', 'x')) = '55000');
RESET ROLE;
SELECT t.check('signed-in users cannot call the new internal functions',
  NOT has_function_privilege('authenticated', 'public.hr_salary_revision_list_member_raise_decider_id()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.hr_salary_revision_assert_may_decide(uuid, uuid, boolean)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.hr_salary_revision_is_own(uuid, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.hr_salary_revision_is_list_member(uuid, uuid, boolean)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.hr_salary_revision_decision_breach(uuid, uuid, uuid, boolean)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.fn_hr_salary_revision_held_approvals()', 'EXECUTE')
  AND to_regprocedure('public.hr_salary_revision_assert_may_decide(uuid)') IS NULL
  AND NOT has_function_privilege('authenticated', 'public.fn_audit_hr_salary_revision_raise_decider()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.fn_hr_salary_revision_is_list_member_raise_decider()', 'EXECUTE'));

-- ── 14. Round two (1 Oct 2026): whose raise it is, the principal's check, ──
--       the yeses given before these rules, the per-row can_decide
-- HB: a second HOD of department A1. M and N: joining the Director list.
-- Z: a staff record with no account. Y: no account, but the email of L.
-- PB2: a second staff record of principal PB.
\set HB   '00000000-0000-0000-0000-000000010009'
\set sHB  '00000000-0000-0000-0000-000000020009'
\set M    '00000000-0000-0000-0000-00000001000a'
\set sM   '00000000-0000-0000-0000-00000002000a'
\set N    '00000000-0000-0000-0000-00000001000b'
\set sN   '00000000-0000-0000-0000-00000002000b'
\set sZ   '00000000-0000-0000-0000-00000002000c'
\set sY   '00000000-0000-0000-0000-00000002000d'
\set sPB2 '00000000-0000-0000-0000-00000002000e'
\set sPB  '00000000-0000-0000-0000-000000020004'
\set A    '00000000-0000-0000-0000-0000000000a1'
\set B    '00000000-0000-0000-0000-0000000000b2'
\set A1   '00000000-0000-0000-0000-00000000d0a1'
\set A2   '00000000-0000-0000-0000-00000000d0a2'
\set B1   '00000000-0000-0000-0000-00000000d0b1'
\set C    '00000000-0000-0000-0000-000000000c01'
RESET ROLE;
SELECT t.login(NULL);
UPDATE public.platform_policies SET value = to_jsonb(:'D'::text), is_active = true WHERE policy_key = :'KEY';
INSERT INTO public.profiles (id, full_name, role, is_super_admin, institution_id) VALUES
  (:'HB', 'HOD HB', 'hod', false, :'A'), (:'M', 'List member M', 'faculty', false, :'A'),
  (:'N', 'List member N', 'faculty', false, :'A');
INSERT INTO public.user_roles (user_id, role_id) SELECT :'HB', id FROM public.custom_roles WHERE role_key = 'hod';
INSERT INTO public.staff (id, profile_id, institution_id, department_id, category_id, first_name, last_name,
                          staff_id, designation, date_of_joining, email, institution_email) VALUES
  (:'sHB', :'HB', :'A', :'A1', :'C', 'HOD', 'HB', 'H09', 'Head of Department', '2016-06-01', NULL, NULL),
  (:'sM',  :'M',  :'A', NULL,  :'C', 'List', 'M', 'M10', 'Dean', '2014-06-01', NULL, NULL),
  (:'sN',  :'N',  :'A', NULL,  :'C', 'List', 'N', 'N11', 'Dean', '2014-06-01', NULL, NULL),
  (:'sZ',  NULL,  :'A', :'A2', :'C', 'No', 'Account', 'Z12', 'Assistant Professor', '2020-06-01', NULL, NULL),
  (:'sY',  NULL,  :'A', :'A2', :'C', 'Same', 'Email', 'Y13', 'Dean', '2014-06-01', ' List.L@JKKN.example ', NULL),
  (:'sPB2', :'PB', :'B', :'B1', :'C', 'Principal', 'PB', 'P14', 'Assistant Professor', '2013-06-01', NULL, NULL);
INSERT INTO public.hr_staff_salaries (staff_id, hr_organization_id, monthly_gross, effective_from)
SELECT id, CASE institution_id WHEN :'A' THEN '00000000-0000-0000-0000-000000000ea1'::uuid ELSE :'OB'::uuid END,
       60000, '2026-04-01'
  FROM public.staff WHERE id IN (:'sHB', :'sM', :'sN', :'sZ', :'sY', :'sPB2');
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES (:'L', 'list.l@jkkn.example', now());

-- RULE 4, both ways: only an HOD's OWN raise skips the principal.
SET ROLE authenticated;
SELECT t.login(:'HA');
SELECT public.fn_hr_salary_revision_propose(:'sHB', 65000, 'Second head of department, same department') AS req_hb \gset
SELECT t.check('a raise for another HOD still goes to the principal first',
  (SELECT route = 'via_principal' AND status = 'waiting_principal' AND NOT is_self AND subject_profile_id = :'HB'::uuid
     FROM public.hr_salary_revision_requests WHERE id = :'req_hb'),
  (SELECT route || ' | ' || status FROM public.hr_salary_revision_requests WHERE id = :'req_hb'));
SELECT t.check('the account a request is about is kept when it is asked',
  (SELECT subject_profile_id = :'HA'::uuid FROM public.hr_salary_revision_requests WHERE id = :'req_self'));

-- The principal's check on a raise for someone who has since joined the list:
-- a stop would be a final no by someone other than the Director.
RESET ROLE;
SELECT t.login(NULL);
UPDATE public.platform_policies SET value = jsonb_build_array(:'D', :'I', :'L', :'HB', :'M', :'N')
 WHERE policy_key = 'platform.the_director_profile_ids';
SET ROLE authenticated;
SELECT t.login(:'PA');
SELECT t.msg(format('SELECT public.fn_hr_salary_revision_college_decide(%L, false, %L)', :'req_hb', 'Not this year')) AS hb_stop \gset
RESET ROLE;
SELECT t.check('a principal''s stop on a Director-list member''s raise goes on to the Director instead',
  :'hb_stop' = 'ok'
  AND (SELECT status = 'waiting_director' AND principal_decided_by = :'PA'::uuid
         FROM public.hr_salary_revision_requests WHERE id = :'req_hb')
  AND NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_decision_notes WHERE request_id = :'req_hb')
  AND EXISTS (SELECT 1 FROM public.hr_salary_revision_comments
               WHERE request_id = :'req_hb' AND body = 'The principal would have stopped this: Not this year'),
  :'hb_stop' || ' | ' || (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_hb'));

-- A principal's own pay, through a second staff record that is then unlinked.
SELECT t.login(NULL);
INSERT INTO public.hr_salary_revision_requests (staff_id, subject_profile_id, institution_id, department_id, asked_by,
  asked_as, route, current_monthly_gross, asked_monthly_gross, reason, status)
VALUES (:'sPB2', :'PB', :'B', :'B1', :'H', 'hod', 'via_principal', 60000, 62000, 'About a second record of PB', 'waiting_principal')
RETURNING id AS req_pb2 \gset
UPDATE public.staff SET profile_id = NULL WHERE id = :'sPB2';
SET ROLE authenticated;
SELECT t.login(:'PB');
SELECT t.check('a principal cannot check a request about their own pay after unlinking that staff record',
  t.msg(format('SELECT public.fn_hr_salary_revision_college_decide(%L, false, %L)', :'req_pb2', 'x'))
    = '42501 You cannot check a request about your own pay.'
  AND t.try(format('SELECT public.fn_hr_salary_revision_college_decide(%L, true)', :'req_pb2')) = '42501',
  t.msg(format('SELECT public.fn_hr_salary_revision_college_decide(%L, false, %L)', :'req_pb2', 'x')));

-- The Director unlinks his own staff record and tries to decide his own raise.
RESET ROLE;
SELECT t.login(NULL);
UPDATE public.staff SET profile_id = NULL WHERE id = :'sD';
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the Director cannot approve his own raise after unlinking his staff record',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_d'))
    = '42501 You cannot decide on a raise for yourself.'
  AND t.msg(format('SELECT public.fn_hr_salary_revision_director_approve_many(ARRAY[%L]::uuid[])', :'req_d'))
    LIKE '42501 One of the ticked requests is a raise for yourself.%'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_d') = 'waiting_director',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_d')));
RESET ROLE;
SELECT t.login(NULL);
UPDATE public.staff SET profile_id = :'D' WHERE id = :'sD';

-- A list member's raise stays the Director's after the staff record is unlinked.
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sM', 70000, 'Dean M revision') AS req_m \gset
RESET ROLE;
SELECT t.login(NULL);
UPDATE public.staff SET profile_id = NULL WHERE id = :'sM';
SET ROLE authenticated;
SELECT t.login(:'I');
SELECT t.check('a Director-list member''s raise stays the Director''s after their staff record is unlinked',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_m'))
    = '42501 This raise is for someone on the Director list. Only the Director himself can decide it.'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_m') = 'waiting_director',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_m')));
RESET ROLE;
SELECT t.login(NULL);
UPDATE public.staff SET profile_id = :'M' WHERE id = :'sM';

-- A staff record with no account is asked for; it is then linked to the
-- Director and switched off. His no on it is still a decision on his own raise.
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sZ', 61000, 'A record with no account yet') AS req_z \gset
RESET ROLE;
SELECT t.login(NULL);
UPDATE public.staff SET profile_id = :'D', is_active = false WHERE id = :'sZ';
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('nobody decides their own raise through a staff record of theirs that is no longer active',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, false, NULL, %L)', :'req_z', 'no'))
    = '42501 You cannot decide on a raise for yourself.'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_z') = 'waiting_director',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, false, NULL, %L)', :'req_z', 'no')));

-- An unlinked record whose email is that of someone on the Director list.
SELECT t.login(:'H');
SELECT t.check('an unlinked staff record whose email is on the Director list cannot be asked for until it is linked',
  t.msg(format('SELECT public.fn_hr_salary_revision_propose(%L, 61000, %L)', :'sY', 'x'))
    LIKE '55000 This team member''s record is not linked to an account, but its email belongs to someone on the Director list.%'
  AND NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_requests WHERE staff_id = :'sY'),
  t.msg(format('SELECT public.fn_hr_salary_revision_propose(%L, 61000, %L)', :'sY', 'x')));

-- Per row: may THIS viewer decide it?
SELECT t.login(:'D');
SELECT t.check('the Director''s list says, row by row, which ones he may decide',
  (SELECT can_decide FROM public.fn_hr_salary_revision_list('director') WHERE id = :'req_d') IS FALSE
  AND (SELECT can_decide FROM public.fn_hr_salary_revision_list('director') WHERE id = :'req_self') IS TRUE
  AND (SELECT can_decide FROM public.fn_hr_salary_revision_list('director') WHERE id = :'req_m') IS TRUE
  AND (SELECT bool_and(NOT can_decide) FROM public.fn_hr_salary_revision_list('director') WHERE status <> 'waiting_director'));
SELECT t.login(:'I');
SELECT t.check('another list member''s list marks their own raise and a list member''s raise as not theirs to decide',
  (SELECT can_decide FROM public.fn_hr_salary_revision_list('director') WHERE id = :'req_i2') IS FALSE
  AND (SELECT can_decide FROM public.fn_hr_salary_revision_list('director') WHERE id = :'req_m') IS FALSE
  AND (SELECT can_decide FROM public.fn_hr_salary_revision_list('director') WHERE id = :'req_hb') IS FALSE
  AND (SELECT can_decide FROM public.fn_hr_salary_revision_list('director') WHERE id = :'req_self') IS TRUE);
SELECT t.login(:'PA');
SELECT t.check('nobody off the Director list may decide any row',
  (SELECT bool_and(NOT can_decide) FROM public.fn_hr_salary_revision_list('all')));

-- RULE 6: yeses given before these rules. F6's raise approved by F6, N's (on
-- the list) approved by I (not the Director himself), and a proper one for F4.
RESET ROLE;
SELECT t.login(NULL);
INSERT INTO public.hr_salary_revision_requests (staff_id, subject_profile_id, institution_id, asked_by, asked_as, route,
  current_monthly_gross, asked_monthly_gross, reason, status, final_monthly_gross, starts_on,
  director_decided_by, director_decided_at)
VALUES
  (:'sF6', :'F6', :'A', :'H', 'hr_head', 'direct', 30000, 33000, 'Approved by the person', 'approved', 33000, :'start1', :'F6', now()),
  (:'sN',  :'N',  :'A', :'H', 'hr_head', 'direct', 60000, 66000, 'Approved by I',          'approved', 66000, :'start1', :'I',  now()),
  (:'sF4', :'F4', :'A', :'H', 'hr_head', 'direct', 52000, 54000, 'Approved by the Director','approved', 54000, :'start1', :'D',  now());
SELECT (SELECT id FROM public.hr_salary_revision_requests WHERE staff_id = :'sF6' AND status = 'approved') AS req_held_self,
       (SELECT id FROM public.hr_salary_revision_requests WHERE staff_id = :'sN'  AND status = 'approved') AS req_held_list,
       (SELECT id FROM public.hr_salary_revision_requests WHERE staff_id = :'sF4' AND status = 'approved') AS req_ok_f4 \gset
SELECT public.hr_salary_revision_apply_due_on(:'start1') AS applied_now \gset
SELECT t.check('a raise approved against the rules is never written, and is left exactly as it was',
  (SELECT bool_and(status = 'approved' AND apply_note IS NULL AND applied_salary_id IS NULL AND cancelled_at IS NULL)
     FROM public.hr_salary_revision_requests WHERE id IN (:'req_held_self', :'req_held_list'))
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sF6' AND superseded_by IS NULL) = 30000
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sN' AND superseded_by IS NULL) = 60000,
  (SELECT string_agg(status || '/' || COALESCE(apply_note, '-'), ' ; ') FROM public.hr_salary_revision_requests WHERE id IN (:'req_held_self', :'req_held_list')));
SELECT t.check('a proper yes due the same day is still written',
  (SELECT status = 'applied' FROM public.hr_salary_revision_requests WHERE id = :'req_ok_f4')
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sF4' AND superseded_by IS NULL) = 54000);
SET ROLE authenticated;
SELECT t.login(:'F1');
SELECT t.check('only the Director list may open the list of yeses held back',
  t.try('SELECT * FROM public.fn_hr_salary_revision_held_approvals()') = '42501');
SELECT t.login(:'S');
SELECT t.check('a super admin not on the Director list may not open it either',
  t.try('SELECT * FROM public.fn_hr_salary_revision_held_approvals()') = '42501');
SELECT t.login(:'I');
SELECT t.check('the Director list sees exactly the yeses held back, with why',
  (SELECT array_agg(staff_code || ' ' || status || ' ' || why ORDER BY staff_code) FROM public.fn_hr_salary_revision_held_approvals())
    = ARRAY['F16 approved Approved by the person whose raise it is.',
            'N11 approved A raise for someone on the Director list, approved by someone other than the Director himself.'],
  (SELECT string_agg(staff_code || ' ' || status || ' ' || COALESCE(why, '-'), ' ; ') FROM public.fn_hr_salary_revision_held_approvals()));

-- The decider row cannot be renamed by a signed-in person.
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'D', 'role', 'authenticated')::text, false);
SELECT t.check('someone on the Director list cannot rename the decider row',
  t.msg(format('UPDATE public.platform_policies SET policy_key = %L WHERE policy_key = %L', 'hr.salary_revision.renamed', :'KEY'))
    = '42501 This setting cannot be renamed. Switch it off instead, so the change stays on record.'
  AND EXISTS (SELECT 1 FROM public.platform_policies WHERE policy_key = :'KEY'));
SELECT t.login(NULL);

-- ── 15. Round three (1 Oct 2026): Employee Salaries and stamped yeses ──────
-- RULE 7 (Director default): nobody changes their own pay; the pay of anyone
-- on the Director list only by the Director himself. Through the salary
-- function the Employee Salaries screen calls, and straight at the table.
\set sH '00000000-0000-0000-0000-000000020002'
\set OA '00000000-0000-0000-0000-000000000ea1'
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 41000, p_effective_from => %L)', :'sF2', :'OA', :'start2')) AS hr_edit \gset
SELECT t.check('the HR head still changes an ordinary person''s pay on Employee Salaries',
  :'hr_edit' = 'ok'
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sF2' AND superseded_by IS NULL) = 41000,
  :'hr_edit');
SELECT t.check('nobody changes their own pay on Employee Salaries',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 99000, p_effective_from => %L)', :'sH', :'OA', :'start2'))
    = '42501 You cannot change your own pay.'
  AND t.msg(format('UPDATE public.hr_staff_salaries SET monthly_gross = 99000 WHERE staff_id = %L AND superseded_by IS NULL', :'sH'))
    = '42501 You cannot change your own pay.'
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sH' AND superseded_by IS NULL) = 90000,
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 99000, p_effective_from => %L)', :'sH', :'OA', :'start2')));
SELECT t.check('the HR head cannot change the pay of someone on the Director list',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 130000, p_effective_from => %L)', :'sL', :'OA', :'start2'))
    = '42501 This is the pay of someone on the Director list. Only the Director himself can change it.');
SELECT t.login(:'I');
SELECT t.check('another list member cannot change a list member''s pay, nor their own',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 130000, p_effective_from => %L)', :'sL', :'OA', :'start2'))
    = '42501 This is the pay of someone on the Director list. Only the Director himself can change it.'
  AND t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 199000, p_effective_from => %L)', :'sI', :'OA', :'start2'))
    = '42501 You cannot change your own pay.');
SELECT t.login(:'D');
SELECT t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 130000, p_effective_from => %L)', :'sL', :'OA', :'start2')) AS d_edit \gset
SELECT t.check('the Director himself can change a list member''s pay',
  :'d_edit' = 'ok'
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sL' AND superseded_by IS NULL) = 130000,
  :'d_edit');
SELECT t.check('the Director himself cannot change his own pay',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 250000, p_effective_from => %L)', :'sD', :'OA', :'start2'))
    = '42501 You cannot change your own pay.');

-- RULE 6 by the stamp: the Director approves M (on the list) and I's second
-- request; then the decider setting is switched off. Both are still written
-- on their start date, by the job run by I herself, and neither is held back.
SELECT t.check('the Director approves list member M', public.fn_hr_salary_revision_director_decide(:'req_m', true) = 'approved');
SELECT t.check('the Director approves I''s second request', public.fn_hr_salary_revision_director_decide(:'req_i2', true) = 'approved');
RESET ROLE;
SELECT t.login(NULL);
SELECT t.check('a yes given under these rules is stamped',
  (SELECT bool_and(decided_under_rules) FROM public.hr_salary_revision_requests WHERE id IN (:'req_m', :'req_i2')));
SELECT starts_on AS m_start FROM public.hr_salary_revision_requests WHERE id = :'req_m' \gset
UPDATE public.platform_policies SET is_active = false WHERE policy_key = :'KEY';
SELECT set_config('request.jwt.claims', json_build_object('sub', :'I', 'role', 'authenticated')::text, false);
SELECT public.hr_salary_revision_apply_due_on(:'m_start') AS ran_by_i \gset
SELECT t.login(NULL);
SELECT t.check('a stamped yes is written on its start date even after the decider setting changes (job run by a signed-in list member)',
  (SELECT status = 'applied' FROM public.hr_salary_revision_requests WHERE id = :'req_m')
  AND (SELECT status = 'applied' FROM public.hr_salary_revision_requests WHERE id = :'req_i2')
  -- M was paid 60,000 and I 150,000 when asked (seeded above).
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sM' AND superseded_by IS NULL) = t.on_start(60000, 70000)
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sI' AND superseded_by IS NULL) = t.on_start(150000, 165000),
  (SELECT string_agg(status || '/' || COALESCE(apply_note, '-'), ' ; ') FROM public.hr_salary_revision_requests WHERE id IN (:'req_m', :'req_i2')));
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('a stamped yes is never on the held list, whatever the setting says now',
  NOT EXISTS (SELECT 1 FROM public.fn_hr_salary_revision_held_approvals() WHERE id IN (:'req_m', :'req_i2'))
  AND EXISTS (SELECT 1 FROM public.fn_hr_salary_revision_held_approvals() WHERE id = :'req_held_self'));
RESET ROLE;
SELECT t.login(NULL);
UPDATE public.platform_policies SET is_active = true WHERE policy_key = :'KEY';

-- ── 16. Round three, reviewer notes (1 Oct 2026) ───────────────────────────
-- RULE 8: a record linked to no account, then or now, is decided by nobody
-- and never written. U (A1) is asked by the HOD; V's request waits for the
-- Director; W's yes (stamped) is due. Q is asked for, then leaves.
\set sU '00000000-0000-0000-0000-00000002000f'
\set sV '00000000-0000-0000-0000-000000020010'
\set sW '00000000-0000-0000-0000-000000020019'
\set Q  '00000000-0000-0000-0000-00000001001a'
\set sQ '00000000-0000-0000-0000-00000002001a'
RESET ROLE;
SELECT t.login(NULL);
INSERT INTO public.profiles (id, full_name, role, is_super_admin, institution_id) VALUES (:'Q', 'Member Q', 'faculty', false, :'A');
INSERT INTO public.staff (id, profile_id, institution_id, department_id, category_id, first_name, last_name,
                          staff_id, designation, date_of_joining) VALUES
  (:'sU', NULL, :'A', :'A1', :'C', 'No', 'Account U', 'U15', 'Assistant Professor', '2020-06-01'),
  (:'sV', NULL, :'A', :'A2', :'C', 'No', 'Account V', 'V16', 'Assistant Professor', '2020-06-01'),
  (:'sW', NULL, :'A', :'A2', :'C', 'No', 'Account W', 'W17', 'Assistant Professor', '2020-06-01'),
  (:'sQ', :'Q',  :'A', :'A2', :'C', 'Member', 'Q', 'Q18', 'Assistant Professor', '2020-06-01');
INSERT INTO public.hr_staff_salaries (staff_id, hr_organization_id, monthly_gross, effective_from)
SELECT id, :'OA'::uuid, 40000, '2026-04-01' FROM public.staff WHERE id IN (:'sU', :'sV', :'sW', :'sQ');
INSERT INTO public.hr_salary_revision_requests (staff_id, subject_profile_id, institution_id, asked_by, asked_as, route,
  current_monthly_gross, asked_monthly_gross, reason, status)
VALUES (:'sV', NULL, :'A', :'H', 'hr_head', 'direct', 40000, 42000, 'A record with no account', 'waiting_director')
RETURNING id AS req_v \gset
INSERT INTO public.hr_salary_revision_requests (staff_id, subject_profile_id, institution_id, asked_by, asked_as, route,
  current_monthly_gross, asked_monthly_gross, reason, status, final_monthly_gross, starts_on,
  director_decided_by, director_decided_at, decided_under_rules)
VALUES (:'sW', NULL, :'A', :'H', 'hr_head', 'direct', 40000, 43000, 'Approved, then unlinked', 'approved', 43000, :'start1',
        :'D', now(), true)
RETURNING id AS req_w \gset
SET ROLE authenticated;
SELECT t.login(:'HA');
SELECT public.fn_hr_salary_revision_propose(:'sU', 41000, 'A record with no account yet') AS req_u \gset
SELECT t.login(:'PA');
SELECT t.check('a principal cannot check a raise for a record linked to no account',
  t.msg(format('SELECT public.fn_hr_salary_revision_college_decide(%L, true)', :'req_u'))
    LIKE '55000 Nobody can check this raise yet: the team member''s record is linked to no account%'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_u') = 'waiting_principal',
  t.msg(format('SELECT public.fn_hr_salary_revision_college_decide(%L, true)', :'req_u')));
SELECT t.login(:'D');
SELECT t.check('nobody decides a raise for a record linked to no account',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_v'))
    LIKE '55000 Nobody can decide this raise yet: the team member''s record is linked to no account%'
  AND t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, false, NULL, %L)', :'req_v', 'no'))
    LIKE '55000 Nobody can decide this raise yet:%'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_v') = 'waiting_director',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_v')));
SELECT t.check('a batch with a raise for a record linked to no account approves nothing and says why',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_approve_many(ARRAY[%L, %L]::uuid[])', :'req_v', :'req_self'))
    LIKE '55000 One of the ticked requests is for a team member''s record linked to no account%Nothing was approved%'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_self') = 'waiting_director',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_approve_many(ARRAY[%L, %L]::uuid[])', :'req_v', :'req_self')));

-- can_decide matches the server: not for a record linked to no account, not
-- for someone who has left.
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sQ', 44000, 'Member Q revision') AS req_q \gset
SELECT t.login(:'D');
SELECT (SELECT can_decide FROM public.fn_hr_salary_revision_list('director') WHERE id = :'req_q') AS q_before \gset
RESET ROLE;
UPDATE public.staff SET is_active = false WHERE id = :'sQ';
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('can_decide is false for someone who has left, and for a record linked to no account',
  :'q_before'::boolean
  AND (SELECT can_decide FROM public.fn_hr_salary_revision_list('director') WHERE id = :'req_q') IS FALSE
  AND t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_q')) = '55000'
  AND (SELECT can_decide FROM public.fn_hr_salary_revision_list('director') WHERE id = :'req_v') IS FALSE,
  :'q_before');

-- The approvals job never writes it, stamped or not; the Director sees it.
RESET ROLE;
SELECT t.login(NULL);
SELECT public.hr_salary_revision_apply_due_on(:'start1') AS ran_w \gset
SELECT t.check('a yes for a record linked to no account is never written, and is left as it was',
  (SELECT status = 'approved' AND apply_note IS NULL FROM public.hr_salary_revision_requests WHERE id = :'req_w')
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sW' AND superseded_by IS NULL) = 40000,
  (SELECT status || '/' || COALESCE(apply_note, '-') FROM public.hr_salary_revision_requests WHERE id = :'req_w'));
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the Director sees it on the held list, with why',
  (SELECT why FROM public.fn_hr_salary_revision_held_approvals() WHERE id = :'req_w')
    = 'Nobody can tell whose raise it is: the team member''s record is linked to no account.');
RESET ROLE;
SELECT t.login(NULL);
SELECT t.check('the decider yes/no is not open to signed-in users (no screen asks it)',
  NOT has_function_privilege('authenticated', 'public.fn_hr_salary_revision_is_list_member_raise_decider()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.hr_salary_revision_is_unlinked(uuid, uuid)', 'EXECUTE'));

-- ── 17. Round four (3 Oct 2026): unlink a record, then change its pay ───────
-- A record linked to no account is matched by email (the same match the ask
-- uses): the HR head's own record, unlinked, carries the HR head's sign-in
-- email in its institution email; the Director's, unlinked, carries his in
-- its email. J is a brand-new joiner with no account and nobody's email.
\set sJ '00000000-0000-0000-0000-00000002001b'
RESET ROLE;
SELECT t.login(NULL);
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  (:'H', 'hr.head@jkkn.example', now()), (:'D', 'director@jkkn.ac.in', now());
UPDATE public.staff SET profile_id = NULL, institution_email = ' HR.Head@JKKN.example ' WHERE id = :'sH';
UPDATE public.staff SET profile_id = NULL, email = 'Director@jkkn.ac.in' WHERE id = :'sD';
INSERT INTO public.staff (id, profile_id, institution_id, department_id, category_id, first_name, last_name,
                          staff_id, designation, date_of_joining, email, institution_email)
VALUES (:'sJ', NULL, :'A', :'A2', :'C', 'New', 'Joiner', 'J19', 'Assistant Professor', '2026-09-01',
        'new.joiner@jkkn.example', NULL);
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.check('unlinking your own record does not let you change your own pay',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 199000, p_effective_from => %L)', :'sH', :'OA', :'start2'))
    = '42501 You cannot change your own pay.'
  AND t.msg(format('UPDATE public.hr_staff_salaries SET monthly_gross = 199000 WHERE staff_id = %L AND superseded_by IS NULL', :'sH'))
    = '42501 You cannot change your own pay.'
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sH' AND superseded_by IS NULL) = 90000,
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 199000, p_effective_from => %L)', :'sH', :'OA', :'start2')));
SELECT t.check('unlinking the Director''s record does not let the HR head change his pay',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 5000, p_effective_from => %L)', :'sD', :'OA', :'start2'))
    = '42501 This is the pay of someone on the Director list. Only the Director himself can change it.'
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sD' AND superseded_by IS NULL) = 200000,
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 5000, p_effective_from => %L)', :'sD', :'OA', :'start2')));
SELECT t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 30000, p_effective_from => %L)', :'sJ', :'OA', :'start2')) AS joiner \gset
SELECT t.check('HR still sets the pay of a new joiner with no account and nobody''s email',
  :'joiner' = 'ok'
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sJ' AND superseded_by IS NULL) = 30000,
  :'joiner');
RESET ROLE;
SELECT t.login(NULL);
UPDATE public.staff SET profile_id = :'H', institution_email = NULL WHERE id = :'sH';
UPDATE public.staff SET profile_id = :'D', email = NULL WHERE id = :'sD';
DELETE FROM auth.users WHERE id IN (:'H', :'D');

-- ── 18. Round four add-ons (3 Oct 2026) ─────────────────────────────────────
-- The decoy-account dodge: relink one's own record to someone else's account,
-- get the raise approved, link it back. P is a new joiner's new account; J2
-- the joiner's record, not yet linked.
\set P   '00000000-0000-0000-0000-00000001001c'
\set sJ2 '00000000-0000-0000-0000-00000002001c'
RESET ROLE;
SELECT t.login(NULL);
INSERT INTO public.profiles (id, full_name, role, is_super_admin, institution_id) VALUES (:'P', 'New joiner P', 'faculty', false, :'A');
INSERT INTO public.staff (id, profile_id, institution_id, department_id, category_id, first_name, last_name,
                          staff_id, designation, date_of_joining)
VALUES (:'sJ2', NULL, :'A', :'A2', :'C', 'New', 'Joiner P', 'J20', 'Assistant Professor', '2026-09-15');
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.check('nobody relinks their own record to another account (or unlinks it)',
  t.msg(format('UPDATE public.staff SET profile_id = %L WHERE id = %L', :'F1', :'sH'))
    = '42501 You cannot change who your own record belongs to.'
  AND t.msg(format('UPDATE public.staff SET profile_id = NULL WHERE id = %L', :'sH'))
    = '42501 You cannot change who your own record belongs to.'
  AND (SELECT profile_id = :'H'::uuid FROM public.staff WHERE id = :'sH'),
  t.msg(format('UPDATE public.staff SET profile_id = %L WHERE id = %L', :'F1', :'sH')));
SELECT t.check('nobody relinks a Director-list member''s record, or links one to a list member',
  t.msg(format('UPDATE public.staff SET profile_id = %L WHERE id = %L', :'F7', :'sL'))
    = '42501 This record is, or would be, someone on the Director list. Only the SQL console can change who it belongs to.'
  AND t.msg(format('UPDATE public.staff SET profile_id = %L WHERE id = %L', :'L', :'sJ2'))
    = '42501 This record is, or would be, someone on the Director list. Only the SQL console can change who it belongs to.'
  AND (SELECT profile_id = :'L'::uuid FROM public.staff WHERE id = :'sL'));
SELECT t.check('a record with an open salary revision keeps its link until it is decided',
  t.msg(format('UPDATE public.staff SET profile_id = %L WHERE id = %L', :'P', :'sQ'))
    LIKE '55000 A salary revision for this person is still open.%'
  AND (SELECT profile_id = :'Q'::uuid FROM public.staff WHERE id = :'sQ'));
SELECT t.msg(format('UPDATE public.staff SET profile_id = %L WHERE id = %L', :'P', :'sJ2')) AS link_joiner \gset
SELECT t.check('HR links a new joiner''s record to their new account',
  :'link_joiner' = 'ok' AND (SELECT profile_id = :'P'::uuid FROM public.staff WHERE id = :'sJ2'),
  :'link_joiner');

-- A yes approved by the person, through their own active record, is held
-- back even when the account kept on the request names someone else.
RESET ROLE;
SELECT t.login(NULL);
INSERT INTO public.hr_salary_revision_requests (staff_id, subject_profile_id, institution_id, asked_by, asked_as, route,
  current_monthly_gross, asked_monthly_gross, reason, status, final_monthly_gross, starts_on,
  director_decided_by, director_decided_at)
VALUES (:'sF2', :'F1', :'A', :'H', 'hr_head', 'direct', 41000, 47000, 'Approved through their own record', 'approved', 47000, :'start2', :'F2', now())
RETURNING id AS req_own_record \gset
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('a yes approved through the decider''s own active record is held back',
  (SELECT why FROM public.fn_hr_salary_revision_held_approvals() WHERE id = :'req_own_record')
    = 'Approved by the person whose raise it is.');
RESET ROLE;
SELECT t.login(NULL);

-- Super admins too (the Director's rule is "nobody"): I is a super admin on the
-- Director list, S a super admin who is not. Only the SQL console relinks these.
\set P2  '00000000-0000-0000-0000-00000001001d'
\set sJ3 '00000000-0000-0000-0000-00000002001d'
INSERT INTO public.profiles (id, full_name, role, is_super_admin, institution_id) VALUES (:'P2', 'New joiner P2', 'faculty', false, :'A');
INSERT INTO public.staff (id, profile_id, institution_id, department_id, category_id, first_name, last_name,
                          staff_id, designation, date_of_joining)
VALUES (:'sJ3', NULL, :'A', :'A2', :'C', 'New', 'Joiner P2', 'J21', 'Assistant Professor', '2026-09-20');
SET ROLE authenticated;
SELECT t.login(:'I');
SELECT t.check('a super admin cannot relink or unlink their own record',
  t.msg(format('UPDATE public.staff SET profile_id = %L WHERE id = %L', :'F1', :'sI'))
    = '42501 You cannot change who your own record belongs to.'
  AND t.msg(format('UPDATE public.staff SET profile_id = NULL WHERE id = %L', :'sI'))
    = '42501 You cannot change who your own record belongs to.'
  AND (SELECT profile_id = :'I'::uuid FROM public.staff WHERE id = :'sI'));
SELECT t.login(:'S');
SELECT t.check('a super admin cannot relink a Director-list member''s record',
  t.msg(format('UPDATE public.staff SET profile_id = %L WHERE id = %L', :'F7', :'sL'))
    = '42501 This record is, or would be, someone on the Director list. Only the SQL console can change who it belongs to.'
  AND (SELECT profile_id = :'L'::uuid FROM public.staff WHERE id = :'sL'));
SELECT t.msg(format('UPDATE public.staff SET profile_id = %L WHERE id = %L', :'P2', :'sJ3')) AS sa_joiner \gset
SELECT t.check('a super admin still links an ordinary new joiner''s record',
  :'sa_joiner' = 'ok' AND (SELECT profile_id = :'P2'::uuid FROM public.staff WHERE id = :'sJ3'),
  :'sa_joiner');
RESET ROLE;
SELECT t.login(NULL);

-- ── 19. Round five (3 Oct 2026): ONE identity guard on staff ───────────────
-- Who a record is = its linked account + the accounts its emails belong to.
-- The real sync trigger (main's sync_staff_to_profiles) is loaded, so setting
-- institution_email links the record by email before the guard looks.
-- H's own record and the Director's are unlinked but still carry their
-- sign-in emails; X and X2 are decoy accounts (profiles, no login).
\set X   '00000000-0000-0000-0000-00000001001e'
\set X2  '00000000-0000-0000-0000-00000001001f'
\set sK  '00000000-0000-0000-0000-00000002001e'
\set sK2 '00000000-0000-0000-0000-00000002001f'
\set sJ5 '00000000-0000-0000-0000-000000020020'
RESET ROLE;
SELECT t.login(NULL);
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  (:'H', 'hr.head@jkkn.example', now()), (:'D', 'director@jkkn.ac.in', now());
INSERT INTO public.profiles (id, full_name, role, is_super_admin, institution_id, email) VALUES
  (:'X',  'Decoy X',  'faculty', false, :'A', 'decoy@jkkn.example'),
  (:'X2', 'Decoy X2', 'faculty', false, :'A', 'decoy2@jkkn.example');
UPDATE public.staff SET profile_id = NULL, email = 'HR.Head@jkkn.example' WHERE id = :'sH';
UPDATE public.staff SET profile_id = NULL, email = 'director@jkkn.ac.in' WHERE id = :'sD';
SET ROLE authenticated;
SELECT t.login(:'H');
-- (1)
SELECT t.check('linking your own unlinked record to a decoy is refused',
  t.msg(format('UPDATE public.staff SET profile_id = %L WHERE id = %L', :'X', :'sH'))
    = '42501 You cannot change who your own record belongs to.'
  AND (SELECT profile_id IS NULL FROM public.staff WHERE id = :'sH'),
  t.msg(format('UPDATE public.staff SET profile_id = %L WHERE id = %L', :'X', :'sH')));
-- (2)
SELECT t.check('linking the Director''s unlinked record to a decoy is refused',
  t.msg(format('UPDATE public.staff SET profile_id = %L WHERE id = %L', :'X', :'sD'))
    = '42501 This record is, or would be, someone on the Director list. Only the SQL console can change who it belongs to.'
  AND (SELECT profile_id IS NULL FROM public.staff WHERE id = :'sD'));
SELECT t.login(:'D');
SELECT t.check('the Director cannot link his own record to a decoy, nor then approve his own raise',
  t.msg(format('UPDATE public.staff SET profile_id = %L WHERE id = %L', :'X', :'sD'))
    = '42501 You cannot change who your own record belongs to.'
  AND t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_d'))
    = '42501 You cannot decide on a raise for yourself.'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_d') = 'waiting_director');
-- (3)
SELECT t.login(:'H');
SELECT t.check('changing the emails on your own unlinked record is refused',
  t.msg(format('UPDATE public.staff SET institution_email = %L WHERE id = %L', 'decoy@jkkn.example', :'sH'))
    = '42501 You cannot change who your own record belongs to.'
  AND t.msg(format('UPDATE public.staff SET email = NULL WHERE id = %L', :'sH'))
    = '42501 You cannot change who your own record belongs to.'
  AND (SELECT profile_id IS NULL AND institution_email IS NULL FROM public.staff WHERE id = :'sH'),
  t.msg(format('UPDATE public.staff SET institution_email = %L WHERE id = %L', 'decoy@jkkn.example', :'sH')));
SELECT t.check('changing the emails on a list member''s unlinked record is refused',
  t.msg(format('UPDATE public.staff SET institution_email = %L WHERE id = %L', 'decoy2@jkkn.example', :'sD'))
    = '42501 This record is, or would be, someone on the Director list. Only the SQL console can change who it belongs to.'
  AND (SELECT profile_id IS NULL AND institution_email IS NULL FROM public.staff WHERE id = :'sD'));
-- (4) V is linked to nobody and has a request waiting: the sync would link it to X.
SELECT t.check('setting institution_email on a record with an open revision (the sync relinks it) is refused',
  t.msg(format('UPDATE public.staff SET institution_email = %L WHERE id = %L', 'decoy@jkkn.example', :'sV'))
    LIKE '55000 A salary revision for this person is still open.%'
  AND (SELECT profile_id IS NULL AND institution_email IS NULL FROM public.staff WHERE id = :'sV'),
  t.msg(format('UPDATE public.staff SET institution_email = %L WHERE id = %L', 'decoy@jkkn.example', :'sV')));
-- (5)
SELECT t.check('nobody signed in creates a record that is themselves',
  t.msg(format($q$INSERT INTO public.staff (id, institution_id, department_id, category_id, first_name, last_name, staff_id, email)
                 VALUES (%L, %L, %L, %L, 'Me', 'Again', 'K22', ' hr.head@JKKN.example ')$q$, :'sK', :'A', :'A2', :'C'))
    = '42501 You cannot create a record that is yourself.'
  AND NOT EXISTS (SELECT 1 FROM public.staff WHERE id = :'sK'));
SELECT t.check('nobody signed in creates a record that is someone on the Director list',
  t.msg(format($q$INSERT INTO public.staff (id, institution_id, department_id, category_id, first_name, last_name, staff_id, institution_email)
                 VALUES (%L, %L, %L, %L, 'Ghost', 'Director', 'K23', 'director@jkkn.ac.in')$q$, :'sK2', :'A', :'A2', :'C'))
    = '42501 This record would be someone on the Director list. Only the SQL console can create it.'
  AND NOT EXISTS (SELECT 1 FROM public.staff WHERE id = :'sK2'));
-- (6)
SELECT t.msg(format($q$INSERT INTO public.staff (id, institution_id, department_id, category_id, first_name, last_name, staff_id, institution_email)
                       VALUES (%L, %L, %L, %L, 'New', 'Joiner Five', 'J24', 'joiner5@jkkn.example')$q$, :'sJ5', :'A', :'A2', :'C')) AS j5 \gset
SELECT t.check('HR creates a new joiner, and the sync links them to a new account',
  :'j5' = 'ok'
  AND (SELECT s.profile_id IS NOT NULL AND p.email = 'joiner5@jkkn.example'
         FROM public.staff s JOIN public.profiles p ON p.id = s.profile_id WHERE s.id = :'sJ5'),
  :'j5');
SELECT t.msg(format('UPDATE public.staff SET email = %L WHERE id = %L', 'f4.personal@jkkn.example', :'sF4')) AS f4_email \gset
SELECT t.msg(format('UPDATE public.staff SET institution_email = %L WHERE id = %L', 'f4@jkkn.example', :'sF4')) AS f4_inst \gset
SELECT t.check('HR edits an ordinary person''s emails',
  :'f4_email' = 'ok' AND :'f4_inst' = 'ok'
  AND (SELECT profile_id = :'F4'::uuid AND institution_email = 'f4@jkkn.example' FROM public.staff WHERE id = :'sF4'),
  :'f4_email' || ' | ' || :'f4_inst');
RESET ROLE;
SELECT t.login(NULL);
UPDATE public.staff SET profile_id = :'H', email = NULL WHERE id = :'sH';
UPDATE public.staff SET profile_id = :'D', email = NULL WHERE id = :'sD';
DELETE FROM auth.users WHERE id IN (:'H', :'D');

-- ── 20. Round five add-ons (3 Oct 2026) ───────────────────────────────────
-- H. Pay only for a LINKED record, except a new joiner's first pay row.
\set R    '00000000-0000-0000-0000-000000010021'
\set sR   '00000000-0000-0000-0000-000000020021'
\set sJ6  '00000000-0000-0000-0000-000000020022'
RESET ROLE;
SELECT t.login(NULL);
INSERT INTO public.profiles (id, full_name, role, is_super_admin, institution_id) VALUES (:'R', 'Member R', 'faculty', false, :'A');
INSERT INTO public.staff (id, profile_id, institution_id, department_id, category_id, first_name, last_name,
                          staff_id, designation, date_of_joining) VALUES
  (:'sR',  :'R', :'A', :'A2', :'C', 'Member', 'R', 'R25', 'Assistant Professor', '2020-06-01'),
  (:'sJ6', NULL, :'A', :'A2', :'C', 'New', 'Joiner Six', 'J26', 'Assistant Professor', '2026-09-25');
INSERT INTO public.hr_staff_salaries (staff_id, hr_organization_id, monthly_gross, effective_from)
VALUES (:'sR', :'OA', 50000, '2026-04-01');
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.check('nobody signed in changes the pay of a record linked to no account',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 41500, p_effective_from => %L)', :'sU', :'OA', :'start2'))
    = '42501 This record is not linked to an account. Link it first, then change the pay. Only a new joiner''s first pay can be set before that.'
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sU' AND superseded_by IS NULL) = 40000,
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 41500, p_effective_from => %L)', :'sU', :'OA', :'start2')));
SELECT t.login(:'S');
SELECT t.check('nor does a super admin',
  t.msg(format('UPDATE public.hr_staff_salaries SET monthly_gross = 41500 WHERE staff_id = %L AND superseded_by IS NULL', :'sU'))
    LIKE '42501 This record is not linked to an account.%');
SELECT t.login(:'H');
SELECT t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 30000, p_effective_from => %L)', :'sJ6', :'OA', :'start2')) AS j6_first \gset
SELECT t.check('a new joiner''s first pay can be set before the record is linked, but not changed after',
  :'j6_first' = 'ok'
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sJ6' AND superseded_by IS NULL) = 30000
  AND t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 31000, p_effective_from => %L)', :'sJ6', :'OA', :'start2'))
    LIKE '42501 This record is not linked to an account.%',
  :'j6_first');
SELECT t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 52000, p_effective_from => %L)', :'sR', :'OA', :'start2')) AS r_edit \gset
SELECT t.check('a linked ordinary person''s pay is still changed by HR',
  :'r_edit' = 'ok' AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sR' AND superseded_by IS NULL) = 52000,
  :'r_edit');
RESET ROLE;
SELECT t.login(NULL);
SELECT t.check('the SQL console still changes an unlinked record''s pay',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 41000, p_effective_from => %L)', :'sU', :'OA', :'start2')) = 'ok');
-- The approvals job still writes a proper yes for R, whose record was linked
-- when it was approved and has been unlinked since, run by the HR head.
INSERT INTO public.hr_salary_revision_requests (staff_id, subject_profile_id, institution_id, asked_by, asked_as, route,
  current_monthly_gross, asked_monthly_gross, reason, status, final_monthly_gross, starts_on,
  director_decided_by, director_decided_at, decided_under_rules)
VALUES (:'sR', :'R', :'A', :'H', 'hr_head', 'direct', 52000, 56000, 'Proper yes', 'approved', 56000, :'start2', :'D', now(), true)
RETURNING id AS req_r \gset
UPDATE public.staff SET profile_id = NULL WHERE id = :'sR';
SELECT set_config('request.jwt.claims', json_build_object('sub', :'H', 'role', 'authenticated')::text, false);
SELECT public.hr_salary_revision_apply_due_on(:'start2') AS ran_r \gset
SELECT t.login(NULL);
SELECT t.check('the approvals job still writes a proper yes for a record unlinked since (marker)',
  (SELECT status = 'applied' FROM public.hr_salary_revision_requests WHERE id = :'req_r')
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sR' AND superseded_by IS NULL) = 56000,
  (SELECT status || '/' || COALESCE(apply_note, '-') FROM public.hr_salary_revision_requests WHERE id = :'req_r'));

-- I. While the job names a request, the row it replaces may change only its
-- "replaced by" pointer. I, a list member, names a proper yes for herself and
-- tries to change her own pay row's allowance along with the pointer.
INSERT INTO public.hr_salary_revision_requests (staff_id, subject_profile_id, institution_id, asked_by, asked_as, route,
  current_monthly_gross, asked_monthly_gross, reason, status, final_monthly_gross, starts_on,
  director_decided_by, director_decided_at, decided_under_rules)
VALUES (:'sI', :'I', :'A', :'H', 'hr_head', 'direct', 165000, 170000, 'Proper yes for I', 'approved', 170000, '2099-01-01', :'D', now(), true)
RETURNING id AS req_i3 \gset
SELECT set_config('request.jwt.claims', json_build_object('sub', :'I', 'role', 'authenticated')::text, false);
SELECT set_config('app.hr_salary_revision_apply', :'req_i3', false);
SELECT t.check('while the job names a request, the row it replaces may change only its "replaced by" pointer',
  t.msg(format('UPDATE public.hr_staff_salaries SET allowance_amount = 99999, superseded_by = id WHERE staff_id = %L AND superseded_by IS NULL', :'sI'))
    = '42501 You cannot change your own pay.'
  AND (SELECT allowance_amount FROM public.hr_staff_salaries WHERE staff_id = :'sI' AND superseded_by IS NULL) = 0);
SELECT set_config('app.hr_salary_revision_apply', '', false);
SELECT t.login(NULL);
DELETE FROM public.hr_salary_revision_requests WHERE id = :'req_i3';

-- ── 21. Round six (3 Oct 2026): the email half of who a request is about ───
-- Records linked to a decoy account (Y1…Y4) but carrying a real person's
-- sign-in email: I's (twice), the principal PA's, and the Director's.
\set Y1   '00000000-0000-0000-0000-000000010022'
\set Y2   '00000000-0000-0000-0000-000000010023'
\set Y3   '00000000-0000-0000-0000-000000010024'
\set Y4   '00000000-0000-0000-0000-000000010025'
\set Z9   '00000000-0000-0000-0000-000000010026'
\set sI9  '00000000-0000-0000-0000-000000020023'
\set sPA9 '00000000-0000-0000-0000-000000020024'
\set sD9  '00000000-0000-0000-0000-000000020025'
\set sI8  '00000000-0000-0000-0000-000000020026'
\set sDel '00000000-0000-0000-0000-000000020027'
\set sDel2 '00000000-0000-0000-0000-000000020028'
RESET ROLE;
SELECT t.login(NULL);
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  (:'I', 'isvarya@jkkn.example', now()), (:'PA', 'pa@jkkn.example', now()), (:'D', 'director@jkkn.ac.in', now());
INSERT INTO public.profiles (id, full_name, role, is_super_admin, institution_id) VALUES
  (:'Y1', 'Decoy Y1', 'faculty', false, :'A'), (:'Y2', 'Decoy Y2', 'faculty', false, :'A'),
  (:'Y3', 'Decoy Y3', 'faculty', false, :'A'), (:'Y4', 'Decoy Y4', 'faculty', false, :'A'),
  (:'Z9', 'Member Z9', 'faculty', false, :'A');
INSERT INTO public.staff (id, profile_id, institution_id, department_id, category_id, first_name, last_name,
                          staff_id, designation, date_of_joining, email) VALUES
  (:'sI9',  :'Y1', :'A', :'A1', :'C', 'Decoy', 'One',   'Y27', 'Assistant Professor', '2020-06-01', 'Isvarya@jkkn.example'),
  (:'sPA9', :'Y2', :'A', :'A2', :'C', 'Decoy', 'Two',   'Y28', 'Assistant Professor', '2020-06-01', 'pa@jkkn.example'),
  (:'sD9',  :'Y3', :'A', :'A2', :'C', 'Decoy', 'Three', 'Y29', 'Assistant Professor', '2020-06-01', ' director@JKKN.ac.in'),
  (:'sI8',  :'Y4', :'A', :'A2', :'C', 'Decoy', 'Four',  'Y30', 'Assistant Professor', '2020-06-01', 'isvarya@jkkn.example'),
  (:'sDel', :'Z9', :'A', :'A2', :'C', 'To', 'Delete',   'X31', 'Assistant Professor', '2020-06-01', NULL),
  (:'sDel2', NULL, :'A', :'A2', :'C', 'To', 'Delete Two', 'X32', 'Assistant Professor', '2020-06-01', NULL);
INSERT INTO public.hr_staff_salaries (staff_id, hr_organization_id, monthly_gross, effective_from)
SELECT id, :'OA'::uuid, 50000, '2026-04-01' FROM public.staff WHERE id IN (:'sI9', :'sPA9', :'sD9', :'sI8', :'sDel', :'sDel2');

-- The HOD asks for the record carrying I's email; the principal "stops" it,
-- which, for someone on the Director list, sends it on to the Director.
SET ROLE authenticated;
SELECT t.login(:'HA');
SELECT public.fn_hr_salary_revision_propose(:'sI9', 52000, 'Decoy-linked record') AS req_i9 \gset
SELECT t.login(:'PA');
SELECT t.msg(format('SELECT public.fn_hr_salary_revision_college_decide(%L, false, %L)', :'req_i9', 'Not now')) AS i9_stop \gset
RESET ROLE;
SELECT t.check('a principal''s stop on a record carrying a list member''s email goes on to the Director',
  :'i9_stop' = 'ok'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_i9') = 'waiting_director'
  AND NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_decision_notes WHERE request_id = :'req_i9'),
  :'i9_stop');
SET ROLE authenticated;
SELECT t.login(:'I');
SELECT t.check('a list member cannot approve their own raise on a record linked to a decoy but carrying their email',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_i9'))
    = '42501 You cannot decide on a raise for yourself.'
  AND t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, false, NULL, %L)', :'req_i9', 'no'))
    = '42501 You cannot decide on a raise for yourself.'
  AND t.msg(format('SELECT public.fn_hr_salary_revision_director_approve_many(ARRAY[%L]::uuid[])', :'req_i9'))
    LIKE '42501 One of the ticked requests is a raise for yourself.%'
  AND (SELECT can_decide FROM public.fn_hr_salary_revision_list('director') WHERE id = :'req_i9') IS FALSE
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_i9') = 'waiting_director',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_i9')));
SELECT t.login(:'L');
SELECT t.check('another list member cannot decide a raise for a record carrying a list member''s email',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_i9'))
    = '42501 This raise is for someone on the Director list. Only the Director himself can decide it.'
  AND t.msg(format('SELECT public.fn_hr_salary_revision_director_approve_many(ARRAY[%L]::uuid[])', :'req_i9'))
    LIKE '42501 1 of the 1 ticked requests are raises for someone on the Director list.%'
  AND (SELECT can_decide FROM public.fn_hr_salary_revision_list('director') WHERE id = :'req_i9') IS FALSE);
SELECT t.login(:'D');
SELECT t.check('the Director himself may decide it (can_decide)',
  (SELECT can_decide FROM public.fn_hr_salary_revision_list('director') WHERE id = :'req_i9') IS TRUE);
SELECT t.login(:'H');
SELECT t.check('a raise for a record linked to a decoy but carrying the Director''s email is refused when asked for',
  t.msg(format('SELECT public.fn_hr_salary_revision_propose(%L, 60000, %L)', :'sD9', 'x'))
    = '42501 The Director''s own pay is decided outside MyJKKN.'
  AND NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_requests WHERE staff_id = :'sD9'));
RESET ROLE;
SELECT t.login(NULL);
INSERT INTO public.hr_salary_revision_requests (staff_id, subject_profile_id, institution_id, department_id, asked_by,
  asked_as, route, current_monthly_gross, asked_monthly_gross, reason, status)
VALUES (:'sPA9', :'Y2', :'A', :'A2', :'HA', 'hod', 'via_principal', 50000, 52000, 'Record carrying PA''s email', 'waiting_principal')
RETURNING id AS req_pa9 \gset
SET ROLE authenticated;
SELECT t.login(:'PA');
SELECT t.check('a principal cannot check a raise for a record linked to a decoy but carrying their email',
  t.msg(format('SELECT public.fn_hr_salary_revision_college_decide(%L, true)', :'req_pa9'))
    = '42501 You cannot check a request about your own pay.'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_pa9') = 'waiting_principal');
-- The rule-6 judge and the approvals job: an older yes for the record carrying
-- I's email, given by I herself, is held back and never written.
RESET ROLE;
SELECT t.login(NULL);
INSERT INTO public.hr_salary_revision_requests (staff_id, subject_profile_id, institution_id, asked_by, asked_as, route,
  current_monthly_gross, asked_monthly_gross, reason, status, final_monthly_gross, starts_on,
  director_decided_by, director_decided_at)
VALUES (:'sI8', :'Y4', :'A', :'H', 'hr_head', 'direct', 50000, 58000, 'Approved by I for her decoy-linked record', 'approved', 58000, :'start2', :'I', now())
RETURNING id AS req_i8 \gset
SELECT public.hr_salary_revision_apply_due_on(:'start2') AS ran_i8 \gset
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('an older yes given through a decoy-linked record carrying the decider''s email is held, not written',
  (SELECT status = 'approved' FROM public.hr_salary_revision_requests WHERE id = :'req_i8')
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sI8' AND superseded_by IS NULL) = 50000
  AND (SELECT why FROM public.fn_hr_salary_revision_held_approvals() WHERE id = :'req_i8') = 'Approved by the person whose raise it is.');
-- Deleting a staff record takes its pay rows with it, linked or not.
SELECT t.login(:'H');
SELECT t.msg(format('DELETE FROM public.staff WHERE id IN (%L, %L)', :'sDel', :'sDel2')) AS del_staff \gset
RESET ROLE;
SELECT t.check('a signed-in user can still delete a staff record that has pay rows',
  :'del_staff' = 'ok'
  AND NOT EXISTS (SELECT 1 FROM public.staff WHERE id IN (:'sDel', :'sDel2'))
  AND NOT EXISTS (SELECT 1 FROM public.hr_staff_salaries WHERE staff_id IN (:'sDel', :'sDel2')),
  :'del_staff');
SELECT t.check('signed-in users cannot ask who a request is about directly',
  NOT has_function_privilege('authenticated', 'public.hr_salary_revision_request_identity(uuid, uuid)', 'EXECUTE'));
SELECT t.login(NULL);
DELETE FROM auth.users WHERE id IN (:'I', :'PA', :'D');

-- ── 22. Round six add-ons (3 Oct 2026) ─────────────────────────────────────
\set PL    '00000000-0000-0000-0000-000000010027'
\set sLeg  '00000000-0000-0000-0000-000000020029'
\set sLeg2 '00000000-0000-0000-0000-00000002002a'
\set sDel3 '00000000-0000-0000-0000-00000002002b'
\set Z10   '00000000-0000-0000-0000-000000010028'
\set sU2   '00000000-0000-0000-0000-00000002002c'
RESET ROLE;
SELECT t.login(NULL);
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  (:'D', 'director@jkkn.ac.in', now()), (:'PL', 'legacy@jkkn.example', now()), (:'F7', '', now());
INSERT INTO public.profiles (id, full_name, role, is_super_admin, institution_id, email) VALUES
  (:'PL', 'Legacy PL', 'faculty', false, :'A', 'legacy@jkkn.example'),
  (:'Z10', 'Member Z10', 'faculty', false, :'A', NULL);
INSERT INTO public.staff (id, profile_id, institution_id, department_id, category_id, first_name, last_name,
                          staff_id, designation, date_of_joining, email) VALUES
  (:'sDel3', :'Z10', :'A', :'A2', :'C', 'To', 'Delete Three', 'X33', 'Assistant Professor', '2020-06-01', NULL),
  (:'sU2',   NULL,   :'A', :'A2', :'C', 'No', 'Account Dir', 'U34', 'Assistant Professor', '2020-06-01', 'Director@jkkn.ac.in');
INSERT INTO public.hr_staff_salaries (staff_id, hr_organization_id, monthly_gross, effective_from)
SELECT id, :'OA'::uuid, 45000, '2026-04-01' FROM public.staff WHERE id IN (:'sDel3', :'sU2');
-- Two legacy records from before the sync trigger: unlinked, with an
-- institution email (written with triggers off, as such rows were).
SET session_replication_role = replica;
INSERT INTO public.staff (id, profile_id, institution_id, department_id, category_id, first_name, last_name,
                          staff_id, designation, date_of_joining, institution_email) VALUES
  (:'sLeg',  NULL, :'A', :'A2', :'C', 'Legacy', 'One', 'L35', 'Assistant Professor', '2015-06-01', 'legacy@jkkn.example'),
  (:'sLeg2', NULL, :'A', :'A2', :'C', 'Legacy', 'Two', 'L36', 'Assistant Professor', '2015-06-01', 'legacy2@jkkn.example');
SET session_replication_role = origin;
INSERT INTO public.hr_salary_revision_requests (staff_id, subject_profile_id, institution_id, asked_by, asked_as, route,
  current_monthly_gross, asked_monthly_gross, reason, status)
VALUES (:'sLeg',  NULL, :'A', :'H', 'hr_head', 'direct', 40000, 42000, 'Legacy one', 'waiting_director'),
       (:'sLeg2', NULL, :'A', :'H', 'hr_head', 'direct', 40000, 42000, 'Legacy two', 'waiting_director');
SET ROLE authenticated;
-- J. A staff delete takes its pay rows; a direct delete of own / list pay does not pass.
SELECT t.login(:'S');
SELECT t.msg(format('DELETE FROM public.staff WHERE id = %L', :'sDel3')) AS del3 \gset
SELECT t.check('a super admin deletes an ordinary member who has pay rows',
  :'del3' = 'ok', :'del3');
SELECT t.login(:'H');
SELECT t.check('a direct delete of one''s own pay row, or a list member''s, is still refused',
  t.msg(format('DELETE FROM public.hr_staff_salaries WHERE staff_id = %L', :'sH')) = '42501 You cannot change your own pay.'
  AND t.msg(format('DELETE FROM public.hr_staff_salaries WHERE staff_id = %L', :'sL'))
    = '42501 This is the pay of someone on the Director list. Only the Director himself can change it.');
-- K. The early return still lets the guard see an institution-email change.
SELECT t.check('changing a linked record''s institution email to the Director''s is refused',
  t.msg(format('UPDATE public.staff SET institution_email = %L WHERE id = %L', 'director@jkkn.ac.in', :'sF4'))
    = '42501 This record is, or would be, someone on the Director list. Only the SQL console can change who it belongs to.'
  AND (SELECT institution_email = 'f4@jkkn.example' FROM public.staff WHERE id = :'sF4'));
-- M. The sync linking a legacy record to the account its own email already
-- matched is not a change of who it is; a brand-new account is, and says what to do.
SELECT t.msg(format('UPDATE public.staff SET phone = %L WHERE id = %L', '9000000001', :'sLeg')) AS leg1 \gset
SELECT t.check('an unrelated edit on a legacy unlinked record with an open raise passes',
  :'leg1' = 'ok' AND (SELECT profile_id = :'PL'::uuid FROM public.staff WHERE id = :'sLeg'), :'leg1');
SELECT t.check('an edit that would link a legacy record with an open raise to a brand-new account is refused, saying what to do',
  t.msg(format('UPDATE public.staff SET phone = %L WHERE id = %L', '9000000002', :'sLeg2'))
    = '55000 A salary revision for this person is still open. This change would make the record belong to a different account. Link the record in the SQL console, or make the change after the revision is decided and written.'
  AND (SELECT profile_id IS NULL FROM public.staff WHERE id = :'sLeg2'));
-- N. Email-only identity on the ask: an unlinked record carrying the Director's email.
SELECT t.check('a raise for an unlinked record carrying the Director''s email is refused when asked for',
  t.msg(format('SELECT public.fn_hr_salary_revision_propose(%L, 47000, %L)', :'sU2', 'x'))
    = '42501 The Director''s own pay is decided outside MyJKKN.');
RESET ROLE;
SELECT t.login(NULL);
-- L. A blank email matches nobody, even an account with a blank email.
UPDATE public.staff SET email = '' WHERE id = :'sJ5';
SELECT t.check('a record with a blank email matches no account with a blank email',
  NOT (:'F7'::uuid = ANY (public.hr_salary_revision_email_profile_ids(:'sJ5')))
  AND public.hr_salary_revision_email_profile_ids_for('', '  ') = ARRAY[]::uuid[]);
DELETE FROM auth.users WHERE id IN (:'D', :'PL', :'F7');

-- ── 23. Round seven (3 Oct 2026): taking people off the Director list ──────
-- The list now: D, I, L, HB, M, N; the decider row names D.
\set LIST 'platform.the_director_profile_ids'
RESET ROLE;
SELECT t.login(NULL);
SELECT t.lapse_open_held(:'sL');
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sL', 140000, 'Dean L, second revision') AS req_l2 \gset
RESET ROLE;
SELECT t.check('a raise asked for someone on the list records that they were on it',
  (SELECT subject_was_list_member FROM public.hr_salary_revision_requests WHERE id = :'req_l2') IS TRUE);
-- A list member who is not the Director himself cannot take anyone off.
SELECT set_config('request.jwt.claims', json_build_object('sub', :'I', 'role', 'authenticated')::text, false);
SELECT t.check('a list member who is not the Director himself cannot take someone off the list',
  t.msg(format('UPDATE public.platform_policies SET value = value - %L WHERE policy_key = %L', :'L', :'LIST'))
    = '42501 Only the Director himself can take someone off the Director list.'
  AND (SELECT value ? :'L' FROM public.platform_policies WHERE policy_key = :'LIST'));
SELECT t.check('nobody signed in can take the Director himself off the list',
  t.msg(format('UPDATE public.platform_policies SET value = value - %L WHERE policy_key = %L', :'D', :'LIST'))
    = '42501 Nobody signed in can take the Director himself off the Director list. Only the SQL console can.'
  AND t.msg(format('DELETE FROM public.platform_policies WHERE policy_key = %L', :'LIST'))
    = '42501 Nobody signed in can take the Director himself off the Director list. Only the SQL console can.');
SELECT t.check('switching the list off counts as taking everyone off',
  t.msg(format('UPDATE public.platform_policies SET is_active = false WHERE policy_key = %L', :'LIST'))
    = '42501 Nobody signed in can take the Director himself off the Director list. Only the SQL console can.'
  AND (SELECT is_active FROM public.platform_policies WHERE policy_key = :'LIST'));
SELECT t.msg(format('UPDATE public.platform_policies SET value = value || to_jsonb(%L::text) WHERE policy_key = %L', :'Q', :'LIST')) AS add_q \gset
SELECT t.check('a list member who is not the Director himself can still add someone',
  :'add_q' = 'ok' AND (SELECT value ? :'Q' FROM public.platform_policies WHERE policy_key = :'LIST'), :'add_q');
-- The Director himself can still take someone off (and put them back).
SELECT set_config('request.jwt.claims', json_build_object('sub', :'D', 'role', 'authenticated')::text, false);
SELECT t.msg(format('UPDATE public.platform_policies SET value = value - %L WHERE policy_key = %L', :'Q', :'LIST')) AS rm_q \gset
SELECT t.check('the Director himself can still take someone off the list',
  :'rm_q' = 'ok' AND NOT (SELECT value ? :'Q' FROM public.platform_policies WHERE policy_key = :'LIST'), :'rm_q');
SELECT t.check('nor can the Director himself take himself off',
  t.msg(format('UPDATE public.platform_policies SET value = value - %L WHERE policy_key = %L', :'D', :'LIST'))
    = '42501 Nobody signed in can take the Director himself off the Director list. Only the SQL console can.');
-- Even if L is taken off (here from the SQL console), the raise asked while
-- L was on the list stays the Director's; another list member cannot decide it.
SELECT t.login(NULL);
UPDATE public.platform_policies SET value = value - :'L' WHERE policy_key = :'LIST';
SET ROLE authenticated;
SELECT t.login(:'I');
SELECT t.check('a raise asked while the person was on the Director list stays the Director''s after they are taken off',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_l2'))
    = '42501 This raise is for someone on the Director list. Only the Director himself can decide it.'
  AND t.msg(format('SELECT public.fn_hr_salary_revision_director_approve_many(ARRAY[%L]::uuid[])', :'req_l2'))
    LIKE '42501 1 of the 1 ticked requests are raises for someone on the Director list.%'
  AND (SELECT can_decide FROM public.fn_hr_salary_revision_list('director') WHERE id = :'req_l2') IS FALSE
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_l2') = 'waiting_director',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_l2')));
RESET ROLE;
SELECT t.login(NULL);
UPDATE public.platform_policies SET value = value || to_jsonb(:'L'::text) WHERE policy_key = :'LIST';
-- The Director taken off the list (from the SQL console): he is still himself
-- by the decider row, for the ask, the decisions and the pay.
UPDATE public.platform_policies SET value = value - :'D' WHERE policy_key = :'LIST';
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.check('the Director''s own raise is refused when asked for even when he is off the list',
  t.msg(format('SELECT public.fn_hr_salary_revision_propose(%L, 230000, %L)', :'sD', 'x'))
    = '42501 The Director''s own pay is decided outside MyJKKN.');
SELECT t.check('the Director''s pay cannot be changed by the HR head even when he is off the list',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 5000, p_effective_from => %L)', :'sD', :'OA', :'start2'))
    = '42501 This is the pay of someone on the Director list. Only the Director himself can change it.'
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sD' AND superseded_by IS NULL) = 200000);
SELECT t.login(:'I');
SELECT t.check('another list member cannot decide the Director''s waiting raise even when he is off the list',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_d')) LIKE '%Director list%'
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_d') = 'waiting_director',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_d')));
RESET ROLE;
SELECT t.login(NULL);
UPDATE public.platform_policies SET value = value || to_jsonb(:'D'::text) WHERE policy_key = :'LIST';
SELECT t.check('signed-in users cannot read the decider row through the internal helper',
  NOT has_function_privilege('authenticated', 'public.hr_salary_revision_configured_decider_id()', 'EXECUTE'));
-- Joined the list after the ask, then unlinked: the account kept on the
-- request (the snapshot) still makes it a list member's raise.
\set W2  '00000000-0000-0000-0000-000000010029'
\set sW2 '00000000-0000-0000-0000-00000002002d'
INSERT INTO public.profiles (id, full_name, role, is_super_admin, institution_id) VALUES (:'W2', 'Member W2', 'faculty', false, :'A');
INSERT INTO public.staff (id, profile_id, institution_id, department_id, category_id, first_name, last_name,
                          staff_id, designation, date_of_joining)
VALUES (:'sW2', :'W2', :'A', :'A2', :'C', 'Member', 'W2', 'W37', 'Assistant Professor', '2020-06-01');
INSERT INTO public.hr_staff_salaries (staff_id, hr_organization_id, monthly_gross, effective_from)
VALUES (:'sW2', :'OA', 50000, '2026-04-01');
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sW2', 52000, 'Before joining the list') AS req_w2 \gset
RESET ROLE;
SELECT t.login(NULL);
UPDATE public.platform_policies SET value = value || to_jsonb(:'W2'::text) WHERE policy_key = :'LIST';
UPDATE public.staff SET profile_id = NULL WHERE id = :'sW2';
SET ROLE authenticated;
SELECT t.login(:'I');
SELECT t.check('someone who joined the list after the ask and was then unlinked is still a list member for that raise',
  (SELECT subject_was_list_member FROM public.hr_salary_revision_requests WHERE id = :'req_w2') IS FALSE
  AND t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_w2'))
    = '42501 This raise is for someone on the Director list. Only the Director himself can decide it.',
  t.msg(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'req_w2')));
RESET ROLE;
SELECT t.login(NULL);
UPDATE public.platform_policies SET value = value - :'W2' WHERE policy_key = :'LIST';

-- ── 24. Defence in depth (3 Oct 2026, after review r7) ──────────────────────
-- The approvals job's pass on Employee Salaries: a new row must carry the
-- approved figure, and the named request must still be 'approved'. I, a list
-- member, names requests for herself and tries to write her own pay.
RESET ROLE;
SELECT t.login(NULL);
INSERT INTO public.hr_salary_revision_requests (staff_id, subject_profile_id, institution_id, asked_by, asked_as, route,
  current_monthly_gross, asked_monthly_gross, reason, status, final_monthly_gross, starts_on,
  director_decided_by, director_decided_at, decided_under_rules, subject_was_list_member)
VALUES (:'sI', :'I', :'A', :'H', 'hr_head', 'direct', 165000, 170000, 'Proper yes for I (figure test)', 'approved', 170000, '2099-01-01', :'D', now(), true, true)
RETURNING id AS req_i4 \gset
SELECT set_config('request.jwt.claims', json_build_object('sub', :'I', 'role', 'authenticated')::text, false);
SELECT set_config('app.hr_salary_revision_apply', :'req_i4', false);
SELECT t.check('the job''s pass writes only the approved figure',
  t.msg(format($q$INSERT INTO public.hr_staff_salaries (staff_id, hr_organization_id, monthly_gross, effective_from, superseded_by)
                 SELECT %L, %L, 999999, '2099-01-01', s.id FROM public.hr_staff_salaries s
                  WHERE s.staff_id = %L AND s.superseded_by IS NULL$q$, :'sI', :'OA', :'sI'))
    = '42501 You cannot change your own pay.'
  AND NOT EXISTS (SELECT 1 FROM public.hr_staff_salaries WHERE staff_id = :'sI' AND monthly_gross = 999999));
-- req_i2 (I's second request) was applied in section 15: no longer 'approved'.
SELECT set_config('app.hr_salary_revision_apply', :'req_i2', false);
SELECT t.check('the job''s pass needs the request to be approved still',
  (SELECT status FROM public.hr_salary_revision_requests WHERE id = :'req_i2') = 'applied'
  AND t.msg(format('UPDATE public.hr_staff_salaries SET superseded_by = id WHERE staff_id = %L AND superseded_by IS NULL', :'sI'))
    = '42501 You cannot change your own pay.');
SELECT set_config('app.hr_salary_revision_apply', '', false);
SELECT t.login(NULL);
DELETE FROM public.hr_salary_revision_requests WHERE id = :'req_i4';
-- The decider setting is one row for the whole group: a per-college row is
-- refused even from the SQL console.
SELECT t.check('the decider setting cannot be set for one college',
  t.msg(format($q$INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, data_type, is_active)
                 VALUES (%L, 'institution', %L, to_jsonb(%L::text), 'string', true)$q$, :'KEY', :'A', :'D'))
    LIKE '22023 There is one setting for the whole group%'
  AND NOT EXISTS (SELECT 1 FROM public.platform_policies WHERE policy_key = :'KEY' AND scope_type = 'institution'));

-- ── 25. One row that cannot be written does not stop the others ────────────
-- Two proper yeses due on the same day. The first one's write is made to fail
-- (a test-only trigger standing in for, say, #4122 refusing a past start); it
-- is left as it was with the reason in apply_note, and the second is written.
\set AF1  '00000000-0000-0000-0000-00000001002a'
\set AF2  '00000000-0000-0000-0000-00000001002b'
\set sAF1 '00000000-0000-0000-0000-00000002002e'
\set sAF2 '00000000-0000-0000-0000-00000002002f'
RESET ROLE;
SELECT t.login(NULL);
INSERT INTO public.profiles (id, full_name, role, is_super_admin, institution_id) VALUES
  (:'AF1', 'Member AF1', 'faculty', false, :'A'), (:'AF2', 'Member AF2', 'faculty', false, :'A');
INSERT INTO public.staff (id, profile_id, institution_id, department_id, category_id, first_name, last_name,
                          staff_id, designation, date_of_joining) VALUES
  (:'sAF1', :'AF1', :'A', :'A2', :'C', 'Member', 'AF1', 'A38', 'Assistant Professor', '2020-06-01'),
  (:'sAF2', :'AF2', :'A', :'A2', :'C', 'Member', 'AF2', 'A39', 'Assistant Professor', '2020-06-01');
INSERT INTO public.hr_staff_salaries (staff_id, hr_organization_id, monthly_gross, effective_from)
SELECT id, :'OA'::uuid, 40000, '2026-04-01' FROM public.staff WHERE id IN (:'sAF1', :'sAF2');
INSERT INTO public.hr_salary_revision_requests (staff_id, subject_profile_id, institution_id, asked_by, asked_as, route,
  current_monthly_gross, asked_monthly_gross, reason, status, final_monthly_gross, starts_on,
  director_decided_by, director_decided_at, decided_under_rules, subject_was_list_member)
VALUES (:'sAF1', :'AF1', :'A', :'H', 'hr_head', 'direct', 40000, 41000, 'Will fail', 'approved', 41000, :'start2', :'D', now(), true, false),
       (:'sAF2', :'AF2', :'A', :'H', 'hr_head', 'direct', 40000, 42000, 'Will be written', 'approved', 42000, :'start2', :'D', now(), true, false);
CREATE FUNCTION t.refuse_af1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.staff_id = '00000000-0000-0000-0000-00000002002e' THEN
    RAISE EXCEPTION 'test: this salary write is refused';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER t_refuse_af1 BEFORE INSERT ON public.hr_staff_salaries FOR EACH ROW EXECUTE FUNCTION t.refuse_af1();
SELECT t.msg(format('SELECT public.hr_salary_revision_apply_due_on(%L)', :'start2')) AS af_run \gset
SELECT t.check('one row that cannot be written does not stop the others',
  :'af_run' = 'ok'
  AND (SELECT status = 'approved' AND applied_salary_id IS NULL
              AND apply_note = 'The new pay could not be written: test: this salary write is refused'
         FROM public.hr_salary_revision_requests WHERE staff_id = :'sAF1')
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sAF1' AND superseded_by IS NULL) = 40000
  AND (SELECT status = 'applied' FROM public.hr_salary_revision_requests WHERE staff_id = :'sAF2')
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sAF2' AND superseded_by IS NULL) = 42000,
  :'af_run' || ' | ' || COALESCE((SELECT status || '/' || COALESCE(apply_note, '-') FROM public.hr_salary_revision_requests WHERE staff_id = :'sAF1'), '?'));
SELECT t.check('the job counts only what it wrote',
  public.hr_salary_revision_apply_due_on(:'start2') = 0
  AND (SELECT status FROM public.hr_salary_revision_requests WHERE staff_id = :'sAF1') = 'approved');
DROP TRIGGER t_refuse_af1 ON public.hr_staff_salaries;
