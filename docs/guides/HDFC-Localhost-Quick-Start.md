# HDFC Webhook Localhost Testing - Quick Start
**5-Minute Setup Guide**

---

## Prerequisites
- Next.js dev server working
- HDFC Sandbox credentials

---

## Step 1: Install ngrok (2 minutes)

### Windows (PowerShell):
```powershell
# Option A: Download installer
# Go to https://ngrok.com/download and run installer

# Option B: Use Chocolatey
choco install ngrok

# Option C: Use Scoop
scoop install ngrok
```

### Mac:
```bash
brew install ngrok
```

### Verify:
```bash
ngrok version
```

---

## Step 2: Configure ngrok (1 minute)

1. Sign up: https://ngrok.com/signup (free)
2. Get authtoken from: https://dashboard.ngrok.com/get-started/your-authtoken
3. Run:
```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN_HERE
```

---

## Step 3: Start Services (30 seconds)

### Terminal 1 - Start Next.js:
```bash
cd D:\JKKN\MYJKKN Portal\MyJKKN
npm run dev
```

### Terminal 2 - Start ngrok:
```bash
ngrok http 3000
```

**Copy the HTTPS URL shown:**
```
Forwarding   https://abc-123-def.ngrok-free.app -> http://localhost:3000
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
              Copy this URL!
```

---

## Step 4: Update Environment (30 seconds)

Edit `.env.local`:

```bash
# Replace with your ngrok URL
NEXT_PUBLIC_APP_URL=https://abc-123-def.ngrok-free.app

# Add webhook credentials (choose any username/password)
HDFC_WEBHOOK_USERNAME=webhook_user
HDFC_WEBHOOK_PASSWORD=MySecurePassword123!

# Your existing HDFC credentials stay the same
HDFC_MERCHANT_ID=SG3726
HDFC_API_KEY=...
# etc.
```

**Restart Next.js server** (Ctrl+C, then `npm run dev`)

---

## Step 5: Configure HDFC Dashboard (1 minute)

1. Login: https://smartgateway.hdfcuat.bank.in (sandbox)
2. Go to: **Payments → Settings → Webhook**
3. Fill in:

```
Webhook URL: https://abc-123-def.ngrok-free.app/api/billing/payment/webhook

Basic Authentication:
  Username: webhook_user
  Password: MySecurePassword123!

Events to Enable:
  ☑️ ORDER_SUCCEEDED

Custom Headers (optional):
  x-webhook-source: hdfc
```

4. Click **Save**

---

## Step 6: Test! (1 minute)

### Test 1 - Verify Webhook Endpoint:

Visit in browser:
```
https://abc-123-def.ngrok-free.app/api/billing/payment/webhook
```

Should see:
```json
{
  "service": "HDFC Payment Gateway Webhook",
  "status": "active"
}
```

✅ Endpoint is accessible!

### Test 2 - Complete a Payment:

1. Visit: `https://abc-123-def.ngrok-free.app`
2. Go to billing page
3. Select bills
4. Click "Pay Online"
5. Complete payment on HDFC test page
6. Return to your site

### Test 3 - Check Webhook Received:

**In Terminal 1 (Next.js logs):**
```
[billing/payment-webhook] Received webhook notification
[billing/payment-webhook] Webhook authentication successful
[billing/payment-webhook] Processing webhook event
[billing/payment-webhook] Webhook processed successfully
```

**In ngrok Dashboard:**
Open http://127.0.0.1:4040 to see all webhook requests!

---

## Troubleshooting

### "Tunnel not found"
```bash
# Restart ngrok
ngrok http 3000
# Copy new URL and update .env.local
```

### "401 Unauthorized" on webhook
```bash
# Check credentials match in:
# 1. .env.local (HDFC_WEBHOOK_USERNAME/PASSWORD)
# 2. HDFC Dashboard (webhook settings)
```

### Webhook not received
```bash
# Checklist:
# ✓ ngrok running?
# ✓ Correct URL in HDFC dashboard?
# ✓ ORDER_SUCCEEDED event enabled?
# ✓ Check ngrok dashboard: http://127.0.0.1:4040
```

### "Configuration Error"
```bash
# Add to .env.local:
HDFC_WEBHOOK_USERNAME=webhook_user
HDFC_WEBHOOK_PASSWORD=MySecurePassword123!

# Restart Next.js server
```

---

## View Webhook Requests in Real-Time

**ngrok Web Interface:**
```
http://127.0.0.1:4040
```

Shows:
- ✅ All incoming webhook requests
- ✅ Request headers and body
- ✅ Response status and body
- ✅ Timing information

Perfect for debugging! 🎉

---

## Test with cURL (Optional)

Send a test webhook manually:

```bash
curl -X POST https://abc-123-def.ngrok-free.app/api/billing/payment/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'webhook_user:MySecurePassword123!' | base64)" \
  -d '{
    "id": "evt_test_123",
    "date_created": "2025-01-21T10:00:00Z",
    "event_name": "ORDER_SUCCEEDED",
    "content": {
      "order": {
        "id": "ordeh_test",
        "order_id": "TXN-TEST-12345",
        "status": "CHARGED",
        "status_id": 21,
        "amount": 1500.00,
        "currency": "INR",
        "customer_id": "test_student",
        "customer_email": "test@example.com",
        "customer_phone": "9876543210",
        "merchant_id": "SG3726",
        "date_created": "2025-01-21T10:00:00Z",
        "txn_id": "TXN123456789",
        "payment_method": "VISA"
      }
    }
  }'
```

Should return:
```json
{
  "received": true,
  "processed": true
}
```

---

## Daily Development Workflow

### Starting:
```bash
# Terminal 1
npm run dev

# Terminal 2
ngrok http 3000
```

### If ngrok URL changes:
1. Copy new URL from Terminal 2
2. Update `NEXT_PUBLIC_APP_URL` in `.env.local`
3. Restart Next.js (Ctrl+C, then `npm run dev`)
4. Update webhook URL in HDFC dashboard

### Stopping:
```bash
# Ctrl+C in both terminals
```

---

## Environment Variables Checklist

Your `.env.local` should have:

```bash
# ✅ Required
NEXT_PUBLIC_APP_URL=https://your-ngrok-url.ngrok-free.app
HDFC_WEBHOOK_USERNAME=webhook_user
HDFC_WEBHOOK_PASSWORD=YourSecurePassword123!
HDFC_MERCHANT_ID=SG3726
HDFC_API_KEY=your_api_key
HDFC_API_SECRET=your_api_secret
HDFC_RESPONSE_KEY=your_response_key
HDFC_BASE_URL=https://smartgateway.hdfcuat.bank.in
HDFC_TEST_MODE=true

# ✅ Optional but recommended
HDFC_ENABLE_LOGGING=true
HDFC_PAYMENT_PAGE_CLIENT_ID=SG3726
```

---

## Success Indicators

### ✅ Everything Working:

**Terminal 1 (Next.js):**
```
[billing/payment-webhook] Webhook authentication successful ✓
[billing/payment-webhook] Processing webhook event ✓
[billing/payment-gateway] Receipt created successfully ✓
```

**ngrok Dashboard (http://127.0.0.1:4040):**
```
POST /api/billing/payment/webhook
Status: 200 OK ✓
```

**Database:**
```
Transaction status: success ✓
Receipt created: yes ✓
Bill status: paid ✓
```

---

## Need More Details?

See full guide: `docs/guides/HDFC-Webhook-Localhost-Testing.md`

---

**Total Setup Time:** ~5 minutes
**Complexity:** Easy ⭐
**Cost:** Free (ngrok free tier)

Happy testing! 🚀
