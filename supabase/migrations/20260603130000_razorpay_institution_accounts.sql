-- 20260603130000_razorpay_institution_accounts.sql
--
-- Institution-wise Razorpay (HDFC Collect Now) accounts.
-- Each institution can settle into its OWN Razorpay merchant account, matched by
-- institution_id. Institutions without a row fall back to the common env account.
--
-- Storage pattern mirrors lib/services/integrations/cal-api-key-vault.ts:
--   key_id          -> stored plaintext (it is a PUBLIC value, rzp_live_/rzp_test_)
--   key_secret      -> pgp_sym_encrypt(plaintext, master_secret) as bytea
--   webhook_secret  -> pgp_sym_encrypt(plaintext, master_secret) as bytea
-- Master key env var: RAZORPAY_CREDENTIALS_MASTER_SECRET
-- Decrypt ONLY via the fn_get_razorpay_account* SECURITY DEFINER functions, which are
-- REVOKE'd from anon + authenticated and GRANT'd to service_role only.
-- NEVER SELECT *_encrypted columns from application code.
--
-- webhook_ref: opaque per-row token used in the per-institution webhook URL path
--   /api/webhooks/razorpay/<webhook_ref>. It is generated per account row and is
--   NEVER reused. On key rotation a NEW active row (with a NEW webhook_ref) is
--   inserted and the previous row is deactivated but KEPT — so in-flight payments
--   on the old account still resolve their (old) webhook_secret and verify. Lookup
--   by webhook_ref therefore ignores is_active.

-- ────────────────────────────────────────────────────────────
-- 0. Extension
-- ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- NOTE: on Supabase pgcrypto lives in the `extensions` schema, so every function
-- that calls gen_random_bytes / pgp_sym_encrypt / pgp_sym_decrypt MUST include
-- `extensions` in its search_path (public first so our own tables resolve).

-- ────────────────────────────────────────────────────────────
-- 1. Table
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.razorpay_accounts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id            uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  key_id                    text NOT NULL,                 -- public (rzp_live_/rzp_test_)
  key_secret_encrypted      bytea NOT NULL,                -- pgp_sym_encrypt
  webhook_secret_encrypted  bytea NOT NULL,                -- pgp_sym_encrypt
  webhook_ref               text NOT NULL UNIQUE,          -- used in webhook URL path
  account_label             text,
  mode                      text NOT NULL DEFAULT 'live' CHECK (mode IN ('test','live')),
  is_active                 boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid REFERENCES public.profiles(id),
  updated_by                uuid REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.razorpay_accounts IS
  'Per-institution Razorpay merchant credentials. Secrets are pgcrypto-encrypted; '
  'access only via fn_get_razorpay_account* (service_role). key_id is public.';

