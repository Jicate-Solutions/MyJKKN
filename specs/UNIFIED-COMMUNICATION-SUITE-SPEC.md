# MyJKKN Unified Communication Suite — Engineering Spec

**Created:** 2026-02-20
**Source:** FST Gap Analysis — Meritto vs MyJKKN (`Claude Setup/Capture/MyJKKN/FST-Meritto-vs-MyJKKN-Gap-Analysis.md`)
**Status:** Draft
**Build Phases:** 4 phases, 16 weeks total

---

## Overview

MyJKKN's Admission CRM has the brain (scoring, workflows, AI insights, drip campaigns) but not the mouth (email, chat, calling). This spec fills ALL 16 communication gaps identified in the Meritto gap analysis, organized into 4 build phases.

**What exists today:**
- Lead pipeline with scoring, assignment rules, source tracking
- Communication templates table (`admission_communication_templates`) with `sms | email | whatsapp` channels
- WhatsApp bulk send architecture (stubbed — service files exist but not wired to any provider)
- SMS sending via MSG91 (primary) and Twilio (fallback)
- Push notification infrastructure (`web-push` installed, subscribe endpoint exists)
- Drip campaign queue (`admission_campaign_queue`) with step types including `send_email`, `send_sms`, `send_whatsapp`
- Workflow engine with triggers (`stage_change`, `lead_created`, `score_change`, etc.)
- AI service using Claude Haiku via `@anthropic-ai/sdk`

**What this spec adds:**
- Phase 1: Email infrastructure + WhatsApp live chat inbox
- Phase 2: Telephony (click-to-call) integration
- Phase 3: Prospect-facing AI chatbot (website + WhatsApp)
- Phase 4: Intelligence layer (real-time alerts, campaign ROI, in-chat forms, multilingual SMS, email builder, voice agents)

---

## Tech Stack Alignment

| Layer | Current | New Dependencies |
|-------|---------|-----------------|
| Email | None (templates only) | `resend` (Resend SDK) |
| WhatsApp | Stubs at `lib/services/whatsapp/` | Official WhatsApp Cloud API via Meta Business Platform |
| Telephony | None | `exotel` REST API via `axios` (already installed) |
| AI (prospect-facing) | Claude Haiku (internal only) | Same SDK, new service + embeddable widget |
| Voice AI | None | Exotel + Claude for STT/TTS orchestration |
| Email Builder | None | `react-email` + `@react-email/components` |

---

## Database Conventions (for all migrations)

```sql
-- Follow existing patterns:
-- File: supabase/migrations/YYYYMMDDNNNNNN_description.sql
-- UUID PRIMARY KEY DEFAULT gen_random_uuid()
-- TIMESTAMPTZ NOT NULL DEFAULT NOW() for created_at/updated_at
-- References: UUID REFERENCES public.profiles(id) ON DELETE SET NULL
-- Always: ALTER TABLE ... ENABLE ROW LEVEL SECURITY
-- DROP POLICY IF EXISTS before CREATE POLICY (idempotent)
-- CREATE INDEX IF NOT EXISTS idx_tablename_column ON tablename(column)
-- Multi-tenant: institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE
```

**Next migration number:** `20260222000001` and increment from there.

---

# PHASE 1: Give the CRM a Voice (Weeks 1-4)

## 1.1 Email Infrastructure

**Priority:** P0 — Immediate
**Effort:** 1-2 weeks
**Gap #1 from FST analysis**

### Why Resend over SendGrid

