-- Migration: 20260801001500_procurement_po_formats
-- Purpose:  Make the Purchase Order document layout configurable per vendor.
--           A saved "format" defines the header fields, item-table columns,
--           and 3-column footer (Terms & Condition / Enclosure / Special Note)
--           that the PO PDF/DOCX renderers walk to build the document, instead
--           of the previous single hardcoded layout. Mirrors the nameable,
--           JSONB-field-definition style of notification_templates rather than
--           a generic form-builder table.
-- RLS:      institution-scoped, same predicate pattern as procurement_purchase_orders.
-- Plan:     Customizable Purchase Order Document Format.

-- ---------------------------------------------------------------------------
-- procurement_po_formats
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_po_formats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Ordered field-definition JSONB. Every field object shares the shape
    -- { key, label, source, width?, align?, format? }. `source` addresses
    -- where the renderer resolves the runtime value from:
    --   po.<column>          -> ProcurementPurchaseOrder column
    --   supplier.<column>    -> po.supplier.*
    --   header_values.<key>  -> procurement_purchase_orders.header_field_values[key]
    --   footer_values.<key>  -> procurement_purchase_orders.footer_field_values[key]
    --   item.<column>        -> per-item DB column
    --   item_extra.<key>     -> procurement_purchase_order_items.extra_fields[key]
    --   row_index            -> 1-based row number
    header_fields   JSONB NOT NULL DEFAULT '[]'::jsonb,
    item_columns    JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Exactly 3 groups in practice: terms / enclosure / special_note.
    footer_columns  JSONB NOT NULL DEFAULT '[]'::jsonb,

    terms_and_conditions_default TEXT,

    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppf_institution ON public.procurement_po_formats(institution_id);

-- At most one default format per institution.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppf_default_per_institution
    ON public.procurement_po_formats(institution_id)
    WHERE is_default;

CREATE OR REPLACE FUNCTION public.set_updated_at_procurement_po_formats()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ppf_updated_at ON public.procurement_po_formats;
CREATE TRIGGER trg_ppf_updated_at
    BEFORE UPDATE ON public.procurement_po_formats
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_procurement_po_formats();

ALTER TABLE public.procurement_po_formats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ppf_institution_scope ON public.procurement_po_formats;
CREATE POLICY ppf_institution_scope ON public.procurement_po_formats
    FOR ALL
    USING (institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()) OR public.get_current_user_role() = 'super_admin')
    WITH CHECK (institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()) OR public.get_current_user_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- procurement_purchase_orders: format selection + resolved field values
-- ---------------------------------------------------------------------------
ALTER TABLE public.procurement_purchase_orders
    ADD COLUMN IF NOT EXISTS po_format_id        UUID REFERENCES public.procurement_po_formats(id),
    ADD COLUMN IF NOT EXISTS header_field_values  JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS footer_field_values  JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;

COMMENT ON COLUMN public.procurement_purchase_orders.po_format_id IS
    'Selected PO document format (procurement_po_formats). NULL = fall back to the hardcoded standard layout. Changeable per PO while draft.';
COMMENT ON COLUMN public.procurement_purchase_orders.header_field_values IS
    'Resolved values for the active format''s header_values.* fields, e.g. {"quotation_no": "Q-102", "quotation_date": "2026-07-01"}.';
COMMENT ON COLUMN public.procurement_purchase_orders.footer_field_values IS
    'Resolved values for the active format''s footer_values.* fields, e.g. {"delivery": "Immediate", "cheque_no": "NEFT-88213", "bank": "SBI"}.';
COMMENT ON COLUMN public.procurement_purchase_orders.terms_and_conditions IS
    'Free-text terms & conditions for this PO; overrides procurement_po_formats.terms_and_conditions_default when set.';

CREATE INDEX IF NOT EXISTS idx_ppo_po_format ON public.procurement_purchase_orders(po_format_id);

-- ---------------------------------------------------------------------------
-- procurement_purchase_order_items: vendor-specific extra columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.procurement_purchase_order_items
    ADD COLUMN IF NOT EXISTS extra_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.procurement_purchase_order_items.extra_fields IS
    'Per-item values for vendor-specific item_extra.* columns declared on the PO''s format (HSN, GST%, MRP, ISBN, Author, Publisher, Discount%, CGST, SGST, ...).';

-- ---------------------------------------------------------------------------
-- ims_suppliers: default PO format
-- ---------------------------------------------------------------------------
ALTER TABLE public.ims_suppliers
    ADD COLUMN IF NOT EXISTS default_po_format_id UUID REFERENCES public.procurement_po_formats(id);

COMMENT ON COLUMN public.ims_suppliers.default_po_format_id IS
    'Default PO document format pre-selected when a PO is generated/opened for this vendor (procurement).';
