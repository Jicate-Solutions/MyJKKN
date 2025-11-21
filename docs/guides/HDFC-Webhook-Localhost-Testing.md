# HDFC Webhook Testing on Localhost
**Date:** 2025-01-21
**Module:** Billing / Payment Gateway
**Purpose:** Configure and test HDFC webhooks during local development

---

## Overview

HDFC SmartGateway sends webhook notifications to your server via HTTPS POST requests. Since localhost isn't accessible from the internet, we need to use a **tunneling service** to expose your local development server.

---

## Option 1: ngrok (Recommended) ⭐

### Why ngrok?
- Free tier available
- Easy to use
- Provides HTTPS URLs
- Shows webhook requests in real-time
- No configuration needed

### Step 1: Install ngrok

**Windows:**
```bash
# Download from https://ngrok.com/download
# Or use chocolatey
choco install ngrok

# Or use scoop
scoop install ngrok
```

**Mac:**
```bash
brew install ngrok
```

**Verify installation:**
```bash
ngrok version
```

### Step 2: Create Free ngrok Account

1. Go to https://ngrok.com/signup
2. Sign up for free account
3. Copy your authtoken from dashboard
4. Run: `ngrok config add-authtoken YOUR_AUTH_TOKEN`

### Step 3: Start Your Local Server

```bash
# In your project directory
npm run dev
```

Your Next.js app should be running on `http://localhost:3000`

### Step 4: Start ngrok Tunnel

**Open a new terminal** and run:

```bash
ngrok http 3000
```

You'll see output like:
```
ngrok

Session Status                online
Account                       your-email@example.com
Version                       3.x.x
Region                        United States (us)
Latency                       -
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123.ngrok-free.app -> http://localhost:3000

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

**Important:** Copy the HTTPS URL (e.g., `https://abc123.ngrok-free.app`)

### Step 5: Configure Environment Variables

Update your `.env.local`:

```bash
# Use ngrok URL for local development
NEXT_PUBLIC_APP_URL=https://abc123.ngrok-free.app

# Your HDFC credentials
HDFC_MERCHANT_ID=SG3726
HDFC_PAYMENT_PAGE_CLIENT_ID=SG3726
HDFC_API_KEY=your_api_key
HDFC_API_SECRET=your_api_secret
HDFC_RESPONSE_KEY=your_response_key
HDFC_BASE_URL=https://smartgateway.hdfcuat.bank.in
HDFC_TEST_MODE=true
HDFC_ENABLE_LOGGING=true
```

### Step 6: Restart Your Next.js Server

```bash
# Stop the dev server (Ctrl+C)
# Start it again
npm run dev
```

### Step 7: Configure Webhook in HDFC Dashboard

1. Login to HDFC SmartGateway Dashboard (Sandbox)
2. Navigate to: **Payments → Settings → Webhook**
3. Set Webhook URL:
   ```
   https://abc123.ngrok-free.app/api/billing/payment/webhook
   ```
4. Configure Basic Authentication:
   - Username: `webhook_user` (choose any)
   - Password: `secure_password_123` (choose any strong password)
5. Add Custom Headers (optional):
   - `x-webhook-source`: `hdfc`
6. Enable Events:
   - ✅ ORDER_SUCCEEDED
7. Click **Save**

### Step 8: Test Webhook Endpoint

**Check if your webhook endpoint is accessible:**

Open your browser and visit:
```
https://abc123.ngrok-free.app/api/billing/payment/webhook
```

You should see:
```json
{
  "error": "Method not allowed",
  "message": "This endpoint only accepts POST requests"
}
```

This confirms the endpoint is accessible! ✅

### Step 9: Test Complete Payment Flow

1. **Visit your app:**
   ```
   https://abc123.ngrok-free.app/billing/schedule/students/[student-id]
   ```

2. **Select bills and click "Pay Online"**

3. **Complete payment on HDFC test page**

4. **Monitor ngrok dashboard:**
   - Open: http://127.0.0.1:4040
   - You'll see all webhook requests in real-time!

