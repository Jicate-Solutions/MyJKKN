-- Migration: Port complete IMS base schema from origin/Roja-IMS
-- Date: 2026-05-14
-- Purpose: Provision the 23 missing IMS master/operational tables, indexes, RLS policies,
--          and supply-shipment RPCs/triggers that were never landed on main during the
--          IMS module port (merge commit 460ebca7c, 2026-05-03).
--
-- Source: origin/Roja-IMS at blob fe5f78c9 (supabase/setup/01_tables.sql lines 1898-2941),
--         origin/Roja-IMS supabase/setup/02_functions.sql (IMS RPCs),
--         origin/Roja-IMS supabase/setup/04_triggers.sql (IMS triggers).
--
-- Idempotency: All DDL uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
--              DROP POLICY IF EXISTS, so the existing ims_stores table on main is preserved
--              and the migration is safe to re-run.

-- ============================================================================
-- PART 1: TABLES (from origin/Roja-IMS:supabase/setup/01_tables.sql)
-- ============================================================================

-- =====================================================
-- SECTION: INVENTORY MANAGEMENT SYSTEM (IMS)
-- Updated: 2026-02-17 - Added IMS (Inventory Management System) tables
-- Purpose: Complete inventory management with procurement, stock, indents,
--          sales, and financial tracking for institutional stores
-- Tables: 16 tables prefixed with ims_
-- =====================================================

-- -------------------------------------------------
-- 1. ims_units: Units of measurement (kg, litre, piece, box, etc.)
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    abbreviation TEXT NOT NULL,
    is_base_unit BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ims_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_units"
    ON public.ims_units FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_units"
    ON public.ims_units FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_units"
    ON public.ims_units FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_units"
    ON public.ims_units FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 2. ims_item_categories: Hierarchical item categories (self-referencing)
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_item_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    parent_id UUID REFERENCES public.ims_item_categories(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_item_categories_parent_id ON public.ims_item_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_ims_item_categories_is_active ON public.ims_item_categories(is_active);

ALTER TABLE public.ims_item_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_item_categories"
    ON public.ims_item_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_item_categories"
    ON public.ims_item_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_item_categories"
    ON public.ims_item_categories FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_item_categories"
    ON public.ims_item_categories FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 3. ims_items: Master item catalog with multi-unit support
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Updated: 2026-04-27 - Code is unique per institution, not globally.
    -- Constraint moved to a composite below so two institutions can use the same SKU.
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    company_name TEXT,
    category_id UUID REFERENCES public.ims_item_categories(id),
    item_type TEXT NOT NULL DEFAULT 'consumable'
        CHECK (item_type IN ('consumable', 'equipment', 'medicine', 'stationery', 'other')),
    base_unit_id UUID REFERENCES public.ims_units(id),
    purchase_unit_id UUID REFERENCES public.ims_units(id),
    sale_unit_id UUID REFERENCES public.ims_units(id),
    indent_unit_id UUID REFERENCES public.ims_units(id),
    cost_price NUMERIC(12,2) DEFAULT 0,
    mrp NUMERIC(12,2) DEFAULT 0,
    selling_price NUMERIC(12,2) DEFAULT 0,
    reorder_level INTEGER DEFAULT 0,
    max_stock_level INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    track_batch BOOLEAN DEFAULT false,
    track_expiry BOOLEAN DEFAULT false,
    is_sellable_to_students BOOLEAN DEFAULT false,
    -- Updated: 2026-02-18 - Made nullable for super_admin users without institution assignment
    institution_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT ims_items_institution_code_unique UNIQUE (institution_id, code)
);

CREATE INDEX IF NOT EXISTS idx_ims_items_institution_id ON public.ims_items(institution_id);
CREATE INDEX IF NOT EXISTS idx_ims_items_category_id ON public.ims_items(category_id);
CREATE INDEX IF NOT EXISTS idx_ims_items_item_type ON public.ims_items(item_type);
CREATE INDEX IF NOT EXISTS idx_ims_items_is_active ON public.ims_items(is_active);
CREATE INDEX IF NOT EXISTS idx_ims_items_code ON public.ims_items(code);

ALTER TABLE public.ims_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_items"
    ON public.ims_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_items"
    ON public.ims_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_items"
    ON public.ims_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_items"
    ON public.ims_items FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 4. ims_unit_conversions: Item-specific unit conversion factors
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_unit_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES public.ims_items(id),
    from_unit_id UUID NOT NULL REFERENCES public.ims_units(id),
    to_unit_id UUID NOT NULL REFERENCES public.ims_units(id),
    conversion_factor NUMERIC(10,4) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_unit_conversions_item_id ON public.ims_unit_conversions(item_id);
CREATE INDEX IF NOT EXISTS idx_ims_unit_conversions_from_unit ON public.ims_unit_conversions(from_unit_id);
CREATE INDEX IF NOT EXISTS idx_ims_unit_conversions_to_unit ON public.ims_unit_conversions(to_unit_id);

ALTER TABLE public.ims_unit_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_unit_conversions"
    ON public.ims_unit_conversions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_unit_conversions"
    ON public.ims_unit_conversions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_unit_conversions"
    ON public.ims_unit_conversions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_unit_conversions"
    ON public.ims_unit_conversions FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 5. ims_suppliers: Vendor/supplier master
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    gstin TEXT,
    is_active BOOLEAN DEFAULT true,
    institution_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_suppliers_institution_id ON public.ims_suppliers(institution_id);
CREATE INDEX IF NOT EXISTS idx_ims_suppliers_is_active ON public.ims_suppliers(is_active);

ALTER TABLE public.ims_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_suppliers"
    ON public.ims_suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_suppliers"
    ON public.ims_suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_suppliers"
    ON public.ims_suppliers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_suppliers"
    ON public.ims_suppliers FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 6. ims_stock_summary: Current stock levels per item (one row per item)
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_stock_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.ims_items(id) UNIQUE,
    current_quantity NUMERIC(12,2) DEFAULT 0,
    reserved_quantity NUMERIC(12,2) DEFAULT 0,
    available_quantity NUMERIC(12,2) DEFAULT 0,
    total_value NUMERIC(14,2) DEFAULT 0,
    institution_id UUID,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_stock_summary_item_id ON public.ims_stock_summary(item_id);
CREATE INDEX IF NOT EXISTS idx_ims_stock_summary_institution_id ON public.ims_stock_summary(institution_id);

ALTER TABLE public.ims_stock_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_stock_summary"
    ON public.ims_stock_summary FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_stock_summary"
    ON public.ims_stock_summary FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_stock_summary"
    ON public.ims_stock_summary FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_stock_summary"
    ON public.ims_stock_summary FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 7. ims_goods_received_notes: GRN header (purchase receipts)
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_goods_received_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_number TEXT NOT NULL UNIQUE,
    supplier_id UUID NOT NULL REFERENCES public.ims_suppliers(id),
    invoice_number TEXT,
    invoice_date DATE,
    invoice_amount NUMERIC(14,2),
    status TEXT DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_verification', 'verified', 'approved', 'cancelled')),
    received_by UUID NOT NULL REFERENCES public.profiles(id),
    verified_by UUID REFERENCES public.profiles(id),
    approved_by UUID REFERENCES public.profiles(id),
    notes TEXT,
    institution_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_grn_institution_id ON public.ims_goods_received_notes(institution_id);
CREATE INDEX IF NOT EXISTS idx_ims_grn_supplier_id ON public.ims_goods_received_notes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_ims_grn_status ON public.ims_goods_received_notes(status);
CREATE INDEX IF NOT EXISTS idx_ims_grn_created_at ON public.ims_goods_received_notes(created_at DESC);