- Simpler API, better DX, React Email integration for future email builder
- Free tier: 3,000 emails/month (sufficient for JKKN's current volume)
- No complex configuration — single API key

### New Dependencies

```bash
npm install resend
```

### Environment Variables

```env
# .env.local
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM_EMAIL=admissions@jkkn.ac.in
RESEND_FROM_NAME=JKKN Admissions
RESEND_REPLY_TO=admissions@jkkn.ac.in
```

**DNS setup required:** Add Resend's SPF, DKIM, and DMARC records to `jkkn.ac.in` domain.

### New Service: `lib/services/email/email-service.ts`

```typescript
/**
 * Email sending service using Resend.
 * Integrates with existing communication templates system.
 *
 * Pattern: Static-method class matching AdmissionAIService pattern.
 * Template variables: {{variable_name}} format (same as existing templates).
 */

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  reply_to?: string;
  cc?: string[];
  bcc?: string[];
  tags?: { name: string; value: string }[];
  // For tracking which lead/campaign triggered this email
  metadata?: {
    lead_id?: string;
    campaign_id?: string;
    template_id?: string;
    institution_id?: string;
  };
}

interface SendTemplateEmailParams {
  to: string | string[];
  template_id: string;
  variables: Record<string, string>;
  institution_id: string;
  lead_id?: string;
  campaign_id?: string;
}

interface EmailSendResult {
  success: boolean;
  message_id?: string;
  error?: string;
}

// Static methods:
// - sendEmail(params: SendEmailParams): Promise<EmailSendResult>
// - sendTemplateEmail(params: SendTemplateEmailParams): Promise<EmailSendResult>
//   → Fetches template from admission_communication_templates where channel='email'
//   → Replaces {{variables}} using CommunicationTemplatesService.replaceVariables()
//   → Sends via Resend
//   → Logs to admission_email_logs table
// - sendBulkEmail(recipients: SendTemplateEmailParams[]): Promise<EmailSendResult[]>
//   → Batch send with rate limiting (10/second for Resend free tier)
// - isConfigured(): boolean
//   → Checks RESEND_API_KEY exists
```

### New Database Table: `admission_email_logs`

**Migration:** `20260222000001_create_email_logs.sql`

```sql
CREATE TABLE IF NOT EXISTS public.admission_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.admission_leads(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.admission_campaign_queue(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.admission_communication_templates(id) ON DELETE SET NULL,

  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,

  -- Resend tracking
  resend_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  -- status values: queued | sent | delivered | opened | clicked | bounced | complained | failed

  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  error_message TEXT,

  -- Metadata
  tags JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admission_email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_logs_institution_access" ON public.admission_email_logs;
CREATE POLICY "email_logs_institution_access" ON public.admission_email_logs
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM public.user_institution_access
      WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_email_logs_institution ON public.admission_email_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_lead ON public.admission_email_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign ON public.admission_email_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.admission_email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON public.admission_email_logs(created_at DESC);
```

### New Webhook: `app/api/webhooks/email/route.ts`

Resend sends delivery events via webhook. Handle:
- `email.sent` → update status to 'sent'
- `email.delivered` → update status to 'delivered'
- `email.opened` → update status to 'opened', set opened_at
- `email.clicked` → update status to 'clicked', set clicked_at
- `email.bounced` → update status to 'bounced', set bounced_at
- `email.complained` → update status to 'complained'

**Verification:** Resend signs webhooks with `svix-id`, `svix-timestamp`, `svix-signature` headers. Verify using `RESEND_WEBHOOK_SECRET` env var.

```env
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

### Wire Email Into Existing Systems

**1. Drip Campaign Executor** (`lib/services/admission/drip-executor-service.ts`):
The `send_email` step type already exists in the campaign queue. Wire it to call `EmailService.sendTemplateEmail()` instead of the current no-op.

**2. Workflow Actions** (`lib/services/admission/workflows-service.ts`):
The `send_email` action type already exists. Wire it to `EmailService.sendTemplateEmail()`.

**3. Notification Service** (`lib/services/notification/notification-service.ts`):
The `EMAIL` channel in `NotificationChannel` enum is stubbed. Wire it to `EmailService.sendEmail()`.

**4. Lead Profile Page** (`app/(routes)/admission/leads/[id]/page.tsx`):
Add "Send Email" button to the lead detail page. Opens a compose modal with:
- Template selector (filters `channel='email'` from `admission_communication_templates`)
- Variable auto-fill from lead data
- Subject line (from template or custom)
- Preview before send
- Send button → calls `EmailService.sendTemplateEmail()`

### New API Routes

```
POST /api/admission/email/send
  Body: { to, template_id, variables, lead_id?, institution_id }
  → Sends single email, logs to admission_email_logs

POST /api/admission/email/send-bulk
  Body: { recipients: [{ to, template_id, variables, lead_id }], institution_id }
  → Batch send with rate limiting

GET /api/admission/email/logs
  Query: { institution_id, lead_id?, campaign_id?, status?, from?, to? }
  → Returns email log entries with pagination

POST /api/webhooks/email
  → Resend webhook handler (delivery events)
```

---

## 1.2 WhatsApp Live Chat (Echo Equivalent)

**Priority:** P0 — Immediate
**Effort:** 3-4 weeks
**Gap #2 from FST analysis**

### Architecture Decision: Official WhatsApp Cloud API

The existing WhatsApp services are stubbed for a self-hosted bridge (`service_url` pattern). This spec pivots to **Meta's official WhatsApp Cloud API** because:
- Green tick verification for JKKN
- Template pre-approval system (required for India)
- Reliable delivery and read receipts
- No self-hosted infra to maintain
- Required for WhatsApp chatbot (Phase 3)

### Environment Variables

```env
# Meta WhatsApp Cloud API
WHATSAPP_PHONE_NUMBER_ID=xxxxxxxxxxxxx
WHATSAPP_BUSINESS_ACCOUNT_ID=xxxxxxxxxxxxx
WHATSAPP_ACCESS_TOKEN=xxxxxxxxxxxxx
WHATSAPP_VERIFY_TOKEN=jkkn-wa-verify-2026
WHATSAPP_WEBHOOK_SECRET=xxxxxxxxxxxxx
WHATSAPP_APP_ID=xxxxxxxxxxxxx
```

### Refactor Existing Stubs: `lib/services/whatsapp/`

Replace ALL stub implementations with real WhatsApp Cloud API calls:

**`whatsapp-api-client.ts`** — Rewrite as Meta Cloud API client:
```typescript
/**
 * WhatsApp Cloud API client.
 * Base URL: https://graph.facebook.com/v21.0/{phone_number_id}/messages
 * Auth: Bearer token in Authorization header
 *
 * Methods:
 * - sendTextMessage(to: string, text: string): Promise<WAMessageResponse>
 * - sendTemplateMessage(to: string, templateName: string, languageCode: string, components?: WATemplateComponent[]): Promise<WAMessageResponse>
 * - sendMediaMessage(to: string, type: 'image'|'video'|'document'|'audio', mediaUrl: string, caption?: string): Promise<WAMessageResponse>
 * - sendInteractiveMessage(to: string, interactive: WAInteractive): Promise<WAMessageResponse>
 *   → Supports buttons, lists, and flows (for in-chat forms in Phase 4)
 * - sendLocationMessage(to: string, lat: number, lng: number, name?: string, address?: string): Promise<WAMessageResponse>
 * - markAsRead(messageId: string): Promise<void>
 * - getMediaUrl(mediaId: string): Promise<string>
 *   → Download media sent by prospects
 */

interface WAMessageResponse {
  messaging_product: 'whatsapp';
  contacts: { input: string; wa_id: string }[];
  messages: { id: string }[];
}
```

**`whatsapp-template-service.ts`** — Rewrite to manage Meta-approved templates:
```typescript
/**
 * Sync templates between Meta and local DB.
 * Meta API: GET /v21.0/{business_account_id}/message_templates
 *
 * Methods:
 * - syncTemplatesFromMeta(institution_id): Promise<void>
 *   → Fetches all templates from Meta, upserts into admission_communication_templates
 * - getTemplateStatus(template_name): Promise<'APPROVED'|'PENDING'|'REJECTED'>
 * - submitTemplate(name, category, language, components): Promise<void>
 *   → POST to Meta API for new template approval
 * - getTemplateQualityRating(template_name): Promise<'HIGH'|'MEDIUM'|'LOW'|'UNKNOWN'>
 *   → Gap #15: Meta Template Quality Monitoring
 */
```

### New Service: `lib/services/whatsapp/whatsapp-chat-service.ts`

This is the core of the "Echo" equivalent — managing two-way conversations.

```typescript
/**
 * WhatsApp Chat Service — Two-way conversation management.
 * Meritto Echo equivalent.
 *
 * Concepts:
 * - Conversation: A chat thread between JKKN and a prospect (identified by phone number)
 * - Messages: Individual messages within a conversation (inbound + outbound)
 * - Assignment: Each conversation is assigned to a counselor
 * - Status: open | waiting | resolved | expired
 *
 * Pattern: Static-method class, multi-tenant with institution_id.
 */

interface Conversation {
  id: string;
  institution_id: string;
  lead_id: string | null;        // Linked to admission_leads if identified
  contact_phone: string;          // E.164 format
  contact_name: string | null;    // WhatsApp push name
  assigned_to: string | null;     // User ID of assigned counselor
  status: 'open' | 'waiting' | 'resolved' | 'expired';
  last_message_at: string;
  last_message_preview: string;
  unread_count: number;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  wa_message_id: string;          // Meta's message ID
  direction: 'inbound' | 'outbound';
  sender_type: 'prospect' | 'counselor' | 'system' | 'bot';
  sender_id: string | null;       // User ID if counselor, null if prospect

  message_type: 'text' | 'image' | 'video' | 'document' | 'audio' | 'location' | 'contacts' | 'interactive' | 'template' | 'reaction';
  content: {
    text?: string;
    media_url?: string;
    media_mime_type?: string;
    filename?: string;
    caption?: string;
    latitude?: number;
    longitude?: number;
    template_name?: string;
    interactive_type?: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };

  status: 'sent' | 'delivered' | 'read' | 'failed';
  error_message: string | null;

  created_at: string;
}

// Static methods:
// - getConversations(institution_id, filters): Promise<PaginatedResult<Conversation>>
//   → Filters: status, assigned_to, search (phone/name), tags, date range
//   → Sort: last_message_at DESC (most recent first)
//
// - getConversation(conversation_id): Promise<Conversation>
//
// - getMessages(conversation_id, cursor?, limit?): Promise<PaginatedResult<ChatMessage>>
//   → Cursor-based pagination (infinite scroll)
//   → Returns messages in chronological order
//
// - sendMessage(conversation_id, sender_id, content): Promise<ChatMessage>
//   → Sends via WhatsApp Cloud API
//   → Creates ChatMessage record
//   → Updates conversation.last_message_at and last_message_preview
//
// - sendTemplateMessage(conversation_id, sender_id, template_id, variables): Promise<ChatMessage>
//   → For sending pre-approved templates
//
// - handleInboundMessage(webhookPayload): Promise<void>
//   → Called by webhook handler
//   → Find or create conversation by phone number
//   → Auto-link to lead if phone matches admission_leads
//   → Create ChatMessage record
//   → Update conversation unread_count
//   → Trigger real-time notification to assigned counselor (via Supabase Realtime)
//   → If no counselor assigned, use assignment rules
//
// - assignConversation(conversation_id, counselor_id): Promise<void>
// - resolveConversation(conversation_id): Promise<void>
// - reopenConversation(conversation_id): Promise<void>
//
// - getConversationStats(institution_id): Promise<ChatStats>
//   → Total open, avg response time, conversations per counselor, resolution rate
//
// - searchMessages(institution_id, query): Promise<ChatMessage[]>
//   → Full-text search across all messages
```

### New Database Tables

**Migration:** `20260222000002_create_whatsapp_chat_tables.sql`

```sql
-- Conversations table
CREATE TABLE IF NOT EXISTS public.wa_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.admission_leads(id) ON DELETE SET NULL,

  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  contact_wa_id TEXT,                -- WhatsApp ID (may differ from phone)
  contact_profile_pic_url TEXT,

  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  -- status: open | waiting | resolved | expired

  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_preview TEXT,
  last_inbound_at TIMESTAMPTZ,       -- For 24hr window tracking
  unread_count INT NOT NULL DEFAULT 0,

  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_wa_conv_institution_phone UNIQUE(institution_id, contact_phone)
);

