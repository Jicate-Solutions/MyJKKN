-- Migration: 20260801000600_procurement_purchase_orders
-- Purpose:  Phase 4 of centralized Procurement — Purchase Orders (PRD step 7).
--           Generated from awarded quotation lines: ONE PO per awarded vendor.
--           Each PO line carries ordered_quantity + unit_price (from the award)
--           and received_quantity (0 until GRN, Phase 5). Super-Admin approves.
-- RLS:      institution-scoped header; items inherit via the parent PO.
-- Plan:     docs/centralized-store/PLAN-procurement-v1.md §3.3.

-- ---------------------------------------------------------------------------
-- PO header
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,
    store_id UUID,
    po_number TEXT NOT NULL UNIQUE,
    supplier_id UUID NOT NULL REFERENCES public.ims_suppliers(id),
    rfq_id UUID REFERENCES public.procurement_rfqs(id),
    domain TEXT NOT NULL DEFAULT 'ims' CHECK (domain IN ('ims', 'resource_mgmt')),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected',
                          'sent', 'partially_received', 'completed', 'closed', 'cancelled')),
    subtotal NUMERIC(14,2) DEFAULT 0,
    tax_amount NUMERIC(14,2) DEFAULT 0,
    total_amount NUMERIC(14,2) DEFAULT 0,
    payment_terms TEXT,
    expected_delivery_date DATE,
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    pdf_url TEXT,
    created_by UUID REFERENCES public.profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ppo_institution ON public.procurement_purchase_orders(institution_id);
CREATE INDEX IF NOT EXISTS idx_ppo_rfq         ON public.procurement_purchase_orders(rfq_id);
CREATE INDEX IF NOT EXISTS idx_ppo_supplier    ON public.procurement_purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_ppo_status      ON public.procurement_purchase_orders(status);

-- ---------------------------------------------------------------------------
-- PO line items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES public.procurement_purchase_orders(id) ON DELETE CASCADE,
    rfq_item_id UUID REFERENCES public.procurement_rfq_items(id),
    source_quotation_item_id UUID REFERENCES public.procurement_quotation_items(id),
    domain_item_id UUID,
    item_name TEXT NOT NULL,
    item_spec TEXT,
    ordered_quantity NUMERIC(12,2) NOT NULL CHECK (ordered_quantity > 0),
    unit_id UUID,
    unit_label TEXT,
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    -- Running total of accepted goods across GRNs (Phase 5). Drives PO auto-close.
    received_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ppoi_po ON public.procurement_purchase_order_items(po_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.procurement_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ppo_institution_scope ON public.procurement_purchase_orders;
CREATE POLICY ppo_institution_scope ON public.procurement_purchase_orders
    FOR ALL
    USING (institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()) OR public.get_current_user_role() = 'super_admin')
    WITH CHECK (institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()) OR public.get_current_user_role() = 'super_admin');

DROP POLICY IF EXISTS ppoi_parent_scope ON public.procurement_purchase_order_items;
CREATE POLICY ppoi_parent_scope ON public.procurement_purchase_order_items
    FOR ALL
    USING (EXISTS (SELECT 1 FROM public.procurement_purchase_orders p WHERE p.id = procurement_purchase_order_items.po_id AND (p.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()) OR public.get_current_user_role() = 'super_admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.procurement_purchase_orders p WHERE p.id = procurement_purchase_order_items.po_id AND (p.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()) OR public.get_current_user_role() = 'super_admin')));