ALTER TABLE public.ims_goods_received_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_goods_received_notes"
    ON public.ims_goods_received_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_goods_received_notes"
    ON public.ims_goods_received_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_goods_received_notes"
    ON public.ims_goods_received_notes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_goods_received_notes"
    ON public.ims_goods_received_notes FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 8. ims_stock_batches: Batch-level stock tracking with location
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_stock_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.ims_items(id),
    batch_number TEXT,
    expiry_date DATE,
    quantity NUMERIC(12,2) DEFAULT 0,
    cost_price NUMERIC(12,2) DEFAULT 0,
    total_value NUMERIC(14,2) DEFAULT 0,
    grn_id UUID,
    location_type TEXT DEFAULT 'central_store'
        CHECK (location_type IN ('central_store', 'department')),
    department_id UUID,
    institution_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_stock_batches_item_id ON public.ims_stock_batches(item_id);
CREATE INDEX IF NOT EXISTS idx_ims_stock_batches_institution_id ON public.ims_stock_batches(institution_id);
CREATE INDEX IF NOT EXISTS idx_ims_stock_batches_grn_id ON public.ims_stock_batches(grn_id);
CREATE INDEX IF NOT EXISTS idx_ims_stock_batches_expiry_date ON public.ims_stock_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_ims_stock_batches_location ON public.ims_stock_batches(location_type, department_id);

ALTER TABLE public.ims_stock_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_stock_batches"
    ON public.ims_stock_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_stock_batches"
    ON public.ims_stock_batches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_stock_batches"
    ON public.ims_stock_batches FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_stock_batches"
    ON public.ims_stock_batches FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 9. ims_grn_items: GRN line items (what was received)
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_grn_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id UUID REFERENCES public.ims_goods_received_notes(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.ims_items(id),
    quantity NUMERIC(12,2) NOT NULL,
    unit_id UUID NOT NULL REFERENCES public.ims_units(id),
    cost_price NUMERIC(12,2) NOT NULL,
    total NUMERIC(14,2) NOT NULL,
    batch_number TEXT,
    expiry_date DATE
);

CREATE INDEX IF NOT EXISTS idx_ims_grn_items_grn_id ON public.ims_grn_items(grn_id);
CREATE INDEX IF NOT EXISTS idx_ims_grn_items_item_id ON public.ims_grn_items(item_id);

ALTER TABLE public.ims_grn_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_grn_items"
    ON public.ims_grn_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_grn_items"
    ON public.ims_grn_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_grn_items"
    ON public.ims_grn_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_grn_items"
    ON public.ims_grn_items FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 10. ims_indent_requests: Department material requisitions
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_indent_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    indent_number TEXT NOT NULL UNIQUE,
    department_id UUID NOT NULL REFERENCES public.departments(id),
    requested_by UUID NOT NULL REFERENCES public.profiles(id),
    required_date DATE,
    purpose TEXT NOT NULL,
    urgency TEXT DEFAULT 'normal'
        CHECK (urgency IN ('normal', 'urgent', 'emergency')),
    is_emergency BOOLEAN DEFAULT false,
    emergency_reason TEXT,
    status TEXT DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected',
                          'pending_issue', 'partially_issued', 'issued', 'delivered')),
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    notes TEXT,
    institution_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_indent_requests_institution_id ON public.ims_indent_requests(institution_id);
CREATE INDEX IF NOT EXISTS idx_ims_indent_requests_department_id ON public.ims_indent_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_ims_indent_requests_status ON public.ims_indent_requests(status);
CREATE INDEX IF NOT EXISTS idx_ims_indent_requests_requested_by ON public.ims_indent_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_ims_indent_requests_created_at ON public.ims_indent_requests(created_at DESC);

