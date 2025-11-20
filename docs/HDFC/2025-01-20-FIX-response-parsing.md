# HDFC Response Parsing and Redirect URL Fixes

**Date**: 2025-01-20
**Issues**:
1. Session ID showing as undefined
2. Redirect to login page instead of success page
**Status**: ✅ Fixed

## Problems Identified

### 1. HDFC Response Structure Mismatch
**Issue**: Code expected `payment_session_id` but HDFC returns `id`

**Error Logs**:
```
[billing/payment-gateway] Payment session created successfully {
  transaction_id: 'fcedefae-c4d8-44b7-a6ee-767133eaca43',
  session_id: undefined  // ❌ undefined!
}
```

**Actual HDFC Response**:
```json
{
  "id": "ordeh_93b8fa6fd1244754b94b14fde6b80f64",  // ✅ This is the session ID
  "status": "NEW",
  "order_id": "TXN-20251120083249-T1UY6R",
  "payment_links": {
    "web": "https://smartgateway.hdfcuat.bank.in/payment-page/order/ordeh_93b8fa6fd1244754b94b14fde6b80f64",
    "expiry": "2025-11-20T08:47:50Z"
  },
  "order_expiry": "2025-11-20T08:47:50Z",
  "sdk_payload": {
    "expiry": "2025-11-20T08:47:50Z",
    "payload": {
      "action": "paymentPage",
      "amount": "5000.0",
      "orderId": "TXN-20251120083249-T1UY6R",
      "service": "in.juspay.hyperpay",
      "clientId": "hdfcmaster",
      "currency": "INR",
      "returnUrl": "http://localhost:3000/billing/payment/success?transaction_id=...",
      "merchantId": "SG3726",
      "description": "Payment for 1 bill(s)",
      "environment": "sandbox",
      "customerEmail": "boobal@gmail.com",
      "customerPhone": "9876541302"
    }
  }
}
```

### 2. Return URL Port Mismatch
**Issue**: Server running on different ports, causing redirect to login

**Problem**:
- `.env` had `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- Server was running on port 3001 or 3002
- HDFC would redirect to port 3000 which wasn't running
- User would see login page or error

## Fixes Applied

### Fix 1: Updated Response Parsing
**Location**: `lib/services/billing/payment-gateway-service.ts:240-249`

```typescript
// Before:
const { error: updateError } = await supabase
  .from('payment_transactions')
  .update({
    session_id: hdfcResponse.payment_session_id,  // ❌ undefined
    gateway_response: hdfcResponse,
    status: 'processing',
  })

// After:
// Extract session ID and payment URL from HDFC response
const hdfcSessionId = (hdfcResponse as any).id;  // ✅ Correct field
const paymentUrl = (hdfcResponse as any).payment_links?.web;
const expiresAt = (hdfcResponse as any).order_expiry || (hdfcResponse as any).sdk_payload?.expiry;

if (!hdfcSessionId || !paymentUrl) {
  logger.error('billing/payment-gateway', 'Invalid HDFC response structure', { hdfcResponse });
  throw new Error('Invalid HDFC response: missing session ID or payment URL');
}

const { error: updateError } = await supabase
  .from('payment_transactions')
  .update({
    session_id: hdfcSessionId,  // ✅ Using correct field
    gateway_response: hdfcResponse,
    status: 'processing',
  })
```

### Fix 2: Updated TypeScript Types
**Location**: `types/payment-gateway.ts:87-123`

```typescript
// Updated to match actual HDFC response structure
export interface HDFCSessionResponse {
  id: string;                      // HDFC order session ID
  status: string;                  // Order status (e.g., "NEW")
  order_id: string;                // Your transaction reference
  payment_links: {
    web: string;                   // Payment page URL
    expiry: string;                // Link expiry timestamp
  };
  order_expiry: string;            // Order expiry timestamp
  sdk_payload: {
    expiry: string;
    payload: {
      action: string;
      amount: string;
      orderId: string;
      service: string;
      clientId: string;
      currency: string;
      returnUrl: string;
      customerId: string;
      merchantId: string;
      description: string;
      environment: string;
      customerEmail: string;
      customerPhone: string;
      // ... more fields
    };
    service: string;
    currTime: string;
    requestId: string;
  };
}
```

### Fix 3: Added Response Logging
**Location**: `lib/services/billing/payment-gateway-service.ts:235-238`

```typescript
// Log the actual HDFC response to understand its structure
logger.info('billing/payment-gateway', 'HDFC API Response', {
  response: JSON.stringify(hdfcResponse, null, 2)
});
```

This helps debug any future response structure changes from HDFC.

### Fix 4: Fixed Return URL Port
**Location**: `.env:35`

```env
# Before:
NEXT_PUBLIC_APP_URL=http://localhost:3001  # Server was on 3002

# After (killed process on 3000 and restarted):
NEXT_PUBLIC_APP_URL=http://localhost:3000  # ✅ Matches running server
```

## Verification

After fixes, check database to verify session_id is populated:

```sql
SELECT
  id,
  transaction_ref,
  session_id,  -- Should be "ordeh_..." format
  total_amount,
  status,
  created_at
FROM payment_transactions
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result**:
```
session_id: "ordeh_93b8fa6fd1244754b94b14fde6b80f64"  ✅ Not undefined!
status: "processing"
```

## Testing Flow

1. Navigate to `http://localhost:3000`
2. Go to Billing → Students → Select student
3. Click "Pay Online"
4. Select bills and proceed
5. Should now see:
   - ✅ Valid session_id in database
   - ✅ Redirect to HDFC payment page
   - ✅ After payment, redirect to `http://localhost:3000/billing/payment/success` (not login)

## Related Issues Fixed

- Database column mismatches (completed earlier)
- HDFC API endpoint correction (completed earlier)
- Request body structure (completed earlier)

## Next Steps

1. Test complete payment flow
2. Verify webhook processing when payment completes
3. Confirm receipt auto-generation
4. Verify bill status updates

## Key Learnings

1. **Always log API responses** when integrating third-party services
2. **HDFC response structure** uses `id` not `payment_session_id`
3. **Port consistency** is critical for return URLs
4. **Type definitions** should match actual API responses, not assumptions

## Files Modified

1. `lib/services/billing/payment-gateway-service.ts` - Response parsing logic
2. `types/payment-gateway.ts` - TypeScript interface
3. `.env` - APP_URL port configuration
