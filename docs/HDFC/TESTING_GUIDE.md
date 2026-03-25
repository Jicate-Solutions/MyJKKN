# HDFC SmartGateway Payment Integration - Testing Guide

**Environment**: UAT (User Acceptance Testing)
**Merchant ID**: SG3726
**Payment Page Client ID**: hdfcmaster
**Base URL**: https://smartgateway.hdfcuat.bank.in
**Updated**: 2025-01-20

---

## ✅ Configuration Complete

All HDFC credentials have been configured in your `.env` file:

```env
HDFC_MERCHANT_ID=SG3726
HDFC_PAYMENT_PAGE_CLIENT_ID=hdfcmaster
HDFC_API_KEY=8E8045D3D584A97BCB6204A1E26399
HDFC_API_SECRET=8E8045D3D584A97BCB6204A1E26399
HDFC_RESPONSE_KEY=0B25C9C98964040A45ABC962DF9F8B
HDFC_CARD_ENCODING_KEY=0B25C9C98964040A45ABC962DF9F8B
HDFC_BASE_URL=https://smartgateway.hdfcuat.bank.in
HDFC_TEST_MODE=true
HDFC_ENABLE_LOGGING=false
```

---

## 🔧 Pre-Testing Setup

### 1. Start Development Server

```bash
cd "D:\JKKN\MYJKKN Portal\MyJKKN"
npm run dev
```

Server should start at: http://localhost:3000

### 2. Configure Webhook URL (Important!)

You need to set up the webhook URL in your HDFC dashboard to receive payment notifications.

**For Local Testing (Recommended):**

Use ngrok to expose your localhost:

```bash
# Install ngrok (if not installed)
# Download from: https://ngrok.com/download

# Start ngrok tunnel
ngrok http 3000
```

ngrok will provide a URL like: `https://abc123.ngrok.io`

**Webhook URL to configure in HDFC Dashboard:**
```
https://abc123.ngrok.io/api/billing/payment/webhook
```

**For Production:**
```
https://yourdomain.com/api/billing/payment/webhook
```

### 3. Verify Database Tables

Check that migration was applied successfully:

```sql
-- In Supabase SQL Editor
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('payment_transactions', 'payment_transaction_items');
```

Should return 2 rows.

---

## 🧪 Testing Workflow

### Test Case 1: Payment Initiation

**Objective**: Verify payment session creation with HDFC

**Steps**:
1. Login to MyJKKN application
2. Navigate to: Billing → Students → [Select a student with unpaid bills]
3. Click "Pay Online" button in the filter section
4. In the modal, select one or more unpaid bills
5. Click "Pay Online" button in the modal
6. Click "Proceed to Payment" in confirmation dialog

**Expected Result**:
- ✅ Payment modal opens with list of unpaid bills
- ✅ Total amount calculates correctly
- ✅ Confirmation dialog shows correct amount
- ✅ Redirects to HDFC SmartGateway payment page
- ✅ HDFC page shows correct order amount

**Database Verification**:
```sql
SELECT * FROM payment_transactions
ORDER BY created_at DESC
LIMIT 1;

-- Status should be 'processing'
-- session_id should be populated
-- gateway_response should contain HDFC session data
```

**API Endpoint Test**:
```bash
# You can also test the API directly
curl -X POST http://localhost:3000/api/billing/payment/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "your-student-uuid",
    "bill_ids": ["bill-uuid-1", "bill-uuid-2"]
  }'
```

---

### Test Case 2: Successful Payment

**Objective**: Complete payment and verify auto-receipt creation

**Steps**:
1. Complete Test Case 1 to reach HDFC payment page
2. On HDFC UAT gateway, use test card details (provided by HDFC)
3. Complete the payment
4. Verify redirect to success page

**Expected Result**:
- ✅ Payment completes successfully on HDFC
- ✅ Redirects to `/billing/payment/success?transaction_id=xxx`
- ✅ Success page displays payment details
- ✅ Shows transaction ID, amount, payment method
- ✅ Webhook processes successfully (check server logs)
- ✅ Receipt auto-generated
- ✅ Bill status updated to "Paid"

**Database Verification**:
```sql
-- Check transaction status
SELECT id, transaction_ref, status, gateway_transaction_id, payment_method
FROM payment_transactions
WHERE id = 'your-transaction-id';
-- Status should be 'success'

-- Check receipt was created
SELECT r.*
FROM billing_receipts r
JOIN payment_transactions pt ON r.transaction_id = pt.gateway_transaction_id
WHERE pt.id = 'your-transaction-id';
-- Should return 1 receipt

-- Check bill status
SELECT id, bill_number, status, bill_balance
FROM billing_student_bills
WHERE id = ANY(ARRAY['bill-uuid-1', 'bill-uuid-2']);
-- Status should be 'paid', bill_balance should be 0
```

**Server Logs to Check**:
```
[billing/payment-gateway] Creating payment session
[billing/payment-gateway] Payment session created successfully
[billing/payment-webhook] Received webhook notification
[billing/payment-webhook] Processing webhook event
[billing/payment-gateway] Processing successful payment
[billing/payment-gateway] Receipt created successfully
[billing/payment-webhook] Webhook processed successfully
```

