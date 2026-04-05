# Exotel API Complete Reference

**Research Date:** 2026-04-05
**Source:** https://developer.exotel.com/
**Purpose:** Comprehensive inventory of ALL Exotel APIs with gap analysis against MyJKKN usage

---

## Authentication (All APIs)

| Detail | Value |
|--------|-------|
| Method | HTTP Basic Auth |
| Credentials | `API_KEY:API_TOKEN` (from dashboard) |
| Account SID | Required in all URL paths |
| Subdomains | `api.in.exotel.com` (Mumbai), `api.exotel.com` (Singapore) |
| CCM Subdomains | `ccm-api.in.exotel.com` (Mumbai), `ccm-api.exotel.com` (Singapore) |
| Rate Limit (Voice) | 200 calls per minute |
| Rate Limit (SMS) | HTTP 503 on breach |
| Dashboard | https://my.exotel.com/apisettings/site#api-credentials |

---

## What MyJKKN Currently Uses

| API | Endpoint | Client Method |
|-----|----------|---------------|
| Initiate Call (v1) | `POST /v1/Accounts/{sid}/Calls/connect` | `ExotelClient.makeCall()` |
| Get Call Details (v1) | `GET /v1/Accounts/{sid}/Calls/{callSid}.json` | `ExotelClient.getCallDetails()` |
| List Recent Calls (v1) | `GET /v1/Accounts/{sid}/Calls.json` | `ExotelClient.getRecentCalls()` |
| Send SMS (v1) | `POST /v1/Accounts/{sid}/Sms/send` | `ExotelClient.sendSms()` |
| Status Callback Webhook | Webhook receiver at `/api/webhooks/telephony` | `TelephonyService.handleCallStatusCallback()` |
| Passthru Webhook | `/api/webhooks/telephony/passthru` | IVR passthru handler |

**Current API version:** Primarily v1 with form-encoded bodies

---

## CATEGORY 1: VOICE / CALL APIs

### 1A. Voice v1 (Legacy - Currently Used)

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Connect two numbers | POST | `/v1/Accounts/{sid}/Calls/connect` | IN USE |
| Get call details | GET | `/v1/Accounts/{sid}/Calls/{callSid}.json` | IN USE |
| List calls | GET | `/v1/Accounts/{sid}/Calls.json` | IN USE |

### 1B. Voice v2 (CCM - Cloud Communication Module)

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Make call (C2C) | POST | `/v2/accounts/{sid}/calls` | NOT USED |
| Get call details | GET | `/v2/accounts/{sid}/calls/{call_sid}` | NOT USED |

**v2 Advantages over v1:**
- Dual-channel recording (agent + customer on separate channels)
- `status_callback` accepts array of events (answered, terminal)
- Returns `assigned_agent_details` with user_id, name, group_id, status
- `customer_details` with contact_name, call_status breakdown
- `total_talk_time` in seconds (more precise)
- `recordings` array with playable URLs (not single URL)
- DTMF digits captured in response
- `call_state` (active/terminal) separate from `call_status` (completed, agent_unanswered, customer_unanswered, agent_canceled, etc.)
- State management: marks users busy to prevent simultaneous calls

**Subdomain:** `ccm-api.in.exotel.com` (different from v1)

### 1C. Voice v3 (Latest)

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Outgoing call (C2C) | POST | `/v3/accounts/{sid}/calls` | NOT USED |
| Get call details | GET | `/v3/accounts/{sid}/calls/{call_sid}` | NOT USED |
| Get call legs | GET | `/v3/accounts/{sid}/calls/{call_sid}/legs` | NOT USED |

**v3 Additions over v2:**
- Call legs API: separate detail for "from" leg and "to" leg
- `playback` parameter for playing audio during call
- `streaming` parameter for WebSocket audio streaming
- Recording quality options: standard vs high-quality MP3
- Recording channels: single (mono) or dual (stereo)
- `wait_audio_url` for custom hold music

**Subdomain:** `ccm-api.in.exotel.com`

### 1D. Agent Stream (Real-time Voice Streaming)

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Get active streams | GET | `/v1/Accounts/{sid}/ActiveStreams` | NOT USED |

