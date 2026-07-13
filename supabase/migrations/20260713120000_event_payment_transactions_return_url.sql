-- Tournament payment checkout fix: stash the initiating flow's return URL so
-- the Razorpay callback route can redirect back to the right
-- audience-appropriate page (guest public page vs organizer management page)
-- without relying on a query string surviving Razorpay's POST-back.

BEGIN;

ALTER TABLE event_payment_transactions
  ADD COLUMN IF NOT EXISTS return_url text;

COMMENT ON COLUMN event_payment_transactions.return_url IS
  'Origin-relative URL to redirect back to after Razorpay hosted checkout completes; set at initiatePayment() time from the caller''s returnUrl.';

COMMIT;
