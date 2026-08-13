-- ============================================================================
-- Learner lifecycle auto-promotion: repair the trigger plumbing
-- ============================================================================
-- BUG (reported 2026-08-11): the accounts team records payments, but learners
-- stay in 'reserved'. Measured on the live database: 870 learners in 'reserved',
-- of whom 82 already clear the 30% `admitted` threshold, plus 16 in 'account'
-- that already satisfy the Stage A gate. 98 learners stranded.
--
-- The thresholds themselves are fine — admission_statuses carries admitted=30%
-- and reserved.auto_promote_when_universal_paid=true, and the history table
-- records 1,008 auto_universal_paid and 120 auto_threshold promotions, the most
-- recent today. evaluate_learner_status_after_payment works. What is broken is
-- WHEN it gets called and WHAT IT CAN SEE when it is.
--
-- ── RC1: partial payments never re-evaluate (73 of the 82) ──────────────────
-- fn_evaluate_status_after_bill_paid guarded on
--     IF NEW.status = 'paid' AND COALESCE(OLD.status,'') <> 'paid'
-- An instalment leaves the bill 'partially_paid', so the guard rejects it.
-- Tuition is paid in instalments, so the threshold crossing almost always
-- happens on exactly the event the system ignored. Example AUG26CA114: 87.47%
-- paid (tuition ₹34,000 with ₹1,800 outstanding) and still 'reserved'.
--
-- ── RC2: the receipt-item trigger read pre-payment state (structural) ───────
-- Postgres fires row triggers in ALPHABETICAL ORDER BY TRIGGER NAME. On
-- billing_receipt_items AFTER INSERT that was:
--     trg_cl_upgrade_holds_after_payment
--     trg_evaluate_status_after_payment      <- evaluated the learner
--     trigger_update_bill_status_on_payment  <- only NOW wrote the bill
-- 'trg_' sorts before 'trigger_' ('g' < 'i'), so the evaluation ran BEFORE
-- update_bill_status() wrote the new balance onto the bill. And
-- evaluate_learner_status_after_payment reads the BILL (final_amount -
-- balance_amount, via vw_learner_payment_progress), not the receipt. That call
-- could never see the payment that triggered it — a no-op by construction.
--
-- Net effect of RC1+RC2: the only evaluation that could see fresh data was the
-- bill-side one, and its guard rejected every payment that was not a full
-- settlement. Both failed silently and in the safe direction (stale data can
-- only UNDER-report progress), so nothing ever errored and no history row was
-- written. From the accounts desk everything looked like it worked.
--
-- ── RC3: a BEFORE-trigger function registered as AFTER (latent) ────────────
-- update_bill_balance_on_amount_change() assigns NEW.status / NEW.balance_amount
-- / NEW.payment_date and returns NEW — textbook BEFORE-trigger code — but was
-- registered AFTER UPDATE, where the return value and every NEW mutation are
-- discarded. Editing a bill's final_amount (discount, waiver, correction) did
-- not recompute its balance or status.
--
-- Measured live damage: ZERO. Every live bill's balance_amount already equals
-- final_amount - receipts, except 4 OVERPAID bills (₹355,000 received against
-- ₹350,000 billed twice; ₹24,000 against ₹12,000; and one bill reduced to ₹0
-- after ₹160,000 was received). Those four read status='paid', balance=0, which
-- is the CORRECT presentation — update_bill_status() clamps to zero in its
-- `v_total_paid >= v_bill_amount` branch, and writing the arithmetic balance
-- (-5,000) would push paid_pct above 100%. So there is nothing to repair here;
-- the overpayments are a refund/credit matter, tracked separately. This trigger
-- is corrected as a latent fix so the next amount edit behaves.
--
-- ── RC4: zero-amount bills could never satisfy the Stage A gate (latent) ────
-- The gate counted a bill as satisfied on `status='paid' OR (final-balance)>0`.
-- A ₹0 bill left 'unpaid' satisfies neither and blocks Stage A forever. 60 such
-- live bills exist across 37 learners; none currently sit on an application_fee
-- / university_fee category for an account/reserved learner, so nothing is
-- blocked today — but ₹0 bills have stranded people here before (the 2026-07-25
-- bulk run), so the gate is hardened rather than left to luck.
--
-- paid_pct is NOT redefined. It stays "percent of the learner's entire non-
-- application-fee bill book", confirmed as intended 2026-08-11. The 788
-- 'reserved' learners under 30% are correctly waiting, not stuck.
-- ============================================================================

