-- ============================================================================
-- Fix: 2 transcription errors found during post-apply verification of the
-- Dental batch (20260916141000). When manually assembling the final
-- migration file from the generator script's output, two rows were
-- transcribed incorrectly:
--   Sathiya T (NOTDCH048): July was written as 0/"reduction" instead of the
--     generator's actual output of 2, evidenced by LOP 07-11/07-13.
--   Saranya P (NOTDCH061): August was written as 1 instead of the
--     generator's actual output of 2 (the two LOP/app dates 08-01 and 08-04
--     were correctly transcribed, only the day count was wrong).
-- Created: 2026-09-16, same session, caught by a full 125-person
-- verification pass against the source Excel before reporting complete.
-- ============================================================================

DO $$
DECLARE
  v_year_id CONSTANT uuid := '2c5d0bb6-d279-4be0-ac2a-cca500e6a484';
  v_cl_type CONSTANT uuid := '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad';
BEGIN

UPDATE public.hr_leave_month_entries
   SET days = 2,
       added_days = added_days + (2 - days),
       evidence_dates = ARRAY[DATE '2026-07-11', DATE '2026-07-13']::date[],
       reason = 'Payroll-verified per Paid Leave Summary Jun-Aug 2026 (Dental sheet). NOTDCH048 [apps: +lop:2026-07-11,2026-07-13] [transcription fix]',
       updated_at = now()
 WHERE employee_id = '5e1d7600-a690-4767-a956-691dc2486907'
   AND leave_type_id = v_cl_type AND hr_academic_year_id = v_year_id AND month_start = '2026-07-01';

UPDATE public.hr_leave_month_entries
   SET days = 2,
       added_days = added_days + (2 - days),
       reason = 'Payroll-verified per Paid Leave Summary Jun-Aug 2026 (Dental sheet). NOTDCH061 [apps: +lop:2026-08-01,2026-08-04] [transcription fix]',
       updated_at = now()
 WHERE employee_id = '443ef77a-31cf-4782-87d5-46a63dce8ea2'
   AND leave_type_id = v_cl_type AND hr_academic_year_id = v_year_id AND month_start = '2026-08-01';

UPDATE public.hr_leave_balances b
   SET used = COALESCE((
         SELECT SUM(e.days) FROM public.hr_leave_month_entries e
          WHERE e.employee_id = b.employee_id AND e.leave_type_id = b.leave_type_id
            AND e.hr_academic_year_id = v_year_id), 0)
       + COALESCE((
         SELECT SUM(a.total_days) FROM public.hr_leave_applications a
          WHERE a.employee_id = b.employee_id AND a.leave_type_id = b.leave_type_id
            AND a.hr_academic_year_id = v_year_id
            AND a.status = 'approved'
            AND NOT EXISTS (SELECT 1 FROM public.hr_leave_month_entries e2
                              WHERE e2.employee_id = a.employee_id AND e2.leave_type_id = a.leave_type_id
                                AND e2.hr_academic_year_id = v_year_id
                                AND e2.month_start = date_trunc('month', a.start_date)::date)), 0),
       updated_at = now()
 WHERE b.hr_academic_year_id = v_year_id
   AND b.leave_type_id = v_cl_type
   AND b.employee_id IN ('5e1d7600-a690-4767-a956-691dc2486907', '443ef77a-31cf-4782-87d5-46a63dce8ea2');

END $$;
