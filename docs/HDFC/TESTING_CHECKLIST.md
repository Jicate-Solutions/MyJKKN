# HDFC Payment Gateway Testing Checklist

## Pre-Testing Setup ✓

- [x] HDFC credentials configured in .env
- [x] Webhook URL configured: https://79ecc7a2a7c736.lhr.life/api/billing/payment/webhook
- [x] Server running on http://localhost:3001
- [x] Database column fixes applied
- [x] NaN display fixed
- [x] HTML hydration error fixed

## Testing Flow

### 1. Login & Navigation
- [ ] Access http://localhost:3001
- [ ] Login successfully
- [ ] Navigate to Billing → Students
- [ ] Select student with unpaid bills

### 2. Payment Initiation
- [ ] Click "Pay Online" button
- [ ] Payment modal opens
- [ ] Bills display with correct amounts (no ₹NaN)
- [ ] Select one or more bills
- [ ] Total amount calculates correctly
- [ ] Click "Proceed to Payment"
- [ ] Confirmation dialog shows correct total
- [ ] No console errors about bill_number/bill_balance

### 3. HDFC Gateway
- [ ] Redirected to HDFC SmartGateway
- [ ] Payment page loads correctly
- [ ] Enter test card: 4111111111111111
- [ ] Expiry: 12/25
- [ ] CVV: 123
- [ ] Click Pay/Submit
- [ ] Enter OTP: 123456
- [ ] Payment processed

### 4. Success Flow
- [ ] Redirected to success page (http://localhost:3001/billing/payment/success?session_id=...)
- [ ] Transaction ID displayed
- [ ] Amount displayed correctly
- [ ] Bill numbers listed
- [ ] Success message shown

### 5. Backend Verification
- [ ] Webhook received (check server logs)
- [ ] Signature verified successfully
- [ ] Payment session updated to 'completed'
- [ ] Receipt auto-created
- [ ] Bill status updated to 'paid'
- [ ] Bill balance updated to 0

### 6. Database Verification
Run these queries to verify:

```sql
-- Check payment session
SELECT * FROM billing_payment_sessions
WHERE student_id = 'YOUR_STUDENT_ID'
ORDER BY created_at DESC LIMIT 1;

-- Check receipt created
SELECT * FROM billing_receipts
WHERE student_id = 'YOUR_STUDENT_ID'
ORDER BY created_at DESC LIMIT 1;

-- Check bill status
SELECT id, bill_description, total_amount, balance_amount, status
FROM billing_student_bills
WHERE student_id = 'YOUR_STUDENT_ID'
AND id IN (SELECT UNNEST(bill_ids) FROM billing_payment_sessions WHERE id = 'SESSION_ID');
```

## Error Scenarios to Test

### Failed Payment
- [ ] Initiate payment
- [ ] Click "Cancel" on HDFC gateway
- [ ] Redirected to failure page
- [ ] Session status = 'failed'
- [ ] Bill status unchanged

### Webhook Signature Failure
- [ ] Send invalid webhook payload
- [ ] Verify 401 Unauthorized response
- [ ] Session not updated

### Duplicate Webhook
- [ ] Send same webhook twice
- [ ] Second call should be idempotent
- [ ] Receipt not duplicated

## Known Issues

### Port Mismatch
- Server running on 3001, not 3000
- Ensure tunnel points to correct port

### Null Balance Amounts
If bills show null balance_amount, run:
```sql
UPDATE billing_student_bills
SET balance_amount = total_amount
WHERE balance_amount IS NULL
  AND status IN ('pending', 'unpaid', 'overdue', 'partial');
```

## Test Results

**Date**: _____________
**Tester**: _____________

### Success Criteria
- [ ] No console errors
- [ ] Payment completes on HDFC
- [ ] Webhook processes successfully
- [ ] Receipt auto-created
- [ ] Bill marked as paid

### Issues Found
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________

### Notes
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________
