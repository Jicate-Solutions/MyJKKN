-- Short Time Off limits: request-count or total-duration, per period.
--
-- WHY THIS IS NEEDED AT ALL. hr_calc_leave_days does
--   IF p_duration = 'hourly' THEN RETURN 0.125; END IF;
-- so every Permission request counted as 0.125 days regardless of its actual
-- times. A 30-minute request and a 4-hour one were indistinguishable, which
-- makes default_entitled_days = 24 mean "192 requests" — a number nobody
-- intended. The schema simply could not express "max 2 hours per request,
-- 8 hours per month".
--
-- THE ROOT CAUSE IS A UNIT MISMATCH. hr_leave_balances accounts in DAYS, but
-- Short Time Off is measured in MINUTES and Comp Off in CREDITS. Forcing all
-- three through one day-denominated table is what required the magic constant.
-- Each category now uses its own currency:
--   leave            days      hr_leave_balances
--   short_time_off   minutes   these limit columns + duration_minutes
--   compensatory_off credits   hr_comp_off_credits
--
-- TWO MODES, as specified:
--   request_count   cap on how MANY requests per period
--   total_duration  cap on total MINUTES per period
-- Both also carry a minimum and maximum duration per single request.

ALTER TABLE public.hr_leave_types
  ADD COLUMN IF NOT EXISTS sto_limit_mode    varchar NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS sto_limit_period  varchar NOT NULL DEFAULT 'month',
  ADD COLUMN IF NOT EXISTS sto_max_requests  integer,
  ADD COLUMN IF NOT EXISTS sto_total_minutes integer,
  ADD COLUMN IF NOT EXISTS sto_min_minutes   integer,
  ADD COLUMN IF NOT EXISTS sto_max_minutes   integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.hr_leave_types'::regclass
                   AND conname='hr_leave_types_sto_mode_check') THEN
    ALTER TABLE public.hr_leave_types
      ADD CONSTRAINT hr_leave_types_sto_mode_check
      CHECK (sto_limit_mode IN ('none','request_count','total_duration'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.hr_leave_types'::regclass
                   AND conname='hr_leave_types_sto_period_check') THEN
    ALTER TABLE public.hr_leave_types
      ADD CONSTRAINT hr_leave_types_sto_period_check
      CHECK (sto_limit_period IN ('month','quarter','half_year','year'));
  END IF;
  -- A mode without its cap is a rule that silently never fires; reject it at
  -- write time rather than discovering it when nobody is ever blocked.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.hr_leave_types'::regclass
                   AND conname='hr_leave_types_sto_cap_present') THEN
    ALTER TABLE public.hr_leave_types
      ADD CONSTRAINT hr_leave_types_sto_cap_present CHECK (
           sto_limit_mode = 'none'
        OR (sto_limit_mode = 'request_count'  AND sto_max_requests  IS NOT NULL AND sto_max_requests  > 0)
        OR (sto_limit_mode = 'total_duration' AND sto_total_minutes IS NOT NULL AND sto_total_minutes > 0)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.hr_leave_types'::regclass
                   AND conname='hr_leave_types_sto_bounds') THEN
    ALTER TABLE public.hr_leave_types
      ADD CONSTRAINT hr_leave_types_sto_bounds CHECK (
        (sto_min_minutes IS NULL OR sto_min_minutes > 0)
        AND (sto_max_minutes IS NULL OR sto_max_minutes > 0)
        AND (sto_min_minutes IS NULL OR sto_max_minutes IS NULL
             OR sto_min_minutes <= sto_max_minutes)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.hr_leave_types.sto_limit_mode IS
  'Short Time Off cap: none | request_count (sto_max_requests per period) | total_duration (sto_total_minutes per period). Ignored for other request categories.';

-- Per-scope override. A NULL mode means "inherit the type's whole block" —
-- the block is overridden as a unit rather than field by field, because a
-- half-inherited limit ("their max requests, our period") is far harder to
-- reason about than a complete replacement.
ALTER TABLE public.hr_leave_type_assignments
  ADD COLUMN IF NOT EXISTS sto_limit_mode    varchar,
  ADD COLUMN IF NOT EXISTS sto_limit_period  varchar,
  ADD COLUMN IF NOT EXISTS sto_max_requests  integer,
  ADD COLUMN IF NOT EXISTS sto_total_minutes integer,
  ADD COLUMN IF NOT EXISTS sto_min_minutes   integer,
  ADD COLUMN IF NOT EXISTS sto_max_minutes   integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.hr_leave_type_assignments'::regclass
                   AND conname='hlta_sto_mode_check') THEN
    ALTER TABLE public.hr_leave_type_assignments
      ADD CONSTRAINT hlta_sto_mode_check
      CHECK (sto_limit_mode IS NULL
             OR sto_limit_mode IN ('none','request_count','total_duration'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.hr_leave_type_assignments'::regclass
                   AND conname='hlta_sto_period_check') THEN
    ALTER TABLE public.hr_leave_type_assignments
      ADD CONSTRAINT hlta_sto_period_check
      CHECK (sto_limit_period IS NULL
             OR sto_limit_period IN ('month','quarter','half_year','year'));
  END IF;
END $$;

-- The authoritative measure for Short Time Off. total_days stays as it is for
-- compatibility, but it is 0.125 for every hourly row and therefore cannot be
-- summed into a meaningful total.
ALTER TABLE public.hr_leave_applications
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

COMMENT ON COLUMN public.hr_leave_applications.duration_minutes IS
  'Actual minutes for an hourly request, computed from start_time/end_time. NULL for day-based requests. Short Time Off limits aggregate this, never total_days (which is a fixed 0.125 for every hourly row).';

-- Aggregating "minutes used this period" is (employee, type, date-range).
CREATE INDEX IF NOT EXISTS idx_hla_sto_window
  ON public.hr_leave_applications(employee_id, leave_type_id, start_date)
  WHERE duration_minutes IS NOT NULL;
