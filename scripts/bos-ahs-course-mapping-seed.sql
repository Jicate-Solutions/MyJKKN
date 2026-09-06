-- ============================================================================
-- BoS AHS — COE course_mapping seed (links the 74 papers to program+regulation)
-- Generated 2026-08-07. RUN AFTER scripts/bos-ahs-courses-seed.sql (needs courses rows).
-- ⚠⚠ RUN AGAINST THE **COE** DATABASE, NOT MyJKKN (course_mapping is a COE table). ⚠⚠
--
-- Mapping model for the year-based AHS scheme:
--   • course_order = running index within each program (Year1 papers, then Year2, then Year3).
--   • semester_code = NULL — AHS has no semesters; the year lives on courses.academic_year.
--     (If your COE scheme UI buckets by semester_code, set it to a YEAR token instead — see O-7.)
--   • course_group = NULL — all AHS papers are core (no electives).
--   • group_order = course_order (each paper is its own group; nothing bands).
--   • course_id is resolved by JOINing the real `courses` rows on
--     (institutions_id, course_code, academic_year, paper_no) — paper_no in the join
--     prevents the duplicate OTAT code 1142 from double-inserting.
--
-- ⚠ Same prerequisite: resolve the OTAT 1142 collision in courses first, else that join
--    still can't uniquely place both OTAT Year-3 papers.
-- ============================================================================

BEGIN;

-- ── STEP 1: scope map — MUST MATCH the values used in the courses seed ───────
CREATE TEMP TABLE _ahs_scope (
  program_abbr     text PRIMARY KEY,
  institutions_id  uuid,
  institution_code text,
  program_id       uuid,
  program_code     text,
  regulation_code  text
) ON COMMIT DROP;

