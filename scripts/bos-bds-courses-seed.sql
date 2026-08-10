-- ============================================================================
-- BoS DCH / BDS (Bachelor of Dental Surgery) — COE course seed
-- Generated 2026-08-07 from the authoritative university course-code list (42xx).
-- Target: COE `courses` table (Postgres). BDS = DCI / Dr. M.G.R. Medical University model.
-- 1 program, YEAR-based (I–IV, no semester), SUBJECT-based (no credits / L-T-P / CO-PO).
-- Each subject is split into a Theory code and a Practical/Clinical code (-P).
--
-- ⚠ RUN THIS AGAINST THE **COE** DATABASE, NOT MyJKKN.
--   The MyJKKN `public.courses` table is the minimal timetable mirror
--   (id, course_code, course_name, institution_id [SINGULAR], is_active,
--    theory_hours, practical_hours, self_study_hours, learning_hours_target,
--    competency_coverage) — it has NO institutions_id / board_id / regulation_id
--   / paper_no columns, so this seed errors there (that is the
--   "column institutions_id does not exist" you hit). BoS courses are a COE
--   proxy; /bos/courses reads them from COE.
--
-- PREREQUISITES: NONE schema-wise — verified against the live COE `courses` DDL,
--   no ALTER needed. course_code has no format CHECK, so '-P'/'/' insert fine.
--
--   The ONLY hard prerequisite is FK validity (both ON DELETE CASCADE):
--     • board_id       must exist in COE `board`(id)
--     • institutions_id must exist in COE `institutions`(id)
--   If the UUIDs below are the MyJKKN ids (not COE), these FKs fail — resolve to
--   the COE-side ids first. regulation_id is a bare uuid column (no FK) — informational.
--
-- SCOPE (supplied — CONFIRM these are the COE-side ids, not the MyJKKN ids):
--   institutions_id = e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5  (DCH)   ← FK → COE institutions(id)
--   institution_code = 'DCH'
--   board_id        = dcddfa03-d654-4f8e-a1e5-10a0e8072ca6  (BDS)   ← FK → COE board(id)
--   regulation_id   = 747c51f3-01ad-468c-8bc7-5e89bf69c7ee  (2018 / DCI BDS 2017-18)
--
-- ⚠ ANOMALIES (preserved verbatim; see the code-check notes):
--   • 4202-P "Dental Materials Practicals" sits in the 4202 (Physiology/Biochemistry)
--     family — LIKELY should be 4204-P. Left as-is; fix here if the master confirms.
--   • Source defects already resolved upstream (not present below): duplicate 4211P
--     dropped (4211-P kept); 4223/P -> 4223-P; 4207B -> 4207-P; 1101 Library removed.
-- ============================================================================

BEGIN;

-- ── STEP 1: scope (single program). Replace with COE-side UUIDs if these are MyJKKN. ──
CREATE TEMP TABLE _bds_scope (
  program_abbr     text PRIMARY KEY,
  program_name     text,
  institutions_id  uuid,
  institution_code text,
  board_id         uuid,
  board_code       text,
  regulation_id    uuid,
  regulation_code  text,
  program_code     text
) ON COMMIT DROP;

INSERT INTO _bds_scope VALUES
  ('BDS', 'Bachelor of Dental Surgery',
   'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5', 'DCH',
   'dcddfa03-d654-4f8e-a1e5-10a0e8072ca6', 'BDS',
   '747c51f3-01ad-468c-8bc7-5e89bf69c7ee', '2018', 'BDS');

-- ── STEP 2: staging — the 46 verified course codes (23 Theory + 23 Practical) ──
-- course_kind: 'Theory' | 'Practical' (clinicals treated as Practical).
CREATE TEMP TABLE _bds_courses (
  academic_year smallint,
  course_code   text,
  course_name   text,
  course_kind   text
) ON COMMIT DROP;

