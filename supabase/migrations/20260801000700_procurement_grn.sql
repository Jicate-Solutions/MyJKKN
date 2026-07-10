-- Migration: 20260801000700_procurement_grn
-- Purpose:  Phase 5 of centralized Procurement — Goods Receipt Note + three-way
--           match + inventory posting (PRD steps 8-14). A PO-linked GRN records,
--           per line: PO ordered qty, supplier invoice qty, physically received
--           qty, and the accepted/rejected split. On verification, accepted qty is
--           posted into the domain's inventory (via the adapter) and the PO's
--           received_quantity advances; the PO auto-closes when fully received.
-- RLS:      institution-scoped header; children inherit via the parent GRN.
-- Plan:     docs/centralized-store/PLAN-procurement-v1.md §3.4, §4.

-- ---------------------------------------------------------------------------
-- GRN header — multiple GRNs per PO (partial deliveries)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_grn (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,
    store_id UUID,
    grn_number TEXT NOT NULL UNIQUE,
    purchase_order_id UUID NOT NULL REFERENCES public.procurement_purchase_orders(id),
    supplier_id UUID NOT NULL REFERENCES public.ims_suppliers(id),
    domain TEXT NOT NULL DEFAULT 'ims' CHECK (domain IN ('ims', 'resource_mgmt')),
    invoice_number TEXT,
    invoice_date DATE,
    invoice_amount NUMERIC(14,2),
    invoice_document_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending_verification'
        CHECK (status IN ('draft', 'pending_verification', 'partially_accepted',
                          'replacement_requested', 'accepted', 'completed', 'cancelled')),
    received_by UUID NOT NULL REFERENCES public.profiles(id),
    verified_by UUID REFERENCES public.profiles(id),
    verified_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pgrn_institution ON public.procurement_grn(institution_id);
CREATE INDEX IF NOT EXISTS idx_pgrn_po          ON public.procurement_grn(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_pgrn_status      ON public.procurement_grn(status);

-- ---------------------------------------------------------------------------
-- GRN line items — the three-way match record
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_grn_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id UUID NOT NULL REFERENCES public.procurement_grn(id) ON DELETE CASCADE,
    po_item_id UUID NOT NULL REFERENCES public.procurement_purchase_order_items(id),
    domain_item_id UUID,
    item_name TEXT NOT NULL,
    -- The three quantities being reconciled:
    ordered_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,   -- PO snapshot
    invoice_quantity NUMERIC(12,2),                       -- supplier invoice
    received_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,   -- physically received
    accepted_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,   -- passed inspection → inventory
    rejected_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,   -- failed → NOT inventoried
    mismatch_flag BOOLEAN NOT NULL DEFAULT false,
    mismatch_remarks TEXT,
    replacement_required BOOLEAN NOT NULL DEFAULT false,
    rejection_reason TEXT,
    match_status TEXT DEFAULT 'matched'
        CHECK (match_status IN ('matched', 'qty_mismatch', 'short', 'over')),
    -- Batch tracking (mandatory for chemical items at verification):
    batch_number TEXT,
    expiry_date DATE,
    manufacturing_date DATE,
    cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_chemical BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pgrni_grn ON public.procurement_grn_items(grn_id);
CREATE INDEX IF NOT EXISTS idx_pgrni_po_item ON public.procurement_grn_items(po_item_id);

-- ---------------------------------------------------------------------------
-- Replacement tracking — rejected qty awaiting a replacement delivery
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_grn_replacements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_item_id UUID NOT NULL REFERENCES public.procurement_grn_items(id) ON DELETE CASCADE,
    rejected_quantity NUMERIC(12,2) NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received')),
    replacement_grn_item_id UUID REFERENCES public.procurement_grn_items(id),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pgrnr_item ON public.procurement_grn_replacements(grn_item_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.procurement_grn ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_grn_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_grn_replacements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pgrn_institution_scope ON public.procurement_grn;
CREATE POLICY pgrn_institution_scope ON public.procurement_grn
    FOR ALL
    USING (institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()) OR public.get_current_user_role() = 'super_admin')
    WITH CHECK (institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()) OR public.get_current_user_role() = 'super_admin');

DROP POLICY IF EXISTS pgrni_parent_scope ON public.procurement_grn_items;
CREATE POLICY pgrni_parent_scope ON public.procurement_grn_items
    FOR ALL
    USING (EXISTS (SELECT 1 FROM public.procurement_grn g WHERE g.id = procurement_grn_items.grn_id AND (g.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()) OR public.get_current_user_role() = 'super_admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.procurement_grn g WHERE g.id = procurement_grn_items.grn_id AND (g.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()) OR public.get_current_user_role() = 'super_admin')));

DROP POLICY IF EXISTS pgrnr_parent_scope ON public.procurement_grn_replacements;
CREATE POLICY pgrnr_parent_scope ON public.procurement_grn_replacements
    FOR ALL
    USING (EXISTS (SELECT 1 FROM public.procurement_grn_items i JOIN public.procurement_grn g ON g.id = i.grn_id WHERE i.id = procurement_grn_replacements.grn_item_id AND (g.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()) OR public.get_current_user_role() = 'super_admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.procurement_grn_items i JOIN public.procurement_grn g ON g.id = i.grn_id WHERE i.id = procurement_grn_replacements.grn_item_id AND (g.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()) OR public.get_current_user_role() = 'super_admin')));
