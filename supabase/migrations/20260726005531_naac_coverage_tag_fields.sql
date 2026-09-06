-- =============================================================================
-- 20260726005531_naac_coverage_tag_fields.sql
-- NAAC-2024 coverage tag fields — flips four metrics from manual counting to
-- live queries:
--   • 1.4 Skill-based courses      → bos_course_syllabi.is_skill_based
--   • 1.6 Indian Knowledge System  → bos_course_syllabi.is_iks
--   • 6.4 Value education          → vac_courses.is_value_education
--   • 6.2 Cultural clubs           → cdc_clubs.club_type = 'cultural'
--
-- Survey findings (live schema, 2026-07-26):
--   • bos_course_syllabi booleans use the is_* style (is_latest, is_archived).
--   • vac_courses already has is_active / faculty_eligible booleans (93 rows).
--   • cdc_clubs.club_type ALREADY EXISTS as free-text with NO CHECK constraint,
--     and the club creation UI already offers 'Cultural' as a type option —
--     cultural clubs (NAAC 6.2) are representable today. No DDL needed for
--     clubs; only the documenting COMMENT below. No club data rows are
--     inserted here (creating actual cultural clubs is office work).
--
-- Additive / non-breaking: new booleans are NOT NULL DEFAULT false, so every
-- existing row stays untagged until a human review flips it.
-- =============================================================================

-- ── Metric 1.4: skill/apprenticeship-focused courses ─────────────────────────
ALTER TABLE public.bos_course_syllabi
  ADD COLUMN IF NOT EXISTS is_skill_based boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bos_course_syllabi.is_skill_based IS
  'NAAC-2024 metric 1.4 — course is skill/apprenticeship-focused. Tagged by the course designer in the BoS syllabus form; counted live for accreditation coverage.';

-- ── Metric 1.6: Indian Knowledge System content ──────────────────────────────
ALTER TABLE public.bos_course_syllabi
  ADD COLUMN IF NOT EXISTS is_iks boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bos_course_syllabi.is_iks IS
  'NAAC-2024 metric 1.6 — course contains Indian Knowledge System (IKS) content. Tagged by the course designer in the BoS syllabus form; counted live for accreditation coverage.';

-- ── Metric 6.4: value-education courses ──────────────────────────────────────
ALTER TABLE public.vac_courses
  ADD COLUMN IF NOT EXISTS is_value_education boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vac_courses.is_value_education IS
  'NAAC-2024 metric 6.4 — value-education course. Tagged in the VAC admin course form; counted live for accreditation coverage.';

-- ── Metric 6.2: cultural clubs (documentation only — no DDL) ─────────────────
COMMENT ON COLUMN public.cdc_clubs.club_type IS
  'Free-text club type (technical, cultural, sports, literary, social, entrepreneurship, or custom). NAAC-2024 metric 6.2 counts rows with club_type = ''cultural''.';
