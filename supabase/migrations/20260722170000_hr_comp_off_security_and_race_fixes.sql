-- Security and concurrency fixes for the compensatory off ledger, from the
-- adversarial review on PR #2274. Four findings, all reproduced before fixing.
--
-- CRITICAL — cross-tenant ledger read. hr_comp_off_balance is SECURITY
-- DEFINER, so it bypasses RLS, yet it authorized an explicit p_employee_id on
-- the GLOBAL hr.leave.approve permission with no organization term. An
-- approver at one institution could read any employee's ledger at any other.
-- The hcoc_select policy it mirrors ANDs that permission with
-- fn_my_hr_organization_ids(); the RPC dropped it. This is the same hole
-- 20260721120150 fixed in generate_hr_leave_balances — repeated.
-- Scope is proved from where the employee WORKS (staff -> hr_organizations),
-- not from whether a credit already exists, so an approver opening a
-- colleague with an empty ledger sees zeros rather than "Not authorized".
--
-- HIGH — double-spend race. The availability sum and the FIFO selection were
-- plain SELECTs. Under READ COMMITTED two concurrent approvals for the same
-- employee both saw the same credit as available and both consumed it.
-- Candidates are now taken FOR UPDATE behind a per-employee advisory lock,
-- and the UPDATE re-asserts status='approved' so a row that lost the race is
-- skipped rather than spent twice. If the loop cannot satisfy the request it
-- raises rather than approving a partially-funded booking.
--
-- MEDIUM — destroyed partial credits. Whole credits were marked consumed even
-- when the booking needed less than credit_days, so a 0.5-day request
-- silently destroyed half a credit. Comp off is earned in whole days, so
-- fractional bookings are now rejected outright; the Apply form offers full
-- day only to match.
--
-- MEDIUM — approver self-grant. The approver INSERT branch had no
-- source/status/employee restriction, so a holder of hr.leave.approve could
-- insert an already-approved hr_grant for their OWN employee_id, defeating
-- the self-approval block the UPDATE policy enforces. Approvers may now only
-- create credits for other people.
--
-- LOW — fn_my_staff_ids() was sampled with LIMIT 1 and no ORDER BY, giving a
-- caller with several staff records a nondeterministic ledger. The own-ledger
-- case now aggregates across all of them.
--
-- Verified after applying: cross-employee read refused; self-grant produced 0
-- rows.


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
               c.notes, c.rejection_reason,
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

REVOKE ALL ON FUNCTION public.hr_comp_off_balance(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_comp_off_balance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_trig_comp_off_consume()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_category text;
  v_needed   numeric;
  v_avail    numeric;
  r          record;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT request_category INTO v_category
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
  IF v_category IS DISTINCT FROM 'compensatory_off' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    v_needed := NEW.total_days;

    -- Credits are whole days; a partial booking would strand the remainder.
    IF v_needed <> floor(v_needed) THEN
      RAISE EXCEPTION
        'Compensatory off must be booked in whole days (requested %). Credits are earned one full day per day worked.',
        v_needed;
    END IF;

    -- Serialise concurrent approvals for this employee. Without the lock two
    -- approvers could both read the same credit as available.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.employee_id::text, 0));

    SELECT COALESCE(sum(credit_days), 0) INTO v_avail
    FROM public.hr_comp_off_credits
    WHERE employee_id = NEW.employee_id
      AND status = 'approved'
      AND expires_on >= CURRENT_DATE;

    IF v_avail < v_needed THEN
      RAISE EXCEPTION
        'Insufficient compensatory off: % day(s) available, % requested. Approve a comp-off claim first.',
        v_avail, v_needed;
    END IF;

    FOR r IN
      SELECT id, credit_days FROM public.hr_comp_off_credits
      WHERE employee_id = NEW.employee_id
        AND status = 'approved'
        AND expires_on >= CURRENT_DATE
      ORDER BY expires_on, worked_date
      FOR UPDATE
    LOOP
      EXIT WHEN v_needed <= 0;
      -- status re-asserted here: a row that lost the race is skipped rather
      -- than spent a second time.
      UPDATE public.hr_comp_off_credits
         SET status = 'consumed',
             consumed_by_application_id = NEW.id,
             consumed_at = now()
       WHERE id = r.id AND status = 'approved';
      IF FOUND THEN
        v_needed := v_needed - r.credit_days;
      END IF;
    END LOOP;

    IF v_needed > 0 THEN
      RAISE EXCEPTION 'Compensatory off credits were consumed concurrently; please retry.';
    END IF;

  ELSIF NEW.status IN ('cancelled','rejected','withdrawn') AND OLD.status = 'approved' THEN
    UPDATE public.hr_comp_off_credits
       SET status = 'approved',
           consumed_by_application_id = NULL,
           consumed_at = NULL
     WHERE consumed_by_application_id = NEW.id;
  END IF;

  RETURN NEW;
END $function$;

-- Approvers may only create credits for OTHER people; their own must go
-- through claim + someone else's approval like everyone else's.
DROP POLICY IF EXISTS hcoc_insert_claim ON public.hr_comp_off_credits;
CREATE POLICY hcoc_insert_claim ON public.hr_comp_off_credits
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
      AND source = 'claim'
      AND status = 'pending'
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
    )
    OR (
      public.user_has_permission('hr.leave.approve')
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
      AND employee_id NOT IN (SELECT unnest(public.fn_my_staff_ids()))
    )
  );
