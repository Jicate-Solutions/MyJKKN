-- 20260613170000_razorpay_account_edit_delete.sql
-- Edit (metadata) + delete actions for the payment-accounts admin panel.

-- Update reconciliation/display metadata (label/MID/TID/DBA/mode).
-- The routing slot (institution_id, fee_head) is changed ONLY when p_change_slot
-- is true AND the row is still a DRAFT — moving a live account's slot would
-- silently re-route money. p_change_slot defaults false so a metadata-only edit
-- never touches the slot (note: fee_head NULL is a valid value, so "null = no
-- change" can't be inferred — hence the explicit flag).
CREATE OR REPLACE FUNCTION public.fn_update_razorpay_account_meta(
  p_account_id     uuid,
  p_label          text,
  p_mid            text,
  p_tid            text,
  p_dba_name       text,
  p_mode           text DEFAULT NULL,
  p_institution_id uuid DEFAULT NULL,
  p_fee_head       text DEFAULT NULL,
  p_change_slot    boolean DEFAULT false,
  p_actor          uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_draft boolean;
  v_head     text := NULLIF(trim(p_fee_head), '');
BEGIN
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'fn_update_razorpay_account_meta: p_account_id must not be NULL'; END IF;
  SELECT (a.key_id IS NULL) INTO v_is_draft FROM public.razorpay_accounts a WHERE a.id = p_account_id;
  IF v_is_draft IS NULL THEN RAISE EXCEPTION 'fn_update_razorpay_account_meta: account % not found', p_account_id; END IF;

  UPDATE public.razorpay_accounts AS a SET
    account_label  = p_label,
    mid            = NULLIF(trim(p_mid), ''),
    tid            = NULLIF(trim(p_tid), ''),
    dba_name       = NULLIF(trim(p_dba_name), ''),
    mode           = COALESCE(CASE WHEN p_mode IN ('test','live') THEN p_mode END, a.mode),
    institution_id = CASE WHEN v_is_draft AND p_change_slot AND p_institution_id IS NOT NULL THEN p_institution_id ELSE a.institution_id END,
    fee_head       = CASE WHEN v_is_draft AND p_change_slot THEN v_head ELSE a.fee_head END,
    updated_at     = now(), updated_by = p_actor
  WHERE a.id = p_account_id;
END;
$$;

-- Hard-delete an account. Blocked when any transaction pins it (deactivate instead).
CREATE OR REPLACE FUNCTION public.fn_delete_razorpay_account_by_id(
  p_account_id uuid,
  p_actor      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'fn_delete_razorpay_account_by_id: p_account_id must not be NULL'; END IF;
  IF EXISTS (SELECT 1 FROM public.payment_transactions t WHERE t.razorpay_account_id = p_account_id)
     OR EXISTS (SELECT 1 FROM public.event_payment_transactions t WHERE t.razorpay_account_id = p_account_id) THEN
    RAISE EXCEPTION 'Cannot delete an account that has payment transactions. Deactivate it instead.';
  END IF;
  DELETE FROM public.razorpay_accounts a WHERE a.id = p_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_update_razorpay_account_meta(uuid, text, text, text, text, text, uuid, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_update_razorpay_account_meta(uuid, text, text, text, text, text, uuid, text, boolean, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fn_delete_razorpay_account_by_id(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_delete_razorpay_account_by_id(uuid, uuid) TO service_role;
