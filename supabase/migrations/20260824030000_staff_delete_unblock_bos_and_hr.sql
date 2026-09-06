-- Staff delete: define what happens to BoS memberships and HR attendance/leave
-- rows instead of letting Postgres refuse the delete.
--
-- WHY: /staff/list could not remove staff members. The failure was a raw 23503
-- surfaced as "Failed to delete staff record". Concrete case (2026-08-14):
-- KRISHNAVENI A / CAS140 / hodclt@jkkn.ac.in (staff 825c1b9b-97b3-4153-b8e4-bd98740fe3b7)
-- was held by three FKs that were all created without an ON DELETE clause, so
-- they defaulted to NO ACTION:
--     bos_members.staff_id            2 rows (one of them Chairman of a composition)
--     hr_attendance_records.employee_id  31 rows
--     hr_leave_balances.employee_id       6 rows
-- This is drift, not design: of the 66 FKs referencing public.staff, 20 are
-- CASCADE, 17 SET NULL, 1 RESTRICT (hr_offboarding_cases — deliberate) and 28
-- are NO ACTION. This migration decides the three that actually block deletes
-- today; the rest are left alone.
--
-- BoS = DETACH, not delete. bos_members is a snapshot table: display_name,
-- display_designation and display_institution already hold the member's
-- identity independent of the staff row (see the sync-from-expert trigger).
-- Its own children — bos_meeting_attendees, bos_ta_da_claims, bos_documents —
-- are themselves NO ACTION, so a CASCADE here would only move the failure one
-- level down AND would erase people from signed meeting minutes. SET NULL keeps
-- the composition, the attendance record and the minutes intact while releasing
-- the staff row.
--
-- HR = CASCADE. hr_attendance_records.employee_id and hr_leave_balances.employee_id
-- are both NOT NULL, so SET NULL is not available: the only alternatives are
-- CASCADE or keep blocking. Attendance and leave-balance rows are per-employee
-- operational data with no meaning once the employee record is gone.

BEGIN;

-- ── 1. BoS membership: release the staff link, keep the snapshot ─────────────

-- bos_members_source_check currently demands EXACTLY ONE of staff_id/expert_id.
-- A detached historic member has neither, so the check has to admit that state.
-- What it still forbids is the genuinely ambiguous row: both set at once.
ALTER TABLE public.bos_members
  DROP CONSTRAINT IF EXISTS bos_members_source_check;

ALTER TABLE public.bos_members
  ADD CONSTRAINT bos_members_source_check
  CHECK (staff_id IS NULL OR expert_id IS NULL);

ALTER TABLE public.bos_members
  DROP CONSTRAINT IF EXISTS bos_members_staff_id_fkey;

ALTER TABLE public.bos_members
  ADD CONSTRAINT bos_members_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

-- A detached member must still render. display_name is already NOT NULL, so the
-- only field that can go blank is the email/contact used by notices — backfill
-- from the staff row before the link is lost.
CREATE OR REPLACE FUNCTION public.fn_bos_members_snapshot_before_staff_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.bos_members m
  SET email      = COALESCE(m.email, OLD.institution_email, OLD.email),
      contact_no = COALESCE(m.contact_no, OLD.phone),
      updated_at = now()
  WHERE m.staff_id = OLD.id;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bos_members_snapshot_before_staff_delete ON public.staff;
CREATE TRIGGER trg_bos_members_snapshot_before_staff_delete
  BEFORE DELETE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.fn_bos_members_snapshot_before_staff_delete();

-- ── 2. HR attendance + leave balances: go with the employee ──────────────────

ALTER TABLE public.hr_attendance_records
  DROP CONSTRAINT IF EXISTS hr_attendance_records_employee_id_fkey;

ALTER TABLE public.hr_attendance_records
  ADD CONSTRAINT hr_attendance_records_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.staff(id) ON DELETE CASCADE;

ALTER TABLE public.hr_leave_balances
  DROP CONSTRAINT IF EXISTS hr_leave_balances_employee_id_fkey;

ALTER TABLE public.hr_leave_balances
  ADD CONSTRAINT hr_leave_balances_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.staff(id) ON DELETE CASCADE;

COMMIT;
