-- ============================================================================
-- IMS counter payments: collect through an ORDER, not a QR code.
--
-- WHY. The QR Codes API is not provisioned on the merchant account this store
-- collects into. Proven rather than assumed: a bare `GET /payments/qr_codes`,
-- which needs no parameters and no permissions, fails identically to the POST —
-- while `/orders` and `/payments` both answer 200 on the same keys. Payment
-- Links are refused too ("you do not have permission"). Orders + hosted checkout
-- is the one collection product this account actually has, and it is the same
-- one billing has used for every Razorpay payment since 2026-06-04.
--
-- The QR columns are deliberately KEPT. They cost nothing, the qr_code.credited
-- handler still works, and the day Razorpay enables the QR API the better
-- counter flow is already written and switches on.
-- ============================================================================

-- Split from any other DDL and given a short lock timeout on purpose: adding a
-- column takes ACCESS EXCLUSIVE, and a running dev server holding a read on the
-- table will deadlock against it. Failing fast is better than wedging the table.
SET lock_timeout = '15s';

ALTER TABLE public.ims_gateway_payments
    ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;

-- The order id is how the webhook and the callback find this row, and Razorpay
-- must never map one order to two counter payments. UNIQUE is what makes
-- "look the row up by order id" a safe primary lookup rather than a hopeful one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ims_gateway_payments_order
    ON public.ims_gateway_payments (razorpay_order_id)
    WHERE razorpay_order_id IS NOT NULL;

COMMENT ON COLUMN public.ims_gateway_payments.razorpay_order_id IS
    'Razorpay order id for hosted-checkout collection. Nullable because the row is '
    'inserted BEFORE Razorpay is called — if the API then fails we own a row we can '
    'close, rather than a live payment instrument nothing is tracking.';