ALTER TABLE public.ims_indent_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_indent_requests"
    ON public.ims_indent_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_indent_requests"
    ON public.ims_indent_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_indent_requests"
    ON public.ims_indent_requests FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_indent_requests"
    ON public.ims_indent_requests FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 11. ims_indent_request_items: Line items for indent requests
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_indent_request_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    indent_id UUID REFERENCES public.ims_indent_requests(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.ims_items(id),
    quantity NUMERIC(12,2) NOT NULL,
    unit_id UUID NOT NULL REFERENCES public.ims_units(id),
    issued_quantity NUMERIC(12,2) DEFAULT 0,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_ims_indent_items_indent_id ON public.ims_indent_request_items(indent_id);
CREATE INDEX IF NOT EXISTS idx_ims_indent_items_item_id ON public.ims_indent_request_items(item_id);

ALTER TABLE public.ims_indent_request_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_indent_request_items"
    ON public.ims_indent_request_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_indent_request_items"
    ON public.ims_indent_request_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_indent_request_items"
    ON public.ims_indent_request_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_indent_request_items"
    ON public.ims_indent_request_items FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 12. ims_stock_issues: Material issued from store to departments
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_stock_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_number TEXT NOT NULL,
    indent_id UUID REFERENCES public.ims_indent_requests(id),
    item_id UUID NOT NULL REFERENCES public.ims_items(id),
    quantity NUMERIC(12,2) NOT NULL,
    unit_id UUID NOT NULL REFERENCES public.ims_units(id),
    department_id UUID NOT NULL REFERENCES public.departments(id),
    issued_by UUID NOT NULL REFERENCES public.profiles(id),
    received_by UUID REFERENCES public.profiles(id),
    notes TEXT,
    institution_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_stock_issues_institution_id ON public.ims_stock_issues(institution_id);
CREATE INDEX IF NOT EXISTS idx_ims_stock_issues_item_id ON public.ims_stock_issues(item_id);
CREATE INDEX IF NOT EXISTS idx_ims_stock_issues_indent_id ON public.ims_stock_issues(indent_id);
CREATE INDEX IF NOT EXISTS idx_ims_stock_issues_department_id ON public.ims_stock_issues(department_id);
CREATE INDEX IF NOT EXISTS idx_ims_stock_issues_created_at ON public.ims_stock_issues(created_at DESC);

ALTER TABLE public.ims_stock_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_stock_issues"
    ON public.ims_stock_issues FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_stock_issues"
    ON public.ims_stock_issues FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_stock_issues"
    ON public.ims_stock_issues FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_stock_issues"
    ON public.ims_stock_issues FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 13. ims_sales: Point-of-sale transactions with mixed payment
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_number TEXT NOT NULL UNIQUE,
    customer_type TEXT DEFAULT 'walk_in'
        CHECK (customer_type IN ('student', 'staff', 'patient', 'walk_in')),
    customer_name TEXT,
    customer_id UUID,
    payment_method TEXT DEFAULT 'cash'
        CHECK (payment_method IN ('cash', 'gpay', 'card', 'upi_qr', 'mixed')),
    cash_amount NUMERIC(12,2) DEFAULT 0,
    gpay_amount NUMERIC(12,2) DEFAULT 0,
    card_amount NUMERIC(12,2) DEFAULT 0,
    gpay_transaction_id TEXT,
    upi_qr_amount NUMERIC(12,2) DEFAULT 0,
    upi_qr_transaction_ref TEXT,
    subtotal NUMERIC(14,2) DEFAULT 0,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    tax_amount NUMERIC(12,2) DEFAULT 0,
    total_amount NUMERIC(14,2) DEFAULT 0,
    profit_amount NUMERIC(14,2) DEFAULT 0,
    status TEXT DEFAULT 'completed'
        CHECK (status IN ('completed', 'cancelled', 'refunded')),
    cashier_id UUID NOT NULL REFERENCES public.profiles(id),
    cancellation_reason TEXT,
    institution_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_sales_institution_id ON public.ims_sales(institution_id);
CREATE INDEX IF NOT EXISTS idx_ims_sales_status ON public.ims_sales(status);
CREATE INDEX IF NOT EXISTS idx_ims_sales_customer_type ON public.ims_sales(customer_type);
CREATE INDEX IF NOT EXISTS idx_ims_sales_cashier_id ON public.ims_sales(cashier_id);
CREATE INDEX IF NOT EXISTS idx_ims_sales_created_at ON public.ims_sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ims_sales_customer_id ON public.ims_sales(customer_id) WHERE customer_id IS NOT NULL;

ALTER TABLE public.ims_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_sales"
    ON public.ims_sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_sales"
    ON public.ims_sales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_sales"
    ON public.ims_sales FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_sales"
    ON public.ims_sales FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 14. ims_sale_items: Line items for each sale transaction
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES public.ims_sales(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.ims_items(id),
    batch_id UUID REFERENCES public.ims_stock_batches(id),
    quantity NUMERIC(12,2) NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    cost_price NUMERIC(12,2) NOT NULL,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    tax_percent NUMERIC(5,2) DEFAULT 0,
    tax_amount NUMERIC(12,2) DEFAULT 0,
    total NUMERIC(14,2) NOT NULL,
    profit NUMERIC(14,2) DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ims_sale_items_sale_id ON public.ims_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_ims_sale_items_item_id ON public.ims_sale_items(item_id);
CREATE INDEX IF NOT EXISTS idx_ims_sale_items_batch_id ON public.ims_sale_items(batch_id) WHERE batch_id IS NOT NULL;

ALTER TABLE public.ims_sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_sale_items"
    ON public.ims_sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_sale_items"
    ON public.ims_sale_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_sale_items"
    ON public.ims_sale_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_sale_items"
    ON public.ims_sale_items FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 15. ims_financial_transactions: Ledger for all inventory-related money movement
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_financial_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type TEXT NOT NULL
        CHECK (transaction_type IN ('sale', 'purchase', 'issue', 'return', 'adjustment', 'write_off')),
    reference_id UUID,
    reference_type TEXT,
    amount NUMERIC(14,2) NOT NULL,
    description TEXT NOT NULL,
    department_id UUID REFERENCES public.departments(id),
    item_id UUID REFERENCES public.ims_items(id),
    quantity NUMERIC(12,2),
    batch_number TEXT,
    expiry_date DATE,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    institution_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_financial_txn_institution_id ON public.ims_financial_transactions(institution_id);
CREATE INDEX IF NOT EXISTS idx_ims_financial_txn_type ON public.ims_financial_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_ims_financial_txn_item_id ON public.ims_financial_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_ims_financial_txn_created_at ON public.ims_financial_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ims_financial_txn_reference ON public.ims_financial_transactions(reference_type, reference_id);

ALTER TABLE public.ims_financial_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_financial_transactions"
    ON public.ims_financial_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_financial_transactions"
    ON public.ims_financial_transactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_financial_transactions"
    ON public.ims_financial_transactions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_financial_transactions"
    ON public.ims_financial_transactions FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 16. ims_department_consumption: Aggregated department consumption for reporting
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_department_consumption (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES public.departments(id),
    item_id UUID NOT NULL REFERENCES public.ims_items(id),
    quantity NUMERIC(12,2) NOT NULL,
    value NUMERIC(14,2) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    institution_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_dept_consumption_institution_id ON public.ims_department_consumption(institution_id);
CREATE INDEX IF NOT EXISTS idx_ims_dept_consumption_department_id ON public.ims_department_consumption(department_id);
CREATE INDEX IF NOT EXISTS idx_ims_dept_consumption_item_id ON public.ims_department_consumption(item_id);
CREATE INDEX IF NOT EXISTS idx_ims_dept_consumption_period ON public.ims_department_consumption(period_start, period_end);

ALTER TABLE public.ims_department_consumption ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_department_consumption"
    ON public.ims_department_consumption FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_department_consumption"
    ON public.ims_department_consumption FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_department_consumption"
    ON public.ims_department_consumption FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_department_consumption"
    ON public.ims_department_consumption FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 17. ims_stores: IMS Store Registration — each JKKN institution operates as an independent IMS store
-- Updated: 2026-02-18 - Initial creation for dynamic store registration system
-- -------------------------------------------------
-- Updated: 2026-02-21 — Added POS/receipt config columns for multi-store support
CREATE TABLE IF NOT EXISTS public.ims_stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    gstin TEXT,
    upi_vpa TEXT,
    upi_merchant_name TEXT,
    receipt_header TEXT,
    receipt_footer TEXT,
    sale_number_prefix TEXT DEFAULT 'INV',
    manager_id UUID REFERENCES public.profiles(id),
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_stores_institution ON public.ims_stores(institution_id);
CREATE INDEX IF NOT EXISTS idx_ims_stores_active ON public.ims_stores(is_active);

ALTER TABLE public.ims_stores ENABLE ROW LEVEL SECURITY;
-- Idempotency guard: these 4 policies already exist on main from the original
-- 20260218_create_ims_stores_table migration. Drop-and-recreate keeps this
-- migration safe to re-run while preserving the canonical policy bodies.
DROP POLICY IF EXISTS "Authenticated users can read ims_stores" ON public.ims_stores;
CREATE POLICY "Authenticated users can read ims_stores"
    ON public.ims_stores FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert ims_stores" ON public.ims_stores;
CREATE POLICY "Authenticated users can insert ims_stores"
    ON public.ims_stores FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update ims_stores" ON public.ims_stores;
CREATE POLICY "Authenticated users can update ims_stores"
    ON public.ims_stores FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete ims_stores" ON public.ims_stores;
CREATE POLICY "Authenticated users can delete ims_stores"
    ON public.ims_stores FOR DELETE TO authenticated USING (true);

-- -------------------------------------------------
-- 18. ims_upi_qr_payments: UPI QR code payment tracking for POS
-- Added: 2026-02-21
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_upi_qr_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.ims_stores(id) ON DELETE CASCADE,
    transaction_ref TEXT NOT NULL UNIQUE,
    upi_string TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'paid', 'expired', 'failed')),
    sale_id UUID REFERENCES public.ims_sales(id),
    upi_transaction_id TEXT,
    confirmed_by UUID REFERENCES public.profiles(id),
    expires_at TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_upi_qr_payments_store_id ON public.ims_upi_qr_payments(store_id);
CREATE INDEX IF NOT EXISTS idx_ims_upi_qr_payments_status ON public.ims_upi_qr_payments(status);
CREATE INDEX IF NOT EXISTS idx_ims_upi_qr_payments_sale_id ON public.ims_upi_qr_payments(sale_id);

ALTER TABLE public.ims_upi_qr_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_upi_qr_payments"
    ON public.ims_upi_qr_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_upi_qr_payments"
    ON public.ims_upi_qr_payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_upi_qr_payments"
    ON public.ims_upi_qr_payments FOR UPDATE TO authenticated USING (true);

-- =====================================================
-- 19. ims_sale_number_counters: Atomic sale number sequence
-- Updated: 2026-02-24 — Prevents duplicate sale numbers under concurrent usage
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ims_sale_number_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.ims_stores(id) ON DELETE CASCADE,
    counter_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_number INTEGER NOT NULL DEFAULT 0,
    UNIQUE(store_id, counter_date)
);

ALTER TABLE public.ims_sale_number_counters ENABLE ROW LEVEL SECURITY;

