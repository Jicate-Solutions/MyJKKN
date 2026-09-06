-- Add 'combined' (Combined Payment) to the allowed billing_receipts.payment_mode values.
--
-- Context: the single-receipt form (app/(routes)/billing/receipts/new) and the
-- bulk-receipt flow (billing/schedule bulk dialog + bulk-import) let an operator
-- pick a Payment Mode. The DB CHECK constraint is the source of truth for what
-- values are legal — without adding 'combined' here, the UI could offer it but
-- the INSERT would fail with a silent 23514 check-constraint violation.
--
-- 'combined' is a flat mode label (like cash/online), stored as a plain string.
-- It records that a payment was settled via a combination of methods; no
-- per-method sub-amount breakdown is captured.

ALTER TABLE public.billing_receipts
  DROP CONSTRAINT IF EXISTS billing_receipts_payment_mode_check;

ALTER TABLE public.billing_receipts
  ADD CONSTRAINT billing_receipts_payment_mode_check
  CHECK (
    (payment_mode)::text = ANY (
      (ARRAY['cash', 'online', 'bank_transfer', 'dd', 'cheque', 'combined'])::text[]
    )
  );
