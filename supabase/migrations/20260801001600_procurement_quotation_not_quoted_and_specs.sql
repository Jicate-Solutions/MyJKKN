-- Migration: 20260801001600_procurement_quotation_not_quoted_and_specs
-- Purpose:  Fix two gaps in vendor quotation comparison (PRD steps 5-6):
--           1. Staff had no way to record that a vendor simply didn't quote an
--              item, so they typed a bogus 0.01 price as a workaround — which
--              then won the "lowest price" comparison and could be awarded.
--              unit_price is now nullable; NULL *is* "not quoted". A DB CHECK
--              guarantees an awarded line always has a real price, mirroring
--              the existing uq_pqi_one_award_per_rfq_item DB-level guarantee
--              rather than trusting application code alone.
--           2. Vendors quote different actual specs (brand, concentration,
--              pack size) for nominally the same item — offered_spec captures
--              what THIS vendor is actually offering, distinct from the RFQ's
--              own item_spec (what the buyer asked for).

ALTER TABLE public.procurement_quotation_items ALTER COLUMN unit_price DROP NOT NULL;
-- existing CHECK (unit_price >= 0) already passes NULL through untouched (Postgres
-- treats a NULL operand as satisfying a CHECK) — no rewrite needed.

ALTER TABLE public.procurement_quotation_items
    ADD CONSTRAINT chk_pqi_awarded_requires_price CHECK (NOT awarded OR unit_price IS NOT NULL);

ALTER TABLE public.procurement_quotation_items ADD COLUMN IF NOT EXISTS offered_spec TEXT;