5. **Check your console logs:**
   ```
   [billing/payment-gateway] Processing webhook {
     event_name: 'ORDER_SUCCEEDED',
     order_id: 'TXN-...'
   }
   ```

---

## Option 2: Cloudflare Tunnel (Free Alternative)

### Step 1: Install Cloudflare Tunnel

```bash
# Windows
winget install --id Cloudflare.cloudflared

# Mac
brew install cloudflare/cloudflare/cloudflared

# Linux
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

### Step 2: Start Tunnel

```bash
cloudflared tunnel --url http://localhost:3000
```

Output:
```
Your quick Tunnel has been created! Visit it at:
https://abc-def-ghi.trycloudflare.com
```

### Step 3: Use This URL

Same as ngrok - use `https://abc-def-ghi.trycloudflare.com` for:
- `NEXT_PUBLIC_APP_URL`
- Webhook URL in HDFC dashboard

---

## Option 3: localtunnel (Simplest)

### Step 1: Install

```bash
npm install -g localtunnel
```

### Step 2: Start Tunnel

```bash
# In a new terminal
lt --port 3000
```

Output:
```
your url is: https://funny-dog-12.loca.lt
```

### Step 3: Use This URL

Use `https://funny-dog-12.loca.lt` for webhook configuration.

**Note:** localtunnel may show a landing page first time - click "Continue"

---

## Debugging Webhooks

### 1. Enable Detailed Logging

Update `lib/services/billing/payment-gateway-service.ts` temporarily:

```typescript
static async handleWebhook(
  payload: HDFCWebhookPayload,
  signature: string
): Promise<WebhookProcessingResult> {
  // ADD THIS for debugging
  console.log('====== WEBHOOK RECEIVED ======');
  console.log('Headers:', JSON.stringify(signature, null, 2));
  console.log('Payload:', JSON.stringify(payload, null, 2));
  console.log('=============================');

  try {
    // ... rest of the code
  }
}
```

### 2. Check ngrok Dashboard

Visit: http://127.0.0.1:4040

You'll see:
- Request timestamp
- Request headers
- Request body
- Response status
- Response body

### 3. Test Webhook Manually

Create a test script `test-webhook.js`:

```javascript
// test-webhook.js
const fetch = require('node-fetch');

const webhookUrl = 'https://abc123.ngrok-free.app/api/billing/payment/webhook';

const testPayload = {
  id: 'evt_test_123',
  date_created: new Date().toISOString(),
  event_name: 'ORDER_SUCCEEDED',
  content: {
    order: {
      id: 'ordeh_test_123',
      order_id: 'TXN-TEST-12345',
      status: 'CHARGED',
      status_id: 21,
      amount: 1500.00,
      currency: 'INR',
      customer_id: 'test_student_001',
      customer_email: 'test@example.com',
      customer_phone: '9876543210',
      merchant_id: 'SG3726',
      date_created: new Date().toISOString(),
      txn_id: 'TXN123456789',
      payment_method: 'VISA',
      payment_method_type: 'CARD'
    }
  }
};

// Basic Auth credentials
const username = 'webhook_user';
const password = 'secure_password_123';
const auth = Buffer.from(`${username}:${password}`).toString('base64');

fetch(webhookUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${auth}`,
    'x-webhook-source': 'hdfc'
  },
  body: JSON.stringify(testPayload)
})
  .then(res => res.json())
  .then(data => {
    console.log('Webhook Response:', data);
  })
  .catch(err => {
    console.error('Error:', err);
  });
```

Run:
```bash
node test-webhook.js
```

### 4. Verify Webhook Authentication

Check if your webhook endpoint validates credentials:

```bash
# Test with wrong credentials (should fail)
curl -X POST https://abc123.ngrok-free.app/api/billing/payment/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic d3JvbmcK" \
  -d '{"test": true}'

# Test with correct credentials (should succeed)
curl -X POST https://abc123.ngrok-free.app/api/billing/payment/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'webhook_user:secure_password_123' | base64)" \
  -d '{
    "id": "evt_test",
    "event_name": "ORDER_SUCCEEDED",
    "content": {
      "order": {
        "order_id": "TXN-TEST",
        "status": "CHARGED",
        "status_id": 21
      }
    }
  }'
