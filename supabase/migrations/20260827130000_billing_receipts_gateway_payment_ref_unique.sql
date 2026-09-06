-- One gateway payment, one receipt — enforced by the database.
--
-- Incident (2026-08-27, pay_TUh0Qpmo3jktV8): Razorpay fires order.paid AND
-- payment.captured for a single capture; the two webhook invocations raced the
-- read-then-insert receipt guard and each created a receipt, and the browser
-- callback then created a third because .maybeSingle() errors on >1 row and the
-- error was discarded (read as "no receipt exists"). Same race hit an HDFC
-- payment on 2026-06-11 (pay_T0Dj8csNmd6rDp, 2 x Rs.12,000). All app-level
-- guards are read-then-act and cannot arbitrate concurrent serverless
-- invocations — only a constraint can.
--
-- Scope: automated gateway receipts only (payment_mode = 'online' AND
-- created_by IS NULL — both gateway flows write with the service-role client,
-- so created_by is always NULL for them). Manual accountant receipts are
-- EXCLUDED deliberately: one bank transfer (one UTR) legitimately settles
-- bills of two different learners as two receipts entered by hand, and the
-- production data contains nine such pairs.
--
-- Duplicates were voided into billing_receipts_voided before this index
-- (RCP-2026-007836, RCP-2026-007837, RCP-2026-002286).
create unique index if not exists uq_billing_receipts_gateway_payment_ref
  on public.billing_receipts (payment_reference_number)
  where payment_mode = 'online'
    and created_by is null
    and payment_reference_number is not null;

comment on index public.uq_billing_receipts_gateway_payment_ref is
  'One receipt per gateway payment reference for automated (created_by IS NULL) online receipts. Backstop against webhook/callback double-receipting races. If gateway receipt creation ever starts stamping created_by, this predicate must be updated with it.';
