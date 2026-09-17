-- ============================================================================
-- Fix: the Main Office batch (20260916110000) corrected the WRONG PERSON.
-- Created: 2026-09-16. Found during Dental-institution reconnaissance, which
-- discovered the Main Office source sheet's Employee-ID "DCH060" for a row
-- named "Muthuswamy R" does not actually belong to Muthuswamy R -- DCH060 in
-- the database is Dr. Karthika S (joined 2025-03-31), a real person who was
-- never in scope for this correction. The real Muthuswamy R is DCH008
-- (joined 2008-02-21) and was left untouched at his original 2026-09-07
-- reset baseline (June=1/July=1).
--
-- Fix: (1) revert Dr. Karthika S's June/July CL back to the untouched
-- baseline she should never have left; (2) apply the actual intended
-- correction to Muthuswamy R -- both the Main Office sheet and the dedicated
-- Dental sheet agree June should be 0; they disagree on July (Main Office
-- implied 0, Dental sheet shows "-"/no data) -- per user decision, trust the
-- "-" and leave July untouched at 1.
-- ============================================================================

DO $$
DECLARE
  v_year_id CONSTANT uuid := '2c5d0bb6-d279-4be0-ac2a-cca500e6a484';
  v_cl_type CONSTANT uuid := '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad';
  v_org_id  CONSTANT uuid := '96fb95a4-ef15-46c4-95e1-1078f94a39bd';
  v_admin   CONSTANT uuid := (SELECT id FROM public.profiles WHERE email = 'boobalan.a@jkkn.ac.in');
  v_karthika CONSTANT uuid := 'df1ef62b-f171-43da-9aaa-8981ef5a3712'; -- DCH060, Dr. Karthika S
  v_muthuswamy CONSTANT uuid := '1c6d554c-9e23-49f5-af06-ac4c0a76a186'; -- DCH008, Mr. Muthuswamy R
BEGIN

-- Revert Dr. Karthika S (DCH060) to her original untouched baseline.
UPDATE public.hr_leave_month_entries
   SET days = 1,
       added_days = 1,
       evidence_dates = NULL,
       reason = 'Reverted: incorrectly touched by the Main Office batch (20260916110000), which mistook this person for "Muthuswamy R" due to a scrambled Employee-ID on the source sheet. She was never in scope for that correction.',
       updated_at = now()
 WHERE employee_id = v_karthika
   AND leave_type_id = v_cl_type
   AND hr_academic_year_id = v_year_id
   AND month_start IN ('2026-06-01', '2026-07-01');

-- Apply the actual intended correction to the real Muthuswamy R (DCH008): June 1 -> 0.
INSERT INTO public.hr_leave_month_entries (
  employee_id, leave_type_id, hr_organization_id, hr_academic_year_id,
  month_start, days, added_days, evidence_dates, reason, created_by)
VALUES (
  v_muthuswamy, v_cl_type, v_org_id, v_year_id, DATE '2026-06-01', 0, -1, NULL::date[],
  'Payroll-verified per Paid Leave Summary Jun-Aug 2026 (Dental sheet). Actual target for "Muthuswamy R" (DCH008) -- misapplied to DCH060/Dr. Karthika S in the Main Office batch, fixed here.',
  v_admin)
ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id, month_start)
DO UPDATE SET
  days = EXCLUDED.days,
  added_days = public.hr_leave_month_entries.added_days + (EXCLUDED.days - public.hr_leave_month_entries.days),
  evidence_dates = EXCLUDED.evidence_dates,
  reason = EXCLUDED.reason,
  updated_at = now();

-- Recompute `used` for both affected people.
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
   AND b.employee_id IN (v_karthika, v_muthuswamy);

END $$;
