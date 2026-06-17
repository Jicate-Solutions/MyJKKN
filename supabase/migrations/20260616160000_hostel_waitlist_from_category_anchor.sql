-- Optimistic upgrade: remember the learner's ORIGINAL category at upgrade time so the
-- hourly expiry job can restore it if the upgrade fee isn't paid by the hold deadline.
ALTER TABLE public.hostel_waitlist
  ADD COLUMN IF NOT EXISTS from_hostel_category_id uuid;
COMMENT ON COLUMN public.hostel_waitlist.from_hostel_category_id IS
  'Original hostel_category_id at the time the optimistic upgrade was confirmed; expiry restores it on non-payment.';
