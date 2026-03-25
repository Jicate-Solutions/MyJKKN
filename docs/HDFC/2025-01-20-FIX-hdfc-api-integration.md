# HDFC API Integration Fixes

**Date**: 2025-01-20
**Issue**: 404 error on HDFC API session endpoint
**Status**: ✅ Fixed

## Problem

HDFC API was returning 404 Not Found error when creating payment sessions:
```
HDFC API error: 404 -
Endpoint: /v1/session
```

## Root Causes

1. **Incorrect API Endpoint**: Using `/v1/session` instead of `/session`
2. **Missing Required Headers**: HDFC requires specific headers (`x-merchantid`, `x-customerid`, `x-resellerid`)
3. **Incorrect Request Body Structure**: Was using nested structure, HDFC expects flat JSON

## Fixes Applied

### 1. Updated API Endpoint
**Location**: `lib/services/billing/payment-gateway-service.ts:230`

```typescript
// Before:
const hdfcResponse = await this.callHDFCApi<HDFCSessionResponse>(
  '/v1/session',  // ❌ Wrong endpoint
  'POST',
  hdfcRequest
);

// After:
const hdfcResponse = await this.callHDFCApi<HDFCSessionResponse>(
  '/session',  // ✅ Correct endpoint
  'POST',
  hdfcRequest
);
```

### 2. Added Required Headers
**Location**: `lib/services/billing/payment-gateway-service.ts:646-652`

```typescript
// Added HDFC-specific headers
const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  'Authorization': `Basic ${authToken}`,
  'x-merchantid': config.merchantId,           // ✅ Required
  'x-customerid': body?.customer_id || 'default_customer',  // ✅ Required
  'x-resellerid': 'hdfc_reseller',            // ✅ Required
};
```

### 3. Fixed Request Body Structure
**Location**: `lib/services/billing/payment-gateway-service.ts:214-227`

```typescript
// Before (Nested structure):
const hdfcRequest: HDFCSessionRequest = {
  order: {
    amount: Math.round(totalAmount * 100),
    currency: 'INR',
    id: transactionRef,
  },
  payment_page_client_id: config.paymentPageClientId,
  customer: {
    email: student.student_email || '',
    phone: student.student_mobile || '',
  },
  success_url: '...',
  failure_url: '...',
};

// After (Flat structure matching HDFC API):
const hdfcRequest: any = {
  order_id: transactionRef,                     // ✅ Flat structure
  amount: totalAmount.toFixed(2),               // ✅ String with 2 decimals
  customer_id: sessionData.student_id,          // ✅ Customer identifier
  customer_email: student.student_email || student.college_email || 'noreply@jkkn.ai',
  customer_phone: student.student_mobile || '',
  payment_page_client_id: config.paymentPageClientId,
  action: 'paymentPage',                        // ✅ Required action
  currency: 'INR',
  return_url: sessionData.return_url || `${appUrl}/billing/payment/success?transaction_id=${transaction.id}`,
  description: `Payment for ${bills.length} bill(s)`,
  first_name: student.first_name || 'Student',
  last_name: student.last_name || '',
};
```

## HDFC API Documentation Reference

Based on official HDFC SmartGateway documentation:

### Endpoints
- **Production**: `https://smartgateway.hdfc.bank.in/session`
- **UAT/Sandbox**: `https://smartgateway.hdfcuat.bank.in/session`

### Required Headers
| Header | Value | Description |
|--------|-------|-------------|
| `Authorization` | `Basic base64(api_key:api_secret)` | Basic auth credentials |
| `Content-Type` | `application/json` | Request content type |
| `x-merchantid` | Merchant ID from HDFC | Your merchant identifier |
| `x-customerid` | Customer/student ID | Unique customer identifier |
| `x-resellerid` | `hdfc_reseller` | Fixed value for reseller |

### Request Body Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `order_id` | string | Yes | Unique order identifier (max 21 chars) |
| `amount` | string | Yes | Amount with up to 2 decimals (e.g., "100.00") |
| `customer_id` | string | Yes | Customer identifier |
| `customer_email` | string | Yes* | Customer email (*required if phone unavailable) |
| `customer_phone` | string | Yes* | Customer phone (*required if email unavailable) |
| `payment_page_client_id` | string | Yes | Payment page client ID |
| `action` | string | Yes | Action type (e.g., "paymentPage") |
| `currency` | string | Yes | Currency code (default: "INR") |
| `return_url` | string | Yes | Success redirect URL |
| `description` | string | No | Payment description |
| `first_name` | string | No | Customer first name |
| `last_name` | string | No | Customer last name |

## Example HDFC API Call (cURL)

```bash
curl --location 'https://smartgateway.hdfcuat.bank.in/session' \
--header 'Authorization: Basic <base64_encoded_key>' \
--header 'Content-Type: application/json' \
--header 'x-merchantid: SG3726' \
--header 'x-customerid: student_123' \
--header 'x-resellerid: hdfc_reseller' \
--data-raw '{
    "order_id": "TXN-2025-001",
    "amount": "5000.00",
    "customer_id": "student_123",
    "customer_email": "student@jkkn.ai",
    "customer_phone": "9876543210",
    "payment_page_client_id": "hdfcmaster",
    "action": "paymentPage",
    "currency": "INR",
    "return_url": "https://portal.jkkn.ai/billing/payment/success",
    "description": "Payment for 2 bill(s)",
    "first_name": "John",
    "last_name": "Doe"
}'
```

## Testing

After these fixes, the payment flow should:

1. ✅ Successfully create payment session with HDFC
2. ✅ Receive payment session ID and payment URL
3. ✅ Redirect user to HDFC gateway for payment
4. ✅ Process payment and receive webhook callback
5. ✅ Auto-create receipt and update bill status

## Next Steps

1. Test payment flow end-to-end
2. Verify HDFC response structure matches our types
3. Test webhook processing
4. Verify receipt auto-generation

## Related Documentation

- Official HDFC API Docs: https://smartgateway.hdfcbank.com/docs/smartgateway-api-reference/docs/apis/session
- UAT Environment: https://smartgateway.hdfcuat.bank.in
- Production Environment: https://smartgateway.hdfc.bank.in

## Configuration

Ensure `.env` has correct values:
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
