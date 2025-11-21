# HDFC Payment Gateway Corrections
**Date:** 2025-01-21
**Category:** Bug Fix
**Module:** Billing / Payment Gateway
**Priority:** Critical

---

## Issue Summary

The HDFC SmartGateway payment integration had several critical bugs preventing successful payment processing:

1. ❌ **IP Whitelisting Error** - Server IP not whitelisted (BAD_ORIGIN error)
2. ❌ **Wrong API Endpoint** - Order Status API using incorrect path `/v1/orders/` instead of `/orders/`
3. ❌ **Wrong Status Check** - Checking for 'PAID' status instead of 'CHARGED'
4. ❌ **Incomplete Status Mapping** - Not handling all HDFC transaction statuses
5. ❌ **Outdated Type Definitions** - TypeScript types not matching actual HDFC API responses
6. ❌ **Incorrect Webhook Structure** - Webhook payload structure not matching HDFC documentation

---

## Root Cause Analysis

### 1. IP Whitelisting (403 Forbidden)

**Error:**
```
Error: HDFC API error: 403 - {
  "error_info": {
    "code": "BAD_ORIGIN",
    "developer_message": "IP Verification Failed"
  }
}
```

**Cause:** Vercel's outgoing IP address not whitelisted in HDFC merchant dashboard

**Solution:**
- Created `/api/debug/check-ip` endpoint to detect server IP
- Improved error detection to catch BAD_ORIGIN errors specifically
- Added automatic IP logging when this error occurs
- Documented IP whitelisting process

### 2. Wrong API Endpoint

**Before:**
```typescript
const hdfcStatus = await this.callHDFCApi<HDFCOrderStatusResponse>(
  `/v1/orders/${transaction.transaction_ref}`,  // ❌ Wrong path
  'GET'
);
```

**After:**
```typescript
const hdfcStatus = await this.callHDFCApi<HDFCOrderStatusResponse>(
  `/orders/${transaction.transaction_ref}`,  // ✅ Correct path
  'GET'
);
```

**Impact:** Order Status API calls were failing, preventing payment verification

---

## Files Changed

### 1. Type Definitions Updated

**File:** `types/payment-gateway.ts`

#### A. HDFCOrderStatusResponse

**Before:** Minimal structure with generic fields
```typescript
export interface HDFCOrderStatusResponse {
  order_id: string;
  order_status: string;
  order_amount: number;
  payment_session_id: string;
  payment?: {...};
}
```

**After:** Complete structure matching HDFC documentation
```typescript
export interface HDFCOrderStatusResponse {
  id: string;                      // HDFC internal order ID
  order_id: string;                // Our transaction reference
  status: string;                  // CHARGED, PENDING_VBV, etc.
  status_id: number;               // 21 = CHARGED, 26 = FAILED, etc.
  amount: number;
  currency: string;
  date_created: string;
  customer_email: string;
  customer_phone: string;
  customer_id: string;
  txn_id?: string;
  txn_uuid?: string;
  payment_method_type?: string;    // CARD, NB, WALLET, UPI
  payment_method?: string;         // VISA, MASTERCARD, etc.
  payment_gateway_response?: {...};
  card?: {...};
  upi?: {...};
  refunded?: boolean;
  amount_refunded?: number;
  // ... and more fields
}
```

#### B. HDFCWebhookPayload

**Before:** Generic event structure
```typescript
export interface HDFCWebhookPayload {
  event_type: string;
  event_id: string;
  data: {
    order: {...};
    payment: {...};
  };
}
```

**After:** Actual HDFC webhook structure
```typescript
export interface HDFCWebhookPayload {
  id: string;                  // Event ID
  date_created: string;
  event_name: string;          // ORDER_SUCCEEDED, etc.
  content: {
    order: {
      id: string;
      order_id: string;
      status: string;          // CHARGED, etc.
      status_id: number;       // 21, 26, etc.
      amount: number;
      txn_id?: string;
      payment_method?: string;
      // ... complete order details
    };
  };
}
```

---

### 2. Payment Gateway Service Fixed

**File:** `lib/services/billing/payment-gateway-service.ts`

#### A. Status Mapping (Lines 546-568)

**Before:**
```typescript
if (hdfcStatus.order_status === 'PAID') {
  newStatus = 'success';
} else if (hdfcStatus.order_status === 'FAILED') {
  newStatus = 'failed';
}
```

