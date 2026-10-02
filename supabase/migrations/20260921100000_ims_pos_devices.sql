-- 20260921100000_ims_pos_devices.sql
--
-- Razorpay POS (Ezetap) Dynamic-QR terminals at IMS selling counters.
--
-- Vendor contract: docs/razorpay-pos/RazorpayPOS-P2P-DQR-API-Documentation.md
-- Design:          specs/razorpay-pos-dqr-device-integration-2026-08-27.md
--
-- SCOPE: IMS counters only. Named ims_pos_devices (not the spec's pos_devices)
-- so no other module's payment code can mistake it for shared billing plumbing.
--
-- WHAT THIS ADDS
--   1. ims_pos_devices — which physical terminal sits on which store counter,
--      plus its Ezetap credentials. The appKey is pgp_sym_encrypt'ed with
--      RAZORPAY_CREDENTIALS_MASTER_SECRET (same vendor, same sensitivity, one
--      secret to rotate). service_role only; every read goes through the server.
--   2. Additive columns on ims_gateway_payments so a DQR push is tracked on the
--      SAME row type as the Razorpay QR: server-priced cart_snapshot, the
--      finalize lease, late_credit and uq_ims_sales_gateway_payment all apply
--      unchanged. ims_gateway_finalize_sale is instrument-agnostic (it books
--      through the upi_qr tender fields) and is NOT modified.
--   3. uq_ims_pos_device_inflight — at most one open push per terminal. The
--      vendor refuses a second with EZETAP_0000623 ("device busy"); enforcing it
--      here means the refusal happens BEFORE any call to Ezetap.
--
-- Purely additive: until a store has an active device, nothing behaves differently.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─── 1. Device registry ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ims_pos_devices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id      UUID NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
    store_id            UUID NOT NULL REFERENCES public.ims_stores(id)   ON DELETE RESTRICT,

    device_label        TEXT NOT NULL,
    -- Printed on the terminal, so semi-public: stored plaintext.
    device_serial       TEXT NOT NULL,
    -- The pushTo.deviceId suffix. DQR soundbox today; the handheld Android POS
    -- (POS Bridge) uses the same three endpoints and differs only here.
    device_kind         TEXT NOT NULL DEFAULT 'razorpay_pos_soundbox'
                        CHECK (device_kind IN ('razorpay_pos_soundbox', 'ezetap_android')),

    username            TEXT,
    app_key_encrypted   BYTEA,
    -- Ezetap accountLabel, for a device settling to several MIDs/TIDs.
    account_label       TEXT,

    -- demo → demo.ezetap.com (SIMULATED money), live → www.ezetap.com.
    environment         TEXT NOT NULL DEFAULT 'demo'
                        CHECK (environment IN ('demo', 'live')),
    is_active           BOOLEAN NOT NULL DEFAULT false,

    -- Health, written by the push path. Informational only — never gates a push.
    last_push_at        TIMESTAMPTZ,
    last_error_code     TEXT,
    last_error_message  TEXT,
    last_error_at       TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES public.profiles(id),
    updated_by          UUID REFERENCES public.profiles(id),

    -- A device cannot be switched on without something to authenticate with.
    CONSTRAINT ims_pos_devices_active_needs_creds
        CHECK (NOT is_active OR (username IS NOT NULL AND app_key_encrypted IS NOT NULL))
);

-- One active terminal per counter: "push to this store" must be unambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ims_pos_devices_active_store
    ON public.ims_pos_devices (store_id) WHERE is_active;

-- One serial is one piece of hardware; two active rows for it would race.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ims_pos_devices_active_serial
    ON public.ims_pos_devices (device_serial) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_ims_pos_devices_institution
    ON public.ims_pos_devices (institution_id);

-- The device's institution is the store's. Derived, never trusted from input.
CREATE OR REPLACE FUNCTION public.ims_pos_devices_sync_institution()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    SELECT institution_id INTO NEW.institution_id
      FROM public.ims_stores WHERE id = NEW.store_id;
    IF NEW.institution_id IS NULL THEN
        RAISE EXCEPTION 'Store not found' USING ERRCODE = 'foreign_key_violation';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ims_pos_devices_sync_institution ON public.ims_pos_devices;
CREATE TRIGGER trg_ims_pos_devices_sync_institution
    BEFORE INSERT OR UPDATE OF store_id ON public.ims_pos_devices
    FOR EACH ROW EXECUTE FUNCTION public.ims_pos_devices_sync_institution();

ALTER TABLE public.ims_pos_devices ENABLE ROW LEVEL SECURITY;

-- Secrets live here (encrypted, but still). Only the server touches the table.
DROP POLICY IF EXISTS "Service role manages IMS POS devices" ON public.ims_pos_devices;
CREATE POLICY "Service role manages IMS POS devices" ON public.ims_pos_devices
    FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.ims_pos_devices FROM anon, authenticated, PUBLIC;
GRANT  ALL ON public.ims_pos_devices TO service_role;

-- ─── Credential RPCs (service_role only) ─────────────────────────────────────

