-- ============================================================
-- STEP 4: Verification Queries
-- Run in staging SQL Editor AFTER data import to confirm counts.
-- ============================================================

-- Row counts across all IMS tables
SELECT
  'ims_items'                  AS table_name, COUNT(*) AS rows FROM public.ims_items
UNION ALL SELECT 'ims_stores',               COUNT(*) FROM public.ims_stores
UNION ALL SELECT 'ims_sales',                COUNT(*) FROM public.ims_sales
UNION ALL SELECT 'ims_stock_summary',        COUNT(*) FROM public.ims_stock_summary
UNION ALL SELECT 'ims_goods_received_notes', COUNT(*) FROM public.ims_goods_received_notes
UNION ALL SELECT 'ims_indent_requests',      COUNT(*) FROM public.ims_indent_requests
UNION ALL SELECT 'ims_units',                COUNT(*) FROM public.ims_units
UNION ALL SELECT 'ims_item_categories',      COUNT(*) FROM public.ims_item_categories
UNION ALL SELECT 'ims_suppliers',            COUNT(*) FROM public.ims_suppliers
UNION ALL SELECT 'ims_stock_batches',        COUNT(*) FROM public.ims_stock_batches
UNION ALL SELECT 'ims_financial_transactions', COUNT(*) FROM public.ims_financial_transactions
ORDER BY table_name;

-- Verify store_admin role was seeded
SELECT role_key, role_name, is_system_role, is_active,
       permissions->>'ims.dashboard.view' AS can_view_dashboard,
       permissions->>'ims.sales.manage'   AS can_manage_sales
FROM public.custom_roles
WHERE role_key = 'store_admin';

-- Verify IMS units were seeded (should be 15 rows)
SELECT count(*) AS unit_count FROM public.ims_units;

-- Verify ims_stores.institution_id FK was dropped (should be NO FK to institutions)
SELECT tc.constraint_name, tc.constraint_type
FROM information_schema.table_constraints tc
WHERE tc.table_name = 'ims_stores'
  AND tc.constraint_type = 'FOREIGN KEY';

-- Verify profiles has assigned_store_id column
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'assigned_store_id';

-- Verify institution-scoped RLS policies exist on ims_sales (not the old open ones)
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'ims_sales'
ORDER BY policyname;

-- Verify GRN/indent RPC functions exist
SELECT proname, prosecdef AS security_definer
FROM pg_proc
WHERE proname IN ('ims_next_grn_number', 'ims_next_indent_number', 'ims_next_sale_number');

-- Verify storage bucket exists
SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id = 'ims-receipts';
