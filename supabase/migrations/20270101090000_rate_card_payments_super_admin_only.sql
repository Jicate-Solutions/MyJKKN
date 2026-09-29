-- Recording money against the rate card becomes super-admin only
-- Created 2026-09-21. Director, same day: "tighten who can record a payment to
-- super admins only."
--
-- WHAT IT WAS: the write policy admitted is_super_admin() OR is_admin() OR
-- user_has_permission('admission.consultants.commissions.manage'). That last
-- clause is held by admission, admission_staff, ceo, coo,
-- executive_admin_officer and managing_director — 41 people in all could record
-- a payment or an advance against an agency.
--
-- WHAT IT IS NOW: is_super_admin() alone. 16 people.
--
-- THIS COVERS ADVANCES TOO. An advance is a row in this same table, so it is the
-- same gate; there is no second rule to change and no way for the two to drift.
--
-- READING IS UNCHANGED. Anyone with admission.consultants.commissions.view still
-- sees every figure. Tightening the read as well would blank the screen for the
-- people who are supposed to be watching the money.
--
-- SAFE TO DO NOW: zero payments and zero advances exist, so no one's work is
-- interrupted — there is no workflow to break yet. Doing it before the first
-- rupee is recorded is the cheapest this will ever be.
--
-- NOTE FOR THE NEXT READER: this is deliberately STRICTER than changing a rate,
-- which remains is_super_admin() OR is_admin() on commission_rate_card_slabs.
-- The Director was told about that asymmetry and this is what he asked for. Do
-- not "even them up" without asking him.

DROP POLICY IF EXISTS commission_rate_card_payments_write ON public.commission_rate_card_payments;

CREATE POLICY commission_rate_card_payments_write ON public.commission_rate_card_payments
  FOR ALL
  USING      ((SELECT is_super_admin()))
  WITH CHECK ((SELECT is_super_admin()));

COMMENT ON TABLE public.commission_rate_card_payments IS
  'Payments, recoveries and advances against the service-charge rate card. Recording any of them is super-admin only (Director, 2026-09-21); reading follows admission.consultants.commissions.view.';
