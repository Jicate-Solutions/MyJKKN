-- Reconnect NOTJIC013 (SRIPRIYA S) to the staff profile that was created for
-- her and then orphaned.
--
-- She is one of five staff left without a profile by the blank-institution-email
-- bug (see 20260828160000). Her case is different from the other four: a profile
-- ALREADY exists for her and simply was never linked, because staff.profile_id
-- is only set by sync_staff_to_profiles, which does nothing when the staff row
-- has no institution_email.
--
-- WHY THIS ADDRESS AND NOT A NAME MATCH. Three profiles carry her name, and
-- picking on name alone is how the wrong person gets linked. The evidence here
-- is structural, not nominal:
--
--   sankarmuthu864@gmail.com     role=student, Engineering, INACTIVE, 2025-08-01
--   sripriyascse2022@jkkn.ac.in  role=student, Engineering, is a LEARNER profile
--   sripriyas@jkkn.ac.in         role=jicate_staff, Jicate Solutions,
--                                created 2026-08-17 07:06:10
--
-- Her staff row was created 2026-08-17 07:05:12 — fifty-eight seconds before
-- the third profile, in the same institution, with the same role. The other two
-- are her student identities and must not be touched.
--
-- Setting the email is the whole repair: sync_staff_to_profiles looks up an
-- existing profile by `email = NEW.institution_email`, preferring one that has
-- an auth user, and links it. Verified in a rolled-back transaction to LINK
-- 0246f58f-e80e-4922-8d53-2a0518b03add rather than create a duplicate (count of
-- profiles with that address stayed at 1).
--
-- The other four (CNR020, CNR021, NOTCOP034, NOTCOP035) have no account
-- anywhere and still need their real @jkkn.ac.in addresses from HR. They are
-- deliberately not touched here: an institution email is a login identity, and
-- the naming convention is not derivable — colleagues use sangeetha_v@,
-- mohanraj.d@, chitrap@, elamathi@, mythili.b1@, dharshini_nursing@ and
-- role mailboxes like nursingprincipal@.

BEGIN;

UPDATE public.staff
SET institution_email = 'sripriyas@jkkn.ac.in'
WHERE staff_id = 'NOTJIC013'
  AND profile_id IS NULL
  AND institution_email IS NULL;

COMMIT;
