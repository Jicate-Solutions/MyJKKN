-- 20270603090000 stacked on the salary approvals already on main and live
-- (20270519090000 + #4140 20270524090000 + #4190 20271007150103 + #4252
-- 20271007180207). Loaded by run-stacked.sh on the hr-salary-revision seed.
-- Each line prints PASS <rule> or FAIL <rule>.
--
-- The two guards on hr_staff_salaries must both fire:
--   trg_hr_staff_salaries_guard_writes      (this PR: who, and no past start)
--   trg_hr_staff_salaries_no_own_or_list_pay (#4190/#4252: never your own pay,
--                                            a list member's only by the decider)
-- and the approvals job (hr_salary_revision_apply_due_on, #4252's body, the
-- live one) must keep working: an overdue yes goes back to the Director, the
-- next due yes is still written, and a refusal from this PR's past-date check
-- is noted on that one request without stopping the run.
\set ON_ERROR_STOP 0
\set D   '00000000-0000-0000-0000-000000010001'
\set H   '00000000-0000-0000-0000-000000010002'
\set sD  '00000000-0000-0000-0000-000000020001'
\set sF2 '00000000-0000-0000-0000-000000020012'
\set sF4 '00000000-0000-0000-0000-000000020014'
\set sF6 '00000000-0000-0000-0000-000000020016'
\set sF7 '00000000-0000-0000-0000-000000020018'
\set OA  '00000000-0000-0000-0000-000000000ea1'

-- Dates. start1 is the 1st of next month (a yes always starts on a 1st);
-- past1 is the 1st of LAST month, in the past whatever day this runs on.
SELECT public.hr_salary_revision_ist_today() AS today,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '1 month')::date AS start1,
       (date_trunc('month', public.hr_salary_revision_ist_today()) - interval '1 month')::date AS past1,
       (public.hr_salary_revision_ist_today() + 1) AS tomorrow \gset

-- The figure written on the start date (#4252): the pay at the yes plus the
-- annual increment from the live setting, or the whole raise if smaller.
-- Same as hr-salary-revision/probe.sql's t.on_start, worked out from the
-- setting, not from what the code wrote.
CREATE OR REPLACE FUNCTION t.on_start(p_base numeric, p_final numeric) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN p_final <= p_base THEN p_final
              ELSE p_base + LEAST(round(p_base * COALESCE(
                     (SELECT (value->>'annual_increment_percent')::numeric FROM public.platform_policies
                       WHERE policy_key = 'hr.salary_revision.target_rules' AND scope_type = 'global' AND is_active),
                     100) / 100), p_final - p_base) END
$$;
GRANT EXECUTE ON FUNCTION t.on_start(numeric, numeric) TO authenticated;

-- The job as the page runs it: SECURITY DEFINER, owned by the database owner,
-- called by whoever is signed in (fn_hr_salary_revision_apply_due does the
-- same with today's date). Here with a chosen date, so a 1st can be "due".
CREATE OR REPLACE FUNCTION t.apply_on(p date) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.hr_salary_revision_apply_due_on(p)
$$;
GRANT EXECUTE ON FUNCTION t.apply_on(date) TO authenticated;

-- ── 1. Both guards are there, and in this order ────────────────────────────
SELECT t.check('both guards are on hr_staff_salaries, enabled, BEFORE INSERT/UPDATE/DELETE, per row',
  (SELECT count(*) FROM pg_trigger
    WHERE tgrelid = 'public.hr_staff_salaries'::regclass AND NOT tgisinternal AND tgenabled = 'O'
      AND tgname IN ('trg_hr_staff_salaries_guard_writes', 'trg_hr_staff_salaries_no_own_or_list_pay')
      AND (tgtype & 1) = 1      -- ROW
      AND (tgtype & 2) = 2      -- BEFORE
      AND (tgtype & 28) = 28)   -- INSERT, DELETE, UPDATE
  = 2);
-- PostgreSQL fires triggers of the same kind in name order.
SELECT t.check('this PR''s guard fires first, then #4190''s',
  (SELECT array_agg(tgname::text ORDER BY tgname) FROM pg_trigger
    WHERE tgrelid = 'public.hr_staff_salaries'::regclass AND NOT tgisinternal
      AND tgname IN ('trg_hr_staff_salaries_guard_writes', 'trg_hr_staff_salaries_no_own_or_list_pay'))
  = ARRAY['trg_hr_staff_salaries_guard_writes', 'trg_hr_staff_salaries_no_own_or_list_pay']);
SELECT t.check('fn_hr_set_staff_salary has one form (18 arguments), callable by authenticated, not anon',
  (SELECT count(*) = 1 AND bool_and(pronargs = 18) FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary')
  AND has_function_privilege('authenticated', 'public.fn_hr_set_staff_salary(uuid, uuid, numeric, date, text, text, numeric, boolean, boolean, boolean, boolean, boolean, text, numeric, boolean, numeric, numeric, text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.fn_hr_set_staff_salary(uuid, uuid, numeric, date, text, text, numeric, boolean, boolean, boolean, boolean, boolean, text, numeric, boolean, numeric, numeric, text)', 'EXECUTE'));

-- Panel round 1, finding 4 (2026-10-09): the guard lets database code that is
-- not an API role through, so a SECURITY DEFINER function a signed-in user can
-- run would skip the Director check. Every public function that writes
-- hr_staff_salaries, directly or through another one, is listed here; the only
-- definer one signed-in users may run must be the approvals page's
-- fn_hr_salary_revision_apply_due (it writes only a yes the Director already
-- gave, through fn_hr_set_staff_salary, so the past-date refusal still holds).
SELECT t.check('the only SECURITY DEFINER path to a salary write that signed-in or signed-out users can run is fn_hr_salary_revision_apply_due',
  (WITH RECURSIVE w(oid, name) AS (
     SELECT p.oid, p.proname::text
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND (p.proname = 'fn_hr_set_staff_salary'
             OR p.prosrc ~* '(insert[[:space:]]+into|update)[[:space:]]+(public\.)?hr_staff_salaries[^_a-z]')
     UNION
     SELECT p.oid, p.proname::text
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       JOIN w ON p.prosrc ~* ('[^_a-z]' || w.name || '[[:space:]]*\(')
      WHERE n.nspname = 'public' AND p.oid <> w.oid)
   SELECT array_agg(DISTINCT w.name ORDER BY w.name)
     FROM w JOIN pg_proc p ON p.oid = w.oid
    WHERE p.prosecdef
      AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
           OR has_function_privilege('anon', p.oid, 'EXECUTE')))
  = ARRAY['fn_hr_salary_revision_apply_due']);

-- ── 2. Direct writes: each guard still refuses what it owns ────────────────
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.check('the HR head cannot write pay through the function (this PR: Director list only)',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 41000, p_effective_from => %L)',
               :'sF2', :'OA', :'start1')) LIKE '42501 Only the Director can change a salary.%');
