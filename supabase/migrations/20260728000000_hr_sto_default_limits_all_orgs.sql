-- Short Time Off: one group-wide limit, replacing "no limit anywhere".
--
-- WHAT WAS WRONG. Ten of the eleven configured Short Time Off types sat at
-- sto_limit_mode='none', and that value makes hr_trig_sto_enforce_limits()
-- return early — no minimum, no maximum, no period cap. Permission was
-- effectively unbounded across the whole group. The eleventh (Jicate
-- Solutions, inactive) still held leftover test values of 121/11/61.
--
-- THE AGREED POLICY, for every HR organization:
--   120 minutes per calendar month, taken in requests of 30 to 60 minutes
-- — so between two and four permissions a month.
--
-- 120 IS NOT IN THE SAME UNIT AS 30 AND 60. sto_total_minutes is the PERIOD
-- BUDGET; sto_min_minutes/sto_max_minutes bound a SINGLE request. See
-- 20260722230000 for why Short Time Off accounts in minutes rather than days.
--
-- sto_max_requests must be NULLed rather than left alone.
-- hr_leave_types_sto_cap_present permits only the active mode's cap, so a
-- stale request-count cap would violate the constraint the moment an admin
-- switched the mode back — a failure that would surface far from this change.

UPDATE public.hr_leave_types
   SET sto_limit_mode    = 'total_duration',
       sto_limit_period  = 'month',
       sto_total_minutes = 120,
       sto_min_minutes   = 30,
       sto_max_minutes   = 60,
       sto_max_requests  = NULL,
       updated_at        = now()
 WHERE request_category = 'short_time_off';

-- These three organizations had no HR leave types at all, so their staff had
-- no way to request permission. JKKN Matric Higher Secondary School (55 staff)
-- and Nattraja Vidhyalya CBSE (44 staff) are live; Nattraja Incubation Forum
-- has none yet but is configured the same way so it needs no follow-up.
--
-- Cloned from the existing "Permission (Hourly)" types, with one deliberate
-- difference: default_entitled_days is 0, not 24. Short Time Off left
-- day-based accounting in 20260722240000 — hr_trig_update_leave_balance()
-- returns early for it — so a non-zero entitlement only seeds hr_leave_balances
-- rows that can never be drawn down. There are already 916 such phantom rows
-- against the existing types; this does not add ~99 more.
INSERT INTO public.hr_leave_types (
  hr_organization_id, leave_type_code, leave_type_name, request_category,
  duration_type, allow_hourly, allow_half_day,
  color_code, display_order, is_active,
  skip_weekends, skip_holidays, requires_approval, is_paid,
  min_advance_notice_days, requires_documents, default_entitled_days,
  accrual_type, accrual_rate, applicable_gender,
  valid_from, valid_until,
  sto_limit_mode, sto_limit_period, sto_total_minutes,
  sto_min_minutes, sto_max_minutes
)
SELECT o.id, 'Permission', 'Permission (Hourly)', 'short_time_off',
       'hourly', true, false,
       '#6B7280', 5, true,
       true, true, true, true,
       0, false, 0,
       'none', 0, 'all',
       now(), NULL,
       'total_duration', 'month', 120,
       30, 60
  FROM public.hr_organizations o
 WHERE o.id IN (
   'e04f5d22-2c8b-4194-a776-b06377aa91fe',  -- JKKN Matric Higher Secondary School
   '151c9ef3-35a6-4f9d-9e94-bb86288fb3ba',  -- Nattraja Vidhyalya CBSE
   'ac001d2b-7f3e-4240-b5d4-13d72dd99370'   -- Nattraja Incubation Forum
 )
ON CONFLICT (hr_organization_id, leave_type_code) DO NOTHING;

-- No hr_leave_type_assignments rows carry an STO override (verified: zero rows
-- with a non-null sto_limit_mode against a short_time_off type), so
-- hr_resolve_sto_limits() falls through to the type for every member of staff
-- and this configuration is genuinely group-wide. If a per-department or
-- per-staff exception is ever needed, it belongs on an assignment — the
-- resolver replaces the type's block AS A UNIT, never field by field.
