-- ============================================================================
-- 20260526 — Add 'school' to entity_type CHECK constraint on public.institutions
-- ============================================================================
-- Extends the chk_entity_type constraint to include 'school' as a valid
-- entity_type value, allowing institutions table to store school entities
-- alongside institution, admin_office, and company types.
--
-- Behaviour:
--   - Modifies the CHECK constraint on the entity_type column
--   - Allows existing rows and new inserts with entity_type = 'school'
--   - No data migration required
-- ============================================================================

-- Drop the existing constraint and add the updated one with 'school' included
ALTER TABLE public.institutions
DROP CONSTRAINT chk_entity_type;

ALTER TABLE public.institutions
ADD CONSTRAINT chk_entity_type CHECK (
  (entity_type)::text = ANY(ARRAY['institution'::text, 'admin_office'::text, 'company'::text, 'school'::text])
);

COMMENT ON CONSTRAINT chk_entity_type ON public.institutions IS
  'Validates that entity_type is one of: institution, admin_office, company, or school';