```

---

## Webhook Endpoint Implementation

If you haven't created the webhook endpoint yet, here's the implementation:

**File:** `app/api/billing/payment/webhook/route.ts`

```typescript
// app/api/billing/payment/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PaymentGatewayService } from '@/lib/services/billing/payment-gateway-service';
import { logger } from '@/lib/utils/enhanced-logger';
import type { HDFCWebhookPayload } from '@/types/payment-gateway';

export async function POST(request: NextRequest) {
  try {
    // Step 1: Verify it's a POST request
    if (request.method !== 'POST') {
      return NextResponse.json(
        { error: 'Method not allowed', message: 'This endpoint only accepts POST requests' },
        { status: 405 }
      );
    }

    // Step 2: Get Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      logger.error('billing/webhook', 'Missing or invalid Authorization header');
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Missing authentication credentials' },
        { status: 401 }
      );
    }

    // Step 3: Verify Basic Auth credentials
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    // TODO: Store these securely in environment variables
    const WEBHOOK_USERNAME = process.env.HDFC_WEBHOOK_USERNAME || 'webhook_user';
    const WEBHOOK_PASSWORD = process.env.HDFC_WEBHOOK_PASSWORD || 'secure_password_123';

    if (username !== WEBHOOK_USERNAME || password !== WEBHOOK_PASSWORD) {
      logger.error('billing/webhook', 'Invalid webhook credentials', { username });
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Step 4: Parse webhook payload
    const payload: HDFCWebhookPayload = await request.json();

    logger.info('billing/webhook', 'Webhook received', {
      event_id: payload.id,
      event_name: payload.event_name,
      order_id: payload.content?.order?.order_id,
    });

    // Step 5: Process webhook
    // Note: HDFC doesn't send signature for webhooks, they use Basic Auth instead
    const result = await PaymentGatewayService.handleWebhook(payload, '');

    if (!result.success) {
      logger.error('billing/webhook', 'Webhook processing failed', result.error);
      return NextResponse.json(
        { error: 'Processing failed', message: result.error },
        { status: 500 }
      );
    }

    logger.info('billing/webhook', 'Webhook processed successfully', {
      transaction_id: result.transaction_id,
      receipt_created: result.receipt_created,
    });

    // Step 6: Return 200 OK (HDFC requires this)
    return NextResponse.json(
      { status: 'success', message: 'Webhook processed successfully' },
      { status: 200 }
    );
  } catch (error) {
    logger.error('billing/webhook', 'Webhook endpoint error', error);
    return NextResponse.json(
      {
        error: 'Internal error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Return error for non-POST requests
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed', message: 'This endpoint only accepts POST requests' },
    { status: 405 }
  );
}
```

**Update environment variables:**

Add to `.env.local`:
```bash
HDFC_WEBHOOK_USERNAME=webhook_user
HDFC_WEBHOOK_PASSWORD=secure_password_123
```

---

## Complete Testing Workflow

### 1. Setup (One-time)

```bash
# Terminal 1: Start Next.js dev server
npm run dev

# Terminal 2: Start ngrok tunnel
ngrok http 3000

# Note down ngrok URL: https://abc123.ngrok-free.app
```

### 2. Configure (One-time per tunnel session)

1. Update `.env.local` with ngrok URL
2. Restart Next.js server
3. Configure webhook URL in HDFC dashboard
4. Set Basic Auth credentials

### 3. Test Payment Flow

```bash
# Open browser
https://abc123.ngrok-free.app

# Navigate to billing
# Select bills
# Click "Pay Online"
# Complete payment
# Return to site

# Check webhook received
# Check logs in Terminal 1
# Check ngrok dashboard at http://127.0.0.1:4040
```

### 4. Verify Results

```bash
# Check transaction status in database
# Verify receipt was created
# Confirm bill status updated
# Review all logs
```

---

## Common Issues & Solutions

### Issue 1: ngrok URL Changes

**Problem:** ngrok generates new URL each time you restart it (free tier)

**Solution:**
- Use ngrok paid plan for static subdomain ($8/month)
- Or restart tunnel and update HDFC webhook URL each time
- Or use Cloudflare Tunnel (free static URL)

### Issue 2: Webhook Not Received

**Checklist:**
- [ ] ngrok tunnel running?
- [ ] Correct URL in HDFC dashboard?
- [ ] HTTPS URL (not HTTP)?
- [ ] `/api/billing/payment/webhook` path correct?
- [ ] Webhook enabled in HDFC dashboard?
- [ ] ORDER_SUCCEEDED event enabled?
- [ ] Check ngrok dashboard for incoming requests

### Issue 3: 401 Unauthorized

**Cause:** Basic Auth credentials mismatch

**Fix:**
1. Check credentials in HDFC dashboard
2. Verify credentials in your code/env
3. Test with curl to confirm

### Issue 4: Webhook Received but Not Processing

**Debug:**
```typescript
// Add logging in webhook handler
console.log('Payload:', JSON.stringify(payload, null, 2));
console.log('Transaction lookup:', payload.content.order.order_id);
```

### Issue 5: ngrok "Too Many Connections"

**Solution:**
- Sign up for free ngrok account (increases limit)
- Or use Cloudflare Tunnel instead

---

## Production vs Development

| Aspect | Development (localhost) | Production (Vercel) |
|--------|------------------------|---------------------|
| URL | `https://abc123.ngrok-free.app` | `https://yourdomain.vercel.app` |
| Tunnel | Required (ngrok) | Not needed |
| IP Whitelisting | ngrok's IP (changes) | Vercel's IP (stable) |
| Webhook URL | Changes each session | Static |
| HDFC Dashboard | Update frequently | Set once |

---

## Best Practices

### 1. Use Environment Variables

```bash
# .env.local
HDFC_WEBHOOK_USERNAME=webhook_user
HDFC_WEBHOOK_PASSWORD=super_secure_password_123
NEXT_PUBLIC_APP_URL=https://abc123.ngrok-free.app
```

### 2. Enable Detailed Logging

```bash
HDFC_ENABLE_LOGGING=true
```

### 3. Monitor ngrok Dashboard

Keep http://127.0.0.1:4040 open to see:
- All incoming webhook requests
- Request/response details
- Timing information

### 4. Test Idempotency

Send the same webhook twice to verify your code handles duplicates:
```bash
# Run test-webhook.js twice
node test-webhook.js
node test-webhook.js
```

Should process once, ignore second time.

### 5. Clean Up After Testing

```bash
# Stop ngrok (Ctrl+C in Terminal 2)
# Stop dev server (Ctrl+C in Terminal 1)
# Update NEXT_PUBLIC_APP_URL back to localhost if needed
```

---

## Quick Start Checklist

- [ ] Install ngrok
- [ ] Sign up for ngrok account
- [ ] Start Next.js dev server (`npm run dev`)
- [ ] Start ngrok tunnel (`ngrok http 3000`)
- [ ] Copy ngrok HTTPS URL
- [ ] Update `NEXT_PUBLIC_APP_URL` in `.env.local`
- [ ] Restart Next.js server
- [ ] Create webhook endpoint (`app/api/billing/payment/webhook/route.ts`)
- [ ] Configure webhook URL in HDFC dashboard
- [ ] Set Basic Auth credentials
- [ ] Enable ORDER_SUCCEEDED event
- [ ] Test with payment flow
- [ ] Monitor ngrok dashboard (http://127.0.0.1:4040)
- [ ] Check server logs
- [ ] Verify webhook processed
- [ ] Confirm receipt created

---

## Resources

- **ngrok:** https://ngrok.com
- **ngrok Dashboard:** http://127.0.0.1:4040
- **Cloudflare Tunnel:** https://developers.cloudflare.com/cloudflare-one/connections/connect-apps
- **localtunnel:** https://localtunnel.github.io/www/
- **HDFC Dashboard:** https://smartgateway.hdfcuat.bank.in (sandbox)

---

**Last Updated:** 2025-01-21
**Status:** Ready for use
**Next:** Test complete payment flow with webhooks
