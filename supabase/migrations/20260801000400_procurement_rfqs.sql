-- Migration: 20260801000400_procurement_rfqs
-- Purpose:  Phase 2 of centralized Procurement — Request for Quotation (PRD steps 3-4).
--           An approved Purchase Request is converted into an RFQ: its items are
--           snapshotted into procurement_rfq_items (immutable "what we asked for"),
--           vendors are attached, and a Purchase Requirement List is issued to them.
-- RLS:      institution-scoped (money-adjacent); child rows inherit via the parent RFQ.
-- Plan:     docs/centralized-store/PLAN-procurement-v1.md §3.2.

-- ---------------------------------------------------------------------------
-- RFQ header
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_rfqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,
    store_id UUID,
    rfq_number TEXT NOT NULL UNIQUE,
    -- The approved PR this RFQ was generated from (nullable: an RFQ may be raised ad hoc).
    source_request_id UUID REFERENCES public.procurement_purchase_requests(id),
    domain TEXT NOT NULL DEFAULT 'ims' CHECK (domain IN ('ims', 'resource_mgmt')),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'quotations_received', 'compared', 'awarded', 'closed', 'cancelled')),
    requirement_pdf_url TEXT,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    sent_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prfq_institution ON public.procurement_rfqs(institution_id);
CREATE INDEX IF NOT EXISTS idx_prfq_source      ON public.procurement_rfqs(source_request_id);
CREATE INDEX IF NOT EXISTS idx_prfq_status      ON public.procurement_rfqs(status);

-- ---------------------------------------------------------------------------
-- RFQ line items (snapshot of the PR items at conversion time)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_rfq_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id UUID NOT NULL REFERENCES public.procurement_rfqs(id) ON DELETE CASCADE,
    request_item_id UUID REFERENCES public.procurement_purchase_request_items(id),
    domain_item_id UUID,
    item_name TEXT NOT NULL,
    item_spec TEXT,
    quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
    unit_id UUID,
    unit_label TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prfqi_rfq ON public.procurement_rfq_items(rfq_id);

-- ---------------------------------------------------------------------------
-- RFQ vendors (which suppliers received the requirement list)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_rfq_vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id UUID NOT NULL REFERENCES public.procurement_rfqs(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES public.ims_suppliers(id),
    sent_at TIMESTAMPTZ,
    sent_email TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (rfq_id, supplier_id)
);
CREATE INDEX IF NOT EXISTS idx_prfqv_rfq ON public.procurement_rfq_vendors(rfq_id);

-- ---------------------------------------------------------------------------
-- RLS — institution-scoped header; children inherit through the parent RFQ.
-- ---------------------------------------------------------------------------
ALTER TABLE public.procurement_rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_rfq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_rfq_vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prfq_institution_scope ON public.procurement_rfqs;
CREATE POLICY prfq_institution_scope ON public.procurement_rfqs
    FOR ALL
    USING (
        institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
        OR public.get_current_user_role() = 'super_admin'
    )
    WITH CHECK (
        institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
        OR public.get_current_user_role() = 'super_admin'
    );

DROP POLICY IF EXISTS prfqi_parent_scope ON public.procurement_rfq_items;
CREATE POLICY prfqi_parent_scope ON public.procurement_rfq_items
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.procurement_rfqs r
                WHERE r.id = procurement_rfq_items.rfq_id
                  AND (r.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
                       OR public.get_current_user_role() = 'super_admin'))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.procurement_rfqs r
                WHERE r.id = procurement_rfq_items.rfq_id
                  AND (r.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
                       OR public.get_current_user_role() = 'super_admin'))
    );

DROP POLICY IF EXISTS prfqv_parent_scope ON public.procurement_rfq_vendors;
CREATE POLICY prfqv_parent_scope ON public.procurement_rfq_vendors
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.procurement_rfqs r
                WHERE r.id = procurement_rfq_vendors.rfq_id
                  AND (r.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
                       OR public.get_current_user_role() = 'super_admin'))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.procurement_rfqs r
                WHERE r.id = procurement_rfq_vendors.rfq_id
                  AND (r.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
                       OR public.get_current_user_role() = 'super_admin'))
    );
