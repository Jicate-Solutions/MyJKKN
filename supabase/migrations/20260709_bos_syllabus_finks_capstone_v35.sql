-- ─────────────────────────────────────────────────────────────────────────────
-- v3.5 Fink's formative + Capstone assessment blocks for BoS course syllabi.
--
-- ADDITIVE / non-breaking: five nullable JSONB columns, mirroring the v1.2
-- assessment_structure pattern (20260625). Existing rows keep NULL until
-- edited; the form pre-seeds the standard v3.5 pattern/rubric/LLC text for
-- new syllabi and leaves the course-specific blocks empty.
--
-- Shapes:
--
-- concept_applications — "Concept Applications (Formative Learning Activities)"
-- {
--   "intro_note": "Five short Fink's-shaped activities anchored to…",
--   "activities": [
--     { "id": "…", "sno": 1, "unit": "Word Tasks 1-2",
--       "finks_dimension": "Foundational Knowledge",
--       "task": "…", "deliverable_notes": "…" }
--   ]
-- }
--
-- assessment_pattern — "Assessment Pattern (Internal 30 | External 70)"
-- {
--   "internal_marks": 30, "external_marks": 70,
--   "components": [ { "id": "…", "sno": 1,
--                     "component": "CIA I, CIA II & Model Examination", "marks": 15 } ],
--   "activities_note": "* Activities: Assignment / Case study / …",
--   "note": "The five Concept Applications are formative…"
-- }
--
-- capstone_project — "Capstone Project — choose ONE of FIVE"
-- {
--   "intro_note": "Solo · 10 marks (Internal) · spans the semester…",
--   "options": [
--     { "id": "…", "option_no": 1, "title": "The Document Kit for a Real Event",
--       "primary": "PRIMARY (AI-proof): …", "support": "~400 words on…",
--       "llc": "open the files and show one formula…" }
--   ]
-- }
--
-- capstone_rubric — "Capstone Rubric (10 marks · common to all options)"
-- {
--   "total_marks": 10, "note": "10 marks · common to all 5 options",
--   "criteria": [ { "id": "…", "sno": 1,
--                   "criterion": "Specificity of lived engagement…", "marks": 2 } ]
-- }
--
-- llc_conference — "End-of-Course Learners Led Conference"
-- {
--   "title": "End-of-Course Learners Led Conference",
--   "subtitle": "cohort audience · faculty + Senior Learner facilitate…",
--   "description": "In the final fortnight of the semester, the cohort convenes…"
-- }
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.bos_course_syllabi
  add column if not exists concept_applications jsonb,
  add column if not exists assessment_pattern   jsonb,
  add column if not exists capstone_project     jsonb,
  add column if not exists capstone_rubric      jsonb,
  add column if not exists llc_conference       jsonb;

comment on column public.bos_course_syllabi.concept_applications is
  'v3.5 Concept Applications (Formative Learning Activities): intro note + Fink''s-shaped activity rows (unit, dimension, task, deliverable). JSONB, nullable.';

comment on column public.bos_course_syllabi.assessment_pattern is
  'v3.5 Assessment Pattern: internal/external split + internal component rows + activities note. JSONB, nullable.';

comment on column public.bos_course_syllabi.capstone_project is
  'v3.5 Capstone Project (choose ONE of FIVE): intro note + option cards (primary AI-proof deliverable, ~400-word support, LLC demo). JSONB, nullable.';

comment on column public.bos_course_syllabi.capstone_rubric is
  'v3.5 Capstone Rubric: total marks + criterion rows common to all capstone options. JSONB, nullable.';

comment on column public.bos_course_syllabi.llc_conference is
  'v3.5 End-of-Course Learners Led Conference: title, subtitle, description of the cohort-facing presentation session. JSONB, nullable.';