**What it does:** Real-time voice streaming to your WebSocket endpoint. Useful for:
- Live call transcription
- Real-time sentiment analysis
- AI-powered call coaching
- Call recording to your own infrastructure

**Response:** active_streams count, max_allowed_streams, account_sid

---

## CATEGORY 2: SMS APIs

### 2A. SMS v1 (Currently Used)

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Send single SMS | POST | `/v1/Accounts/{sid}/Sms/send` | IN USE |
| Get SMS details | GET | `/v1/Accounts/{sid}/SMS/Messages/{SmsSid}` | NOT USED |

### 2B. Bulk SMS (NOT USED)

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Bulk SMS (same content) | POST | `/v1/Accounts/{sid}/Sms/send` (To=array) | NOT USED |
| Bulk SMS (dynamic content) | POST | `/v1/Accounts/{sid}/Sms/bulksend` (Beta) | NOT USED |

**Bulk SMS details:**
- Static: same `Body` to up to 100 numbers per request (`To` as array)
- Dynamic: unique `Body` per recipient, up to 100 messages via `Messages` array
- Response: HTTP 207 with individual status per message

### 2C. SMS Status Codes (for webhook parsing)

| Code | Status | Meaning |
|------|--------|---------|
| 20005 | DELIVERED_TO_HANDSET | Success |
| 20006 | DELIVERED_TO_OPERATOR | Sent to telco |
| 21010 | PENDING_TO_OPERATOR | Queued |
| 23005 | FAILED_REJECTED_DND | DND block |
| 23010 | FAILED_INVALID_DESTINATION | Bad number |
| 23080 | SENDER_BLOCKED_BY_DLT | DLT entity blocked |
| 23082 | TEMPLATE_BLOCKED_BY_DLT | DLT template blocked |
| 23185 | DLT_TEMPLATE_DOES_NOT_MATCH | Content mismatch |

### 2D. SMS Webhook Callback

**Callback fields:** SmsSid, To, Status, DetailedStatus, DetailedStatusCode, DateSent, SmsUnits, CustomField

### 2E. URL Shortening & Click Tracking (in SMS)

| Parameter | Purpose |
|-----------|---------|
| `ShortenUrl: true` | Auto-shorten URLs in SMS body |
| `ShortenUrlParams[Header]` | DLT-whitelisted domain header |
| `ShortenUrlParams[CustomDomain]` | Custom short domain (default: exo.tl) |
| `ShortenUrlParams[Tracking]: true` | Enable click analytics |
| `ShortenUrlParams[ClickTrackingCallbackUrl]` | Webhook for click events |
| `ShortenUrlParams[TimeToExpiry]` | Link validity in minutes (1-365 days) |

**Click webhook data:** sid, short_url, long_url, clicks_count, geographic data, device info, OS, IP address

---

## CATEGORY 3: CAMPAIGN APIs (NOT USED)

### 3A. Call Campaigns

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Create campaign | POST | `/v2/accounts/{sid}/campaigns` | NOT USED |
| Get campaign details | GET | `/v2/accounts/{sid}/campaigns/{id}` | NOT USED |
| Update campaign | PUT | `/v2/accounts/{sid}/campaigns/{id}` | NOT USED |
| Delete campaign | DELETE | `/v2/accounts/{sid}/campaigns/{id}` | NOT USED |
| List all campaigns | GET | `/v2/accounts/{sid}/campaigns` | NOT USED |
| Campaign call details | GET | `/v2/accounts/{sid}/campaign/{id}/call-details` | NOT USED |

**Campaign capabilities:**
- **Types:** static (up to 5 contact lists), dynamic (single list)
- **Flow types:** IVR, greeting, or custom flow URL
- **Scheduling:** RFC 3339 format with `send_at` and `end_at`
- **Retries:** up to 3 retries with linear/exponential backoff
- **Contact sources:** comma-separated numbers (max 5000) OR list SIDs
- **Dynamic content:** `@@ variable_name` for personalized messaging
- **Actions:** pause, resume, complete, archive
- **Callbacks:** status_callback, call_status_callback, call_schedule_callback

