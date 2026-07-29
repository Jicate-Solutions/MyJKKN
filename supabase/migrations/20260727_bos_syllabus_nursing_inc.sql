-- ─────────────────────────────────────────────────────────────────────────────
-- Nursing (INC / TNMGRMU) support for BoS course syllabi.
--
-- ADDITIVE / non-breaking: four nullable columns, mirroring the v1.2
-- assessment_structure (20260625) and v3.5 Fink's/Capstone (20260709) pattern.
-- Existing engineering/CAS rows keep NULL and are completely unaffected; the
-- form pre-seeds the nursing blocks only when stream = 'Nursing'.
--
-- Rationale (see docs/plans/2026-07-24_bos_cnr-nursing-course-syllabus-tech-spec.md):
-- the INC B.Sc Nursing model is a THIRD academic model. It carries a free-text
-- DESCRIPTION, a Theory/Lab/Clinical workload split (clinical in weeks, hundreds
-- of hours), a PARALLEL clinical outline coexisting with the theory course_content,
-- and CO → 10 INC core-competency mapping INSTEAD of PO/PSO. The per-unit
-- Learning-Outcome / Teaching-Activity / Assessment-Method columns extend the
-- existing course_content.units[] JSONB shape and need no DDL.
--
-- Shapes:
--
-- course_description — the syllabus DESCRIPTION paragraph (plain text).
--
-- nursing_workload — Theory / Lab-Skill-Lab / Clinical credits + hours (+ weeks)
-- {
--   "theory":    { "credits": 2, "hours": 40 },
--   "practical": { "credits": 1, "hours": 40 },
--   "clinical":  { "credits": 2, "hours": 160, "weeks": 4 }
-- }
--
-- clinical_outline — the parallel clinical table (coexists with course_content)
-- {
--   "units": [
--     { "clinical_unit": "1", "duration_weeks": 2,
--       "learning_outcomes": ["…"],
--       "procedural_competencies": ["…"],     -- Procedural Competencies / Clinical Skills
--       "clinical_requirements": ["…"],
--       "assessment_methods": ["…"] }
--   ]
-- }
--
-- competency_mappings — CO → the 10 INC core competencies (replaces po_mappings)
-- {
--   "core_competencies": [ { "id": 1, "label": "Patient centered care" }, … ],
--   "mappings": [ { "co_id": "C1", "competencies": [1, 2, 8] } ]
-- }
-- ─────────────────────────────────────────────────────────────────────────────

-- Depends on 20260725_bos_syllabus_pharmacy_model.sql having created the
-- academic_model column + its CHECK. Widen that CHECK to admit the 5th model,
-- 'inc_nursing'. Drop/recreate is idempotent and safe to re-run.
alter table public.bos_course_syllabi
  drop constraint if exists bos_course_syllabi_academic_model_check;
alter table public.bos_course_syllabi
  add constraint bos_course_syllabi_academic_model_check
  check (academic_model in ('anna_univ','mgr_ahs','mgr_pharmd','pci_pharm','inc_nursing'));

alter table public.bos_course_syllabi
  add column if not exists course_description  text,
  add column if not exists nursing_workload    jsonb,
  add column if not exists clinical_outline    jsonb,
  add column if not exists competency_mappings jsonb;

comment on column public.bos_course_syllabi.course_description is
  'Nursing (INC): the syllabus DESCRIPTION paragraph. Plain text, nullable.';

comment on column public.bos_course_syllabi.nursing_workload is
  'Nursing (INC): Theory / Lab-Skill-Lab / Clinical credits+hours (+clinical weeks). JSONB, nullable.';

comment on column public.bos_course_syllabi.clinical_outline is
  'Nursing (INC): parallel clinical outline (clinical unit, duration weeks, learning outcomes, procedural competencies, clinical requirements, assessment methods). JSONB, nullable.';

comment on column public.bos_course_syllabi.competency_mappings is
  'Nursing (INC): CO → 10 INC core-competency mapping, replaces po_mappings for the nursing stream. JSONB, nullable.';

notify pgrst, 'reload schema';
