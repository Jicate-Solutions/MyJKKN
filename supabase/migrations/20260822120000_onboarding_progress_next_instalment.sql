-- =============================================================================
-- 20260822120000_onboarding_progress_next_instalment.sql
--
-- The Awaiting Payment tier of /learners/onboarding can say HOW MUCH a learner
-- still owes to clear the gate, but not WHEN the next money is actually due.
-- That was fine when a bill was one amount on one date. Now a fee can be
-- collectable in tranches, and "₹30,000 to go" without "by 06 Sept" is half a
-- collections call.
--
-- WHAT WAS ALREADY CORRECT — deliberately not touched
-- --------------------------------------------------
-- The percentages this RPC returns come from vw_learner_payment_progress, which
-- became tranche-aware in 20260822110000. So the maths on that tab was already
-- right; only the schedule detail was missing. An audit of every function that
-- computes a fee percentage found:
--
--   evaluate_learner_status_after_payment   reads the view  ✓
--   fn_activate_learner_from_onboarding     reads the view  ✓
--   fn_onboarding_payment_progress          reads the view  ✓
--   fn_learner_academic_payment_progress    does NOT — and should not.
--
-- That last one backs the Campus Living hostel-upgrade gates and measures a
-- DIFFERENT thing on purpose: the share of the whole academic year's fees paid,
-- not the share of what has fallen due. A learner should not qualify for a room
-- upgrade merely because their first instalment was the only thing due yet. It
-- is also arithmetically unaffected by this feature — tranches live inside a
-- bill and sum to it, so SUM(final_amount) is identical either way.
--
-- ⚠️ RETURNS TABLE changes, so this is DROP + CREATE. DROP FUNCTION discards
-- grants and Supabase's default privileges hand EXECUTE back to PUBLIC, so the
-- grants are re-asserted at the end.
--
-- NO BEGIN/COMMIT: the apply path wraps this file in one transaction.
-- =============================================================================

DO $guard$
BEGIN
  IF to_regclass('public.billing_bill_instalments') IS NULL THEN
    RAISE EXCEPTION 'REFUSING: 20260822090000 has not been applied.';
  END IF;
END
$guard$;

DROP FUNCTION IF EXISTS public.fn_onboarding_payment_progress(uuid[]);

CREATE FUNCTION public.fn_onboarding_payment_progress(p_learner_ids uuid[])
RETURNS TABLE(
  learner_id uuid, target_code text, target_label text,
  threshold_pct numeric, threshold_basis text, achieved_pct numeric,
  basis_billed numeric, basis_paid numeric, basis_balance numeric,
  total_billed numeric, total_paid numeric, total_balance numeric,
  amount_to_threshold numeric, meets_threshold boolean, has_basis_due boolean,
  -- ADDED 2026-08-22
  next_due_date date, next_due_amount numeric,
  instalments_total integer, instalments_settled integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target_code   text;
  v_target_label  text;
  v_threshold     numeric;
  v_basis         text;
  v_is_super      boolean := COALESCE(public.is_super_admin(), false);
  v_perm          boolean;
BEGIN
  IF p_learner_ids IS NULL OR array_length(p_learner_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT s.code, s.label, s.fee_paid_threshold_percent, s.threshold_basis
    INTO v_target_code, v_target_label, v_threshold, v_basis
  FROM public.admission_statuses s
  WHERE s.scope = 'learner'
    AND s.is_active = true
    AND s.fee_paid_threshold_percent IS NOT NULL
    AND s.gates_login = false
    AND s.auto_promote_when_universal_paid = false
  ORDER BY s.fee_paid_threshold_percent ASC
  LIMIT 1;

  v_basis := COALESCE(v_basis, 'due_to_date');

  v_perm := (
    COALESCE(public.user_has_permission('learners.admissions.view'::text), false)
    OR COALESCE(public.user_has_permission('learners.profiles.view'::text), false)
    OR COALESCE(public.user_has_permission('learners.view'::text), false)
  );

  RETURN QUERY
  WITH visible AS (
    SELECT lp.id, lp.institution_id
    FROM public.learners_profiles lp
    WHERE lp.id = ANY (p_learner_ids)
      AND (
        v_is_super
        OR (v_perm AND public.role_has_institution_access(lp.institution_id))
        OR lp.student_email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
        OR lp.college_email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
      )
  ),
  -- The waterfall, inline. Not read from vw_bill_instalment_state because that
  -- view is security_invoker: inside this SECURITY DEFINER function it would be
  -- filtered by whoever is calling, so two admins could see different schedules
  -- for the same learner.
  tranche AS (
    SELECT
      b.student_id,
      i.due_date,
      i.amount,
      (LEAST(
         GREATEST(
           GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount))
           - COALESCE(SUM(i.amount) OVER (
               PARTITION BY i.bill_id ORDER BY i.due_date, i.sequence_no
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0),
           0),
         i.amount) >= i.amount) AS is_settled
    FROM public.billing_bill_instalments i
    JOIN public.billing_student_bills b ON b.id = i.bill_id
    WHERE b.student_id IN (SELECT id FROM visible)
      AND b.status NOT IN ('cancelled', 'superseded')
  ),
  sched AS (
    SELECT
      t.student_id,
      -- The earliest tranche still owed: what a collections call is about.
      MIN(t.due_date) FILTER (WHERE NOT t.is_settled) AS next_due,
      COUNT(*)::int                                    AS n_total,
      COUNT(*) FILTER (WHERE t.is_settled)::int        AS n_settled
    FROM tranche t
    GROUP BY t.student_id
  ),
  next_amt AS (
    -- Sum rather than MIN(amount): two tranches can share one date, and the
    -- caller is owed both of them on it.
    SELECT t.student_id, SUM(t.amount) AS amt
    FROM tranche t
    JOIN sched s2 ON s2.student_id = t.student_id AND s2.next_due = t.due_date
    WHERE NOT t.is_settled
    GROUP BY t.student_id
  ),
  progress AS (
    SELECT
      vis.id AS lid,
      CASE v_basis
        WHEN 'billed_to_date'           THEN v.pct_billed_to_date
        WHEN 'due_to_date_current_year' THEN v.pct_due_current_year
        ELSE                                 v.pct_due_to_date
      END AS pct,
      CASE v_basis
        WHEN 'billed_to_date'           THEN v.countable_billed
        WHEN 'due_to_date_current_year' THEN v.due_cy_billed
        ELSE                                 v.due_billed
      END AS b_billed,
      CASE v_basis
        WHEN 'billed_to_date'           THEN v.countable_paid
        WHEN 'due_to_date_current_year' THEN v.due_cy_paid
        ELSE                                 v.due_paid
      END AS b_paid,
      v.countable_billed AS t_billed,
      v.countable_paid   AS t_paid
    FROM visible vis
    JOIN public.vw_learner_payment_progress v ON v.learner_id = vis.id
  )
  SELECT
    p.lid,
    v_target_code,
    v_target_label,
    v_threshold,
    v_basis,
    COALESCE(p.pct, 0),
    COALESCE(p.b_billed, 0),
    COALESCE(p.b_paid, 0),
    COALESCE(p.b_billed, 0) - COALESCE(p.b_paid, 0),
    COALESCE(p.t_billed, 0),
    COALESCE(p.t_paid, 0),
    COALESCE(p.t_billed, 0) - COALESCE(p.t_paid, 0),
    CASE
      WHEN v_threshold IS NULL OR COALESCE(p.b_billed, 0) <= 0 THEN NULL
      ELSE GREATEST(0, CEIL(p.b_billed * v_threshold / 100.0) - COALESCE(p.b_paid, 0))
    END,
    (v_threshold IS NOT NULL AND COALESCE(p.b_billed, 0) > 0 AND COALESCE(p.pct, 0) >= v_threshold),
    (COALESCE(p.b_billed, 0) > 0),
    -- NULL for a learner with no schedule, which is every learner whose fees
    -- predate this feature. The UI shows an em-dash, not a fabricated date.
    sc.next_due,
    na.amt,
    COALESCE(sc.n_total, 0),
    COALESCE(sc.n_settled, 0)
  FROM progress p
  LEFT JOIN sched    sc ON sc.student_id = p.lid
  LEFT JOIN next_amt na ON na.student_id = p.lid;
END;
$function$;

COMMENT ON FUNCTION public.fn_onboarding_payment_progress(uuid[]) IS
  'Fee position for the Awaiting Payment tier. Percentages come from vw_learner_payment_progress so the number on screen and the number in the promotion gate cannot drift. As of 2026-08-22 it also returns the next unsettled instalment (date and amount) and how far through the schedule the learner is — NULL for a learner with no schedule.';

REVOKE ALL ON FUNCTION public.fn_onboarding_payment_progress(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_onboarding_payment_progress(uuid[])
  TO authenticated, service_role;