### 3B. SMS Campaigns

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Create SMS campaign | POST | `/v2/accounts/{sid}/message-campaigns` | NOT USED |
| Get SMS campaign details | GET | `/v2/accounts/{sid}/message-campaigns/{id}` | NOT USED |
| Update SMS campaign | PUT | `/v2/accounts/{sid}/message-campaigns/{id}` | NOT USED |
| List SMS campaigns | GET | `/v2/accounts/{sid}/message-campaigns` | NOT USED |
| SMS details per campaign | GET | `/v2/accounts/{sid}/message-campaigns/{id}/message-details` | NOT USED |

**SMS campaign capabilities:**
- **Content types:** static (same template to all) or dynamic (personalized via `@@column_header`)
- **Scheduling:** RFC 3339 start/end times
- **DLT compliance:** entity_id and template_id required for India
- **Actions:** pause, resume, complete, archive
- **Statistics:** sent, failed, invalid counts, report URL
- **Callbacks:** campaign-level status + per-SMS delivery notifications

### 3C. Campaign Contacts

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Create contacts (bulk) | POST | `/v2/accounts/{sid}/contacts` | NOT USED |
| Get single contact | GET | `/v2/accounts/{sid}/contacts/{contactSid}` | NOT USED |
| Get contacts (paginated) | GET | `/v2/accounts/{sid}/contacts` | NOT USED |
| Update single contact | PUT | `/v2/accounts/{sid}/contacts/{contactSid}` | NOT USED |
| Update bulk contacts | PUT | `/v2/accounts/{sid}/contacts` | NOT USED |
| Delete contact | DELETE | `/v2/accounts/{sid}/contacts/{contactSid}` | NOT USED |

**Contact capabilities:**
- Up to 5000 contacts per bulk create request
- Fields: number (E.164), first_name, last_name, company_name, email, tag, custom (JSON key-value)
- Pagination: offset/limit (max 20 per page)
- Filtering by name, list_sids, sort_by
- HTTP 207 for bulk operations with per-contact status

### 3D. Campaign Lists

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Create list | POST | `/v2/accounts/{sid}/lists` | NOT USED |
| Get list details | GET | `/v2/accounts/{sid}/lists/{list_id}` | NOT USED |
| Get all lists | GET | `/v2/accounts/{sid}/lists` | NOT USED |
| Update list | PUT | `/v2/accounts/{sid}/lists/{list_id}` | NOT USED |
| Bulk update lists | PUT | `/v2/accounts/{sid}/lists` | NOT USED |
| Delete list | DELETE | `/v2/accounts/{sid}/lists/{list_id}` | NOT USED |
| Add contacts to list | POST | `/v2/accounts/{sid}/lists/{list_id}/contacts` | NOT USED |
| Get contacts in list | GET | `/v2/accounts/{sid}/lists/{list_id}/contacts` | NOT USED |
| Delete contact from list | DELETE | `/v2/accounts/{sid}/lists/{list_id}/contacts/{contact_sid}` | NOT USED |
| Upload CSV contacts | POST | `/v2/accounts/{sid}/contacts/csv-upload` | NOT USED |
| Check CSV upload status | GET | `/v2/accounts/{sid}/csv-status/{upload_id}` | NOT USED |

**CSV Upload:**
- Max 1 lakh contacts for static lists, 5 lakhs for dynamic
- Max file size: 60MB
- Columns: number (mandatory), first_name, last_name, company_name, email, tag
- Returns upload_id with progress tracking (duplicate, total, success, failed)

---

