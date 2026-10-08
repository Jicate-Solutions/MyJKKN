-- Leave approval no longer waits for the biometric upload.
--
-- WHY THE GATE EXISTED (20260829). Approving leave stamps LEAVE / HALF_DAY onto
-- existing hr_attendance_records rows; if the biometric import had not run yet
-- there was no row, the UPDATE matched nothing and the stamp was lost. The gate
-- refused approval until the day was imported.
--
-- WHY IT IS REDUNDANT NOW. The same change made both the attendance import and
-- the recompute route call fn_restamp_leave_attendance(institution, from, to)
-- after they write, which re-stamps every approved leave / comp-off day over the
-- fresh biometric verdict. Approve-before-import is therefore recovered at
-- import time, and the gate only stalled requests: 159 of 219 pending leave
-- requests (81 Casual Leave, 34 On-Duty, 37 Clinical Duty, 7 Comp-Off) were
-- blocked, although On-Duty and Casual Leave carry no punches at all.
--
-- HOW. fn_hr_leave_biometric_gap is the ONE predicate read by both the
-- enforcing trigger (trg_hla_block_approval_without_biometric) and the queue
-- badge / disabled Approve button (hr_leave_approval_queue.biometric_gap_from).
-- Making it return NULL ("approvable") opens both with no change to the queue
-- RPC signature or the UI. Signature kept so those dependants keep working.

CREATE OR REPLACE FUNCTION public.fn_hr_leave_biometric_gap(
  p_employee_id uuid, p_leave_type_id uuid, p_start date, p_end date)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NULL::date;
$$;