-- ── RC1 + RC2: one evaluation point, on the bill, that sees fresh data ──────
-- The bill is where the truth lives: update_bill_status() writes both status and
-- balance_amount on EVERY receipt-item insert, so an AFTER UPDATE trigger on
-- those two columns fires for every payment — full or partial — and reads a row
-- that already reflects the payment.
CREATE OR REPLACE FUNCTION public.fn_evaluate_status_after_bill_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Any movement in the bill's PAID POSITION, not just a full settlement.
  -- Was `NEW.status = 'paid' AND OLD.status <> 'paid'`, which ignored every
  -- instalment — the payments that actually carry a learner across 30%.
  IF NEW.balance_amount IS DISTINCT FROM OLD.balance_amount
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    BEGIN
      PERFORM public.evaluate_learner_status_after_payment(NEW.student_id);
    EXCEPTION WHEN OTHERS THEN
      -- Swallowing is deliberate: a status-evaluation failure must never roll
      -- back a payment. WARNING rather than NOTICE so it actually reaches the
      -- Postgres log and is visible to get_logs — a silent third failure mode
      -- is what let RC1/RC2 hide for months.
      RAISE WARNING 'evaluate_learner_status_after_payment failed for learner %: %',
        NEW.student_id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_evaluate_status_after_bill_paid
  ON public.billing_student_bills;

CREATE TRIGGER trg_evaluate_status_after_bill_paid
  AFTER UPDATE OF status, balance_amount ON public.billing_student_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_evaluate_status_after_bill_paid();

-- RC2: remove the structurally-stale receipt-side evaluation. It is not merely
-- redundant now — it never worked, because it always ran one trigger too early
-- to see its own payment. The bill-side trigger above covers every receipt.
DROP TRIGGER IF EXISTS trg_evaluate_status_after_payment
  ON public.billing_receipt_items;
DROP FUNCTION IF EXISTS public._on_receipt_item_evaluate_status();

-- ── RC3: BEFORE, so the NEW mutations survive ──────────────────────────────
DROP TRIGGER IF EXISTS trigger_update_bill_balance_on_amount_change
  ON public.billing_student_bills;

CREATE TRIGGER trigger_update_bill_balance_on_amount_change
  BEFORE UPDATE ON public.billing_student_bills
  FOR EACH ROW EXECUTE FUNCTION public.update_bill_balance_on_amount_change();

-- No data repair accompanies RC3 — see the header. Every live bill's balance is
-- already correct; the only divergences are clamped overpayments, which must
-- stay clamped.

-- ── RC4: a fully-waived (₹0, nothing outstanding) gate bill counts as met ───
-- Only the Stage A gate expression changes; every other line is the 2026-05-17
-- function verbatim. CREATE OR REPLACE keeps the signature, so grants survive.
CREATE OR REPLACE FUNCTION public.evaluate_learner_status_after_payment(p_learner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status        lifecycle_status;
  v_paid_pct              numeric;
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

  SELECT v.paid_pct INTO v_paid_pct
  FROM public.vw_learner_payment_progress v
  WHERE v.learner_id = p_learner_id;
  v_paid_pct := COALESCE(v_paid_pct, 0);

  -- Stage A gate (-> reserved): every EXISTING application_fee + university_fee
  -- bill must have AT LEAST A PARTIAL PAYMENT (paid_amount > 0, or fully paid /
  -- waived-to-zero), with at least one such bill present.
  SELECT
    count(*) FILTER (WHERE bc.kind IN ('application_fee','university_fee')),
    count(*) FILTER (WHERE bc.kind IN ('application_fee','university_fee')
        AND (b.status::text = 'paid'
             OR (b.final_amount - COALESCE(b.balance_amount, b.final_amount)) > 0
             -- A ₹0 bill with nothing outstanding is settled by definition.
             -- Without this it satisfies neither branch above and blocks the
             -- gate forever, however much the learner pays elsewhere.
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

  -- Stage B (-> admitted). gates_login = false deliberately excludes 'active'
  -- (60%): granting a login is never automatic. auto_promote_when_universal_paid
  -- = false excludes 'reserved', which Stage A owns.
  IF v_current_status::text IN ('account', 'reserved') THEN
    SELECT s.code, s.fee_paid_threshold_percent
      INTO v_target_code, v_threshold
    FROM public.admission_statuses s
    WHERE s.scope = 'learner'
      AND s.is_active = true
      AND s.fee_paid_threshold_percent IS NOT NULL
      AND s.gates_login = false
      AND s.auto_promote_when_universal_paid = false
      AND v_paid_pct >= s.fee_paid_threshold_percent
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
           'auto_threshold', v_paid_pct, v_threshold, NULL,
           jsonb_build_object('rpc', 'evaluate_learner_status_after_payment',
                              'cascaded_from_universal', v_promoted_to_universal));
        v_promoted_to_threshold := true;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'learner_id', p_learner_id,
    'updated', (v_promoted_to_universal OR v_promoted_to_threshold),
    'promoted_to_universal', v_promoted_to_universal,
    'promoted_to_threshold', v_promoted_to_threshold,
    'final_status', v_current_status::text,
    'paid_pct', v_paid_pct,
    'application_fee_paid', v_app_paid,
    'university_fee_paid', v_universals_paid,
    'gate_bills', v_gate_bills,
    'gate_paid', v_gate_paid,
    'threshold', v_threshold
  );
END;
$function$;
