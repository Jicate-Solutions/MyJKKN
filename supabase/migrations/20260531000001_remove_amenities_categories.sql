-- ============================================================================
-- Remove the "Amenities Categories" module — orphan lookup + dead fee linkage.
-- ============================================================================
-- WHY:
--   amenities_categories was a standalone lookup wired into ONLY one place:
--   hostel_category_fees.amenities_category_id (the "amenity" kind in the
--   additive fee-config matrix). It was dead weight:
--     • the hostel fee compute engine (quoteUpfrontFee) never read it —
--       it computes room + AC(billable) + mess only;
--     • 0 hostel_category_fees rows referenced an amenity category;
--     • no views / functions / triggers depended on the table or column
--       (verified against prod 2026-05-31).
--   The standalone Amenities (hostel_amenity_tags) and Billable Amenities
--   (hostel_billable_amenities) modules are UNRELATED and untouched.
--
-- WHAT:
--   1. Drop the "exactly one category" CHECK (references amenities_category_id).
--   2. Drop the partial unique index on the amenity column.
--   3. Drop hostel_category_fees.amenities_category_id (drops its FK with it).
--   4. Re-add the CHECK for the two remaining kinds (hostel room / mess).
--   5. Drop the orphan amenities_categories table (cascades its RLS policies,
--      index, and updated_at trigger).
-- ============================================================================

-- 1. Drop the old "exactly one category" CHECK (it references amenities_category_id).
ALTER TABLE public.hostel_category_fees
  DROP CONSTRAINT IF EXISTS hostel_category_fees_one_category;

-- 2. Drop the partial unique index on the amenity column.
DROP INDEX IF EXISTS public.uq_hcf_amenities_category;

-- 3. Drop the column (drops hostel_category_fees_amenities_category_id_fkey with it).
ALTER TABLE public.hostel_category_fees
  DROP COLUMN IF EXISTS amenities_category_id;

-- 4. Re-add the CHECK for the two remaining category kinds (hostel room / mess).
ALTER TABLE public.hostel_category_fees
  ADD CONSTRAINT hostel_category_fees_one_category
  CHECK (num_nonnulls(hostel_category_id, mess_category_id) = 1);

-- 5. Drop the orphan lookup table (cascades its 4 RLS policies, index, trigger).
DROP TABLE IF EXISTS public.amenities_categories;