**After:** Complete status mapping
```typescript
// Map HDFC status to our internal status
if (hdfcStatus.status === 'CHARGED' || hdfcStatus.status_id === 21) {
  newStatus = 'success';
} else if (
  hdfcStatus.status === 'AUTHENTICATION_FAILED' ||
  hdfcStatus.status === 'AUTHORIZATION_FAILED' ||
  hdfcStatus.status === 'JUSPAY_DECLINED' ||
  hdfcStatus.status === 'CAPTURE_FAILED' ||
  hdfcStatus.status === 'VOID_FAILED' ||
  [22, 26, 27, 33, 34].includes(hdfcStatus.status_id)
) {
  newStatus = 'failed';
} else if (hdfcStatus.status === 'VOIDED' || hdfcStatus.status_id === 31) {
  newStatus = 'cancelled';
} else if (hdfcStatus.status === 'AUTO_REFUNDED' || hdfcStatus.status_id === 36) {
  newStatus = 'refunded';
} else if (
  ['PENDING_VBV', 'AUTHORIZING', 'VOID_INITIATED', 'CAPTURE_INITIATED', 'STARTED'].includes(hdfcStatus.status) ||
  [23, 28, 32, 33, 20].includes(hdfcStatus.status_id)
) {
  newStatus = 'processing';
}
```

#### B. Transaction Update (Lines 570-593)

**Before:**
```typescript
gateway_transaction_id: hdfcStatus.payment?.payment_id,
payment_method: hdfcStatus.payment?.payment_method,
payment_date: hdfcStatus.payment?.payment_time,
```

**After:**
```typescript
gateway_transaction_id: hdfcStatus.txn_id || hdfcStatus.txn_uuid,
payment_method: hdfcStatus.payment_method,
payment_date: hdfcStatus.date_created,
completed_at: ['success', 'failed', 'cancelled', 'refunded'].includes(newStatus)
  ? new Date().toISOString()
  : null,
```

#### C. Webhook Handler (Lines 313-386)

**Before:**
```typescript
logger.info('Processing webhook', {
  event_type: payload.event_type,
  order_id: payload.data.order.order_id,
});

switch (payload.event_type) {
  case 'PAYMENT_SUCCESS':
    newStatus = 'success';
    break;
  case 'PAYMENT_FAILED':
    newStatus = 'failed';
    break;
}
```

**After:**
```typescript
logger.info('Processing webhook', {
  event_name: payload.event_name,
  order_id: payload.content.order.order_id,
});

const orderStatus = payload.content.order.status;
const statusId = payload.content.order.status_id;

if (orderStatus === 'CHARGED' || statusId === 21 || payload.event_name === 'ORDER_SUCCEEDED') {
  newStatus = 'success';
} else if (['AUTHENTICATION_FAILED', 'AUTHORIZATION_FAILED', ...].includes(orderStatus)) {
  newStatus = 'failed';
}
// ... complete status mapping
```

#### D. Improved Error Detection (Lines 703-741)

**Added:** BAD_ORIGIN error detection with automatic IP logging
```typescript
if (response.status === 403) {
  let isIpError = false;
  try {
    const errorJson = JSON.parse(errorText);
    if (
      errorJson.error_info?.code === 'BAD_ORIGIN' ||
      errorJson.error_info?.developer_message?.includes('IP Verification Failed')
    ) {
      isIpError = true;
    }
  } catch (e) {}

  if (isIpError) {
    const ipResponse = await fetch('https://api.ipify.org?format=json');
    const ipData = await ipResponse.json();
    logger.error('HDFC API blocked - IP not whitelisted', {
      current_vercel_ip: ipData.ip,
      message: `🚨 URGENT: Add this IP to HDFC whitelist: ${ipData.ip}`,
      instructions: 'Login to HDFC SmartGateway → Settings → Security → IP Whitelist'
    });
  }
}
```

---

## Documentation Created

### 1. Complete API Documentation

**File:** `docs/api/HDFC-SmartGateway-API-Documentation.md`

Comprehensive 500+ line documentation covering:
- Authentication & Headers
- Session API (creating payment sessions)
- Order Status API (checking payment status)
- Complete Transaction Status List (15+ statuses with status_ids)
- Payment Response Handling (3-step verification)
- Webhooks (configuration, authentication, retry logic)
- HMAC Signature Verification
- Security & Best Practices
- Production Checklist
- Quick Reference Guide

