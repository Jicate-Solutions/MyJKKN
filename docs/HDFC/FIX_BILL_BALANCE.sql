-- Fix Bill Balance Issues
-- Purpose: Ensure all bills have proper bill_balance values

-- ============================================================================
-- 1. Check for NULL or Invalid bill_balance
-- ============================================================================
SELECT
  id,
  bill_number,
  total_amount,
  bill_balance,
  status,
  CASE
    WHEN bill_balance IS NULL THEN 'NULL'
    WHEN bill_balance < 0 THEN 'NEGATIVE'
    WHEN bill_balance > total_amount THEN 'EXCEEDS_TOTAL'
    ELSE 'OK'
  END as balance_status
FROM billing_student_bills
WHERE
  bill_balance IS NULL
  OR bill_balance < 0
  OR bill_balance > total_amount
ORDER BY created_at DESC;

-- ============================================================================
-- 2. Fix NULL bill_balance (set to total_amount for unpaid bills)
-- ============================================================================
UPDATE billing_student_bills
SET bill_balance = total_amount
WHERE bill_balance IS NULL
  AND status IN ('pending', 'unpaid', 'overdue', 'partial');

-- ============================================================================
-- 3. Fix bill_balance for paid bills (should be 0)
-- ============================================================================
UPDATE billing_student_bills
SET bill_balance = 0
WHERE status = 'paid'
  AND bill_balance != 0;

-- ============================================================================
-- 4. Recalculate bill_balance based on receipts
-- ============================================================================
-- This ensures bill_balance = total_amount - sum(receipt payments)

WITH payment_summary AS (
  SELECT
    ri.bill_id,
    SUM(ri.amount_paid) as total_paid
  FROM billing_receipt_items ri
  JOIN billing_receipts r ON ri.receipt_id = r.id
  GROUP BY ri.bill_id
)
UPDATE billing_student_bills b
SET bill_balance = b.total_amount - COALESCE(ps.total_paid, 0)
FROM payment_summary ps
WHERE b.id = ps.bill_id;

-- ============================================================================
-- 5. Update bill status based on bill_balance
-- ============================================================================
UPDATE billing_student_bills
SET status = CASE
  WHEN bill_balance = 0 THEN 'paid'
  WHEN bill_balance < total_amount AND bill_balance > 0 THEN 'partial'
  WHEN bill_balance = total_amount AND due_date < CURRENT_DATE THEN 'overdue'
  WHEN bill_balance = total_amount THEN 'pending'
  ELSE status
END
WHERE status != 'cancelled';

-- ============================================================================
-- 6. Verify Fix - Check Current Status
-- ============================================================================
SELECT
  status,
  COUNT(*) as count,
  SUM(total_amount) as total_amount,
  SUM(bill_balance) as total_balance
FROM billing_student_bills
GROUP BY status
ORDER BY status;

-- ============================================================================
-- 7. Find Bills Ready for Online Payment
-- ============================================================================
-- Bills that have balance > 0 and can be paid online
SELECT
  b.id,
  b.bill_number,
  b.total_amount,
  b.bill_balance,
  b.status,
  b.due_date,
  s.first_name || ' ' || s.last_name as student_name
FROM billing_student_bills b
JOIN students s ON b.student_id = s.id
WHERE b.bill_balance > 0
  AND b.status IN ('pending', 'unpaid', 'overdue', 'partial')
ORDER BY b.due_date ASC
LIMIT 10;

-- ============================================================================
-- 8. Create Test Bill (if needed)
-- ============================================================================
-- Uncomment and modify this if you need a test bill

/*
INSERT INTO billing_student_bills (
  student_id,
  institution_id,
  bill_number,
  total_amount,
  bill_balance,
  status,
  due_date,
  billing_period_start,
  billing_period_end
)
VALUES (
  'YOUR_STUDENT_ID_HERE',
  'YOUR_INSTITUTION_ID_HERE',
  'TEST-BILL-' || EXTRACT(EPOCH FROM NOW())::TEXT,
  5000.00,
  5000.00,
  'pending',
  CURRENT_DATE + INTERVAL '30 days',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '30 days'
);
*/
