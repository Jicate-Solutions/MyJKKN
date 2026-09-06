-- =============================================================================
-- Late-payment charge — "waive the whole bill" in one action
-- Created: 2026-08-07 · 🛑 FILE ONLY — NOT APPLIED. Apply is Director-gated.
-- Requires: 20260815010000_late_charge_mechanism.sql (billing_late_charges +
--           fn_late_charge_waive), applied to production 2026-08-07.
--
-- DIRECTOR DECISION (edge-case interview, 2026-08-07): alongside the existing
-- month-by-month waiver (fn_late_charge_waive, kept untouched for fine-tuning),
-- add a bigger brush — ONE action that forgives every late charge on a single
-- bill. Same gate (billing.late_charges.waive OR super admin — i.e. the
-- Director today, since the permission is granted to no role), same records
-- (approver + reason on every row), same penalty-bill cancellation.
--
-- Implementation note: each row is waived by PERFORM-ing fn_late_charge_waive
-- itself — ONE implementation of "waive" exists, so whole-bill and single-month
-- waivers can never drift apart in behaviour.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- fn_late_charge_waive_bill — waive EVERY not-yet-waived late charge on one
-- bill. Loops fn_late_charge_waive per row (behaviour identical by
-- construction: approver + reason recorded, linked penalty bill cancelled
-- unless already paid). Returns a summary the admin page can show.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_late_charge_waive_bill(p_bill_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_charge RECORD;
  v_result jsonb;
  v_rows_waived integer := 0;
  v_penalty_cancelled integer := 0;
  v_total numeric := 0;
BEGIN
  -- Same caller gate as fn_late_charge_waive.
  IF NOT (is_super_admin() OR user_has_permission('billing.late_charges.waive')) THEN
    RAISE EXCEPTION 'insufficient privilege: billing.late_charges.waive required'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'a waiver reason is required — waivers are always recorded with who and why';
  END IF;

  -- Every not-yet-waived charge on this one bill, oldest month first. Each is
  -- waived through fn_late_charge_waive so status/waived_by/waived_at/
  -- waiver_reason and the penalty-bill cancellation are exactly the
  -- single-month behaviour, row by row.
  FOR v_charge IN
    SELECT id, charge_amount
    FROM billing_late_charges
    WHERE bill_id = p_bill_id
      AND status <> 'waived'
    ORDER BY period_start
  LOOP
    v_result := fn_late_charge_waive(v_charge.id, p_reason);
    v_rows_waived := v_rows_waived + 1;
    v_total := v_total + v_charge.charge_amount;
    IF COALESCE((v_result ->> 'penalty_bill_cancelled')::boolean, false) THEN
      v_penalty_cancelled := v_penalty_cancelled + 1;
    END IF;
  END LOOP;

  IF v_rows_waived = 0 THEN
    RAISE EXCEPTION 'bill % has no late charges left to waive', p_bill_id;
  END IF;

  RETURN jsonb_build_object(
    'bill_id', p_bill_id,
    'rows_waived', v_rows_waived,
    'penalty_bills_cancelled', v_penalty_cancelled,
    'total_amount_waived', v_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_late_charge_waive_bill(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_late_charge_waive_bill(uuid, text) TO authenticated;
