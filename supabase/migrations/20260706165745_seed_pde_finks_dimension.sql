-- Migration: Seed finks_dimension on the 7 pilot pde_assessment_questions
-- Date: 2026-07-06
-- Purpose: Seed finks_dimension on the 7 pilot pde_assessment_questions.
--          The column is free-text (no CHECK constraint on finks_dimension; the only
--          CHECK is on question_type). The results route buckets by
--          (finks_dimension || 'uncategorized'), so these values become the UI bucket
--          labels on the results page. Values use the 6 canonical Fink
--          "Taxonomy of Significant Learning" dimension strings.
--          These are proposed defaults, open to Director revision.
--          Idempotent: each UPDATE guarded by finks_dimension IS NULL.

-- Q1: Describe the lesion (Site, Size, Shape, Colour, Surface texture, Margins, Extension).
-- Rationale: recall/recognition of the systematic set of clinical features to observe and
-- describe -> Foundational Knowledge.
UPDATE pde_assessment_questions
SET finks_dimension = 'Foundational Knowledge'
WHERE id = '05c37942-6b6d-413e-a52b-817831c343b8'
  AND finks_dimension IS NULL;

-- Q2: A. Give your provisional diagnosis. B. Which findings most influenced your diagnosis?
-- Rationale: applying clinical reasoning to reach and justify a diagnostic decision -> Application.
UPDATE pde_assessment_questions
SET finks_dimension = 'Application'
WHERE id = '78fcdde2-44d9-48af-ab68-859657cf495e'
  AND finks_dimension IS NULL;

-- Q3: What are your differential diagnoses? List with reasons for exclusion.
-- Rationale: connecting and discriminating across multiple conditions (compare/contrast to
-- exclude) -> Integration.
UPDATE pde_assessment_questions
SET finks_dimension = 'Integration'
WHERE id = '99a906a1-f1a1-45aa-9ae0-24cbcd48dd76'
  AND finks_dimension IS NULL;

-- Q4: Which feature ruled out the closest differential diagnosis?
-- Rationale: discriminating between conditions by connecting a distinguishing feature to
-- exclusion -> Integration.
UPDATE pde_assessment_questions
SET finks_dimension = 'Integration'
WHERE id = 'd11f7a31-4fb5-46e8-9d9c-b93ae3885bdd'
  AND finks_dimension IS NULL;

-- Q5: Justify investigation/biopsy based on clinical risk factors.
-- Rationale: applying decision-making to weigh risk and justify a next clinical action -> Application.
UPDATE pde_assessment_questions
SET finks_dimension = 'Application'
WHERE id = '1e9beb09-3f8f-4dc6-9187-6ab895ed79cd'
  AND finks_dimension IS NULL;

-- Q6: Write about the management.
-- Rationale: applying knowledge to plan a management/treatment course -> Application.
UPDATE pde_assessment_questions
SET finks_dimension = 'Application'
WHERE id = '78812ec6-8b4c-4f1a-9692-02678b4a8fe5'
  AND finks_dimension IS NULL;

-- Q7: Click on the area of the buccal mucosa showing the characteristic Wickham striae pattern.
-- Rationale: recognizing/recalling a characteristic diagnostic sign (image identification)
-- -> Foundational Knowledge.
UPDATE pde_assessment_questions
SET finks_dimension = 'Foundational Knowledge'
WHERE id = 'b7855c53-74d7-4f3a-9492-49dcd56cd66f'
  AND finks_dimension IS NULL;