-- Write (or rotate) credentials. Never echoes the key back.
CREATE OR REPLACE FUNCTION public.ims_pos_device_set_credentials(
    p_device_id     UUID,
    p_username      TEXT,
    p_app_key       TEXT,
    p_master_secret TEXT,
    p_actor         UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF coalesce(btrim(p_username), '') = '' OR coalesce(btrim(p_app_key), '') = '' THEN
        RAISE EXCEPTION 'Username and app key are both required' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF coalesce(p_master_secret, '') = '' THEN
        RAISE EXCEPTION 'Master secret is not configured' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    UPDATE public.ims_pos_devices
       SET username          = btrim(p_username),
           app_key_encrypted = pgp_sym_encrypt(btrim(p_app_key), p_master_secret),
           updated_by        = p_actor,
           updated_at        = now()
     WHERE id = p_device_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Device not found' USING ERRCODE = 'no_data_found';
    END IF;
END;
$$;

-- Read one device with its decrypted key. Pinned by id: an in-flight payment is
-- always queried against the device it was pushed to, even after a swap.
CREATE OR REPLACE FUNCTION public.ims_pos_device_get_credentials(
    p_device_id     UUID,
    p_master_secret TEXT
)
RETURNS TABLE (
    id             UUID,
    institution_id UUID,
    store_id       UUID,
    device_label   TEXT,
    device_serial  TEXT,
    device_kind    TEXT,
    username       TEXT,
    app_key        TEXT,
    account_label  TEXT,
    environment    TEXT,
    is_active      BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT d.id, d.institution_id, d.store_id, d.device_label, d.device_serial,
           d.device_kind, d.username,
           CASE WHEN d.app_key_encrypted IS NULL THEN NULL
                ELSE pgp_sym_decrypt(d.app_key_encrypted, p_master_secret) END,
           d.account_label, d.environment, d.is_active
      FROM public.ims_pos_devices d
     WHERE d.id = p_device_id;
$$;

REVOKE ALL ON FUNCTION public.ims_pos_device_set_credentials(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ims_pos_device_get_credentials(UUID, TEXT)                 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ims_pos_device_set_credentials(UUID, TEXT, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.ims_pos_device_get_credentials(UUID, TEXT)                 TO service_role;
REVOKE ALL ON FUNCTION public.ims_pos_devices_sync_institution() FROM PUBLIC, anon, authenticated;

-- ─── 2. ims_gateway_payments: additive columns ───────────────────────────────

ALTER TABLE public.ims_gateway_payments
    ADD COLUMN IF NOT EXISTS pos_device_id  UUID REFERENCES public.ims_pos_devices(id) ON DELETE RESTRICT,
    -- Ezetap's handle for the push; the key for status and cancel.
    ADD COLUMN IF NOT EXISTS p2p_request_id TEXT,
    -- Ezetap's transaction id from the status response — the reconciliation key
    -- against the Razorpay POS portal.
    ADD COLUMN IF NOT EXISTS ezetap_txn_id  TEXT,
    -- Denormalised: ims_pos_devices is service_role-only, so a report in the
    -- cashier's session cannot join to it (same reasoning as razorpay_key_id).
    ADD COLUMN IF NOT EXISTS device_serial  TEXT,
    ADD COLUMN IF NOT EXISTS device_label   TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ims_gwpay_p2p_request
    ON public.ims_gateway_payments (p2p_request_id) WHERE p2p_request_id IS NOT NULL;

-- 3. One open push per terminal. Fires on the INSERT that precedes the push.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ims_pos_device_inflight
    ON public.ims_gateway_payments (pos_device_id)
    WHERE pos_device_id IS NOT NULL AND status = 'initiated';

-- Widen the CHECKs by name-agnostic lookup: the originals were created inline and
-- carry generated names.
DO $$
DECLARE c RECORD;
BEGIN
    FOR c IN
        SELECT conname, pg_get_constraintdef(oid) AS def
          FROM pg_constraint
         WHERE conrelid = 'public.ims_gateway_payments'::regclass
           AND contype  = 'c'
    LOOP
        IF c.def LIKE '%method%upi_qr%' OR c.def LIKE '%status = ANY%initiated%' THEN
            EXECUTE format('ALTER TABLE public.ims_gateway_payments DROP CONSTRAINT %I', c.conname);
        END IF;
    END LOOP;
END $$;

ALTER TABLE public.ims_gateway_payments
    ADD CONSTRAINT ims_gateway_payments_method_check
        CHECK (method IN ('upi_qr', 'pos_dqr'));

-- needs_review: Ezetap could not say whether money moved (P2P_STATUS_UNKNOWN at
-- the deadline, or a cancel it refused). Calling that 'failed' would tell the
-- cashier to collect again from a customer who may already have paid.
ALTER TABLE public.ims_gateway_payments
    ADD CONSTRAINT ims_gateway_payments_status_check
        CHECK (status IN ('initiated', 'paid', 'failed', 'expired', 'cancelled',
                          'amount_mismatch', 'needs_review'));

-- A DQR row always names its terminal; a Razorpay row never does.
ALTER TABLE public.ims_gateway_payments
    ADD CONSTRAINT ims_gateway_payments_dqr_device_check
        CHECK ((method = 'pos_dqr') = (pos_device_id IS NOT NULL));

COMMENT ON TABLE public.ims_pos_devices IS
    'Razorpay POS (Ezetap) DQR terminals per IMS store counter. service_role only; appKey pgp_sym_encrypt''ed with RAZORPAY_CREDENTIALS_MASTER_SECRET.';
