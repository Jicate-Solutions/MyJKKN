-- Migration: 20260730160000_ims_gateway_payments
-- Purpose: track gateway-VERIFIED counter payments, so "paid" stops meaning
--          "a cashier typed a reference number and clicked a button".
--
-- WHAT THIS REPLACES. The POS today builds a plain upi://pay deeplink from
-- ims_stores.upi_vpa and shows it. The money goes to a bank account the
-- application has no connection to, so it can never learn whether the customer
-- actually paid. ims_upi_qr_payments.status flips to 'paid' only because a human
-- says so, and the UTR beside it is unvalidated free text. A mistaken — or
-- untruthful — entry books a sale for money that never arrived.
--
-- A Razorpay-issued QR belongs to a merchant account we CAN query. Razorpay
-- reports the credit itself, with the amount it actually captured, which we
-- compare against the bill before booking anything.
--
-- WHY A SEPARATE TABLE and not more columns on ims_sales: the payment row must
-- exist BEFORE the sale does. The customer scans and pays first; only then is
-- stock deducted and an invoice number burnt. So the row is created at QR time
-- with sale_id NULL and back-linked on success — the same shape
-- ims_upi_qr_payments already uses.
--
-- NOTE ims_pos_checkout IS DELIBERATELY NOT MODIFIED. The gateway leg is tendered
-- through the existing upi_qr fields, so the checkout function's tender rules
-- (cash may be over-tendered for change, electronic legs may not) apply unchanged.
-- What marks a sale as gateway-verified is the FK below, which is a stronger
-- claim than an enum value: it points at the confirmed payment row itself.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. The payment attempt
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ims_gateway_payments (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    store_id               UUID NOT NULL REFERENCES public.ims_stores(id) ON DELETE CASCADE,
    institution_id         UUID NOT NULL,
    cashier_id             UUID NOT NULL REFERENCES public.profiles(id),

    -- Our reference, echoed into the gateway's notes so a payment can be traced
    -- back from the Razorpay dashboard without opening this application.
    transaction_ref        TEXT NOT NULL UNIQUE,

    provider               TEXT NOT NULL DEFAULT 'razorpay',
    method                 TEXT NOT NULL DEFAULT 'upi_qr' CHECK (method IN ('upi_qr')),

    razorpay_qr_code_id    TEXT UNIQUE,          -- qr_XXXX; NULL until the API answers
    razorpay_payment_id    TEXT,                 -- pay_XXXX; set on credit
    -- Which vault row issued this QR. Pinned so a later key rotation or fee-head
    -- change cannot make an in-flight payment unverifiable.
    razorpay_account_id    UUID REFERENCES public.razorpay_accounts(id),

    -- Paise is the gateway's unit and the one comparison that matters; the rupee
    -- mirror exists so reports do not divide everywhere.
    amount_paise           BIGINT NOT NULL CHECK (amount_paise > 0),
    amount                 NUMERIC(12,2) NOT NULL,
    captured_amount_paise  BIGINT,

    status                 TEXT NOT NULL DEFAULT 'initiated'
                           CHECK (status IN ('initiated','paid','failed','expired',
                                             'cancelled','amount_mismatch')),

    -- The server-priced cart this QR was opened for. The sale is booked FROM THIS,
    -- never from whatever the browser sends at confirm time — that is what stops
    -- the amount charged and the amount booked from diverging.
    cart_snapshot          JSONB NOT NULL,

    customer_type          TEXT NOT NULL DEFAULT 'walk_in',
    customer_name          TEXT,
    customer_phone         TEXT,
    qr_image_url           TEXT,

    -- Back-link, set once the sale is booked. NULL while the payment is in flight.
    sale_id                UUID REFERENCES public.ims_sales(id),

    -- Razorpay credited AFTER our own expiry. We take the money and flag it rather
    -- than refusing something we have actually received.
    late_credit            BOOLEAN NOT NULL DEFAULT FALSE,
    -- Rate-limits the live inquiry the POS poll makes, so N counters polling every
    -- few seconds cannot hammer Razorpay into a rate limit.
    last_inquiry_at        TIMESTAMPTZ,
    -- Compare-and-swap lease held while the sale is being booked. Two polls (two
    -- tabs, or a retry) can both see status='paid' AND sale_id IS NULL; without
    -- claiming the row first, both would call ims_pos_checkout, deducting stock
    -- twice and burning two invoice numbers before the unique index on
    -- ims_sales(gateway_payment_id) caught the second link. The lease expires so a
    -- crash mid-booking cannot strand the payment forever.
    finalize_claimed_at    TIMESTAMPTZ,
    -- Set when the money is confirmed but booking the sale failed. The cashier is
    -- shown "payment received, completing sale" and a retry — never asked to take
    -- payment again.
    finalize_error         TEXT,

    gateway_response       JSONB,

    expires_at             TIMESTAMPTZ NOT NULL,
    paid_at                TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ims_gateway_payments IS
'Gateway-verified counter payments. Created when the QR is issued (sale_id NULL) and back-linked once the sale is booked. Unlike ims_upi_qr_payments, "paid" here means Razorpay reported the credit, not that a cashier asserted it.';

COMMENT ON COLUMN public.ims_gateway_payments.cart_snapshot IS
'Server-priced cart the QR was opened for. The sale is booked from this, so the amount charged and the amount booked cannot diverge.';

CREATE INDEX IF NOT EXISTS idx_ims_gwpay_store_status
    ON public.ims_gateway_payments (store_id, status);
CREATE INDEX IF NOT EXISTS idx_ims_gwpay_sale
    ON public.ims_gateway_payments (sale_id);
-- Drives the cashier's "resume unfinished payment" banner.
CREATE INDEX IF NOT EXISTS idx_ims_gwpay_cashier_recent
    ON public.ims_gateway_payments (cashier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ims_gwpay_rzp_payment
    ON public.ims_gateway_payments (razorpay_payment_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. The link from the sale, and the guarantee against booking it twice
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ims_sales
    ADD COLUMN IF NOT EXISTS gateway_payment_id UUID REFERENCES public.ims_gateway_payments(id);

COMMENT ON COLUMN public.ims_sales.gateway_payment_id IS
'Set when this sale was paid through the payment gateway. Its presence — not payment_method — is what distinguishes a gateway-VERIFIED payment from a manually confirmed UPI QR.';

-- The hard floor. Two finalizers (the webhook marking paid, the cashier''s poll
-- booking the sale) can race; this makes a second sale for the same payment
-- impossible at the database rather than merely unlikely in application code.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ims_sales_gateway_payment
    ON public.ims_sales (gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Lock the table down.
--
--    Supabase runs ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon AND
--    authenticated, so a REVOKE aimed only at "anon, PUBLIC" would leave
--    authenticated holding INSERT/UPDATE/DELETE/TRUNCATE. Every write here happens
--    through a service-role route, so no client needs more than SELECT.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ims_gateway_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL    ON TABLE public.ims_gateway_payments FROM anon, PUBLIC, authenticated;
GRANT  SELECT ON TABLE public.ims_gateway_payments TO   authenticated;

-- Institution-scoped, NOT `USING (true)`. ims_upi_qr_payments shipped with
-- USING (true), which is a cross-institution read leak that the CI table guard
-- cannot see because RLS is technically enabled. Do not repeat it.
DROP POLICY IF EXISTS ims_gateway_payments_select ON public.ims_gateway_payments;
CREATE POLICY ims_gateway_payments_select
    ON public.ims_gateway_payments
    FOR SELECT TO authenticated
    USING (
        public.get_current_user_role() = 'super_admin'
        OR institution_id IN (SELECT public.ims_accessible_institution_ids())
    );

-- No INSERT/UPDATE/DELETE policies at all: writes are service-role only, which
-- bypasses RLS. Nothing to grant, nothing to get wrong.

NOTIFY pgrst, 'reload schema';
