-- Migration: 20260226_fix_ims_rls_policies
-- Purpose: Replace USING (true) RLS on all IMS tables with institution-scoped policies.
--          Prevents cross-institution data access for IMS module.
-- Security: Uses get_current_user_role() SECURITY DEFINER to avoid RLS recursion.

-- ================================================================================
-- SECTION 1: DROP ALL EXISTING PERMISSIVE IMS POLICIES
-- ================================================================================

-- 1. ims_units
DROP POLICY IF EXISTS "Authenticated users can read ims_units" ON public.ims_units;
DROP POLICY IF EXISTS "Authenticated users can insert ims_units" ON public.ims_units;
DROP POLICY IF EXISTS "Authenticated users can update ims_units" ON public.ims_units;
DROP POLICY IF EXISTS "Authenticated users can delete ims_units" ON public.ims_units;

-- 2. ims_item_categories
DROP POLICY IF EXISTS "Authenticated users can read ims_item_categories" ON public.ims_item_categories;
DROP POLICY IF EXISTS "Authenticated users can insert ims_item_categories" ON public.ims_item_categories;
DROP POLICY IF EXISTS "Authenticated users can update ims_item_categories" ON public.ims_item_categories;
DROP POLICY IF EXISTS "Authenticated users can delete ims_item_categories" ON public.ims_item_categories;

-- 3. ims_items
DROP POLICY IF EXISTS "Authenticated users can read ims_items" ON public.ims_items;
DROP POLICY IF EXISTS "Authenticated users can insert ims_items" ON public.ims_items;
DROP POLICY IF EXISTS "Authenticated users can update ims_items" ON public.ims_items;
DROP POLICY IF EXISTS "Authenticated users can delete ims_items" ON public.ims_items;

-- 4. ims_unit_conversions
DROP POLICY IF EXISTS "Authenticated users can read ims_unit_conversions" ON public.ims_unit_conversions;
DROP POLICY IF EXISTS "Authenticated users can insert ims_unit_conversions" ON public.ims_unit_conversions;
DROP POLICY IF EXISTS "Authenticated users can update ims_unit_conversions" ON public.ims_unit_conversions;
DROP POLICY IF EXISTS "Authenticated users can delete ims_unit_conversions" ON public.ims_unit_conversions;

-- 5. ims_suppliers
DROP POLICY IF EXISTS "Authenticated users can read ims_suppliers" ON public.ims_suppliers;
DROP POLICY IF EXISTS "Authenticated users can insert ims_suppliers" ON public.ims_suppliers;
DROP POLICY IF EXISTS "Authenticated users can update ims_suppliers" ON public.ims_suppliers;
DROP POLICY IF EXISTS "Authenticated users can delete ims_suppliers" ON public.ims_suppliers;

-- 6. ims_stock_summary
DROP POLICY IF EXISTS "Authenticated users can read ims_stock_summary" ON public.ims_stock_summary;
DROP POLICY IF EXISTS "Authenticated users can insert ims_stock_summary" ON public.ims_stock_summary;
DROP POLICY IF EXISTS "Authenticated users can update ims_stock_summary" ON public.ims_stock_summary;
DROP POLICY IF EXISTS "Authenticated users can delete ims_stock_summary" ON public.ims_stock_summary;

-- 7. ims_goods_received_notes
DROP POLICY IF EXISTS "Authenticated users can read ims_goods_received_notes" ON public.ims_goods_received_notes;
DROP POLICY IF EXISTS "Authenticated users can insert ims_goods_received_notes" ON public.ims_goods_received_notes;
DROP POLICY IF EXISTS "Authenticated users can update ims_goods_received_notes" ON public.ims_goods_received_notes;
DROP POLICY IF EXISTS "Authenticated users can delete ims_goods_received_notes" ON public.ims_goods_received_notes;

-- 8. ims_stock_batches
DROP POLICY IF EXISTS "Authenticated users can read ims_stock_batches" ON public.ims_stock_batches;
DROP POLICY IF EXISTS "Authenticated users can insert ims_stock_batches" ON public.ims_stock_batches;
DROP POLICY IF EXISTS "Authenticated users can update ims_stock_batches" ON public.ims_stock_batches;
DROP POLICY IF EXISTS "Authenticated users can delete ims_stock_batches" ON public.ims_stock_batches;

-- 9. ims_grn_items
DROP POLICY IF EXISTS "Authenticated users can read ims_grn_items" ON public.ims_grn_items;
DROP POLICY IF EXISTS "Authenticated users can insert ims_grn_items" ON public.ims_grn_items;
DROP POLICY IF EXISTS "Authenticated users can update ims_grn_items" ON public.ims_grn_items;
DROP POLICY IF EXISTS "Authenticated users can delete ims_grn_items" ON public.ims_grn_items;