### 2. Fix Documentation

**File:** `docs/fixes/2025-01/2025-01-21-FIX-hdfc-payment-gateway-corrections.md` (this file)

---

## HDFC Transaction Status Reference

| Status ID | Status Name | Internal Mapping | Action |
|-----------|-------------|------------------|--------|
| **10** | NEW | initiated | Wait for payment |
| **21** | CHARGED | ✅ success | Create receipt & fulfill |
| **23** | PENDING_VBV | processing | Poll for updates |
| **25** | AUTHORIZED | success | Capture payment |
| **26** | AUTHENTICATION_FAILED | ❌ failed | Allow retry |
| **27** | AUTHORIZATION_FAILED | ❌ failed | Allow retry |
| **28** | AUTHORIZING | processing | Poll for updates |
| **31** | VOIDED | cancelled | Update records |
| **36** | AUTO_REFUNDED | refunded | Update records |
| **22** | JUSPAY_DECLINED | ❌ failed | Technical issue |
| **32** | VOID_INITIATED | processing | Poll for updates |
| **33** | CAPTURE_INITIATED / VOID_FAILED | processing / failed | Check context |
| **34** | CAPTURE_FAILED | ❌ failed | Retry capture |

---

## Testing Checklist

### Before Testing

- [ ] Get Vercel outgoing IP: Visit `/api/debug/check-ip`
- [ ] Whitelist IP in HDFC Dashboard: Settings → Security → IP Whitelist
- [ ] Wait 10 minutes for IP propagation
- [ ] Verify environment variables are set correctly

### Test Scenarios

#### 1. Successful Payment Flow
```
1. Select bills to pay
2. Click "Pay Online"
3. Complete payment on HDFC page
4. Verify redirect back to site
5. Check transaction status = CHARGED
6. Verify receipt created automatically
7. Check bill status updated to paid
```

#### 2. Failed Payment Flow
```
1. Select bills to pay
2. Click "Pay Online"
3. Cancel or fail payment
4. Verify redirect back to site
5. Check transaction status = failed/cancelled
6. Verify no receipt created
7. Check bill status remains unpaid
```

#### 3. Webhook Testing
```
1. Configure webhook URL in HDFC Dashboard
2. Complete a test payment
3. Check server logs for webhook receipt
4. Verify webhook authentication works
5. Confirm transaction updated from webhook
6. Test idempotency (duplicate webhooks)
```

#### 4. Order Status API
```
1. Create payment session
2. Complete payment
3. Call Order Status API
4. Verify status = CHARGED (21)
5. Check all response fields populated
6. Verify payment_method, txn_id, etc.
```

---

## Deployment Steps

### 1. Environment Configuration

Ensure these are set in Vercel:
```bash
HDFC_MERCHANT_ID=SG3726
HDFC_PAYMENT_PAGE_CLIENT_ID=SG3726
HDFC_API_KEY=your_api_key
HDFC_API_SECRET=your_api_secret
HDFC_RESPONSE_KEY=your_response_key
HDFC_BASE_URL=https://smartgateway.hdfcuat.bank.in  # or production URL
HDFC_TEST_MODE=true  # or false for production
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
```

### 2. IP Whitelisting

1. Deploy to Vercel
2. Visit: `https://your-domain.vercel.app/api/debug/check-ip`
3. Copy the IP address shown
4. Login to HDFC SmartGateway Dashboard
5. Navigate to: **Settings → Security → IP Whitelist**
6. Add the IP address
7. Save and wait 10 minutes

### 3. Webhook Configuration

1. Login to HDFC Dashboard
2. Go to: **Payments → Settings → Webhook Tab**
3. Set Webhook URL: `https://your-domain.vercel.app/api/billing/payment/webhook`
4. Configure Basic Auth credentials
5. Enable events: **ORDER_SUCCEEDED**
6. Save configuration

### 4. Test in Sandbox

1. Use sandbox credentials
2. Complete test transactions
3. Verify all flows work
4. Check logs for errors
5. Test webhook delivery

### 5. Production Deployment

1. Switch to production credentials
2. Update HDFC_BASE_URL to production
3. Set HDFC_TEST_MODE=false
4. Repeat IP whitelisting for production IPs
5. Update webhook URL in production dashboard
6. Complete test transaction
7. Monitor first real transactions closely

