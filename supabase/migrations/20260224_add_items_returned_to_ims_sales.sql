-- Migration: 20260224_add_items_returned_to_ims_sales
-- Purpose: Track whether items were physically returned when a sale is cancelled.
--          When items_returned = false, stock is NOT restored and write-off
--          adjustments are created instead.

ALTER TABLE public.ims_sales ADD COLUMN IF NOT EXISTS items_returned BOOLEAN DEFAULT true;