---

### Test Case 3: Failed Payment

**Objective**: Verify failed payment handling

**Steps**:
1. Complete Test Case 1 to reach HDFC payment page
2. On HDFC UAT gateway, use invalid card or cancel payment
3. Verify redirect to failed page

**Expected Result**:
- ✅ Payment fails on HDFC
- ✅ Redirects to `/billing/payment/failed?transaction_id=xxx`
- ✅ Failed page displays error information
- ✅ Shows helpful error messages and retry option
- ✅ Webhook processes failure correctly

**Database Verification**:
```sql
-- Check transaction status
SELECT id, transaction_ref, status
FROM payment_transactions
WHERE id = 'your-transaction-id';
-- Status should be 'failed' or 'cancelled'

-- Verify no receipt created
SELECT COUNT(*)
FROM billing_receipts
WHERE transaction_id = 'gateway-transaction-id';
-- Should return 0

-- Bill status unchanged
SELECT status, bill_balance
FROM billing_student_bills
WHERE id = 'bill-uuid';
-- Status should still be 'pending' or 'partial'
```

---

### Test Case 4: Payment Status Check

**Objective**: Verify payment status polling

**Steps**:
1. Initiate a payment
2. Before completing payment, call status check API

**API Test**:
```bash
curl http://localhost:3000/api/billing/payment/status/your-transaction-id
```

**Expected Result**:
- ✅ Returns current payment status
- ✅ Updates status from HDFC if changed
- ✅ Shows payment details when available

---

### Test Case 5: Webhook Signature Verification

**Objective**: Ensure webhook security

**Steps**:
1. Send a webhook with invalid signature

**API Test**:
```bash
curl -X POST http://localhost:3000/api/billing/payment/webhook \
  -H "Content-Type: application/json" \
  -H "x-hdfc-signature: invalid-signature" \
  -d '{
    "event_type": "PAYMENT_SUCCESS",
    "event_id": "test-123",
    "event_time": "2025-01-20T10:00:00Z",
    "data": {
      "order": {
        "order_id": "TXN-20250120-ABC123",
        "amount": 10000,
        "currency": "INR",
        "status": "PAID"
      },
      "payment": {
        "payment_id": "PAY-123",
        "payment_method": "card",
        "payment_status": "COMPLETED"
      }
    }
  }'
```

**Expected Result**:
- ✅ Webhook rejects invalid signature
- ✅ Returns error in response
- ✅ No transaction updated

---

### Test Case 6: Multiple Bills Payment

**Objective**: Verify multiple bills can be paid together

**Steps**:
1. Select a student with 3+ unpaid bills
2. Open payment modal
3. Select 3 bills
4. Complete payment

**Expected Result**:
- ✅ All selected bills shown in modal
- ✅ Total amount = sum of all bill balances
- ✅ Payment session created with all bills
- ✅ After successful payment:
  - ✅ All bills marked as "Paid"
  - ✅ All bills have balance = 0
  - ✅ Single receipt created for all bills
  - ✅ Receipt items match selected bills

**Database Verification**:
```sql
-- Check transaction items
SELECT pti.*, b.bill_number, b.total_amount
FROM payment_transaction_items pti
JOIN billing_student_bills b ON pti.bill_id = b.id
WHERE pti.transaction_id = 'your-transaction-id';
-- Should return 3 rows

-- Check all bills paid
SELECT bill_number, status, bill_balance
FROM billing_student_bills
WHERE id = ANY((
  SELECT bill_ids FROM payment_transactions
  WHERE id = 'your-transaction-id'
));
-- All should have status='paid', bill_balance=0
```

---

### Test Case 7: Partial Payment Prevention

**Objective**: Verify full bill balance is required

**Steps**:
1. Try to modify payment amount (if possible)

**Expected Result**:
- ✅ System only allows full bill balance payment
- ✅ Cannot modify amount on client side
- ✅ Server validates amount matches bill balance

---

### Test Case 8: Access Control

**Objective**: Verify students can only pay their own bills

**Steps**:
1. Login as Student A
2. Try to initiate payment for Student B's bills (manually via API)

**API Test**:
```bash
# Login as Student A, try to pay for Student B
curl -X POST http://localhost:3000/api/billing/payment/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "student-b-uuid",
    "bill_ids": ["student-b-bill-uuid"]
  }'
```

**Expected Result**:
- ✅ Returns 403 Forbidden error
- ✅ Error message: "You can only pay for your own bills"
- ✅ No payment session created

---

## 📊 Webhook Testing with Postman/cURL

### Simulate Successful Payment Webhook

```bash
# Replace with actual values
TRANSACTION_REF="TXN-20250120100530-ABC123"
WEBHOOK_SIGNATURE="calculated-hmac-signature"

curl -X POST http://localhost:3000/api/billing/payment/webhook \
  -H "Content-Type: application/json" \
  -H "x-hdfc-signature: $WEBHOOK_SIGNATURE" \
  -d '{
    "event_type": "PAYMENT_SUCCESS",
    "event_id": "evt_test_123456",
    "event_time": "2025-01-20T10:05:30Z",
    "data": {
      "order": {
        "order_id": "'$TRANSACTION_REF'",
        "amount": 50000,
        "currency": "INR",
        "status": "PAID"
      },
      "payment": {
        "payment_id": "pay_hdfc_123456",
        "payment_method": "card",
        "payment_status": "COMPLETED",
        "payment_time": "2025-01-20T10:05:30Z"
      },
      "customer": {
        "email": "student@jkkn.ac.in",
        "phone": "9876543210"
      }
    }
  }'
```

