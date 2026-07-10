-- Migration: 20260801000500_procurement_quotations
-- Purpose:  Phase 3 of centralized Procurement — Vendor Quotations & comparison
--           (PRD steps 5-6). Each vendor on an RFQ submits a quotation (header +
--           per-item unit prices + an uploaded document). The buyer compares
--           item-wise and awards each line to a vendor (different items may go to
--           different vendors) via procurement_quotation_items.awarded.
-- RLS:      institution-scoped header; items inherit via the parent quotation.
-- Plan:     docs/centralized-store/PLAN-procurement-v1.md §3.2, §4 (award feeds PO).

-- ---------------------------------------------------------------------------
-- Quotation header — one per (rfq, vendor)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,
    rfq_id UUID NOT NULL REFERENCES public.procurement_rfqs(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES public.ims_suppliers(id),
    vendor_quote_number TEXT,
    quote_date DATE,
    validity_date DATE,
    payment_terms TEXT,
    delivery_time_days INTEGER,
    total_amount NUMERIC(14,2),
    document_url TEXT,       -- uploaded quotation file (Google Drive) — optional
    document_file_id TEXT,   -- Drive file id for later access/proxy
    status TEXT NOT NULL DEFAULT 'received'
        CHECK (status IN ('received', 'shortlisted', 'awarded', 'rejected')),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (rfq_id, supplier_id)
);
CREATE INDEX IF NOT EXISTS idx_pq_institution ON public.procurement_quotations(institution_id);
CREATE INDEX IF NOT EXISTS idx_pq_rfq         ON public.procurement_quotations(rfq_id);

-- ---------------------------------------------------------------------------
-- Quotation line items — one per RFQ item this vendor quoted
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_quotation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL REFERENCES public.procurement_quotations(id) ON DELETE CASCADE,
    rfq_item_id UUID NOT NULL REFERENCES public.procurement_rfq_items(id),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    quantity NUMERIC(12,2),
    delivery_time_days INTEGER,
    remarks TEXT,
    -- At most one awarded quotation_item per rfq_item (enforced in the service +
    -- the partial unique index below).
    awarded BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pqi_quotation ON public.procurement_quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_pqi_rfq_item  ON public.procurement_quotation_items(rfq_item_id);

-- DB-level guarantee: only ONE awarded vendor per RFQ line.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pqi_one_award_per_rfq_item
    ON public.procurement_quotation_items(rfq_item_id)
    WHERE awarded = true;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.procurement_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_quotation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pq_institution_scope ON public.procurement_quotations;
CREATE POLICY pq_institution_scope ON public.procurement_quotations
    FOR ALL
    USING (institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()) OR public.get_current_user_role() = 'super_admin')
    WITH CHECK (institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()) OR public.get_current_user_role() = 'super_admin');

DROP POLICY IF EXISTS pqi_parent_scope ON public.procurement_quotation_items;
CREATE POLICY pqi_parent_scope ON public.procurement_quotation_items
    FOR ALL
    USING (EXISTS (SELECT 1 FROM public.procurement_quotations q WHERE q.id = procurement_quotation_items.quotation_id AND (q.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()) OR public.get_current_user_role() = 'super_admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.procurement_quotations q WHERE q.id = procurement_quotation_items.quotation_id AND (q.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()) OR public.get_current_user_role() = 'super_admin')));
