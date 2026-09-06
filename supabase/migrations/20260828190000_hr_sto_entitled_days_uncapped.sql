-- Short Time Off: lift every type off default_entitled_days = 0.
--
-- For request_category='short_time_off' the day entitlement is a GATE, never a
-- budget. hr_trig_update_leave_balance() early-returns for the category, so
-- `used` is never incremented by anything, anywhere -- sum(used) = 0.00 across
-- every STO balance row in production. The real budget is minutes:
-- sto_limit_mode='total_duration' with sto_total_minutes per period, enforced by
-- hr_trig_sto_enforce_limits().
--
-- Left at 0 the gate closes permanently: LeaveService.applyLeave priced an
-- hourly request at 0.125 days and refused it against available = 0, so every
-- submit died with "Insufficient balance. You have 0.0 day(s) of Permission
-- (Hourly) available". 101 staff were shut out this way:
--
--   JKKN Matric Higher Secondary School   55   type 0, rows NULL -> policy 0
--   Nattraja Vidhyalya CBSE               33   same
--   Jicate Solutions                      13   type 0 AND 13 rows frozen at 0
--
-- 0 is the leave-type admin form's default for default_entitled_days, which is
-- why three orgs configured Permission and one configured nothing else wrong.
-- The companion fix in lib/services/hr/leave-service.ts stops the day check from
-- running for this category at all; this migration makes the stored config say
-- the same thing, so nobody reading hr_leave_types later concludes the type is
-- deliberately capped at zero days.
--
-- 365 is the established "uncapped by day count" sentinel in this module --
-- default_entitled_days is numeric NOT NULL and no unlimited value exists. Same
-- convention as On Duty (Hourly) in 20260827140000_hr_odh_entitled_days_uncapped.sql.

BEGIN;

-- 1. The four types still sitting at the form default.
--    Permission (Hourly) at: Jicate Solutions, JKKN Matric Higher Secondary
--    School, Nattraja Incubation Forum, Nattraja Vidhyalya CBSE.
UPDATE public.hr_leave_types
   SET default_entitled_days = 365,
       updated_at            = now()
 WHERE request_category      = 'short_time_off'
   AND default_entitled_days = 0;

-- 2. Jicate's 13 frozen zeros. A literal on hr_leave_balances.entitled detaches
--    the row from the policy default, so step 1 alone would not reach them --
--    they would still resolve entitlement_source='frozen' at 0.
--
--    NULL, not 365: NULL means "follow policy" and keeps tracking any future
--    change to default_entitled_days. Writing a literal is what created this
--    problem in the first place.
--
--    Scoped to unfrozen years. 2024-2025 and 2025-2026 carry frozen_at, and
--    v_hr_leave_balance_src reads frozen years from the balance rows themselves
--    -- rewriting entitled there would rewrite closed history.
UPDATE public.hr_leave_balances b
   SET entitled   = NULL,
       updated_at = now()
  FROM public.hr_leave_types t,
       public.hr_academic_years y
 WHERE t.id                 = b.leave_type_id
   AND y.id                 = b.hr_academic_year_id
   AND t.request_category   = 'short_time_off'
   AND b.entitled           = 0
   AND y.frozen_at IS NULL;

COMMIT;
