# MyJKKN WhatsApp Integration — Combined Spec

> **Created:** 2026-03-30 | **Replaces:** WHATSAPP-16-GAPS-SPEC.md + UNIFIED-COMMUNICATION-SUITE-SPEC.md (WhatsApp sections)
> **Scope:** Platform-wide WhatsApp Business API for ALL MyJKKN modules
> **Provider:** Meta Cloud API v21.0 (direct — NOT via Exotel)
> **Voice calls:** Exotel (separate system, see specs/exotel-setup/)

---

## 1. Current State

### Meta API — LIVE

| Item | Value | Status |
|------|-------|--------|
| Phone Number | +91 63803 10048 | VERIFIED, "JKKN Institutions" |
| Phone Number ID | `1043868105477092` | Active |
| Business Account ID | `203800758166888` | Active |
| App ID | `437028995095541` | Active |
| Access Token | Permanent (Conversions API System User) | Never expires |
| Quality Rating | GREEN | Healthy |
| API Version | v21.0 | Current |
| Messages Sent | **0** | Never tested |
| Webhook URL | **NOT CONFIGURED** | Critical gap |

### Approved Templates on Meta

| Template Name | Category | Language | Status |
|---------------|----------|----------|--------|
| `jkkn_welcome` | MARKETING | en | APPROVED |
| `exhibition_thankyou` | MARKETING | en | APPROVED |

### Code Infrastructure — BUILT (6,275 lines)

| Service File | Lines | What It Does |
|-------------|-------|-------------|
| `whatsapp-api-client.ts` | 456 | Meta Cloud API — text, media, template, interactive, location messages |
| `whatsapp-chat-service.ts` | 1,064 | Two-way conversation management, routing, consent, auto-assignment |
| `whatsapp-connection-service.ts` | 475 | Multi-WABA number management per institution |
| `whatsapp-consent-service.ts` | 240 | DPDPA 2023 compliance, opt-in/opt-out, STOP keyword |
| `whatsapp-template-service.ts` | 560 | Meta template sync, quality tracking, local CRUD |
| `whatsapp-routing-service.ts` | 300 | Smart categorization (7 intents), priority routing |
| `whatsapp-settings-service.ts` | 188 | Institution-level WhatsApp settings |
| `whatsapp-forms-service.ts` | 600 | Interactive buttons, lists, flows, response collection |
| `whatsapp-counselor-analytics-service.ts` | 340 | Counselor performance metrics |
| `whatsapp-message-log-service.ts` | 380 | Message logging and search |
| `whatsapp-document-catalog-service.ts` | 220 | Shareable document catalog for chats |
| `whatsapp-segment-service.ts` | 360 | Audience segmentation for campaigns |
| `whatsapp-reengagement-service.ts` | 360 | Re-engagement campaign automation |
| `whatsapp-template-analytics-service.ts` | 270 | Template performance analytics |

### API Routes — 18 Endpoints

```
/api/webhooks/whatsapp/                          — Inbound messages + delivery status
/api/admission/chat/conversations/               — List conversations
/api/admission/chat/conversations/[id]/          — Get conversation
/api/admission/chat/conversations/[id]/messages/ — Get/send messages
/api/admission/chat/conversations/[id]/assign/   — Assign counselor
/api/admission/chat/conversations/[id]/resolve/  — Resolve conversation
/api/admission/chat/conversations/[id]/reopen/   — Reopen conversation
/api/admission/chat/consent/                     — Consent management
/api/admission/chat/consent/stats/               — Consent metrics
/api/admission/chat/forms/                       — Interactive forms
/api/admission/chat/forms/[id]/responses/        — Form responses
/api/admission/chat/quick-replies/               — Canned responses
/api/admission/chat/templates/refresh-quality/   — Sync quality from Meta
/api/admission/chat/templates/analytics/         — Template performance
/api/admission/chat/documents/                   — Document catalog
/api/admission/chat/documents/[id]/share/        — Share document
/api/admission/chat/stats/                       — Conversation stats
/api/admission/chat/counselor-performance/       — Counselor metrics
```

### Database Tables — 13 WhatsApp tables

