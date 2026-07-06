-- ─────────────────────────────────────────────────────────────────────────────
-- Add the v1.2 "Assessment Structure" block to BoS course syllabi.
--
-- ADDITIVE / non-breaking: a single nullable JSONB column, mirroring the existing
-- content columns (course_content, textbooks, po_mappings, …). Existing rows keep
-- NULL until edited; the app pre-seeds the standard 15/5/10/70 components for new
-- syllabi in the form.
--
-- Shape:
-- {
--   "components": [ { "id": "...", "sno": 1, "component": "CIA — …", "marks": 15 }, … ],
--   "concept_applications_note": "Five Fink's-shaped Concept Applications, one per Unit…",
--   "exhibition_note": "choose ONE of FIVE Capstones…",
--   "capstones": [
--     { "id": "...", "title": "The Graph in My Town", "subject": "…",
--       "artifacts": "…", "give_back": "…" }
--   ]
-- }
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.bos_course_syllabi
  add column if not exists assessment_structure jsonb;

comment on column public.bos_course_syllabi.assessment_structure is
  'v1.2 Assessment Structure (Total 100): component rows + concept-applications note + exhibition note + capstone options. JSONB, nullable.';
