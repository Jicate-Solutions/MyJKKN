-- Migration: 20260801000900_procurement_grn_price_match
-- Purpose:  Add the PRICE axis to the GRN three-way match (verify.md §9 — "Invoice
--           Quantity & Price"). Store the supplier's invoiced unit price per line and
--           allow a 'price_mismatch' classification.

ALTER TABLE public.procurement_grn_items
    ADD COLUMN IF NOT EXISTS invoice_unit_price NUMERIC(12,2);

-- Expand the match_status CHECK to include 'price_mismatch'. 'short' now means an
-- expected partial delivery (not an error); the mismatch flag lives on the row.
ALTER TABLE public.procurement_grn_items
    DROP CONSTRAINT IF EXISTS procurement_grn_items_match_status_check;
ALTER TABLE public.procurement_grn_items
    ADD CONSTRAINT procurement_grn_items_match_status_check
    CHECK (match_status IN ('matched', 'qty_mismatch', 'price_mismatch', 'short', 'over'));
