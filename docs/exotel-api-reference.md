# Exotel API Reference for MyJKKN

## Authentication
- **Method**: Basic HTTP Auth
- **Header**: `Authorization: Basic base64(API_KEY:API_TOKEN)`
- **Credentials**: From Exotel Dashboard → API Settings

## Base URLs
| Region | Subdomain |
|--------|-----------|
| Mumbai (India) | `api.in.exotel.com` |
| Singapore | `api.exotel.com` |

## Environment Variables
| Variable | Purpose |
|----------|---------|
| `EXOTEL_API_KEY` | Basic auth username |
| `EXOTEL_API_TOKEN` | Basic auth password + webhook verification |
| `EXOTEL_ACCOUNT_SID` | Account identifier in URL paths |
| `EXOTEL_SUBDOMAIN` | Regional API host (default: `api.in.exotel.com`) |
| `EXOTEL_CALLER_ID` | Default ExoPhone for outbound calls |
| `EXOTEL_CALL_COST_PER_MIN` | Fallback per-minute cost in INR (default: 0.50) |
| `EXOTEL_SMS_COST_PER_MSG` | Per-message cost (default: 0.25) |
| `EXOTEL_DLT_ENTITY_ID` | DLT entity ID for Indian SMS regulation |

## Voice API (V1)

### Make a Call
```
POST https://api.in.exotel.com/v1/Accounts/{SID}/Calls/connect

Params (form-encoded):
- From: Counselor phone (called first)
- To: Prospect phone (bridged second)
- CallerId: ExoPhone number
- Record: true/false
- StatusCallback: Webhook URL
- StatusCallbackEvents: terminal,answered
- TimeLimit: Max seconds (default 1800)
- TimeOut: Ring timeout seconds (default 30)
- CustomField: App-specific ID for webhook correlation

Response: { Call: { Sid, Status, From, To, PhoneNumberSid, DateCreated } }
```

### Get Call Details
```
GET https://api.in.exotel.com/v1/Accounts/{SID}/Calls/{CallSid}.json

Response: { Call: { Sid, Status, Direction, Duration, ConversationDuration, Price, RecordingUrl, ... } }
```

### Status Callback Webhook
Exotel sends POST (form-encoded) to StatusCallback URL:
- CallSid, Status, Direction, From, To
- StartTime, EndTime, Duration, ConversationDuration
- RecordingUrl, Price, Currency, CustomField

### Call Status Values
| Exotel Status | MyJKKN Status |
|--------------|---------------|
| queued | initiated |
| ringing | ringing |
| in-progress | in-progress |
| completed | completed |
| busy | busy |
| no-answer | no-answer |
| failed | failed |
| canceled | cancelled |

## SMS API (V1)

### Send SMS
```
POST https://api.in.exotel.com/v1/Accounts/{SID}/Sms/send

Params (form-encoded):
- From: ExoPhone or Sender ID
- To: Recipient phone
- Body: Message (max 2000 chars)
- DltEntityId: Required for India
- DltTemplateId: Optional
- SmsType: transactional/promotional
- StatusCallback: Delivery status webhook URL

Response: { SMSMessage: { Sid, Status, DetailedStatusCode, SmsUnits } }
```

### SMS Status Values
| Exotel Status | MyJKKN Status |
|--------------|---------------|
| queued | queued |
| sending | pending |
| submitted | sent |
| sent | delivered |
| failed-dnd | rejected |
| failed | failed |

## MyJKKN Integration Architecture

```
Click-to-Call Flow:
  UI → POST /api/admission/calls/initiate
     → TelephonyService.initiateCall()
       → DB insert (placeholder call_sid)
       → ExotelClient.makeCall()
       → DB update (real call_sid)
     ← { call_sid, call_log_id }

Webhook Flow:
  Exotel → POST /api/webhooks/telephony
     → verifyWebhookAuth()
     → TelephonyService.handleCallStatusCallback()
       → Find call log (by call_sid or CustomField)
       → Idempotent status update
       → Track cost in communication_cost_log
     ← 200 OK

SMS Flow:
  UI → SMSCampaignService.sendCampaignSMS()
     → ExotelClient.sendSms()
     → DB log in admission_sms_logs

  Exotel → POST /api/webhooks/sms?provider=exotel
     → Update delivery status in admission_sms_logs
```

## Key Files
| File | Purpose |
|------|---------|
| `lib/services/telephony/exotel-client.ts` | HTTP client for Exotel APIs |
| `lib/services/telephony/telephony-service.ts` | Call management service |
| `lib/services/admission/sms-campaign-service.ts` | SMS service (Exotel default) |
| `app/api/webhooks/telephony/route.ts` | Call status webhook handler |
| `app/api/webhooks/sms/route.ts` | SMS delivery webhook handler |
| `app/api/admission/calls/*/route.ts` | Call management API routes |
