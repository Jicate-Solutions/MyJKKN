-- 20260613130000_razorpay_feehead_routing.sql
--
-- Institution × fee-head Razorpay account routing.
--
-- Extends the per-institution account system (20260603130000) so a single
-- institution can have one DEFAULT account (fee_head IS NULL -> tuition,
-- application, exam, ...) PLUS dedicated accounts per fee head (transport,
-- university_fee, establishment, ...), each its own standalone Razorpay MID.
--
-- Routing at order creation: given the bill's institution + billing_categories.kind,
-- resolve the most specific active account:
--     (institution, fee_head = bill kind)   -- exact head MID
--   -> (institution, fee_head IS NULL)        -- college default MID
--   -> common env account                     -- legacy fallback
--
-- fee_head stores a billing_categories.kind value, kept as plain TEXT so heads
-- like 'establishment' can be onboarded ahead of the enum. NULL = default slot.
-- mid/tid/dba_name are reference-only columns for HDFC-dashboard reconciliation;
-- routing is by key_id, the operational identity is the MID.

-- ────────────────────────────────────────────────────────────
-- 1. Columns
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.razorpay_accounts
  ADD COLUMN IF NOT EXISTS fee_head text,
  ADD COLUMN IF NOT EXISTS mid      text,
  ADD COLUMN IF NOT EXISTS tid      text,
  ADD COLUMN IF NOT EXISTS dba_name text;

COMMENT ON COLUMN public.razorpay_accounts.fee_head IS
  'billing_categories.kind this account settles (NULL = institution default/general MID).';
COMMENT ON COLUMN public.razorpay_accounts.mid IS 'HDFC SmartGateway MID (reconciliation reference).';
COMMENT ON COLUMN public.razorpay_accounts.tid IS 'HDFC SmartGateway TID (reconciliation reference).';
COMMENT ON COLUMN public.razorpay_accounts.dba_name IS 'HDFC merchant DBA name (reconciliation reference).';

-- ────────────────────────────────────────────────────────────
-- 2. One ACTIVE account per (institution, fee_head). COALESCE so two NULL-head
--    rows still collide (Postgres treats bare NULLs as distinct in unique indexes).
-- ────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.razorpay_accounts_active_institution_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS razorpay_accounts_active_inst_feehead_uidx
  ON public.razorpay_accounts (institution_id, COALESCE(fee_head, '__default__'))
  WHERE is_active;

-- ────────────────────────────────────────────────────────────
-- 3. Recreate the RPCs that gain a fee_head dimension.
--    (fn_get_*_by_id / _by_webhook_ref resolve a pinned/known account and need
--    no fee_head, so they are left untouched.)
-- ────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_set_razorpay_account(uuid, text, text, text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.fn_get_razorpay_account(uuid, text);
DROP FUNCTION IF EXISTS public.fn_list_razorpay_accounts();

-- ── 3a. SET (upsert with SLOT-SCOPED rotation) ───────────────
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
  IF p_institution_id IS NULL THEN
    RAISE EXCEPTION 'fn_set_razorpay_account: p_institution_id must not be NULL';
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

  -- Deactivate only the prior active account in THIS (institution, fee_head) slot,
  -- so adding/rotating a fee-head account never disturbs the institution's other
  -- accounts (including the default).
  UPDATE public.razorpay_accounts
    SET is_active = false, updated_at = now(), updated_by = p_actor
    WHERE institution_id = p_institution_id
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

-- ── 3b. GET active account for (institution, fee_head) — best match ──
--    Exact head wins; falls back to the institution default (fee_head IS NULL).
--    A NULL/blank head request only ever returns the default account.
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
  WHERE a.institution_id = p_institution_id
    AND a.is_active
    AND (a.fee_head = v_head OR a.fee_head IS NULL)
  ORDER BY (a.fee_head IS NOT DISTINCT FROM v_head) DESC
  LIMIT 1;
  -- 0 rows when the institution has no active account at all (caller -> env fallback).
END;
$$;

-- ── 3c. LIST (no secrets) — now incl. fee_head / mid / tid / dba_name ──
CREATE OR REPLACE FUNCTION public.fn_list_razorpay_accounts()
RETURNS TABLE(
  id uuid, institution_id uuid, key_id text, account_label text,
  mode text, is_active boolean, webhook_ref text, created_at timestamptz,
  fee_head text, mid text, tid text, dba_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.institution_id, a.key_id, a.account_label,
         a.mode, a.is_active, a.webhook_ref, a.created_at,
         a.fee_head, a.mid, a.tid, a.dba_name
  FROM public.razorpay_accounts a
  ORDER BY a.institution_id, COALESCE(a.fee_head, ''), a.created_at DESC;
END;
$$;

-- ── 3d. DEACTIVATE a SPECIFIC account by id (additive; the institution-based
--        fn_deactivate_razorpay_account is left intact for backward-compat). ──
CREATE OR REPLACE FUNCTION public.fn_deactivate_razorpay_account_by_id(
  p_account_id uuid,
  p_actor      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'fn_deactivate_razorpay_account_by_id: p_account_id must not be NULL';
  END IF;
  UPDATE public.razorpay_accounts
    SET is_active = false, updated_at = now(), updated_by = p_actor
    WHERE id = p_account_id AND is_active;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. Grants — REVOKE ALL, then GRANT to service_role only (secrets live here).
-- ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_set_razorpay_account(uuid, text, text, text, text, text, text, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_razorpay_account(uuid, text, text, text, text, text, text, text, uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.fn_get_razorpay_account(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_razorpay_account(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.fn_list_razorpay_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_list_razorpay_accounts() TO service_role;

REVOKE ALL ON FUNCTION public.fn_deactivate_razorpay_account_by_id(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_deactivate_razorpay_account_by_id(uuid, uuid) TO service_role;
