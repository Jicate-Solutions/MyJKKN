# HDFC SmartGateway API - Complete Documentation Summary
**Date:** 2025-01-21
**Merchant ID:** SG3726
**Documentation Version:** Basic Auth

---

## Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Session API](#session-api)
4. [Order Status API](#order-status-api)
5. [Transaction Statuses](#transaction-statuses)
6. [Payment Response Handling](#payment-response-handling)
7. [Webhooks](#webhooks)
8. [HMAC Signature Verification](#hmac-signature-verification)
9. [Security & Best Practices](#security--best-practices)

---

## Overview

HDFC SmartGateway is a payment gateway service that enables online payment processing. The integration uses RESTful APIs with Basic Authentication.

### Environment URLs

| Environment | Base URL |
|------------|----------|
| **Sandbox** | `https://smartgateway.hdfcuat.bank.in` |
| **Production** | `https://smartgateway.hdfc.bank.in` |

### IP Whitelisting Required

HDFC requires server IP addresses to be whitelisted in merchant dashboard:

**Production IPs:** 13.126.232.133, 5.154.93.248, 65.2.117.44, 3.110.250.172
**Sandbox IPs:** 52.221.151.249, 13.228.4.195, 13.234.141.165, 3.111.27.223, 3.109.41.51, 13.235.85.36, 3.6.2.61

---

## Authentication

### Method
Basic Authentication using Base64-encoded API Key

### Required Headers

All API calls must include these headers:

```
Authorization: Basic [Base64EncodedAPIKey]
x-merchantid: [Merchant ID from Dashboard]
x-customerid: [Unique Customer Identifier]
x-resellerid: [Reseller ID, e.g., hdfc_reseller]
Content-Type: application/json
```

### Example
```bash
Authorization: Basic MTIzNA==
x-merchantid: SG3726
x-customerid: customer_12345
x-resellerid: hdfc_reseller
```

---

## Session API

### Purpose
Creates a payment session and generates payment URL for customer checkout.

### Endpoint
```
POST /session
```

### Request Body

#### Required Parameters

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| `order_id` | string | Unique order identifier | Max 21 chars, alphanumeric, non-sequential |
| `amount` | string | Transaction amount | Max 2 decimal places (e.g., "100.15") |
| `customer_id` | string | Customer reference | Empty string for guest checkout |
| `customer_email` | string | Customer email | Valid email format |
| `customer_phone` | string | Mobile number | 10 digits, no country code |
| `payment_page_client_id` | string | Client identifier | "hdfcmaster" (sandbox) or Merchant ID (production) |
| `action` | string | Action type | "paymentPage" or "paymentManagement" |
| `return_url` | string | Post-payment redirect URL | HTTPS only, no query params or IPs |

#### Optional Parameters

| Field | Type | Description |
|-------|------|-------------|
| `first_name` | string | Customer first name |
| `last_name` | string | Customer last name |
| `description` | string | Order description |
| `currency` | string | Currency code (default: INR) |
| `udf1` to `udf10` | string | User-defined fields (max 255 chars) |

### Sample Request

```bash
curl --location 'https://smartgateway.hdfcuat.bank.in/session' \
--header 'Authorization: Basic MTIzNA==' \
--header 'Content-Type: application/json' \
--header 'x-merchantid: SG3726' \
--header 'x-customerid: customer_001' \
--header 'x-resellerid: hdfc_reseller' \
--data-raw '{
  "order_id": "TXN-20250121-ABC123",
  "amount": "1500.00",
  "customer_id": "student_001",
  "customer_email": "student@example.com",
  "customer_phone": "9876543210",
  "payment_page_client_id": "hdfcmaster",
  "action": "paymentPage",
  "currency": "INR",
  "return_url": "https://yourdomain.com/api/billing/payment/callback",
  "description": "Payment for student fees",
  "first_name": "John",
  "last_name": "Doe"
}'
```

### Response Structure (HTTP 200)

```json
{
  "status": "NEW",
  "id": "ordeh_3b0bf151fb4944221ab0f",
  "order_id": "TXN-20250121-ABC123",
  "payment_links": {
    "web": "https://smartgatewayuat.hdfcbank.com/orders/ordeh_3b0bf151fb4944221ab0f/payment-page",
    "expiry": "2023-05-12T11:22:02Z"
  },
  "sdk_payload": {
    "requestId": "req_123",
    "service": "in.juspay.hyperpay",
    "payload": {
      "clientId": "hdfcmaster",
      "amount": "1500.00",
      "merchantId": "SG3726",
      "clientAuthToken": "token_xyz",
      "clientAuthTokenExpiry": "2023-05-12T12:22:02Z",
      "environment": "sandbox",
      "action": "paymentPage",
      "customerId": "student_001",
      "returnUrl": "https://yourdomain.com/api/billing/payment/callback",
      "currency": "INR",
      "firstName": "John",
      "lastName": "Doe",
      "customerPhone": "9876543210",
      "customerEmail": "student@example.com",
      "orderId": "TXN-20250121-ABC123",
      "description": "Payment for student fees"
    },
    "expiry": "2023-05-12T12:22:02Z"
  }
}
```

### Error Responses

| Status | Error Code | Message |
|--------|-----------|---------|
| 400 | BAD_REQUEST | Mandatory fields missing |
| 401 | access_denied | Unauthorized |
| 403 | BAD_ORIGIN | IP not whitelisted |
| 500 | INTERNAL_ERROR | Server error |

---

## Order Status API

### Purpose
Retrieves current payment status and transaction details for an order.

### Endpoint
```
GET /orders/{order_id}
```

### Path Parameters
- `order_id`: The order identifier used when creating the session

### Sample Request

```bash
curl --location 'https://smartgateway.hdfcuat.bank.in/orders/TXN-20250121-ABC123' \
--header 'Authorization: Basic MTIzNA==' \
--header 'x-merchantid: SG3726' \
--header 'x-customerid: customer_001' \
--header 'x-resellerid: hdfc_reseller' \
--header 'Content-Type: application/json'
```

### Response Structure (HTTP 200)

```json
{
  "id": "ordeh_3b0bf151fb4944221ab0f",
  "order_id": "TXN-20250121-ABC123",
  "status": "CHARGED",
  "status_id": 21,
  "amount": 1500.00,
  "currency": "INR",
  "date_created": "2023-05-12T10:22:02Z",
  "customer_email": "student@example.com",
  "customer_phone": "9876543210",
  "customer_id": "student_001",
  "merchant_id": "SG3726",
  "return_url": "https://yourdomain.com/api/billing/payment/callback",
  "txn_id": "TXN123456789",
  "txn_uuid": "uuid-123-456-789",
  "payment_method_type": "CARD",
  "payment_method": "VISA",
  "auth_type": "THREE_DS",
  "payment_gateway_response": {
    "resp_code": "00",
    "resp_message": "SUCCESS",
    "rrn": "123456789012",
    "epg_txn_id": "EPG123456",
    "auth_id_code": "AUTH123"
  },
  "refunded": false,
  "amount_refunded": 0.00,
  "card": {
    "last_four_digits": "1234",
    "card_brand": "VISA",
    "card_type": "CREDIT",
    "card_isin": "412345",
    "expiry_month": "12",
    "expiry_year": "2025",
    "name_on_card": "JOHN DOE"
  },
  "udf1": "custom_value_1",
  "udf2": "custom_value_2"
}
```

### When to Call Order Status API

1. **After Return URL Redirect** - Mandatory server-to-server verification
2. **Webhook Verification** - Additional check for webhook accuracy
3. **Status Polling** - For pending transactions

---

## Transaction Statuses

### Complete Status List

| Status ID | Status Name | Description | Category | Action Required |
|-----------|-------------|-------------|----------|-----------------|
| **10** | NEW | Order created, payment not started | Pending | Wait or redirect user |
| **21** | CHARGED | **Payment successful** | Success | Fulfill order |
| **23** | PENDING_VBV | Authentication in progress | Pending | Poll for updates |
| **25** | AUTHORIZED | Pre-authorized (Auth & Capture) | Success | Capture payment |
| **26** | AUTHENTICATION_FAILED | User abandoned/failed auth | Failed | Allow retry |
| **27** | AUTHORIZATION_FAILED | Bank declined | Failed | Allow retry |
| **28** | AUTHORIZING | Awaiting bank response | Pending | Poll for updates |
| **31** | VOIDED | Transaction voided | Final | No action |
| **36** | AUTO_REFUNDED | Automatically refunded | Final | Update records |
| **22** | JUSPAY_DECLINED | Technical failure | Failed | Contact support |
| **20** | STARTED | Gateway routing issue | Pending | Monitor |
| **32** | VOID_INITIATED | Void in progress | Pending | Poll for updates |
| **33** | VOID_FAILED / CAPTURE_INITIATED | Void failed / Capture pending | Various | Check context |
| **34** | CAPTURE_FAILED | Capture failed | Failed | Retry capture |

### Status Categories

- **Success Statuses**: CHARGED (21), AUTHORIZED (25)
- **Failed Statuses**: AUTHENTICATION_FAILED (26), AUTHORIZATION_FAILED (27), JUSPAY_DECLINED (22), VOID_FAILED (33), CAPTURE_FAILED (34)
- **Pending Statuses**: NEW (10), PENDING_VBV (23), AUTHORIZING (28), VOID_INITIATED (32), CAPTURE_INITIATED (33)
- **Final Statuses**: CHARGED (21), VOIDED (31), AUTO_REFUNDED (36), all failed statuses

### Recommended Polling Strategy

For pending transactions, poll at these intervals:

| Time Since Payment | Polling Frequency |
|-------------------|-------------------|
| 0-90 seconds | Every 15 seconds |
| 2 minutes | Once |
| 5 minutes | Once |
| 10 minutes | Once |
| 20 minutes | Once |
| 1 hour | Once |
| 2 hours | Once |
| 6 hours | Once |
| 12 hours | Once |
| 24 hours | Once |

Stop polling when status becomes CHARGED or any failed status.

---

## Payment Response Handling

### Three-Step Verification Process

#### 1. Return URL Redirect
- Customer redirected to `return_url` after payment
- URL contains payment response parameters
- **⚠️ Never trust return URL data alone**

#### 2. Server-to-Server Verification
- **Mandatory**: Call Order Status API from your server
- Verify `order_id` and `amount` match your records
- Check `status` and `status_id` for final status

#### 3. Webhook Notification
- Asynchronous notification sent to your webhook URL
- Provides real-time payment updates
- Recommended for reliability

### Best Practice Flow

```
User completes payment
    ↓
Return URL redirect (with params)
    ↓
YOUR SERVER: Call Order Status API
    ↓
Verify status = CHARGED & amount matches
    ↓
Update database & show success to user
    ↓
Webhook arrives (backup verification)
    ↓
Double-check status & create receipt
```

---

## Webhooks

### Configuration

Configure webhook in Dashboard: **Payments → Settings → Webhook Tab**

**Requirements:**
- HTTPS endpoint only
- Must return HTTP 200 status
- Should be idempotent (handle duplicates)

### Webhook Request Format

```http
POST https://yourdomain.com/api/billing/payment/webhook
Authorization: Basic [Base64_encoded_username:password]
Content-Type: application/json
CustomHeaderName1: CustomHeaderValue1

{
  "id": "evt_123456",
  "date_created": "2023-05-12T10:30:00Z",
  "event_name": "ORDER_SUCCEEDED",
  "content": {
    "order": {
      "id": "ordeh_3b0bf151fb4944221ab0f",
      "order_id": "TXN-20250121-ABC123",
      "status": "CHARGED",
      "status_id": 21,
      "amount": 1500.00,
      "currency": "INR",
      "txn_id": "TXN123456789",
      "payment_method": "VISA",
      "customer_id": "student_001",
      "customer_email": "student@example.com"
    }
  }
}
```

### Webhook Authentication

1. Extract `Authorization` header
2. Base64 decode to get `username:password`
3. Verify credentials match dashboard configuration
4. Check custom headers if configured
5. Return 200 if valid, otherwise 401

### Webhook Events

Primary event: **ORDER_SUCCEEDED**

Triggered when payment is successfully completed (status = CHARGED).

### Retry Logic

- Non-200 responses trigger automatic retries
- Network issues may cause duplicate deliveries
- Implement idempotency using `event_id` or `order_id`

### Response Requirements

```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "received"
}
```

---

## HMAC Signature Verification

### Purpose
Verify authenticity of return URL responses (optional, enable in dashboard).

### Algorithm: HMAC-SHA256

### Verification Steps

1. **Extract Parameters**: Get all query/form parameters from return URL
2. **Exclude**: Remove `signature` and `signature_algorithm` parameters
3. **URL Encode**: Percentage-encode each key and value
4. **Sort**: Alphabetically sort by encoded key (ASCII)
5. **Concatenate**: Join as `key1=value1&key2=value2&...`
6. **Encode Again**: Percentage-encode the entire concatenated string
7. **Generate HMAC**: Use Response Key from dashboard as secret
8. **Compare**: Match with decoded incoming signature

### Example (Pseudocode)

```typescript
function verifyHMACSignature(params: Record<string, string>, signature: string, responseKey: string): boolean {
  // 1. Remove signature params
  const filteredParams = { ...params };
  delete filteredParams.signature;
  delete filteredParams.signature_algorithm;

  // 2. URL encode and sort
  const encoded = Object.entries(filteredParams)
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)])
    .sort(([a], [b]) => a.localeCompare(b));

  // 3. Concatenate
  const paramString = encoded.map(([k, v]) => `${k}=${v}`).join('&');

  // 4. Encode again
  const encodedString = encodeURIComponent(paramString);

  // 5. Generate HMAC
  const hmac = crypto.createHmac('sha256', responseKey);
  hmac.update(encodedString);
  const calculatedSignature = hmac.digest('hex');

  // 6. Compare
  return calculatedSignature === decodeURIComponent(signature);
}
```

### Important Notes

- Only required if "Use signed response" is enabled
- Server-side Order Status API calls don't need signature verification
- Always update Response Key before production deployment

---

## Security & Best Practices

### ✅ DO

1. **Always call Order Status API** after return URL redirect
2. **Verify webhook authenticity** using Basic Auth
3. **Whitelist your server IP** in HDFC dashboard
4. **Use HTTPS** for all URLs (return_url, webhook_url)
5. **Implement idempotency** for webhooks (use event_id)
6. **Store transaction logs** for auditing
7. **Handle status polling** for pending transactions
8. **Use environment variables** for credentials
9. **Validate amounts** match between session creation and Order Status
10. **Return HTTP 200** immediately for webhooks

### ❌ DON'T

1. **Never trust return URL data alone** - Always verify server-side
2. **Don't use query parameters** in return_url
3. **Don't use IP addresses** in return_url
4. **Don't commit credentials** to version control
5. **Don't skip IP whitelisting**
6. **Don't ignore webhook retry logic**
7. **Don't process duplicate webhooks** without idempotency checks
8. **Don't use GET** for webhooks (only POST is sent)
9. **Don't mark payment successful** until status = CHARGED (21)
10. **Don't expose API keys** in client-side code

### Error Handling

```typescript
// Example error handling
try {
  const session = await createHDFCSession(orderData);
  return { success: true, data: session };
} catch (error) {
  if (error.status === 403) {
    // IP not whitelisted
    logger.error('IP not whitelisted - contact HDFC support');
  } else if (error.status === 401) {
    // Authentication failed
    logger.error('Invalid API credentials');
  } else if (error.status === 400) {
    // Bad request
    logger.error('Invalid request parameters', error.details);
  }
  return { success: false, error: error.message };
}
```

### Production Checklist

- [ ] IP address whitelisted in HDFC dashboard
- [ ] Webhook URL configured (HTTPS)
- [ ] Webhook authentication credentials set
- [ ] Response key configured (if using HMAC)
- [ ] Return URL properly configured (HTTPS, no params)
- [ ] Environment variables set in production
- [ ] Order Status API verification implemented
- [ ] Webhook idempotency handling implemented
- [ ] Status polling logic implemented
- [ ] Error logging and monitoring setup
- [ ] Test transactions completed successfully
- [ ] Refund handling implemented (if needed)
- [ ] Customer notification system ready

---

## Quick Reference

### API Endpoints Summary

| API | Method | Endpoint | Purpose |
|-----|--------|----------|---------|
| Session | POST | `/session` | Create payment session |
| Order Status | GET | `/orders/{order_id}` | Get transaction status |

### Key Status Codes

| Status | Status ID | Meaning |
|--------|-----------|---------|
| CHARGED | 21 | ✅ Success - Fulfill order |
| PENDING_VBV | 23 | ⏳ Pending - Wait |
| AUTHENTICATION_FAILED | 26 | ❌ Failed - Retry |
| AUTHORIZATION_FAILED | 27 | ❌ Failed - Retry |

### Critical Headers

```
Authorization: Basic [Base64_API_Key]
x-merchantid: [Your_Merchant_ID]
x-customerid: [Customer_Identifier]
x-resellerid: hdfc_reseller
Content-Type: application/json
```

---

## Support & Resources

- **Merchant Dashboard**: Configure settings, view transactions
- **Support**: Contact HDFC Bank relationship manager
- **Documentation**: https://smartgateway.hdfcbank.com/docs/

**Last Updated**: 2025-01-21
**Document Version**: 1.0
**Integration Status**: Active