---

## Monitoring & Logging

### Key Log Points

1. **Payment Initiation:**
```
[billing/payment-api] Initiating payment session
[billing/payment-gateway] Creating payment session
```

2. **HDFC API Call:**
```
[billing/payment-gateway] HDFC API response received
```

3. **IP Whitelisting Error:**
```
[billing/payment-gateway] HDFC API blocked - IP not whitelisted
🚨 URGENT: Add this IP to HDFC whitelist: XX.XX.XX.XX
```

4. **Webhook Received:**
```
[billing/payment-gateway] Processing webhook
[billing/payment-gateway] Webhook processed successfully
```

5. **Receipt Creation:**
```
[billing/payment-gateway] Receipt created successfully
```

### Error Monitoring

Watch for these errors:
- **403 BAD_ORIGIN** - IP not whitelisted
- **401 Unauthorized** - Invalid credentials
- **400 Bad Request** - Invalid parameters
- **Transaction not found** - Webhook for unknown order
- **Invalid webhook signature** - Authentication failure

---

## Known Limitations

### 1. Dynamic IPs on Vercel

**Issue:** Vercel may change outgoing IPs without notice

**Impact:** Payments will fail with BAD_ORIGIN error

**Mitigation:**
- Monitor for 403 errors
- Automated IP detection logs the new IP
- Consider static IP proxy for production

**Long-term Solution:**
- Use QuotaGuard or similar static IP service
- Route all HDFC API calls through static IP
- Cost: ~$10-50/month

### 2. Webhook Retries

**Issue:** HDFC retries webhooks on non-200 responses

**Impact:** May receive duplicate webhooks

**Handling:**
- Implement idempotency using `event.id` or `order_id`
- Check if transaction already processed
- Return 200 immediately after validation

### 3. Pending Status Polling

**Issue:** Some payments stay in PENDING_VBV or AUTHORIZING

**Recommended:** Implement status polling
- Poll every 15 seconds for first 90 seconds
- Then at 2, 5, 10, 20 minutes
- Then hourly up to 24 hours
- Stop when status becomes CHARGED or failed

---

## Rollback Plan

If issues occur after deployment:

1. **Immediate:** Disable online payment button in UI
2. **Check:** Review error logs for specific failures
3. **Verify:** IP whitelisting status in HDFC dashboard
4. **Test:** Use `/api/debug/check-ip` to confirm IP
5. **Fallback:** Direct users to manual payment methods
6. **Fix:** Address specific error and re-test
7. **Deploy:** Roll forward with fix

---

## Success Metrics

### Pre-Fix (Baseline)
- Payment Success Rate: 0% (all failing with 403)
- Order Status API: Failing (wrong endpoint)
- Webhook Processing: Unknown (incorrect structure)

### Post-Fix (Expected)
- Payment Success Rate: >95% (after IP whitelisting)
- Order Status API: 100% success rate
- Webhook Processing: 100% success rate
- Receipt Auto-Creation: 100% for successful payments

### Monitoring KPIs
- Track 403 errors (should be 0 after whitelisting)
- Monitor CHARGED status conversions
- Webhook delivery success rate
- Receipt creation lag time
- Failed payment reasons

---

## References

- [HDFC SmartGateway API Documentation](docs/api/HDFC-SmartGateway-API-Documentation.md)
- [Payment Gateway Service](lib/services/billing/payment-gateway-service.ts)
- [Payment Gateway Types](types/payment-gateway.ts)
- [IP Check Endpoint](app/api/debug/check-ip/route.ts)
- Official HDFC Docs: https://smartgateway.hdfcbank.com/docs/

---

## Changelog

**2025-01-21:**
- ✅ Fixed Order Status API endpoint (removed `/v1/`)
- ✅ Updated status checking (PAID → CHARGED)
- ✅ Added complete status mapping for all 15+ HDFC statuses
- ✅ Updated TypeScript types to match HDFC responses
- ✅ Fixed webhook payload structure
- ✅ Improved error detection for IP whitelisting
- ✅ Added automatic IP logging on BAD_ORIGIN errors
- ✅ Created comprehensive API documentation
- ✅ Documented deployment and testing procedures

---

**Status:** ✅ Ready for Testing (pending IP whitelisting)
**Next Steps:** Whitelist Vercel IP in HDFC Dashboard
**Estimated Impact:** Enables functional online payment processing
