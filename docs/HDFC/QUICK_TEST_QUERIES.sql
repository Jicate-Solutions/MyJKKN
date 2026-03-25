-- Quick Test Queries for HDFC Payment Testing
-- Run these in Supabase SQL Editor to verify payment flow

-- ============================================================================
-- 1. Check Latest Payment Transaction
-- ============================================================================
-- Shows the most recent payment transaction created
SELECT
  id,
  transaction_ref,
  session_id,
  status,
  total_amount,
  created_at,
  gateway_response
FROM payment_transactions
ORDER BY created_at DESC
LIMIT 1;

-- Expected after clicking "Pay Online":
-- status = 'processing'
-- session_id = populated with HDFC session ID
-- gateway_response = contains HDFC session data

-- ============================================================================
-- 2. Check Transaction Items (Bills Being Paid)
-- ============================================================================
-- Shows which bills are included in the latest transaction
SELECT
  pti.id,
  pti.amount,
  b.bill_number,
  b.status as bill_status,
  b.bill_balance
FROM payment_transaction_items pti
JOIN billing_student_bills b ON pti.bill_id = b.id
WHERE pti.transaction_id = (
  SELECT id FROM payment_transactions ORDER BY created_at DESC LIMIT 1
);

-- Expected:
-- Shows all bills selected in payment modal

-- ============================================================================
-- 3. Monitor Payment Status Changes
-- ============================================================================
-- Run this query repeatedly to see status updates from webhook
SELECT
  transaction_ref,
  status,
  payment_method,
  gateway_transaction_id,
  payment_date,
  updated_at
FROM payment_transactions
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY updated_at DESC;

-- Status progression:
-- 'initiated' → 'processing' → 'success' (after webhook)

-- ============================================================================
-- 4. Check if Receipt was Auto-Created (After Successful Payment)
-- ============================================================================
SELECT
  r.id as receipt_id,
  r.receipt_number,
  r.payment_amount,
  r.payment_mode,
  r.created_at,
  pt.transaction_ref,
  pt.status as payment_status
FROM billing_receipts r
LEFT JOIN payment_transactions pt
  ON r.transaction_id = pt.gateway_transaction_id
WHERE pt.created_at > NOW() - INTERVAL '1 hour'
ORDER BY r.created_at DESC;

-- Expected after successful payment:
-- One receipt created
-- payment_mode = 'online'
-- Links to payment transaction

-- ============================================================================
-- 5. Verify Bill Status Updated to "Paid"
-- ============================================================================
SELECT
  b.bill_number,
  b.status,
  b.total_amount,
  b.bill_balance,
  b.updated_at
FROM billing_student_bills b
WHERE b.id IN (
  SELECT bill_id
  FROM payment_transaction_items
  WHERE transaction_id = (
    SELECT id FROM payment_transactions ORDER BY created_at DESC LIMIT 1
  )
);

-- Expected after successful payment:
-- status = 'paid'
-- bill_balance = 0
-- updated_at = recently updated

-- ============================================================================
-- 6. Check Receipt Items (Breakdown by Bill)
-- ============================================================================
SELECT
  ri.id,
  ri.amount_paid,
  b.bill_number,
  r.receipt_number
FROM billing_receipt_items ri
JOIN billing_receipts r ON ri.receipt_id = r.id
JOIN billing_student_bills b ON ri.bill_id = b.id
WHERE r.created_at > NOW() - INTERVAL '1 hour'
ORDER BY r.created_at DESC;

-- Expected:
-- One item per bill paid
-- amounts match transaction items

-- ============================================================================
-- 7. Full Transaction Details with Relations
-- ============================================================================
-- Complete view of latest payment with all related data
SELECT
  pt.transaction_ref,
  pt.status,
  pt.total_amount,
  pt.payment_method,
  pt.created_at,
  s.first_name || ' ' || s.last_name as student_name,
  s.roll_number,
  COUNT(pti.id) as bills_count,
  r.receipt_number
FROM payment_transactions pt
JOIN students s ON pt.student_id = s.id
LEFT JOIN payment_transaction_items pti ON pt.id = pti.transaction_id
LEFT JOIN billing_receipts r ON r.transaction_id = pt.gateway_transaction_id
WHERE pt.created_at > NOW() - INTERVAL '1 hour'
GROUP BY pt.id, s.id, r.receipt_number
ORDER BY pt.created_at DESC;

-- ============================================================================
-- 8. Webhook Processing Log (Check for Errors)
-- ============================================================================
-- Note: This requires server logs, not database query
-- Check your server console for these logs:

-- [billing/payment-webhook] Received webhook notification
-- [billing/payment-webhook] Processing webhook event
-- [billing/payment-gateway] Processing successful payment
-- [billing/payment-gateway] Receipt created successfully
-- [billing/payment-webhook] Webhook processed successfully

-- ============================================================================
-- 9. Find Failed/Cancelled Transactions
-- ============================================================================
SELECT
  transaction_ref,
  status,
  total_amount,
  created_at,
  gateway_response
FROM payment_transactions
WHERE status IN ('failed', 'cancelled', 'expired')
  AND created_at > NOW() - INTERVAL '1 day'
ORDER BY created_at DESC;

-- Use this to debug failed payments

-- ============================================================================
-- 10. Payment Analytics (Quick Summary)
-- ============================================================================
SELECT
  status,
  COUNT(*) as count,
  SUM(total_amount) as total_amount
FROM payment_transactions
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY status
ORDER BY count DESC;

-- Shows payment success/failure rates
