# Exotel Integration — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    MyJKKN Frontend                       │
│  Admission CRM → Call Logs Page → Click-to-Call Button  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│                   API Routes                             │
│  POST /api/admission/calls/initiate → Initiate call      │
│  GET  /api/admission/calls          → List call logs     │
│  GET  /api/admission/calls/stats    → Call analytics     │
│  PUT  /api/admission/calls/[id]/notes → Update notes     │
│  GET  /api/admission/calls/[id]/details → Call details   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│               Service Layer                              │
│  TelephonyService  → Call management + webhook handler   │
│  ExotelClient      → HTTP wrapper for Exotel APIs        │
│  SMSCampaignService → SMS sending (Exotel as default)    │
└──────────────────────┬──────────────────────────────────┘
                       │
              ┌────────┴────────┐
              ▼                 ▼
┌──────────────────┐  ┌──────────────────────┐
│   Exotel APIs    │  │  Supabase Database   │
│  Voice (V1)      │  │  admission_call_logs │
│  SMS (V1)        │  │  admission_sms_logs  │
│  Campaigns (V2)  │  │  communication_cost  │
└────────┬─────────┘  └──────────────────────┘
         │
         │ Webhooks (async)
         ▼
┌──────────────────────────────────────────────────────────┐
│               Webhook Handlers                           │
│  POST /api/webhooks/telephony  → Call status updates     │
│  POST /api/webhooks/sms        → SMS delivery status     │
└──────────────────────────────────────────────────────────┘
```

## Click-to-Call Flow

```
1. Counselor clicks "Call" on a lead in CRM
2. Frontend calls POST /api/admission/calls/initiate
   Body: { institution_id, counselor_phone, prospect_phone, lead_id }
3. TelephonyService.initiateCall():
   a. Creates DB record with placeholder call_sid
   b. Calls ExotelClient.makeCall() with:
      - From: counselor_phone (Exotel calls counselor FIRST)
      - To: prospect_phone (then bridges to prospect)
      - CallerId: ExoPhone number
      - CustomField: DB record ID (for webhook correlation)
      - StatusCallback: /api/webhooks/telephony
   c. Updates DB with real Exotel call_sid
4. Returns { call_sid, call_log_id } to frontend
5. Exotel sends webhook callbacks as call progresses:
   ringing → in-progress → completed
6. handleCallStatusCallback() updates DB with:
   - Status, duration, recording URL, cost
   - Tracks cost in communication_cost_log
```

## SMS Flow

```
1. SMS sent via SMSCampaignService.sendCampaignSMS()
2. Service calls ExotelClient.sendSms() with:
   - From: ExoPhone/Sender ID
   - To: recipient phone
   - Body: message content
   - DltEntityId: TRAI compliance ID
   - StatusCallback: /api/webhooks/sms?provider=exotel
3. Exotel sends delivery status webhook
4. handleWebhook() updates admission_sms_logs
```

## Authentication

### API Calls (MyJKKN → Exotel)
- **Method**: Basic HTTP Auth
- **Header**: `Authorization: Basic base64(EXOTEL_API_KEY:EXOTEL_API_TOKEN)`
- **Built into**: `ExotelClient.getAuthHeader()`

### Webhooks (Exotel → MyJKKN)
- **Method**: Token verification
- **Header**: `x-exotel-token: EXOTEL_API_TOKEN`
- **Security**: `crypto.timingSafeEqual()` — prevents timing attacks
- **Fallback**: Also checks `x-api-token` header and `?token=` query param

## Key Files

| File | Purpose |
|------|---------|
| `lib/services/telephony/exotel-client.ts` | HTTP client — auth, retry (2x), timeout (15s) |
| `lib/services/telephony/telephony-service.ts` | Call management — initiate, callback, stats |
| `lib/services/admission/sms-campaign-service.ts` | SMS — Exotel is default provider |
| `app/api/webhooks/telephony/route.ts` | Call webhook — status updates |
| `app/api/webhooks/sms/route.ts` | SMS webhook — delivery status |
| `app/api/admission/calls/initiate/route.ts` | Click-to-call API |
| `app/api/admission/calls/[id]/details/route.ts` | Live call details from Exotel |
| `hooks/admission/use-call-logs.ts` | React Query hooks for call data |
| `hooks/admission/use-call-mutations.ts` | Mutations for initiating calls |
| `hooks/admission/use-call-stats.ts` | Analytics hooks |

## Idempotent Webhook Processing

Exotel may send multiple webhooks for the same call. The service uses **status ordering** to prevent regression:

```
initiated (0) → ringing (1) → in-progress (2) → completed/busy/no-answer/failed (3)
```

A "ringing" webhook received AFTER "completed" is silently ignored. This prevents data corruption from out-of-order webhook delivery.

## CustomField Bridge

**Problem**: Webhook may arrive before `initiateCall()` finishes updating the DB with the real Exotel `call_sid`.

**Solution**: We pass the DB record `id` as Exotel's `CustomField`. The webhook handler looks up the record by `call_sid` first, falls back to `CustomField` (our DB ID). This guarantees the webhook always finds the right record.