## CATEGORY 4: EXOPHONE MANAGEMENT (NOT USED)

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| List available numbers | GET | `/v2_beta/Accounts/{sid}/AvailablePhoneNumbers` | NOT USED |
| Numbers by country/type | GET | `/v2_beta/Accounts/{sid}/AvailablePhoneNumbers/{country}/{type}` | NOT USED |
| Purchase number | POST | `/v2_beta/Accounts/{sid}/IncomingPhoneNumbers` | NOT USED |
| Assign number to flow | PUT | `/v2_beta/Accounts/{sid}/IncomingPhoneNumbers/{exophone_sid}` | NOT USED |
| List all numbers | GET | `/v2_beta/Accounts/{sid}/IncomingPhoneNumbers` | NOT USED |
| Get number details | GET | `/v2_beta/Accounts/{sid}/IncomingPhoneNumbers/{exophone_sid}` | NOT USED |
| Delete number | DELETE | `/v2_beta/Accounts/{sid}/IncomingPhoneNumbers/{exophone_sid}` | NOT USED |

**Number types:** Landline, Mobile, TollFree
**Capabilities:** IncomingSMS, InRegion, Contains (search)
**Configuration:** VoiceUrl, SMSUrl, FriendlyName per number

---

## CATEGORY 5: USER MANAGEMENT (NOT USED)

**Subdomain:** `ccm-api.in.exotel.com`

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Create user | POST | `/v2/accounts/{sid}/users` | NOT USED |
| Update user | PUT | `/v2/accounts/{sid}/users/{user_id}` | NOT USED |
| Create/Update SIP password | PUT | `/v2/accounts/{sid}/users/{uuid}/devices/{device_id}/password` | NOT USED |
| Update user device | PUT | `/v2/accounts/{sid}/users/{user_id}/devices/{device_id}` | NOT USED |
| Get users (bulk) | GET | `/v2/accounts/{sid}/users` | NOT USED |
| Get single user | GET | `/v2/accounts/{sid}/users/{user_id}` | NOT USED |
| Delete user | DELETE | `/v2/accounts/{sid}/users/{user_id}` | NOT USED |

**User features:**
- Roles: admin, supervisor, user
- Device control: turn ON/OFF (only one device active per user)
- SIP password management for softphone/WebRTC
- Query filters: devices, active_call, last_login, email
- Pagination: offset/limit (max 50 per page)

---

## CATEGORY 6: HEARTBEAT / MONITORING (NOT USED)

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Subscribe webhook | POST | (via Dashboard) | NOT USED |
| Get ExoPhone details | GET | `/v2/accounts/{sid}/incoming-phone-numbers/{exophone_sid}` | NOT USED |

**Webhook payload:**
- `status_type`: OK, WARNING, CRITICAL, PAYLOAD_TOO_LARGE
- `incoming_affected`: array of SIDs with incoming issues
- `outgoing_affected`: array of SIDs with outgoing issues
- Connectivity status: active, major_outage, partial_network_outage
- `alternate_exophone` options for failover

---

## CATEGORY 7: LEAD ASSIST / NUMBER MASKING (NOT USED)

### 7A. GreenVN (Virtual Number Masking)

**Base URL:** `https://leadassist.exotel.in/v1/tenants/{sid}`

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Create VN allocation | POST | `/greenvn` | NOT USED |
| Delete VN allocation | DELETE | `/greenvn/{greenvn_id}` | NOT USED |
| Get allocation details | GET | `/greenvn/{greenvn_id}` | NOT USED |
| Update party numbers | PUT | `/greenvn/{greenvn_id}/call-party` | NOT USED |
| Update virtual number | PUT | `/greenvn/{greenvn_id}/vn` | NOT USED |

**What it does:** Connects two parties through a virtual number so neither sees the other's real phone number. Useful for:
- Counselor-to-student privacy (neither sees real number)
- Delivery/logistics call masking
- One-way or two-way calling

**Callbacks:** Call events, deallocation events, verification events (success/failure)

### 7B. GreenPin (PIN Verification)

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Create PIN allocation | POST | `/greenpin` | NOT USED |
| Delete PIN allocation | DELETE | `/greenpin/{greenpin_id}` | NOT USED |
| Get allocation details | GET | `/greenpin/{greenpin_id}` | NOT USED |
| Update allocation | PUT | `/greenpin/{greenpin_id}` | NOT USED |
| Bulk update allocations | PUT | `/greenpin` | NOT USED |

**What it does:** Caller dials virtual number, enters PIN, gets connected to correct party. Useful for OTP-like authentication via voice call.

