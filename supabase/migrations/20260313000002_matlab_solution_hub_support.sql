-- MATLAB Integration: Solution Hub Support
-- Adds technology stack tracking to products and external platform to training

-- 1. Add technology stack and Startup Studio origin links to products
ALTER TABLE sh_products
  ADD COLUMN IF NOT EXISTS technology_stack TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ss_cycle_id UUID,
  ADD COLUMN IF NOT EXISTS ss_nif_candidate_id UUID;

CREATE INDEX IF NOT EXISTS idx_sh_products_tech_stack
  ON sh_products USING GIN(technology_stack);

-- 2. Add external platform support to training programs
ALTER TABLE sh_training_programs
  ADD COLUMN IF NOT EXISTS external_course_url TEXT,
  ADD COLUMN IF NOT EXISTS external_platform TEXT
    CHECK (external_platform IN (
      'matlab_academy', 'coursera', 'nptel', 'internal', 'other'
    ));
