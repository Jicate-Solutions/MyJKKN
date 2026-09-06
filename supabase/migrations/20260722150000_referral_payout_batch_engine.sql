-- Referral payment machine — four-stage payout batch engine
-- Created 2026-07-22. Spec: SPECS.md §6 F6, decision D10 (full four-stage chain
-- with separation of duties). Complements the generator (migration 20260722120000).
--
-- The existing ConsultantService.createPayoutBatch is broken by the same schema
-- drift as the commission bug (#2219): it writes payout_period_start / generated_at
-- / generated_by, none of which exist (real columns: batch_period_start /
-- prepared_at / prepared_by). The payout path has never run, so it never surfaced.
-- These functions are the correct, atomic replacement. The UI calls them via RPC.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Same per-institution-vs-global collision bug as transaction_number, on
--    batch_number. batch_number is UNIQUE (global) but numbered per institution,
--    so the first batch of every institution would collide on PAY-000001. Fix to
--    number globally (no existing batches to preserve).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_set_batch_number()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE next_seq integer;
BEGIN
  IF NEW.batch_number IS NULL THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(batch_number,'[^0-9]','','g'),'')::integer),0) + 1
      INTO next_seq FROM consultant_payout_batches;   -- global, not per-institution
    NEW.batch_number := 'PAY-' || LPAD(next_seq::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Create a batch from approved, un-batched transactions. status='prepared'.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_create_payout_batch(
  p_institution_id uuid,
  p_batch_name text,
  p_consultant_ids uuid[] DEFAULT NULL,
  p_prepared_by uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_batch_id uuid; v_num text; v_g numeric; v_t numeric; v_n numeric; v_cnt int; v_cons int;
BEGIN
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'Not authorised to create a payout batch';
  END IF;

  CREATE TEMP TABLE _tx ON COMMIT DROP AS
  SELECT id, gross_amount, tds_amount, net_amount, consultant_id
    FROM consultant_commission_transactions
   WHERE institution_id = p_institution_id
     AND status = 'approved'
     AND payout_batch_id IS NULL
     AND (p_consultant_ids IS NULL OR consultant_id = ANY(p_consultant_ids));

  IF (SELECT count(*) FROM _tx) = 0 THEN
    RAISE EXCEPTION 'No approved, un-batched commissions found for this selection';
  END IF;

  SELECT COALESCE(sum(gross_amount),0), COALESCE(sum(tds_amount),0), COALESCE(sum(net_amount),0),
         count(*), count(DISTINCT consultant_id)
    INTO v_g, v_t, v_n, v_cnt, v_cons FROM _tx;

  INSERT INTO consultant_payout_batches
    (institution_id, batch_name, total_gross_amount, total_tds_amount, total_net_amount,
     total_transactions, total_consultants, status, prepared_by, prepared_at)
  VALUES (p_institution_id, p_batch_name, v_g, v_t, v_n, v_cnt, v_cons, 'prepared', p_prepared_by, now())
  RETURNING id, batch_number INTO v_batch_id, v_num;

  UPDATE consultant_commission_transactions
     SET payout_batch_id = v_batch_id, updated_at = now()
   WHERE id IN (SELECT id FROM _tx);

  RETURN jsonb_build_object('batch_id', v_batch_id, 'batch_number', v_num,
    'transactions', v_cnt, 'consultants', v_cons, 'net', v_n, 'status', 'prepared');
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_create_payout_batch(uuid,text,uuid[],uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_create_payout_batch(uuid,text,uuid[],uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Advance a batch through the chain, enforcing separation of duties (D10):
--    prepared → reviewed → approved → processed(paid). Each actor must differ
--    from the earlier actors as noted. 'processed' marks the linked commissions
--    paid. 'cancelled' unlinks them so they can be re-batched.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_advance_payout_batch(
  p_batch_id uuid,
  p_to_status text,           -- 'reviewed' | 'approved' | 'processed' | 'cancelled'
  p_actor uuid,
  p_payment_mode text DEFAULT NULL,
  p_bank_reference text DEFAULT NULL,
  p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b consultant_payout_batches;
BEGIN
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'Not authorised to advance a payout batch';
  END IF;
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'An identified actor is required to advance a payout batch';
  END IF;

  SELECT * INTO b FROM consultant_payout_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout batch not found'; END IF;

  IF p_to_status = 'reviewed' THEN
    IF b.status <> 'prepared' THEN RAISE EXCEPTION 'Batch must be prepared before it can be reviewed'; END IF;
    IF b.prepared_by IS NOT NULL AND p_actor = b.prepared_by THEN
      RAISE EXCEPTION 'The reviewer must be a different person from the preparer'; END IF;
    UPDATE consultant_payout_batches SET status='reviewed', reviewed_by=p_actor, reviewed_at=now(), updated_at=now() WHERE id=p_batch_id;

  ELSIF p_to_status = 'approved' THEN
    IF b.status <> 'reviewed' THEN RAISE EXCEPTION 'Batch must be reviewed before it can be approved'; END IF;
    IF p_actor = COALESCE(b.reviewed_by, p_actor) OR p_actor = COALESCE(b.prepared_by, '00000000-0000-0000-0000-000000000000') THEN
      RAISE EXCEPTION 'The approver must be different from the preparer and reviewer'; END IF;
    UPDATE consultant_payout_batches SET status='approved', approved_by=p_actor, approved_at=now(), updated_at=now() WHERE id=p_batch_id;

  ELSIF p_to_status = 'processed' THEN
    IF b.status <> 'approved' THEN RAISE EXCEPTION 'Batch must be approved before it can be paid'; END IF;
    IF p_actor = COALESCE(b.approved_by, '00000000-0000-0000-0000-000000000000') THEN
      RAISE EXCEPTION 'The person marking payment must differ from the approver'; END IF;
    IF nullif(p_payment_mode,'') IS NULL OR nullif(p_bank_reference,'') IS NULL THEN
      RAISE EXCEPTION 'Payment mode and bank reference are required to mark a batch paid'; END IF;
    UPDATE consultant_payout_batches
       SET status='processed', processed_by=p_actor, processed_at=now(), completed_at=now(),
           payment_mode=p_payment_mode, bank_reference=p_bank_reference, updated_at=now()
     WHERE id=p_batch_id;
    -- the linked commissions are now actually paid
    UPDATE consultant_commission_transactions
       SET status='paid', payment_date=CURRENT_DATE, payment_mode=p_payment_mode,
           payment_reference=p_bank_reference, updated_at=now()
     WHERE payout_batch_id=p_batch_id AND status='approved';

  ELSIF p_to_status = 'cancelled' THEN
    IF b.status = 'processed' THEN RAISE EXCEPTION 'A paid batch cannot be cancelled'; END IF;
    UPDATE consultant_payout_batches SET status='cancelled', rejection_reason=p_reason, updated_at=now() WHERE id=p_batch_id;
    UPDATE consultant_commission_transactions SET payout_batch_id=NULL, updated_at=now() WHERE payout_batch_id=p_batch_id;

  ELSE
    RAISE EXCEPTION 'Unknown target status: %', p_to_status;
  END IF;

  RETURN jsonb_build_object('batch_id', p_batch_id, 'status', p_to_status);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_advance_payout_batch(uuid,text,uuid,text,text,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_advance_payout_batch(uuid,text,uuid,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.fn_create_payout_batch(uuid,text,uuid[],uuid) IS
  'Creates a payout batch (status=prepared) from approved, un-batched commissions and links them. Admin-only. Replaces the schema-broken ConsultantService.createPayoutBatch.';
COMMENT ON FUNCTION public.fn_advance_payout_batch(uuid,text,uuid,text,text,text) IS
  'Advances a payout batch prepared→reviewed→approved→processed with separation of duties. processed marks linked commissions paid. cancelled unlinks them. Admin-only.';
