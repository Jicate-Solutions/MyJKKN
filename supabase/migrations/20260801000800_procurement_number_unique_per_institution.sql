-- Migration: 20260801000800_procurement_number_unique_per_institution
-- Purpose:  Fix cross-institution document-number collisions.
--
-- procurement_next_number counts PER (institution, doc_type, date), so two different
-- institutions independently mint the same human-readable number on the same day
-- (e.g. both get PR-260709-00001). But request_number/rfq_number/po_number/grn_number
-- each carried a GLOBAL unique constraint, so the second institution's insert failed
-- with 23505. The number format intentionally omits the institution; therefore the
-- uniqueness invariant must be per-institution to match the generator.
--
-- Fix: replace each global UNIQUE(<number>) with UNIQUE(institution_id, <number>).
-- Safe on existing data — numbers are already unique within an institution.

ALTER TABLE public.procurement_purchase_requests
    DROP CONSTRAINT IF EXISTS procurement_purchase_requests_request_number_key,
    ADD CONSTRAINT procurement_purchase_requests_inst_number_key UNIQUE (institution_id, request_number);

ALTER TABLE public.procurement_rfqs
    DROP CONSTRAINT IF EXISTS procurement_rfqs_rfq_number_key,
    ADD CONSTRAINT procurement_rfqs_inst_number_key UNIQUE (institution_id, rfq_number);

ALTER TABLE public.procurement_purchase_orders
    DROP CONSTRAINT IF EXISTS procurement_purchase_orders_po_number_key,
    ADD CONSTRAINT procurement_purchase_orders_inst_number_key UNIQUE (institution_id, po_number);

ALTER TABLE public.procurement_grn
    DROP CONSTRAINT IF EXISTS procurement_grn_grn_number_key,
    ADD CONSTRAINT procurement_grn_inst_number_key UNIQUE (institution_id, grn_number);
