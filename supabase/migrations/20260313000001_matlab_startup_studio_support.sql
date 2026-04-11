-- MATLAB Integration: Startup Studio Support
-- Adds build tool selection, MATLAB toolbox tracking, and cross-system links

-- 1. Extend ss_builds for multi-tool support
ALTER TABLE ss_builds
  ADD COLUMN IF NOT EXISTS build_tool TEXT DEFAULT 'lovable'
    CHECK (build_tool IN ('lovable', 'matlab', 'code', 'other')),
  ADD COLUMN IF NOT EXISTS matlab_toolboxes_used TEXT[],
  ADD COLUMN IF NOT EXISTS github_repo_url TEXT,
  ADD COLUMN IF NOT EXISTS tool_name TEXT;

CREATE INDEX IF NOT EXISTS idx_ss_builds_build_tool
  ON ss_builds(build_tool);

-- 2. Add recommended tools to problem bank
ALTER TABLE ss_problem_bank
  ADD COLUMN IF NOT EXISTS recommended_tools TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_ss_problem_bank_tools
  ON ss_problem_bank USING GIN(recommended_tools);

-- 3. Add deployment platform and cross-system links to NIF candidates
ALTER TABLE ss_nif_candidates
  ADD COLUMN IF NOT EXISTS deployment_platform TEXT
    CHECK (deployment_platform IN (
      'matlab_web_app_server', 'vercel', 'railway',
      'lovable', 'supabase', 'other'
    )),
  ADD COLUMN IF NOT EXISTS sh_product_id UUID,
  ADD COLUMN IF NOT EXISTS sh_solution_id UUID;