-- RPC: atomically increment and return next sale number
CREATE OR REPLACE FUNCTION public.ims_next_sale_number(
    p_store_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next INTEGER;
BEGIN
    INSERT INTO public.ims_sale_number_counters (store_id, counter_date, last_number)
    VALUES (p_store_id, p_date, 1)
    ON CONFLICT (store_id, counter_date)
    DO UPDATE SET last_number = ims_sale_number_counters.last_number + 1
    RETURNING last_number INTO v_next;

    RETURN v_next;
END;
$$;

-- =====================================================
-- 20. ims_shifts: Cashier shift tracking for cash reconciliation
-- Updated: 2026-02-24 — Schema only, no service/hooks/UI yet
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ims_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.ims_stores(id) ON DELETE CASCADE,
    cashier_id UUID NOT NULL REFERENCES public.profiles(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    opening_balance NUMERIC(12,2) DEFAULT 0,
    closing_balance NUMERIC(12,2),
    expected_balance NUMERIC(12,2),
    notes TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'reconciled')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_shifts_store_id ON public.ims_shifts(store_id);
CREATE INDEX IF NOT EXISTS idx_ims_shifts_cashier_id ON public.ims_shifts(cashier_id);
CREATE INDEX IF NOT EXISTS idx_ims_shifts_status ON public.ims_shifts(status);

ALTER TABLE public.ims_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_shifts"
    ON public.ims_shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_shifts"
    ON public.ims_shifts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_shifts"
    ON public.ims_shifts FOR UPDATE TO authenticated USING (true);

-- =====================================================
-- 21. Inter-Institution Supply Distribution
-- Added: 2026-04-15 — Central supply office distributes
--   stationery / housekeeping / etc. to branch institutions.
-- Reuses ims_indent_requests via request_scope flag.
-- Note: RLS stays open per project convention; branch isolation
--   and central-office authorisation enforced in service layer.
-- =====================================================

-- ---- 21.a Extend ims_item_categories with icon + system flag ----
ALTER TABLE public.ims_item_categories
    ADD COLUMN IF NOT EXISTS icon TEXT,
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ims_item_categories_active_sort
    ON public.ims_item_categories(is_active, sort_order);

-- ---- 21.b Extend ims_items with distribution metadata ----
ALTER TABLE public.ims_items
    ADD COLUMN IF NOT EXISTS is_distributable BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_bundle BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS brand TEXT,
    ADD COLUMN IF NOT EXISTS variant_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_ims_items_is_distributable
    ON public.ims_items(is_distributable) WHERE is_distributable = true;
CREATE INDEX IF NOT EXISTS idx_ims_items_brand
    ON public.ims_items(brand) WHERE brand IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ims_items_variant_attributes
    ON public.ims_items USING GIN(variant_attributes);

-- A bundle must be distributable (cleaning kits etc. are by definition shippable)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ims_items_bundle_distributable_check'
    ) THEN
        ALTER TABLE public.ims_items
            ADD CONSTRAINT ims_items_bundle_distributable_check
            CHECK (NOT is_bundle OR is_distributable);
    END IF;
END$$;

-- ---- 21.c Extend ims_stores with central-office flag ----
ALTER TABLE public.ims_stores
    ADD COLUMN IF NOT EXISTS is_central_supply_store BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS requires_local_approval BOOLEAN NOT NULL DEFAULT true;

-- Only one central supply store can exist at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_ims_stores_one_central_supply
    ON public.ims_stores(is_central_supply_store)
    WHERE is_central_supply_store = true;

-- ---- 21.d Extend ims_indent_requests with inter-institution scope ----
ALTER TABLE public.ims_indent_requests
    ADD COLUMN IF NOT EXISTS request_scope TEXT NOT NULL DEFAULT 'internal',
    ADD COLUMN IF NOT EXISTS source_store_id UUID REFERENCES public.ims_stores(id),
    ADD COLUMN IF NOT EXISTS destination_institution_id UUID REFERENCES public.institutions(id),
    ADD COLUMN IF NOT EXISTS destination_store_id UUID REFERENCES public.ims_stores(id),
    ADD COLUMN IF NOT EXISTS local_approved_by UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS local_approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- department_id is required for internal indents but not for inter-institution
-- requests (no specific department, the institution itself is the consumer)
ALTER TABLE public.ims_indent_requests
    ALTER COLUMN department_id DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ims_indent_requests_scope_check'
    ) THEN
        ALTER TABLE public.ims_indent_requests
            ADD CONSTRAINT ims_indent_requests_scope_check
            CHECK (request_scope IN ('internal', 'inter_institution'));
    END IF;
END$$;

-- Replace status CHECK to add new transitions
ALTER TABLE public.ims_indent_requests DROP CONSTRAINT IF EXISTS ims_indent_requests_status_check;
ALTER TABLE public.ims_indent_requests
    ADD CONSTRAINT ims_indent_requests_status_check
    CHECK (status IN (
        'draft',
        'pending_local_approval',
        'pending_approval',
        'approved',
        'rejected',
        'pending_issue',
        'partially_issued',
        'issued',
        'delivered',
        'shipped',
        'received',
        'received_with_variance',
        'cancelled',
        'expired'
    ));

-- Inter-institution requests must have source/destination set
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ims_indent_requests_inter_inst_required_check'
    ) THEN
        ALTER TABLE public.ims_indent_requests
            ADD CONSTRAINT ims_indent_requests_inter_inst_required_check
            CHECK (
                request_scope = 'internal'
                OR (source_store_id IS NOT NULL AND destination_institution_id IS NOT NULL)
            );
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_ims_indent_requests_request_scope
    ON public.ims_indent_requests(request_scope);
CREATE INDEX IF NOT EXISTS idx_ims_indent_requests_source_store
    ON public.ims_indent_requests(source_store_id) WHERE source_store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ims_indent_requests_destination_institution
    ON public.ims_indent_requests(destination_institution_id) WHERE destination_institution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ims_indent_requests_expires_at
    ON public.ims_indent_requests(expires_at) WHERE expires_at IS NOT NULL;

-- ---- 21.e ims_item_bundle_components: bundle composition (e.g., Bathroom Cleaning Kit) ----
CREATE TABLE IF NOT EXISTS public.ims_item_bundle_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_item_id UUID NOT NULL REFERENCES public.ims_items(id) ON DELETE CASCADE,
    component_item_id UUID NOT NULL REFERENCES public.ims_items(id),
    quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
    is_substitutable BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (bundle_item_id, component_item_id),
    CHECK (bundle_item_id <> component_item_id)
);

CREATE INDEX IF NOT EXISTS idx_ims_item_bundle_components_bundle
    ON public.ims_item_bundle_components(bundle_item_id);
CREATE INDEX IF NOT EXISTS idx_ims_item_bundle_components_component
    ON public.ims_item_bundle_components(component_item_id);

ALTER TABLE public.ims_item_bundle_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_item_bundle_components"
    ON public.ims_item_bundle_components FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_item_bundle_components"
    ON public.ims_item_bundle_components FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_item_bundle_components"
    ON public.ims_item_bundle_components FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_item_bundle_components"
    ON public.ims_item_bundle_components FOR DELETE TO authenticated USING (true);

