-- Migration: add package_type classification to admission fee structures
-- Date: 2026-08-19
--
-- CLASSIFICATION ONLY — deliberately NOT a matching dimension.
--
-- 'package'     = the structure quotes one consolidated, all-inclusive amount
-- 'non_package' = the structure itemises each fee head separately
-- NULL          = unclassified / "Any" (the state all 236 pre-existing rows keep)
--
-- Fee resolution (admission_resolve_fee_items_for_lead / _readonly), the
-- junction overlap guard (_fee_structure_community_no_overlap) and
-- trigger_detect_fee_dimension_change all IGNORE this column on purpose. A
-- consequence worth knowing: two structures sharing all 7 matrix dimensions
-- still collide even if their package_type differs. Promoting this to a real
-- matching dimension is a separate, larger change that also needs a
-- learner-side source of truth for "is this learner on a package?".
--
-- Nullable + no backfill = zero behaviour change on deploy.

ALTER TABLE public.admission_fee_structures
  ADD COLUMN IF NOT EXISTS package_type text;

ALTER TABLE public.admission_fee_structures
  DROP CONSTRAINT IF EXISTS admission_fee_structures_package_type_check;

ALTER TABLE public.admission_fee_structures
  ADD CONSTRAINT admission_fee_structures_package_type_check
  CHECK (package_type IS NULL OR package_type IN ('package', 'non_package'));

COMMENT ON COLUMN public.admission_fee_structures.package_type IS
  'Classification only, NOT a matching dimension. package = consolidated single amount; non_package = itemised fee heads; NULL = unclassified/Any. Fee resolution ignores this column.';
