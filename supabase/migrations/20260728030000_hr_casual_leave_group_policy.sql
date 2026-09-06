-- Group-wide Casual Leave policy: 12 days a year, at most 2 in any one month.
--
-- The annual half was ALREADY correct — default_entitled_days was 12.00 on all
-- 11 existing CL types and hr_leave_balances.entitled was 12.00 on all 523 rows
-- for AY 2026-2027. What did not exist was the monthly throttle; the columns and
-- trigger it needs arrive in 20260728020000.
--
-- max_continuous_days DROPS FROM 3 TO 2. Left at 3 it would be unreachable — a
-- 3-day request can never satisfy a 2-day monthly cap — and worse, the apply
-- drawer reads max_continuous_days to validate inline, so a member of staff
-- would be allowed to build a 3-day request and only learn it was impossible
-- when the trigger refused it. Two settings that disagree produce an error
-- message where a disabled button belongs.
--
-- CARRY FORWARD STAYS OFF. allow_carry_forward is already false everywhere, and
-- the HR policy manual at /hr/admin/policies/leave/casual states
-- carry_forward_allowed: false, lapses_at_year_end: true, "CL granted on
-- personal grounds; not encashable; not carried forward." Flipping it is a
-- one-line change if that policy is ever revised.
--
-- 12 a year at 2 a month means CL is drawable in at most 6 months of the year.
-- That is the intended throttle, not an oversight.

UPDATE public.hr_leave_types
   SET leave_limit_period        = 'month',
       leave_max_days_per_period = 2,
       max_continuous_days       = 2,
       default_entitled_days     = 12,
       updated_at                = now()
 WHERE request_category = 'leave'
   AND leave_type_code  = 'CL';

-- Three organizations had no HR leave types at all, so their staff could not
-- request casual leave. JKKN Matric Higher Secondary School (55 staff) and
-- Nattraja Vidhyalya CBSE (44 staff) are live; Nattraja Incubation Forum has no
-- staff yet but is configured identically so it needs no follow-up.
--
-- Cloned from the existing Casual Leave types, already carrying the new policy.
INSERT INTO public.hr_leave_types (
  hr_organization_id, leave_type_code, leave_type_name, request_category,
  duration_type, allow_half_day, allow_hourly,
  color_code, display_order, is_active,
  skip_weekends, skip_holidays, requires_approval, is_paid,
  min_advance_notice_days, max_continuous_days, requires_documents,
  default_entitled_days, allow_carry_forward, is_encashable,
  accrual_type, accrual_rate, applicable_gender,
  valid_from, valid_until,
  leave_limit_period, leave_max_days_per_period
)
SELECT o.id, 'CL', 'Casual Leave', 'leave',
       'full', true, false,
       '#3B82F6', 1, true,
       true, true, true, true,
       0, 2, false,
       12, false, false,
       'none', 0, 'all',
       now(), NULL,
       'month', 2
  FROM public.hr_organizations o
 WHERE o.id IN (
   'e04f5d22-2c8b-4194-a776-b06377aa91fe',  -- JKKN Matric Higher Secondary School
   '151c9ef3-35a6-4f9d-9e94-bb86288fb3ba',  -- Nattraja Vidhyalya CBSE
   'ac001d2b-7f3e-4240-b5d4-13d72dd99370'   -- Nattraja Incubation Forum
 )
ON CONFLICT (hr_organization_id, leave_type_code) DO NOTHING;
