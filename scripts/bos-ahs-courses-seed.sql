-- ============================================================================
-- BoS AHS (Allied Health Sciences) — COE course seed
-- Generated 2026-08-07 from the authoritative SUBJECT CODE / PAPER / SUBJECT NAME list.
-- Target: COE `courses` table (Postgres). AHS = Dr. M.G.R. Medical University model.
-- 9 B.Sc programs, year-based (no semester), paper-based (no credits / L-T-P / CO-PO).
--
-- ⚠⚠ RUN THIS AGAINST THE **COE** DATABASE, NOT MyJKKN. ⚠⚠
--   The MyJKKN `public.courses` table is the minimal timetable/competency mirror
--   (id, course_code, course_name, institution_id [SINGULAR], is_active, *_hours,
--    competency_coverage, coe_course_id) — it has NO institutions_id / board_id /
--    regulation_id / paper_no columns, so this seed errors there with exactly
--    'column "institutions_id" does not exist'. BoS courses are a COE proxy;
--    /bos/courses reads them from COE, and MyJKKN mirrors them via coe_course_id.
--   (Same target split as scripts/bos-bds-courses-seed.sql.)
--
-- SCHEMA: matched to the ACTUAL COE `courses` table (verified 2026-08-08) — NO ALTER needed.
--   Required NOT NULL / CHECK columns are satisfied with AHS-appropriate values:
--     display_code   = course_code            (NOT NULL + UNIQUE)
--     course_category = 'Theory'              (NOT NULL + CHECK enum)
--     credit          = 0                     (NOT NULL; AHS has no credits)
--     exam_duration   = 3                     (NOT NULL; 3-hour theory paper)
--     evaluation_type = 'CIA + ESE'           (CHECK: only CIA/ESE/CIA + ESE — 'University Exam' is INVALID)
--     status          = true                  (the active flag is `status`, NOT `is_active`)
--   Column is `course_name` (there is NO `course_title` on the table).
--   Year/paper are NOT stored on COE courses (no such columns) — they live on
--   MyJKKN bos_course_syllabi (academic_year + ahs_content.paper_no). To store them
--   on COE instead, add the columns and re-include them in STEP 3.
--
-- ⚠ course_code has a GLOBAL UNIQUE constraint (course_course_code_key) — NOT per-institution.
--   The codes 1006..2619 must not already exist for ANY other COE course. Pre-check:
--     SELECT course_code FROM courses WHERE course_code = ANY (ARRAY['1006','1007',...]);
--
-- Institution: institutions_id = 9c1554e8-12a2-4b76-a9d6-8242bb05eba1 , institution_code = 'AHS' (O-1).
--   ⚠ courses.institutions_id is the COE-side id; if the UUID above is the MyJKKN id,
--     resolve it to the COE institution id before running. board_id/regulation_id still open (O-5).
--
-- ⚠ ANOMALIES (preserved verbatim except the one fix noted):
--   • OTAT Third Year originally listed course_code 1142 TWICE. RESOLVED here:
--     Paper I 'sterilization procedures' reassigned 1142 -> 1141 (Paper II keeps 1142).
--   • Spelling/OCR artifacts kept as-is: 'Anotomy'(PA), 'maintance'/'postioning'/
--     'tewchniques'/'rcent'(RIT), 'radiology 7 ... ? Imaging'(RIT 1853), 'informatio'(MRS 1743).
--   • English/Computer INTERNAL papers (no university exam) are NOT in this list — add separately if needed.
-- ============================================================================

BEGIN;

