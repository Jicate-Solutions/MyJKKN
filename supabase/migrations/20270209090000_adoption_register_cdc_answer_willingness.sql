-- Adoption loop — register the second half of the campus-drive willingness pair.
--
-- Why this row has to exist before any code is wired:
--   fn_feature_used writes nothing, and reports no error, when no feature_registry
--   row matches the key. A recording call added to a screen whose key is not
--   registered therefore looks finished — the code ships, the tests pass, the pull
--   request says the screen is instrumented — and the module stays blind. The Bugs
--   desk caught exactly this on 2026-09-23 while wiring #3966: it checked the
--   register first, found no row for cdc.answer_willingness, and refused to add the
--   call. This migration is that missing row.
--
-- The pair, and why both halves are needed:
--   cdc.declare_interest     already registered — someone says they ARE interested
--                            in a campus drive (intent = willing only).
--   cdc.answer_willingness   this row — someone ANSWERS the willingness question at
--                            all, either way.
--   Without the second, a learner who opens the question and declines is
--   indistinguishable from a learner who never saw it, and the module reads as
--   ignored when it is in fact being used and answered no. The share that matters
--   for adoption is "did the question reach a person who acted on it", not "did they
--   say yes".
--
-- Intended for learners: the willingness question is asked of learners eligible for
-- a drive. Shipped date matches cdc.declare_interest (2026-06-20), the date the
-- willingness screen went live, so the feature is aged from when people could first
-- use it rather than from when it was registered — otherwise it would be treated as
-- brand new and exempt from the ask-why rules it should already be subject to.
--
-- usage_wired stays false. It is a label the adoption desk flips after it has seen
-- the recording code deploy; it does not gate the write (fn_feature_used does not
-- read it), so rows may legitimately appear before the flip.
--
-- TWO SWITCHES, ONE INDISTINGUISHABLE ZERO. A missing registry row is not the only
-- way this records nothing. fn_feature_used is also gated on the platform policy
-- adoption.loop.enabled, and either switch being off produces the same silent no-op
-- with no error and nothing in any log. The policy resolves true today, so after
-- this row lands the key is genuinely measurable — but anyone debugging a feature
-- that "records nothing" should check both, not just the register.
--
-- Written as a plain INSERT rather than through fn_adoption_register on purpose:
-- that function opens with a super-admin check, and a migration runs as the owner
-- with no auth.uid(), so the RPC would raise rather than insert. One consequence is
-- accepted rather than worked around: the RPC would set created_by to the caller
-- and this row will have it NULL, which is the honest record for a row created by a
-- migration and not by a person.
--
-- Idempotent: re-running changes nothing, and it will not overwrite a row created by
-- hand through fn_adoption_register in the meantime.

INSERT INTO public.feature_registry (
  feature_key,
  title,
  module,
  intended_roles,
  core_action,
  shipped_at,
  usage_wired,
  status
)
VALUES (
  'cdc.answer_willingness',
  'Answer the willingness question on a campus drive',
  'cdc',
  ARRAY['student']::text[],
  'answer the willingness question on a campus drive, either way',
  '2026-06-20T00:00:00+05:30'::timestamptz,
  false,
  'live'
)
ON CONFLICT (feature_key) DO NOTHING;
