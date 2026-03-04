-- ============================================================
-- STEP 1: IMS Base Table Definitions
-- Extracted from: supabase/setup/01_tables.sql
-- Run this FIRST on the staging SQL Editor.
-- All CREATE TABLE IF NOT EXISTS — safe to re-run.
-- ============================================================

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
    code TEXT NOT NULL UNIQUE,
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
    updated_at TIMESTAMPTZ DEFAULT now()
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
CREATE POLICY "Authenticated users can read ims_stores"
    ON public.ims_stores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_stores"
    ON public.ims_stores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_stores"
    ON public.ims_stores FOR UPDATE TO authenticated USING (true);
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
-- END OF TABLE DEFINITIONS
-- =====================================================