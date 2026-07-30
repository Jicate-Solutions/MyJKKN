-- Rotate ONLY the webhook secret of a Razorpay account, preserving webhook_ref.
--
-- Why this exists (incident 2026-07-29):
--   The webhook secret is a value the operator invents and types into BOTH the
--   Razorpay dashboard and this vault. It is stored encrypted and is never
--   readable back, so "I forgot which secret I set" is a normal, recurring
--   situation — and until now there was no way to fix it. The only paths that
--   write webhook_secret_encrypted were fn_set_razorpay_account and
--   fn_activate_razorpay_account, and BOTH also demand key_id + key_secret (the
--   Razorpay API credentials, which the operator may not still hold) and BOTH
--   mint a fresh webhook_ref — changing the webhook URL that has to be pasted
--   into the dashboard. Operators reached for "delete the account and recreate
--   it" instead, which is blocked by fn_delete_razorpay_account_by_id AND by the
--   payment_transactions FK (NO ACTION), because razorpay_account_id is the
--   credential pin every later verify/reconcile/REFUND re-resolves through.
--
--   This function closes that gap: new secret, same webhook_ref, same row, same
--   API keys, history intact.
--
-- Deliberately does NOT touch is_active, key_id or key_secret_encrypted.

CREATE OR REPLACE FUNCTION public.fn_rotate_razorpay_webhook_secret(
  p_account_id     uuid,
  p_webhook_secret text,
  p_master_secret  text,
  p_actor          uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, webhook_ref text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ref text;
BEGIN
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'fn_rotate_razorpay_webhook_secret: p_account_id must not be NULL';
  END IF;
  IF p_webhook_secret IS NULL OR length(trim(p_webhook_secret)) = 0 THEN
    RAISE EXCEPTION 'fn_rotate_razorpay_webhook_secret: p_webhook_secret must not be NULL or empty';
  END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN
    RAISE EXCEPTION 'fn_rotate_razorpay_webhook_secret: p_master_secret must not be NULL or empty';
  END IF;

  SELECT a.webhook_ref INTO v_ref
  FROM public.razorpay_accounts a
  WHERE a.id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_rotate_razorpay_webhook_secret: account % not found', p_account_id;
  END IF;

  -- A row that was never activated has no ref yet; mint one so the caller always
  -- gets back a usable webhook URL. An existing ref is PRESERVED — that is the
  -- entire point of this function.
  IF v_ref IS NULL OR length(trim(v_ref)) = 0 THEN
    v_ref := encode(gen_random_bytes(18), 'hex');
  END IF;

  UPDATE public.razorpay_accounts a
     SET webhook_secret_encrypted = pgp_sym_encrypt(p_webhook_secret, p_master_secret),
         webhook_ref              = v_ref,
         updated_at               = now(),
         updated_by               = p_actor
   WHERE a.id = p_account_id;

  RETURN QUERY SELECT p_account_id, v_ref;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rotate_razorpay_webhook_secret(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rotate_razorpay_webhook_secret(uuid, text, text, uuid) TO service_role;
