-- Migration: 20260801000300_procurement_purchase_requests
-- Purpose:  Phase 1 of centralized Procurement — the Purchase Request (PRD steps 1-2).
--           PR and "Requisition" are ONE entity across a status lifecycle
--           (draft -> submitted[=requisition] -> approved/rejected -> converted).
--           Item lines are polymorphic: domain_item_id is NULL for a "new item"
--           request (carried by snapshot until reconciled into the domain catalog).
-- RLS:      Unlike the ims_* tables (USING(true), service-layer scoping only), these
--           tables gate spend, so they carry real institution-scoped RLS.
-- Plan:     docs/centralized-store/PLAN-procurement-v1.md §3.1, §5.

-- ---------------------------------------------------------------------------
-- Header
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_purchase_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,
    -- Optional physical store (module-agnostic: no FK to ims_stores).
    store_id UUID,
    request_number TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL DEFAULT 'ims'
        CHECK (domain IN ('ims', 'resource_mgmt')),
    request_type TEXT NOT NULL
        CHECK (request_type IN ('restock', 'new_item')),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'converted', 'cancelled')),
    requested_by UUID NOT NULL REFERENCES public.profiles(id),
    submitted_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppr_institution ON public.procurement_purchase_requests(institution_id);
CREATE INDEX IF NOT EXISTS idx_ppr_status      ON public.procurement_purchase_requests(status);

-- ---------------------------------------------------------------------------
-- Line items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_purchase_request_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.procurement_purchase_requests(id) ON DELETE CASCADE,
    -- Polymorphic item reference: NULL = new-item request (snapshot only).
    domain_item_id UUID,
    item_name TEXT NOT NULL,
    item_spec TEXT,
    required_quantity NUMERIC(12,2) NOT NULL CHECK (required_quantity > 0),
    unit_id UUID,          -- module-agnostic: no FK to ims_units
    unit_label TEXT,
    -- Mandatory for new-item requests (enforced in the service layer, since it's
    -- conditional on the parent row's request_type).
    reason TEXT,
    current_stock NUMERIC(12,2),
    reorder_level NUMERIC(12,2),
    estimated_cost NUMERIC(14,2),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppri_request ON public.procurement_purchase_request_items(request_id);

-- ---------------------------------------------------------------------------
-- RLS — institution-scoped, super_admin bypass (matches new-table convention
-- in the plan, NOT the ims_* USING(true) legacy).
-- ---------------------------------------------------------------------------
ALTER TABLE public.procurement_purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_purchase_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ppr_institution_scope ON public.procurement_purchase_requests;
CREATE POLICY ppr_institution_scope ON public.procurement_purchase_requests
    FOR ALL
    USING (
        institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
        OR public.get_current_user_role() = 'super_admin'
    )
    WITH CHECK (
        institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
        OR public.get_current_user_role() = 'super_admin'
    );

-- Items inherit their parent request's institution via the FK.
DROP POLICY IF EXISTS ppri_parent_scope ON public.procurement_purchase_request_items;
CREATE POLICY ppri_parent_scope ON public.procurement_purchase_request_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.procurement_purchase_requests r
            WHERE r.id = procurement_purchase_request_items.request_id
              AND (
                r.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
                OR public.get_current_user_role() = 'super_admin'
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.procurement_purchase_requests r
            WHERE r.id = procurement_purchase_request_items.request_id
              AND (
                r.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
                OR public.get_current_user_role() = 'super_admin'
              )
        )
    );