INSERT INTO _bds_courses (academic_year, course_code, course_name, course_kind) VALUES
  -- I Year
  (1, '4201'   , 'Human Anatomy'                              , 'Theory'   ),
  (1, '4201-P' , 'Human Anatomy Practical'                    , 'Practical'),
  (1, '4202A'  , 'Physiology'                                 , 'Theory'   ),
  (1, '4202A-P', 'Physiology Practical'                       , 'Practical'),
  (1, '4202B'  , 'Biochemistry'                               , 'Theory'   ),
  (1, '4202B-P', 'Biochemistry Practical'                     , 'Practical'),
  (1, '4203'   , 'Dental Anatomy'                             , 'Theory'   ),
  (1, '4203-P' , 'Dental Anatomy Practical'                   , 'Practical'),
  -- II Year
  (2, '4204'   , 'Dental Materials'                           , 'Theory'   ),
  (2, '4202-P' , 'Dental Materials Practicals'                , 'Practical'),  -- ⚠ base likely 4204-P
  (2, '4206A'  , 'General Pathology'                          , 'Theory'   ),
  (2, '4206A-P', 'General Pathology Practical'                , 'Practical'),
  (2, '4206B'  , 'Microbiology'                               , 'Theory'   ),
  (2, '4206B-P', 'Microbiology Practical'                     , 'Practical'),
  (2, '4207'   , 'Pharmacology'                               , 'Theory'   ),
  (2, '4207-P' , 'Pharmacology Practical'                     , 'Practical'),
  (2, '4208A'  , 'Dental Materials Conservative'              , 'Theory'   ),
  (2, '4208A-P', 'Dental Materials Conservative Practical'    , 'Practical'),
  (2, '4208B'  , 'Dental Materials Prosthodontics Theory'     , 'Theory'   ),
  (2, '4208B-P', 'Dental Materials Prosthodontics Practical'  , 'Practical'),
  (2, '4209'   , 'Preclinical Prosthodontics'                 , 'Theory'   ),
  (2, '4209A-P', 'Preclinical Prosthodontics Practical'       , 'Practical'),
  (2, '4210'   , 'Preclinical Conservative'                   , 'Theory'   ),
  (2, '4210-P' , 'Preclinical Conservative Practical'         , 'Practical'),
  -- III Year
  (3, '4211'   , 'General Medicine Theory'                    , 'Theory'   ),
  (3, '4211-P' , 'General Medicine Practical'                 , 'Practical'),
  (3, '4212'   , 'General Surgery Theory'                     , 'Theory'   ),
  (3, '4212-P' , 'General Surgery Practical'                  , 'Practical'),
  (3, '4213'   , 'Oral Pathology Theory'                      , 'Theory'   ),
  (3, '4213-P' , 'Oral Pathology Practical'                   , 'Practical'),
  -- IV Year
  (4, '4216'   , 'Oral Medicine Theory'                       , 'Theory'   ),
  (4, '4216-P' , 'Clinicals Oral Medicine'                    , 'Practical'),
  (4, '4217'   , 'Paedodontics Theory'                        , 'Theory'   ),
  (4, '4217-P' , 'Clinicals Paedodontics'                     , 'Practical'),
  (4, '4218'   , 'Orthodontics Theory'                        , 'Theory'   ),
  (4, '4218-P' , 'Clinicals Orthodontics'                     , 'Practical'),
  (4, '4219'   , 'Periodontics Theory'                        , 'Theory'   ),
  (4, '4219-P' , 'Clinicals Periodontics'                     , 'Practical'),
  (4, '4220'   , 'Prosthodontics Theory'                      , 'Theory'   ),
  (4, '4220-P' , 'Prosthodontics Clinicals'                   , 'Practical'),
  (4, '4221'   , 'Conservative Dentistry Theory'              , 'Theory'   ),
  (4, '4221-P' , 'Clinicals Conservative Dentistry'           , 'Practical'),
  (4, '4222'   , 'Oral Surgery Theory'                        , 'Theory'   ),
  (4, '4222-P' , 'Clinicals Oral Surgery'                     , 'Practical'),
  (4, '4223'   , 'PHD Theory'                                 , 'Theory'   ),  -- Public Health Dentistry
  (4, '4223-P' , 'Clinicals PHD'                              , 'Practical');

