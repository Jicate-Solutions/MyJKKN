-- Where a claimed worked day was worked: inside or outside the campus.
--
-- HR asked (2026-09-11) to know where a holiday / week-off was worked before
-- confirming a compensatory off claim. The claim modal captured only the date,
-- notes and proof. Two columns:
--   work_location  'inside_campus' | 'outside_campus'
--   work_place     where, in words -- required for outside_campus, absent otherwise
--
-- REQUIRED ON NEW CLAIMS, NOT ON OLD ROWS. 27 claims predate this (15 still
-- pending) and carry neither. A NOT NULL or a CHECK on work_location would be
-- re-checked on every UPDATE, so approving one of those 15 would fail. The
-- requirement is therefore a BEFORE INSERT trigger scoped to source='claim';
-- hr_grant and attendance credits have no claimant to ask and stay exempt.
-- The CHECKs below only police the COMBINATION, which every existing row (both
-- NULL) already satisfies.
--
-- RLS is unchanged: the policies are row-level, and hcoc_insert_claim /
-- hcoc_select / hcoc_update already govern the rows these columns sit on.

ALTER TABLE public.hr_comp_off_credits
  ADD COLUMN IF NOT EXISTS work_location text,
  ADD COLUMN IF NOT EXISTS work_place    text;

ALTER TABLE public.hr_comp_off_credits
  ADD CONSTRAINT hr_comp_off_credits_work_location_check
    CHECK (work_location IS NULL OR work_location IN ('inside_campus', 'outside_campus')),
  -- Outside campus is only useful with the place named.
  ADD CONSTRAINT hr_comp_off_credits_outside_needs_place
    CHECK (work_location IS DISTINCT FROM 'outside_campus'
           OR NULLIF(btrim(work_place), '') IS NOT NULL),
  -- A place without "outside" would contradict the location it sits beside.
  ADD CONSTRAINT hr_comp_off_credits_place_only_outside
    CHECK (work_place IS NULL OR work_location = 'outside_campus'),
  ADD CONSTRAINT hr_comp_off_credits_work_place_length
    CHECK (work_place IS NULL OR char_length(work_place) <= 200);

COMMENT ON COLUMN public.hr_comp_off_credits.work_location IS
  'Where the claimed day was worked: inside_campus | outside_campus. Required on new source=claim rows (trg_hcoc_require_work_location); NULL on claims filed before 2026-09-11 and on hr_grant/attendance credits.';
COMMENT ON COLUMN public.hr_comp_off_credits.work_place IS
  'Where, in words, when work_location = outside_campus (required then, NULL otherwise).';

CREATE OR REPLACE FUNCTION public.hr_trig_comp_off_require_work_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.source = 'claim' AND NEW.work_location IS NULL THEN
    RAISE EXCEPTION
      'Say where you worked that day — inside or outside the campus — before submitting the claim.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_trig_comp_off_require_work_location() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hcoc_require_work_location ON public.hr_comp_off_credits;
CREATE TRIGGER trg_hcoc_require_work_location
  BEFORE INSERT ON public.hr_comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_comp_off_require_work_location();

-- The claimant's ledger (Balance tab) now shows where each credit was earned.
-- Rebuilt from the live body; only work_location / work_place are added.
CREATE OR REPLACE FUNCTION public.hr_comp_off_balance(p_employee_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_emps uuid[];
  v_out  jsonb;
BEGIN
  IF p_employee_id IS NULL THEN
    v_emps := public.fn_my_staff_ids();
  ELSE
    IF p_employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
       OR public.is_super_admin() THEN
      v_emps := ARRAY[p_employee_id];
    ELSIF public.user_has_permission('hr.leave.approve')
      AND EXISTS (
        SELECT 1
        FROM public.staff s
        JOIN public.hr_organizations o ON o.institution_id = s.institution_id
        WHERE s.id = p_employee_id
          AND o.id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
      ) THEN
      v_emps := ARRAY[p_employee_id];
    ELSE
      RAISE EXCEPTION 'Not authorized to read this compensatory off ledger';
    END IF;
  END IF;

  IF v_emps IS NULL OR array_length(v_emps, 1) IS NULL THEN
    RETURN jsonb_build_object('earned',0,'available',0,'expired',0,'consumed',0,'pending',0,'credits','[]'::jsonb);
  END IF;

  SELECT jsonb_build_object(
    'earned',    COALESCE(sum(credit_days) FILTER (WHERE status IN ('approved','consumed')), 0),
    'available', COALESCE(sum(credit_days) FILTER (WHERE status = 'approved' AND expires_on >= CURRENT_DATE), 0),
    'expired',   COALESCE(sum(credit_days) FILTER (WHERE status = 'approved' AND expires_on <  CURRENT_DATE), 0),
    'consumed',  COALESCE(sum(credit_days) FILTER (WHERE status = 'consumed'), 0),
    'pending',   COALESCE(sum(credit_days) FILTER (WHERE status = 'pending'), 0),
    'credits', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.worked_date DESC)
      FROM (
        SELECT c.id, c.worked_date, c.expires_on, c.credit_days, c.status, c.source,
               c.notes, c.rejection_reason, c.work_location, c.work_place,
               CASE WHEN c.status = 'approved' AND c.expires_on < CURRENT_DATE
                    THEN 'expired' ELSE c.status END AS effective_status,
               GREATEST(0, c.expires_on - CURRENT_DATE) AS days_until_expiry
        FROM public.hr_comp_off_credits c
        WHERE c.employee_id = ANY(v_emps)
      ) x
    ), '[]'::jsonb)
  )
  INTO v_out
  FROM public.hr_comp_off_credits
  WHERE employee_id = ANY(v_emps);

  RETURN COALESCE(v_out, jsonb_build_object('earned',0,'available',0,'expired',0,'consumed',0,'pending',0,'credits','[]'::jsonb));
END $function$;
