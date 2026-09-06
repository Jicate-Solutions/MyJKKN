-- =============================================================================
-- 20260822110000_instalment_aware_threshold_and_late_charge.sql
--
-- PHASES 5 + 6 of "One bill per fee, with an instalment schedule inside it".
--
-- §1  vw_learner_payment_progress learns about tranches. It is the view the
--     whole fee ladder rests on, so this is the highest-stakes change in the
--     feature — and it is written so that a bill with NO tranches takes the
--     identical arithmetic it takes today.
--
-- §2  evaluate_learner_status_after_payment reads tranches instead of matching
--     sibling bills by instalment_no.
--
-- §3  fn_late_charge_derivation stops charging on the WHOLE balance.
--
-- WHY §3 IS NOT OPTIONAL
-- ----------------------
-- The function accrues 10%/month, COMPOUNDING, on billing_student_bills
-- .balance_amount from due_date + grace. Under the old split model each bill
-- was one tranche, so the balance and the overdue amount were the same number.
-- Now a single Rs 1,00,000 tuition bill carries three tranches — and the moment
-- the first Rs 30,000 tranche slipped, the learner would be fined on the entire
-- Rs 1,00,000. That is a 3x over-charge, compounding monthly.
--
-- It is safe to fix precisely now because the machinery is DORMANT: the rate is
-- configured at 10% and 3,024 bills carry a fine_effective_date, but ZERO
-- penalty bills have ever been raised and ZERO bills are currently marked
-- overdue. There is no history to reconcile — only a landmine to defuse before
-- someone turns it on.
--
-- The fix deliberately under-charges rather than over-charges: it compounds one
-- overdue TOTAL from the earliest overdue tranche, instead of compounding each
-- tranche separately from its own date. Per-tranche accrual is the more precise
-- model and can follow; charging a learner too much is the failure that cannot
-- be walked back.
--
-- NO BEGIN/COMMIT: the apply path wraps this file in one transaction.
-- =============================================================================

DO $guard$
BEGIN
  IF to_regclass('public.billing_bill_instalments') IS NULL THEN
    RAISE EXCEPTION 'REFUSING: phase 1 (20260822090000) has not been applied.';
  END IF;
END
$guard$;

-- =============================================================================
-- §1 The threshold view, tranche-aware
-- =============================================================================
-- CREATE OR REPLACE VIEW cannot reorder, rename or drop a column, so all 14
-- keep their name, type and position. Only how `due_amount` is derived changes.
--
--   bill WITH tranches : due = sum of tranche amounts whose date has arrived
--   bill WITHOUT       : due = final_amount when due_date has arrived, else 0
--                        — byte for byte the previous expression
--
-- The numerator is LEAST(paid, due) rather than paid: that is the waterfall
-- restated. Money settles the oldest tranche first, so a learner who pays ahead
-- of schedule cannot have the surplus counted against a tranche that is not yet
-- due — which would inflate their percentage and promote them early.
--
-- A bill with no billing_category (bc.kind IS NULL) is excluded from the
-- countable totals by `bc.kind <> 'application_fee'` evaluating to NULL. That
-- is pre-existing behaviour, preserved deliberately rather than "fixed" here.

CREATE OR REPLACE VIEW public.vw_learner_payment_progress
WITH (security_invoker = true) AS
WITH bill AS (
  SELECT
    b.id,
    b.student_id,
    bc.kind        AS category_kind,
    b.status       AS bill_status,
    b.final_amount,
    GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount)) AS paid,
    (ayr.start_date <= CURRENT_DATE AND ayr.end_date >= CURRENT_DATE) AS in_current_ay,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.billing_bill_instalments i WHERE i.bill_id = b.id)
        THEN COALESCE((SELECT SUM(i.amount)
                         FROM public.billing_bill_instalments i
                        WHERE i.bill_id = b.id
                          AND i.due_date <= CURRENT_DATE), 0)
      WHEN b.due_date <= CURRENT_DATE THEN b.final_amount
      ELSE 0
    END AS due_amount
  FROM public.billing_student_bills b
  LEFT JOIN public.billing_categories bc ON bc.id = b.item_category_id
  LEFT JOIN public.academic_years ayr    ON ayr.id = b.academic_year_id
  WHERE b.status NOT IN ('superseded', 'cancelled')
)
SELECT
  lp.id             AS learner_id,
  lp.institution_id,
  lp.lifecycle_status,
  COALESCE(SUM(b.final_amount) FILTER (WHERE b.category_kind <> 'application_fee'), 0)
    AS countable_billed,
  COALESCE(SUM(b.paid)         FILTER (WHERE b.category_kind <> 'application_fee'), 0)
    AS countable_paid,
  -- paid_pct: DUE-AS-ON-DATE basis (platform default, 2026-08-11 ruling),
  -- now measured tranche by tranche.
  CASE
    WHEN COALESCE(SUM(b.due_amount) FILTER (WHERE b.category_kind <> 'application_fee'), 0) = 0
      THEN 0
    ELSE ROUND(
      100.0 * SUM(LEAST(b.paid, b.due_amount)) FILTER (WHERE b.category_kind <> 'application_fee')
            / SUM(b.due_amount)                FILTER (WHERE b.category_kind <> 'application_fee')
    , 2)
  END AS paid_pct,
  BOOL_OR(b.category_kind = 'application_fee' AND b.bill_status = 'paid') AS application_fee_paid,
  COUNT(b.id) AS total_bills,
  COUNT(b.id) FILTER (WHERE b.bill_status = 'paid') AS paid_bills,
  -- The three explicit bases.
  CASE
    WHEN COALESCE(SUM(b.final_amount) FILTER (WHERE b.category_kind <> 'application_fee'), 0) = 0 THEN 0
    ELSE ROUND(100.0
      * SUM(b.paid)         FILTER (WHERE b.category_kind <> 'application_fee')
      / SUM(b.final_amount) FILTER (WHERE b.category_kind <> 'application_fee'), 2)
  END AS pct_billed_to_date,
  CASE
    WHEN COALESCE(SUM(b.due_amount) FILTER (WHERE b.category_kind <> 'application_fee'), 0) = 0 THEN 0
    ELSE ROUND(100.0
      * SUM(LEAST(b.paid, b.due_amount)) FILTER (WHERE b.category_kind <> 'application_fee')
      / SUM(b.due_amount)                FILTER (WHERE b.category_kind <> 'application_fee'), 2)
  END AS pct_due_to_date,
  CASE
    WHEN COALESCE(SUM(b.due_amount)
           FILTER (WHERE b.category_kind <> 'application_fee' AND b.in_current_ay), 0) = 0 THEN 0
    ELSE ROUND(100.0
      * SUM(LEAST(b.paid, b.due_amount))
          FILTER (WHERE b.category_kind <> 'application_fee' AND b.in_current_ay)
      / SUM(b.due_amount)
          FILTER (WHERE b.category_kind <> 'application_fee' AND b.in_current_ay), 2)
  END AS pct_due_current_year,
  COALESCE(SUM(b.due_amount)                FILTER (WHERE b.category_kind <> 'application_fee'), 0)
    AS due_billed,
  COALESCE(SUM(LEAST(b.paid, b.due_amount)) FILTER (WHERE b.category_kind <> 'application_fee'), 0)
    AS due_paid,
  -- Columns 15-16. NOT in 20260821040000 — they were added to the live view
  -- afterwards and the migration file was never updated, so the file on disk
  -- described a 14-column view while the database had 16. Omitting them here
  -- was rejected outright ("cannot drop columns from view"), which is the one
  -- kind of drift Postgres catches for you.
  COALESCE(SUM(b.due_amount)
    FILTER (WHERE b.category_kind <> 'application_fee' AND b.in_current_ay), 0)
    AS due_cy_billed,
  COALESCE(SUM(LEAST(b.paid, b.due_amount))
    FILTER (WHERE b.category_kind <> 'application_fee' AND b.in_current_ay), 0)
    AS due_cy_paid
FROM public.learners_profiles lp
LEFT JOIN bill b ON b.student_id = lp.id
GROUP BY lp.id, lp.institution_id, lp.lifecycle_status;

COMMENT ON VIEW public.vw_learner_payment_progress IS
  'Per-learner payment progress. paid_pct = DUE-AS-ON-DATE basis, now computed tranche by tranche: a bill with billing_bill_instalments contributes only the tranches whose date has arrived; a bill without contributes its whole amount once its due_date has arrived (unchanged). The numerator is LEAST(paid, due) — the payment waterfall restated, so paying ahead of schedule never inflates the percentage. Cancelled and superseded bills excluded. security_invoker = true so RLS applies.';

