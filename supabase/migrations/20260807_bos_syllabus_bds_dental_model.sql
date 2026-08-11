-- ─────────────────────────────────────────────────────────────────────────────
-- Dental (BDS — DCI / Dr. MGR Medical University) support for BoS course syllabi.
--
-- ADDITIVE / non-breaking: widens the academic_model CHECK to a 6th model and
-- adds ONE nullable column (bds_content). Reuses the already-shipped
-- academic_year + exam_scheme columns (20260725_bos_syllabus_pharmacy_model.sql).
-- Existing engineering/CAS/pharmacy/nursing rows are completely unaffected.
--
-- Rationale (see docs/plans/2026-07-24-bos-dch-bds-course-syllabus-design.md):
-- BDS is a year-based (I–IV) DCI competency model. Per subject it carries a
-- GOAL, multi-facet OBJECTIVES (knowledge/skills/attitude/integration/…),
-- grouped COMPETENCIES, TEACHING HOURS, and a THEORY SYLLABUS rendered as a
-- three-tier "MUST KNOW / DESIRABLE TO KNOW / NICE TO KNOW" topic grid — a shape
-- distinct from Unit I–V (course_content), the AHS paper tree (ahs_content) and
-- the nursing clinical outline. That grid lives in the new bds_content column.
-- Marks reuse the existing exam_scheme column with a dental shape (Theory /
-- Practical / Viva / IA matrix + spotter/exercise practical_exam breakdown).
-- No CO-PO-PSO, no Bloom/Fink, no credits — those columns stay NULL for BDS.
--
-- Shapes:
--
-- bds_content — the DCI competency body
-- {
--   "goal": "…",
--   "objectives": {
--     "knowledge": ["…"], "skills": ["…"], "attitude": ["…"], "integration": ["…"],
--     "infection_control": ["…"], "computer_proficiency": ["…"]   -- optional facets
--   },
--   "competencies": [ { "group": "General skills", "items": ["…"] }, … ],
--   "teaching_hours": { "lecture": 100, "practical": 175, "total": 275 },
--   "teaching_methodology": ["…"],
--   "theory_syllabus": [
--     { "topic": "Introduction to bones",
--       "must_know": ["…"], "desirable_to_know": ["…"], "nice_to_know": ["…"] }
--   ],
--   "practicals": [ { "title": "…", "hours": 8 } ],       -- hours optional
--   "record_log_book": "…",                                -- optional
--   "disciplines": null   -- optional: for two-discipline subjects (Physiology|Biochemistry),
--                         -- an array of { name, goal, theory_syllabus[], practicals[] } sub-blocks
-- }
--
-- exam_scheme (REUSED column) — dental shape
-- {
--   "components": [
--     { "stream": "Theory",    "examination": 70, "internal_assessment": 10, "viva": 20,   "total": 100 },
--     { "stream": "Practical", "examination": 90, "internal_assessment": 10, "viva": null, "total": 100 }
--   ],
--   "grand_total": 200,
--   "no_theory_exam": false,                 -- true for subjects marked "No Theory Examination"
--   "question_pattern": { … } | null,        -- theory paper blueprint when the source gives one
--   "practical_exam": { "type": "spotters"|"exercises", "items": [ … ], "viva": { … } },
--   "internal_assessment": { "theory": 10, "practical": 10, "total": 20, "frequency": "…" }
-- }
-- ─────────────────────────────────────────────────────────────────────────────

-- Depends on 20260725 (academic_model + exam_scheme + academic_year) and
-- 20260727 (inc_nursing) having widened the CHECK. Widen it again for the 6th
-- model, 'mgr_bds'. Drop/recreate is idempotent and safe to re-run.
alter table public.bos_course_syllabi
  drop constraint if exists bos_course_syllabi_academic_model_check;
alter table public.bos_course_syllabi
  add constraint bos_course_syllabi_academic_model_check
  check (academic_model in ('anna_univ','mgr_ahs','mgr_pharmd','pci_pharm','inc_nursing','mgr_bds'));

alter table public.bos_course_syllabi
  add column if not exists bds_content jsonb;

comment on column public.bos_course_syllabi.bds_content is
  'Dental (BDS/DCI): the competency body — goal, multi-facet objectives, grouped competencies, teaching hours/methodology, and the three-tier MUST/DESIRABLE/NICE theory-syllabus grid + practicals. Distinct from course_content (Unit I–V), ahs_content and clinical_outline. JSONB, nullable. See types/bos.ts BosBdsContent.';

comment on column public.bos_course_syllabi.academic_model is
  'Syllabus shape discriminator: anna_univ (semester/CO-PO/Bloom-Fink) | mgr_ahs (year/paper/exam-scheme) | mgr_pharmd (Pharm.D, =AHS shape) | pci_pharm (B.Pharm CBCS) | inc_nursing (INC/TNMGRMU) | mgr_bds (BDS/DCI, year + MUST/DESIRABLE/NICE grid + exam-scheme). Resolved from the BoS board at creation; never re-derived on read.';

notify pgrst, 'reload schema';
