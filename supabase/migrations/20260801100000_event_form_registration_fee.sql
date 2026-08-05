-- Per-form registration fee.
--
-- An event holds MANY registration forms (one per monthly run). Each run can
-- charge a different amount, so the fee belongs to the FORM, not the event.
--
-- Why not reuse the tournament shape: a tournament's entry fee lives on
-- `tournament_divisions.config->>'entry_fee'` because a tournament charges per
-- division. General events (lectures, convocations, cultural programmes) have no
-- divisions at all, so there was nowhere for a fee to live — which is why no
-- general event could ever collect money.
--
-- Deliberately NOT added: a per-form `fee_head` column. Event fees resolve the
-- host institution's 'tuition' Razorpay account, exactly as tournaments already
-- do (see EventPaymentService call in the tournament public-register route). A
-- per-form override would invite MID drift with no event-specific MIDs to point
-- it at; adding one later is additive if HDFC ever issues them.
--
-- Backward compatible: DEFAULT 0 makes every existing form free, so applying
-- this changes no behaviour. (8 forms live at time of writing.)
--
-- RLS: untouched on purpose. Every policy on event_registration_forms gates on
-- event_id, which is unchanged — the _manage / _select gates keep working.
--
-- The fee is written through a plain UPDATE (EventRegistrationFormService
-- .updateForm), NOT through save_event_registration_form. That RPC is left
-- completely alone: DROP FUNCTION discards a function's ACL, and dropping it to
-- add a parameter would silently hand EXECUTE back to PUBLIC (incl. anon) —
-- exactly the regression the multi-form migration had to repair.

ALTER TABLE public.event_registration_forms
  ADD COLUMN IF NOT EXISTS fee_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_label  text;

-- A negative fee is never meaningful and would produce a negative Razorpay
-- order. Guard at the only layer that cannot be bypassed.
ALTER TABLE public.event_registration_forms
  DROP CONSTRAINT IF EXISTS event_registration_forms_fee_amount_check;

ALTER TABLE public.event_registration_forms
  ADD CONSTRAINT event_registration_forms_fee_amount_check
  CHECK (fee_amount >= 0);

COMMENT ON COLUMN public.event_registration_forms.fee_amount IS
  'Registration fee in INR for THIS form. 0 = free (no Razorpay order is created; the registration confirms immediately with payment_status = not_required).';

COMMENT ON COLUMN public.event_registration_forms.fee_label IS
  'Optional label shown to the registrant beside the amount, e.g. "Delegate fee". NULL renders just the amount.';
