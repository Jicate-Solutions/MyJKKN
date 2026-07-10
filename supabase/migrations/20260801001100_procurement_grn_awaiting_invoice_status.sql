-- Migration: 20260801001100_procurement_grn_awaiting_invoice_status
-- Purpose:  Add the 'awaiting_invoice' match status. A GRN line with no supplier
--           invoice captured is NOT a match (verify.md §9 — a three-way match needs
--           the invoice to compare against). Previously such a line fell through to
--           'matched', showing a misleading green pass. matchLine() now classifies it
--           'awaiting_invoice' until an invoice is provided.

ALTER TABLE public.procurement_grn_items
    DROP CONSTRAINT IF EXISTS procurement_grn_items_match_status_check;
ALTER TABLE public.procurement_grn_items
    ADD CONSTRAINT procurement_grn_items_match_status_check
    CHECK (match_status IN ('awaiting_invoice', 'matched', 'qty_mismatch', 'price_mismatch', 'short', 'over'));
