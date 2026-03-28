# Exotel Integration — Step-by-Step Setup Guide

## Pre-requisites

Before starting, ensure you have:
- [ ] Exotel account credentials (API Key, API Token, Account SID, ExoPhone number)
- [ ] Access to Vercel production dashboard
- [ ] Access to Supabase production dashboard (project: `kvizhngldtiuufknvehv`)
- [ ] DLT Entity ID from TRAI registration (required for Indian SMS)

---

## Step 1: Database Setup (Run on Production Supabase)

Open the Supabase Dashboard → SQL Editor for production project.

### 1a. Add Exotel to SMS provider enum

```sql
ALTER TYPE sms_provider ADD VALUE IF NOT EXISTS 'exotel';
```

### 1b. Create communication_cost_log table

Copy the full SQL from `03-DATABASE-SCHEMAS.md` → Step 2.

### 1c. Verify

```sql
-- Should show: msg91, twilio, exotel
SELECT enumlabel FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'sms_provider')
ORDER BY enumsortorder;

-- Should return the table
SELECT table_name FROM information_schema.tables
WHERE table_name = 'communication_cost_log' AND table_schema = 'public';
```

---

## Step 2: Merge Code

### Option A: Full branch merge (recommended)

```bash
git checkout main
git pull origin main
git merge omm-dev
# Resolve any conflicts
git push origin main
```

### Option B: Cherry-pick Exotel files only

```bash
git checkout main
git pull origin main

# Copy the specific files from omm-dev
git checkout omm-dev -- \
  lib/services/telephony/exotel-client.ts \
  lib/services/telephony/telephony-service.ts \
  lib/services/telephony/voice-broadcast-service.ts \
  lib/services/admission/sms-campaign-service.ts \
  app/api/webhooks/telephony/route.ts \
  app/api/webhooks/sms/route.ts \
  app/api/admission/calls/route.ts \
  app/api/admission/calls/initiate/route.ts \
  app/api/admission/calls/stats/route.ts \
  app/api/admission/calls/[id]/notes/route.ts \
  app/api/admission/calls/[id]/details/route.ts \
  hooks/admission/use-call-logs.ts \
  hooks/admission/use-call-mutations.ts \
  hooks/admission/use-call-stats.ts \
  docs/exotel-api-reference.md \
  .env.example

git add -A
git commit -m "feat(telephony): add Exotel integration for calls and SMS"
git push origin main
```

### Verify build

```bash
npm run build
# Must pass — zero new errors expected
```

---

## Step 3: Set Environment Variables in Vercel

Go to Vercel Dashboard → MyJKKN project → Settings → Environment Variables.

Add these for **Production** environment:

| Variable | Value | Where to Get |
|----------|-------|-------------|
| `EXOTEL_API_KEY` | `your-api-key` | Exotel Dashboard → Settings → API |
| `EXOTEL_API_TOKEN` | `your-api-token` | Exotel Dashboard → Settings → API |
| `EXOTEL_ACCOUNT_SID` | `your-account-sid` | Exotel Dashboard → Settings → API (shown as "SID") |
| `EXOTEL_SUBDOMAIN` | `api.in.exotel.com` | Fixed — Mumbai region |
| `EXOTEL_CALLER_ID` | `0XXXXXXXXXX` | Your ExoPhone number from Exotel |
| `EXOTEL_CALL_COST_PER_MIN` | `0.50` | Fallback cost if Exotel doesn't report price |
| `EXOTEL_SMS_COST_PER_MSG` | `0.25` | Fallback SMS cost |
| `EXOTEL_DLT_ENTITY_ID` | `your-dlt-entity-id` | From TRAI DLT registration |
| `NEXT_PUBLIC_SMS_PROVIDER` | `exotel` | Sets Exotel as default SMS provider |

**After adding env vars:** Trigger a redeployment from Vercel dashboard.

---

## Step 4: Configure Exotel Dashboard

### 4a. Call Status Webhook

In Exotel Dashboard → Settings → Webhooks (or configure per ExoPhone):

| Setting | Value |
|---------|-------|
| **Status Callback URL** | `https://[YOUR-PRODUCTION-URL]/api/webhooks/telephony` |
| **Events** | `terminal`, `answered` |
| **Method** | POST |

The webhook URL is also set per-call via `StatusCallback` parameter, so this step is optional if you only use the click-to-call flow.

### 4b. SMS Delivery Webhook

| Setting | Value |
|---------|-------|
| **SMS Status Callback URL** | `https://[YOUR-PRODUCTION-URL]/api/webhooks/sms?provider=exotel` |
| **Method** | POST |

### 4c. Webhook Authentication

The webhooks authenticate using `EXOTEL_API_TOKEN`. Exotel needs to send this token in one of:
- `x-exotel-token` header
- `x-api-token` header
- `?token=` query parameter

Configure the webhook to include the token as a header.

---

## Step 5: Testing

### 5a. Health Check

```bash
# Check call webhook is configured
curl https://[YOUR-PRODUCTION-URL]/api/webhooks/telephony
# Expected: { "status": "active", "provider": "exotel" }

# Check SMS webhook is configured
curl https://[YOUR-PRODUCTION-URL]/api/webhooks/sms
# Expected: { "providers": { "exotel": { "configured": true } } }
```

### 5b. Test Click-to-Call

1. Log in to MyJKKN CRM as a counselor
2. Navigate to a lead's profile
3. Click the "Call" button
4. Expected: Your phone rings first, then bridges to the lead
5. After call ends, check the Call Logs page — should show status, duration, recording

### 5c. Test SMS

1. Use the SMS Campaign feature in Admission CRM
2. Send a test SMS to a known number
3. Check `admission_sms_logs` table — provider should be `exotel`
4. Verify delivery status updates via webhook

### 5d. Webhook Simulation (if Exotel not yet connected)

```bash
# Simulate a call completion webhook
curl -X POST https://[YOUR-PRODUCTION-URL]/api/webhooks/telephony \
  -H "x-exotel-token: YOUR_EXOTEL_API_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=test123&Status=completed&Duration=60&RecordingUrl=https://example.com/rec.mp3&Price=0.50&CustomField=SOME_CALL_LOG_UUID"

# Expected: { "received": true, "processed": true }
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| API returns 503 "not configured" | Missing env vars | Verify all 5 required EXOTEL_ vars are set |
| Webhook returns 401 | Token mismatch | Ensure `EXOTEL_API_TOKEN` matches between Vercel and Exotel dashboard |
| SMS fails with "invalid sender" | Wrong CALLER_ID or missing DLT | Verify ExoPhone number is SMS-capable and DLT ID is registered |
| Call connects but no webhook | Wrong callback URL | Check URL in Exotel dashboard matches production domain |
| Cost not tracked | `communication_cost_log` table missing | Run Step 1b SQL |
| SMS insert fails with enum error | `sms_provider` missing 'exotel' | Run Step 1a SQL |

---

## Rollback Plan

If anything breaks after deployment:

1. **Env vars**: Remove `NEXT_PUBLIC_SMS_PROVIDER=exotel` → reverts SMS to MSG91 default
2. **Code**: The Exotel code is behind `isConfigured()` checks — without env vars, it returns 503 gracefully
3. **Database**: The new table and enum value don't affect existing functionality

The integration is **fully backward compatible** — existing MSG91/Twilio code is still present and works if the provider env var is changed back.
