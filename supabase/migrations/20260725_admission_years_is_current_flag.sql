-- Admission Years: explicit "current cohort" designation.
--
-- Context (2026-07-25): the Admission Year module had no way to declare which
-- cohort is live. `is_active` could not serve that role — every one of the 47
-- rows across 11 institutions is is_active=true, including a 2002-2003 row.
-- Consumers (the shared <AdmissionYearSelect autoSelectCurrent/>) were therefore
-- guessing via `year === new Date().getFullYear()` with a "latest active"
-- fallback. That guess is correct today only because all 11 institutions happen
-- to have a 2026 row; an institution missing the current-year row silently
-- defaulted to its latest cohort (2024, or 2002 in one case).
--
-- This makes the module the source of truth: exactly one is_current row per
-- institution, enforced by a partial unique index plus a trigger that demotes
-- the previous holder atomically (so the UI is a toggle, not a 23505 error).

ALTER TABLE public.admission_years
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.admission_years.is_current IS
  'Exactly one per institution. The cohort new leads/enquiries default to. Distinct from is_active, which only controls dropdown visibility and stays true for historical cohorts so legacy imports can still resolve them.';

-- Backfill BEFORE the index/trigger exist so neither can interfere:
-- each institution's latest active cohort becomes its current one.
WITH latest AS (
  SELECT DISTINCT ON (institution_id) id
    FROM public.admission_years
   WHERE is_active
   ORDER BY institution_id, year DESC
)
UPDATE public.admission_years ay
   SET is_current = true
  FROM latest
 WHERE ay.id = latest.id
   AND ay.is_current IS DISTINCT FROM true;

CREATE UNIQUE INDEX IF NOT EXISTS admission_years_one_current_per_institution
  ON public.admission_years (institution_id)
  WHERE is_current;

-- Two invariants, enforced where they cannot be bypassed by a client:
--   1. An inactive cohort can never be the current one.
--   2. Promoting a cohort demotes the institution's previous current cohort.
-- SECURITY DEFINER because the demotion writes sibling rows the acting user may
-- not hold an UPDATE policy for; the WHERE clause pins the write to the same
-- institution_id the user was already permitted to update.
CREATE OR REPLACE FUNCTION public.admission_years_enforce_single_current()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT NEW.is_active THEN
    NEW.is_current := false;
  END IF;

  IF NEW.is_current THEN
    UPDATE public.admission_years
       SET is_current = false,
           updated_at = timezone('utc'::text, now())
     WHERE institution_id = NEW.institution_id
       AND id <> NEW.id
       AND is_current;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admission_years_single_current ON public.admission_years;
CREATE TRIGGER trg_admission_years_single_current
  BEFORE INSERT OR UPDATE OF is_current, is_active ON public.admission_years
  FOR EACH ROW
  EXECUTE FUNCTION public.admission_years_enforce_single_current();

-- SECURITY DEFINER makes PostgREST expose this at
-- /rest/v1/rpc/admission_years_enforce_single_current for `anon` (supabase
-- linter 0028). A RETURNS TRIGGER function cannot do anything when called
-- directly, but leaving it callable is needless surface area.
-- Safe to revoke: PostgreSQL checks EXECUTE on a trigger function at
-- CREATE TRIGGER time, not on each fire, so the trigger keeps working.
REVOKE EXECUTE ON FUNCTION public.admission_years_enforce_single_current()
  FROM anon, authenticated;