### 7C. Lead Assist Settings

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Update settings | PUT | `/settings` | NOT USED |
| Get settings | GET | `/settings` | NOT USED |

**Configuration:** country, timezone, deallocation policy, sticky agent, least cost routing, callback endpoints for all event types

---

## CATEGORY 8: WHATSAPP APIs (NOT USED)

### 8A. Send Messages

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Send WhatsApp message | POST | `/v2/accounts/{sid}/messages` | NOT USED |

**Message types supported:**
- **Text:** up to 4096 chars, URL preview option
- **Image:** link + optional caption
- **Audio:** link only
- **Video:** link + optional caption
- **Document:** link + filename + optional caption
- **Sticker:** 512x512px webp, <100KB static / <500KB animated
- **Location:** longitude, latitude, name, address
- **Contact:** vCard with addresses, emails, phones, org
- **Interactive buttons:** up to 3 reply buttons with unique IDs
- **Interactive list:** 1-10 sections with up to 10 total rows
- **Flow messages:** Call-to-action buttons
- **Payment messages (India):** RazorPay and UPI Intent integration
- **Template messages:** pre-approved templates with parameter substitution

### 8B. Webhooks

| Webhook Type | Purpose |
|--------------|---------|
| `dlr` | Delivery status reports |
| `icm` | Incoming customer messages |

**Status codes:** 30002 (delivered), 30003 (seen/read), 30049 (payment pending), 30050 (payment success)

### 8C. WhatsApp Onboarding

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Create onboarding link | POST | `/v2/accounts/{sid}/isv` | NOT USED |
| Validate token | GET | `/v2/accounts/{sid}/isv?access_token={token}` | NOT USED |

**Onboarding links valid for 24 hours, up to 50 URLs simultaneously, each token onboards up to 5 customers**

### 8D. WhatsApp Template Management

Template CRUD operations for managing approved message templates (endpoint details not fully documented on the developer portal).

---

## CATEGORY 9: RCS MESSAGING (NOT USED)

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Send RCS message | POST | `/v2/accounts/{sid}/messages` | NOT USED |

**Features:**
- Template-based messaging with variable substitution
- Rich media: images, videos, interactive CTAs, personalized carousels
- SMS fallback built-in (with DLT compliance for India)
- Delivery reports: sent (40001), delivered (40002), seen (40003)
- Incoming message support: text, file, location, suggested replies

**Incoming message types:** text, file (with thumbnail), location (lat/long), suggested (reply buttons/actions)

---

## CATEGORY 10: URL SHORTENING (NOT USED)

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Shorten URL | POST | `/v2/accounts/{sid}/links` | NOT USED |
| Get short URL details | GET | `/v2/accounts/{sid}/links/{uuid}` | NOT USED |

**Features:**
- Custom domains (default: exo.tl)
- Click tracking with geographic data, device info, OS, IP
- Expiry: 60 seconds to 365 days (default: 31 days)
- Callback webhook for click events
- `custom_field` for metadata (up to 1024 chars)

---

## CATEGORY 11: GEN AI / VOICE INTELLIGENCE (NOT USED)

### 11A. ExoVoiceAnalyze (Alpha)

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Analyze call recording | POST | `/v1/Accounts/{sid}/Calls/{call_sid}/ExoVoiceAnalyze.json` | NOT USED |

**Insight tasks (can request multiple):**
- `summarization` - Auto-generate call summary
- `sentiment` - Detect positive/negative/neutral sentiment
- `categorise` - Classify call into business-defined categories
- `transcript` - Transcribe the call recording

**How it works:** Async via webhook. You POST the request, get a job_id back, results arrive at your callback_url. Supports multilingual conversations with English output.

### 11B. ExoMind Tasker (Alpha)

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Create AI task | POST | `https://exomind.exotel.com/api/v1/exotasks` | NOT USED |

**AI functions (ExoML verbs):**
- `Transcribe` - Media to text
- `Translate` - Language conversion (ISO-639-1 codes)
- `Query` - Natural language Q&A
- `Summarize` - Text condensation with sentiment/intent extraction