-- At most one ACTIVE account per institution.
CREATE UNIQUE INDEX IF NOT EXISTS razorpay_accounts_active_institution_uidx
  ON public.razorpay_accounts (institution_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_razorpay_accounts_institution
  ON public.razorpay_accounts (institution_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_razorpay_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_razorpay_accounts_updated_at ON public.razorpay_accounts;
CREATE TRIGGER trigger_razorpay_accounts_updated_at
BEFORE UPDATE ON public.razorpay_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_razorpay_accounts_updated_at();

-- RLS: service-role only (secrets live here; all reads go through SECURITY DEFINER RPCs).
ALTER TABLE public.razorpay_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages razorpay accounts" ON public.razorpay_accounts;
CREATE POLICY "Service role manages razorpay accounts" ON public.razorpay_accounts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- 2. Pin the settling account onto each transaction (rotation-safe + audit).
--    NULL = the common env (fallback) account.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS razorpay_account_id uuid REFERENCES public.razorpay_accounts(id);
ALTER TABLE public.event_payment_transactions
  ADD COLUMN IF NOT EXISTS razorpay_account_id uuid REFERENCES public.razorpay_accounts(id);

-- ────────────────────────────────────────────────────────────
-- 3. SECURITY DEFINER helpers (pgcrypto). Master secret passed by caller (server-side).
-- ────────────────────────────────────────────────────────────

-- ── 3a. SET (upsert with rotation) ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_set_razorpay_account(
  p_institution_id uuid,
  p_key_id         text,
  p_key_secret     text,
  p_webhook_secret text,
  p_label          text,
  p_mode           text,
  p_webhook_ref    text,
  p_master_secret  text,
  p_actor          uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, webhook_ref text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id  uuid;
  v_ref text;
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

  -- Rotation: deactivate the current active account for this institution (kept for audit
  -- + so its in-flight payments can still resolve the old webhook_secret by webhook_ref).
  UPDATE public.razorpay_accounts
    SET is_active = false, updated_at = now(), updated_by = p_actor
    WHERE institution_id = p_institution_id AND is_active;

  INSERT INTO public.razorpay_accounts (
    institution_id, key_id, key_secret_encrypted, webhook_secret_encrypted,
    webhook_ref, account_label, mode, is_active, created_by, updated_by
  ) VALUES (
    p_institution_id, p_key_id,
    pgp_sym_encrypt(p_key_secret, p_master_secret),
    pgp_sym_encrypt(p_webhook_secret, p_master_secret),
    v_ref, p_label, p_mode, true, p_actor, p_actor
  )
  RETURNING razorpay_accounts.id, razorpay_accounts.webhook_ref INTO v_id, v_ref;

  RETURN QUERY SELECT v_id, v_ref;
END;
$$;

-- ── 3b. GET active account for an institution ────────────────
CREATE OR REPLACE FUNCTION public.fn_get_razorpay_account(
  p_institution_id uuid,
  p_master_secret  text
)
RETURNS TABLE(id uuid, key_id text, key_secret text, webhook_secret text, mode text, webhook_ref text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
  WHERE a.institution_id = p_institution_id AND a.is_active
  LIMIT 1;
  -- 0 rows when the institution has no active account (caller falls back to env).
END;
$$;

-- ── 3c. GET by account id (incl. deactivated — for pinned historical txns) ──
CREATE OR REPLACE FUNCTION public.fn_get_razorpay_account_by_id(
  p_account_id    uuid,
  p_master_secret text
)
RETURNS TABLE(id uuid, key_id text, key_secret text, webhook_secret text, mode text, webhook_ref text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'fn_get_razorpay_account_by_id: p_account_id must not be NULL';
  END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN
    RAISE EXCEPTION 'fn_get_razorpay_account_by_id: p_master_secret must not be NULL or empty';
  END IF;

  RETURN QUERY
  SELECT a.id, a.key_id,
         pgp_sym_decrypt(a.key_secret_encrypted, p_master_secret),
         pgp_sym_decrypt(a.webhook_secret_encrypted, p_master_secret),
         a.mode, a.webhook_ref
  FROM public.razorpay_accounts a
  WHERE a.id = p_account_id
  LIMIT 1;
END;
$$;

-- ── 3d. GET webhook secret by webhook_ref (ignores is_active — see header) ──
CREATE OR REPLACE FUNCTION public.fn_get_razorpay_account_by_webhook_ref(
  p_webhook_ref   text,
  p_master_secret text
)
RETURNS TABLE(id uuid, institution_id uuid, webhook_secret text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_webhook_ref IS NULL OR length(trim(p_webhook_ref)) = 0 THEN
    RAISE EXCEPTION 'fn_get_razorpay_account_by_webhook_ref: p_webhook_ref must not be NULL or empty';
  END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN
    RAISE EXCEPTION 'fn_get_razorpay_account_by_webhook_ref: p_master_secret must not be NULL or empty';
  END IF;

  RETURN QUERY
  SELECT a.id, a.institution_id,
         pgp_sym_decrypt(a.webhook_secret_encrypted, p_master_secret)
  FROM public.razorpay_accounts a
  WHERE a.webhook_ref = p_webhook_ref
  LIMIT 1;
END;
$$;

-- ── 3e. LIST (no secrets) — for audit / admin UI ─────────────
CREATE OR REPLACE FUNCTION public.fn_list_razorpay_accounts()
RETURNS TABLE(
  id uuid, institution_id uuid, key_id text, account_label text,
  mode text, is_active boolean, webhook_ref text, created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.institution_id, a.key_id, a.account_label,
         a.mode, a.is_active, a.webhook_ref, a.created_at
  FROM public.razorpay_accounts a
  ORDER BY a.created_at DESC;
END;
$$;

-- ── 3f. DEACTIVATE active account for an institution ─────────
CREATE OR REPLACE FUNCTION public.fn_deactivate_razorpay_account(
  p_institution_id uuid,
  p_actor          uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_institution_id IS NULL THEN
    RAISE EXCEPTION 'fn_deactivate_razorpay_account: p_institution_id must not be NULL';
  END IF;
  UPDATE public.razorpay_accounts
    SET is_active = false, updated_at = now(), updated_by = p_actor
    WHERE institution_id = p_institution_id AND is_active;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. Permission grants / revokes — REVOKE ALL, then GRANT to service_role only.
-- ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_set_razorpay_account(uuid, text, text, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_razorpay_account(uuid, text, text, text, text, text, text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.fn_get_razorpay_account(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_razorpay_account(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.fn_get_razorpay_account_by_id(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_razorpay_account_by_id(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.fn_get_razorpay_account_by_webhook_ref(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_razorpay_account_by_webhook_ref(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.fn_list_razorpay_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_list_razorpay_accounts() TO service_role;

REVOKE ALL ON FUNCTION public.fn_deactivate_razorpay_account(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_deactivate_razorpay_account(uuid, uuid) TO service_role;
