-- =====================================================================
-- Biometric identity on staff
-- =====================================================================
-- Plan: docs/superpowers/plans/2026-08-06-biometric-attendance-ingestion.md
--
-- The device export identifies people by an enrolment code (Empcode), e.g.
-- 00002 / 04158 / 30 / 605. Verified against the real July 2026 Main Office
-- export: NONE of the 48 codes matches staff.staff_id, and there is no
-- derivable rule (00002 -> NOT100, 00593 -> CAS140). The mapping must be stored.
--
-- WHY TWO COLUMNS, NOT ONE
-- Each machine numbers its own enrolments from 1, so a code is only meaningful
-- paired with the machine that issued it — 00002 on the Main Office machine and
-- 00002 on the Dental machine are different people.
--
-- And the scope is NOT staff.institution_id. In the real export, 13 of the 36
-- identified people on the Main Office machine belong to OTHER institutions
-- (e.g. Krishnaveni A is code 00593 on the MO machine, but her institution is
-- JKKN College of Arts and Science (Self)). The namespace is the institution
-- that OWNS THE MACHINE, which is a different thing.
--
-- ACCEPTED LIMITS (both hypothetical today — no staff works across institutions,
-- hr_staff_institution_allocation is empty):
--   * one staff member holds one code on one machine
--   * no re-issue history: reassigning a leaver's code re-attributes their past
-- If either becomes real, upgrade to hr_biometric_enrollments
-- (institution_id, biometric_code, staff_id, effective_from, effective_until)
-- and make these two columns a view over it.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Code normalisation.
-- The SAME export mixes zero-padded and bare codes (00002, 04158, 30, 605),
-- so 00002 / 002 / 2 must compare equal. IMMUTABLE because the unique index
-- below is built on it.
-- The digit branch is capped at 18 chars so a long numeric code cannot
-- overflow bigint at write time.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_norm_biometric_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT CASE
    WHEN p_code IS NULL OR btrim(p_code) = '' THEN NULL
    WHEN btrim(p_code) ~ '^[0-9]{1,18}$'      THEN (btrim(p_code))::bigint::text
    ELSE upper(btrim(p_code))
  END;
$fn$;

COMMENT ON FUNCTION public.fn_norm_biometric_code(text) IS
  'Canonical form of a biometric enrolment code. All-digit codes compare numerically (00002 = 002 = 2); anything else is trimmed and uppercased. IMMUTABLE so it can back a unique index.';

-- ---------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS biometric_id text NULL,
  ADD COLUMN IF NOT EXISTS biometric_institution_id uuid NULL
    REFERENCES public.institutions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.staff.biometric_id IS
  'Enrolment code as printed by the biometric machine (Empcode in the export). Stored verbatim; matched through fn_norm_biometric_code so 00002 and 2 are one code.';
COMMENT ON COLUMN public.staff.biometric_institution_id IS
  'The institution that OWNS the machine this code was issued on — deliberately NOT staff.institution_id, because staff routinely punch on another institution''s machine.';

-- A code without a machine has no namespace and cannot be matched.
ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_biometric_scope_chk;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_biometric_scope_chk CHECK (
    biometric_id IS NULL
    OR btrim(biometric_id) = ''
    OR biometric_institution_id IS NOT NULL
  );

-- ---------------------------------------------------------------------
-- One code per machine. A genuine clash (two staff given the same code on one
-- machine) now fails loudly at save time, instead of silently mis-attributing
-- a month of attendance to whichever row happened to be found first.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS staff_biometric_uq
  ON public.staff (biometric_institution_id, public.fn_norm_biometric_code(biometric_id))
  WHERE biometric_id IS NOT NULL AND btrim(biometric_id) <> '';

-- Import-time lookup path: (machine, normalised code) -> staff.
CREATE INDEX IF NOT EXISTS staff_biometric_lookup
  ON public.staff (biometric_institution_id)
  WHERE biometric_id IS NOT NULL AND btrim(biometric_id) <> '';
