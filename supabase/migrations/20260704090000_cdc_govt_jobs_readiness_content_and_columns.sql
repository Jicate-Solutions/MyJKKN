-- =====================================================================
-- CDC Government-Job-Readiness Track — PR-1: content + minimal columns
-- =====================================================================
-- Date: 2026-07-04
-- Source spec: specs/cdc-govt-jobs-readiness-2026-07-04.md
--   (✅ Director decisions — LOCKED 2026-07-04: all four exam families;
--    BOTH label + group; kiosk/booth SKIPPED.)
--
-- Additive + idempotent. NOT applied to prod by this build (draft PR).
--
-- WHAT THIS MIGRATION DOES (PR-1 of the locked set):
--   1. cdc_training_types.exam_family text NULL  — tags a training-type
--      config row as a government-exam category (NULL = not a govt-exam
--      type; all existing rows stay NULL, fully backward-compatible).
--   2. cdc_training_programmes.shared_syllabus_pct numeric NULL
--      + domain_topics text NULL  — Option A labeling columns for the
--      shared-vs-domain (~60/40) split. NO logic hardcodes 60/40; these
--      are descriptive labels a CDC head fills in per programme.
--   3. Seed govt-exam rows into cdc_training_types for ALL FOUR families:
--        TNPSC (Group 2 & 4), RRB (NTPC), Banking (IBPS/SBI),
--        SSC / TN Police (TNUSRB).
--      These are ordinary config rows — the existing coaching engine
--      (cdc_training_programmes → enrollment → attendance-sync →
--      certificates) consumes them with zero schema/UI change; they
--      appear instantly in the /cdc/training/new type dropdown.
--   4. Seed a STARTER set of government-scholarship rows into
--      cdc_external_opportunities (category='scholarship'). "scholarship"
--      is already a first-class category — this is content, not schema.
--
-- ⚠️ CONTENT-ACCURACY FLAG (spec §8-Q4/Q5, data-ownership follow-up):
--   The scholarship rows below are STARTER content. Scheme names are
--   real, but eligibility text / deadlines / apply URLs are placeholders
--   pending verification by the CDC/placement team, who own the real
--   figures. The ~7% and ~60/40 transcript estimates are NOT encoded
--   anywhere in this migration.
--
-- SQL-file discipline note: the CDC module's canonical DDL lives entirely
--   in supabase/migrations/* (zero cdc_* tables exist in supabase/setup/*).
--   Per the module convention this dated migration IS the canonical source;
--   folding these columns into setup/01_tables.sql would orphan FKs to
--   tables that file never defines. supabase/SQL_FILE_INDEX.md is updated.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. COLUMNS — additive, nullable, backward-compatible.
-- ---------------------------------------------------------------------

-- Tag a training-type as a government-exam category. Config-key style
-- value (e.g. 'tnpsc' / 'rrb' / 'banking' / 'ssc' / 'police'). NULL for
-- every non-govt-exam type (all existing rows).
ALTER TABLE public.cdc_training_types
  ADD COLUMN IF NOT EXISTS exam_family text NULL;

COMMENT ON COLUMN public.cdc_training_types.exam_family IS
  'Government-exam family tag (config-key style: tnpsc/rrb/banking/ssc/police). NULL = not a government-exam type. Added 2026-07-04 (CDC govt-job-readiness PR-1).';

-- Option A labeling columns on the coaching-cohort row. shared_syllabus_pct
-- is a descriptive label for the shared-vs-domain split (NOT a driver of any
-- grouping logic — grouping is Option B, data-driven via cdc_exam_topic_map).
ALTER TABLE public.cdc_training_programmes
  ADD COLUMN IF NOT EXISTS shared_syllabus_pct numeric NULL;

ALTER TABLE public.cdc_training_programmes
  ADD COLUMN IF NOT EXISTS domain_topics text NULL;

COMMENT ON COLUMN public.cdc_training_programmes.shared_syllabus_pct IS
  'Optional label: % of this programme''s syllabus shared across government exams. Descriptive only — no logic hardcodes or derives cohort grouping from this. Added 2026-07-04 (CDC govt-job-readiness PR-1, Option A).';
COMMENT ON COLUMN public.cdc_training_programmes.domain_topics IS
  'Optional free-text label: the domain-specific (non-shared) topics for this programme. Added 2026-07-04 (CDC govt-job-readiness PR-1, Option A).';

-- ---------------------------------------------------------------------
-- 2. SEED — government-exam training types (all four Director-locked
--    families). Idempotent (ON CONFLICT (config_key) DO NOTHING). These
--    are ordinary config rows; is_system=true so they cannot be deleted
--    (only soft-deactivated) via the admin UI, matching the core set.
--    sort_order 200+ keeps them below the existing corporate-skill types.
--
--    exam_family tags (5) cover the four Director-named families:
--      tnpsc  → TNPSC (state government jobs)
--      rrb    → RRB (railways)
--      banking→ IBPS / SBI (banking)
--      ssc    ┐ together = "SSC / TN Police (TNUSRB)" family
--      police ┘
-- ---------------------------------------------------------------------

INSERT INTO public.cdc_training_types
  (config_key, display_name, description, exam_family, is_system, is_active, sort_order)
VALUES
  ('tnpsc_group2', 'TNPSC Group 2 (State Govt)',
   'Coaching for Tamil Nadu Public Service Commission Group 2 / 2A recruitment.',
   'tnpsc',   true, true, 200),
  ('tnpsc_group4', 'TNPSC Group 4 (State Govt)',
   'Coaching for Tamil Nadu Public Service Commission Group 4 recruitment.',
   'tnpsc',   true, true, 210),
  ('rrb_ntpc', 'RRB NTPC (Railways)',
   'Coaching for Railway Recruitment Board Non-Technical Popular Categories exams.',
   'rrb',     true, true, 220),
  ('ibps_po_clerk', 'IBPS PO / Clerk (Banking)',
   'Coaching for Institute of Banking Personnel Selection Probationary Officer / Clerk exams.',
   'banking', true, true, 230),
  ('sbi_po_clerk', 'SBI PO / Clerk (Banking)',
   'Coaching for State Bank of India Probationary Officer / Clerk exams.',
   'banking', true, true, 240),
  ('ssc_cgl', 'SSC CGL',
   'Coaching for Staff Selection Commission Combined Graduate Level exams.',
   'ssc',     true, true, 250),
  ('tnusrb_police', 'TN Police — TNUSRB',
   'Coaching for Tamil Nadu Uniformed Services Recruitment Board (police constable / SI) exams.',
   'police',  true, true, 260)
ON CONFLICT (config_key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. SEED — starter government-scholarship bulletin rows.
--    category='scholarship' already exists. STARTER content only — the
--    CDC/placement team owns the real eligibility / deadline / apply URL
--    (spec §8-Q5). deadline_date left NULL (unknown); eligibility_text
--    carries an explicit "verify with the CDC office" note so nobody
--    treats these as authoritative.
--    Idempotent via NOT EXISTS on (title, source_organisation).
-- ---------------------------------------------------------------------

INSERT INTO public.cdc_external_opportunities
  (title, source_organisation, category, eligibility_text, apply_url, deadline_date, is_active)
SELECT v.title, v.source_organisation, 'scholarship', v.eligibility_text, v.apply_url, NULL::date, true
FROM (VALUES
  ('National Scholarship Portal — Central Sector Scheme',
   'Ministry of Education, Government of India',
   'Merit-cum-means central scholarship for college students. STARTER content — verify current eligibility, income ceiling and deadline with the CDC office.',
   'https://scholarships.gov.in/'),
  ('Post-Matric Scholarship (SC / ST)',
   'Ministry of Social Justice & Empowerment, Government of India',
   'Post-matriculation scholarship for SC/ST students in higher education. STARTER content — verify eligibility and deadline with the CDC office.',
   'https://scholarships.gov.in/'),
  ('Tamil Nadu Post-Matric Scholarship (BC / MBC / DNC)',
   'Backward Classes, Most Backward Classes & Minorities Welfare Dept, Government of Tamil Nadu',
   'State post-matric scholarship for BC/MBC/DNC students. STARTER content — verify eligibility and deadline with the CDC office.',
   NULL),
  ('Pudhumai Penn Scheme (Higher Education for Girls)',
   'School Education Department, Government of Tamil Nadu',
   'Monthly assistance for girls pursuing higher education after government-school study. STARTER content — verify eligibility and deadline with the CDC office.',
   NULL),
  ('Chief Minister''s Merit Scholarship (Tamil Nadu)',
   'Government of Tamil Nadu',
   'Merit scholarship for meritorious students from Tamil Nadu. STARTER content — verify eligibility and deadline with the CDC office.',
   NULL)
) AS v(title, source_organisation, eligibility_text, apply_url)
WHERE NOT EXISTS (
  SELECT 1 FROM public.cdc_external_opportunities e
  WHERE e.title = v.title AND COALESCE(e.source_organisation, '') = v.source_organisation
);

-- ---------------------------------------------------------------------
-- 4. VERIFY — surface seed/column failures immediately.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_has_exam_family boolean;
  v_has_pct         boolean;
  v_govt_types      integer;
  v_scholarships    integer;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cdc_training_types' AND column_name='exam_family'
  ) INTO v_has_exam_family;
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cdc_training_programmes' AND column_name='shared_syllabus_pct'
  ) INTO v_has_pct;
  SELECT count(*) INTO v_govt_types   FROM public.cdc_training_types WHERE exam_family IS NOT NULL;
  SELECT count(*) INTO v_scholarships FROM public.cdc_external_opportunities WHERE category='scholarship';

  IF NOT v_has_exam_family THEN RAISE EXCEPTION 'cdc_training_types.exam_family column missing'; END IF;
  IF NOT v_has_pct         THEN RAISE EXCEPTION 'cdc_training_programmes.shared_syllabus_pct column missing'; END IF;
  IF v_govt_types < 7      THEN RAISE EXCEPTION 'govt-exam training-type seed incomplete (found %, need >= 7)', v_govt_types; END IF;
  IF v_scholarships < 5    THEN RAISE EXCEPTION 'scholarship seed incomplete (found %, need >= 5)', v_scholarships; END IF;

  RAISE NOTICE 'CDC govt-readiness PR-1 verified: exam_family col OK, Option A cols OK, % govt types, % scholarship rows', v_govt_types, v_scholarships;
END $$;

COMMIT;
