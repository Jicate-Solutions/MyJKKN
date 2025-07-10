-- =============================================
-- Database Views
-- =============================================

-- View for auto-generated invoices
CREATE VIEW auto_generated_invoices AS
SELECT 
    i.id,
    i.invoice_number,
    i.invoice_date,
    i.grand_total,
    i.student_id,
    s.student_name,
    s.roll_number,
    inst.name AS institution_name,
    replace(i.invoice_description, 'Payment Invoice for: '::text, ''::text) AS original_bill_description,
    (SELECT count(*) AS count
     FROM billing_invoice_items ii
     WHERE (ii.invoice_id = i.id)) AS receipt_count,
    i.created_at
FROM billing_invoices i
JOIN students s ON i.student_id = s.id
JOIN institutions inst ON i.institution_id = inst.id
WHERE i.invoice_type = 'individual'
  AND i.invoice_description LIKE 'Payment Invoice for:%'
ORDER BY i.created_at DESC;

-- View for bill invoice relationships
CREATE VIEW bill_invoice_relationships AS
SELECT 
    b.id AS bill_id,
    b.bill_description,
    b.status AS bill_status,
    b.final_amount AS bill_amount,
    b.payment_date,
    s.student_name,
    i.id AS invoice_id,
    i.invoice_number,
    i.grand_total AS invoice_amount,
    i.created_at AS invoice_created_at,
    CASE
        WHEN i.id IS NOT NULL THEN 'Yes'
        ELSE 'No'
    END AS has_auto_invoice
FROM billing_student_bills b
JOIN students s ON b.student_id = s.id
LEFT JOIN billing_receipt_items ri ON ri.receipt_id IN (
    SELECT billing_receipt_items.receipt_id
    FROM billing_receipt_items
    WHERE billing_receipt_items.bill_id = b.id
)
LEFT JOIN billing_invoice_items ii ON ii.receipt_id = ri.receipt_id
LEFT JOIN billing_invoices i ON i.id = ii.invoice_id 
    AND i.invoice_type = 'individual' 
    AND i.invoice_description LIKE 'Payment Invoice for:%'
WHERE b.status = 'paid'
ORDER BY b.payment_date DESC;

-- View for bug reporters leaderboard
CREATE VIEW bug_reporters_leaderboard AS
SELECT 
    p.id AS user_id,
    p.full_name AS user_name,
    p.avatar_url,
    count(br.id) AS resolved_bugs_count
FROM profiles p
JOIN bug_reports br ON p.id = br.reporter_user_id
WHERE br.status = 'resolved'
GROUP BY p.id, p.full_name, p.avatar_url
ORDER BY count(br.id) DESC;

-- View for detailed bill information
CREATE VIEW v_bill_details AS
SELECT 
    b.id,
    b.student_id,
    b.institution_id,
    b.item_category_id,
    b.bill_description,
    b.due_date,
    b.quantity,
    b.unit_amount,
    b.total_amount,
    b.tax_amount,
    b.final_amount,
    b.status,
    b.payment_date,
    b.balance_amount,
    b.remarks,
    b.is_recurring,
    b.recurrence_pattern,
    b.number_of_recurrences,
    b.created_by,
    b.created_at,
    b.updated_at,
    s.student_name,
    s.roll_number,
    s.student_email,
    i.name AS institution_name,
    ic.item_category_name,
    pc.parent_category_name,
    sc.sub_category_name,
    COALESCE(payments.total_paid, 0::numeric) AS total_paid,
    COALESCE(refunds.total_refunded, 0::numeric) AS total_refunded,
    COALESCE(discounts.total_discount, 0::numeric) AS total_discount,
    (COALESCE(payments.total_paid, 0::numeric) - COALESCE(refunds.total_refunded, 0::numeric)) AS net_paid
