-- 20271009141300: the raise machinery reads the paying trust from
-- hr_staff_payroll. Run by run-paying-trust.sh on the hr-salary-revision seed.
-- Each line prints PASS <rule> or FAIL <rule>.
--
-- The story: F2 is paid by College A. The HR head moves F2 to College B
-- (allowed, Director's ruling), which writes hr_staff_payroll only. College
-- B's register for next month is already closed. The Director approves a
-- raise for F2. It must start the month after (College B's closed month is
-- skipped) and be written with College B. Then the HR head moves F2 again,
-- to College C, and the held part of the raise is paid: that write must carry
-- College C.
-- F4 has no payroll row at all: their raise keeps the salary row's payer.
\set ON_ERROR_STOP 0
\set D   '00000000-0000-0000-0000-000000010001'
\set H   '00000000-0000-0000-0000-000000010002'
\set sF2 '00000000-0000-0000-0000-000000020012'
\set sF4 '00000000-0000-0000-0000-000000020014'
\set OA  '00000000-0000-0000-0000-000000000ea1'
\set OB  '00000000-0000-0000-0000-000000000eb2'
\set OC  '00000000-0000-0000-0000-000000000ec3'

SELECT (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '1 month')::date AS start1,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '2 months')::date AS start2,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '3 months')::date AS start3 \gset

INSERT INTO public.hr_organizations VALUES (:'OC', '00000000-0000-0000-0000-0000000000a1', 'College C');
-- As the owner: everybody's payer on record is the payer on their salary row,
-- as on production, except F4, who has none yet.
INSERT INTO public.hr_staff_payroll (staff_id, hr_organization_id)
SELECT staff_id, hr_organization_id FROM public.hr_staff_salaries
 WHERE superseded_by IS NULL AND staff_id <> :'sF4';
-- The HR head moves F2 to College B. On the staff form this is an upsert on
-- hr_staff_payroll and no salary write (#4122: only the Director list writes pay).
UPDATE public.hr_staff_payroll SET hr_organization_id = :'OB', updated_at = now() WHERE staff_id = :'sF2';
-- College B's register for next month is closed; College A's is not.
INSERT INTO public.hr_salary_register_runs (hr_organization_id, period_year, period_month)
VALUES (:'OB', EXTRACT(YEAR FROM :'start1'::date)::int, EXTRACT(MONTH FROM :'start1'::date)::int);

SELECT t.check('setup: F2''s salary row still names College A; the payer on record is College B',
  (SELECT hr_organization_id FROM public.hr_staff_salaries WHERE staff_id = :'sF2' AND superseded_by IS NULL) = :'OA'::uuid
  AND (SELECT hr_organization_id FROM public.hr_staff_payroll WHERE staff_id = :'sF2') = :'OB'::uuid);

-- Two raises, asked by the HR head, approved by the Director (as on the page).
SET ROLE authenticated;
SELECT t.login(:'H');
SELECT public.fn_hr_salary_revision_propose(:'sF2', 44000, 'Moved to College B with more hours') AS r_f2 \gset
SELECT public.fn_hr_salary_revision_propose(:'sF4', 56000, 'Took over the second lab') AS r_f4 \gset
SELECT t.login(:'D');
SELECT t.check('the Director approves both',
  public.fn_hr_salary_revision_director_decide(:'r_f2', true) = 'approved'
  AND public.fn_hr_salary_revision_director_decide(:'r_f4', true) = 'approved');
RESET ROLE;
SELECT t.login(NULL);

SELECT t.check('the raise skips the month the NEW paying trust has closed: it starts the month after',
  (SELECT starts_on FROM public.hr_salary_revision_requests WHERE id = :'r_f2') = :'start2'::date,
  (SELECT COALESCE(starts_on::text, 'no start') FROM public.hr_salary_revision_requests WHERE id = :'r_f2'));
SELECT t.check('F4 (no payer on record) starts on the 1st of next month, as before',
  (SELECT starts_on FROM public.hr_salary_revision_requests WHERE id = :'r_f4') = :'start1'::date);

-- The approvals job on each start date (owner, as the cron runs it).
SELECT t.check('the job writes F4 on the 1st of next month', public.hr_salary_revision_apply_due_on(:'start1') = 1);
SELECT t.check('the job writes F2 on the month after', public.hr_salary_revision_apply_due_on(:'start2') = 1);
SELECT t.check('the approved raise is written with the NEW paying trust (College B), not the salary row''s copy',
  (SELECT r.status = 'applied' AND s.id = r.applied_salary_id AND s.hr_organization_id = :'OB'::uuid
     FROM public.hr_salary_revision_requests r
     JOIN public.hr_staff_salaries s ON s.staff_id = r.staff_id AND s.superseded_by IS NULL
    WHERE r.id = :'r_f2'),
  (SELECT r.status || ' | ' || COALESCE(o.name, '?')
     FROM public.hr_salary_revision_requests r
     LEFT JOIN public.hr_staff_salaries s ON s.staff_id = r.staff_id AND s.superseded_by IS NULL
     LEFT JOIN public.hr_organizations o ON o.id = s.hr_organization_id
    WHERE r.id = :'r_f2'));
SELECT t.check('nobody on record: the raise keeps the salary row''s payer (College A)',
  (SELECT r.status = 'applied' AND s.hr_organization_id = :'OA'::uuid
     FROM public.hr_salary_revision_requests r
     JOIN public.hr_staff_salaries s ON s.staff_id = r.staff_id AND s.superseded_by IS NULL
    WHERE r.id = :'r_f4'));

-- The held part (target-gated raises): the HR head moves F2 again, to College
-- C (a payer neither salary row names), then the
-- held part is paid by the monthly run's writer (owner, as the cron runs it),
-- run on the 1st of the month after the raise started, so it starts that day.
UPDATE public.hr_staff_payroll SET hr_organization_id = :'OC', updated_at = now() WHERE staff_id = :'sF2';
-- Measurement is switched off as shipped, so the plan waits for it; as the
-- owner, put it where a met month leaves it (measurement on, waiting).
UPDATE public.hr_salary_revision_target_plans SET state = 'waiting' WHERE request_id = :'r_f2' AND state = 'awaiting_measurement';
SELECT t.check('setup: F2''s raise has a held part waiting',
  EXISTS (SELECT 1 FROM public.hr_salary_revision_target_plans WHERE request_id = :'r_f2' AND held_amount > 0),
  (SELECT COALESCE(string_agg(state || ' held ' || held_amount, ', '), 'no plan') FROM public.hr_salary_revision_target_plans WHERE request_id = :'r_f2'));
SELECT t.msg(format('SELECT public.hr_salary_revision_target_pay(%L, ''release'', %L)', :'r_f2', :'start3')) AS released \gset
SELECT t.check('the held part is written', :'released' = 'ok', :'released');
SELECT t.check('the held part is written with the payer on record now (College C), not the copy on the row it replaced',
  (SELECT s.hr_organization_id = :'OC'::uuid AND s.effective_from = :'start3'::date
          AND s.notes LIKE 'Held part of a salary revision paid%'
     FROM public.hr_staff_salaries s WHERE s.staff_id = :'sF2' AND s.superseded_by IS NULL),
  (SELECT COALESCE(o.name, '?') || ' | ' || COALESCE(s.notes, '')
     FROM public.hr_staff_salaries s LEFT JOIN public.hr_organizations o ON o.id = s.hr_organization_id
    WHERE s.staff_id = :'sF2' AND s.superseded_by IS NULL));