-- ---- 21.f ims_supply_shipments: dispatch from main office to branch institution ----
CREATE TABLE IF NOT EXISTS public.ims_supply_shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_no TEXT NOT NULL UNIQUE,
    request_id UUID NOT NULL REFERENCES public.ims_indent_requests(id),
    source_store_id UUID NOT NULL REFERENCES public.ims_stores(id),
    destination_institution_id UUID NOT NULL REFERENCES public.institutions(id),
    destination_store_id UUID REFERENCES public.ims_stores(id),
    dispatched_at TIMESTAMPTZ,
    dispatched_by UUID REFERENCES public.profiles(id),
    vehicle_no TEXT,
    courier_name TEXT,
    driver_name TEXT,
    driver_contact TEXT,
    expected_arrival DATE,
    received_at TIMESTAMPTZ,
    received_by UUID REFERENCES public.profiles(id),
    receipt_notes TEXT,
    status TEXT NOT NULL DEFAULT 'preparing'
        CHECK (status IN ('preparing', 'dispatched', 'received', 'received_with_variance', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_supply_shipments_request
    ON public.ims_supply_shipments(request_id);
CREATE INDEX IF NOT EXISTS idx_ims_supply_shipments_source_store
    ON public.ims_supply_shipments(source_store_id);
CREATE INDEX IF NOT EXISTS idx_ims_supply_shipments_destination_inst
    ON public.ims_supply_shipments(destination_institution_id);
CREATE INDEX IF NOT EXISTS idx_ims_supply_shipments_status
    ON public.ims_supply_shipments(status);
-- Partial index supports the "stock in transit" report
CREATE INDEX IF NOT EXISTS idx_ims_supply_shipments_in_transit
    ON public.ims_supply_shipments(dispatched_at)
    WHERE dispatched_at IS NOT NULL AND received_at IS NULL;

ALTER TABLE public.ims_supply_shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_supply_shipments"
    ON public.ims_supply_shipments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_supply_shipments"
    ON public.ims_supply_shipments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_supply_shipments"
    ON public.ims_supply_shipments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_supply_shipments"
    ON public.ims_supply_shipments FOR DELETE TO authenticated USING (true);

-- ---- 21.g ims_supply_shipment_items: line items inside a shipment ----
-- For bundles, expand_bundle_to_components() inserts one row per component
-- so stock movement and chain-of-custody are tracked at the atomic item level.
CREATE TABLE IF NOT EXISTS public.ims_supply_shipment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID NOT NULL REFERENCES public.ims_supply_shipments(id) ON DELETE CASCADE,
    request_item_id UUID NOT NULL REFERENCES public.ims_indent_request_items(id),
    item_id UUID NOT NULL REFERENCES public.ims_items(id),
    source_batch_id UUID REFERENCES public.ims_stock_batches(id),
    -- Bundle traceability: if this row was generated from a bundle expansion,
    -- the original bundle item is recorded so the receipt UI can group components
    bundle_parent_item_id UUID REFERENCES public.ims_items(id),
    dispatched_qty NUMERIC(12,2) NOT NULL CHECK (dispatched_qty > 0),
    received_qty NUMERIC(12,2),
    variance_qty NUMERIC(12,2) GENERATED ALWAYS AS (COALESCE(received_qty, 0) - dispatched_qty) STORED,
    variance_reason TEXT,
    cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_supply_shipment_items_shipment
    ON public.ims_supply_shipment_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_ims_supply_shipment_items_item
    ON public.ims_supply_shipment_items(item_id);
CREATE INDEX IF NOT EXISTS idx_ims_supply_shipment_items_bundle_parent
    ON public.ims_supply_shipment_items(bundle_parent_item_id)
    WHERE bundle_parent_item_id IS NOT NULL;

ALTER TABLE public.ims_supply_shipment_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_supply_shipment_items"
    ON public.ims_supply_shipment_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_supply_shipment_items"
    ON public.ims_supply_shipment_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_supply_shipment_items"
    ON public.ims_supply_shipment_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_supply_shipment_items"
    ON public.ims_supply_shipment_items FOR DELETE TO authenticated USING (true);

-- =====================================================
-- 22. Pre-seeded JKKN Supply Category Taxonomy
-- Added: 2026-04-15 — Two-level hierarchy for distribution catalog.
-- Idempotent via ON CONFLICT (code).
-- =====================================================

-- Parents (8)
INSERT INTO public.ims_item_categories (code, name, description, parent_id, icon, sort_order, is_system, is_active)
VALUES
    ('SUP-STAT',  'Stationery',     'Pens, paper, desk tools, filing supplies',                NULL, 'pencil',          10, true, true),
    ('SUP-HKP',   'Housekeeping',   'Cleaning supplies, tools, kits, bathroom supplies',       NULL, 'spray-can',       20, true, true),
    ('SUP-FUR',   'Furniture',      'Seating, tables, storage units',                          NULL, 'armchair',        30, true, true),
    ('SUP-ELEC',  'Electrical',     'Lighting, fans, cables and plugs',                        NULL, 'lightbulb',       40, true, true),
    ('SUP-IT',    'IT Peripherals', 'Cables, accessories, storage media',                      NULL, 'cable',           50, true, true),
    ('SUP-PRT',   'Printing',       'Toner, ink, printer paper, spare parts',                  NULL, 'printer',         60, true, true),
    ('SUP-PNT',   'Pantry',         'Disposables, beverages, event-day snacks',                NULL, 'coffee',          70, true, true),
    ('SUP-SAF',   'Safety',         'First aid, PPE, fire safety supplies',                    NULL, 'shield-check',    80, true, true)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order,
    is_system = true;

-- Sub-categories (~30) — resolve parent_id by code lookup
INSERT INTO public.ims_item_categories (code, name, description, parent_id, icon, sort_order, is_system, is_active)
SELECT v.code, v.name, v.description, p.id, v.icon, v.sort_order, true, true
FROM (VALUES
    -- Stationery
    ('SUP-STAT-WRT',  'Writing',         'Pens, pencils, markers, erasers, sharpeners',  'SUP-STAT',  'pen-tool',     10),
    ('SUP-STAT-PPR',  'Paper',           'A4 sheets, notebooks, registers, sticky notes','SUP-STAT',  'file-text',    20),
    ('SUP-STAT-DSK',  'Desk Tools',      'Stapler, punch, scissors, tape dispenser',     'SUP-STAT',  'scissors',     30),
    ('SUP-STAT-FIL',  'Filing',          'File folders, lever arch, document covers',    'SUP-STAT',  'folder',       40),
    -- Housekeeping
    ('SUP-HKP-CLN',   'Cleaning Supplies','Phenyl, detergent, hand wash, bleach',         'SUP-HKP',   'droplet',      10),
    ('SUP-HKP-TOL',   'Cleaning Tools',  'Broom, mop, bucket, scrub, dustbin',           'SUP-HKP',   'wrench',       20),
    ('SUP-HKP-KIT',   'Cleaning Kits',   'Bathroom / room / lab cleaning bundles',       'SUP-HKP',   'package',      30),
    ('SUP-HKP-BTH',   'Bathroom Supplies','Toilet paper, tissue, air freshener, sanitiser','SUP-HKP',  'shower-head',  40),
    -- Furniture
    ('SUP-FUR-SEA',   'Seating',         'Plastic / executive / visitor chairs, stools', 'SUP-FUR',   'armchair',     10),
    ('SUP-FUR-TBL',   'Tables',          'Desks, conference tables, side tables',        'SUP-FUR',   'square',       20),
    ('SUP-FUR-STG',   'Storage',         'Almirah, filing cabinets, racks',              'SUP-FUR',   'archive',      30),
    -- Electrical
    ('SUP-ELEC-LGT',  'Lighting',        'LED bulbs, tube lights, table lamps',          'SUP-ELEC',  'lightbulb',    10),
    ('SUP-ELEC-FAN',  'Fans',            'Ceiling, table, exhaust fans',                 'SUP-ELEC',  'fan',          20),
    ('SUP-ELEC-CAB',  'Cables & Plugs',  'Extension cords, multi-plugs, adaptors',       'SUP-ELEC',  'plug',         30),
    -- IT Peripherals
    ('SUP-IT-CAB',    'Cables',          'HDMI, USB, LAN, power cables',                 'SUP-IT',    'cable',        10),
    ('SUP-IT-ACC',    'Accessories',     'Mouse, keyboard, USB drives',                  'SUP-IT',    'mouse',        20),
    ('SUP-IT-STR',    'Storage Media',   'DVD, external HDD, SD cards',                  'SUP-IT',    'hard-drive',   30),
    -- Printing
    ('SUP-PRT-INK',   'Toner & Ink',     'Laser toner, inkjet cartridges',               'SUP-PRT',   'droplets',     10),
    ('SUP-PRT-PPR',   'Printer Paper',   'A3, A4, legal, photo paper',                   'SUP-PRT',   'file',         20),
    ('SUP-PRT-SPR',   'Spare Parts',     'Drum, fuser, rollers',                         'SUP-PRT',   'cog',          30),
    -- Pantry
    ('SUP-PNT-DSP',   'Disposables',     'Paper cups, plates, spoons',                   'SUP-PNT',   'cup-soda',     10),
    ('SUP-PNT-BEV',   'Beverages',       'Tea, coffee, sugar',                           'SUP-PNT',   'coffee',       20),
    ('SUP-PNT-SNK',   'Snacks',          'Biscuits, water bottles for events',           'SUP-PNT',   'cookie',       30),
    -- Safety
    ('SUP-SAF-FAID',  'First Aid',       'Bandages, antiseptic, cotton, basic medicines','SUP-SAF',   'heart-pulse',  10),
    ('SUP-SAF-PPE',   'PPE',             'Gloves, masks, hand sanitiser',                'SUP-SAF',   'hand',         20),
    ('SUP-SAF-FIRE',  'Fire Safety',     'Extinguisher refills, smoke alarm batteries',  'SUP-SAF',   'flame',        30)
) AS v(code, name, description, parent_code, icon, sort_order)
JOIN public.ims_item_categories p ON p.code = v.parent_code
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    parent_id = EXCLUDED.parent_id,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order,
    is_system = true;

-- =====================================================
-- IMS Supply Distribution Events (Phase C audit trail)
-- Append-only log of inter-institution supply distribution
-- state transitions. Powers in-app activity feeds.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ims_supply_distribution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'request_submitted',
      'request_local_approved',
      'request_local_rejected',
      'request_central_approved',
      'request_central_rejected',
      'request_cancelled',
      'shipment_created',
      'shipment_dispatched',
      'shipment_received',
      'shipment_received_with_variance',
      'shipment_cancelled'
    )),
  request_id UUID REFERENCES public.ims_indent_requests(id) ON DELETE CASCADE,
  shipment_id UUID REFERENCES public.ims_supply_shipments(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id),
  actor_name TEXT,
  summary TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_supply_events_request
  ON public.ims_supply_distribution_events(request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ims_supply_events_shipment
  ON public.ims_supply_distribution_events(shipment_id, created_at DESC)
  WHERE shipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ims_supply_events_actor
  ON public.ims_supply_distribution_events(actor_id, created_at DESC);

ALTER TABLE public.ims_supply_distribution_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read supply events"
  ON public.ims_supply_distribution_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert supply events"
  ON public.ims_supply_distribution_events FOR INSERT TO authenticated WITH CHECK (true);

-- =====================================================
-- END OF TABLE DEFINITIONS

-- ============================================================================
-- PART 2: SUPPLY-SHIPMENT RPCS (from origin/Roja-IMS:supabase/setup/02_functions.sql)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ims_validate_distributable_items(p_item_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_offending TEXT;
BEGIN
    SELECT string_agg(name, ', ')
    INTO v_offending
    FROM public.ims_items
    WHERE id = ANY(p_item_ids) AND is_distributable = false;

    IF v_offending IS NOT NULL THEN
        RAISE EXCEPTION 'Items not distributable from central supply: %', v_offending
            USING ERRCODE = 'check_violation';
    END IF;
END;
$$;

-- Expand a bundle item into its component (item_id, total_qty) pairs.
-- Used during shipment preparation so that requesting "1 Bathroom Cleaning Kit"
-- yields one shipment row per component, with stock movement at the atomic level.
CREATE OR REPLACE FUNCTION public.ims_expand_bundle_to_components(
    p_bundle_item_id UUID,
    p_qty NUMERIC
)
RETURNS TABLE (component_item_id UUID, total_qty NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT c.component_item_id, (c.quantity * p_qty)::NUMERIC AS total_qty
    FROM public.ims_item_bundle_components c
    WHERE c.bundle_item_id = p_bundle_item_id;
$$;

-- On shipment receipt, materialise stock at the destination store as
-- new ims_stock_batches rows with batch numbers SHP-<reqNo>-<short shipment id>-<line>.
-- cost_price and expiry_date are inherited from the source batch (via the
-- shipment item's source_batch_id) so valuation and shelf-life are preserved.
-- Note: the destination institution_id is used for the batch row.
CREATE OR REPLACE FUNCTION public.ims_create_branch_batches_from_shipment(p_shipment_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request_no TEXT;
    v_dest_inst UUID;
    v_ship_suffix TEXT;
    v_count INTEGER := 0;
    v_line INTEGER := 0;
    r RECORD;
BEGIN
    SELECT ir.indent_number, s.destination_institution_id
    INTO v_request_no, v_dest_inst
    FROM public.ims_supply_shipments s
    JOIN public.ims_indent_requests ir ON ir.id = s.request_id
    WHERE s.id = p_shipment_id;

    IF v_request_no IS NULL THEN
        RAISE EXCEPTION 'Shipment % not found', p_shipment_id;
    END IF;

    -- Short shipment discriminator prevents batch_number collisions across
    -- split shipments that share a request (addresses DB-H1 from audit).
    v_ship_suffix := substr(p_shipment_id::text, 1, 6);

    FOR r IN
        SELECT
            si.id,
            si.item_id,
            COALESCE(si.received_qty, 0) AS qty,
            si.cost_price,
            sb.expiry_date AS source_expiry
        FROM public.ims_supply_shipment_items si
        LEFT JOIN public.ims_stock_batches sb ON sb.id = si.source_batch_id
        WHERE si.shipment_id = p_shipment_id
        ORDER BY si.created_at
    LOOP
        v_line := v_line + 1;
        IF r.qty <= 0 THEN
            CONTINUE;  -- nothing physically received for this line
        END IF;

        INSERT INTO public.ims_stock_batches (
            item_id,
            batch_number,
            expiry_date,
            quantity,
            cost_price,
            total_value,
            location_type,
            grn_id,
            institution_id
        )
        VALUES (
            r.item_id,
            'SHP-' || v_request_no || '-' || v_ship_suffix || '-' || LPAD(v_line::TEXT, 2, '0'),
            r.source_expiry,
            r.qty,
            r.cost_price,
            (r.qty * COALESCE(r.cost_price, 0))::NUMERIC(14,2),
            'central_store',  -- arrives at the branch's central store; can be moved later
            NULL,
            v_dest_inst
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- Atomic receipt confirmation.
-- Takes a JSONB array of {shipment_item_id, received_qty, variance_reason} and
-- guarantees: (1) all line qty updates + shipment status flip land in ONE transaction,
-- (2) concurrent receipts are serialized via SELECT FOR UPDATE on the parent,
-- (3) lines NOT present in the payload default received_qty=0 with an auto-variance reason,
-- (4) status flip is guarded on OLD.status='dispatched' so a second caller silently no-ops.
-- Addresses audit findings svc-C1 (missing-line corruption) and svc-C2 (partial-write race).
CREATE OR REPLACE FUNCTION public.ims_confirm_supply_receipt(
    p_shipment_id UUID,
    p_received_by UUID,
    p_receipt_notes TEXT,
    p_lines JSONB  -- [{shipment_item_id:uuid, received_qty:numeric, variance_reason:text|null}, ...]
)
RETURNS TABLE (
    shipment_id UUID,
    final_status TEXT,
    updated_lines INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_status TEXT;
    v_updated INTEGER := 0;
    v_has_variance BOOLEAN := false;
    v_new_status TEXT;
BEGIN
    -- Lock the parent shipment; anyone else calling concurrently waits here.
    SELECT status INTO v_current_status
    FROM public.ims_supply_shipments
    WHERE id = p_shipment_id
    FOR UPDATE;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Shipment % not found', p_shipment_id;
    END IF;
    IF v_current_status <> 'dispatched' THEN
        RAISE EXCEPTION 'Shipment % cannot be received: status is %', p_shipment_id, v_current_status
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Update each line. LEFT JOIN so lines NOT in payload still get updated (to 0).
    WITH payload AS (
        SELECT
            (elem->>'shipment_item_id')::UUID AS shipment_item_id,
            COALESCE((elem->>'received_qty')::NUMERIC, 0) AS received_qty,
            elem->>'variance_reason' AS variance_reason
        FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS elem
    ),
    updated AS (
        UPDATE public.ims_supply_shipment_items si
        SET received_qty = COALESCE(p.received_qty, 0),
            variance_reason = CASE
                WHEN p.shipment_item_id IS NULL
                  THEN 'Missing from receipt confirmation (auto-marked 0)'
                WHEN NULLIF(trim(p.variance_reason), '') IS NOT NULL
                  THEN p.variance_reason
                ELSE NULL
            END
        FROM (
            SELECT si2.id AS shipment_item_id
            FROM public.ims_supply_shipment_items si2
            WHERE si2.shipment_id = p_shipment_id
            FOR UPDATE
        ) AS lines
        LEFT JOIN payload p ON p.shipment_item_id = lines.shipment_item_id
        WHERE si.id = lines.shipment_item_id
        RETURNING si.id, si.received_qty, si.dispatched_qty
    )
    SELECT COUNT(*)::INTEGER, bool_or(received_qty <> dispatched_qty)
    INTO v_updated, v_has_variance
    FROM updated;

    v_new_status := CASE WHEN v_has_variance THEN 'received_with_variance' ELSE 'received' END;

    UPDATE public.ims_supply_shipments
    SET status = v_new_status,
        received_at = now(),
        received_by = p_received_by,
        receipt_notes = p_receipt_notes,
        updated_at = now()
    WHERE id = p_shipment_id
      AND status = 'dispatched';  -- redundant with the lock, kept for defensiveness

    -- Return result. The AFTER UPDATE trigger ims_apply_shipment_to_stock fires
    -- on the status change and handles destination-batch materialisation + parent
    -- request status transition, so the caller does not need to do either.
    RETURN QUERY SELECT p_shipment_id, v_new_status, v_updated;
END;
$$;

-- Cron-callable: mark approved-but-untouched inter-institution requests as expired.
-- Triggers the release-reservation flow via the status-change trigger.
CREATE OR REPLACE FUNCTION public.ims_expire_stale_supply_requests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.ims_indent_requests
    SET status = 'expired', updated_at = now()
    WHERE request_scope = 'inter_institution'
      AND status = 'approved'
      AND expires_at IS NOT NULL
      AND expires_at < now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------
-- Trigger functions for stock reservation lifecycle
-- ----------------------------------------------------------------

-- DESIGN NOTE (2026-04-15):
-- ims_stock_summary is keyed UNIQUE(item_id) — stock is tracked as item-global
-- per the current schema. These triggers operate on that single row.
-- Physical per-location tracking lives in ims_stock_batches (location_type,
-- department_id, institution_id). A future migration may add store_id to
-- ims_stock_summary for per-store buckets; that is intentionally out of
-- scope for Phase B.

-- T2.1 — Reserve stock on supply approval, with bundle expansion.
-- For each line item: if ims_items.is_bundle = true, reserve the expanded
-- components (via ims_expand_bundle_to_components); otherwise reserve the
-- line's own item_id. Preserves the inter_institution scope guard and the
-- approved-transition guard, and keeps the 7-day expires_at default.
CREATE OR REPLACE FUNCTION public.ims_reserve_stock_on_supply_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    ri RECORD;
    comp RECORD;
BEGIN
    IF COALESCE(NEW.request_scope, '') <> 'inter_institution' THEN
        RETURN NEW;
    END IF;

    IF NEW.status <> 'approved' OR OLD.status IS NOT DISTINCT FROM 'approved' THEN
        RETURN NEW;
    END IF;

    -- Default 7-day expiry if not set
    IF NEW.expires_at IS NULL THEN
        NEW.expires_at := now() + INTERVAL '7 days';
    END IF;

    FOR ri IN
        SELECT iri.item_id, iri.quantity, COALESCE(ii.is_bundle, false) AS is_bundle
        FROM public.ims_indent_request_items iri
        JOIN public.ims_items ii ON ii.id = iri.item_id
        WHERE iri.indent_id = NEW.id
    LOOP
        IF ri.is_bundle THEN
            FOR comp IN
                SELECT component_item_id, total_qty
                FROM public.ims_expand_bundle_to_components(ri.item_id, ri.quantity)
            LOOP
                UPDATE public.ims_stock_summary
                SET reserved_quantity = COALESCE(reserved_quantity, 0) + comp.total_qty,
                    updated_at = now()
                WHERE item_id = comp.component_item_id;
            END LOOP;
        ELSE
            UPDATE public.ims_stock_summary
            SET reserved_quantity = COALESCE(reserved_quantity, 0) + ri.quantity,
                updated_at = now()
            WHERE item_id = ri.item_id;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

-- T2.1 — Release reserved stock when an approved inter-institution request
-- moves to rejected/cancelled/expired. Mirrors the bundle-expansion logic
-- from the reserve trigger. Uses GREATEST(0, ...) to avoid negatives if a
-- reservation was manually reconciled elsewhere.
CREATE OR REPLACE FUNCTION public.ims_release_reserved_stock_on_terminal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    ri RECORD;
    comp RECORD;
BEGIN
    IF COALESCE(NEW.request_scope, '') <> 'inter_institution' THEN
        RETURN NEW;
    END IF;

    IF OLD.status <> 'approved' THEN
        RETURN NEW;
    END IF;

    IF NEW.status NOT IN ('rejected', 'cancelled', 'expired') THEN
        RETURN NEW;
    END IF;

    FOR ri IN
        SELECT iri.item_id, iri.quantity, COALESCE(ii.is_bundle, false) AS is_bundle
        FROM public.ims_indent_request_items iri
        JOIN public.ims_items ii ON ii.id = iri.item_id
        WHERE iri.indent_id = NEW.id
    LOOP
        IF ri.is_bundle THEN
            FOR comp IN
                SELECT component_item_id, total_qty
                FROM public.ims_expand_bundle_to_components(ri.item_id, ri.quantity)
            LOOP
                UPDATE public.ims_stock_summary
                SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity, 0) - comp.total_qty),
                    updated_at = now()
                WHERE item_id = comp.component_item_id;
            END LOOP;
        ELSE
            UPDATE public.ims_stock_summary
            SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity, 0) - ri.quantity),
                updated_at = now()
            WHERE item_id = ri.item_id;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

-- T2.5 — Shipment state-machine guard.
-- Allowed transitions on ims_supply_shipments.status:
--   preparing  -> dispatched | cancelled
--   dispatched -> received | received_with_variance | cancelled
--   received | received_with_variance | cancelled are TERMINAL.
-- Same-value updates (vehicle_no, driver edits without status change) pass.
CREATE OR REPLACE FUNCTION public.ims_validate_shipment_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF OLD.status IN ('received', 'received_with_variance', 'cancelled') THEN
        RAISE EXCEPTION
            'Invalid shipment status transition: % -> % (shipment is in a terminal state)',
            OLD.status, NEW.status
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF OLD.status = 'preparing'
       AND NEW.status IN ('dispatched', 'cancelled') THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'dispatched'
       AND NEW.status IN ('received', 'received_with_variance', 'cancelled') THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION
        'Invalid shipment status transition: % -> %',
        OLD.status, NEW.status
        USING ERRCODE = 'invalid_parameter_value';
END;
$$;

-- T2.6 — Bundle-has-components validator.
-- Raises if any id in the array refers to a bundle item with zero component
-- rows in ims_item_bundle_components. Called from the service layer in
-- createShipment before the insert to fail fast on empty bundles.
CREATE OR REPLACE FUNCTION public.ims_validate_bundle_has_components(p_bundle_item_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_offenders UUID[];
BEGIN
    IF p_bundle_item_ids IS NULL OR array_length(p_bundle_item_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(array_agg(ii.id), ARRAY[]::UUID[])
    INTO v_offenders
    FROM public.ims_items ii
    WHERE ii.id = ANY(p_bundle_item_ids)
      AND ii.is_bundle = true
      AND NOT EXISTS (
          SELECT 1 FROM public.ims_item_bundle_components ibc
          WHERE ibc.bundle_item_id = ii.id
      );

    IF array_length(v_offenders, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'Bundle(s) have no components defined: %',
            array_to_string(v_offenders, ', ')
            USING ERRCODE = 'check_violation';
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ims_validate_bundle_has_components(UUID[]) TO authenticated;

-- On shipment dispatch: deduct current stock at source AND release reservation.
-- On shipment receipt: materialise destination batches via helper.
CREATE OR REPLACE FUNCTION public.ims_apply_shipment_to_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Dispatch: source stock leaves the building
    IF NEW.status = 'dispatched' AND OLD.status IS DISTINCT FROM 'dispatched' THEN
        UPDATE public.ims_stock_summary ss
        SET current_quantity = GREATEST(0, COALESCE(ss.current_quantity, 0) - si.dispatched_qty),
            reserved_quantity = GREATEST(0, COALESCE(ss.reserved_quantity, 0) - si.dispatched_qty),
            updated_at = now()
        FROM public.ims_supply_shipment_items si
        WHERE si.shipment_id = NEW.id
          AND ss.item_id = si.item_id;

        -- Mark the parent request as shipped
        UPDATE public.ims_indent_requests
        SET status = 'shipped', updated_at = now()
        WHERE id = NEW.request_id AND status = 'approved';
    END IF;

    -- Receipt: materialise stock at destination
    IF NEW.status IN ('received', 'received_with_variance')
       AND OLD.status NOT IN ('received', 'received_with_variance')
    THEN
        PERFORM public.ims_create_branch_batches_from_shipment(NEW.id);

        UPDATE public.ims_indent_requests
        SET status = CASE WHEN NEW.status = 'received_with_variance'
                          THEN 'received_with_variance'
                          ELSE 'received'
                     END,
            updated_at = now()
        WHERE id = NEW.request_id;
    END IF;

    RETURN NEW;
END;
$$;

-- =====================================================
-- ims_log_supply_event: append-only audit logger for
-- inter-institution supply distribution state changes.
-- Called from ImsSupplyDistributionService after each
-- successful mutation. SECURITY DEFINER so any
-- authenticated actor can write audit rows regardless of
-- their direct INSERT privileges on the events table.
-- =====================================================
CREATE OR REPLACE FUNCTION public.ims_log_supply_event(
  p_event_type TEXT,
  p_request_id UUID,
  p_shipment_id UUID,
  p_actor_id UUID,
  p_summary TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_name TEXT;
  v_id UUID;
BEGIN
  SELECT full_name INTO v_actor_name
  FROM public.profiles
  WHERE id = p_actor_id;

  INSERT INTO public.ims_supply_distribution_events(
    event_type, request_id, shipment_id, actor_id, actor_name, summary, metadata
  )
  VALUES (
    p_event_type, p_request_id, p_shipment_id, p_actor_id, v_actor_name, p_summary, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ims_log_supply_event(TEXT, UUID, UUID, UUID, TEXT, JSONB) TO authenticated;

-- ============================================================================
-- PART 3: TRIGGERS (from origin/Roja-IMS:supabase/setup/04_triggers.sql)
-- ============================================================================

-- ================================================================================
-- IMS — INTER-INSTITUTION SUPPLY DISTRIBUTION TRIGGERS
-- Added: 2026-04-15
-- ================================================================================

-- updated_at maintenance for new tables
DROP TRIGGER IF EXISTS update_ims_supply_shipments_updated_at ON public.ims_supply_shipments;
CREATE TRIGGER update_ims_supply_shipments_updated_at
    BEFORE UPDATE ON public.ims_supply_shipments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Reserve stock at source store when an inter-institution request is approved.
-- Uses BEFORE so the trigger function can also stamp expires_at on NEW.
DROP TRIGGER IF EXISTS trg_ims_reserve_stock_on_supply_approval ON public.ims_indent_requests;
CREATE TRIGGER trg_ims_reserve_stock_on_supply_approval
    BEFORE UPDATE OF status ON public.ims_indent_requests
    FOR EACH ROW
    WHEN (NEW.request_scope = 'inter_institution')
    EXECUTE FUNCTION public.ims_reserve_stock_on_supply_approval();

-- Release reserved stock when an approved request moves to a non-shipped terminal state.
DROP TRIGGER IF EXISTS trg_ims_release_reserved_stock_on_terminal ON public.ims_indent_requests;
CREATE TRIGGER trg_ims_release_reserved_stock_on_terminal
    AFTER UPDATE OF status ON public.ims_indent_requests
    FOR EACH ROW
    WHEN (NEW.request_scope = 'inter_institution'
          AND NEW.status IN ('rejected', 'cancelled', 'expired'))
    EXECUTE FUNCTION public.ims_release_reserved_stock_on_terminal();

-- Apply shipment status changes to stock and parent request status.
DROP TRIGGER IF EXISTS trg_ims_apply_shipment_to_stock ON public.ims_supply_shipments;
CREATE TRIGGER trg_ims_apply_shipment_to_stock
    AFTER UPDATE OF status ON public.ims_supply_shipments
    FOR EACH ROW
    EXECUTE FUNCTION public.ims_apply_shipment_to_stock();

COMMENT ON TRIGGER trg_ims_apply_shipment_to_stock ON public.ims_supply_shipments IS
'Dispatch: deducts current+reserved at source. Receipt: creates destination batches and updates parent request status.';

-- T2.5 — Shipment state-machine guard (Phase B). Fires BEFORE updated_at so
-- invalid transitions abort cleanly without partial updates.
DROP TRIGGER IF EXISTS trg_ims_validate_shipment_transition ON public.ims_supply_shipments;
CREATE TRIGGER trg_ims_validate_shipment_transition
    BEFORE UPDATE OF status ON public.ims_supply_shipments
    FOR EACH ROW
    EXECUTE FUNCTION public.ims_validate_shipment_transition();

-- ================================================================================
-- End of Triggers File
-- Total Triggers: 81 (Updated: 2026-04-15 — added 4 IMS supply distribution triggers)
-- ================================================================================
-- Refresh PostgREST schema cache so new tables & FKs become queryable immediately
NOTIFY pgrst, 'reload schema';