SELECT t.check('the HR head cannot insert a pay row directly (this PR''s guard)',
  t.msg(format('INSERT INTO public.hr_staff_salaries (staff_id, hr_organization_id, monthly_gross, effective_from) VALUES (%L, %L, 41000, %L)',
               :'sF2', :'OA', :'start1')) LIKE '42501 Only the Director can change a salary.%');
SELECT t.check('the HR head cannot delete a pay row (this PR''s guard)',
  t.msg(format('DELETE FROM public.hr_staff_salaries WHERE staff_id = %L', :'sF2')) LIKE '42501 Only the Director can change a salary.%');
SELECT t.check('the HR head cannot run the approvals writer directly (finding 4: no EXECUTE for signed-in users)',
  t.msg(format('SELECT public.hr_salary_revision_apply_due_on(%L)', :'start1')) LIKE '42501 permission denied%');
SELECT t.login(:'D');
SELECT t.check('the Director cannot change his own pay (this PR''s guard lets him through, #4190''s refuses)',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 250000, p_effective_from => %L)',
               :'sD', :'OA', :'start1')) LIKE '42501 You cannot change your own pay.%');
SELECT t.check('the Director cannot start a salary in the past (this PR, for every caller)',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 41000, p_effective_from => %L)',
               :'sF2', :'OA', :'past1')) LIKE '22023 A salary change cannot start in the past.%');
SELECT t.check('the Director records a team member''s pay from tomorrow: both guards let it through',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 41000, p_effective_from => %L)',
               :'sF6', :'OA', :'tomorrow')) = 'ok');
RESET ROLE;
SELECT t.check('that write replaced the row in force: one row in force, from tomorrow, the old one pointing at it',
  (SELECT count(*) = 1 AND bool_and(monthly_gross = 41000 AND effective_from = :'tomorrow'::date)
     FROM public.hr_staff_salaries WHERE staff_id = :'sF6' AND superseded_by IS NULL)
  AND (SELECT count(*) = 1 FROM public.hr_staff_salaries WHERE staff_id = :'sF6' AND superseded_by IS NOT NULL));
-- 2 Oct 2026 ruling: a change of the start date alone is not a change. The
-- screens refuse it (Employee Salaries and the team member form); the
-- DATABASE does not: its identical-payload test includes the start date. Kept
-- as a stated fact here, so a later database rule shows up as a change.
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('NOTE (screen-only rule): the database still accepts a date-only change from the Director list',
  t.msg(format('SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, p_monthly_gross => 41000, p_effective_from => %L)',
               :'sF6', :'OA', :'start1')) = 'ok');
RESET ROLE;

-- ── 3. The approvals job under this PR ─────────────────────────────────────
-- Three yeses, asked by the HR head, approved by the Director (as on the page).
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sF2', 44000, 'Covers the evening batch') AS r_overdue \gset
SELECT public.fn_hr_salary_revision_propose(:'sF4', 56000, 'Took over the second lab') AS r_due \gset
SELECT public.fn_hr_salary_revision_propose(:'sF7', 22000, 'New duties') AS r_past \gset
SELECT t.login(:'D');
SELECT t.check('the Director approves the three',
  public.fn_hr_salary_revision_director_decide(:'r_overdue', true) = 'approved'
  AND public.fn_hr_salary_revision_director_decide(:'r_due', true) = 'approved'
  AND public.fn_hr_salary_revision_director_decide(:'r_past', true) = 'approved');
