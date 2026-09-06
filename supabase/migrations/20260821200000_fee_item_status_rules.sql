-- =============================================================================
-- 20260821200000_fee_item_status_rules.sql
--
-- PHASE 4 of "Fee Structure — per-item due dates, split thresholds & status
-- rules" (docs/plans/2026-08-21-fee-structure-dynamic-schedules-plan.md).
-- Phase 1 declared the schema, phase 2 made generation honour it; this file
-- makes PROMOTION honour it.
--
-- THE PROBLEM THIS SOLVES
-- -----------------------
-- The fee ladder has always been a single pooled percentage. paid_pct is
-- "paid ÷ billed across the learner's whole bill book, over bills whose due
-- date has arrived" (20260821040000), and admission_statuses says admitted =
-- 30% of that. There has been no way to express what the accounts team actually
-- means, which is per-fee: "the first tuition instalment settles -> Reserved",
-- "the second settles -> Admitted", "Application Fee paid in full -> Reserved".
--
-- WHAT THIS ADDS: STAGE A0
-- ------------------------
-- A new stage that runs BEFORE the two existing ones and consults the schedule
-- rules configured on fee structure items. It is layered, not a replacement:
--
--   Stage A0 (NEW)  item rules      -> the furthest status ALL of whose
--                                      naming bills are settled
--   Stage A         universal gate  -> reserved, unchanged
--   Stage B         pooled 30%      -> admitted, unchanged
--
-- With zero rules configured — the state of all 236 fee structures today —
-- Stage A0 finds nothing and returns immediately, so the function behaves
-- exactly as it does now for all 5,361 laddered learners. Where rules DO exist
-- they promote precisely; where they do not fire, the pooled ladder still
-- applies underneath as a floor. Neither can undo the other, because:
--
-- PROMOTION-ONLY IS PRESERVED, AND IT IS LOAD-BEARING. Stage A0 only ever
-- considers statuses whose sort_order is strictly ABOVE the learner's current
-- one. That is what keeps this function safe to call on any learner at any
-- time, which in turn is what makes both the payment trigger and the nightly
-- sweep safe to re-run. A rule can never move a learner backwards, and an
-- unsettled instalment can never demote someone the pooled ladder promoted.
--
-- DECISION D3 IS ENFORCED TWICE, DELIBERATELY. `gates_login = false` filters
-- the candidate statuses here, and afsis_validate_status_target() rejects a
-- login-granting target at authoring time. Either alone would do; both mean a
-- row written around the UI still cannot auto-grant a portal login.
--
-- MATCHING A BILL TO ITS RULE
--   split bill   (instalment_no IS NOT NULL) -> the schedule LINE whose
--                                               sequence_no = instalment_no
--   unsplit bill (instalment_no IS NULL)     -> the ITEM's own rule
-- Never COALESCE the two: an item-level rule on a SPLIT item is documented as
-- ignored, and falling back to it would fire a rule the author disabled by
-- moving to per-instalment targets.
--
-- NO BEGIN/COMMIT: the apply path wraps this file in one transaction.
-- =============================================================================

-- §0 GUARD
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='billing_student_bills' AND column_name='fee_structure_item_id') THEN
    RAISE EXCEPTION 'REFUSING: phase 1 (20260821180000) has not been applied.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='admission_fee_structure_items' AND column_name='promotes_to_status_code') THEN
    RAISE EXCEPTION 'REFUSING: phase 2 (20260821190000) has not been applied.';
  END IF;
END
$guard$;

-- =============================================================================
-- The promotion engine, with Stage A0
-- =============================================================================
-- Stages A and B below are the 20260821040000 body verbatim. Only Stage A0 and
-- the three variables it needs are new.

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
  -- Stage A0
  v_rule_target           text;
  v_rule_bills            integer := 0;
  v_rule_settled          integer := 0;
  v_promoted_by_rule      boolean := false;
