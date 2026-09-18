-- ============================================================================
-- Fix: Gomathi M's (NOTCAS013) June entry was omitted from 20260916100100.
-- Created: 2026-09-16. Follow-up to the Arts batch, applied same session.
--
-- Her Excel target is 0/3/2. July and August were corrected; June was left at
-- its pre-existing override of 1 by mistake (missing row in the VALUES list).
-- No LOP evidence exists for June at any institution in this project (checked
-- again here, same gap). Fixing directly rather than a full function rerun.
-- ============================================================================

UPDATE public.hr_leave_month_entries
   SET days = 0,
       added_days = added_days + (0 - days),
       reason = reason || ' [June corrected to 0 in a follow-up fix -- omitted from the original batch.]',
       updated_at = now()
 WHERE employee_id = 'aa7c8ed5-e0de-48d0-beee-6fc000d776fd'
   AND leave_type_id = 'f0143572-bb82-4fec-9367-9408d2b39911'
   AND hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'
   AND month_start = '2026-06-01';

UPDATE public.hr_leave_balances
   SET used = COALESCE((
         SELECT SUM(e.days) FROM public.hr_leave_month_entries e
          WHERE e.employee_id = 'aa7c8ed5-e0de-48d0-beee-6fc000d776fd'
            AND e.leave_type_id = 'f0143572-bb82-4fec-9367-9408d2b39911'
            AND e.hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'), 0),
       updated_at = now()
 WHERE employee_id = 'aa7c8ed5-e0de-48d0-beee-6fc000d776fd'
   AND leave_type_id = 'f0143572-bb82-4fec-9367-9408d2b39911'
   AND hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484';
