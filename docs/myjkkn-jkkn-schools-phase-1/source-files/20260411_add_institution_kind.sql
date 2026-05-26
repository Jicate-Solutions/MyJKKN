-- =====================================================
-- Migration: Add institution_kind to institutions
-- Date: 2026-04-11
-- Purpose: Support K-12 schools as first-class institutions
--          alongside higher-ed colleges without forking the data model.
--
-- Related spec: docs/SPEC-jkkn-schools.md
--
-- Safety: Zero-risk — adds one nullable-defaulted column. Existing rows
--         default to 'college' so college behavior is unchanged.
-- =====================================================

-- 1. Add the column
ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS institution_kind VARCHAR(20) NOT NULL DEFAULT 'college';

-- 2. Enforce valid values
DO $$ BEGIN
  ALTER TABLE public.institutions
    ADD CONSTRAINT institutions_kind_check
    CHECK (institution_kind IN ('college', 'school'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Index for fast filtering (sidebar, reports, dashboards)
CREATE INDEX IF NOT EXISTS idx_institutions_kind
  ON public.institutions(institution_kind);

-- 4. Document the column
COMMENT ON COLUMN public.institutions.institution_kind IS
  'Education level: college (higher ed) or school (K-12). Determines UI labels (Program→Class, Semester→Term, Course→Subject) and which sidebar items are visible. Does NOT affect the underlying data model — schools use the same tables as colleges via virtual K-12 hierarchy rows. See docs/SPEC-jkkn-schools.md.';

-- 5. Verification query (run manually after migration)
-- SELECT id, name, institution_kind FROM public.institutions ORDER BY institution_kind, name;
