-- Fix cross-scope FK corruption on learners_profiles (academic_year / semester / section)
-- ----------------------------------------------------------------------------
-- Same root cause / class as the degree fix (20260608120000): bulk-imported learners
-- carry FKs pointing OUTSIDE their own scope, so the cascading filters on
-- /learners/profiles return empty when those fields are selected.
--   * academic_year_id -> academic year of ANOTHER institution
--   * semester_id      -> semester of ANOTHER program
--   * section_id        -> section of ANOTHER semester
--
-- Remap each to the same-named row in the CORRECT scope. Verified unambiguous
-- (0 ambiguous). Rows with no same-named target in the correct scope are NOT
-- touched (left for manual review) -- the inner LATERAL join excludes them.
--
-- Order matters: section is repaired AFTER semester so it is evaluated against
-- the corrected semester_id. (Fixing the parent first exposes the true child
-- mismatches -- which is why the section backup is larger than a pre-fix count.)
--
-- Applied result (active learners): academic_year 714->0, semester 220->35,
-- section 11->11 cross-scope remaining; backups captured 718 / 222 / 303 rows.
-- Residual 35 semesters + 11 sections are genuine no-target gaps (correct
-- program/semester has no row with that name) -> handled separately.
--
-- Trigger safety: SET touches only the one FK column + updated_at. None of
-- academic_year_id / semester_id / section_id are monitored fee dimensions
-- (detect_fee_dimension_change watches admission_year_id, not academic_year_id),
-- and none are in any UPDATE OF column-scoped trigger list -> no side effects.
-- ----------------------------------------------------------------------------

-- ============================ ACADEMIC YEAR ============================
CREATE TABLE IF NOT EXISTS public._bak_learner_academic_year_remap_20260608 (
  learner_id            uuid PRIMARY KEY,
  institution_id        uuid,
  old_academic_year_id  uuid,
  new_academic_year_id  uuid,
  academic_year_name    text,
  remapped_at           timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public._bak_learner_academic_year_remap_20260608
  (learner_id, institution_id, old_academic_year_id, new_academic_year_id, academic_year_name)
SELECT lp.id, lp.institution_id, lp.academic_year_id, t.id, a.academic_year_name
FROM public.learners_profiles lp
JOIN public.academic_years a ON a.id = lp.academic_year_id
JOIN LATERAL (
  SELECT t2.id FROM public.academic_years t2
  WHERE t2.institution_id = lp.institution_id
    AND lower(t2.academic_year_name) = lower(a.academic_year_name)
  ORDER BY t2.id LIMIT 1
) t ON true
WHERE a.institution_id <> lp.institution_id
ON CONFLICT (learner_id) DO NOTHING;

UPDATE public.learners_profiles lp
SET academic_year_id = b.new_academic_year_id, updated_at = now()
FROM public._bak_learner_academic_year_remap_20260608 b
WHERE lp.id = b.learner_id AND lp.academic_year_id = b.old_academic_year_id;

-- ============================ SEMESTER ============================
CREATE TABLE IF NOT EXISTS public._bak_learner_semester_remap_20260608 (
  learner_id       uuid PRIMARY KEY,
  program_id       uuid,
  old_semester_id  uuid,
  new_semester_id  uuid,
  semester_name    text,
  remapped_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public._bak_learner_semester_remap_20260608
  (learner_id, program_id, old_semester_id, new_semester_id, semester_name)
SELECT lp.id, lp.program_id, lp.semester_id, t.id, s.semester_name
FROM public.learners_profiles lp
JOIN public.semesters s ON s.id = lp.semester_id
JOIN LATERAL (
  SELECT t2.id FROM public.semesters t2
  WHERE t2.program_id = lp.program_id
    AND lower(t2.semester_name) = lower(s.semester_name)
  ORDER BY t2.id LIMIT 1
) t ON true
WHERE s.program_id <> lp.program_id
ON CONFLICT (learner_id) DO NOTHING;

UPDATE public.learners_profiles lp
SET semester_id = b.new_semester_id, updated_at = now()
FROM public._bak_learner_semester_remap_20260608 b
WHERE lp.id = b.learner_id AND lp.semester_id = b.old_semester_id;

-- ============================ SECTION (after semester) ============================
CREATE TABLE IF NOT EXISTS public._bak_learner_section_remap_20260608 (
  learner_id      uuid PRIMARY KEY,
  semester_id     uuid,
  old_section_id  uuid,
  new_section_id  uuid,
  section_name    text,
  remapped_at     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public._bak_learner_section_remap_20260608
  (learner_id, semester_id, old_section_id, new_section_id, section_name)
SELECT lp.id, lp.semester_id, lp.section_id, t.id, sec.section_name
FROM public.learners_profiles lp
JOIN public.sections sec ON sec.id = lp.section_id
JOIN LATERAL (
  SELECT t2.id FROM public.sections t2
  WHERE t2.semester_id = lp.semester_id
    AND lower(t2.section_name) = lower(sec.section_name)
  ORDER BY t2.id LIMIT 1
) t ON true
WHERE sec.semester_id <> lp.semester_id
ON CONFLICT (learner_id) DO NOTHING;

UPDATE public.learners_profiles lp
SET section_id = b.new_section_id, updated_at = now()
FROM public._bak_learner_section_remap_20260608 b
WHERE lp.id = b.learner_id AND lp.section_id = b.old_section_id;

-- ----------------------------------------------------------------------------
-- ROLLBACK (manual): for each table, UPDATE ... SET <col> = old_* WHERE new_* matches.
-- Backup tables: _bak_learner_{academic_year,semester,section}_remap_20260608
-- ----------------------------------------------------------------------------
