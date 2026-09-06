-- ============================================================================
-- Who paid, how, and from where — lifted out of the JSON blob.
--
-- Everything below was ALREADY being captured: gateway_response holds the whole
-- Razorpay payment entity, VPA and bank RRN included. What was missing was any way
-- to read it. Nothing in the application — IMS or billing — ever looked inside that
-- blob, so answering "who paid this?" meant opening the JSONB in SQL or logging into
-- the Razorpay dashboard.
--
-- Extracting into columns is what makes the data queryable, indexable, and joinable
-- to a report. The blob stays as the source of truth: these columns are a projection
-- of it, never a substitute, and the backfill below re-derives them from it.
--
-- WHY gateway_method AND NOT `method`. The existing `method` column carries
-- CHECK (method = 'upi_qr') — it records the till's tender type, which is always
-- upi_qr for a gateway sale. But hosted checkout lets the customer choose card or
-- netbanking, and the till would still book it as upi_qr. gateway_method records
-- what the customer ACTUALLY used, so the two questions stop sharing one answer.
-- ============================================================================

SET lock_timeout = '15s';

ALTER TABLE public.ims_gateway_payments
    -- What the customer actually paid with: upi | card | netbanking | wallet | emi
    ADD COLUMN IF NOT EXISTS gateway_method     TEXT,
    -- Paid FROM
    ADD COLUMN IF NOT EXISTS payer_vpa          TEXT,
    ADD COLUMN IF NOT EXISTS payer_contact      TEXT,
    ADD COLUMN IF NOT EXISTS payer_email        TEXT,
    ADD COLUMN IF NOT EXISTS payer_bank         TEXT,
    ADD COLUMN IF NOT EXISTS payer_wallet       TEXT,
    -- Bank-side references. bank_rrn is what appears on a bank statement, and is
    -- therefore the field reconciliation actually turns on.
    ADD COLUMN IF NOT EXISTS bank_rrn           TEXT,
    ADD COLUMN IF NOT EXISTS upi_transaction_id TEXT,
    -- What Razorpay charged us on this collection.
    ADD COLUMN IF NOT EXISTS gateway_fee_paise  BIGINT,
    ADD COLUMN IF NOT EXISTS gateway_tax_paise  BIGINT,
    -- Paid TO. The PUBLISHABLE key id only — it identifies which merchant account
    -- took the money and is already sent to the browser at checkout. The secret and
    -- the webhook secret stay encrypted in razorpay_accounts and never come here.
    ADD COLUMN IF NOT EXISTS razorpay_key_id    TEXT;

COMMENT ON COLUMN public.ims_gateway_payments.gateway_method IS
    'What the customer actually paid with (upi/card/netbanking/wallet). Distinct from '
    '`method`, which is the till''s tender type and is always upi_qr for a gateway sale.';
COMMENT ON COLUMN public.ims_gateway_payments.bank_rrn IS
    'Acquirer RRN — the reference that appears on the bank statement. Reconciliation key.';
COMMENT ON COLUMN public.ims_gateway_payments.razorpay_key_id IS
    'Publishable Razorpay key id of the account that received the money ("paid to"). '
    'Denormalised because razorpay_accounts is service_role-only under RLS, so a '
    'client-side report cannot join to it. Never holds a secret.';

-- Reconciliation looks payments up by bank reference; without this that is a scan.
CREATE INDEX IF NOT EXISTS idx_ims_gateway_payments_bank_rrn
    ON public.ims_gateway_payments (bank_rrn)
    WHERE bank_rrn IS NOT NULL;

-- The report's default view: this store, newest first.
CREATE INDEX IF NOT EXISTS idx_ims_gateway_payments_store_created
    ON public.ims_gateway_payments (store_id, created_at DESC);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Re-derive the columns from the blob that already holds them, so historical rows
-- appear in the new report rather than showing blanks.
--
-- Guarded on entity='payment': a row whose order creation failed stores the ORDER
-- entity instead, which has none of these fields. Reading it would write nulls over
-- nothing, but the guard says why the row is skipped.
UPDATE public.ims_gateway_payments AS p
SET gateway_method     = p.gateway_response ->> 'method',
    payer_vpa          = p.gateway_response ->> 'vpa',
    payer_contact      = p.gateway_response ->> 'contact',
    payer_email        = p.gateway_response ->> 'email',
    payer_bank         = p.gateway_response ->> 'bank',
    payer_wallet       = p.gateway_response ->> 'wallet',
    bank_rrn           = p.gateway_response -> 'acquirer_data' ->> 'rrn',
    upi_transaction_id = p.gateway_response -> 'acquirer_data' ->> 'upi_transaction_id',
    gateway_fee_paise  = NULLIF(p.gateway_response ->> 'fee', '')::BIGINT,
    gateway_tax_paise  = NULLIF(p.gateway_response ->> 'tax', '')::BIGINT
WHERE p.gateway_response ->> 'entity' = 'payment'
  AND p.gateway_method IS NULL;