-- Messages table
CREATE TABLE IF NOT EXISTS public.wa_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  wa_message_id TEXT,                 -- Meta's message ID

  direction TEXT NOT NULL,            -- inbound | outbound
  sender_type TEXT NOT NULL,          -- prospect | counselor | system | bot
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  message_type TEXT NOT NULL DEFAULT 'text',
  -- text | image | video | document | audio | location | contacts | interactive | template | reaction

  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Flexible JSON: { text?, media_url?, caption?, template_name?, button_reply?, etc. }

  status TEXT NOT NULL DEFAULT 'sent',
  -- sent | delivered | read | failed
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quick reply templates for counselors (canned responses)
CREATE TABLE IF NOT EXISTS public.wa_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  shortcut TEXT,                      -- e.g., "/fee" expands to fee structure message
  category TEXT,                      -- greeting | fee | program | general
  usage_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_quick_replies ENABLE ROW LEVEL SECURITY;

-- Policies (institution-scoped access)
DROP POLICY IF EXISTS "wa_conversations_access" ON public.wa_conversations;
CREATE POLICY "wa_conversations_access" ON public.wa_conversations
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "wa_messages_access" ON public.wa_messages;
CREATE POLICY "wa_messages_access" ON public.wa_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM public.wa_conversations WHERE institution_id IN (
        SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "wa_quick_replies_access" ON public.wa_quick_replies;
CREATE POLICY "wa_quick_replies_access" ON public.wa_quick_replies
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wa_conv_institution ON public.wa_conversations(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_status ON public.wa_conversations(status);
CREATE INDEX IF NOT EXISTS idx_wa_conv_assigned ON public.wa_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_wa_conv_last_msg ON public.wa_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_phone ON public.wa_conversations(contact_phone);
CREATE INDEX IF NOT EXISTS idx_wa_conv_lead ON public.wa_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_conversation ON public.wa_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_created ON public.wa_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msg_wa_id ON public.wa_messages(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_direction ON public.wa_messages(direction);
```

### Refactor Webhook: `app/api/webhooks/whatsapp/route.ts`

The existing webhook handles delivery status only. Extend it to handle **inbound messages** from Meta's Cloud API:

```typescript
/**
 * Meta sends webhooks for:
 * 1. messages — Inbound messages from prospects
 * 2. statuses — Delivery status updates (sent/delivered/read/failed)
 *
 * Webhook verification: GET with hub.mode, hub.verify_token, hub.challenge
 * (already exists in current code)
 *
 * New: Handle entry[].changes[].value.messages[] for inbound
 * → Extract: from, timestamp, type, text/image/document/etc.
 * → Call WhatsAppChatService.handleInboundMessage()
 * → Trigger Supabase Realtime broadcast for live chat UI update
 */
```

### New UI Pages

**`app/(routes)/admission/chat/page.tsx`** — WhatsApp Chat Inbox (main page)

Layout: Three-panel design (like WhatsApp Web)
```
┌─────────────┬──────────────────────┬───────────────┐
│ Conversation│                      │ Lead Profile   │
│ List        │   Chat Thread        │ (right panel)  │
│             │                      │                │
│ [Search]    │  [Messages...]       │ Name, Phone    │
│ [Filters]   │                      │ Stage, Score   │
│             │                      │ Timeline       │
│ Conv 1  ●2  │  Typing...           │ Quick Actions  │
│ Conv 2      │                      │                │
│ Conv 3  ●1  │  ┌────────────────┐  │ [Send Email]   │
│ Conv 4      │  │ Type message...│  │ [Call]         │
│             │  │ [📎] [📷] [⚡]│  │ [Change Stage] │
│             │  └────────────────┘  │                │
└─────────────┴──────────────────────┴───────────────┘
```

Components:
- **Conversation list** — Filterable by: status (open/waiting/resolved), assigned counselor, tags, search. Shows unread badge, last message preview, time. Sorted by last_message_at DESC.
- **Chat thread** — Infinite scroll messages. Supports text, images, documents, audio, location. Shows delivery status (sent/delivered/read). Typing indicator via Supabase Realtime.
- **Message input** — Text with emoji. Attach files (images, documents, video). Quick reply shortcuts (`/fee`, `/program`, etc.). Template send button for sending pre-approved templates.
- **Lead profile sidebar** — If conversation is linked to a lead, show lead details. Quick actions: change stage, assign counselor, add note, send email. Full lead timeline.

**Real-time updates:** Subscribe to Supabase Realtime channel `wa_messages:conversation_id=eq.{id}` for new messages. Subscribe to `wa_conversations:institution_id=eq.{id}` for conversation list updates.

**`app/(routes)/admission/chat/settings/page.tsx`** — Chat Settings
- Quick reply management (CRUD)
- Auto-assignment rules (round-robin, by program, by source)
- Business hours configuration
- Away message template
- Auto-resolve after X hours of inactivity

### New API Routes

```
GET  /api/admission/chat/conversations
     Query: { institution_id, status?, assigned_to?, search?, page?, limit? }

GET  /api/admission/chat/conversations/[id]
     → Single conversation with lead details

GET  /api/admission/chat/conversations/[id]/messages
     Query: { cursor?, limit? }

POST /api/admission/chat/conversations/[id]/messages
     Body: { message_type, content, template_id? }
     → Send message via WhatsApp Cloud API

POST /api/admission/chat/conversations/[id]/assign
     Body: { counselor_id }

POST /api/admission/chat/conversations/[id]/resolve

POST /api/admission/chat/conversations/[id]/reopen

GET  /api/admission/chat/stats
     Query: { institution_id, from?, to? }
     → Open conversations, avg response time, resolution rate

CRUD /api/admission/chat/quick-replies
     → Quick reply template management
```

### New Hooks

```
hooks/admission/use-conversations.ts       — List with filters, pagination
hooks/admission/use-conversation.ts        — Single conversation + messages
hooks/admission/use-chat-mutations.ts      — Send message, assign, resolve
hooks/admission/use-chat-realtime.ts       — Supabase Realtime subscriptions
hooks/admission/use-chat-stats.ts          — Chat performance metrics
hooks/admission/use-quick-replies.ts       — Quick reply CRUD
```

---

# PHASE 2: Connect the Phone (Weeks 5-7)

## 2.1 Telephony Integration (Click-to-Call)

**Priority:** P1
**Effort:** 2-3 weeks
**Gap #3 from FST analysis**

### Provider: Exotel

Exotel is India's leading cloud telephony platform. Used by 7000+ businesses in India. Better for JKKN than Twilio for voice because:
- Indian phone numbers (local caller ID)
- TRAI compliance built-in
- Competitive pricing for India
- Simple REST API

### Environment Variables

```env
EXOTEL_API_KEY=xxxxxxxxxxxxx
EXOTEL_API_TOKEN=xxxxxxxxxxxxx
EXOTEL_ACCOUNT_SID=xxxxxxxxxxxxx
EXOTEL_SUBDOMAIN=api.exotel.com
EXOTEL_CALLER_ID=0422XXXXXXX        # JKKN's Exotel virtual number
EXOTEL_RECORDING_ENABLED=true
```

### New Service: `lib/services/telephony/telephony-service.ts`

```typescript
/**
 * Telephony service for click-to-call, call logging, and call recording.
 * Uses Exotel REST API (https://developer.exotel.com/api/).
 *
 * Call flow:
 * 1. Counselor clicks "Call" on lead profile
 * 2. API creates call via Exotel (connects counselor's phone → prospect's phone)
 * 3. Exotel calls the counselor first, then bridges to the prospect
 * 4. Call recording + duration captured via callback
 * 5. Call logged to admission_call_logs with recording URL
 *
 * Alternative: If Exotel is not available, support Knowlarity as fallback provider.
 */

interface InitiateCallParams {
  institution_id: string;
  counselor_id: string;
  counselor_phone: string;    // Counselor's phone to ring first
  prospect_phone: string;
  lead_id?: string;
  caller_id?: string;         // Override EXOTEL_CALLER_ID
}

interface CallResult {
  success: boolean;
  call_sid?: string;          // Exotel's call identifier
  error?: string;
}

interface CallLog {
  id: string;
  institution_id: string;
  lead_id: string | null;
  counselor_id: string;

  call_sid: string;
  direction: 'outbound' | 'inbound';
  from_number: string;
  to_number: string;

  status: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'no-answer' | 'failed' | 'cancelled';
  duration_seconds: number | null;
  recording_url: string | null;

  // Counselor can add notes after call
  call_notes: string | null;
  call_disposition: string | null;  // interested | not_interested | callback | wrong_number | not_reachable
  follow_up_date: string | null;

  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

// Static methods:
// - initiateCall(params: InitiateCallParams): Promise<CallResult>
//   → POST to Exotel API: /v1/Accounts/{sid}/Calls/connect
//   → Body: From (counselor), To (prospect), CallerId (JKKN number)
//   → Creates call log entry with status 'initiated'
//
// - handleCallStatusCallback(payload): Promise<void>
//   → Called by webhook
//   → Updates call log: status, duration, recording URL
//   → If status='completed', trigger notification to counselor to add notes
//
// - getCallLogs(institution_id, filters): Promise<PaginatedResult<CallLog>>
//   → Filters: counselor_id, lead_id, status, date range
//
// - updateCallNotes(call_id, notes, disposition, follow_up_date): Promise<void>
//   → Counselor adds post-call notes
//
// - getCallRecording(call_sid): Promise<string>
//   → Returns signed recording URL from Exotel
//
// - getCallStats(institution_id, date_range): Promise<CallStats>
//   → Total calls, avg duration, calls per counselor, disposition breakdown
```

### New Database Table: `admission_call_logs`

**Migration:** `20260222000003_create_call_logs.sql`

```sql
CREATE TABLE IF NOT EXISTS public.admission_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.admission_leads(id) ON DELETE SET NULL,
  counselor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  call_sid TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound',  -- outbound | inbound
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'initiated',
  -- initiated | ringing | in-progress | completed | busy | no-answer | failed | cancelled

  duration_seconds INT,
  recording_url TEXT,
  recording_duration_seconds INT,

  -- Post-call data (counselor fills in)
  call_notes TEXT,
  call_disposition TEXT,
  -- interested | not_interested | callback | wrong_number | not_reachable | switched_off | busy | other
  follow_up_date DATE,

  cost_amount DECIMAL(10,2),
  cost_currency TEXT DEFAULT 'INR',

  started_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admission_call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "call_logs_institution_access" ON public.admission_call_logs;
CREATE POLICY "call_logs_institution_access" ON public.admission_call_logs
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_call_logs_institution ON public.admission_call_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON public.admission_call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_counselor ON public.admission_call_logs(counselor_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_status ON public.admission_call_logs(status);
CREATE INDEX IF NOT EXISTS idx_call_logs_created ON public.admission_call_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_call_sid ON public.admission_call_logs(call_sid);
```

### New Webhook: `app/api/webhooks/telephony/route.ts`

Exotel sends status callbacks to a configured URL. Handle:
- Call status updates (ringing, in-progress, completed, etc.)
- Recording availability notification
- Verify via `EXOTEL_API_TOKEN` comparison

### UI Changes

**Lead Profile Page** (`app/(routes)/admission/leads/[id]/page.tsx`):
Add click-to-call button. When clicked:
1. Modal asks which phone to call from (counselor's registered phone numbers)
2. Initiates call via API
3. Shows call status in real-time (ringing → in-progress → completed)
4. After call ends, opens "Call Notes" drawer with:
   - Disposition dropdown (interested, callback, not interested, etc.)
   - Free-text notes
   - Follow-up date picker
   - Save → updates call log, optionally updates lead stage

**New page: `app/(routes)/admission/calls/page.tsx`** — Call Log Dashboard
- All calls with filters (counselor, date, disposition, duration)
- Call duration analytics
- Counselor call volume chart
- Play recordings inline
- Missing notes alert (calls without disposition)

### New API Routes

```
POST /api/admission/calls/initiate
     Body: { lead_id, counselor_phone, institution_id }
     → Initiates Exotel call

POST /api/webhooks/telephony
     → Exotel status callback

GET  /api/admission/calls
     Query: { institution_id, counselor_id?, lead_id?, status?, from?, to? }

PUT  /api/admission/calls/[id]/notes
     Body: { call_notes, call_disposition, follow_up_date }

GET  /api/admission/calls/stats
     Query: { institution_id, from?, to? }
```

### Wire Into Existing Systems

**Workflow engine:** Add new action type `make_call` — auto-initiates a call when a lead reaches a certain stage (e.g., "qualified" triggers a call to the assigned counselor).

**Lead timeline:** Call logs appear in the lead's activity timeline alongside emails, WhatsApp messages, stage changes, and notes.

---

# PHASE 3: AI Faces Outward (Weeks 8-12)

## 3.1 Prospect-Facing AI Chatbot

**Priority:** P1
**Effort:** 4-6 weeks
**Gap #4 from FST analysis**

### Architecture

Reuse MyJKKN's existing AI infrastructure (`@anthropic-ai/sdk`, `CLAUDE_API_KEY`, Claude Haiku) but make it prospect-facing. Two channels:

1. **Website widget** — Embeddable JS widget on JKKN websites (jkkn.ac.in, individual college sites)
2. **WhatsApp bot** — Auto-responds to WhatsApp messages when no counselor is assigned or during off-hours

### New Service: `lib/services/ai/chatbot-service.ts`

```typescript
/**
 * Prospect-facing AI Chatbot Service.
 * Meritto Niaa / Mio AI Guide equivalent.
 *
 * Knowledge base:
 * - Institution data from DB (programs, fees, eligibility, deadlines)
 * - Custom training documents (uploaded by admin — brochures, FAQs)
 * - Lead context (if identified — stage, interactions, preferences)
 *
 * Behavior:
 * - Answers admission inquiries 24/7
 * - Qualifies leads (asks key questions, scores intent)
 * - Collects contact details if not already known
 * - Routes to human counselor when needed
 * - Multilingual: English, Tamil, Hindi
 * - Brand-aligned: Uses JKKN terminology (Learner, not Student)
 *
 * Model: claude-3-5-haiku-20241022 (matching existing pattern)
 * Temperature: 0.3 (low — we want consistent, factual responses)
 */

interface ChatbotConfig {
  id: string;
  institution_id: string;
  name: string;                       // e.g., "JKKN Admissions Assistant"
  welcome_message: string;
  system_prompt: string;              // Custom behavior instructions
  knowledge_base_ids: string[];       // References to uploaded training docs
  enabled_channels: ('website' | 'whatsapp')[];
  languages: string[];                // ['en', 'ta', 'hi']
  business_hours: { start: string; end: string; timezone: string };
  handoff_triggers: string[];         // Keywords/intents that trigger human handoff
  max_turns_before_handoff: number;   // Default 10
  collect_contact_info: boolean;      // Ask for name/email/phone if unknown
  is_active: boolean;
}

interface ChatbotSession {
  id: string;
  chatbot_id: string;
  institution_id: string;
  channel: 'website' | 'whatsapp';
  visitor_id: string;                 // Anonymous until identified
  lead_id: string | null;            // Linked when identified

  messages: ChatbotMessage[];
  context: {
    interested_program: string | null;
    collected_name: string | null;
    collected_email: string | null;
    collected_phone: string | null;
    intent_score: number;             // 0-100, AI-assessed enrollment intent
    language: string;
  };

  status: 'active' | 'handed_off' | 'ended';
  handed_off_to: string | null;      // Counselor user ID

  started_at: string;
  last_activity_at: string;
}

interface ChatbotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    intent_detected?: string;
    confidence?: number;
    suggested_action?: string;
  };
}

// Static methods:
// - chat(session_id, user_message): Promise<{ response: string; action?: ChatbotAction }>
//   → Builds context from: session history + knowledge base + lead data (if linked)
//   → Sends to Claude with system prompt
//   → Parses response for structured actions (handoff, collect info, etc.)
//   → Returns AI response text + optional action
//
// - createSession(chatbot_id, channel, visitor_id?): Promise<ChatbotSession>
//
// - handoffToHuman(session_id, reason): Promise<void>
//   → Creates/links wa_conversation if WhatsApp channel
//   → Notifies available counselor
//   → Transfers chat history to counselor view
//
// - getSessionHistory(session_id): Promise<ChatbotMessage[]>
//
// - updateKnowledgeBase(chatbot_id, documents): Promise<void>
//   → Processes uploaded documents (PDFs, text) into structured knowledge
//   → Stores in chatbot_knowledge_base table
//
// - getAnalytics(chatbot_id, date_range): Promise<ChatbotAnalytics>
//   → Sessions, avg turns, handoff rate, top questions, lead conversion rate
```

### Database Tables

**Migration:** `20260222000004_create_chatbot_tables.sql`

```sql
-- Chatbot configuration per institution
CREATE TABLE IF NOT EXISTS public.chatbot_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  welcome_message TEXT NOT NULL DEFAULT 'Hello! I''m the JKKN Admissions Assistant. How can I help you today?',
  system_prompt TEXT,
  enabled_channels TEXT[] DEFAULT '{website,whatsapp}',
  languages TEXT[] DEFAULT '{en}',
  business_hours JSONB DEFAULT '{"start":"09:00","end":"18:00","timezone":"Asia/Kolkata"}'::jsonb,
  handoff_triggers TEXT[] DEFAULT '{speak to human,talk to counselor,call me}',
  max_turns_before_handoff INT NOT NULL DEFAULT 10,
  collect_contact_info BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Knowledge base documents
CREATE TABLE IF NOT EXISTS public.chatbot_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES public.chatbot_configs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,        -- url | document | manual
  source_url TEXT,
  content TEXT NOT NULL,            -- Extracted/processed text content
  content_embedding VECTOR(1536),   -- For semantic search (if pgvector available)
  status TEXT NOT NULL DEFAULT 'active',  -- active | processing | failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chat sessions
CREATE TABLE IF NOT EXISTS public.chatbot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES public.chatbot_configs(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,             -- website | whatsapp
  visitor_id TEXT,
  lead_id UUID REFERENCES public.admission_leads(id) ON DELETE SET NULL,
  wa_conversation_id UUID REFERENCES public.wa_conversations(id) ON DELETE SET NULL,

  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { interested_program, collected_name, collected_email, collected_phone, intent_score, language }

  status TEXT NOT NULL DEFAULT 'active',   -- active | handed_off | ended
  handed_off_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  handoff_reason TEXT,

  message_count INT NOT NULL DEFAULT 0,

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- Chat messages within sessions
CREATE TABLE IF NOT EXISTS public.chatbot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.chatbot_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                -- user | assistant | system
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  -- { intent_detected, confidence, suggested_action, tokens_used }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.chatbot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_messages ENABLE ROW LEVEL SECURITY;

-- Policies (standard institution-scoped)
DROP POLICY IF EXISTS "chatbot_configs_access" ON public.chatbot_configs;
CREATE POLICY "chatbot_configs_access" ON public.chatbot_configs
  FOR ALL USING (institution_id IN (
    SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "chatbot_kb_access" ON public.chatbot_knowledge_base;
CREATE POLICY "chatbot_kb_access" ON public.chatbot_knowledge_base
  FOR ALL USING (chatbot_id IN (
    SELECT id FROM public.chatbot_configs WHERE institution_id IN (
      SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    )
  ));

DROP POLICY IF EXISTS "chatbot_sessions_access" ON public.chatbot_sessions;
CREATE POLICY "chatbot_sessions_access" ON public.chatbot_sessions
  FOR ALL USING (institution_id IN (
    SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
  ));

-- Public access policy for chatbot_sessions (prospects create sessions without auth)
DROP POLICY IF EXISTS "chatbot_sessions_public_create" ON public.chatbot_sessions;
CREATE POLICY "chatbot_sessions_public_create" ON public.chatbot_sessions
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "chatbot_messages_access" ON public.chatbot_messages;
CREATE POLICY "chatbot_messages_access" ON public.chatbot_messages
  FOR ALL USING (session_id IN (
    SELECT id FROM public.chatbot_sessions WHERE institution_id IN (
      SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    )
  ));

-- Public access for chatbot messages (prospects can read/write their session)
DROP POLICY IF EXISTS "chatbot_messages_public" ON public.chatbot_messages;
CREATE POLICY "chatbot_messages_public" ON public.chatbot_messages
  FOR ALL USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chatbot_configs_institution ON public.chatbot_configs(institution_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_kb_chatbot ON public.chatbot_knowledge_base(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_chatbot ON public.chatbot_sessions(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_institution ON public.chatbot_sessions(institution_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_lead ON public.chatbot_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_status ON public.chatbot_sessions(status);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_session ON public.chatbot_messages(session_id);
```

### Website Widget

**`public/chatbot-widget.js`** — Embeddable script for JKKN websites.

```html
<!-- Add to any JKKN website -->
<script src="https://myjkkn.vercel.app/chatbot-widget.js"
        data-chatbot-id="uuid"
        data-institution="JKKN"></script>
```

The widget:
- Renders a floating chat bubble (bottom-right corner)
- Opens a chat panel on click
- Communicates with MyJKKN's chatbot API via POST requests
- Stores session_id in localStorage for returning visitors
- Responsive: works on mobile
- Themed with JKKN brand colors (#0b6d41 green, #fbfbee cream, #ffde59 yellow)

### WhatsApp Bot Integration

When a WhatsApp message arrives and:
- No counselor is assigned to the conversation, OR
- It's outside business hours, OR
- The chatbot is explicitly enabled for the institution

→ Route the message to `ChatbotService.chat()` instead of waiting for a human response.

When the AI determines a handoff is needed:
→ `ChatbotService.handoffToHuman()` assigns a counselor and sends the full chat context.

### Admin Pages

**`app/(routes)/admission/chatbot/page.tsx`** — Already exists (stub). Replace with:
- Chatbot on/off toggle
- Welcome message editor
- Knowledge base management (add URLs, upload docs)
- Test chat interface (preview bot responses)
- Analytics dashboard (sessions, handoff rate, top questions, conversion)

**`app/(routes)/admission/chatbot/knowledge/page.tsx`** — Knowledge Base Manager
- Add URLs for bot to learn from (crawls and extracts)
- Upload PDFs (program brochures, fee structures)
- Manual Q&A pairs
- Status tracking (processing, active, failed)

**`app/(routes)/admission/chatbot/analytics/page.tsx`** — Chatbot Analytics
- Session volume over time
- Top asked questions
- Intent distribution
- Handoff rate and reasons
- Lead conversion rate (sessions that became leads)

### API Routes

```
POST /api/chatbot/chat
     Body: { session_id?, chatbot_id, message, visitor_id? }
     → Public endpoint (no auth required for prospects)
     → Returns { response, session_id, action? }

POST /api/chatbot/sessions
     Body: { chatbot_id, channel, visitor_id? }
     → Create new session

GET  /api/admission/chatbot/sessions
     Query: { institution_id, status?, from?, to? }
     → Admin view of all sessions

GET  /api/admission/chatbot/sessions/[id]
     → Session detail with full message history

POST /api/admission/chatbot/sessions/[id]/handoff
     Body: { counselor_id, reason }
     → Manual handoff

CRUD /api/admission/chatbot/config
     → Chatbot configuration

CRUD /api/admission/chatbot/knowledge
     → Knowledge base document management

GET  /api/admission/chatbot/analytics
     Query: { institution_id, from?, to? }
```

---

# PHASE 4: Intelligence Layer (Weeks 13-16)

## 4.1 Real-time Sales Alerts (Zing Equivalent)

**Priority:** P2
**Effort:** 1-2 weeks
**Gap #5 from FST analysis**

### Concept

Wire lead activity events to instant push notifications for the assigned counselor. When a prospect does something meaningful, the counselor knows immediately.

### Trigger Events

| Event | Source | Notification |
|-------|--------|-------------|
| WhatsApp reply received | `wa_messages` INSERT where direction='inbound' | "New WhatsApp from Rahul: 'I want to know about MBA fees'" |
| Payment initiated | `payment_gateway_transactions` INSERT | "Riya just initiated ₹25,000 fee payment for B.Tech CSE" |
| Application submitted | `admission_applications` INSERT | "New application from Priya for M.Pharm" |
| Lead re-engaged | `admission_leads` UPDATE where previously cold | "Arun (marked cold 2 weeks ago) just visited the website" |
| Document uploaded | `admission_documents` INSERT | "Kartik uploaded 12th marksheet" |
| Chatbot handoff | `chatbot_sessions` UPDATE where status='handed_off' | "AI chatbot requesting handoff — prospect asking about hostel" |
| Lead score changed | `admission_lead_scores` UPDATE | "Deepa's score jumped from 35 to 78 — high intent!" |

### Implementation

Use **Supabase Database Webhooks** (pg_net) or **Supabase Realtime** to detect these events, then call the existing `NotificationService.sendNotification()` with `channels: ['PUSH', 'IN_APP']`.

**Migration:** `20260222000005_create_activity_alert_config.sql`

```sql
CREATE TABLE IF NOT EXISTS public.activity_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  -- wa_reply | payment_initiated | application_submitted | lead_reengaged |
  -- document_uploaded | chatbot_handoff | score_changed
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  notify_assigned_counselor BOOLEAN NOT NULL DEFAULT true,
  notify_additional_users UUID[] DEFAULT '{}',
  notification_channels TEXT[] DEFAULT '{PUSH,IN_APP}',
  -- Conditions (optional)
  conditions JSONB DEFAULT '{}'::jsonb,
  -- e.g., { "min_score_change": 20 } for score_changed events
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.activity_alert_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alert_rules_access" ON public.activity_alert_rules;
CREATE POLICY "alert_rules_access" ON public.activity_alert_rules
  FOR ALL USING (institution_id IN (
    SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
  ));
```

**New service:** `lib/services/admission/activity-alert-service.ts`
- Listens for DB events (via Supabase Realtime subscriptions on the server)
- Matches events against `activity_alert_rules`
- Sends notifications via `NotificationService`

**Admin page:** `app/(routes)/admission/alerts/page.tsx`
- Toggle each alert type on/off
- Configure who gets notified (assigned counselor, team lead, custom)
- Alert history log

---

## 4.2 Campaign ROI Attribution

**Priority:** P2
**Effort:** 2-3 weeks
**Gap #6 from FST analysis**

### Concept

Track every communication campaign from send → open → application → enrollment with cost metrics.

### Schema Enhancement

**Migration:** `20260222000006_add_campaign_roi_tracking.sql`

```sql
-- Add attribution fields to admission_applications
ALTER TABLE public.admission_applications
  ADD COLUMN IF NOT EXISTS attributed_campaign_id UUID,
  ADD COLUMN IF NOT EXISTS attribution_channel TEXT,  -- email | sms | whatsapp | call
  ADD COLUMN IF NOT EXISTS attribution_timestamp TIMESTAMPTZ;

-- Campaign summary materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_campaign_roi AS
SELECT
  cq.id AS campaign_id,
  cq.institution_id,
  cq.step_type AS channel,
  COUNT(DISTINCT el.id) FILTER (WHERE el.status = 'sent') AS emails_sent,
  COUNT(DISTINCT el.id) FILTER (WHERE el.status = 'opened') AS emails_opened,
  COUNT(DISTINCT el.id) FILTER (WHERE el.status = 'clicked') AS emails_clicked,
  COUNT(DISTINCT wl.id) FILTER (WHERE wl.status = 'delivered') AS wa_delivered,
  COUNT(DISTINCT wl.id) FILTER (WHERE wl.status = 'read') AS wa_read,
  COUNT(DISTINCT sl.id) FILTER (WHERE sl.status = 'delivered') AS sms_delivered,
  COUNT(DISTINCT aa.id) AS applications,
  COUNT(DISTINCT al.id) FILTER (WHERE al.stage = 'enrolled') AS enrollments,
  -- Cost per lead = total cost / leads generated
  -- Conversion rate = enrollments / sends
  cq.created_at AS campaign_date
FROM public.admission_campaign_queue cq
LEFT JOIN public.admission_email_logs el ON el.campaign_id = cq.id
LEFT JOIN public.admission_whatsapp_campaign_logs wl ON wl.campaign_id::uuid = cq.id
LEFT JOIN public.admission_sms_logs sl ON sl.campaign_id::uuid = cq.id
LEFT JOIN public.admission_applications aa ON aa.attributed_campaign_id = cq.id
LEFT JOIN public.admission_leads al ON al.id = aa.lead_id
GROUP BY cq.id, cq.institution_id, cq.step_type, cq.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_campaign_roi_id ON public.mv_campaign_roi(campaign_id);
```

**Attribution logic:** When a lead takes action (applies, pays) within 7 days of receiving a campaign message, attribute that action to the campaign. First-touch attribution for simplicity.

**New page:** `app/(routes)/admission/campaigns/roi/page.tsx`
- Campaign list with sends, opens, clicks, applications, enrollments
- Cost per lead, cost per enrollment
- Channel comparison (email vs WhatsApp vs SMS effectiveness)
- Time-series conversion funnel

---

## 4.3 WhatsApp In-Chat Forms

**Priority:** P2
**Effort:** 2 weeks
**Gap #7 from FST analysis**

### Concept

Use WhatsApp's Interactive Messages API to send structured forms inside chat:
- **List messages** — Multi-option selection (program preference, campus choice)
- **Reply buttons** — Quick 1-3 option responses
- **Flows** — Multi-step forms (Meta's WhatsApp Flows feature)

### Implementation

Extend `whatsapp-api-client.ts` with:

```typescript
// Interactive message types:

// 1. Button reply (up to 3 buttons)
sendButtonMessage(to, body, buttons: { id: string; title: string }[])

// 2. List message (up to 10 options in sections)
sendListMessage(to, body, buttonText, sections: { title: string; rows: { id: string; title: string; description?: string }[] }[])

// 3. WhatsApp Flow (multi-step form)
sendFlowMessage(to, body, flowId, flowAction, flowParams)
```

### Predefined Forms

| Form | Type | Use Case |
|------|------|----------|
| Program Interest | List | "Which program are you interested in?" → Shows all programs |
| Campus Preference | Buttons | "Which campus?" → Komarapalayam / Erode / Namakkal |
| Callback Request | Buttons | "When should we call?" → Morning / Afternoon / Evening |
| Document Collection | Flow | Multi-step: Name → Email → Upload 10th/12th marks → Program → Submit |
| Feedback Survey | Flow | Rate experience 1-5 → Open text feedback → Submit |

**DB table:** `wa_form_templates` — Store form definitions. Responses stored in `wa_form_responses` and auto-synced to lead profile fields.

**Migration:** `20260222000007_create_wa_forms.sql`

---

## 4.4 Multilingual SMS

**Priority:** P3
**Effort:** 1 week
**Gap #8 from FST analysis**

### Implementation

MSG91 already supports Unicode SMS (Tamil, Hindi). Changes needed:

1. Add `language` field to `admission_communication_templates` (default: 'en')
2. Add `preferred_language` field to `admission_leads`
3. Create template variants per language
4. SMS sending logic: pick template matching lead's preferred language, fall back to English

**Migration:** `20260222000008_add_multilingual_support.sql`

```sql
ALTER TABLE public.admission_communication_templates
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
-- Allows multiple templates with same name but different languages

ALTER TABLE public.admission_leads
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en';
-- en | ta | hi
```

**SMS character limits:** Unicode SMS = 70 chars per segment (vs 160 for English). Templates should be reviewed for length.

---

## 4.5 Drag-and-Drop Email Builder

**Priority:** P3
**Effort:** 3-4 weeks
**Gap #9 from FST analysis**

### New Dependencies

```bash
npm install @react-email/components react-email
```

### Implementation

- Visual email builder page at `app/(routes)/admission/templates/email-builder/page.tsx`
- Block-based editor: Header, Text, Image, Button, Columns, Divider, Footer
- Dynamic variable insertion via `{{variable_name}}` tokens
- Preview mode (desktop + mobile)
- Save as template to `admission_communication_templates`
- Pre-built starter templates: Welcome, Application Status, Offer Letter, Fee Reminder, Event Invite

### Template Gallery

**Migration:** `20260222000009_add_email_builder_fields.sql`

```sql
ALTER TABLE public.admission_communication_templates
  ADD COLUMN IF NOT EXISTS html_content TEXT,           -- Rendered HTML
  ADD COLUMN IF NOT EXISTS builder_json JSONB,           -- Builder block structure (for re-editing)
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,            -- Preview thumbnail
  ADD COLUMN IF NOT EXISTS is_starter_template BOOLEAN NOT NULL DEFAULT false;
```

---

## 4.6 AI Voice Agents

**Priority:** P3 (depends on Phase 2 telephony)
**Effort:** 4-6 weeks
**Gap #10 from FST analysis**

### Architecture

Builds on Exotel telephony (Phase 2) + Claude AI (existing):

```
Exotel call → STT (speech-to-text) → Claude AI → TTS (text-to-speech) → Exotel call
```

### Three Agent Types

| Agent | Purpose | Trigger |
|-------|---------|---------|
| **Lead Qualifier** | Calls new leads, asks qualifying questions, scores intent | New lead created with phone number |
| **Lead Reactivator** | Calls cold/dormant leads with contextual re-engagement | Lead inactive for 14+ days |
| **Auto Reminder** | Calls for deadline reminders, document nudges, fee reminders | Scheduled based on deadlines |

### Implementation

**New service:** `lib/services/ai/voice-agent-service.ts`

- Uses Exotel's programmatic voice API for call management
- STT: Exotel's built-in transcription or Deepgram API
- TTS: Exotel's TTS or ElevenLabs for natural voice
- AI brain: Claude Haiku with admission context

**New table:** `ai_voice_agent_calls` — Tracks agent calls, transcripts, outcomes, lead stage updates.

**Migration:** `20260222000010_create_voice_agent_tables.sql`

**Admin page:** `app/(routes)/admission/voice-agents/page.tsx`
- Enable/disable each agent type
- Configure call scripts and qualifying questions
- Set calling hours and retry rules
- View call transcripts and outcomes
- Analytics: calls made, qualification rate, conversions

---

## 4.7 Voice Broadcast (IVR)

**Priority:** P4 (lower priority per FST analysis)
**Effort:** 2-3 weeks
**Gap #11 from FST analysis**

Uses Exotel's voice broadcast API:
- Upload pre-recorded audio messages
- Select audience from lead filters
- Schedule campaigns
- Press-1 to connect to counselor
- Track: answered, listened, pressed-1, connected

**New service:** `lib/services/telephony/voice-broadcast-service.ts`
**New table:** `admission_voice_broadcast_campaigns`, `admission_voice_broadcast_logs`
**Migration:** `20260222000011_create_voice_broadcast_tables.sql`

---

## 4.8 Strategic Remarketing

**Priority:** P4 (per FST analysis — needs ad infra first)
**Effort:** 2-3 weeks
**Gap #12 from FST analysis**

### Concept

Auto-sync lead audiences to Google Ads Customer Match and Facebook Custom Audiences based on pipeline stage.

### Implementation

**New service:** `lib/services/marketing/remarketing-service.ts`

- Google Ads API: Upload customer lists (email + phone) by stage
- Facebook Marketing API: Create/update Custom Audiences by stage
- Cron job: Daily sync of lead lists to ad platforms
- Exclude enrolled leads from campaigns automatically

**Environment vars:**
```env
GOOGLE_ADS_CUSTOMER_ID=xxxxxxxxxxxxx
GOOGLE_ADS_DEVELOPER_TOKEN=xxxxxxxxxxxxx
GOOGLE_ADS_REFRESH_TOKEN=xxxxxxxxxxxxx
FACEBOOK_AD_ACCOUNT_ID=act_xxxxxxxxxxxxx
FACEBOOK_ACCESS_TOKEN=xxxxxxxxxxxxx
```

**Admin page:** `app/(routes)/admission/remarketing/page.tsx`
- Connect Google/Facebook ad accounts
- Define audience rules (stage → audience mapping)
- Sync status and history
- Audience size per stage

---

## 4.9 Communication Cost Tracking

**Priority:** P4 (simplified version of METS — per FST analysis)
**Effort:** 1 week
**Gap #13 from FST analysis (simplified)**

Instead of a full credit system, track actual costs per channel:

**Migration:** `20260222000012_create_communication_costs.sql`

```sql
CREATE TABLE IF NOT EXISTS public.communication_cost_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,          -- email | sms | whatsapp | call | voice_broadcast
  event_type TEXT NOT NULL,       -- send | receive | call_minute | template_message
  unit_cost DECIMAL(10,4) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  total_cost DECIMAL(10,4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  reference_id UUID,              -- Link to specific log (email_log, sms_log, call_log, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Monthly summary view
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_communication_costs_monthly AS
SELECT
  institution_id,
  channel,
  DATE_TRUNC('month', created_at) AS month,
  SUM(total_cost) AS total_cost,
  SUM(quantity) AS total_units
FROM public.communication_cost_log
GROUP BY institution_id, channel, DATE_TRUNC('month', created_at);
```

**Dashboard widget:** Add to admission dashboard — monthly spend per channel, trend over time.

---

# SUMMARY: All Migrations

| Migration File | Tables Created | Phase |
|----------------|---------------|-------|
| `20260222000001_create_email_logs.sql` | `admission_email_logs` | 1.1 |
| `20260222000002_create_whatsapp_chat_tables.sql` | `wa_conversations`, `wa_messages`, `wa_quick_replies` | 1.2 |
| `20260222000003_create_call_logs.sql` | `admission_call_logs` | 2.1 |
| `20260222000004_create_chatbot_tables.sql` | `chatbot_configs`, `chatbot_knowledge_base`, `chatbot_sessions`, `chatbot_messages` | 3.1 |
| `20260222000005_create_activity_alert_config.sql` | `activity_alert_rules` | 4.1 |
| `20260222000006_add_campaign_roi_tracking.sql` | Alter `admission_applications`, MV `mv_campaign_roi` | 4.2 |
| `20260222000007_create_wa_forms.sql` | `wa_form_templates`, `wa_form_responses` | 4.3 |
| `20260222000008_add_multilingual_support.sql` | Alter `admission_communication_templates`, `admission_leads` | 4.4 |
| `20260222000009_add_email_builder_fields.sql` | Alter `admission_communication_templates` | 4.5 |
| `20260222000010_create_voice_agent_tables.sql` | `ai_voice_agent_calls`, `ai_voice_agent_configs` | 4.6 |
| `20260222000011_create_voice_broadcast_tables.sql` | `admission_voice_broadcast_campaigns`, `admission_voice_broadcast_logs` | 4.7 |
| `20260222000012_create_communication_costs.sql` | `communication_cost_log`, MV `mv_communication_costs_monthly` | 4.9 |

---

# SUMMARY: All New Services

| Service File | Purpose | Phase |
|-------------|---------|-------|
| `lib/services/email/email-service.ts` | Resend email sending | 1.1 |
| `lib/services/whatsapp/whatsapp-api-client.ts` | Rewrite → Meta Cloud API | 1.2 |
| `lib/services/whatsapp/whatsapp-chat-service.ts` | Two-way chat management | 1.2 |
| `lib/services/whatsapp/whatsapp-template-service.ts` | Rewrite → Meta template sync | 1.2 |
| `lib/services/telephony/telephony-service.ts` | Exotel click-to-call | 2.1 |
| `lib/services/ai/chatbot-service.ts` | Prospect-facing AI chatbot | 3.1 |
| `lib/services/admission/activity-alert-service.ts` | Real-time sales alerts | 4.1 |
| `lib/services/admission/campaign-roi-service.ts` | Campaign attribution | 4.2 |
| `lib/services/ai/voice-agent-service.ts` | AI voice agents | 4.6 |
| `lib/services/telephony/voice-broadcast-service.ts` | Voice broadcast/IVR | 4.7 |
| `lib/services/marketing/remarketing-service.ts` | Google/Facebook audience sync | 4.8 |

---

# SUMMARY: All New Pages

| Route | Page | Phase |
|-------|------|-------|
| `admission/chat` | WhatsApp Live Chat Inbox | 1.2 |
| `admission/chat/settings` | Chat Settings | 1.2 |
| `admission/calls` | Call Log Dashboard | 2.1 |
| `admission/chatbot` | Chatbot Admin (rewrite existing stub) | 3.1 |
| `admission/chatbot/knowledge` | Knowledge Base Manager | 3.1 |
| `admission/chatbot/analytics` | Chatbot Analytics | 3.1 |
| `admission/alerts` | Activity Alert Configuration | 4.1 |
| `admission/campaigns/roi` | Campaign ROI Dashboard | 4.2 |
| `admission/templates/email-builder` | Visual Email Builder | 4.5 |
| `admission/voice-agents` | AI Voice Agent Admin | 4.6 |
| `admission/remarketing` | Remarketing Audience Sync | 4.8 |

---

# SUMMARY: All New Environment Variables

```env
# Phase 1.1 — Email (Resend)
RESEND_API_KEY=
RESEND_FROM_EMAIL=admissions@jkkn.ac.in
RESEND_FROM_NAME=JKKN Admissions
RESEND_REPLY_TO=admissions@jkkn.ac.in
RESEND_WEBHOOK_SECRET=

# Phase 1.2 — WhatsApp (Meta Cloud API)
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=jkkn-wa-verify-2026
WHATSAPP_WEBHOOK_SECRET=
WHATSAPP_APP_ID=

# Phase 2.1 — Telephony (Exotel)
EXOTEL_API_KEY=
EXOTEL_API_TOKEN=
EXOTEL_ACCOUNT_SID=
EXOTEL_SUBDOMAIN=api.exotel.com
EXOTEL_CALLER_ID=
EXOTEL_RECORDING_ENABLED=true

# Phase 4.6 — Voice AI (optional STT/TTS providers)
DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=

# Phase 4.8 — Remarketing (optional)
GOOGLE_ADS_CUSTOMER_ID=
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_REFRESH_TOKEN=
FACEBOOK_AD_ACCOUNT_ID=
FACEBOOK_ACCESS_TOKEN=
```

---

# SUMMARY: New Dependencies

```bash
# Phase 1.1
npm install resend

# Phase 4.5
npm install @react-email/components react-email
```

All other integrations (Exotel, Meta WhatsApp Cloud API, Google Ads, Facebook Marketing) use REST APIs via the already-installed `axios`.

---

# Pre-requisites (External Setup)

| Item | Owner | Phase | Notes |
|------|-------|-------|-------|
| Resend account + domain verification | DevOps | 1.1 | Add SPF/DKIM/DMARC to jkkn.ac.in DNS |
| Meta Business Verification | Admin | 1.2 | Required for WhatsApp Business API |
| WhatsApp Business Account + Phone Number | Admin | 1.2 | Via Meta Business Suite |
| Exotel Account + Virtual Number | Admin | 2.1 | ₹10K-50K/month depending on volume |
| JKKN website access (for chatbot widget) | Webmaster | 3.1 | Single script tag addition |
| Google Ads API access | Marketing | 4.8 | Developer token + OAuth setup |
| Facebook Marketing API access | Marketing | 4.8 | App review + permissions |