INSERT INTO _ahs_scope (program_abbr, institutions_id, institution_code, program_id, program_code, regulation_code) VALUES
  ('AECT' , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'  , NULL /*program_id*/, 'AHS-AECT'  , 'R-2017'),
  ('OTAT' , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'  , NULL /*program_id*/, 'AHS-OTAT'  , 'R-2017'),
  ('CT'   , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'  , NULL /*program_id*/, 'AHS-CT'    , 'R-2017'),
  ('DT'   , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'  , NULL /*program_id*/, 'AHS-DT'    , 'R-2017'),
  ('PA'   , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'  , NULL /*program_id*/, 'AHS-PA'    , 'R-2017'),
  ('RIT'  , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'  , NULL /*program_id*/, 'AHS-RIT'   , 'R-2017'),
  ('MRS'  , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'  , NULL /*program_id*/, 'AHS-MRS'   , 'R-2017'),
  ('CCT'  , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'  , NULL /*program_id*/, 'AHS-CCT'   , 'R-2017'),
  ('RT'   , '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'AHS'  , NULL /*program_id*/, 'AHS-RT'    , 'R-2017');

-- ── STEP 2: mapping staging — one row per paper, with course_order ──────────
CREATE TEMP TABLE _ahs_map (
  program_abbr text,
  academic_year smallint,
  paper_no text,
  course_code text,
  course_order int
) ON COMMIT DROP;

INSERT INTO _ahs_map (program_abbr, academic_year, paper_no, course_code, course_order) VALUES
  ('AECT' , 1, 'Paper I'  , '1006'  ,  1),
  ('AECT' , 1, 'Paper II' , '1007'  ,  2),
  ('AECT' , 2, 'Paper I'  , '1016'  ,  3),
  ('AECT' , 2, 'Paper II' , '1017'  ,  4),
  ('AECT' , 2, 'Paper III', '1018'  ,  5),
  ('AECT' , 3, 'Paper I'  , '1026'  ,  6),
  ('AECT' , 3, 'Paper II' , '1027'  ,  7),
  ('AECT' , 3, 'Paper III', '1028'  ,  8),
  ('OTAT' , 1, 'Paper I'  , '1131'  ,  1),
  ('OTAT' , 2, 'Paper I'  , '1136'  ,  2),
  ('OTAT' , 2, 'Paper II' , '1137'  ,  3),
  ('OTAT' , 2, 'Paper III', '1138'  ,  4),
  ('OTAT' , 3, 'Paper I'  , '1141'  ,  5),
  ('OTAT' , 3, 'Paper II' , '1142'  ,  6),
  ('CT'   , 1, 'Paper I'  , '1508'  ,  1),
  ('CT'   , 1, 'Paper II' , '1541'  ,  2),
  ('CT'   , 2, 'Paper I'  , '1531'  ,  3),
  ('CT'   , 2, 'Paper II' , '1532'  ,  4),
  ('CT'   , 2, 'Paper III', '1533'  ,  5),
  ('CT'   , 3, 'Paper I'  , '1521'  ,  6),
  ('CT'   , 3, 'Paper II' , '1522'  ,  7),
  ('DT'   , 1, 'Paper I'  , '1306'  ,  1),
  ('DT'   , 1, 'Paper II' , '1307'  ,  2),
  ('DT'   , 2, 'Paper I'  , '1331'  ,  3),
  ('DT'   , 2, 'Paper II' , '1332'  ,  4),
  ('DT'   , 3, 'Paper I'  , '1336'  ,  5),
  ('DT'   , 3, 'Paper II' , '1337'  ,  6),
  ('PA'   , 1, 'Paper I'  , '1601'  ,  1),
  ('PA'   , 2, 'Paper I'  , '1611'  ,  2),
  ('PA'   , 2, 'Paper II' , '1612'  ,  3),
  ('PA'   , 2, 'Paper III', '1613'  ,  4),
  ('PA'   , 3, 'Paper I'  , '1621'  ,  5),
  ('PA'   , 3, 'Paper II' , '1622'  ,  6),
  ('RIT'  , 1, 'Paper I'  , '1841'  ,  1),
  ('RIT'  , 1, 'Paper II' , '1842'  ,  2),
  ('RIT'  , 1, 'Paper III', '1843'  ,  3),
  ('RIT'  , 2, 'Paper I'  , '1846'  ,  4),
  ('RIT'  , 2, 'Paper II' , '1847'  ,  5),
  ('RIT'  , 2, 'Paper III', '1848'  ,  6),
  ('RIT'  , 3, 'Paper I'  , '1851'  ,  7),
  ('RIT'  , 3, 'Paper II' , '1852'  ,  8),
  ('RIT'  , 3, 'Paper III', '1853'  ,  9),
  ('MRS'  , 1, 'Paper I'  , '1731'  ,  1),
  ('MRS'  , 1, 'Paper II' , '1732'  ,  2),
  ('MRS'  , 1, 'Paper III', '1733'  ,  3),
  ('MRS'  , 2, 'Paper I'  , '1711'  ,  4),
  ('MRS'  , 2, 'Paper II' , '1713'  ,  5),
  ('MRS'  , 2, 'Paper III', '1712'  ,  6),
  ('MRS'  , 2, 'Paper IV' , '1714'  ,  7),
  ('MRS'  , 3, 'Paper I'  , '1741'  ,  8),
  ('MRS'  , 3, 'Paper II' , '1742'  ,  9),
  ('MRS'  , 3, 'Paper III', '1743'  , 10),
  ('MRS'  , 3, 'Paper IV' , '1744'  , 11),
  ('CCT'  , 1, 'Paper I'  , '1241'  ,  1),
  ('CCT'  , 1, 'Paper II' , '1242'  ,  2),
  ('CCT'  , 2, 'Paper I'  , '1216'  ,  3),
  ('CCT'  , 2, 'Paper II' , '1217'  ,  4),
  ('CCT'  , 2, 'Paper III', '1218'  ,  5),
  ('CCT'  , 2, 'Paper IV' , '1219'  ,  6),
  ('CCT'  , 3, 'Paper I'  , '1236'  ,  7),
  ('CCT'  , 3, 'Paper II' , '1237'  ,  8),
  ('CCT'  , 3, 'Paper III', '1238'  ,  9),
  ('RT'   , 1, 'Paper I'  , '2601'  ,  1),
  ('RT'   , 1, 'Paper II' , '2602'  ,  2),
  ('RT'   , 1, 'Paper III', '2603'  ,  3),
  ('RT'   , 1, 'Paper IV' , '2604'  ,  4),
  ('RT'   , 2, 'Paper I'  , '2611'  ,  5),
  ('RT'   , 2, 'Paper II' , '2612'  ,  6),
  ('RT'   , 2, 'Paper III', '2613'  ,  7),
  ('RT'   , 2, 'Paper IV' , '2614'  ,  8),
  ('RT'   , 3, 'Paper I'  , '2616'  ,  9),
  ('RT'   , 3, 'Paper II' , '2617'  , 10),
  ('RT'   , 3, 'Paper III', '2618'  , 11),
  ('RT'   , 3, 'Paper IV' , '2619'  , 12);

-- ── STEP 3: insert into COE course_mapping (matched to the real table) ──────
-- No `mapping_status` column — status is `courses_status` (defaults 'Pending'; CHECK
--   allows only Pending/BOS Approved/Locked). is_active carries active/inactive.
-- JOIN keys on (institutions_id, course_code) only — COE courses has no academic_year/
--   paper_no; course_code is globally unique so the match is 1:1.
INSERT INTO course_mapping (
  institutions_id, institution_code, program_id, program_code,
  course_id, course_code, regulation_code,
  course_group, semester_code, course_order, group_order,
  is_active
)
SELECT
  s.institutions_id, s.institution_code, s.program_id, s.program_code,
  co.id, m.course_code, s.regulation_code,
  NULL, NULL, m.course_order, m.course_order,
  true
FROM _ahs_map m
JOIN _ahs_scope s USING (program_abbr)
JOIN courses co
  ON  co.institutions_id = s.institutions_id
  AND co.course_code     = m.course_code
ORDER BY s.program_code, m.course_order;

-- ── STEP 4: verify — expect 74 mapping rows (0 if the AHS courses are NOT under
--   institutions_id 9c1554e8-12a2-4b76-a9d6-8242bb05eba1; the JOIN only links courses in that institution) ─────────
-- SELECT program_code, count(*) FROM course_mapping
--   WHERE program_code LIKE 'AHS-%' GROUP BY 1 ORDER BY 1;

COMMIT;
