-- Updated: 2026-09-09 - The HR regulator roster omits Dental and Allied Health,
--                       and marks Architecture inactive.
--
-- public.hr_regulatory_bodies drives step 1 of the HR recruitment-need setup
-- wizard (components/hr/intelligence/setup-wizard-enhanced.tsx) and the
-- /hr/admin/recruitment-need/bodies screen
-- (lib/services/hr/recruitment-need/admin-service.ts). It was seeded once, in
-- 20260524000000_hr_recruitment_need_foundation.sql, with eight bodies. Two of
-- JKKN's colleges have no regulator on that list at all:
--
--   - DCI   - JKKN Dental is the largest college by team members (152) and its
--             regulator was never seeded.
--   - NCAHP - Allied Health's regulator was never seeded.
--
-- and one seeded body regulates nothing JKKN runs:
--
--   - COA   - Council of Architecture. JKKN has no architecture college.
--
-- BCI is deliberately NOT touched here, in either direction.
--
-- SHAPE: this follows the existing seed at
-- 20260524000000_hr_recruitment_need_foundation.sql lines 372-382.
-- `abbreviation` is `text NOT NULL UNIQUE`, so it is the conflict target; there
-- is no `code` column on this table.
--
-- ============================================================================
-- WHAT DEACTIVATING COA ACTUALLY DOES - READ BEFORE ASSUMING IT HIDES COA
-- ============================================================================
-- Nothing in the application filters hr_regulatory_bodies.is_active. Swept
-- 2026-09-09, every reader of this table:
--
--   lib/services/hr/recruitment-need/admin-service.ts:60   listBodies - .select('*').order('name'), no filter
--   lib/services/hr/recruitment-need/admin-service.ts:69   getBody by id
--   lib/services/hr/recruitment-need/admin-service.ts:113  .select('*, body:hr_regulatory_bodies(*)')
--   lib/services/hr/recruitment-need/admin-service.ts:329  wizard step-1 count - count:'exact', head:true over ALL rows
--   lib/services/hr/recruitment-need/data-entry-service.ts:88   embedded join, no filter
--   app/api/hr/recruitment-need/approvals/import/route.ts       resolves body by abbreviation, no filter
--   app/api/hr/recruitment-need/bodies/route.ts                 GET delegates to listBodies
--   app/api/hr/recruitment-need/bodies/[id]/route.ts            delegates to getBody/updateBody
--   components/hr/intelligence/setup-wizard-enhanced.tsx:50     reads the table for the step-1 count
--   app/(routes)/hr/admin/recruitment-need/bodies/page.tsx:179  renders an Active/Inactive badge
--   app/(routes)/hr/admin/recruitment-need/norms/page.tsx:270          SelectItem per body, unfiltered
--   app/(routes)/hr/admin/recruitment-need/approvals/page.tsx:207,325  unfiltered
--   app/(routes)/hr/admin/recruitment-need/specializations/page.tsx:146,237  unfiltered
--
-- So after this migration COA still appears in every picker, still resolves on
-- approval import, and still counts toward the wizard's step-1 total. It gains
-- an "Inactive" badge on the /bodies screen and nothing else. Making is_active
-- actually filter is a code change across those readers and a Director
-- decision; it is deliberately NOT in this file.
--
-- The wizard's step-1 count reads 8 today and 10 after this file, still
-- clearing its threshold of 8.
--
-- ============================================================================
-- IDEMPOTENT BY CONSTRUCTION
-- ============================================================================
-- The INSERT is ON CONFLICT DO NOTHING, and the UPDATE is guarded by
-- `is_active = true` so a second run touches zero rows (the table carries an
-- `updated_at` trigger - an unguarded UPDATE would bump the timestamp on every
-- re-run). Nothing is deleted and no id is renumbered.
--
-- NO BEGIN/COMMIT of its own, per the repo's rollback-rehearsal convention, so
-- a reviewer's `BEGIN ... ROLLBACK` is a genuine dry run. Because of that this
-- file must not write anything it might later refuse to finish: step 1 below
-- is the ONLY abort point and it runs before any INSERT, UPDATE or COMMENT.
--
-- NOTE (reported in the PR, not acted on here): a second regulatory-body
-- registry, public.accreditation_bodies, already contains both DCI and NCAHP.
-- Unifying the two registries is a Director decision and is out of scope. The
-- name and website_url strings below are copied from that registry as a
-- point-in-time match so the two rows do not read as different organisations.
-- There is no foreign key, no shared key and no sync between the two tables:
-- they can drift apart from the moment this file is applied.

