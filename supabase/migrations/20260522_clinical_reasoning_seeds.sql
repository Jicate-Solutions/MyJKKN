-- ============================================================================
-- Migration: 20260522_clinical_reasoning_seeds
-- AICBL → PDE Clinical Reasoning sprint, Agent A — Step A6
-- ============================================================================
-- Seeds:
--   1. pde_capabilities row: slug='clinical_reasoning'
--   2. vac_courses row: 'BDS Clinical Reasoning' (BDS-CR-101)
--   3. fn_auto_enroll_bds_clinical_reasoning() — trigger function
--   4. Trigger on profiles (INSERT OR UPDATE OF learner_id) — fires on
--      link-establishment, the chronologically-correct anchor
--   5. One-time backfill of existing 543 BDS learners at JKKN Dental
--
-- Spec-vs-reality overrides:
--   - Spec said `learners_profiles.program` text → reality has program_id UUID
--     FK to programs table. BDS = 'aea1e367-65ad-442d-9b11-ab0277d93a83'.
--   - Spec said trigger on learners_profiles INSERT → reality requires JOIN
--     through profiles.learner_id to find auth identity (vac_enrollments.user_id
--     = profiles.id = auth.users.id, NOT learners_profiles.id). Trigger fires
--     on profiles INSERT or UPDATE OF learner_id instead.
--   - pde_capabilities.level is NOT NULL (spec missed) → set to 3 (UG clinical).
--
-- JKKN Dental institution_id: e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5
-- BDS program_id:              aea1e367-65ad-442d-9b11-ab0277d93a83
-- ============================================================================

-- 1. pde_capabilities: clinical_reasoning
INSERT INTO pde_capabilities (slug, name, description, category, level, version, is_core, finks_dimension)
VALUES (
  'clinical_reasoning',
  'Clinical Reasoning',
  'Ability to reason through patient cases — data gathering, hypothesis generation, management planning, communication, professionalism. Demonstrated via AI-tutored case-based assessments (CBCL pedagogy).',
  'cognitive',
  3,
  1,
  true,
  'application'
)
ON CONFLICT (slug) DO NOTHING;

-- 2. vac_courses: BDS Clinical Reasoning
-- (no UNIQUE constraint on code+institution exists; use WHERE NOT EXISTS for idempotency)
INSERT INTO vac_courses (
  code, name, description, institution, track,
  fee, faculty_eligible, course_category,
  institution_id, programme_id, is_active
)
SELECT
  'BDS-CR-101',
  'BDS Clinical Reasoning',
  'AI-tutored case-based learning for clinical reasoning across Oral Medicine, Oral Pathology, and allied dental disciplines. Auto-enrolled for all JKKN Dental BDS learners.',
  'JKKN Dental College and Hospital',
  'general',
  0,
  false,
  'value_add',
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5',
  'aea1e367-65ad-442d-9b11-ab0277d93a83',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM vac_courses
  WHERE code = 'BDS-CR-101'
    AND institution_id = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'
);

-- 3. Auto-enroll trigger function
CREATE OR REPLACE FUNCTION fn_auto_enroll_bds_clinical_reasoning()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id UUID;
  v_program_id UUID;
  v_institution_id UUID;
BEGIN
  IF NEW.learner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_course_id
  FROM vac_courses
  WHERE code = 'BDS-CR-101'
  LIMIT 1;

  IF v_course_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT program_id, institution_id
    INTO v_program_id, v_institution_id
  FROM learners_profiles
  WHERE id = NEW.learner_id;

  IF v_program_id = 'aea1e367-65ad-442d-9b11-ab0277d93a83'
     AND v_institution_id = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'
  THEN
    INSERT INTO vac_enrollments (user_id, course_id, status)
    VALUES (NEW.id, v_course_id, 'active')
    ON CONFLICT (user_id, course_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_auto_enroll_bds_clinical_reasoning() IS
  'Auto-enrolls JKKN Dental BDS learners in the BDS Clinical Reasoning course (BDS-CR-101) at the moment their profile is linked to a learners_profiles row. Decision 14 (auto-enroll all BDS students, zero friction for Sakthi WOZ).';

-- 4. Trigger on profiles (fires at link-establishment moment)
DROP TRIGGER IF EXISTS trg_auto_enroll_bds_clinical_reasoning ON profiles;
CREATE TRIGGER trg_auto_enroll_bds_clinical_reasoning
  AFTER INSERT OR UPDATE OF learner_id ON profiles
  FOR EACH ROW
  WHEN (NEW.learner_id IS NOT NULL)
  EXECUTE FUNCTION fn_auto_enroll_bds_clinical_reasoning();

-- 5. One-time backfill of existing BDS learners at JKKN Dental
INSERT INTO vac_enrollments (user_id, course_id, status)
SELECT
  p.id,
  (SELECT id FROM vac_courses WHERE code='BDS-CR-101' LIMIT 1),
  'active'
FROM learners_profiles lp
JOIN profiles p ON p.learner_id = lp.id
WHERE lp.program_id = 'aea1e367-65ad-442d-9b11-ab0277d93a83'
  AND lp.institution_id = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'
ON CONFLICT (user_id, course_id) DO NOTHING;
