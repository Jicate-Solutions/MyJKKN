-- Is this applicant one of ours? course_applications.applicant_origin.
--
-- A course can be bought by a complete stranger or by somebody who already
-- works or studies at JKKN, and until now nothing on the Applications tab said
-- which. The rule, chosen deliberately, is the EMAIL DOMAIN: an address ending
-- @jkkn.ac.in is internal, everything else is external.
--
-- WHY A NEW COLUMN RATHER THAN applicant_type. applicant_type already exists
-- and already has the values learner/staff/external, but it cannot carry this:
--
--   course_applications_identity_chk CHECK (
--        (applicant_type = 'learner'  AND learner_id IS NOT NULL)
--     OR (applicant_type = 'staff'    AND profile_id IS NOT NULL)
--     OR (applicant_type = 'external' AND external_participant_id IS NOT NULL))
--
-- A public applicant has no profile_id and no learner_id at submission — those
-- are created later, by approval — so the row can only ever be typed
-- 'external' at insert. applicant_type answers "which identity does this row
-- point at"; applicant_origin answers "where did this person come from". Two
-- different questions, two columns, and the CHECKs that guard the approval
-- path stay untouched.
--
-- WHY THE DOMAIN AND NOT A RECORD MATCH. fn_course_resolve_applicant already
-- matches an address against real staff and learner rows, which is strictly
-- more accurate — it catches a team member applying from a personal Gmail. The
-- domain rule was chosen anyway because it is predictable and explainable to
-- somebody reading the list: what it says is exactly what the address says. It
-- therefore has two known blind spots, recorded here so nobody rediscovers
-- them as bugs:
--
--   a.boobalzen003@gmail.com  reads EXTERNAL, though he is staff 635500-1
--   newhire@jkkn.ac.in        reads INTERNAL, with no staff record yet
--
-- Verified against the live data before choosing the predicate: jkkn.ac.in
-- covers 9,519 addresses and has NO subdomains in use, so an exact '@jkkn.ac.in'
-- suffix is unambiguous. It also correctly excludes the 217 synthetic
-- '@nolog.jkkn.local' placeholders, which belong to people with no real address
-- and must never read as internal.
--
-- No index: this is always read alongside course_event_id, which already
-- narrows to one course's applications.

ALTER TABLE public.course_applications
  ADD COLUMN IF NOT EXISTS applicant_origin text NOT NULL DEFAULT 'external';

ALTER TABLE public.course_applications
  DROP CONSTRAINT IF EXISTS course_applications_applicant_origin_check;

ALTER TABLE public.course_applications
  ADD CONSTRAINT course_applications_applicant_origin_check
  CHECK (applicant_origin IN ('internal', 'external'));

COMMENT ON COLUMN public.course_applications.applicant_origin IS
  'Where the applicant came from, judged purely from the email domain at submission: @jkkn.ac.in is internal, anything else external. Distinct from applicant_type, which records which identity the row points at and is constrained by course_applications_identity_chk. Written by app/api/public/courses/[slug]/apply/route.ts via classifyApplicantOrigin().';

-- Backfill the rows that predate the column, by the same rule.
UPDATE public.course_applications
   SET applicant_origin = CASE
         WHEN lower(btrim(coalesce(applicant_email, ''))) LIKE '%@jkkn.ac.in' THEN 'internal'
         ELSE 'external'
       END;
