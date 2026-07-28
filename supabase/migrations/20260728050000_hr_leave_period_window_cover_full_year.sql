-- hr_leave_period_window: keep April and May inside a leave period.
--
-- Academic years were just narrowed from a 12-month span (Jun 1 -> May 31) to a
-- 10-month one (Jun 1 -> Mar 31). This function tiles the academic year into
-- month-aligned blocks and clamped the final block to academic_years.end_date,
-- so with a 10-month year:
--
--   quarter,   p_on = 2027-04-15 -> Mar 1 .. Mar 31   (does NOT contain p_on)
--   half_year, p_on = 2027-04-15 -> Dec 1 .. Mar 31   (does NOT contain p_on)
--   year,      p_on = 2027-04-15 -> Jun 1 .. Mar 31   (does NOT contain p_on)
--
-- A window that excludes the date it was asked about makes the per-period caps
-- in hr_trig_leave_enforce_period_cap / hr_trig_sto_enforce_limits (and the
-- hr_leave_period_usage / hr_sto_usage readouts) unenforceable for two months
-- every year: April and May usage is measured against the March window.
--
-- Leave entitlement is annual even though instruction ends in March, so tile a
-- full 12 months from the start date. GREATEST keeps any year that is already
-- >= 12 months on its own end date, which makes this a strict no-op for every
-- pre-existing Jun->May and Nov->Oct year -- only sub-12-month years change.
--
-- Rebuilt from the live definition (the leave-period-cap migration
-- 20260728020000 reuses this function unchanged, so that is the latest body).
-- No signature change: this is a true replace, not a new overload.

CREATE OR REPLACE FUNCTION public.hr_leave_period_window(
  p_period text,
  p_academic_year_id uuid,
  p_on date DEFAULT CURRENT_DATE
)
 RETURNS TABLE(period_start date, period_end date)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ay_start date;
  v_ay_end   date;
  v_eff_end  date;
  v_idx      integer;
  v_len      integer;
BEGIN
  IF p_period = 'month' THEN
    period_start := date_trunc('month', p_on)::date;
    period_end   := (date_trunc('month', p_on) + INTERVAL '1 month - 1 day')::date;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT start_date, end_date INTO v_ay_start, v_ay_end
  FROM public.academic_years WHERE id = p_academic_year_id;

  IF v_ay_start IS NULL THEN
    v_ay_start := date_trunc('year', p_on)::date;
    v_ay_end   := (date_trunc('year', p_on) + INTERVAL '1 year - 1 day')::date;
  END IF;

  -- The tiling span, not the teaching span: a Jun 1 -> Mar 31 academic year
  -- still has to account for leave taken in April and May.
  v_eff_end := GREATEST(v_ay_end, (v_ay_start + INTERVAL '1 year - 1 day')::date);

  IF p_period = 'year' THEN
    period_start := v_ay_start;
    period_end   := v_eff_end;
    RETURN NEXT;
    RETURN;
  END IF;

  v_len := CASE p_period WHEN 'quarter' THEN 3 WHEN 'half_year' THEN 6 ELSE 12 END;

  -- Which whole block of v_len months from the academic year start contains
  -- p_on. Months-between is used rather than day arithmetic so blocks land on
  -- month boundaries regardless of the year's start day.
  v_idx := GREATEST(0, (
    (EXTRACT(YEAR FROM p_on)::int - EXTRACT(YEAR FROM v_ay_start)::int) * 12
    + (EXTRACT(MONTH FROM p_on)::int - EXTRACT(MONTH FROM v_ay_start)::int)
  ) / v_len);

  period_start := (v_ay_start + (v_idx * v_len) * INTERVAL '1 month')::date;
  period_end   := LEAST(
    v_eff_end,
    (v_ay_start + ((v_idx + 1) * v_len) * INTERVAL '1 month' - INTERVAL '1 day')::date);
  RETURN NEXT;
END $function$;
