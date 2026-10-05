-- Comp off: a worked day can be claimed ONCE (2026-10-05).
--
-- Before this, only a PENDING or APPROVED claim blocked the same day
-- (hr_comp_off_credits_employee_date_live_unique + trg_hcoc_day_occupancy).
-- Two holes:
--   * consumed — once a credit was spent, its worked day was free again and
--     could earn a SECOND credit (22 consumed credits exposed);
--   * rejected — a refused day could simply be re-filed.
-- Rule now: pending, approved, consumed and rejected all block the day. Only a
-- claim the staff member WITHDREW frees it (a wrongly picked date).
--
-- Deliberately NOT done in fn_hr_day_occupancy_clash: that function also gates
-- LEAVE (trg_hla_leave_overlap), and a rejected claim must not stop someone
-- taking leave on that day. This check is claims-only.
--
-- Existing data: one (rejected, approved) pair for the same day predates the
-- rule and is left as it is — the trigger judges new claims only.

-- 1) The predicate, one copy. Returns a sentence naming the earlier claim, or NULL.
CREATE OR REPLACE FUNCTION public.fn_hr_comp_off_prior_claim(
  p_employee_id uuid,
  p_worked_date date,
  p_exclude_id  uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  IF p_employee_id IS NULL OR p_worked_date IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.status INTO v_status
  FROM public.hr_comp_off_credits c
  WHERE c.employee_id = p_employee_id
    AND c.worked_date = p_worked_date
    AND c.status IN ('pending', 'approved', 'consumed', 'rejected')
    AND (p_exclude_id IS NULL OR c.id IS DISTINCT FROM p_exclude_id)
  ORDER BY CASE c.status WHEN 'consumed' THEN 0 WHEN 'approved' THEN 1
                         WHEN 'pending' THEN 2 ELSE 3 END
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN format('%s was already claimed (%s). A worked day can be claimed only once.',
    to_char(p_worked_date, 'DD/MM/YYYY'),
    CASE v_status WHEN 'consumed' THEN 'credit already used'
                  WHEN 'approved' THEN 'approved'
                  WHEN 'pending'  THEN 'awaiting approval'
                  ELSE 'rejected' END);
END $$;

-- Internal: called by the trigger only, never through the API.
REVOKE ALL ON FUNCTION public.fn_hr_comp_off_prior_claim(uuid, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_comp_off_prior_claim(uuid, date, uuid) TO service_role;

-- 2) The wall: a new (or re-dated) CLAIM on an already-claimed day is refused.
--    hr_grant / attendance credits are HR's deliberate acts and are not judged.
CREATE OR REPLACE FUNCTION public.hr_trig_comp_off_one_claim_per_day()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prior text;
BEGIN
  IF NEW.source IS DISTINCT FROM 'claim' OR NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  -- Same per-person lock trg_hcoc_day_occupancy takes, so two simultaneous
  -- submissions for one day serialise instead of both passing the check.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.employee_id::text || ':day-occupancy', 0)
  );

  v_prior := public.fn_hr_comp_off_prior_claim(NEW.employee_id, NEW.worked_date, NEW.id);
  IF v_prior IS NOT NULL THEN
    RAISE EXCEPTION '%', v_prior USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hcoc_one_claim_per_day ON public.hr_comp_off_credits;
CREATE TRIGGER trg_hcoc_one_claim_per_day
  BEFORE INSERT OR UPDATE OF worked_date ON public.hr_comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_comp_off_one_claim_per_day();

-- 3) Race backstop, widened to cover a USED credit. Rejected stays out of the
--    index only because one historic (rejected, approved) pair would violate it.
DROP INDEX IF EXISTS public.hr_comp_off_credits_employee_date_live_unique;
CREATE UNIQUE INDEX hr_comp_off_credits_employee_date_live_unique
  ON public.hr_comp_off_credits (employee_id, worked_date)
  WHERE status IN ('pending', 'approved', 'consumed');
