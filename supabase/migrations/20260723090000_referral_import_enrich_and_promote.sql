-- Referral import — enrich (report extras) + promote (the approve→write step)
-- Created 2026-07-23. Spec SPECS.md §6 F1, decisions D33/D34/D36/D37/D38/D25.
-- Builds on 20260722090000 (staging + fn_validate_referral_import_batch).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Report extras: enrolment status, amount owed, and a detected conflict.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.referral_import_rows
  ADD COLUMN IF NOT EXISTS enrolment_status   text,   -- 'confirmed' | 'registrar'
  ADD COLUMN IF NOT EXISTS amount_owed        numeric,-- NULL = "to be set" (D38)
  ADD COLUMN IF NOT EXISTS existing_referrer_id uuid, -- a DIFFERENT referrer already on record (D36)
  ADD COLUMN IF NOT EXISTS promoted_at        timestamptz;

-- Run after validate. Sets the three report extras for matched rows.
CREATE OR REPLACE FUNCTION public.fn_enrich_referral_import_batch(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.leads.edit')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  -- (a) enrolment: recent (this-term) attendance OR feedback = proof of presence (D33/D29).
  --     No signal → 'registrar' (D30: unknown, never auto-reject).
  UPDATE referral_import_rows r
     SET enrolment_status = CASE WHEN (
       EXISTS (SELECT 1 FROM student_attendance sa,
                    jsonb_each(sa.attendance_data) p(k,v),
                    jsonb_array_elements(v->'students') stu
                WHERE sa.attendance_date >= current_date - interval '120 days'
                  AND (stu->>'student_id')::uuid = r.matched_learner_id
                  AND stu->>'status' = 'Present')
       OR EXISTS (SELECT 1 FROM session_feedback sf
                   WHERE sf.student_id = r.matched_learner_id
                     AND sf.created_at >= current_date - interval '120 days')
     ) THEN 'confirmed' ELSE 'registrar' END
   WHERE r.batch_id = p_batch_id AND r.matched_learner_id IS NOT NULL;

  -- (b) amount owed (D37/D38):
  --     agreed>paid → the gap ; already paid, no higher agreed → 0 (settled) ;
  --     only an agreed figure → that ; nothing → NULL ("to be set").
  UPDATE referral_import_rows r
     SET amount_owed = CASE
       WHEN COALESCE(r.amount_paid,0) > 0 AND COALESCE(r.amount_agreed,0) > COALESCE(r.amount_paid,0)
            THEN r.amount_agreed - r.amount_paid
       WHEN COALESCE(r.amount_paid,0) > 0 THEN 0
       WHEN COALESCE(r.amount_agreed,0) > 0 THEN r.amount_agreed
       ELSE NULL END
   WHERE r.batch_id = p_batch_id;

  -- (c) conflict: the matched learner already has a DIFFERENT referrer (D36).
  UPDATE referral_import_rows r
     SET existing_referrer_id = lp.referred_by_id
    FROM learners_profiles lp
   WHERE r.batch_id = p_batch_id AND r.matched_learner_id = lp.id
     AND lp.referred_by_id IS NOT NULL
     AND lp.referred_by_id <> r.referrer_ref_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_enrich_referral_import_batch(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_enrich_referral_import_batch(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Promote — the SENIOR approve→write step. Writes only CLEAN ('ok') rows.
--    write-once attribution; already-paid → paid ledger row; conflict → dispute.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_promote_referral_import_batch(
  p_batch_id uuid, p_approver uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rec record; v_written int:=0; v_disputes int:=0; v_paid int:=0; v_skipped int:=0;
        v_reftype text; v_cur uuid;
BEGIN
  -- SENIOR only (D35: preparing is open, committing is not).
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'Only a senior admin may approve and write a referral import';
  END IF;

  FOR rec IN
    SELECT * FROM referral_import_rows
     WHERE batch_id = p_batch_id AND verdict = 'ok' AND promoted_at IS NULL
       AND matched_learner_id IS NOT NULL
  LOOP
    v_reftype := lower(rec.referrer_type);
    SELECT referred_by_id INTO v_cur FROM learners_profiles WHERE id = rec.matched_learner_id;

    IF v_cur IS NOT NULL AND v_cur <> rec.referrer_ref_id THEN
      -- conflict: DO NOT overwrite (write-once). Record a dispute on the existing
      -- attribution instead (D36). No credit rule is applied here.
      UPDATE consultant_lead_attributions
         SET is_disputed = true,
             dispute_reason = COALESCE(dispute_reason,'')
               || 'Import claim by referrer ' || rec.referrer_ref_id::text
               || ' (' || COALESCE(rec.referrer_name,'?') || ') conflicts with the referrer on record. '
       WHERE learner_profile_id = rec.matched_learner_id;
      v_disputes := v_disputes + 1;

    ELSIF v_cur IS NOT NULL AND v_cur = rec.referrer_ref_id THEN
      v_skipped := v_skipped + 1;   -- already recorded (dedup, D24)

    ELSE
      -- write-once: set the referrer; the sync trigger creates the attribution.
      UPDATE learners_profiles
         SET referred_by_id = rec.referrer_ref_id,
             referral_type   = v_reftype,
             referred_by_name = rec.referrer_name,
             updated_at = now()
       WHERE id = rec.matched_learner_id;
      v_written := v_written + 1;
    END IF;

    -- already-paid → record a PAID ledger row so it can never be paid again (D34).
    -- Cash rail only (consultants); faculty go via payroll, students excluded.
    IF COALESCE(rec.amount_paid,0) > 0 AND rec.referrer_ref_table = 'education_consultants'
       AND NOT EXISTS (SELECT 1 FROM consultant_commission_transactions t
                        WHERE t.learner_profile_id = rec.matched_learner_id
                          AND t.consultant_id = rec.referrer_ref_id) THEN
      INSERT INTO consultant_commission_transactions
        (institution_id, consultant_id, learner_profile_id, transaction_type,
         commission_basis_amount, gross_amount, tds_amount, other_deductions, net_amount,
         status, payment_date, payment_reference, notes, created_by)
      SELECT lp.institution_id, rec.referrer_ref_id, rec.matched_learner_id, 'referral_commission',
             rec.amount_paid, rec.amount_paid, 0, 0, rec.amount_paid,
             'paid', rec.paid_date, rec.paid_reference,
             'historical-2025-26 import — already paid by hand', p_approver
        FROM learners_profiles lp WHERE lp.id = rec.matched_learner_id;
      v_paid := v_paid + 1;
    END IF;

    UPDATE referral_import_rows SET promoted_at = now() WHERE id = rec.id;
  END LOOP;

  UPDATE referral_import_batches
     SET status='committed', approved_by=p_approver, approved_at=now(),
         committed_by=p_approver, committed_at=now(), updated_at=now()
   WHERE id = p_batch_id;

  RETURN jsonb_build_object('attributions_written', v_written, 'already_recorded', v_skipped,
    'conflicts_disputed', v_disputes, 'paid_records', v_paid);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_promote_referral_import_batch(uuid,uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_promote_referral_import_batch(uuid,uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_promote_referral_import_batch(uuid,uuid) IS
  'Senior approve→write for a referral import batch. Writes only ok rows: write-once attribution (never overwrites — conflicts become disputes), already-paid rows become paid ledger entries. The registrar worklist is simply the matched rows with enrolment_status=registrar.';