FROM billing_student_bills b
LEFT JOIN students s ON b.student_id = s.id
LEFT JOIN institutions i ON b.institution_id = i.id
LEFT JOIN billing_item_categories ic ON b.item_category_id = ic.id
LEFT JOIN billing_parent_categories pc ON ic.parent_category_id = pc.id
LEFT JOIN billing_sub_categories sc ON ic.sub_category_id = sc.id
LEFT JOIN (
    SELECT billing_receipt_items.bill_id,
           sum(billing_receipt_items.amount_paid) AS total_paid
    FROM billing_receipt_items
    GROUP BY billing_receipt_items.bill_id
) payments ON b.id = payments.bill_id
LEFT JOIN (
    SELECT bri.bill_id,
           sum(br.refund_amount) AS total_refunded
    FROM billing_refunds br
    JOIN billing_receipt_items bri ON br.receipt_id = bri.receipt_id
    WHERE br.approval_status = 'processed'
    GROUP BY bri.bill_id
) refunds ON b.id = refunds.bill_id
LEFT JOIN (
    SELECT billing_discounts.bill_id,
           sum(billing_discounts.discount_amount) AS total_discount
    FROM billing_discounts
    WHERE billing_discounts.approval_status = 'approved'
    GROUP BY billing_discounts.bill_id
) discounts ON b.id = discounts.bill_id;

-- =============================================
-- Materialized Views
-- =============================================

-- Materialized view for activity statistics
CREATE MATERIALIZED VIEW activity_stats AS
SELECT 
    date(user_activity_logs.created_at) AS activity_date,
    count(*) AS total_activities,
    count(DISTINCT user_activity_logs.user_id) AS unique_users,
    count(DISTINCT user_activity_logs.session_id) AS unique_sessions,
    user_activity_logs.action_type,
    user_activity_logs.resource_type,
    EXTRACT(hour FROM user_activity_logs.created_at) AS activity_hour
FROM user_activity_logs
WHERE user_activity_logs.created_at >= (now() - '30 days'::interval)
GROUP BY 
    date(user_activity_logs.created_at), 
    user_activity_logs.action_type, 
    user_activity_logs.resource_type, 
    EXTRACT(hour FROM user_activity_logs.created_at)
ORDER BY date(user_activity_logs.created_at) DESC;

-- Create index on materialized view
CREATE INDEX idx_activity_stats_date ON activity_stats(activity_date);
CREATE INDEX idx_activity_stats_action ON activity_stats(action_type);

-- Materialized view for student billing summary
CREATE MATERIALIZED VIEW mv_student_billing_summary AS
SELECT 
    s.id AS student_id,
    s.student_name,
    s.roll_number,
    count(DISTINCT b.id) AS total_bills,
    COALESCE(sum(b.final_amount), 0::numeric) AS total_bill_amount,
    COALESCE(sum(b.balance_amount), 0::numeric) AS total_outstanding,
    count(DISTINCT CASE
        WHEN b.status = 'paid' THEN b.id
        ELSE NULL::uuid
    END) AS paid_bills,
    count(DISTINCT CASE
        WHEN b.status = 'unpaid' THEN b.id
        ELSE NULL::uuid
    END) AS unpaid_bills,
    count(DISTINCT CASE
        WHEN b.status = 'partially_paid' THEN b.id
        ELSE NULL::uuid
    END) AS partially_paid_bills,
    count(DISTINCT CASE
        WHEN b.status = 'overdue' THEN b.id
        ELSE NULL::uuid
    END) AS overdue_bills,
    count(DISTINCT r.id) AS total_receipts,
    COALESCE(sum(r.payment_amount), 0::numeric) AS total_receipt_amount,
    count(DISTINCT ref.id) AS total_refunds,
    COALESCE(sum(CASE
        WHEN ref.approval_status = 'processed' THEN ref.refund_amount
        ELSE 0::numeric
    END), 0::numeric) AS total_processed_refunds,
    max(r.receipt_date) AS last_payment_date,
    max(b.updated_at) AS last_bill_update,
    now() AS summary_generated_at
FROM students s
LEFT JOIN billing_student_bills b ON s.id = b.student_id
LEFT JOIN billing_receipts r ON s.id = r.student_id
LEFT JOIN billing_refunds ref ON r.id = ref.receipt_id
GROUP BY s.id, s.student_name, s.roll_number;

-- Create indexes on materialized view
CREATE INDEX idx_billing_summary_student_id ON mv_student_billing_summary(student_id);
CREATE INDEX idx_billing_summary_outstanding ON mv_student_billing_summary(total_outstanding);

-- =============================================
-- Refresh Policies for Materialized Views
-- =============================================

-- Note: These should be scheduled as cron jobs or through pg_cron extension
-- Example (requires pg_cron extension):
-- SELECT cron.schedule('refresh-activity-stats', '0 */6 * * *', 'REFRESH MATERIALIZED VIEW activity_stats;');
-- SELECT cron.schedule('refresh-billing-summary', '0 2 * * *', 'REFRESH MATERIALIZED VIEW mv_student_billing_summary;'); 