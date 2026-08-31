-- Correct the misspelt mail domain on NOTCOP034 (TAMILSELVI B):
--   tamilselvi@gail.com  ->  tamilselvi@gmail.com
--
-- 'gail.com' is not a mail provider; the address as stored can never receive
-- anything. staff.email carries a UNIQUE index and nothing else holds the
-- corrected address, so this cannot collide.
--
-- CAVEAT WORTH KNOWING: 'tamilselvi@gmail.com' is a very short, very common
-- handle and was almost certainly registered by someone else years ago. Fixing
-- the domain makes the address deliverable, but not necessarily deliverable TO
-- HER. Her real address should be confirmed with her; until then, treat any
-- mail sent to it as going to a stranger. Her institution email — the one that
-- actually creates her login — is still outstanding either way.
--
-- Three more unambiguous domain typos were found by the same sweep and are
-- deliberately NOT changed here, pending confirmation:
--   NOTCOP030  @gamail.com   -> gmail.com
--   CAS061     @jkkn.a.c.in  -> jkkn.ac.in
--   (inactive) @jkkn.acin    -> jkkn.ac.in
-- Two others were left alone on purpose: DCH030 uses @jkkndcah.com, which is
-- plausibly the Dental college's own domain rather than a typo, and JTI007 is
-- junk test data in the Testing Institution.

BEGIN;

UPDATE public.staff
SET email = 'tamilselvi@gmail.com'
WHERE staff_id = 'NOTCOP034'
  AND lower(email) = 'tamilselvi@gail.com';

COMMIT;
