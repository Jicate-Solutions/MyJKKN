-- Migration: Add store_id to all IMS tables + extend ims_stores with POS/receipt settings
-- Date: 2026-02-21
-- Purpose: Enable multi-store per institution, store-scoped catalogs, and receipt configuration
-- Breaking the 1:1 institution-to-store mapping to support multiple stores per institution.

-- =====================================================
-- 1A. Extend ims_stores with POS/receipt configuration
-- =====================================================
ALTER TABLE public.ims_stores ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.ims_stores ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.ims_stores ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE public.ims_stores ADD COLUMN IF NOT EXISTS upi_vpa TEXT;
ALTER TABLE public.ims_stores ADD COLUMN IF NOT EXISTS upi_merchant_name TEXT;
ALTER TABLE public.ims_stores ADD COLUMN IF NOT EXISTS receipt_header TEXT;
ALTER TABLE public.ims_stores ADD COLUMN IF NOT EXISTS receipt_footer TEXT;
ALTER TABLE public.ims_stores ADD COLUMN IF NOT EXISTS sale_number_prefix TEXT DEFAULT 'INV';

-- =====================================================
-- 1B. Add store_id to 12 IMS tables
-- =====================================================

-- 1. ims_item_categories (store-scoped catalogs)
ALTER TABLE public.ims_item_categories ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_item_categories_store_id ON public.ims_item_categories(store_id);

-- 2. ims_items (items belong to a store)
ALTER TABLE public.ims_items ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_items_store_id ON public.ims_items(store_id);

-- 3. ims_suppliers
ALTER TABLE public.ims_suppliers ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_suppliers_store_id ON public.ims_suppliers(store_id);

-- 4. ims_stock_summary — also change UNIQUE from (item_id) to (item_id, store_id)
ALTER TABLE public.ims_stock_summary ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_stock_summary_store_id ON public.ims_stock_summary(store_id);
-- Drop the old single-column unique constraint and add multi-column one
ALTER TABLE public.ims_stock_summary DROP CONSTRAINT IF EXISTS ims_stock_summary_item_id_key;
-- Create new composite unique constraint (item_id + store_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ims_stock_summary_item_id_store_id_key'
  ) THEN
    ALTER TABLE public.ims_stock_summary
      ADD CONSTRAINT ims_stock_summary_item_id_store_id_key UNIQUE (item_id, store_id);
  END IF;
END $$;

-- 5. ims_stock_batches
ALTER TABLE public.ims_stock_batches ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_stock_batches_store_id ON public.ims_stock_batches(store_id);

-- 6. ims_goods_received_notes
ALTER TABLE public.ims_goods_received_notes ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_goods_received_notes_store_id ON public.ims_goods_received_notes(store_id);

-- 7. ims_indent_requests
ALTER TABLE public.ims_indent_requests ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_indent_requests_store_id ON public.ims_indent_requests(store_id);

-- 8. ims_stock_issues
ALTER TABLE public.ims_stock_issues ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_stock_issues_store_id ON public.ims_stock_issues(store_id);

-- 9. ims_sales
ALTER TABLE public.ims_sales ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_sales_store_id ON public.ims_sales(store_id);

-- 10. ims_financial_transactions
ALTER TABLE public.ims_financial_transactions ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_financial_transactions_store_id ON public.ims_financial_transactions(store_id);

-- 11. ims_department_consumption
ALTER TABLE public.ims_department_consumption ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_department_consumption_store_id ON public.ims_department_consumption(store_id);

-- 12. ims_unit_conversions
ALTER TABLE public.ims_unit_conversions ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_unit_conversions_store_id ON public.ims_unit_conversions(store_id);

-- Note: ims_units remains global (no store_id) — units are shared across all stores

-- =====================================================
-- 1C. Backfill existing data
-- For each table, set store_id from the matching ims_stores row
-- based on institution_id. This handles the existing 1:1 mapping.
-- =====================================================

-- Backfill ims_item_categories (no institution_id column, so we skip or handle differently)
-- Categories don't have institution_id, so they'll be assigned via items' store_id later
-- For now, assign to the first active store if any exist
UPDATE public.ims_item_categories c
SET store_id = s.id
FROM public.ims_stores s
WHERE c.store_id IS NULL
  AND s.is_active = true
  AND s.id = (SELECT id FROM public.ims_stores WHERE is_active = true ORDER BY created_at LIMIT 1);

-- Backfill ims_items
UPDATE public.ims_items SET store_id = s.id
FROM public.ims_stores s
WHERE ims_items.institution_id = s.institution_id
  AND ims_items.store_id IS NULL;

-- Backfill ims_suppliers
UPDATE public.ims_suppliers SET store_id = s.id
FROM public.ims_stores s
WHERE ims_suppliers.institution_id = s.institution_id
  AND ims_suppliers.store_id IS NULL;

-- Backfill ims_stock_summary
UPDATE public.ims_stock_summary SET store_id = s.id
FROM public.ims_stores s
WHERE ims_stock_summary.institution_id = s.institution_id
  AND ims_stock_summary.store_id IS NULL;

-- Backfill ims_stock_batches
UPDATE public.ims_stock_batches SET store_id = s.id
FROM public.ims_stores s
WHERE ims_stock_batches.institution_id = s.institution_id
  AND ims_stock_batches.store_id IS NULL;

-- Backfill ims_goods_received_notes
UPDATE public.ims_goods_received_notes SET store_id = s.id
FROM public.ims_stores s
WHERE ims_goods_received_notes.institution_id = s.institution_id
  AND ims_goods_received_notes.store_id IS NULL;

-- Backfill ims_indent_requests
UPDATE public.ims_indent_requests SET store_id = s.id
FROM public.ims_stores s
WHERE ims_indent_requests.institution_id = s.institution_id
  AND ims_indent_requests.store_id IS NULL;

-- Backfill ims_stock_issues
UPDATE public.ims_stock_issues SET store_id = s.id
FROM public.ims_stores s
WHERE ims_stock_issues.institution_id = s.institution_id
  AND ims_stock_issues.store_id IS NULL;

-- Backfill ims_sales
UPDATE public.ims_sales SET store_id = s.id
FROM public.ims_stores s
WHERE ims_sales.institution_id = s.institution_id
  AND ims_sales.store_id IS NULL;

-- Backfill ims_financial_transactions
UPDATE public.ims_financial_transactions SET store_id = s.id
FROM public.ims_stores s
WHERE ims_financial_transactions.institution_id = s.institution_id
  AND ims_financial_transactions.store_id IS NULL;

-- Backfill ims_department_consumption
UPDATE public.ims_department_consumption SET store_id = s.id
FROM public.ims_stores s
WHERE ims_department_consumption.institution_id = s.institution_id
  AND ims_department_consumption.store_id IS NULL;

-- Backfill ims_unit_conversions (may not have institution_id)
-- Unit conversions are typically global, assign to first store if needed
UPDATE public.ims_unit_conversions c
SET store_id = s.id
FROM public.ims_stores s
WHERE c.store_id IS NULL
  AND s.is_active = true
  AND s.id = (SELECT id FROM public.ims_stores WHERE is_active = true ORDER BY created_at LIMIT 1);
