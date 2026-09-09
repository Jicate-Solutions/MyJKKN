-- Updated: 2026-09-09 - The HR regulator roster omits Dental and Allied Health,
--                       and still lists Architecture as an active regulator.
--
-- public.hr_regulatory_bodies drives step 1 of the HR recruitment-need setup
-- wizard (components/hr/intelligence/setup-wizard-enhanced.tsx) and the
-- /hr/admin/recruitment-need/bodies screen
-- (lib/services/hr/recruitment-need/admin-service.ts). It was seeded once, in
-- 20260524000000_hr_recruitment_need_foundation.sql, with eight bodies. Two of
-- JKKN's colleges have no regulator on that list at all:
--
--   · DCI   — JKKN Dental is the largest college by team members (152) and its
--             regulator was never seeded.
--   · NCAHP — Allied Health's regulator was never seeded.
--
-- and one seeded body regulates nothing JKKN runs:
--
--   · COA   — Council of Architecture. JKKN has no architecture college.
--
-- BCI was set inactive out-of-band on 2026-09-08 and is deliberately NOT
-- touched here.
--
-- SHAPE: this follows the existing seed at
-- 20260524000000_hr_recruitment_need_foundation.sql lines 372-382.
-- `abbreviation` is `text NOT NULL UNIQUE`, so it is the conflict target; there
-- is no `code` column on this table.
--
-- IDEMPOTENT BY CONSTRUCTION: the INSERT is ON CONFLICT DO NOTHING, and the
-- UPDATE is guarded by `is_active = true` so a second run touches zero rows
-- (the table carries an `updated_at` trigger — an unguarded UPDATE would bump
-- the timestamp on every re-run). Nothing is deleted and no id is renumbered.
--
-- NOTE (reported in the PR, not acted on here): a second regulatory-body
-- registry, public.accreditation_bodies, already contains both DCI and NCAHP.
-- Unifying the two registries is a Director decision and is out of scope; this
-- file touches the HR list only. The strings below are matched to that other
-- registry on purpose so the two rows cannot read as different organisations.

-- ============================================================================
-- 1. Seed the two missing regulators
-- ============================================================================
INSERT INTO public.hr_regulatory_bodies (name, abbreviation, description, website_url, is_system)
VALUES
  ('Dental Council of India', 'DCI', 'Regulates dental education and practice', 'https://dciindia.gov.in/', true),
  ('National Commission for Allied and Healthcare Professions', 'NCAHP', 'Regulates allied and healthcare professions education and practice', 'https://ncahp.abdm.gov.in/', true)
ON CONFLICT (abbreviation) DO NOTHING;

-- ============================================================================
-- 2. Retire the regulator that matches no JKKN college
-- ============================================================================
-- Deactivated, never deleted: the row is referenced by hr_regulatory_norms and
-- institution_program_approvals via body_id, and the /bodies screen renders
-- inactive rows with an "Inactive" badge rather than hiding them.
UPDATE public.hr_regulatory_bodies
   SET is_active = false
 WHERE abbreviation = 'COA'
   AND is_active = true;

-- ============================================================================
-- 3. Refresh the table comment so it names the roster it now holds
-- ============================================================================
COMMENT ON TABLE public.hr_regulatory_bodies IS
  'CRUDable master of regulatory bodies (AICTE/NMC/NCTE/PCI/INC/DCI/NCAHP/COA/BCI/UGC). Director can add new bodies via admin UI (Decision AT.10). is_system=true for seeded defaults. COA and BCI are seeded but inactive — JKKN runs no architecture or law programme.';

-- ============================================================================
-- 4. Assert the end state
-- ============================================================================
DO $$
DECLARE
  v_dci    integer;
  v_ncahp  integer;
  v_coa    integer;
BEGIN
  SELECT count(*) INTO v_dci
    FROM public.hr_regulatory_bodies WHERE abbreviation = 'DCI' AND is_active;
  SELECT count(*) INTO v_ncahp
    FROM public.hr_regulatory_bodies WHERE abbreviation = 'NCAHP' AND is_active;
  SELECT count(*) INTO v_coa
    FROM public.hr_regulatory_bodies WHERE abbreviation = 'COA' AND is_active;

  IF v_dci <> 1 THEN
    RAISE EXCEPTION 'hr_regulatory_bodies: expected exactly 1 active DCI row, found %', v_dci;
  END IF;
  IF v_ncahp <> 1 THEN
    RAISE EXCEPTION 'hr_regulatory_bodies: expected exactly 1 active NCAHP row, found %', v_ncahp;
  END IF;
  IF v_coa <> 0 THEN
    RAISE EXCEPTION 'hr_regulatory_bodies: expected COA to be inactive, found % active row(s)', v_coa;
  END IF;

  RAISE NOTICE 'hr_regulatory_bodies: DCI and NCAHP present and active, COA inactive.';
END $$;
