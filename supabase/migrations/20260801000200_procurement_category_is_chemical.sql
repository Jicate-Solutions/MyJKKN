-- Migration: 20260801000200_procurement_category_is_chemical
-- Purpose:  Mark item categories (and optionally individual items) as CHEMICAL so the
--           Procurement GRN three-way-match step can enforce mandatory Batch Number +
--           Expiry Date before verification (PRD step 12 "Chemical Item Validation").
-- Model:    is_chemical lives on the category (the natural grouping); the per-item
--           override column lets a single item opt in/out regardless of its category.
--           Effective value at GRN time = COALESCE(item.is_chemical, category.is_chemical, false).
-- Note:     Additive-only; enforcement itself is service-layer + a GRN-line CHECK added
--           with the procurement_grn tables in a later phase.

ALTER TABLE public.ims_item_categories
    ADD COLUMN IF NOT EXISTS is_chemical BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.ims_items
    ADD COLUMN IF NOT EXISTS is_chemical BOOLEAN; -- nullable: NULL = inherit from category

COMMENT ON COLUMN public.ims_item_categories.is_chemical IS 'When true, items in this category require batch + expiry at GRN verification (procurement).';
COMMENT ON COLUMN public.ims_items.is_chemical           IS 'Per-item override of category.is_chemical; NULL inherits the category value (procurement).';
