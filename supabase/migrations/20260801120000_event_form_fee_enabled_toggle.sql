-- Explicit "charge a fee for this form" switch.
--
-- BEFORE: fee_amount > 0 was the ONLY signal that a form charged. That overloads
-- one number with two meanings — "this form is free" and "nobody has set a price
-- yet" are indistinguishable, and turning a fee off temporarily means destroying
-- the amount, then retyping it to turn it back on.
--
-- AFTER: fee_enabled is the switch, fee_amount is the price. A form charges only
-- when BOTH are set (enabled AND amount > 0), which is enforced at every read
-- boundary in code rather than by a CHECK here: the builder saves the toggle and
-- the amount together, but a defensive server-side floor is cheaper than a
-- constraint that could reject a legitimate intermediate state.
--
-- Backfill is exact, not assumed: any form that was already charging (fee_amount
-- > 0) becomes enabled, so no live form silently stops collecting. At time of
-- writing all 8 forms are 0.00, so this changes nothing — the clause exists so
-- the migration is correct whenever it runs, not just today.

ALTER TABLE public.event_registration_forms
  ADD COLUMN IF NOT EXISTS fee_enabled boolean NOT NULL DEFAULT false;

UPDATE public.event_registration_forms
   SET fee_enabled = true
 WHERE fee_amount > 0
   AND fee_enabled = false;

COMMENT ON COLUMN public.event_registration_forms.fee_enabled IS
  'Whether this form charges a registration fee. A fee is collected only when fee_enabled AND fee_amount > 0; either one off means the form is free and no Razorpay order is created.';