RESET ROLE;
-- The job did not run on two of the start dates: as the console, move their
-- start to the 1st of last month (a real past date).
UPDATE public.hr_salary_revision_requests SET starts_on = :'past1' WHERE id IN (:'r_overdue', :'r_past');
SELECT t.check('setup: one yes due on the 1st of next month, two whose start (the 1st of last month) has passed',
  (SELECT starts_on FROM public.hr_salary_revision_requests WHERE id = :'r_due') = :'start1'::date
  AND (SELECT bool_and(status = 'approved' AND starts_on = :'past1'::date)
         FROM public.hr_salary_revision_requests WHERE id IN (:'r_overdue', :'r_past')));

-- 3a. A run dated in the past (the 1st of last month): r_overdue and r_past
-- are "due" by that date, so the job asks fn_hr_set_staff_salary to write
-- them, and this PR refuses a past start. Each refusal must be noted on its
-- own request and the run must finish, writing nothing.
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.msg(format('SELECT t.apply_on(%L)', :'past1')) AS backdated_run \gset
RESET ROLE;
SELECT t.check('a run dated in the past finishes (the past-date refusal is caught per request)',
  :'backdated_run' = 'ok', :'backdated_run');
SELECT t.check('each refused request keeps its yes and carries the database''s words',
  (SELECT bool_and(status = 'approved' AND applied_salary_id IS NULL
                   AND apply_note LIKE 'The new pay could not be written: A salary change cannot start in the past.%')
     FROM public.hr_salary_revision_requests WHERE id IN (:'r_overdue', :'r_past')),
  (SELECT string_agg(status || ' | ' || COALESCE(apply_note, 'no note'), ' || ') FROM public.hr_salary_revision_requests WHERE id IN (:'r_overdue', :'r_past')));
SELECT t.check('nothing was written for them',
  (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sF2' AND superseded_by IS NULL) = 40000
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sF7' AND superseded_by IS NULL) = 20000);

-- 3b. The run on the 1st of next month, by the HR head (not on the Director
-- list): the overdue yes goes back to the Director, the due one is written.
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT t.check('the run on the start date writes exactly the one yes that is due', t.apply_on(:'start1') = 1);
RESET ROLE;
SELECT t.check('an overdue yes is sent back to the Director, not jammed by the past-date refusal',
  (SELECT bool_and(status = 'waiting_director' AND starts_on IS NULL AND final_monthly_gross IS NULL
                   AND applied_salary_id IS NULL AND apply_note LIKE 'The start date%')
     FROM public.hr_salary_revision_requests WHERE id IN (:'r_overdue', :'r_past'))
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sF2' AND superseded_by IS NULL) = 40000
  AND (SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = :'sF7' AND superseded_by IS NULL) = 20000,
  (SELECT string_agg(status || ' | ' || COALESCE(starts_on::text, 'no start') || ' | ' || COALESCE(apply_note, 'no note'), ' || ')
     FROM public.hr_salary_revision_requests WHERE id IN (:'r_overdue', :'r_past')));
SELECT t.check('the second, due yes is still written: from its start date, at pay + increment, marked applied',
  (SELECT r.status = 'applied' AND r.applied_salary_id = s.id AND s.effective_from = :'start1'::date
          AND s.monthly_gross = t.on_start(52000, 56000) AND s.notes LIKE '%request%'
     FROM public.hr_salary_revision_requests r
     JOIN public.hr_staff_salaries s ON s.staff_id = r.staff_id AND s.superseded_by IS NULL
    WHERE r.id = :'r_due'),
  (SELECT r.status || ' | ' || COALESCE(s.effective_from::text, '?') || ' | ' || COALESCE(s.monthly_gross::text, '?')
     FROM public.hr_salary_revision_requests r
     LEFT JOIN public.hr_staff_salaries s ON s.staff_id = r.staff_id AND s.superseded_by IS NULL
    WHERE r.id = :'r_due'));
SELECT t.check('running it again writes nothing more', public.hr_salary_revision_apply_due_on(:'start1') = 0);
SET ROLE authenticated;
SELECT t.login(:'D');
SELECT t.check('the Director gives the overdue one a fresh yes',
  t.try(format('SELECT public.fn_hr_salary_revision_director_decide(%L, true)', :'r_overdue')) = 'ok');
SELECT t.login(:'H');
SELECT t.check('it is written on the fresh start date', t.apply_on(:'start1') = 1);
RESET ROLE;
SELECT t.check('the fresh yes is the pay in force, from the 1st of next month',
  (SELECT s.effective_from = :'start1'::date AND s.monthly_gross = t.on_start(40000, 44000) AND r.status = 'applied'
     FROM public.hr_salary_revision_requests r
     JOIN public.hr_staff_salaries s ON s.staff_id = r.staff_id AND s.superseded_by IS NULL
    WHERE r.id = :'r_overdue'));
