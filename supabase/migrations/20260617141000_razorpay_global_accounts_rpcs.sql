-- 20260617141000_razorpay_global_accounts_rpcs.sql
--
-- Global-aware Razorpay routing + write RPCs. Extends 20260613130000 / 160000 / 170000.
-- A "global" account has institution_id IS NULL and serves its fee_head for every institution.

-- ── Router: resolve the account for (institution, fee_head), now considering globals.
--    Precedence: exact head beats default; institution-specific beats global.
CREATE OR REPLACE FUNCTION public.fn_get_razorpay_account(
  p_institution_id uuid,
  p_master_secret  text,
  p_fee_head       text DEFAULT NULL
)
RETURNS TABLE(id uuid, key_id text, key_secret text, webhook_secret text, mode text, webhook_ref text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_head text := NULLIF(trim(p_fee_head), '');
BEGIN
  IF p_institution_id IS NULL THEN
    RAISE EXCEPTION 'fn_get_razorpay_account: p_institution_id must not be NULL';
  END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN
    RAISE EXCEPTION 'fn_get_razorpay_account: p_master_secret must not be NULL or empty';
  END IF;

  RETURN QUERY
  SELECT a.id, a.key_id,
         pgp_sym_decrypt(a.key_secret_encrypted, p_master_secret),
         pgp_sym_decrypt(a.webhook_secret_encrypted, p_master_secret),
         a.mode, a.webhook_ref
  FROM public.razorpay_accounts a
  WHERE a.is_active
    AND (a.institution_id = p_institution_id OR a.institution_id IS NULL)
    AND (a.fee_head = v_head OR a.fee_head IS NULL)
  ORDER BY (a.fee_head IS NOT DISTINCT FROM v_head) DESC,   -- exact head beats default
           (a.institution_id IS NOT NULL) DESC               -- institution-specific beats global
  LIMIT 1;
  -- 0 rows -> caller falls back to the common env account.
END;
$$;

-- ── NEW: resolve the active GLOBAL account for a fee head (admin Test action only;
--    the normal router needs an institution).
CREATE OR REPLACE FUNCTION public.fn_get_razorpay_account_global(
  p_master_secret text,
  p_fee_head      text
)
RETURNS TABLE(id uuid, key_id text, key_secret text, webhook_secret text, mode text, webhook_ref text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_head text := NULLIF(trim(p_fee_head), '');
BEGIN
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN
    RAISE EXCEPTION 'fn_get_razorpay_account_global: p_master_secret must not be NULL or empty';
  END IF;
  IF v_head IS NULL THEN
    RAISE EXCEPTION 'fn_get_razorpay_account_global: p_fee_head must not be NULL';
  END IF;

  RETURN QUERY
  SELECT a.id, a.key_id,
         pgp_sym_decrypt(a.key_secret_encrypted, p_master_secret),
         pgp_sym_decrypt(a.webhook_secret_encrypted, p_master_secret),
         a.mode, a.webhook_ref
  FROM public.razorpay_accounts a
  WHERE a.is_active AND a.institution_id IS NULL AND a.fee_head = v_head
  LIMIT 1;
END;
$$;

-- ── Draft upsert: allow a global slot (institution NULL); a global draft must target a head.
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
  IF p_institution_id IS NULL AND v_head IS NULL THEN
    RAISE EXCEPTION 'fn_create_razorpay_draft: a global account (no institution) must target a specific fee head';
  END IF;

  UPDATE public.razorpay_accounts
    SET account_label = p_label,
        mid = NULLIF(trim(p_mid), ''), tid = NULLIF(trim(p_tid), ''),
        dba_name = NULLIF(trim(p_dba_name), ''), mode = v_mode,
        updated_at = now(), updated_by = p_actor
    WHERE COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE(p_institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
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

-- ── Active upsert (legacy add/rotate): allow a global slot; global must target a head.
CREATE OR REPLACE FUNCTION public.fn_set_razorpay_account(
  p_institution_id uuid,
  p_key_id         text,
  p_key_secret     text,
  p_webhook_secret text,
  p_label          text,
  p_mode           text,
  p_webhook_ref    text,
  p_master_secret  text,
  p_actor          uuid DEFAULT NULL,
  p_fee_head       text DEFAULT NULL,
  p_mid            text DEFAULT NULL,
  p_tid            text DEFAULT NULL,
  p_dba_name       text DEFAULT NULL
)
RETURNS TABLE(id uuid, webhook_ref text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id   uuid;
  v_ref  text;
  v_head text := NULLIF(trim(p_fee_head), '');
BEGIN
  IF p_institution_id IS NULL AND v_head IS NULL THEN
    RAISE EXCEPTION 'fn_set_razorpay_account: a global account (no institution) must target a specific fee head';
  END IF;
  IF p_key_id IS NULL OR length(trim(p_key_id)) = 0 THEN
    RAISE EXCEPTION 'fn_set_razorpay_account: p_key_id must not be NULL or empty';
  END IF;
  IF p_key_secret IS NULL OR length(trim(p_key_secret)) = 0 THEN
    RAISE EXCEPTION 'fn_set_razorpay_account: p_key_secret must not be NULL or empty';
  END IF;
  IF p_webhook_secret IS NULL OR length(trim(p_webhook_secret)) = 0 THEN
    RAISE EXCEPTION 'fn_set_razorpay_account: p_webhook_secret must not be NULL or empty';
  END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN
    RAISE EXCEPTION 'fn_set_razorpay_account: p_master_secret must not be NULL or empty';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('test','live') THEN
    RAISE EXCEPTION 'fn_set_razorpay_account: p_mode must be ''test'' or ''live''';
  END IF;

  v_ref := COALESCE(NULLIF(trim(p_webhook_ref), ''), encode(gen_random_bytes(18), 'hex'));

  -- Deactivate only the prior active account in THIS slot (institution|global, fee_head).
  UPDATE public.razorpay_accounts
    SET is_active = false, updated_at = now(), updated_by = p_actor
    WHERE COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE(p_institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND COALESCE(fee_head, '__default__') = COALESCE(v_head, '__default__')
      AND is_active;

  INSERT INTO public.razorpay_accounts (
    institution_id, key_id, key_secret_encrypted, webhook_secret_encrypted,
    webhook_ref, account_label, mode, is_active, created_by, updated_by,
    fee_head, mid, tid, dba_name
  ) VALUES (
    p_institution_id, p_key_id,
    pgp_sym_encrypt(p_key_secret, p_master_secret),
    pgp_sym_encrypt(p_webhook_secret, p_master_secret),
    v_ref, p_label, p_mode, true, p_actor, p_actor,
    v_head, NULLIF(trim(p_mid), ''), NULLIF(trim(p_tid), ''), NULLIF(trim(p_dba_name), '')
  )
  RETURNING razorpay_accounts.id, razorpay_accounts.webhook_ref INTO v_id, v_ref;

  RETURN QUERY SELECT v_id, v_ref;
END;
$$;

-- ── Activate a draft / rotate in place. Fix: existence via NOT FOUND (a global row has
--    NULL institution legitimately); slot-dedup uses the COALESCE slot key.
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

  SELECT a.institution_id, a.fee_head INTO v_inst, v_head
  FROM public.razorpay_accounts a WHERE a.id = p_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_activate_razorpay_account: account % not found', p_account_id;
  END IF;

  v_ref := COALESCE(NULLIF(trim(p_webhook_ref), ''), encode(gen_random_bytes(18), 'hex'));

  UPDATE public.razorpay_accounts AS a
    SET is_active = false, updated_at = now(), updated_by = p_actor
    WHERE COALESCE(a.institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE(v_inst, '00000000-0000-0000-0000-000000000000'::uuid)
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

-- ── Metadata edit: a draft slot change may now set NULL (global); global must target a head.
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

  IF p_change_slot AND v_is_draft AND p_institution_id IS NULL AND v_head IS NULL THEN
    RAISE EXCEPTION 'fn_update_razorpay_account_meta: a global account (no institution) must target a specific fee head';
  END IF;

  UPDATE public.razorpay_accounts AS a SET
    account_label  = p_label,
    mid            = NULLIF(trim(p_mid), ''),
    tid            = NULLIF(trim(p_tid), ''),
    dba_name       = NULLIF(trim(p_dba_name), ''),
    mode           = COALESCE(CASE WHEN p_mode IN ('test','live') THEN p_mode END, a.mode),
    institution_id = CASE WHEN v_is_draft AND p_change_slot THEN p_institution_id ELSE a.institution_id END,
    fee_head       = CASE WHEN v_is_draft AND p_change_slot THEN v_head ELSE a.fee_head END,
    updated_at     = now(), updated_by = p_actor
  WHERE a.id = p_account_id;
END;
$$;

-- ── Grants — service_role only (secrets live here).
REVOKE ALL ON FUNCTION public.fn_get_razorpay_account(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_razorpay_account(uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_get_razorpay_account_global(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_razorpay_account_global(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_create_razorpay_draft(uuid, text, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_razorpay_draft(uuid, text, text, text, text, text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fn_set_razorpay_account(uuid, text, text, text, text, text, text, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_razorpay_account(uuid, text, text, text, text, text, text, text, uuid, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_activate_razorpay_account(uuid, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_activate_razorpay_account(uuid, text, text, text, text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fn_update_razorpay_account_meta(uuid, text, text, text, text, text, uuid, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_update_razorpay_account_meta(uuid, text, text, text, text, text, uuid, text, boolean, uuid) TO service_role;
