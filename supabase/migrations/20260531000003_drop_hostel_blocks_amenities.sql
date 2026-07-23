-- ============================================================================
-- Drop the legacy static JSONB `amenities` column from hostel_blocks.
-- ============================================================================
-- Block amenities are now catalog-driven: selected from scope-filtered
-- hostel_amenity_tags and persisted to the hostel_block_amenity_tags junction
-- (see the block Add/Edit forms + HostelBlockService.syncBlockAmenityTags).
--
-- The old column held a free-form {wifi,laundry,gym,...} object that was never
-- linked to the amenity catalog. It was empty on every block and has no
-- view/function dependents (verified against prod 2026-05-31), so the drop is
-- non-destructive in practice.
-- ============================================================================

ALTER TABLE public.hostel_blocks DROP COLUMN IF EXISTS amenities;
