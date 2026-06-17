-- 20260613160000_razorpay_draft_accounts.sql
--
-- DRAFT accounts: pre-create per-institution rows (institution + fee_head +
-- MID/TID/DBA) with NO keys, so the institution->MID mapping can be staged in the
-- admin panel and ACTIVATED later by adding keys. A draft is is_active=false +
-- key_id NULL, so fn_get_razorpay_account (filters is_active) never returns it —
-- those institutions safely use the env fallback until activation. Nothing ever
-- routes money to a keyless account.

-- 1. Allow keyless draft rows.
ALTER TABLE public.razorpay_accounts
  ALTER COLUMN key_id DROP NOT NULL,
  ALTER COLUMN key_secret_encrypted DROP NOT NULL,
  ALTER COLUMN webhook_secret_encrypted DROP NOT NULL,
  ALTER COLUMN webhook_ref DROP NOT NULL;

-- Invariant: an ACTIVE account MUST carry full credentials (drafts are inactive+keyless).
ALTER TABLE public.razorpay_accounts
  DROP CONSTRAINT IF EXISTS razorpay_accounts_active_requires_keys;
ALTER TABLE public.razorpay_accounts
  ADD CONSTRAINT razorpay_accounts_active_requires_keys
  CHECK (
    is_active = false
    OR (key_id IS NOT NULL AND key_secret_encrypted IS NOT NULL
        AND webhook_secret_encrypted IS NOT NULL AND webhook_ref IS NOT NULL)
  );

-- At most one DRAFT (keyless) per (institution, fee_head) slot.
CREATE UNIQUE INDEX IF NOT EXISTS razorpay_accounts_draft_inst_feehead_uidx
  ON public.razorpay_accounts (institution_id, COALESCE(fee_head, '__default__'))
  WHERE key_id IS NULL;

-- 2. Create (or update) a DRAFT account for an (institution, fee_head) slot. No keys,
--    no master secret needed. Upserts the slot's existing draft if present.
CREATE OR REPLACE FUNCTION public.fn_create_razorpay_draft(
  p_institution_id uuid,
  p_fee_head       text,
  p_label          text,
  p_mid            text,
  p_tid            text,
  p_dba_name       text,
  p_mode           text DEFAULT 'live',
  p_actor          uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id   uuid;
  v_head text := NULLIF(trim(p_fee_head), '');
  v_mode text := CASE WHEN p_mode IN ('test','live') THEN p_mode ELSE 'live' END;
BEGIN
  IF p_institution_id IS NULL THEN
    RAISE EXCEPTION 'fn_create_razorpay_draft: p_institution_id must not be NULL';
  END IF;

  UPDATE public.razorpay_accounts
    SET account_label = p_label,
        mid = NULLIF(trim(p_mid), ''), tid = NULLIF(trim(p_tid), ''),
        dba_name = NULLIF(trim(p_dba_name), ''), mode = v_mode,
        updated_at = now(), updated_by = p_actor
    WHERE institution_id = p_institution_id
      AND COALESCE(fee_head, '__default__') = COALESCE(v_head, '__default__')
      AND key_id IS NULL
    RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    INSERT INTO public.razorpay_accounts (
      institution_id, fee_head, account_label, mid, tid, dba_name, mode,
      is_active, created_by, updated_by
    ) VALUES (
      p_institution_id, v_head, p_label,
      NULLIF(trim(p_mid), ''), NULLIF(trim(p_tid), ''), NULLIF(trim(p_dba_name), ''),
      v_mode, false, p_actor, p_actor
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- 3. Activate a draft (or rotate a row in place) by adding encrypted keys.
--    Deactivates any OTHER active account in the same (institution, fee_head) slot.
CREATE OR REPLACE FUNCTION public.fn_activate_razorpay_account(
  p_account_id     uuid,
  p_key_id         text,
  p_key_secret     text,
  p_webhook_secret text,
  p_master_secret  text,
  p_webhook_ref    text DEFAULT NULL,
  p_actor          uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, webhook_ref text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ref  text;
  v_inst uuid;
  v_head text;
BEGIN
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'fn_activate_razorpay_account: p_account_id must not be NULL'; END IF;
  IF p_key_id IS NULL OR length(trim(p_key_id)) = 0 THEN RAISE EXCEPTION 'fn_activate_razorpay_account: p_key_id must not be NULL or empty'; END IF;
  IF p_key_secret IS NULL OR length(trim(p_key_secret)) = 0 THEN RAISE EXCEPTION 'fn_activate_razorpay_account: p_key_secret must not be NULL or empty'; END IF;
  IF p_webhook_secret IS NULL OR length(trim(p_webhook_secret)) = 0 THEN RAISE EXCEPTION 'fn_activate_razorpay_account: p_webhook_secret must not be NULL or empty'; END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN RAISE EXCEPTION 'fn_activate_razorpay_account: p_master_secret must not be NULL or empty'; END IF;

  -- Alias the table in every statement: the RETURNS TABLE output column `id`
  -- otherwise collides with razorpay_accounts.id (42702 ambiguous reference).
  SELECT a.institution_id, a.fee_head INTO v_inst, v_head
  FROM public.razorpay_accounts a WHERE a.id = p_account_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'fn_activate_razorpay_account: account % not found', p_account_id;
  END IF;

  v_ref := COALESCE(NULLIF(trim(p_webhook_ref), ''), encode(gen_random_bytes(18), 'hex'));

  UPDATE public.razorpay_accounts AS a
    SET is_active = false, updated_at = now(), updated_by = p_actor
    WHERE a.institution_id = v_inst
      AND COALESCE(a.fee_head, '__default__') = COALESCE(v_head, '__default__')
      AND a.is_active AND a.id <> p_account_id;

  UPDATE public.razorpay_accounts AS a
    SET key_id = p_key_id,
        key_secret_encrypted = pgp_sym_encrypt(p_key_secret, p_master_secret),
        webhook_secret_encrypted = pgp_sym_encrypt(p_webhook_secret, p_master_secret),
        webhook_ref = v_ref, is_active = true, updated_at = now(), updated_by = p_actor
    WHERE a.id = p_account_id;

  RETURN QUERY SELECT p_account_id, v_ref;
END;
$$;

-- 4. fn_list gains a derived status (draft | active | inactive).
DROP FUNCTION IF EXISTS public.fn_list_razorpay_accounts();
CREATE OR REPLACE FUNCTION public.fn_list_razorpay_accounts()
RETURNS TABLE(
  id uuid, institution_id uuid, key_id text, account_label text,
  mode text, is_active boolean, webhook_ref text, created_at timestamptz,
  fee_head text, mid text, tid text, dba_name text, status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.institution_id, a.key_id, a.account_label,
         a.mode, a.is_active, a.webhook_ref, a.created_at,
         a.fee_head, a.mid, a.tid, a.dba_name,
         CASE WHEN a.key_id IS NULL THEN 'draft'
              WHEN a.is_active THEN 'active'
              ELSE 'inactive' END AS status
  FROM public.razorpay_accounts a
  ORDER BY a.institution_id, COALESCE(a.fee_head, ''), a.created_at DESC;
END;
$$;

-- 5. Grants — service_role only.
REVOKE ALL ON FUNCTION public.fn_create_razorpay_draft(uuid, text, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_razorpay_draft(uuid, text, text, text, text, text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.fn_activate_razorpay_account(uuid, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_activate_razorpay_account(uuid, text, text, text, text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.fn_list_razorpay_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_list_razorpay_accounts() TO service_role;
