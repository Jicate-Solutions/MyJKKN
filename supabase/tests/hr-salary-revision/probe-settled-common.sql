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
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '6 month')::date AS m6,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '7 month')::date AS m7,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '8 month')::date AS m8,
       (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '12 month')::date AS m12 \gset
SELECT request_id AS req FROM public.hr_salary_revision_target_plans WHERE staff_id = :'sF4' \gset
CREATE OR REPLACE FUNCTION t.info(p text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE NOTICE 'INFO %', p; END $$;
CREATE OR REPLACE FUNCTION t.dump(p_req uuid) RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT state || ' mir=' || missed_in_row || COALESCE(' note=' || left(run_note, 60), '') FROM public.hr_salary_revision_target_plans WHERE request_id = p_req)
      || ' | ' || (SELECT string_agg(to_char(month, 'YYYY-MM') || ':' || status || CASE WHEN acted THEN '/' || COALESCE(action, '-') || COALESCE('@' || action_effective_from, '') ELSE '/unacted' END, ' ' ORDER BY month)
                     FROM public.hr_salary_revision_target_months WHERE request_id = p_req)
      || ' | pay rows ' || (SELECT count(*) FROM public.hr_staff_salaries s JOIN public.hr_salary_revision_target_plans p ON p.staff_id = s.staff_id WHERE p.request_id = p_req)
$$;
SELECT t.info('start: ' || t.dump(:'req'));
SELECT t.tt(:'sF4', :'A', :'C4', :'m4', (:'m12'::date - 1)) AS tt \gset
UPDATE public.timetables SET department_id = :'DEPT' WHERE id = :'tt';