**Note**: You need to calculate the correct HMAC signature using:
```javascript
const crypto = require('crypto');
const payload = {...}; // webhook payload
const signature = crypto
  .createHmac('sha256', '0B25C9C98964040A45ABC962DF9F8B')
  .update(JSON.stringify(payload))
  .digest('hex');
```

---

## 🐛 Common Issues & Solutions

### Issue 1: "Missing HDFC configuration" Error

**Cause**: Environment variables not loaded

**Solution**:
```bash
# Restart development server
npm run dev

# Or check .env file is in project root
ls -la .env
```

### Issue 2: Payment session creation fails

**Cause**: Invalid HDFC credentials or network issue

**Solution**:
- Enable logging: Set `HDFC_ENABLE_LOGGING=true` in `.env`
- Check server logs for HDFC API errors
- Verify credentials with HDFC support

### Issue 3: Webhook not received

**Cause**: Webhook URL not configured or ngrok tunnel closed

**Solution**:
- Verify ngrok is running: `ngrok http 3000`
- Update webhook URL in HDFC dashboard
- Check webhook endpoint health: `curl http://localhost:3000/api/billing/payment/webhook`
  - Should return: `{"service":"HDFC Payment Gateway Webhook","status":"active"}`

### Issue 4: Receipt not auto-generated

**Cause**: Webhook signature invalid or webhook not received

**Solution**:
- Check server logs for webhook processing errors
- Verify HDFC_RESPONSE_KEY is correct
- Test webhook manually with correct signature

### Issue 5: Bill status not updating

**Cause**: Database trigger not working or receipt creation failed

**Solution**:
- Check billing_receipts table for created receipt
- Verify receipt amount matches bill balance
- Check database triggers are active

---

## 📝 Testing Checklist

### Before Testing
- [ ] Environment variables configured in `.env`
- [ ] Database migration applied
- [ ] Development server running
- [ ] ngrok tunnel active (for local testing)
- [ ] Webhook URL configured in HDFC dashboard

### Payment Flow Tests
- [ ] Payment initiation works
- [ ] Redirects to HDFC gateway
- [ ] Successful payment processes correctly
- [ ] Failed payment handles gracefully
- [ ] Cancelled payment shows appropriate message
- [ ] Payment status check returns accurate data

### Data Integrity Tests
- [ ] Transaction record created with correct data
- [ ] Transaction items link to correct bills
- [ ] Receipt auto-generated after successful payment
- [ ] Bill status updates to "Paid"
- [ ] Bill balance becomes zero
- [ ] Invoice auto-generates when bill fully paid

### Security Tests
- [ ] Webhook signature verification works
- [ ] Invalid signatures rejected
- [ ] Students can't pay for other students' bills
- [ ] Unauthenticated users can't access payment APIs

### UI/UX Tests
- [ ] Payment modal displays all unpaid bills
- [ ] Select all checkbox works
- [ ] Total amount calculates correctly
- [ ] Success page shows correct information
- [ ] Failed page provides helpful guidance
- [ ] Mobile responsive design works

---

## 🚀 Moving to Production

### 1. Update Environment Variables

When ready for production:

```env
# Production credentials (get from HDFC)
HDFC_BASE_URL=https://smartgateway.hdfcbank.com
HDFC_TEST_MODE=false
HDFC_ENABLE_LOGGING=false

# Production webhook URL
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### 2. Production Webhook URL

Configure in HDFC production dashboard:
```
https://yourdomain.com/api/billing/payment/webhook
```

### 3. Security Hardening

- [ ] Use HTTPS in production
- [ ] Keep HDFC credentials in secure environment variables
- [ ] Enable rate limiting on payment APIs
- [ ] Monitor payment transactions regularly
- [ ] Set up alerts for failed payments

### 4. Monitoring

Set up monitoring for:
- Payment success/failure rates
- Webhook delivery status
- API response times
- Error rates

---

## 📞 Support

If you encounter issues:

1. **Check Server Logs**: Look for detailed error messages
2. **Enable Debug Logging**: Set `HDFC_ENABLE_LOGGING=true`
3. **Contact HDFC Support**: For API/gateway issues
4. **Review Documentation**: `docs/HDFC/HDFC_PAYMENT_GATEWAY_IMPLEMENTATION_PLAN.md`

---

## ✅ Next Steps After Testing

Once all tests pass:

1. ✅ Complete UAT testing
2. ✅ Get sign-off from stakeholders
3. ✅ Update production environment variables
4. ✅ Deploy to production
5. ✅ Monitor first production payments closely
6. ✅ Train support staff on payment flow
7. ✅ Document any custom configurations

---

**Happy Testing! 🎉**