| Table | Purpose |
|-------|---------|
| `wa_conversations` | Chat conversations (institution, lead, phone, assigned counselor, status) |
| `wa_messages` | Individual messages (direction, type, content, status, cost) |
| `wa_phone_numbers` | Multi-WABA: phone number → institution mapping |
| `wa_settings` | Institution-level WhatsApp config |
| `wa_quick_replies` | Canned responses (/fee, /program) |
| `wa_consent_log` | Consent audit trail (DPDPA 2023) |
| `wa_audience_segments` | Saved audience segments for campaigns |
| `wa_document_catalog` | Shareable documents (brochures, fee sheets) |
| `wa_form_templates` | Interactive form definitions |
| `wa_form_responses` | Form submission responses |
| `wa_message_logs` | Legacy message log (0 records) |
| `whatsapp_templates` | Local template store (3 templates, not synced with Meta) |
| `communication_cost_log` | Cross-channel cost tracking |

### Drip Executor — WIRED

The drip campaign executor at `lib/services/admission/drip-executor-service.ts` (lines 792-866) fully supports WhatsApp:
- Consent check before send
- 3 modes: Meta-approved templates, local templates within 24hr window, direct text
- Phone normalization (+91 India)
- Variable substitution (full_name, program, etc.)
- Cost logging
- **SMS is still stubbed** (separate from WhatsApp)

### UI Pages — BUILT

```
/admission/chat/                — Main conversation inbox (3-panel)
/admission/chat/settings/       — WhatsApp settings
/admission/chat/performance/    — Counselor analytics dashboard
/admission/settings/whatsapp-numbers/ — WABA number management
```

---

## 2. Architecture

### Provider Separation

| Channel | Provider | Code Location | Status |
|---------|----------|---------------|--------|
| **WhatsApp** | Meta Cloud API (direct) | `lib/services/whatsapp/` | BUILT, untested |
| **Voice calls** | Exotel | `lib/services/admission/` (call routes) | Separate system |
| **Email** | Resend | `lib/services/email/` | BUILT |
| **SMS** | MSG91 / Twilio | `lib/services/sms/` | BUILT |

### Message Flow

```
OUTBOUND (MyJKKN → Lead):
  Service → WhatsAppApiClient → POST graph.facebook.com/v21.0/{phone_id}/messages
  → Meta delivers → Webhook returns delivery status → wa_messages updated

INBOUND (Lead → MyJKKN):
  Lead sends WhatsApp → Meta → POST /api/webhooks/whatsapp → Signature verify
  → Institution lookup (wa_phone_numbers) → WhatsAppChatService.handleInboundMessage()
  → Smart routing → Counselor assignment → Real-time UI update

DRIP AUTOMATION:
  Drip executor step → consent check → pick template/text → WhatsAppApiClient.send()
  → Log to communication_cost_log
```

### Cross-Module Integration Map

WhatsApp is NOT admission-only. It serves ALL modules:

| Module | WhatsApp Use | Template Needed |
|--------|-------------|-----------------|
| **Admission CRM** | Lead nurture, counselor chat, campaigns, drip sequences | Welcome, follow-up, offer, deadline |
| **Expo Capture** | Auto-welcome on lead capture at exhibitions | `exhibition_thankyou` (APPROVED) |
| **Billing** | Fee reminders, payment confirmations, due date alerts | Fee reminder, receipt |
| **Academic** | Attendance alerts to parents, exam schedules | Attendance alert, schedule |
| **Organization** | Announcements, event notifications | General announcement |
| **Learners** | Profile updates, document requests | Document request |
| **Staff** | Leave approvals, duty notifications | Leave status |
| **Campus Living** | Hostel notifications, mess updates | Hostel notice |

---

## 3. Critical Setup Required (Before ANY Message Can Be Sent)

### 3.1 Register Webhook URL with Meta (BLOCKER)

Meta needs to know where to send inbound messages. Without this, the system is send-only.

**Steps:**
1. Go to Meta Business Manager → WhatsApp → Configuration
2. Set Webhook URL: `https://myjkkn-omm-dev.vercel.app/api/webhooks/whatsapp`
3. Set Verify Token: value from `WHATSAPP_VERIFY_TOKEN` env var
4. Subscribe to: `messages`, `message_template_status_update`
5. Test: Send a WhatsApp message to +91 63803 10048 → should appear in webhook logs

**Env var needed:** `WHATSAPP_VERIFY_TOKEN` — must be set in Vercel env and match Meta config.
**Env var needed:** `WHATSAPP_WEBHOOK_SECRET` — for HMAC signature verification (set in Meta app dashboard under App Secret).

### 3.2 Sync Templates (Meta ↔ Database)

Current state: Meta has 2 templates, DB has 3 different ones. They need to be unified.

**Action:**
1. Sync the 2 Meta-approved templates INTO the DB (via template service `refreshAllQualityRatings()`)
2. Create additional templates on Meta for each module's needs
3. Submit and wait for Meta approval (usually 24-48 hours)

