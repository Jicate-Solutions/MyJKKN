-- =====================================================================
-- HR Recruitment — make proposed_monthly_salary OPTIONAL
-- =====================================================================
-- The Salary Negotiation section on the candidate detail page must allow
-- proposing / countering a package WITHOUT committing to a figure yet
-- (e.g. the breakdown or the notes carry the offer, or the number is still
-- being worked out internally). Previously NOT NULL, which made the front-end
-- field mandatory at the DB layer regardless of what the form allowed.
--
-- No CHECK constraint exists on the amount, so DROP NOT NULL is sufficient.
-- Existing rows are unaffected (all currently hold a value).
-- =====================================================================

ALTER TABLE public.hr_recruitment_candidate_packages
  ALTER COLUMN proposed_monthly_salary DROP NOT NULL;

COMMENT ON COLUMN public.hr_recruitment_candidate_packages.proposed_monthly_salary IS
  'Proposed monthly salary. Optional — a package may be proposed or countered without a figure; the breakdown/notes may carry the offer instead.';