-- ── STEP 3: insert into COE courses (year/subject BDS shape) ────────────────
-- REAL COE table columns only. Deliberately NOT used (they are COE REST-API
-- ALIASES, not table columns — see types/bos-courses.ts:59-86):
--     course_title  → the real column is course_name
--     credits       → the real column is credit
--     course_status → the real column is courses_status
-- Also omitted because they are NOT standard COE `courses` columns (spec §5.2
-- flags them as needing to be added COE-side): academic_year, is_paper_based,
-- is_internal_paper, paper_no. If your COE `courses` already has academic_year,
-- uncomment the two marked lines to store the I–IV year.
-- credits / L-T-P / CO-PO intentionally omitted (NULL) for the BDS model.
-- course_category carries the Theory/Practical split ('Theory'/'Practical' are
-- valid CourseCategory values); display_code mirrors course_code (UNIQUE in COE).
-- Verified against the live COE `courses` DDL:
--   • the active flag is `status` (boolean), NOT `is_active` (that is an API alias).
--   • evaluation_type is NOT NULL + CHECK (CIA|ESE|CIA + ESE) → 'CIA + ESE'.
--   • credit/exam_duration are NOT NULL → 0; marks/hours have defaults.
--   • course_code has NO format CHECK → the '-P'/'/' separators insert fine.
--   • courses_status defaults 'Pending' (CHECK Pending|BOS Approved|Locked) — left default.
INSERT INTO courses (
  institutions_id, institution_code, board_id, board_code,
  regulation_id, regulation_code, program_code,
  course_code, course_name, display_code,
  course_category, evaluation_type, result_type, status,
  credit, exam_duration,
  theory_hours, tutorial_hours, practical_hours, class_hours,
  internal_max_mark, external_max_mark, total_max_mark
)
SELECT
  s.institutions_id, s.institution_code, s.board_id, s.board_code,
  s.regulation_id, s.regulation_code, s.program_code,
  c.course_code, c.course_name, c.course_code,
  c.course_kind, 'CIA + ESE', 'Mark', true,
  0, 0,
  0, 0, 0, 0,
  0, 0, 0
FROM _bds_courses c
CROSS JOIN _bds_scope s
-- Idempotent: the 23 Theory codes were already loaded by the earlier xlsx
-- import (only the -P practical rows failed the code regex). Skip any code that
-- already exists (covers both course_code and display_code unique constraints).
ON CONFLICT DO NOTHING;

-- ── STEP 4: sanity checks (optional) ────────────────────────────────────────
-- SELECT academic_year, count(*) FROM _bds_courses GROUP BY 1 ORDER BY 1;   -- 8/16/6/16
-- SELECT course_code, count(*) FROM _bds_courses GROUP BY 1 HAVING count(*) > 1;  -- expect 0

COMMIT;

-- ── RECONCILIATION ──────────────────────────────────────────────────────────
--   BDS — Bachelor of Dental Surgery                 46 codes  (23 Theory + 23 Practical)
--     I Year    8   (Anatomy, Physiology, Biochemistry, Dental Anatomy)
--     II Year  16   (Dental Materials×3, Pathology, Microbiology, Pharmacology,
--                    Pre-Clinical Conservative, Pre-Clinical Prosthodontics)
--     III Year  6   (General Medicine, General Surgery, Oral Pathology)
--     IV Year  16   (Oral Medicine, Paedodontics, Orthodontics, Periodontics,
--                    Prosthodontics, Conservative Dentistry, Oral Surgery, Public Health Dentistry)