-- 10. ims_indent_requests
DROP POLICY IF EXISTS "Authenticated users can read ims_indent_requests" ON public.ims_indent_requests;
DROP POLICY IF EXISTS "Authenticated users can insert ims_indent_requests" ON public.ims_indent_requests;
DROP POLICY IF EXISTS "Authenticated users can update ims_indent_requests" ON public.ims_indent_requests;
DROP POLICY IF EXISTS "Authenticated users can delete ims_indent_requests" ON public.ims_indent_requests;

-- 11. ims_indent_request_items
DROP POLICY IF EXISTS "Authenticated users can read ims_indent_request_items" ON public.ims_indent_request_items;
DROP POLICY IF EXISTS "Authenticated users can insert ims_indent_request_items" ON public.ims_indent_request_items;
DROP POLICY IF EXISTS "Authenticated users can update ims_indent_request_items" ON public.ims_indent_request_items;
DROP POLICY IF EXISTS "Authenticated users can delete ims_indent_request_items" ON public.ims_indent_request_items;

-- 12. ims_stock_issues
DROP POLICY IF EXISTS "Authenticated users can read ims_stock_issues" ON public.ims_stock_issues;
DROP POLICY IF EXISTS "Authenticated users can insert ims_stock_issues" ON public.ims_stock_issues;
DROP POLICY IF EXISTS "Authenticated users can update ims_stock_issues" ON public.ims_stock_issues;
DROP POLICY IF EXISTS "Authenticated users can delete ims_stock_issues" ON public.ims_stock_issues;

-- 13. ims_sales
DROP POLICY IF EXISTS "Authenticated users can read ims_sales" ON public.ims_sales;
DROP POLICY IF EXISTS "Authenticated users can insert ims_sales" ON public.ims_sales;
DROP POLICY IF EXISTS "Authenticated users can update ims_sales" ON public.ims_sales;
DROP POLICY IF EXISTS "Authenticated users can delete ims_sales" ON public.ims_sales;

-- 14. ims_sale_items
DROP POLICY IF EXISTS "Authenticated users can read ims_sale_items" ON public.ims_sale_items;
DROP POLICY IF EXISTS "Authenticated users can insert ims_sale_items" ON public.ims_sale_items;
DROP POLICY IF EXISTS "Authenticated users can update ims_sale_items" ON public.ims_sale_items;
DROP POLICY IF EXISTS "Authenticated users can delete ims_sale_items" ON public.ims_sale_items;

-- 15. ims_financial_transactions
DROP POLICY IF EXISTS "Authenticated users can read ims_financial_transactions" ON public.ims_financial_transactions;
DROP POLICY IF EXISTS "Authenticated users can insert ims_financial_transactions" ON public.ims_financial_transactions;
DROP POLICY IF EXISTS "Authenticated users can update ims_financial_transactions" ON public.ims_financial_transactions;
DROP POLICY IF EXISTS "Authenticated users can delete ims_financial_transactions" ON public.ims_financial_transactions;

-- 16. ims_department_consumption
DROP POLICY IF EXISTS "Authenticated users can read ims_department_consumption" ON public.ims_department_consumption;
DROP POLICY IF EXISTS "Authenticated users can insert ims_department_consumption" ON public.ims_department_consumption;
DROP POLICY IF EXISTS "Authenticated users can update ims_department_consumption" ON public.ims_department_consumption;
DROP POLICY IF EXISTS "Authenticated users can delete ims_department_consumption" ON public.ims_department_consumption;

-- 17. ims_stores
DROP POLICY IF EXISTS "Authenticated users can read ims_stores" ON public.ims_stores;
DROP POLICY IF EXISTS "Authenticated users can insert ims_stores" ON public.ims_stores;
DROP POLICY IF EXISTS "Authenticated users can update ims_stores" ON public.ims_stores;
DROP POLICY IF EXISTS "Authenticated users can delete ims_stores" ON public.ims_stores;

-- 18. ims_upi_qr_payments
DROP POLICY IF EXISTS "Authenticated users can read ims_upi_qr_payments" ON public.ims_upi_qr_payments;
DROP POLICY IF EXISTS "Authenticated users can insert ims_upi_qr_payments" ON public.ims_upi_qr_payments;
DROP POLICY IF EXISTS "Authenticated users can update ims_upi_qr_payments" ON public.ims_upi_qr_payments;