BEGIN
  SELECT lp.lifecycle_status INTO v_current_status
  FROM public.learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false, 'reason', 'not_found');
  END IF;

  -- Promotion only. This function never demotes, so it is safe to call on any
  -- learner at any time — which is what makes the nightly sweep and the manual
  -- re-evaluate action safe.
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
  -- Platform default basis: due-as-on-date (Director ruling 2026-08-11).
  v_paid_pct := v_pct_due;

  -- ═══ STAGE A0 — fee-structure item rules ════════════════════════════════
  -- The furthest status for which the learner holds at least one naming bill
  -- and EVERY naming bill is settled. A settled bill is status='paid' or a
  -- balance of zero — the latter also covers a fully waived ₹0 bill, which is
  -- settled by definition and would otherwise block its rule forever (the same
  -- trap RC4 of 20260811140000 fixed for the universal gate).
  SELECT s.sort_order INTO v_current_sort
  FROM public.admission_statuses s
  WHERE s.scope = 'learner' AND s.code = v_current_status::text
  LIMIT 1;

  IF v_current_sort IS NOT NULL THEN
    WITH rule_bills AS (
      SELECT
        CASE
          WHEN b.instalment_no IS NOT NULL THEN sch.promotes_to_status_code
          ELSE fsi.promotes_to_status_code
        END AS target,
        -- COALESCE around the status test is load-bearing: billing_student_bills
        -- .status is NULLABLE, and `NULL = 'paid'` is NULL, not false. An
        -- unqualified OR would leave `settled` NULL, `NOT settled` NULL, and the
        -- NOT EXISTS "every naming bill is settled" test would pass on an
        -- UNPAID bill — a gate that fails OPEN, the same class as the
        -- `x <> NULL` trap. final_amount is NOT NULL, so the second operand is
        -- always a real boolean and the whole expression cannot be NULL.
        (COALESCE(b.status::text = 'paid', false)
         OR COALESCE(b.balance_amount, b.final_amount) <= 0) AS settled
      FROM public.billing_student_bills b
      JOIN public.admission_fee_structure_items fsi
        ON fsi.id = b.fee_structure_item_id
      LEFT JOIN public.admission_fee_structure_item_schedules sch
        ON sch.fee_structure_item_id = b.fee_structure_item_id
       AND sch.sequence_no           = b.instalment_no
      WHERE b.student_id = p_learner_id
        AND b.status::text NOT IN ('cancelled', 'superseded')
    )
    SELECT s.code,
           (SELECT count(*) FROM rule_bills rb WHERE rb.target = s.code),
           (SELECT count(*) FROM rule_bills rb WHERE rb.target = s.code AND rb.settled)
      INTO v_rule_target, v_rule_bills, v_rule_settled
    FROM public.admission_statuses s
    WHERE s.scope = 'learner'
      AND s.is_active = true
      -- D3: never a login-granting status, mirroring Stage B's own filter.
      AND s.gates_login = false
      -- Promotion only: strictly above where the learner already is.
      AND s.sort_order > v_current_sort
      AND EXISTS (SELECT 1 FROM rule_bills rb WHERE rb.target = s.code)
      AND NOT EXISTS (SELECT 1 FROM rule_bills rb
                       WHERE rb.target = s.code AND NOT rb.settled)
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
                              'rule', 'fee_structure_item_schedule',
                              'naming_bills', v_rule_bills,
                              'settled_bills', v_rule_settled));
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
             -- A zero-amount bill with nothing outstanding is settled by
             -- definition. Without this it satisfies neither branch above and
             -- blocks the gate forever, however much the learner pays elsewhere.
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
  -- gates_login = false deliberately excludes 'active' (60%): granting a login
  -- is never automatic. auto_promote_when_universal_paid = false excludes
  -- 'reserved', which Stage A owns.
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
    'item_rule_bills', v_rule_bills,
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

-- Grant hygiene: CREATE OR REPLACE preserves ACLs, but re-assert per repo rule
-- (Supabase default privileges hand anon EXECUTE on new functions).
REVOKE EXECUTE ON FUNCTION public.evaluate_learner_status_after_payment(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.evaluate_learner_status_after_payment(uuid)
  TO authenticated, service_role;