-- ── STEP 1: scope map — FILL IN the real UUIDs/codes before running ──────────
-- One row per program. institutions_id/institution_code identify the JKKN AHS
-- college in COE (confirm — spec open item O-1). board_id/regulation_id must exist
-- in COE first (open item O-5). program_code is the COE program identifier.
CREATE TEMP TABLE _ahs_scope (
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

INSERT INTO _ahs_scope (program_abbr, program_name, institutions_id, institution_code, board_id, board_code, regulation_id, regulation_code, program_code) VALUES
  ('AECT' , 'B.Sc. Accident and Emergency Care Technology'            , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'   , 'a5ae913c-35d3-4921-96a2-793c9aff01d6', 'AHS'    , '225d6282-0bcd-47df-8427-604526f8255c', 'R-2017'  , 'AHS-AECT'  ),
  ('OTAT' , 'B.Sc. Operation Theatre and Anaesthesia Technology'      , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'   , 'a5ae913c-35d3-4921-96a2-793c9aff01d6', 'AHS'    , '225d6282-0bcd-47df-8427-604526f8255c', 'R-2017'  , 'AHS-OTAT'  ),
  ('CT'   , 'B.Sc. Cardiac Technology'                                , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'   , 'a5ae913c-35d3-4921-96a2-793c9aff01d6', 'AHS'    , '225d6282-0bcd-47df-8427-604526f8255c', 'R-2017'  , 'AHS-CT'    ),
  ('DT'   , 'B.Sc. Dialysis Technology'                               , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'   , 'a5ae913c-35d3-4921-96a2-793c9aff01d6', 'AHS'    , '225d6282-0bcd-47df-8427-604526f8255c', 'R-2017'  , 'AHS-DT'    ),
  ('PA'   , 'B.Sc. Physician Assistant'                               , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'   , 'a5ae913c-35d3-4921-96a2-793c9aff01d6', 'AHS'    , '225d6282-0bcd-47df-8427-604526f8255c', 'R-2017'  , 'AHS-PA'    ),
  ('RIT'  , 'B.Sc. Radiology & Imaging Technology'                    , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'   , 'a5ae913c-35d3-4921-96a2-793c9aff01d6', 'AHS'    , '225d6282-0bcd-47df-8427-604526f8255c', 'R-2017'  , 'AHS-RIT'   ),
  ('MRS'  , 'B.Sc. Medical Record Science'                            , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'   , 'a5ae913c-35d3-4921-96a2-793c9aff01d6', 'AHS'    , '225d6282-0bcd-47df-8427-604526f8255c', 'R-2017'  , 'AHS-MRS'   ),
  ('CCT'  , 'B.Sc. Critical Care Technology'                          , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'   , 'a5ae913c-35d3-4921-96a2-793c9aff01d6', 'AHS'    , '225d6282-0bcd-47df-8427-604526f8255c', 'R-2017'  , 'AHS-CCT'   ),
  ('RT'   , 'B.Sc. Respiratory Therapy'                               , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'   , 'a5ae913c-35d3-4921-96a2-793c9aff01d6', 'AHS'    , '225d6282-0bcd-47df-8427-604526f8255c', 'R-2017'  , 'AHS-RT'    );

-- ── STEP 2: staging — the verified course data (74 papers) ──────────────────
CREATE TEMP TABLE _ahs_courses (
  program_abbr text,
  academic_year smallint,
  paper_no text,
  course_code text,
  course_name text
) ON COMMIT DROP;

INSERT INTO _ahs_courses (program_abbr, academic_year, paper_no, course_code, course_name) VALUES
  ('AECT' , 1, 'Paper I'  , '1006'  , 'Anatomy, physiology, Biochemistry'),
  ('AECT' , 1, 'Paper II' , '1007'  , 'Introduction Emergency Medicine (EM) and EMS - I'),
  ('AECT' , 2, 'Paper I'  , '1016'  , 'Pathology, microbiology and pharmacology'),
  ('AECT' , 2, 'Paper II' , '1017'  , 'Patient Examination, Nursing'),
  ('AECT' , 2, 'Paper III', '1018'  , 'Emergency Medicine (EM) and EMS-II Practical Exam on Patient Examination, Nursing, Triage, Life Support, Trauma Care'),
  ('AECT' , 3, 'Paper I'  , '1026'  , 'Emergency Medicine (EM) and EMS - III'),
  ('AECT' , 3, 'Paper II' , '1027'  , 'Emergency Surgery and Emergency Surgical Services,'),
  ('AECT' , 3, 'Paper III', '1028'  , 'Clinical Procedures and Instrumentation in Emergency Services'),
  ('OTAT' , 1, 'Paper I'  , '1131'  , 'Basic sciences'),
  ('OTAT' , 2, 'Paper I'  , '1136'  , 'pharmacology and microbiology'),
  ('OTAT' , 2, 'Paper II' , '1137'  , 'Medicine and medical ethics'),
  ('OTAT' , 2, 'Paper III', '1138'  , 'principles of anesthesia -I'),
  ('OTAT' , 3, 'Paper I'  , '1141'  , 'sterilization procedures'),
  ('OTAT' , 3, 'Paper II' , '1142'  , 'principles of anesthesia -II'),
  ('CT'   , 1, 'Paper I'  , '1508'  , 'applied anatomy, physiology and biochemistry related to cardiac technology'),
  ('CT'   , 1, 'Paper II' , '1541'  , 'pathology, microbiology and pharmacology related to cardiac technology'),
  ('CT'   , 2, 'Paper I'  , '1531'  , 'clinical features and treatment relevant to cardiac technology and basic life support'),
  ('CT'   , 2, 'Paper II' , '1532'  , 'Advance ECG and treadmill exercise stress testing and 24 hour ambulatory ECG and bp recording'),
  ('CT'   , 2, 'Paper III', '1533'  , 'echocardiography'),
  ('CT'   , 3, 'Paper I'  , '1521'  , 'cardiac catheterization laboratory basics'),
  ('CT'   , 3, 'Paper II' , '1522'  , 'cardiac catheterization laboratory advanced'),
  ('DT'   , 1, 'Paper I'  , '1306'  , 'Anatomy, physiology, Biochemistry'),
  ('DT'   , 1, 'Paper II' , '1307'  , 'Nutrition and Principle of Nursing'),
  ('DT'   , 2, 'Paper I'  , '1331'  , 'Pathology, Microbiology and Pharmacology'),
  ('DT'   , 2, 'Paper II' , '1332'  , 'Community Medicine and Basic Medical Electronics'),
  ('DT'   , 3, 'Paper I'  , '1336'  , 'Dialysis Technology'),
  ('DT'   , 3, 'Paper II' , '1337'  , 'Renal Disease Therapeutics'),
  ('PA'   , 1, 'Paper I'  , '1601'  , 'Anotomy, physiology, Biochemistry'),
  ('PA'   , 2, 'Paper I'  , '1611'  , 'Medicine Pharmacology'),
  ('PA'   , 2, 'Paper II' , '1612'  , 'Paediatrics and Geriatrics/clinical microbiology'),
  ('PA'   , 2, 'Paper III', '1613'  , 'Surgery/Obstetrics & Gynecology'),
  ('PA'   , 3, 'Paper I'  , '1621'  , 'Cardiology and cardiac surgery/Neurology.'),
  ('PA'   , 3, 'Paper II' , '1622'  , 'Nephrology/pulmonology/gastroenterology/Orthopaedics'),
  ('RIT'  , 1, 'Paper I'  , '1841'  , 'Anatomy, physiology, Biochemistry'),
  ('RIT'  , 1, 'Paper II' , '1842'  , 'General physics , Radiation physics and diagnostic radiology'),
  ('RIT'  , 1, 'Paper III', '1843'  , 'Radiography equipments maintance and quality control, related to x ray'),
  ('RIT'  , 2, 'Paper I'  , '1846'  , 'Clinical radiography postioning'),
  ('RIT'  , 2, 'Paper II' , '1847'  , 'X ray film / image processing tewchniques'),
  ('RIT'  , 2, 'Paper III', '1848'  , 'Contrast & special radiography procedures'),
  ('RIT'  , 3, 'Paper I'  , '1851'  , 'Equipments of advanced modern imaging modalities'),
  ('RIT'  , 3, 'Paper II' , '1852'  , 'Modern imaging techniques and rcent trends in imaging'),
  ('RIT'  , 3, 'Paper III', '1853'  , 'Quality control, radiology 7 radiation safety in radio diagnosis ? Imaging other than x ray related'),
  ('MRS'  , 1, 'Paper I'  , '1731'  , 'Basic science'),
  ('MRS'  , 1, 'Paper II' , '1732'  , 'Medical terminology'),
  ('MRS'  , 1, 'Paper III', '1733'  , 'Medical record science'),
  ('MRS'  , 2, 'Paper I'  , '1711'  , 'Biostatistics'),
  ('MRS'  , 2, 'Paper II' , '1713'  , 'Medical terminology II'),
  ('MRS'  , 2, 'Paper III', '1712'  , 'Information technology'),
  ('MRS'  , 2, 'Paper IV' , '1714'  , 'Health information management & nomenclature'),
  ('MRS'  , 3, 'Paper I'  , '1741'  , 'International classification of diseases & surgical procedures'),
  ('MRS'  , 3, 'Paper II' , '1742'  , 'Hospital organization & administration , medical ethics & consumer protection act'),
  ('MRS'  , 3, 'Paper III', '1743'  , 'Health informatio management II , Medical transcription and telemedicine and financial management'),
  ('MRS'  , 3, 'Paper IV' , '1744'  , 'Quality management in healthcare'),
  ('CCT'  , 1, 'Paper I'  , '1241'  , 'Applied anatomy +  biochemistry'),
  ('CCT'  , 1, 'Paper II' , '1242'  , 'Physiology + basic physics'),
  ('CCT'  , 2, 'Paper I'  , '1216'  , 'Applied anatomy + Applied physiology'),
  ('CCT'  , 2, 'Paper II' , '1217'  , 'Clinical microbiology'),
  ('CCT'  , 2, 'Paper III', '1218'  , 'Icu monitoring + Biomedical engineering'),
  ('CCT'  , 2, 'Paper IV' , '1219'  , 'Pathology + Pathophysiology + Pharmacology'),
  ('CCT'  , 3, 'Paper I'  , '1236'  , 'Icu monitoring 2 = Maintance of equipments'),
  ('CCT'  , 3, 'Paper II' , '1237'  , 'Icu therapy'),
  ('CCT'  , 3, 'Paper III', '1238'  , 'Icu administration + logistics+ statistics + medical ethics'),
  ('RT'   , 1, 'Paper I'  , '2601'  , 'Anatomy & Physiology'),
  ('RT'   , 1, 'Paper II' , '2602'  , 'Microbiology & Pathology'),
  ('RT'   , 1, 'Paper III', '2603'  , 'Biochemistry & Pharmacology'),
  ('RT'   , 1, 'Paper IV' , '2604'  , 'Biostatistics & Physics'),
  ('RT'   , 2, 'Paper I'  , '2611'  , 'Respiratory diseases'),
  ('RT'   , 2, 'Paper II' , '2612'  , 'Cardiovascular diseases'),
  ('RT'   , 2, 'Paper III', '2613'  , 'Diagnostic technique in cardio respiratory diseases'),
  ('RT'   , 2, 'Paper IV' , '2614'  , 'Equipments in respiratory care'),
  ('RT'   , 3, 'Paper I'  , '2616'  , 'Respiratory technique I'),
  ('RT'   , 3, 'Paper II' , '2617'  , 'Respiratory technique II'),
  ('RT'   , 3, 'Paper III', '2618'  , 'Life support system'),
  ('RT'   , 3, 'Paper IV' , '2619'  , 'Cardio pulmonary rehabilitation');

-- ── STEP 3: insert into COE courses (fits the real table; no ALTER) ─────────
-- AHS model: credit=0, exam_duration=3, category='Theory', evaluation='CIA + ESE'.
-- display_code = course_code (NOT NULL + UNIQUE). Year/paper carried on syllabi, not here.
INSERT INTO courses (
  institutions_id, institution_code, board_id, board_code,
  regulation_id, regulation_code, program_code,
  course_code, course_name, display_code,
  course_category, credit, exam_duration,
  evaluation_type, result_type, status
)
SELECT
  s.institutions_id, s.institution_code, s.board_id, s.board_code,
  s.regulation_id, s.regulation_code, s.program_code,
  c.course_code, c.course_name, c.course_code,
  'Theory', 0, 3,
  'CIA + ESE', 'Mark', true
FROM _ahs_courses c
JOIN _ahs_scope s USING (program_abbr)
ORDER BY s.program_abbr, c.academic_year, c.course_code;

-- ── STEP 4: sanity check (optional) ─────────────────────────────────────────
-- SELECT program_abbr, count(*) FROM _ahs_courses GROUP BY 1 ORDER BY 1;
-- SELECT course_code, count(*) FROM _ahs_courses GROUP BY 1 HAVING count(*) > 1;  -- expect: 0 rows (1142 dup resolved)

COMMIT;

-- ── RECONCILIATION ──────────────────────────────────────────────────────────
--   AECT  B.Sc. Accident and Emergency Care Technology          8 papers  (Y1=2, Y2=3, Y3=3)
--   OTAT  B.Sc. Operation Theatre and Anaesthesia Technology    6 papers  (Y1=1, Y2=3, Y3=2)
--   CT    B.Sc. Cardiac Technology                              7 papers  (Y1=2, Y2=3, Y3=2)
--   DT    B.Sc. Dialysis Technology                             6 papers  (Y1=2, Y2=2, Y3=2)
--   PA    B.Sc. Physician Assistant                             6 papers  (Y1=1, Y2=3, Y3=2)
--   RIT   B.Sc. Radiology & Imaging Technology                  9 papers  (Y1=3, Y2=3, Y3=3)
--   MRS   B.Sc. Medical Record Science                         11 papers  (Y1=3, Y2=4, Y3=4)
--   CCT   B.Sc. Critical Care Technology                        9 papers  (Y1=2, Y2=4, Y3=3)
--   RT    B.Sc. Respiratory Therapy                            12 papers  (Y1=4, Y2=4, Y3=4)
--                                                              74 papers TOTAL