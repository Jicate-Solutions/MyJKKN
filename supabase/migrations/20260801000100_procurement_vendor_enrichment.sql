-- Migration: 20260801000100_procurement_vendor_enrichment
-- Purpose:  Enrich ims_suppliers so it can serve as the SHARED, cross-domain vendor
--           master for the centralized Procurement module (OPEN-1 in the plan:
--           reuse ims_suppliers rather than forking a parallel procurement_vendors).
--           Adds the commercial fields procurement needs for quotation comparison
--           and Purchase Orders (payment terms, lead time, rating, bank details).
-- Note:     Additive-only. ims_suppliers already holds code/name/contact/gstin.

ALTER TABLE public.ims_suppliers
    ADD COLUMN IF NOT EXISTS payment_terms  TEXT,
    ADD COLUMN IF NOT EXISTS lead_time_days INTEGER,
    ADD COLUMN IF NOT EXISTS rating         NUMERIC(2,1) CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
    ADD COLUMN IF NOT EXISTS bank_details   JSONB;

COMMENT ON COLUMN public.ims_suppliers.payment_terms  IS 'Vendor commercial terms, e.g. "30 days net" (procurement).';
COMMENT ON COLUMN public.ims_suppliers.lead_time_days IS 'Typical delivery lead time in days, used in quotation comparison (procurement).';
COMMENT ON COLUMN public.ims_suppliers.rating         IS 'Vendor rating 0-5, optional input to quotation comparison (procurement).';
COMMENT ON COLUMN public.ims_suppliers.bank_details   IS 'JSON bank/payment details for PO settlement (procurement).';
