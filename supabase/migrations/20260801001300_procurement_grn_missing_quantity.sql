-- Migration: 20260801001300_procurement_grn_missing_quantity
-- Purpose:  Record the quantity that was ordered/invoiced but NOT delivered in a
--           receipt. Informational only — it does NOT feed the three-way-match
--           engine or affect match_status; it just flags shortfalls per line.

ALTER TABLE public.procurement_grn_items
    ADD COLUMN IF NOT EXISTS missing_quantity NUMERIC(12,2) NOT NULL DEFAULT 0;
