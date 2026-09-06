-- BoS pharmacy (COP) academic-model support.
-- Introduces the `academic_model` discriminator + the pharmacy/AHS content
-- columns onto bos_course_syllabi. Fully ADDITIVE and NULLABLE:
--   * academic_model DEFAULTs 'anna_univ' so every existing engineering/CAS row
--     is unchanged and keeps its CO-PO/Bloom/Fink content.
--   * All other new columns are nullable and stay NULL for existing rows.
--
-- Models (see lib/services/bos/academic-model.ts + types/bos.ts AcademicModel):
--   anna_univ  — engineering CET / arts-science CAS (semester, CO-PO-PSO, Bloom/Fink)
--   mgr_ahs    — Allied Health Sciences (Dr. MGR): year/paper + exam-scheme + internship
--   mgr_pharmd — Pharm.D (Dr. MGR): reuses the mgr_ahs shape
--   pci_pharm  — B.Pharm (PCI CBCS): semester + credits + Unit I–V, no CO-PO

ALTER TABLE public.bos_course_syllabi
  ADD COLUMN IF NOT EXISTS academic_model text NOT NULL DEFAULT 'anna_univ'
      CHECK (academic_model IN ('anna_univ','mgr_ahs','mgr_pharmd','pci_pharm')),
  ADD COLUMN IF NOT EXISTS semester            smallint,   -- B.Pharm 1..8 (nullable for year models)
  ADD COLUMN IF NOT EXISTS academic_year       smallint,   -- Pharm.D 1..5 (nullable for semester models)
  ADD COLUMN IF NOT EXISTS scope               text,       -- B.Pharm "Scope" paragraph
  ADD COLUMN IF NOT EXISTS exam_scheme         jsonb,      -- PCI / Dr. MGR exam scheme (types/bos.ts BosExamScheme)
  ADD COLUMN IF NOT EXISTS internship_postings jsonb,      -- Pharm.D 6th-year postings (BosInternshipPostings)
  ADD COLUMN IF NOT EXISTS ahs_content         jsonb;      -- Pharm.D year→subject→topics tree (BosAhsContent)

-- Index so per-model filtering/reporting doesn't scan the whole table.
CREATE INDEX IF NOT EXISTS idx_bos_course_syllabi_academic_model
  ON public.bos_course_syllabi(academic_model);

COMMENT ON COLUMN public.bos_course_syllabi.academic_model IS
  'Syllabus shape discriminator: anna_univ (semester/CO-PO/Bloom-Fink) | mgr_ahs (year/paper/exam-scheme) | mgr_pharmd (Pharm.D, =AHS shape) | pci_pharm (B.Pharm CBCS, no CO-PO). Resolved from the BoS board at creation; never re-derived on read.';
COMMENT ON COLUMN public.bos_course_syllabi.semester IS 'B.Pharm semester 1..8 (pci_pharm). NULL for year-based models.';
COMMENT ON COLUMN public.bos_course_syllabi.academic_year IS 'Pharm.D academic year 1..5 (mgr_pharmd). NULL for semester-based models.';
COMMENT ON COLUMN public.bos_course_syllabi.scope IS 'B.Pharm course "Scope" paragraph.';
COMMENT ON COLUMN public.bos_course_syllabi.exam_scheme IS 'PCI/Dr.MGR exam scheme JSONB — replaces CO-PO/Bloom assessment for pharmacy/AHS. See types/bos.ts BosExamScheme.';
COMMENT ON COLUMN public.bos_course_syllabi.internship_postings IS 'Pharm.D internship/residency postings (6th year). See types/bos.ts BosInternshipPostings.';
COMMENT ON COLUMN public.bos_course_syllabi.ahs_content IS 'Pharm.D/AHS year→subject→lecture-topic tree. Distinct from course_content (Unit I–V). See types/bos.ts BosAhsContent.';