**Templates to submit to Meta:**

| Template Name | Module | Category | Content |
|---------------|--------|----------|---------|
| `jkkn_welcome` | Admission | MARKETING | Already approved |
| `exhibition_thankyou` | Expo Capture | MARKETING | Already approved |
| `fee_reminder` | Billing | UTILITY | Fee due reminder with amount + deadline |
| `attendance_alert` | Academic | UTILITY | Absence notification to parents |
| `application_status` | Admission | UTILITY | Application stage update |
| `payment_received` | Billing | UTILITY | Payment confirmation receipt |
| `document_request` | Admission | UTILITY | Request for pending documents |
| `campus_announcement` | Organization | MARKETING | General institution announcement |

### 3.3 Register Phone Number in Database

The `wa_phone_numbers` table is empty. Need to insert the active number:

```sql
INSERT INTO wa_phone_numbers (
  institution_id, phone_number_id, business_account_id,
  display_number, verified_name, quality_rating, is_primary
) VALUES (
  'a1111111-1111-1111-1111-111111111111',
  '1043868105477092',
  '203800758166888',
  '+916380310048',
  'JKKN Institutions',
  'GREEN',
  true
);
```

### 3.4 First Test Message

Send a test message to verify the full pipeline:

```typescript
// Using the API client:
const client = new WhatsAppApiClient();
await client.sendTemplateMessage(
  '919876543210',           // test recipient
  'jkkn_welcome',           // approved template
  'en',                     // language
  []                        // no parameters for now
);
```

---

## 4. Remaining Genuine Gaps

Most of the original 16 gaps are ALREADY BUILT in code. Here's what's genuinely missing:

### P0 — Must Do (Blocking live usage)

| # | Gap | What's Missing | Effort |
|---|-----|---------------|--------|
| 1 | **Webhook registration** | Meta doesn't know our webhook URL. Zero inbound messages possible. | 15 min config |
| 2 | **Phone number in DB** | `wa_phone_numbers` table is empty. Services can't resolve institution. | 5 min SQL |
| 3 | **Template sync** | DB templates don't match Meta. Need to run sync + submit new ones. | 1 hour |
| 4 | **First test send** | 0 messages ever sent. Need to verify the full pipeline works. | 30 min |
| 5 | **WHATSAPP_VERIFY_TOKEN env** | May not be set on Vercel. Required for webhook verification. | 5 min |

### P1 — Important (Feature completion)

| # | Gap | What's Missing | Effort |
|---|-----|---------------|--------|
| 6 | **Expo auto-welcome** | Wire `exhibition_thankyou` template send into `expo-capture-service.ts` after lead creation | 2 hours |
| 7 | **Echo Bubble widget** | Floating chat indicator on all admission pages (counselors see new messages without navigating) | 4 hours |
| 8 | **Funnel view in chat** | Show lead's admission stage (new→contacted→applied→enrolled) in conversation list | 2 hours |
| 9 | **Cross-module routing** | Current routing is admission-only. Need to route billing/academic/staff messages to correct teams | 4 hours |

### P2 — Valuable (Enhancement)

| # | Gap | What's Missing | Effort |
|---|-----|---------------|--------|
| 10 | **Starter template library** | Pre-built templates for all 8 modules. Need to create, submit to Meta, get approved | 3 hours + Meta approval time |
| 11 | **Template submission UI** | UI for creating templates and submitting to Meta for approval (currently code-only) | 6 hours |
| 12 | **WhatsApp Commerce** | Fee payment via WhatsApp catalog (Meta Commerce API) | Research — defer |

### NOT Gaps (Already Built)

These were listed as gaps in the old spec but ARE ALREADY BUILT:

| Old Gap | Service That Handles It |
|---------|------------------------|
| Drip → WhatsApp wiring | `drip-executor-service.ts` lines 792-866 |
| Consent tracking | `whatsapp-consent-service.ts` |
| Smart routing | `whatsapp-routing-service.ts` |
| 24hr window | `whatsapp-chat-service.ts` |
| Template quality | `whatsapp-template-service.ts` |
| Audience segments | `whatsapp-segment-service.ts` |
| Template analytics | `whatsapp-template-analytics-service.ts` |
| Document catalog | `whatsapp-document-catalog-service.ts` |
| Counselor performance | `whatsapp-counselor-analytics-service.ts` |
| Re-engagement | `whatsapp-reengagement-service.ts` |
| Multi-WABA | `whatsapp-connection-service.ts` |
| Cost tracking | Webhook handler + `communication_cost_log` |

---

