-- On Duty (Hourly) gets the same "uncapped" entitlement as day-based On-Duty.
--
-- LeaveService.applyLeave runs an UNCONDITIONAL balance check for every
-- category: an hourly request is estimated at 0.125 days and compared to
-- available = entitled + carried_forward - used. ODH shipped with
-- default_entitled_days = 0 (the admin-form default), so every single request
-- would have been refused at apply time with "Insufficient balance. You have
-- 0.0 day(s) of On Duty (Hourly) available" — dead on arrival.
--
-- 365 rather than a real quota, copying 20260824200000_hr_on_duty_leave_uncapped:
-- On-Duty records duty already performed and the approval is the control, so a
-- quota only misfiles genuine duty under other types. 365 is unreachable inside
-- a 12-month HR year and keeps every downstream sum finite (the column is
-- numeric NOT NULL and the view has no "unlimited" sentinel).
--
-- Note generate_hr_leave_balances stamps the policy value as a LITERAL on any
-- ledger row it creates from now on; existing rows are untouched.

UPDATE public.hr_leave_types
SET default_entitled_days = 365
WHERE leave_type_code = 'ODH'
  AND request_category = 'short_time_off'
  AND default_entitled_days = 0;