**Optimization modes:** cost, latency, determinism, conversational

---

## CATEGORY 12: CONTACT CENTER APIs (NOT USED)

### 12A. Contact Center v1/v2

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Auth token | POST | `/configuration/basicauth` | NOT USED |
| Bulk upload contacts | POST | `/v1/cc-list/{ccId}/process-list/{processId}/leads/{leadId}/contact-upload-tasks` | NOT USED |
| Get upload errors | GET | `...contact-upload-tasks/{taskId}/error-file` | NOT USED |
| Agent monitoring | GET | `/v4/cc-list/{ccId}/monitoring/user-session-information` | NOT USED |
| List processes | GET | `/configuration/cc/{ccId}/process` | NOT USED |

### 12B. Contact Center v4

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| User login | POST | `/ameyorestapi/session/userLogin` | NOT USED |
| Create user | POST | `/ameyorestapi/cc/contactCenterUsers` | NOT USED |
| Update user | PUT | `/ameyorestapi/cc/contactCenterUsers/{userId}` | NOT USED |
| Delete user | DELETE | `/ameyorestapi/user/users/{userId}` | NOT USED |
| Get customer callbacks | GET | `/ameyorestapi/voice/customerCallbacks/getFiltered` | NOT USED |
| Delete callback | DELETE | `/ameyorestapi/voice/customerCallbacks/{callbackId}` | NOT USED |
| Download voice logs | GET | `/ameyorestapi/cc/downloadVoiceLog` | NOT USED |

**Note:** Contact Center requires separate Ameyo/CCM setup. This is a full-blown call center platform on top of Exotel.

---

## CATEGORY 13: SIP TRUNKING (NOT USED)

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| Create trunk | POST | `/v2/accounts/{sid}/trunks` | NOT USED |
| Delete trunk | DELETE | `/v2/accounts/{sid}/trunks` | NOT USED |
| Map phone to trunk | POST | `/v2/accounts/{sid}/trunks/{trunk_sid}/phone-numbers` | NOT USED |
| Update phone mode | PUT | `/v2/accounts/{sid}/trunks/{trunk_sid}/phone-numbers/{id}` | NOT USED |
| Get trunk phones | GET | `/v2/accounts/{sid}/trunks/{trunk_sid}/phone-numbers` | NOT USED |
| Whitelist IP (ACL) | POST | `/v2/accounts/{sid}/trunks/{trunk_sid}/whitelisted-ips` | NOT USED |
| Get whitelisted IPs | GET | `/v2/accounts/{sid}/trunks/{trunk_sid}/whitelisted-ips` | NOT USED |
| Map destination URI | POST | `/v2/accounts/{sid}/trunks/{trunk_sid}/destination-uris` | NOT USED |
| Get destination URIs | GET | `/v2/accounts/{sid}/trunks/{trunk_sid}/destination-uris` | NOT USED |
| Set trunk alias | POST | `/v2/accounts/{sid}/trunks/{trunk_sid}/settings` | NOT USED |

**Modes:** PSTN (traditional phone), Flow (StreamKit routing)

---

## CATEGORY 14: EXOTEL MCP SERVER (AI Agent Integration)

**Not an API endpoint, but a protocol server.** Exotel provides a Model Context Protocol (MCP) server that enables AI agents (like Claude) to directly make calls, send SMS, and check statuses through natural language.

**Capabilities via MCP:**
- Send single, bulk, and dynamic SMS
- Initiate voice calls
- Connect two numbers (conferencing)
- Call flow integration with IVR
- Real-time SMS delivery monitoring
- Voice call status retrieval
- Call history analysis
- Audio playback and download

---

## CATEGORY 15: WEBRTC SDK (Browser-based Calling)

**Not fully documented.** The developer portal references IP-PSTN intermix with WebRTC SDK integration.

**Known capabilities:**
- Token-based auth at `https://integrationscore.mum1.exotel.com/v2/integrations/token`
- SIP credentials provisioning for browser-based calling
- Inbound/outbound call popup notifications
- Device control (turn off phone/SIP to route to browser)
- Custom audio streaming via WebSocket

---

## GAP ANALYSIS: High-Value APIs We Should Consider

### PRIORITY 1 (High Impact, Low Effort)

| API | Why It Matters for MyJKKN | Effort |
|-----|---------------------------|--------|
| **Voice v3 (upgrade from v1)** | Dual-channel recording, call legs, better state management, agent status. Our v1 client just needs URL/param changes. | Low |
| **Get SMS Details** | Track delivery status of SMS we send to leads. Currently we fire-and-forget. | Low |
| **Bulk SMS** | SMS campaigns to 100 leads at once instead of looping single sends. Our SMS campaign service could use this directly. | Low |
| **ExoVoiceAnalyze (Gen AI)** | Auto-transcribe, summarize, and sentiment-analyze EVERY call recording. Counselor quality monitoring for free. | Medium |
| **Heartbeat Webhook** | Get alerted when ExoPhones go down instead of discovering it when calls fail. | Low |

### PRIORITY 2 (High Impact, Medium Effort)

| API | Why It Matters for MyJKKN | Effort |
|-----|---------------------------|--------|
| **Call Campaigns** | Automated batch calling for lead follow-ups. Upload a list, set schedule, Exotel calls everyone with retries. Replaces manual counselor dialing. | Medium |
| **SMS Campaigns** | Scheduled batch SMS with personalization (`@@student_name`). Replaces our homegrown SMS campaign service. | Medium |
| **Campaign Contacts + Lists** | Centralized contact management synced with our leads DB. CSV upload for bulk imports. | Medium |
| **URL Shortening + Click Tracking** | Track which links in SMS messages leads actually click. Attribution for admission campaigns. | Low |

### PRIORITY 3 (Specialized Use Cases)

| API | Why It Matters for MyJKKN | Effort |
|-----|---------------------------|--------|
| **WhatsApp Messaging** | Send WhatsApp messages via Exotel (instead of Meta direct). Template messages, delivery tracking, incoming message handling. | High |
| **User Management** | Sync counselor accounts between MyJKKN and Exotel. Manage agent availability programmatically. | Medium |
| **Lead Assist (GreenVN)** | Number masking between counselors and prospects. Privacy compliance for admission calls. | Medium |
| **Agent Stream** | Real-time voice streaming for live transcription during calls. AI coaching for counselors. | High |
| **ExoPhone Management** | Programmatically manage phone numbers, assign to IVR flows. | Low |
| **RCS Messaging** | Rich interactive messages with buttons, carousels. Next-gen SMS for admission outreach. | Medium |
| **WebRTC SDK** | Browser-based calling for counselors (no phone needed). Softphone in MyJKKN dashboard. | High |

### NOT RECOMMENDED for MyJKKN

| API | Why Skip |
|-----|----------|
| Contact Center v4 (Ameyo) | Full call center platform. Overkill for admission use case. |
| SIP Trunking | Enterprise telephony infrastructure. Not needed. |
| GreenPin | PIN verification via voice call. No current use case. |
| ExoMind Tasker | General AI task runner. ExoVoiceAnalyze is sufficient for calls. |

---

## Webhook Types Summary

| Webhook | What It Sends | We Handle? |
|---------|---------------|------------|
| Call status callback | CallSid, Status, Duration, RecordingUrl, Price | YES |
| IVR Passthru | Dynamic routing info from IVR flow | YES |
| SMS delivery report | SmsSid, Status, DetailedStatus, DateSent, SmsUnits | NO |
| Campaign status | Campaign-level progress/completion | NO |
| Campaign per-call status | Individual call results in campaign | NO |
| Campaign per-SMS status | Individual SMS delivery in campaign | NO |
| Heartbeat | ExoPhone health (OK/WARNING/CRITICAL) | NO |
| Lead Assist call event | Call completion between masked parties | NO |
| Lead Assist deallocation | Virtual number freed | NO |
| URL click tracking | Click data with geo/device info | NO |
| WhatsApp DLR | Message delivery/read receipts | NO |
| WhatsApp ICM | Incoming customer messages | NO |
| RCS DLR | Message delivery/read receipts | NO |
| RCS incoming | Customer replies and interactions | NO |
| ExoVoiceAnalyze results | Transcription, sentiment, summary, categories | NO |

---

## Rate Limits & Pagination

| API Area | Rate Limit | Pagination |
|----------|-----------|------------|
| Voice APIs | 200 calls/minute | PageSize + Offset |
| SMS APIs | Varies (503 on breach) | N/A (batch max 100) |
| Campaign Contacts | N/A | offset + limit (max 20) |
| Campaign Lists | N/A | offset + limit (default 20) |
| Users API | N/A | offset + limit (max 50) |
| Heartbeat polling | HTTP 429 on excess | N/A |
| CSV Upload | 1 lakh static / 5 lakh dynamic | N/A |

---

## Recording Access Notes

- v1: `RecordingUrl` in webhook payload and GET call details response
- v2/v3: `recordings` array with playable URLs (MP3 on S3)
- Recording channels: single (mono) or dual (stereo) -- v2/v3 only
- Recording quality: standard or high-quality MP3 -- v3 only
- Recordings accessible via direct URL (no additional auth needed for playback)
- FAQ says recording URLs are accessible for "a year" (not indefinitely)

---

## Quick Reference: Base URLs

| API Area | Base URL |
|----------|----------|
| Voice v1 | `https://api.in.exotel.com/v1/Accounts/{sid}` |
| Voice v2/v3 | `https://ccm-api.in.exotel.com/v2/accounts/{sid}` or `/v3/` |
| SMS v1 | `https://api.in.exotel.com/v1/Accounts/{sid}` |
| Campaigns v2 | `https://api.in.exotel.com/v2/accounts/{sid}` |
| ExoPhones | `https://api.in.exotel.com/v2_beta/Accounts/{sid}` |
| Users | `https://ccm-api.in.exotel.com/v2/accounts/{sid}` |
| Heartbeat | `https://api.in.exotel.com/v2/accounts/{sid}` |
| Lead Assist | `https://leadassist.exotel.in/v1/tenants/{sid}` |
| WhatsApp | `https://api.in.exotel.com/v2/accounts/{sid}` |
| RCS | `https://api.in.exotel.com/v2/accounts/{sid}` |
| URL Shortening | `https://api.in.exotel.com/v2/accounts/{sid}` |
| GenAI | `https://api.in.exotel.com/v1/Accounts/{sid}` (ExoVoiceAnalyze) |
| GenAI (ExoMind) | `https://exomind.exotel.com/api/v1` |
| Contact Center v4 | Self-hosted (Ameyo) |
| SIP Trunking | `https://api.in.exotel.com/v2/accounts/{sid}` |
| WebRTC | `https://integrationscore.mum1.exotel.com/v2` |

---

## Total API Endpoint Count

| Category | Endpoints | Currently Used |
|----------|-----------|----------------|
| Voice (v1/v2/v3) | 8 | 3 |
| SMS | 4 | 1 |
| Call Campaigns | 6 | 0 |
| SMS Campaigns | 5 | 0 |
| Campaign Contacts | 6 | 0 |
| Campaign Lists | 11 | 0 |
| ExoPhone Management | 7 | 0 |
| User Management | 7 | 0 |
| Heartbeat | 2 | 0 |
| Lead Assist (GreenVN) | 5 | 0 |
| Lead Assist (GreenPin) | 5 | 0 |
| Lead Assist Settings | 2 | 0 |
| WhatsApp | 3 | 0 |
| RCS | 1 | 0 |
| URL Shortening | 2 | 0 |
| GenAI | 2 | 0 |
| Contact Center | 7 | 0 |
| SIP Trunking | 9 | 0 |
| Agent Stream | 1 | 0 |
| **TOTAL** | **~93** | **4** |

**We are using approximately 4% of available Exotel APIs.**

---

*Report generated from https://developer.exotel.com/ on 2026-04-05*
*For MyJKKN project: /Users/omm/PROJECTS/MyJKKN*