## 5. Build Phases

### Phase 0: Go Live (Day 1) — Config only, no code

1. Register webhook URL in Meta Business Manager
2. Set `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_WEBHOOK_SECRET` on Vercel
3. Insert phone number into `wa_phone_numbers` table
4. Run template sync from Meta → DB
5. Send first test message
6. Verify inbound message arrives via webhook

### Phase 1: Expo + Chat (Days 2-3)

1. Wire `exhibition_thankyou` template into expo-capture-service (auto-send on lead capture)
2. Test counselor chat inbox with real inbound/outbound messages
3. Verify consent tracking works (opt-in on first inbound, STOP keyword handling)
4. Test drip sequence with WhatsApp step

### Phase 2: Cross-Module Templates (Days 4-7)

1. Create and submit templates for billing, academic, organization modules
2. Wait for Meta approval (24-48 hours)
3. Build cross-module routing (billing inquiry → finance team, academic → faculty)
4. Add Echo Bubble floating widget
5. Add funnel view in conversation list

### Phase 3: Scale (Week 2+)

1. Add more WABA numbers for other institutions
2. Template submission UI
3. Bulk campaign testing
4. Commerce/catalog exploration

---

## 6. Environment Variables

All required env vars for WhatsApp:

| Variable | Purpose | Set On |
|----------|---------|--------|
| `WHATSAPP_PHONE_NUMBER_ID` | Default phone number for API calls | .env.local + Vercel |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA ID for template management | .env.local + Vercel |
| `WHATSAPP_APP_ID` | Meta App ID | .env.local + Vercel |
| `WHATSAPP_ACCESS_TOKEN` | Permanent API token (never expires) | .env.local + Vercel |
| `WHATSAPP_DEDICATED_NUMBER` | Display phone number (916380310048) | .env.local + Vercel |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification (you choose this value) | **NEED TO SET** |
| `WHATSAPP_WEBHOOK_SECRET` | HMAC signature verification (from Meta App Secret) | **NEED TO SET** |

---

## 7. Developer Handoff

### Quick Start

```bash
git checkout omm-dev
npm install
npm run dev

# Test WhatsApp API connection:
curl -s "https://graph.facebook.com/v21.0/1043868105477092" \
  -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN"
# Should return: verified_name: "JKKN Institutions", quality_rating: "GREEN"
```

### Key Files

| Purpose | File |
|---------|------|
| Meta API client | `lib/services/whatsapp/whatsapp-api-client.ts` |
| Chat service | `lib/services/whatsapp/whatsapp-chat-service.ts` |
| Webhook handler | `app/api/webhooks/whatsapp/route.ts` |
| Drip WhatsApp | `lib/services/admission/drip-executor-service.ts` (line 792) |
| Expo auto-send | `lib/services/admission/expo-capture-service.ts` (add here) |
| Template sync | `lib/services/whatsapp/whatsapp-template-service.ts` |
| Phone numbers | `lib/services/whatsapp/whatsapp-connection-service.ts` |

### Testing Checklist

- [ ] Webhook URL registered in Meta → inbound messages arrive
- [ ] Template sync runs → DB matches Meta
- [ ] Send template message → recipient receives on WhatsApp
- [ ] Receive inbound → appears in chat inbox
- [ ] Expo capture → auto-sends exhibition_thankyou
- [ ] Drip step → sends WhatsApp with consent check
- [ ] STOP keyword → lead opted out, no more messages
- [ ] Multi-WABA → correct institution resolved from phone number

### Do NOT

- Do NOT use Exotel for WhatsApp (Exotel = voice only)
- Do NOT send without consent check (DPDPA 2023 violation)
- Do NOT send free-text outside 24hr window (use templates)
- Do NOT hardcode phone number ID (use `wa_phone_numbers` table for multi-WABA)
- Do NOT create WhatsApp tables on production via MCP (target staging: `hhprjbgknupaplivtoib`)

---

## 8. Files Superseded by This Spec

| Old File | Disposition |
|----------|-------------|
| `specs/WHATSAPP-16-GAPS-SPEC.md` | **SUPERSEDED** — 14 of 16 gaps already built. This spec has the real status. |
| `specs/UNIFIED-COMMUNICATION-SUITE-SPEC.md` | **HISTORICAL** — WhatsApp sections are outdated. Keep for email/SMS/voice reference. |
| `specs/exotel-setup-spec.md` | **KEEP** — Exotel is voice-only. Not related to WhatsApp. |
| `specs/exotel-setup/` | **KEEP** — Developer handoff for voice call integration. |