-- 20. ims_shifts
DROP POLICY IF EXISTS "Authenticated users can read ims_shifts" ON public.ims_shifts;
DROP POLICY IF EXISTS "Authenticated users can insert ims_shifts" ON public.ims_shifts;
DROP POLICY IF EXISTS "Authenticated users can update ims_shifts" ON public.ims_shifts;

-- ================================================================================
-- SECTION 2: CREATE INSTITUTION-SCOPED REPLACEMENT POLICIES
-- ================================================================================

-- -------------------------------------------------------------------------
-- 1. ims_units — global lookup table, no institution_id
--    Reads are open to all authenticated users.
--    Writes restricted to admins only.
-- -------------------------------------------------------------------------
CREATE POLICY "ims_units_select"
  ON public.ims_units FOR SELECT TO authenticated USING (true);

CREATE POLICY "ims_units_insert"
  ON public.ims_units FOR INSERT TO authenticated
  WITH CHECK (get_current_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "ims_units_update"
  ON public.ims_units FOR UPDATE TO authenticated
  USING (get_current_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "ims_units_delete"
  ON public.ims_units FOR DELETE TO authenticated
  USING (get_current_user_role() IN ('super_admin', 'admin'));

-- -------------------------------------------------------------------------
-- 2. ims_item_categories — global lookup table, no institution_id
--    Same treatment as ims_units: open reads, admin-only writes.
-- -------------------------------------------------------------------------
CREATE POLICY "ims_item_categories_select"
  ON public.ims_item_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "ims_item_categories_insert"
  ON public.ims_item_categories FOR INSERT TO authenticated
  WITH CHECK (get_current_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "ims_item_categories_update"
  ON public.ims_item_categories FOR UPDATE TO authenticated
  USING (get_current_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "ims_item_categories_delete"
  ON public.ims_item_categories FOR DELETE TO authenticated
  USING (get_current_user_role() IN ('super_admin', 'admin'));

-- -------------------------------------------------------------------------
-- 3. ims_items — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_items_select"
  ON public.ims_items FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_items_insert"
  ON public.ims_items FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_items_update"
  ON public.ims_items FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_items_delete"
  ON public.ims_items FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 4. ims_unit_conversions — scoped via item_id → ims_items (institution_id)
-- -------------------------------------------------------------------------
CREATE POLICY "ims_unit_conversions_select"
  ON public.ims_unit_conversions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_items i
      WHERE i.id = item_id
      AND (
        i.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_unit_conversions_insert"
  ON public.ims_unit_conversions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ims_items i
      WHERE i.id = item_id
      AND (
        i.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_unit_conversions_update"
  ON public.ims_unit_conversions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_items i
      WHERE i.id = item_id
      AND (
        i.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_unit_conversions_delete"
  ON public.ims_unit_conversions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_items i
      WHERE i.id = item_id
      AND (
        i.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

-- -------------------------------------------------------------------------
-- 5. ims_suppliers — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_suppliers_select"
  ON public.ims_suppliers FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_suppliers_insert"
  ON public.ims_suppliers FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_suppliers_update"
  ON public.ims_suppliers FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_suppliers_delete"
  ON public.ims_suppliers FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 6. ims_stock_summary — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_stock_summary_select"
  ON public.ims_stock_summary FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_summary_insert"
  ON public.ims_stock_summary FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_summary_update"
  ON public.ims_stock_summary FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_summary_delete"
  ON public.ims_stock_summary FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 7. ims_goods_received_notes — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_goods_received_notes_select"
  ON public.ims_goods_received_notes FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_goods_received_notes_insert"
  ON public.ims_goods_received_notes FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_goods_received_notes_update"
  ON public.ims_goods_received_notes FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_goods_received_notes_delete"
  ON public.ims_goods_received_notes FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 8. ims_stock_batches — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_stock_batches_select"
  ON public.ims_stock_batches FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_batches_insert"
  ON public.ims_stock_batches FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_batches_update"
  ON public.ims_stock_batches FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_batches_delete"
  ON public.ims_stock_batches FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 9. ims_grn_items — junction table, scoped via grn_id → ims_goods_received_notes
-- -------------------------------------------------------------------------
CREATE POLICY "ims_grn_items_select"
  ON public.ims_grn_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_goods_received_notes g
      WHERE g.id = grn_id
      AND (
        g.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_grn_items_insert"
  ON public.ims_grn_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ims_goods_received_notes g
      WHERE g.id = grn_id
      AND (
        g.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_grn_items_update"
  ON public.ims_grn_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_goods_received_notes g
      WHERE g.id = grn_id
      AND (
        g.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_grn_items_delete"
  ON public.ims_grn_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_goods_received_notes g
      WHERE g.id = grn_id
      AND (
        g.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

-- -------------------------------------------------------------------------
-- 10. ims_indent_requests — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_indent_requests_select"
  ON public.ims_indent_requests FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_indent_requests_insert"
  ON public.ims_indent_requests FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_indent_requests_update"
  ON public.ims_indent_requests FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_indent_requests_delete"
  ON public.ims_indent_requests FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 11. ims_indent_request_items — junction table, scoped via indent_id → ims_indent_requests
-- -------------------------------------------------------------------------
CREATE POLICY "ims_indent_request_items_select"
  ON public.ims_indent_request_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_indent_requests ir
      WHERE ir.id = indent_id
      AND (
        ir.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_indent_request_items_insert"
  ON public.ims_indent_request_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ims_indent_requests ir
      WHERE ir.id = indent_id
      AND (
        ir.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_indent_request_items_update"
  ON public.ims_indent_request_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_indent_requests ir
      WHERE ir.id = indent_id
      AND (
        ir.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_indent_request_items_delete"
  ON public.ims_indent_request_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_indent_requests ir
      WHERE ir.id = indent_id
      AND (
        ir.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

-- -------------------------------------------------------------------------
-- 12. ims_stock_issues — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_stock_issues_select"
  ON public.ims_stock_issues FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_issues_insert"
  ON public.ims_stock_issues FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_issues_update"
  ON public.ims_stock_issues FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_issues_delete"
  ON public.ims_stock_issues FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 13. ims_sales — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_sales_select"
  ON public.ims_sales FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_sales_insert"
  ON public.ims_sales FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_sales_update"
  ON public.ims_sales FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_sales_delete"
  ON public.ims_sales FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 14. ims_sale_items — junction table, scoped via sale_id → ims_sales
-- -------------------------------------------------------------------------
CREATE POLICY "ims_sale_items_select"
  ON public.ims_sale_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_sales s
      WHERE s.id = sale_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_sale_items_insert"
  ON public.ims_sale_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ims_sales s
      WHERE s.id = sale_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_sale_items_update"
  ON public.ims_sale_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_sales s
      WHERE s.id = sale_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_sale_items_delete"
  ON public.ims_sale_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_sales s
      WHERE s.id = sale_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

-- -------------------------------------------------------------------------
-- 15. ims_financial_transactions — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_financial_transactions_select"
  ON public.ims_financial_transactions FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_financial_transactions_insert"
  ON public.ims_financial_transactions FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_financial_transactions_update"
  ON public.ims_financial_transactions FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_financial_transactions_delete"
  ON public.ims_financial_transactions FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 16. ims_department_consumption — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_department_consumption_select"
  ON public.ims_department_consumption FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_department_consumption_insert"
  ON public.ims_department_consumption FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_department_consumption_update"
  ON public.ims_department_consumption FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_department_consumption_delete"
  ON public.ims_department_consumption FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 17. ims_stores — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_stores_select"
  ON public.ims_stores FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stores_insert"
  ON public.ims_stores FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stores_update"
  ON public.ims_stores FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stores_delete"
  ON public.ims_stores FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 18. ims_upi_qr_payments — has store_id only, join via ims_stores for institution
-- -------------------------------------------------------------------------
CREATE POLICY "ims_upi_qr_payments_select"
  ON public.ims_upi_qr_payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_upi_qr_payments_insert"
  ON public.ims_upi_qr_payments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_upi_qr_payments_update"
  ON public.ims_upi_qr_payments FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_upi_qr_payments_delete"
  ON public.ims_upi_qr_payments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

-- -------------------------------------------------------------------------
-- 19. ims_sale_number_counters — has store_id only, join via ims_stores
--     Note: primary access is via ims_next_sale_number() SECURITY DEFINER RPC.
--     Direct table policies provided for admin visibility.
-- -------------------------------------------------------------------------
CREATE POLICY "ims_sale_number_counters_select"
  ON public.ims_sale_number_counters FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_sale_number_counters_insert"
  ON public.ims_sale_number_counters FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_sale_number_counters_update"
  ON public.ims_sale_number_counters FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

-- -------------------------------------------------------------------------
-- 20. ims_shifts — has store_id only, join via ims_stores
-- -------------------------------------------------------------------------
CREATE POLICY "ims_shifts_select"
  ON public.ims_shifts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_shifts_insert"
  ON public.ims_shifts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_shifts_update"
  ON public.ims_shifts FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_shifts_delete"
  ON public.ims_shifts FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );
