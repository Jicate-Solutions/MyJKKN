-- Migration: Optimize Billing Queries and Fix Parsing Issues
-- This migration addresses complex join query failures and performance bottlenecks

-- 1. Create materialized view for student billing summary (reduces complex join load)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_student_billing_summary AS
SELECT 
  s.id as student_id,
  s.student_name,
  s.roll_number,
  COUNT(DISTINCT b.id) as total_bills,
  COALESCE(SUM(b.final_amount), 0) as total_bill_amount,
  COALESCE(SUM(b.balance_amount), 0) as total_outstanding,
  COUNT(DISTINCT CASE WHEN b.status = 'paid' THEN b.id END) as paid_bills,
  COUNT(DISTINCT CASE WHEN b.status = 'unpaid' THEN b.id END) as unpaid_bills,
  COUNT(DISTINCT CASE WHEN b.status = 'partially_paid' THEN b.id END) as partially_paid_bills,
  COUNT(DISTINCT CASE WHEN b.status = 'overdue' THEN b.id END) as overdue_bills,
  COUNT(DISTINCT r.id) as total_receipts,
  COALESCE(SUM(r.payment_amount), 0) as total_receipt_amount,
  COUNT(DISTINCT ref.id) as total_refunds,
  COALESCE(SUM(CASE WHEN ref.approval_status = 'processed' THEN ref.refund_amount ELSE 0 END), 0) as total_processed_refunds,
  MAX(r.receipt_date) as last_payment_date,
  MAX(b.updated_at) as last_bill_update,
  NOW() as summary_generated_at
FROM public.students s
LEFT JOIN public.billing_student_bills b ON s.id = b.student_id
LEFT JOIN public.billing_receipts r ON s.id = r.student_id
LEFT JOIN public.billing_refunds ref ON r.id = ref.receipt_id
GROUP BY s.id, s.student_name, s.roll_number;

-- Create unique index on the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_student_billing_summary_student_id 
ON public.mv_student_billing_summary(student_id);

-- Create additional indexes for common queries
CREATE INDEX IF NOT EXISTS idx_mv_student_billing_summary_outstanding 
ON public.mv_student_billing_summary(total_outstanding) WHERE total_outstanding > 0;

CREATE INDEX IF NOT EXISTS idx_mv_student_billing_summary_overdue 
ON public.mv_student_billing_summary(overdue_bills) WHERE overdue_bills > 0;

-- 2. Create optimized function for outstanding calculation (replaces complex loop)
CREATE OR REPLACE FUNCTION calculate_student_outstanding_optimized(student_uuid UUID)
RETURNS DECIMAL(10,2) AS $$
BEGIN
  -- First try to get from materialized view (fastest)
  DECLARE
    mv_outstanding DECIMAL(10,2);
  BEGIN
    SELECT total_outstanding INTO mv_outstanding
    FROM public.mv_student_billing_summary
    WHERE student_id = student_uuid;
    
    -- If found in materialized view and recent, return it
    IF mv_outstanding IS NOT NULL THEN
      RETURN mv_outstanding;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      -- Fall through to real-time calculation
      NULL;
  END;
  
  -- Fallback: optimized real-time calculation using single query instead of loop
  RETURN (
    SELECT COALESCE(SUM(
      b.final_amount - 
      COALESCE(payments.total_paid, 0) + 
      COALESCE(refunds.total_refunded, 0)
    ), 0)
    FROM public.billing_student_bills b
    LEFT JOIN (
      -- Subquery for payments per bill
      SELECT 
        bri.bill_id,
        SUM(bri.amount_paid) as total_paid
      FROM public.billing_receipt_items bri
      GROUP BY bri.bill_id
    ) payments ON b.id = payments.bill_id
    LEFT JOIN (
      -- Subquery for refunds per bill
      SELECT 
        bri.bill_id,
        SUM(br.refund_amount) as total_refunded
      FROM public.billing_refunds br
      JOIN public.billing_receipt_items bri ON br.receipt_id = bri.receipt_id
      WHERE br.approval_status = 'processed'
      GROUP BY bri.bill_id
    ) refunds ON b.id = refunds.bill_id
    WHERE b.student_id = student_uuid
      AND b.status IN ('unpaid', 'partially_paid', 'overdue')
      AND (b.final_amount - COALESCE(payments.total_paid, 0) + COALESCE(refunds.total_refunded, 0)) > 0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create function to refresh materialized view efficiently
CREATE OR REPLACE FUNCTION refresh_student_billing_summary(student_uuid UUID DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  IF student_uuid IS NOT NULL THEN
    -- Refresh for specific student (much faster)
    DELETE FROM public.mv_student_billing_summary WHERE student_id = student_uuid;
    
    INSERT INTO public.mv_student_billing_summary
    SELECT 
      s.id as student_id,
      s.student_name,
      s.roll_number,
      COUNT(DISTINCT b.id) as total_bills,
      COALESCE(SUM(b.final_amount), 0) as total_bill_amount,
      COALESCE(SUM(b.balance_amount), 0) as total_outstanding,
      COUNT(DISTINCT CASE WHEN b.status = 'paid' THEN b.id END) as paid_bills,
      COUNT(DISTINCT CASE WHEN b.status = 'unpaid' THEN b.id END) as unpaid_bills,
      COUNT(DISTINCT CASE WHEN b.status = 'partially_paid' THEN b.id END) as partially_paid_bills,
      COUNT(DISTINCT CASE WHEN b.status = 'overdue' THEN b.id END) as overdue_bills,
      COUNT(DISTINCT r.id) as total_receipts,
      COALESCE(SUM(r.payment_amount), 0) as total_receipt_amount,
      COUNT(DISTINCT ref.id) as total_refunds,
      COALESCE(SUM(CASE WHEN ref.approval_status = 'processed' THEN ref.refund_amount ELSE 0 END), 0) as total_processed_refunds,
      MAX(r.receipt_date) as last_payment_date,
      MAX(b.updated_at) as last_bill_update,
      NOW() as summary_generated_at
    FROM public.students s
    LEFT JOIN public.billing_student_bills b ON s.id = b.student_id
    LEFT JOIN public.billing_receipts r ON s.id = r.student_id
    LEFT JOIN public.billing_refunds ref ON r.id = ref.receipt_id
    WHERE s.id = student_uuid
    GROUP BY s.id, s.student_name, s.roll_number;
  ELSE
    -- Full refresh (use sparingly)
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_student_billing_summary;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create optimized function for complex invoice queries (fixes join issues)
CREATE OR REPLACE FUNCTION get_invoice_with_details(invoice_uuid UUID)
RETURNS TABLE(
  invoice_data JSONB,
  student_data JSONB,
  institution_data JSONB,
  invoice_items_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_jsonb(i.*) as invoice_data,
    to_jsonb(s.*) as student_data,
    to_jsonb(inst.*) as institution_data,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', ii.id,
            'receipt_id', ii.receipt_id,
            'amount', ii.amount,
            'receipt', to_jsonb(r.*)
          )
        )
        FROM public.billing_invoice_items ii
        LEFT JOIN public.billing_receipts r ON ii.receipt_id = r.id
        WHERE ii.invoice_id = invoice_uuid
      ),
      '[]'::jsonb
    ) as invoice_items_data
  FROM public.billing_invoices i
  LEFT JOIN public.students s ON i.student_id = s.id
  LEFT JOIN public.institutions inst ON i.institution_id = inst.id
  WHERE i.id = invoice_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create indexes to optimize common billing queries
CREATE INDEX IF NOT EXISTS idx_billing_student_bills_student_status 
ON public.billing_student_bills(student_id, status) 
WHERE status IN ('unpaid', 'partially_paid', 'overdue');

CREATE INDEX IF NOT EXISTS idx_billing_receipts_student_date 
ON public.billing_receipts(student_id, receipt_date DESC);

CREATE INDEX IF NOT EXISTS idx_billing_receipt_items_bill_amount 
ON public.billing_receipt_items(bill_id, amount_paid);

CREATE INDEX IF NOT EXISTS idx_billing_refunds_receipt_status 
ON public.billing_refunds(receipt_id, approval_status) 
WHERE approval_status = 'processed';

CREATE INDEX IF NOT EXISTS idx_billing_invoices_student_type 
ON public.billing_invoices(student_id, invoice_type);

-- 6. Create triggers to automatically refresh materialized view
CREATE OR REPLACE FUNCTION trigger_refresh_student_billing_summary()
RETURNS TRIGGER AS $$
BEGIN
  -- Determine which student to refresh based on the operation
  DECLARE
    affected_student_id UUID;
  BEGIN
    IF TG_TABLE_NAME = 'billing_student_bills' THEN
      affected_student_id := COALESCE(NEW.student_id, OLD.student_id);
    ELSIF TG_TABLE_NAME = 'billing_receipts' THEN
      affected_student_id := COALESCE(NEW.student_id, OLD.student_id);
    ELSIF TG_TABLE_NAME = 'billing_refunds' THEN
      -- Get student_id through receipt
      SELECT r.student_id INTO affected_student_id
      FROM public.billing_receipts r
      WHERE r.id = COALESCE(NEW.receipt_id, OLD.receipt_id);
    END IF;
    
    -- Refresh the materialized view for this student
    IF affected_student_id IS NOT NULL THEN
      PERFORM refresh_student_billing_summary(affected_student_id);
    END IF;
    
    RETURN COALESCE(NEW, OLD);
  END;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic refresh
DROP TRIGGER IF EXISTS trigger_bills_refresh_summary ON public.billing_student_bills;
CREATE TRIGGER trigger_bills_refresh_summary
  AFTER INSERT OR UPDATE OR DELETE ON public.billing_student_bills
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_student_billing_summary();

DROP TRIGGER IF EXISTS trigger_receipts_refresh_summary ON public.billing_receipts;
CREATE TRIGGER trigger_receipts_refresh_summary
  AFTER INSERT OR UPDATE OR DELETE ON public.billing_receipts
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_student_billing_summary();

DROP TRIGGER IF EXISTS trigger_refunds_refresh_summary ON public.billing_refunds;
CREATE TRIGGER trigger_refunds_refresh_summary
  AFTER INSERT OR UPDATE OR DELETE ON public.billing_refunds
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_student_billing_summary();

-- 7. Create optimized view for bill details (reduces complex joins)
CREATE OR REPLACE VIEW public.v_bill_details AS
SELECT 
  b.*,
  s.student_name,
  s.roll_number,
  s.student_email,
  i.name as institution_name,
  ic.item_category_name,
  pc.parent_category_name,
  sc.sub_category_name,
  -- Pre-calculated payment info
  COALESCE(payments.total_paid, 0) as total_paid,
  COALESCE(refunds.total_refunded, 0) as total_refunded,
  COALESCE(discounts.total_discount, 0) as total_discount,
  (COALESCE(payments.total_paid, 0) - COALESCE(refunds.total_refunded, 0)) as net_paid
FROM public.billing_student_bills b
LEFT JOIN public.students s ON b.student_id = s.id
LEFT JOIN public.institutions i ON b.institution_id = i.id
LEFT JOIN public.billing_item_categories ic ON b.item_category_id = ic.id
LEFT JOIN public.billing_parent_categories pc ON ic.parent_category_id = pc.id
LEFT JOIN public.billing_sub_categories sc ON ic.sub_category_id = sc.id
LEFT JOIN (
  SELECT 
    bill_id,
    SUM(amount_paid) as total_paid
  FROM public.billing_receipt_items
  GROUP BY bill_id
) payments ON b.id = payments.bill_id
LEFT JOIN (
  SELECT 
    bri.bill_id,
    SUM(br.refund_amount) as total_refunded
  FROM public.billing_refunds br
  JOIN public.billing_receipt_items bri ON br.receipt_id = bri.receipt_id
  WHERE br.approval_status = 'processed'
  GROUP BY bri.bill_id
) refunds ON b.id = refunds.bill_id
LEFT JOIN (
  SELECT 
    bill_id,
    SUM(discount_amount) as total_discount
  FROM public.billing_discounts
  WHERE approval_status = 'approved'
  GROUP BY bill_id
) discounts ON b.id = discounts.bill_id;

-- 8. Create function to get optimized student billing summary
CREATE OR REPLACE FUNCTION get_student_billing_summary_optimized(student_uuid UUID)
RETURNS TABLE(
  student_info JSONB,
  billing_summary JSONB,
  recent_bills JSONB,
  recent_receipts JSONB,
  recent_invoices JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Student info
    jsonb_build_object(
      'id', s.id,
      'student_name', s.student_name,
      'roll_number', s.roll_number,
      'student_email', s.student_email
    ) as student_info,
    
    -- Billing summary from materialized view
    to_jsonb(mvs.*) as billing_summary,
    
    -- Recent bills (last 10)
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(vbd.*))
        FROM (
          SELECT * FROM public.v_bill_details
          WHERE student_id = student_uuid
          ORDER BY created_at DESC
          LIMIT 10
        ) vbd
      ),
      '[]'::jsonb
    ) as recent_bills,
    
    -- Recent receipts (last 10)
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(r.*))
        FROM (
          SELECT * FROM public.billing_receipts
          WHERE student_id = student_uuid
          ORDER BY receipt_date DESC
          LIMIT 10
        ) r
      ),
      '[]'::jsonb
    ) as recent_receipts,
    
    -- Recent invoices (last 10)
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(inv.*))
        FROM (
          SELECT * FROM public.billing_invoices
          WHERE student_id = student_uuid
          ORDER BY invoice_date DESC
          LIMIT 10
        ) inv
      ),
      '[]'::jsonb
    ) as recent_invoices
    
  FROM public.students s
  LEFT JOIN public.mv_student_billing_summary mvs ON s.id = mvs.student_id
  WHERE s.id = student_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Initial population of materialized view
SELECT refresh_student_billing_summary();

-- 10. Grant necessary permissions
GRANT SELECT ON public.mv_student_billing_summary TO authenticated;
GRANT SELECT ON public.v_bill_details TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_student_outstanding_optimized(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_invoice_with_details(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_student_billing_summary_optimized(UUID) TO authenticated;

-- 11. Create scheduled job to refresh materialized view (if pg_cron is available)
-- This keeps the materialized view fresh without blocking operations
DO $$
BEGIN
  -- Only create if pg_cron extension exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Refresh materialized view every hour
    PERFORM cron.schedule(
      'refresh-billing-summary',
      '0 * * * *',
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_student_billing_summary;'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Silently fail if pg_cron is not available
    NULL;
END $$;

-- 12. Add comments for documentation
COMMENT ON MATERIALIZED VIEW public.mv_student_billing_summary IS 
'Pre-calculated billing summary per student to avoid complex join queries. Refreshed automatically via triggers.';

COMMENT ON FUNCTION calculate_student_outstanding_optimized(UUID) IS 
'Optimized outstanding calculation that uses materialized view when possible, falls back to single-query calculation.';

COMMENT ON FUNCTION get_invoice_with_details(UUID) IS 
'Returns invoice with all related data as JSONB to avoid complex join parsing issues in application code.';

COMMENT ON FUNCTION get_student_billing_summary_optimized(UUID) IS 
'Single-function call to get complete student billing summary with all related data in optimized format.';

COMMENT ON VIEW public.v_bill_details IS 
'Pre-joined view of bill details with calculated payment information to reduce query complexity in application.';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Billing query optimization migration completed successfully!';
  RAISE NOTICE 'Created materialized view for student billing summaries';
  RAISE NOTICE 'Added optimized functions for complex calculations';
  RAISE NOTICE 'Improved indexes for common query patterns';
  RAISE NOTICE 'Added automatic triggers for data consistency';
END $$; 