REVOKE ALL ON TABLE public.vw_learner_payment_progress FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.vw_learner_payment_progress TO authenticated, service_role;

-- =============================================================================
-- §2 Stage A0 reads tranches
-- =============================================================================
-- Rules now come from two places, and a bill belongs to exactly one of them:
--   · a bill WITH tranches  -> each tranche's own promotes_to_status_code
--   · a bill WITHOUT        -> the fee item's rule, via fee_structure_item_id
-- Never both: an item-level rule on a scheduled fee is documented as ignored,
-- and honouring it would fire a rule the author replaced with per-tranche ones.
--
-- The waterfall is computed inline rather than through vw_bill_instalment_state
-- because that view is security_invoker = true; resolving it inside a SECURITY
-- DEFINER function would make the answer depend on who triggered the payment.
--
-- Stages A and B below are the 20260821200000 body verbatim.

CREATE OR REPLACE FUNCTION public.evaluate_learner_status_after_payment(p_learner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status        lifecycle_status;
  v_current_sort          integer;
  v_paid_pct              numeric;
  v_pct_billed            numeric;
  v_pct_due               numeric;
  v_pct_due_cy            numeric;
  v_basis                 text;
  v_used_pct              numeric;
  v_app_paid              boolean;
  v_universals_paid       boolean;
  v_gate_bills            integer := 0;
  v_gate_paid             integer := 0;
  v_threshold             numeric;
  v_target_code           text;
  v_updated               integer := 0;
  v_universal_target      text;
  v_promoted_to_universal boolean := false;
  v_promoted_to_threshold boolean := false;
  v_rule_target           text;
  v_rule_rows             integer := 0;
  v_rule_settled          integer := 0;
  v_promoted_by_rule      boolean := false;
BEGIN
  SELECT lp.lifecycle_status INTO v_current_status
  FROM public.learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false, 'reason', 'not_found');
  END IF;

  IF v_current_status::text NOT IN ('account', 'reserved') THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false,
      'reason', 'no_op_for_status', 'current_status', v_current_status::text);
  END IF;

  SELECT v.pct_billed_to_date, v.pct_due_to_date, v.pct_due_current_year
    INTO v_pct_billed, v_pct_due, v_pct_due_cy
  FROM public.vw_learner_payment_progress v
  WHERE v.learner_id = p_learner_id;
  v_pct_billed := COALESCE(v_pct_billed, 0);
  v_pct_due    := COALESCE(v_pct_due, 0);
  v_pct_due_cy := COALESCE(v_pct_due_cy, 0);
  v_paid_pct := v_pct_due;

  -- ═══ STAGE A0 — fee-schedule rules ══════════════════════════════════════
  SELECT s.sort_order INTO v_current_sort
  FROM public.admission_statuses s
  WHERE s.scope = 'learner' AND s.code = v_current_status::text
  LIMIT 1;

  IF v_current_sort IS NOT NULL THEN
    WITH tranche AS (
      SELECT
        i.promotes_to_status_code AS target,
        (LEAST(
           GREATEST(
             GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount))
             - COALESCE(SUM(i.amount) OVER (
                 PARTITION BY i.bill_id ORDER BY i.due_date, i.sequence_no
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0),
             0),
           i.amount) >= i.amount) AS settled
      FROM public.billing_bill_instalments i
      JOIN public.billing_student_bills b ON b.id = i.bill_id
      WHERE b.student_id = p_learner_id
        AND b.status::text NOT IN ('cancelled', 'superseded')
    ),
    unscheduled AS (
      SELECT
        fsi.promotes_to_status_code AS target,
        (COALESCE(b.status::text = 'paid', false)
         OR COALESCE(b.balance_amount, b.final_amount) <= 0) AS settled
      FROM public.billing_student_bills b
      JOIN public.admission_fee_structure_items fsi ON fsi.id = b.fee_structure_item_id
      WHERE b.student_id = p_learner_id
        AND b.status::text NOT IN ('cancelled', 'superseded')
        AND NOT EXISTS (SELECT 1 FROM public.billing_bill_instalments i WHERE i.bill_id = b.id)
    ),
    rule_rows AS (
      SELECT target, settled FROM tranche      WHERE target IS NOT NULL
      UNION ALL
      SELECT target, settled FROM unscheduled  WHERE target IS NOT NULL
    )
    SELECT s.code,
           (SELECT count(*) FROM rule_rows r WHERE r.target = s.code),
           (SELECT count(*) FROM rule_rows r WHERE r.target = s.code AND r.settled)
      INTO v_rule_target, v_rule_rows, v_rule_settled
    FROM public.admission_statuses s
    WHERE s.scope = 'learner'
      AND s.is_active = true
      AND s.gates_login = false
      AND s.sort_order > v_current_sort
      AND EXISTS (SELECT 1 FROM rule_rows r WHERE r.target = s.code)
      AND NOT EXISTS (SELECT 1 FROM rule_rows r WHERE r.target = s.code AND NOT r.settled)
    ORDER BY s.sort_order DESC
    LIMIT 1;

    IF v_rule_target IS NOT NULL THEN
      UPDATE public.learners_profiles
         SET lifecycle_status = v_rule_target::lifecycle_status
       WHERE id = p_learner_id
         AND lifecycle_status::text IN ('account', 'reserved');

      GET DIAGNOSTICS v_updated = ROW_COUNT;

      IF v_updated > 0 THEN
        INSERT INTO public.learners_profile_status_history
          (learner_id, from_status, to_status, reason_code, paid_pct_at_change,
           threshold_at_change, changed_by, metadata)
        VALUES
          (p_learner_id, v_current_status, v_rule_target::lifecycle_status,
           'auto_item_rule', v_paid_pct, NULL, NULL,
           jsonb_build_object('rpc', 'evaluate_learner_status_after_payment',
                              'rule', 'bill_instalment_schedule',
                              'naming_rows', v_rule_rows,
                              'settled_rows', v_rule_settled));
        v_current_status   := v_rule_target::lifecycle_status;
        v_promoted_by_rule := true;
      END IF;
    END IF;
  END IF;

  -- ═══ STAGE A — the universal gate (unchanged) ═══════════════════════════
  SELECT
    count(*) FILTER (WHERE bc.kind IN ('application_fee','university_fee')),
    count(*) FILTER (WHERE bc.kind IN ('application_fee','university_fee')
        AND (b.status::text = 'paid'
             OR (b.final_amount - COALESCE(b.balance_amount, b.final_amount)) > 0
             OR (b.final_amount = 0 AND COALESCE(b.balance_amount, 0) = 0))),
    COALESCE(bool_or(bc.kind = 'application_fee' AND b.status::text = 'paid'), false),
    COALESCE(bool_and(b.status::text = 'paid') FILTER (WHERE bc.kind = 'university_fee'), false)
  INTO v_gate_bills, v_gate_paid, v_app_paid, v_universals_paid
  FROM public.billing_student_bills b
  JOIN public.billing_categories bc ON bc.id = b.item_category_id
  WHERE b.student_id = p_learner_id
    AND b.status::text <> 'superseded';

  IF v_current_status::text = 'account' AND v_gate_bills > 0 AND v_gate_paid = v_gate_bills THEN
    SELECT s.code INTO v_universal_target
    FROM public.admission_statuses s
    WHERE s.scope = 'learner'
      AND s.is_active = true
      AND s.auto_promote_when_universal_paid = true
    LIMIT 1;

    IF v_universal_target IS NOT NULL THEN
      UPDATE public.learners_profiles
         SET lifecycle_status = v_universal_target::lifecycle_status
       WHERE id = p_learner_id
         AND lifecycle_status::text = 'account';

      GET DIAGNOSTICS v_updated = ROW_COUNT;

      IF v_updated > 0 THEN
        INSERT INTO public.learners_profile_status_history
          (learner_id, from_status, to_status, reason_code, paid_pct_at_change,
           threshold_at_change, changed_by, metadata)
        VALUES
          (p_learner_id, 'account'::lifecycle_status, v_universal_target::lifecycle_status,
           'auto_universal_paid', v_paid_pct, NULL, NULL,
           jsonb_build_object('rpc', 'evaluate_learner_status_after_payment',
                              'application_fee_paid', v_app_paid,
                              'university_fee_paid', v_universals_paid,
                              'gate_bills', v_gate_bills,
                              'gate_paid', v_gate_paid,
                              'gate_rule', 'partial'));
        v_current_status := v_universal_target::lifecycle_status;
        v_promoted_to_universal := true;
      END IF;
    END IF;
  END IF;

  -- ═══ STAGE B — the pooled threshold (unchanged) ═════════════════════════
  IF v_current_status::text IN ('account', 'reserved') THEN
    SELECT s.code, s.fee_paid_threshold_percent, s.threshold_basis,
           CASE s.threshold_basis
             WHEN 'billed_to_date'           THEN v_pct_billed
             WHEN 'due_to_date_current_year' THEN v_pct_due_cy
             ELSE                                 v_pct_due
           END
      INTO v_target_code, v_threshold, v_basis, v_used_pct
    FROM public.admission_statuses s
    WHERE s.scope = 'learner'
      AND s.is_active = true
      AND s.fee_paid_threshold_percent IS NOT NULL
      AND s.gates_login = false
      AND s.auto_promote_when_universal_paid = false
      AND (CASE s.threshold_basis
             WHEN 'billed_to_date'           THEN v_pct_billed
             WHEN 'due_to_date_current_year' THEN v_pct_due_cy
             ELSE                                 v_pct_due
           END) >= s.fee_paid_threshold_percent
    ORDER BY s.fee_paid_threshold_percent DESC
    LIMIT 1;

    IF v_target_code IS NOT NULL THEN
      UPDATE public.learners_profiles
         SET lifecycle_status = v_target_code::lifecycle_status
       WHERE id = p_learner_id
         AND lifecycle_status::text IN ('account', 'reserved');

      GET DIAGNOSTICS v_updated = ROW_COUNT;

      IF v_updated > 0 THEN
        INSERT INTO public.learners_profile_status_history
          (learner_id, from_status, to_status, reason_code, paid_pct_at_change,
           threshold_at_change, changed_by, metadata)
        VALUES
          (p_learner_id, v_current_status, v_target_code::lifecycle_status,
           'auto_threshold', v_used_pct, v_threshold, NULL,
           jsonb_build_object('rpc', 'evaluate_learner_status_after_payment',
                              'threshold_basis', v_basis,
                              'cascaded_from_universal', v_promoted_to_universal,
                              'cascaded_from_item_rule', v_promoted_by_rule));
        v_current_status := v_target_code::lifecycle_status;
        v_promoted_to_threshold := true;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'learner_id', p_learner_id,
    'updated', (v_promoted_by_rule OR v_promoted_to_universal OR v_promoted_to_threshold),
    'promoted_by_item_rule', v_promoted_by_rule,
    'promoted_to_universal', v_promoted_to_universal,
    'promoted_to_threshold', v_promoted_to_threshold,
    'item_rule_target', v_rule_target,
    'item_rule_rows', v_rule_rows,
    'item_rule_settled', v_rule_settled,
    'final_status', v_current_status::text,
    'paid_pct', v_paid_pct,
    'pct_billed_to_date', v_pct_billed,
    'pct_due_to_date', v_pct_due,
    'pct_due_current_year', v_pct_due_cy,
    'threshold_basis', v_basis,
    'application_fee_paid', v_app_paid,
    'university_fee_paid', v_universals_paid,
    'gate_bills', v_gate_bills,
    'gate_paid', v_gate_paid,
    'threshold', v_threshold
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.evaluate_learner_status_after_payment(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.evaluate_learner_status_after_payment(uuid)
  TO authenticated, service_role;

-- =============================================================================
-- §3 Late charges accrue on what is OVERDUE, not on the whole balance
-- =============================================================================
-- Body is the live definition with exactly two assignments changed —
-- v_balance and v_overdue_start — both no-ops for a bill with no tranches.

CREATE OR REPLACE FUNCTION public.fn_late_charge_derivation(p_bill_id uuid)
 RETURNS TABLE(month_number integer, period_start date, period_end date,
               opening_base numeric, rate_percent numeric,
               month_charge numeric, cumulative_charge numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_admin boolean;
  v_allowed boolean;
  v_rate numeric;
  v_compounding boolean;
  v_grace integer;
  v_factor numeric;
  v_balance numeric;
  v_paid numeric;
  v_overdue_start date;
  v_months integer;
  v_has_tranches boolean;
BEGIN
  v_is_admin := is_super_admin() OR is_admin();

  SELECT b.balance_amount,
         GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount)),
         (v_is_admin
          OR (user_has_permission('billing.late_charges.view')
              AND role_has_institution_access(b.institution_id))
          OR (
            b.student_id IN (
              SELECT lp.id
              FROM learners_profiles lp
              JOIN profiles p ON p.id = auth.uid()
              WHERE lp.id = p.learner_id
                 OR p.email IN (lp.student_email, lp.college_email)
            )
            AND (
              b.item_category_id IS NULL
              OR EXISTS (
                SELECT 1 FROM billing_categories bc
                WHERE bc.id = b.item_category_id AND bc.visible_to_learners
              )
            )
          ))
    INTO v_balance, v_paid, v_allowed
  FROM billing_student_bills b
  WHERE b.id = p_bill_id
    AND b.status IN ('unpaid', 'partially_paid')
    AND b.balance_amount > 0
    AND NOT EXISTS (
      SELECT 1 FROM billing_categories bc
      WHERE bc.id = b.item_category_id AND bc.kind = 'penalty'
    );

  IF v_balance IS NULL OR NOT COALESCE(v_allowed, false) THEN
    RETURN;
  END IF;

  v_rate        := COALESCE((fn_get_policy('billing.late_charge.rate_percent_per_month'))::numeric, 10);
  v_compounding := COALESCE((fn_get_policy('billing.late_charge.compounding'))::boolean, true);
  v_grace       := COALESCE((fn_get_policy('billing.late_charge.grace_days'))::int, 0);
  v_factor      := 1 + v_rate / 100.0;

  SELECT EXISTS (SELECT 1 FROM billing_bill_instalments i WHERE i.bill_id = p_bill_id)
    INTO v_has_tranches;

  IF v_has_tranches THEN
    -- CHANGED 2026-08-22. A scheduled bill is fined on the tranches that have
    -- actually fallen overdue, less what has been paid — NOT on the whole
    -- outstanding balance. Charging the balance would fine a learner on money
    -- that is not due yet: a Rs 1,00,000 tuition bill whose first Rs 30,000
    -- tranche slips would attract a compounding fine on Rs 1,00,000.
    SELECT GREATEST(0, COALESCE(SUM(i.amount), 0) - v_paid),
           MIN(i.due_date)
      INTO v_balance, v_overdue_start
    FROM billing_bill_instalments i
    WHERE i.bill_id = p_bill_id
      AND i.due_date + v_grace < current_date;

    -- Nothing overdue yet, or everything overdue is already covered.
    IF v_overdue_start IS NULL OR v_balance <= 0 THEN
      RETURN;
    END IF;

    -- One overdue total compounding from the earliest overdue tranche. Less
    -- precise than accruing each tranche from its own date, and deliberately
    -- so: it can only under-charge, and over-charging is the error that cannot
    -- be undone once a fine has been issued.
    v_overdue_start := v_overdue_start + v_grace + 1;
  ELSE
    SELECT b.due_date + v_grace + 1 INTO v_overdue_start
    FROM billing_student_bills b WHERE b.id = p_bill_id;
  END IF;

  IF current_date < v_overdue_start THEN
    RETURN;  -- not overdue yet (grace window) — no months, no charge
  END IF;

  v_months := 12 * EXTRACT(YEAR FROM age(current_date, v_overdue_start))::int
            + EXTRACT(MONTH FROM age(current_date, v_overdue_start))::int
            + 1;

  RETURN QUERY
  SELECT
    gs.k,
    (v_overdue_start + make_interval(months => gs.k - 1))::date,
    ((v_overdue_start + make_interval(months => gs.k))::date - 1),
    CASE WHEN v_compounding
      THEN ROUND(v_balance * POWER(v_factor, gs.k - 1), 2)
      ELSE v_balance
    END,
    v_rate,
    CASE WHEN v_compounding
      THEN ROUND(v_balance * (POWER(v_factor, gs.k) - POWER(v_factor, gs.k - 1)), 2)
      ELSE ROUND(v_balance * (v_rate / 100.0), 2)
    END,
    CASE WHEN v_compounding
      THEN ROUND(v_balance * (POWER(v_factor, gs.k) - 1), 2)
      ELSE ROUND(v_balance * (v_rate / 100.0) * gs.k, 2)
    END
  FROM generate_series(1, v_months) gs(k);
END;
$function$;

COMMENT ON FUNCTION public.fn_late_charge_derivation(uuid) IS
  'Month-by-month late charge derivation for one bill. For a bill with an instalment schedule the base is the OVERDUE amount (tranches past their date, less what has been paid) accruing from the earliest overdue tranche — not the full balance, which would fine a learner on money that is not yet due. Unscheduled bills are unchanged.';

REVOKE ALL ON FUNCTION public.fn_late_charge_derivation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_late_charge_derivation(uuid) TO authenticated, service_role;
