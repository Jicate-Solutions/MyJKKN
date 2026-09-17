-- Migration: 20260908064425_procurement_grn_items_serial_numbers
-- Purpose:  Capture per-unit serial numbers at GRN receiving time (same moment
--           batch_number/expiry_date are typed in for chemicals) so
--           fn_procurement_rm_post_receipt (20260908064258) can fan a serialized
--           line out into one resources row per unit at verify time.
-- Scope:    resource_mgmt only in practice, but kept domain-agnostic like every
--           other grn_items column — NULL for every non-serialized line (the
--           overwhelming majority, including all of IMS).

ALTER TABLE public.procurement_grn_items
    ADD COLUMN IF NOT EXISTS serial_numbers TEXT[];

COMMENT ON COLUMN public.procurement_grn_items.serial_numbers IS
    'One serial number per accepted unit (array length must equal accepted_quantity), captured at GRN receipt for serialized Resource Management assets. NULL for non-serialized lines.';