-- ============================================================================
-- 1. PRECONDITION - the only abort point, before anything is written
-- ============================================================================
-- The INSERT below is ON CONFLICT DO NOTHING, so it cannot revive a DCI or
-- NCAHP row that already exists but is inactive. If one does, this file cannot
-- reach the roster it intends, and reactivating a row somebody deliberately
-- switched off is not a decision a data seed gets to make. Abort here, while
-- the table is still untouched, rather than discovering it after the writes.
DO $$
DECLARE
  v_inactive text;
BEGIN
  SELECT string_agg(abbreviation, ', ' ORDER BY abbreviation)
    INTO v_inactive
    FROM public.hr_regulatory_bodies
   WHERE abbreviation IN ('DCI', 'NCAHP')
     AND is_active = false;

  IF v_inactive IS NOT NULL THEN
    RAISE EXCEPTION
      'hr_regulatory_bodies: % already present but INACTIVE. This file seeds only missing rows (ON CONFLICT DO NOTHING) and will not reactivate a body that was switched off deliberately. Nothing has been changed. Reactivate it by hand, or drop this migration.',
      v_inactive;
  END IF;
END $$;

-- ============================================================================
-- 2. Seed the two missing regulators
-- ============================================================================
INSERT INTO public.hr_regulatory_bodies (name, abbreviation, description, website_url, is_system)
VALUES
  ('Dental Council of India', 'DCI', 'Regulates dental education and practice', 'https://dciindia.gov.in/', true),
  ('National Commission for Allied and Healthcare Professions', 'NCAHP', 'Regulates allied and healthcare professions education and practice', 'https://ncahp.abdm.gov.in/', true)
ON CONFLICT (abbreviation) DO NOTHING;

-- ============================================================================
-- 3. Mark inactive the regulator that matches no JKKN college
-- ============================================================================
-- Deactivated, never deleted: the row is referenced by body_id on three tables
-- - hr_specializations (nullable), hr_regulatory_norms (NOT NULL) and
-- institution_program_approvals (NOT NULL) - and the /bodies screen renders
-- inactive rows with an "Inactive" badge rather than hiding them.
UPDATE public.hr_regulatory_bodies
   SET is_active = false
 WHERE abbreviation = 'COA'
   AND is_active = true;

-- ============================================================================
-- 4. Refresh the table comment so it names the roster it now holds
-- ============================================================================
COMMENT ON TABLE public.hr_regulatory_bodies IS
  'CRUDable master of regulatory bodies. Seeded AICTE/NMC/NCTE/PCI/INC/COA/BCI/UGC by 20260524000000; DCI and NCAHP added by 20261129090000, which also set COA is_active=false (JKKN runs no architecture programme). Director can add new bodies via admin UI (Decision AT.10). is_system=true for seeded defaults. No application code filters is_active on this table, so that flag is presentational - an inactive body still appears in every picker.';

-- ============================================================================
-- 5. Confirmation - reports, never aborts
-- ============================================================================
-- Step 1 is this file's abort point. By here every write has succeeded, so a
-- RAISE EXCEPTION would only be able to abandon work already done - and with
-- no BEGIN/COMMIT in this file, `psql -f` without --single-transaction would
-- leave that work committed behind it. This block therefore only reports.
DO $$
DECLARE
  v_dci   integer;
  v_ncahp integer;
  v_coa   integer;
BEGIN
  SELECT count(*) INTO v_dci
    FROM public.hr_regulatory_bodies WHERE abbreviation = 'DCI' AND is_active;
  SELECT count(*) INTO v_ncahp
    FROM public.hr_regulatory_bodies WHERE abbreviation = 'NCAHP' AND is_active;
  SELECT count(*) INTO v_coa
    FROM public.hr_regulatory_bodies WHERE abbreviation = 'COA' AND is_active;

  RAISE NOTICE 'hr_regulatory_bodies: active DCI=%, active NCAHP=%, active COA=% (expected 1, 1, 0).',
    v_dci, v_ncahp, v_coa;
END $$;
