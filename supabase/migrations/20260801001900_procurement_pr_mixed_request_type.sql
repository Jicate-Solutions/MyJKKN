-- Migration: 20260801001900_procurement_pr_mixed_request_type
-- Purpose:  A Purchase Request used to be forced into a single request_type
--           ('restock' or 'new_item') for its ENTIRE item list, via a
--           form-level toggle that gated every line the same way. Staff
--           legitimately need to raise one PR mixing restock lines (existing
--           catalog items) and new-item lines (not yet catalogued) — e.g. all
--           under one category like Chemicals — so the per-item choice moves
--           to the item level (procurement_purchase_request_items.domain_item_id
--           is already nullable per row: null = new item). The header
--           request_type becomes a server-computed SUMMARY of the rows
--           ('restock' | 'new_item' | 'mixed'), not a client-set gate.

ALTER TABLE public.procurement_purchase_requests
    DROP CONSTRAINT IF EXISTS procurement_purchase_requests_request_type_check;

ALTER TABLE public.procurement_purchase_requests
    ADD CONSTRAINT procurement_purchase_requests_request_type_check
    CHECK (request_type = ANY (ARRAY['restock'::text, 'new_item'::text, 'mixed'::text]));
