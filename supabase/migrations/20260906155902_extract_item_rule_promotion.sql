-- ============================================================================
-- Extract STAGE A0 (the fee-item promotion rules) out of
-- evaluate_learner_status_after_payment into its own function.
--
-- WHY (2026-09-06): the AY 2026-27 bill resync needs to apply the item rules
-- WITHOUT running STAGE B's pooled 30% threshold. Measured: running the full
-- engine after the resync would promote 325 reserved/account learners to
-- `admitted` in one shot, because splitting a bill into tranches shrinks
-- "due to date" (avg pct_due_to_date 8.7% -> 57.1%). The explicit
-- promotes_to_status_code rules name only 14. The operator chose the 14.
--
-- Copying STAGE A0 into the resync RPC would leave two implementations of the
-- same rule that drift the first time either is touched, so it is extracted
-- here instead and BOTH callers share it.
--
-- Behaviour of evaluate_learner_status_after_payment is unchanged: same
-- signature (CREATE OR REPLACE, never DROP -- a DROP would take the ACL with
-- it and a re-CREATE silently re-grants EXECUTE to PUBLIC), same STAGE A and
-- STAGE B, same history metadata shape. The `rpc` key in that metadata is now
-- fed by p_source so the live path keeps writing the exact string it always
-- wrote, and a backfill promotion is identifiable afterwards.
--
-- search_path is pinned to 'public' rather than '' to match every sibling
-- function here and to keep the bare `lifecycle_status` / `admission_statuses`
-- type and table references resolving. Pinned is the security requirement.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STAGE A0, standalone.
--
-- Promotes the learner to the HIGHEST-sort_order status that every one of its
-- naming rows has settled, and only forward (sort_order > current). Naming
-- rows come from two places:
--   * billing_bill_instalments.promotes_to_status_code  (split fee items)
--   * admission_fee_structure_items.promotes_to_status_code, for bills with
--     no tranches at all (single fee items) -- which is why the bill must
--     carry fee_structure_item_id for this half to see anything.
--
-- No-ops unless the learner is currently 'account' or 'reserved'. Cannot reach
-- a gates_login status. Cannot demote. Those three properties are what make it
-- safe to run over a whole cohort.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_learner_status_apply_item_rules(
  p_learner_id uuid,
  p_source     text DEFAULT 'evaluate_learner_status_after_payment'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status lifecycle_status;
  v_current_sort   integer;
  v_paid_pct       numeric;
  v_rule_target    text;
  v_rule_rows      integer := 0;
  v_rule_settled   integer := 0;
  v_updated        integer := 0;
BEGIN
  SELECT lp.lifecycle_status INTO v_current_status
  FROM public.learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'promoted', false,
                              'reason', 'not_found');
  END IF;

  IF v_current_status::text NOT IN ('account', 'reserved') THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'promoted', false,
      'reason', 'no_op_for_status', 'final_status', v_current_status::text);
  END IF;

  SELECT COALESCE(v.pct_due_to_date, 0) INTO v_paid_pct
  FROM public.vw_learner_payment_progress v WHERE v.learner_id = p_learner_id;
  v_paid_pct := COALESCE(v_paid_pct, 0);

  SELECT s.sort_order INTO v_current_sort
  FROM public.admission_statuses s
  WHERE s.scope = 'learner' AND s.code = v_current_status::text
  LIMIT 1;

  IF v_current_sort IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'promoted', false,
      'reason', 'current_status_not_in_ladder', 'final_status', v_current_status::text);
  END IF;

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

  IF v_rule_target IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'promoted', false,
      'reason', 'no_rule_target', 'final_status', v_current_status::text,
      'paid_pct', v_paid_pct);
  END IF;

  UPDATE public.learners_profiles
     SET lifecycle_status = v_rule_target::lifecycle_status
   WHERE id = p_learner_id
     AND lifecycle_status::text IN ('account', 'reserved');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    -- The caller reported target/rows/settled even when the write lost a race,
    -- so keep carrying them; only `promoted` says whether anything moved.
    RETURN jsonb_build_object('learner_id', p_learner_id, 'promoted', false,
      'reason', 'status_moved_concurrently', 'final_status', v_current_status::text,
      'item_rule_target', v_rule_target, 'item_rule_rows', v_rule_rows,
      'item_rule_settled', v_rule_settled);
  END IF;

  INSERT INTO public.learners_profile_status_history
    (learner_id, from_status, to_status, reason_code, paid_pct_at_change,
     threshold_at_change, changed_by, metadata)
  VALUES
    (p_learner_id, v_current_status, v_rule_target::lifecycle_status,
     'auto_item_rule', v_paid_pct, NULL, NULL,
     jsonb_build_object('rpc', p_source,
                        'rule', 'bill_instalment_schedule',
                        'naming_rows', v_rule_rows,
                        'settled_rows', v_rule_settled));

  RETURN jsonb_build_object(
    'learner_id',    p_learner_id,
    'promoted',      true,
    'from_status',   v_current_status::text,
    'final_status',  v_rule_target,
    'item_rule_target',  v_rule_target,
    'item_rule_rows',    v_rule_rows,
    'item_rule_settled', v_rule_settled,
    'paid_pct',      v_paid_pct
  );
END;
$function$;

-- A DROP would have taken the ACL; this is a fresh CREATE, so close the default
-- PUBLIC grant explicitly before handing EXECUTE to real callers.
REVOKE ALL ON FUNCTION public.fn_learner_status_apply_item_rules(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_learner_status_apply_item_rules(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_learner_status_apply_item_rules(uuid, text) TO service_role;

COMMENT ON FUNCTION public.fn_learner_status_apply_item_rules(uuid, text) IS
  'STAGE A0 of the learner promotion engine: promotes on settled fee-item rules only. '
  'Shared by evaluate_learner_status_after_payment and fn_billing_resync_item_schedules '
  'so the two cannot disagree. Forward-only, never reaches a gates_login status.';


-- ---------------------------------------------------------------------------
-- The engine, with STAGE A0 now delegated. STAGE A and STAGE B are byte-for-byte
-- what they were; only the A0 block is replaced by the call.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_learner_status_after_payment(p_learner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status        lifecycle_status;
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
  v_rule                  jsonb;
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

  -- ═══ STAGE A0 — fee-schedule rules (extracted 2026-09-06) ════════════════
  v_rule := public.fn_learner_status_apply_item_rules(
              p_learner_id, 'evaluate_learner_status_after_payment');
  v_rule_target  := v_rule->>'item_rule_target';
  v_rule_rows    := COALESCE((v_rule->>'item_rule_rows')::integer, 0);
  v_rule_settled := COALESCE((v_rule->>'item_rule_settled')::integer, 0);

  IF COALESCE((v_rule->>'promoted')::boolean, false) THEN
    v_current_status   := (v_rule->>'final_status')::lifecycle_status;
    v_promoted_by_rule := true;
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
