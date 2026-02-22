# MyJKKN WhatsApp 16-Gap Fill — Engineering Spec

**Created:** 2026-02-22
**Source:** FST Gap Analysis — WhatsApp Handbook 2026 vs MyJKKN (`Claude Setup/Capture/MyJKKN/FST-WhatsApp-Handbook-2026-Gap-Analysis.md`)
**Status:** Draft
**Build Phases:** 3 phases, 15 days total

---

## Overview

MyJKKN's Unified Communication Suite was built on 2026-02-20 (77 files, 65 new). It established the infrastructure: WhatsApp Cloud API client, live chat, templates, forms, campaigns, and drip framework. However, comparing against Meritto's WhatsApp Handbook 2026, 16 gaps remain — the "orchestration layer" that turns infrastructure into an enrollment system.

**What exists today (built 2026-02-20):**
- WhatsApp Cloud API client (Meta v21.0) — `lib/services/whatsapp/whatsapp-api-client.ts`
- WhatsApp Chat Service (conversations, messages, assignment, resolution, quick replies) — `lib/services/whatsapp/whatsapp-chat-service.ts`
- WhatsApp Template Service (Meta sync, quality rating, CRUD) — `lib/services/whatsapp/whatsapp-template-service.ts`
- WhatsApp Forms Service (button, list, flow types, 4 predefined forms) — `lib/services/whatsapp/whatsapp-forms-service.ts`
- WhatsApp Campaign Service (single + bulk send, delivery tracking) — `lib/services/admission/whatsapp-campaign-service.ts`
- Drip Executor Service (scheduling, conditions, steps — send_whatsapp returns "not yet wired") — `lib/services/admission/drip-executor-service.ts`
- Assignment Rules Service (full rule engine with criteria matching) — `lib/services/admission/assignment-rules-service.ts`
- Webhook handler (inbound messages, signature verification) — `app/api/webhooks/whatsapp/route.ts`
- Chat UI (3-panel: conversation list, chat thread, lead sidebar) — `app/(routes)/admission/chat/`
- Communication Templates Service — `lib/services/admission/communication-templates-service.ts`
- Communication Cost tables — migration `20260222000012` (communication_cost_log, mv_communication_costs_monthly)
- Re-engagement page + hook — `app/(routes)/admission/re-engagement/page.tsx`, `hooks/admission/use-re-engagement.ts`

**What this spec adds (16 gaps):**
- Phase 1: Drip wiring + consent tracking + smart routing (critical compliance + automation)
- Phase 2: 24hr window UI + template quality UI + audience segments + template analytics (feature parity)
- Phase 3: Template library + document catalog + counselor dashboard + re-engagement workflows + multi-WABA + echo bubble + funnel view + cost tracking (differentiation)

---

## Database Conventions

Follows existing patterns established in the codebase:

```sql
-- File: supabase/migrations/YYYYMMDDNNNNNN_description.sql
-- UUID PRIMARY KEY DEFAULT gen_random_uuid()
-- TIMESTAMPTZ NOT NULL DEFAULT NOW() for created_at/updated_at
-- References: UUID REFERENCES public.profiles(id) ON DELETE SET NULL
-- Always: ALTER TABLE ... ENABLE ROW LEVEL SECURITY
-- DROP POLICY IF EXISTS before CREATE POLICY (idempotent)
-- CREATE INDEX IF NOT EXISTS idx_tablename_column ON tablename(column)
-- Multi-tenant: institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE
```

**Next migration number:** `20260222100001` (continuing the series from the Communication Suite build).

---

# PHASE 1: P0 Critical Gaps (est. 3 days)

Compliance and revenue-blocking issues. These MUST be filled before any production WhatsApp messaging.

---

## 1.1 Wire WhatsApp into Drip Executor (Gap 1)

**Problem:** Line 783-785 of `lib/services/admission/drip-executor-service.ts` returns `{ success: false, error: 'WhatsApp dispatch not yet wired in drip executor' }`. Every multi-step WhatsApp nurture sequence silently fails. Email drips work; WhatsApp drips don't.

**No migration needed.** All infrastructure exists.

### Service Modification

**File:** `lib/services/admission/drip-executor-service.ts`

**Add imports** at top of file:

```typescript
import {
  sendTextMessage,
  sendTemplateMessage,
  isWhatsAppConfigured,
  type WATemplateComponent,
} from '@/lib/services/whatsapp/whatsapp-api-client';
import { WhatsAppTemplateService } from '@/lib/services/whatsapp/whatsapp-template-service';
import { CommunicationTemplatesService } from './communication-templates-service';
```

**Replace** the `case 'send_whatsapp'` block (lines 783-785) with:

```typescript
case 'send_whatsapp': {
  if (!isWhatsAppConfigured()) {
    return { success: false, error: 'WhatsApp Cloud API not configured (missing WHATSAPP_ACCESS_TOKEN)' };
  }

  const config = step.action_config;
  const templateId = config.template_id as string | undefined;
  const templateName = config.template_name as string | undefined;

  // Get lead phone from context snapshot
  const leadSnapshot = step.context_data?.lead_snapshot as {
    phone?: string;
    full_name?: string;
    email?: string;
    interested_programs?: string[];
  } | undefined;

  const leadPhone = leadSnapshot?.phone;
  if (!leadPhone) {
    return { success: false, error: 'Lead has no phone number' };
  }

  // Format phone for WhatsApp (E.164 for India)
  let cleaned = leadPhone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = '91' + cleaned.substring(1);
  if (cleaned.length === 10) cleaned = '91' + cleaned;

  // Build template variables from lead context
  const variables: Record<string, string> = {
    full_name: leadSnapshot?.full_name || '',
    first_name: (leadSnapshot?.full_name || '').split(' ')[0] || '',
    program: leadSnapshot?.interested_programs?.join(', ') || '',
    ...(config.variables as Record<string, string> || {}),
  };

  if (templateName) {
    // Send via Meta-approved template (works outside 24hr window)
    const languageCode = (config.language_code as string) || 'en';
    const components = config.components as WATemplateComponent[] | undefined;
    const waResult = await sendTemplateMessage(cleaned, templateName, languageCode, components);
    return {
      success: true,
      data: { wa_message_id: waResult.messages?.[0]?.id },
    };
  } else if (templateId) {
    // Fetch local template, render variables, send as text (within 24hr window only)
    const template = await CommunicationTemplatesService.getTemplate(templateId);
    if (!template) return { success: false, error: 'Template not found' };
    const rendered = WhatsAppTemplateService.renderTemplate(template.content, variables);
    const waResult = await sendTextMessage(cleaned, rendered);
    return {
      success: true,
      data: { wa_message_id: waResult.messages?.[0]?.id },
    };
  } else if (config.message_text) {
    // Direct text message (within 24hr window only)
    let text = config.message_text as string;
    for (const [key, val] of Object.entries(variables)) {
      text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
    }
    const waResult = await sendTextMessage(cleaned, text);
    return {
      success: true,
      data: { wa_message_id: waResult.messages?.[0]?.id },
    };
  } else {
    return { success: false, error: 'No template_id, template_name, or message_text in action config' };
  }
}
```

### No new API routes, UI, or hooks needed.

---

## 1.2 Opt-in Consent Tracking (Gap 2)

**Problem:** No `wa_opt_in` field on `admission_leads`. Messages can be sent to leads who never consented, violating Meta's policies and India's DPDPA 2023 / TCCCPR regulations. Meta can ban the WABA number.

### Migration

**File:** `supabase/migrations/20260222100001_add_wa_consent_tracking.sql`

```sql
-- ============================================
-- WhatsApp Gap Fill: Opt-in Consent Tracking
-- Gap 2 — P0 Critical (compliance)
-- ============================================

-- 1. Add consent fields to admission_leads
ALTER TABLE public.admission_leads
  ADD COLUMN IF NOT EXISTS wa_opt_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wa_opt_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wa_opt_in_source TEXT,
  ADD COLUMN IF NOT EXISTS wa_opt_out_at TIMESTAMPTZ;

-- source values: website_form | whatsapp_inbound | manual | import | chatbot | keyword_stop

CREATE INDEX IF NOT EXISTS idx_leads_wa_opt_in
  ON public.admission_leads(wa_opt_in)
  WHERE wa_opt_in = true;

-- 2. Consent audit log
CREATE TABLE IF NOT EXISTS public.wa_consent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.admission_leads(id) ON DELETE CASCADE,
  action TEXT NOT NULL,       -- opt_in | opt_out
  source TEXT NOT NULL,       -- website_form | whatsapp_inbound | manual | import | chatbot | keyword_stop
  ip_address TEXT,
  user_agent TEXT,
  performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.wa_consent_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_consent_log_access" ON public.wa_consent_log;
CREATE POLICY "wa_consent_log_access" ON public.wa_consent_log
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_wa_consent_log_lead ON public.wa_consent_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_consent_log_institution ON public.wa_consent_log(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_consent_log_created ON public.wa_consent_log(created_at DESC);
```

### New Service

**File:** `lib/services/whatsapp/whatsapp-consent-service.ts`

```
WhatsAppConsentService — Static-method class (server-side, service-role Supabase client)

Methods:
- checkConsent(leadId: string): Promise<{ hasConsent: boolean; optInAt: string | null; source: string | null }>
  → Reads admission_leads.wa_opt_in for the given lead
  → Returns { hasConsent: true/false, optInAt, source }

- grantConsent(params: {
    leadId: string;
    institutionId: string;
    source: 'website_form' | 'whatsapp_inbound' | 'manual' | 'import' | 'chatbot';
    performedBy?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void>
  → UPDATE admission_leads SET wa_opt_in = true, wa_opt_in_at = NOW(), wa_opt_in_source = source
  → INSERT into wa_consent_log with action = 'opt_in'

- revokeConsent(params: {
    leadId: string;
    institutionId: string;
    source: string;
    performedBy?: string;
  }): Promise<void>
  → UPDATE admission_leads SET wa_opt_in = false, wa_opt_out_at = NOW()
  → INSERT into wa_consent_log with action = 'opt_out'

- autoGrantOnInbound(leadId: string, institutionId: string): Promise<void>
  → Called when prospect sends JKKN a WhatsApp message first (implicit consent)
  → Only grants if wa_opt_in is currently false
  → source = 'whatsapp_inbound'

- handleStopKeyword(leadId: string, institutionId: string): Promise<void>
  → Called when inbound message text matches STOP/UNSUBSCRIBE/OPT-OUT keywords
  → Revokes consent with source = 'keyword_stop'
  → Keyword list: ['stop', 'unsubscribe', 'opt out', 'opt-out', 'cancel', 'remove']

- getConsentLog(leadId: string): Promise<ConsentLogEntry[]>
  → Returns audit trail ordered by created_at DESC

- getConsentStats(institutionId: string): Promise<{
    total_leads: number;
    opted_in: number;
    opted_out: number;
    never_set: number;
    opt_in_rate: number;
  }>
  → Counts from admission_leads grouped by wa_opt_in
```

### Integration Points (Modifications to Existing Files)

1. **`lib/services/admission/drip-executor-service.ts`** — In the new `send_whatsapp` case (Gap 1), add consent check before sending:
   ```
   const consent = await WhatsAppConsentService.checkConsent(step.lead_id);
   if (!consent.hasConsent) {
     return { success: false, error: 'Lead has not opted in to WhatsApp messages' };
   }
   ```

2. **`lib/services/admission/whatsapp-campaign-service.ts`** — In `sendCampaignMessage()`, add consent check before sending. In `sendBulkMessages()`, filter recipients to only those with `wa_opt_in = true`.

3. **`lib/services/whatsapp/whatsapp-chat-service.ts`** — In `handleInboundMessage()`, after finding/creating the conversation and linking to a lead (step 1), call `WhatsAppConsentService.autoGrantOnInbound()`. Also check message text for STOP keywords:
   ```
   if (params.text) {
     const stopKeywords = ['stop', 'unsubscribe', 'opt out', 'opt-out', 'cancel'];
     if (stopKeywords.some(kw => params.text!.toLowerCase().includes(kw))) {
       if (leadId) await WhatsAppConsentService.handleStopKeyword(leadId, params.institution_id);
     }
   }
   ```

4. **`lib/services/whatsapp/whatsapp-chat-service.ts`** — In `sendMessage()`, check consent before sending free-text messages. Template messages are exempt per Meta policy.

### API Routes

**New file:** `app/api/admission/chat/consent/route.ts`

```
GET /api/admission/chat/consent?lead_id={id}
  → Returns { hasConsent, optInAt, source, log: ConsentLogEntry[] }

POST /api/admission/chat/consent
  Body: { lead_id, institution_id, action: 'opt_in' | 'opt_out', source, performed_by? }
  → Grant or revoke consent manually
  → Returns { success: true }
```

**New file:** `app/api/admission/chat/consent/stats/route.ts`

```
GET /api/admission/chat/consent/stats?institution_id={id}
  → Returns { total_leads, opted_in, opted_out, never_set, opt_in_rate }
```

### UI Changes

**Modify:** `app/(routes)/admission/chat/_components/lead-profile-sidebar.tsx`

Add consent section below lead info:
- Badge: green "WA Opted In" (with date) or red "No WA Consent"
- If no consent: "Grant Consent" button (calls POST /consent with action='opt_in', source='manual')
- If consented: "Revoke" text link with confirmation dialog
- Expandable: "View consent history" shows audit log

**Modify:** `app/(routes)/admission/chat/_components/chat-thread.tsx`

When composing a message and lead has `wa_opt_in = false`:
- Show yellow warning banner above input: "This lead has not opted in to WhatsApp. Only template messages are allowed."
- Disable free-text input field
- Show "Send Template" button only

### Hook

**New file:** `hooks/admission/use-wa-consent.ts`

```typescript
export const waConsentKeys = {
  all: ['wa-consent'] as const,
  status: (leadId: string) => [...waConsentKeys.all, 'status', leadId] as const,
  stats: (institutionId: string) => [...waConsentKeys.all, 'stats', institutionId] as const,
};

// useWAConsent(leadId) → { hasConsent, optInAt, source, consentLog, isLoading }
// useWAConsentMutation() → { grantConsent, revokeConsent, isPending }
// useWAConsentStats(institutionId) → { stats, isLoading }
```

---

## 1.3 Smart Routing for Inbound Messages (Gap 3)

**Problem:** Inbound WhatsApp messages either auto-assign to the lead's existing counselor or stay unassigned. No keyword categorization, no priority routing, no assignment-rule triggering on inbound messages.

**Key insight:** The Assignment Rules engine already exists (`lib/services/admission/assignment-rules-service.ts`) with criteria matching, round-robin, and pool assignment. It just isn't triggered on inbound WhatsApp messages.

**No migration needed.** Uses existing tables.

### New Service

**File:** `lib/services/whatsapp/whatsapp-routing-service.ts`

```
WhatsAppRoutingService — Static-method class

Types:
  type MessageCategory =
    | 'fee_inquiry'
    | 'program_inquiry'
    | 'admission_status'
    | 'hostel_inquiry'
    | 'document_query'
    | 'callback_request'
    | 'complaint'
    | 'general';

Methods:
- categorizeMessage(text: string): MessageCategory
  → Keyword matching against predefined category dictionaries:
    'fee_inquiry'       → fee, payment, cost, amount, scholarship, tuition, price, rupee, inr
    'program_inquiry'   → course, program, btech, mba, pharm, nursing, engineering, admission, syllabus
    'admission_status'  → status, application, admit, accepted, seat, allotment, offer letter
    'hostel_inquiry'    → hostel, accommodation, room, mess, food, stay, living
    'document_query'    → document, certificate, marksheet, upload, aadhaar, 10th, 12th
    'callback_request'  → call, callback, contact, speak, phone, ring, talk
    'complaint'         → complaint, problem, issue, unhappy, bad, worst, refund
    'general'           → default (no keywords matched)
  → Case-insensitive, check all keywords against message text
  → Return first matching category (priority order: complaint > callback > fee > program > rest)

- routeConversation(params: {
    conversationId: string;
    institutionId: string;
    messageCategory: MessageCategory;
    leadData?: { interested_programs?: string[]; source?: string; score?: number; region?: string };
  }): Promise<{ assignedTo: string | null; routingReason: string }>
  → Step 1: Check if conversation already has assigned_to → return early with reason "already_assigned"
  → Step 2: If lead data exists, evaluate assignment rules via AssignmentRulesService.evaluateRules()
             Add message_category as an additional criterion
  → Step 3: If assignment rules return a counselor → assign + return
  → Step 4: If no rule match, attempt round-robin among counselors with role 'admission_counselor'
  → Step 5: If no counselors found → leave unassigned, set priority to 'urgent'
  → Return { assignedTo, routingReason }

- setConversationPriority(conversationId: string, category: MessageCategory): Promise<void>
  → Updates wa_conversations.metadata → { priority: 'urgent' | 'high' | 'normal' | 'low' }
  → Priority mapping:
    complaint → 'urgent'
    callback_request → 'high'
    fee_inquiry, admission_status → 'normal'
    everything else → 'normal'

- getRoutingStats(institutionId: string): Promise<{
    byCategory: Record<MessageCategory, number>;
    autoAssigned: number;
    manuallyAssigned: number;
    unassigned: number;
  }>
```

### Integration Point

**Modify:** `lib/services/whatsapp/whatsapp-chat-service.ts` — `handleInboundMessage()`

After existing step 7 (auto-assign from lead's counselor), add steps 8-9:

```
// 8. Smart routing: categorize message and route via assignment rules
const category = WhatsAppRoutingService.categorizeMessage(params.text || '');
await WhatsAppRoutingService.setConversationPriority(conversation.id, category);

if (!conversation.assigned_to) {
  // Only route if not already assigned
  const leadData = lead ? {
    interested_programs: lead.interested_programs,
    source: lead.source,
    score: lead.score,
    region: lead.region,
  } : undefined;

  const route = await WhatsAppRoutingService.routeConversation({
    conversationId: conversation.id,
    institutionId: params.institution_id,
    messageCategory: category,
    leadData,
  });

  if (route.assignedTo) {
    await supabase.from('wa_conversations')
      .update({ assigned_to: route.assignedTo })
      .eq('id', conversation.id);
  }
}

// 9. Auto-tag conversation with category
if (category !== 'general') {
  const currentTags = conversation.tags || [];
  if (!currentTags.includes(category)) {
    await supabase.from('wa_conversations')
      .update({ tags: [...currentTags, category] })
      .eq('id', conversation.id);
  }
}
```

### UI Changes

**Modify:** `app/(routes)/admission/chat/_components/conversation-list.tsx`

Add category filter chips above the conversation list:
- Horizontal scrollable row of pills: "All" | "Fee" | "Program" | "Status" | "Hostel" | "Document" | "Complaint" | "Unassigned"
- Filter the `useConversations` hook by `tags` parameter
- Show category tag badge on each conversation card (small colored pill)
- Priority indicator: red dot for urgent, orange for high

### No new API routes — routing is internal, triggered by webhook handler.

### No new hooks — existing `useConversations` with `tags` filter supports this.

---

# PHASE 2: P1 Important Gaps (est. 5 days)

Feature parity with competitors. These make the WhatsApp channel production-ready for counselors.

---

## 2.1 24hr Messaging Window UI Indicator (Gap 4)

**Problem:** WhatsApp enforces a 24-hour window after the last inbound message. Outside this window, only template messages are allowed. The chat UI shows no indication, so counselors try to send free-text messages that fail.

**No migration needed.** The `last_inbound_at` field already exists on `wa_conversations` (migration `20260222000002`).

### Service Changes

**Modify:** `lib/services/whatsapp/whatsapp-chat-service.ts`

Add static method:

```typescript
static getWindowStatus(lastInboundAt: string | null): {
  withinWindow: boolean;
  expiresAt: string | null;
  remainingMinutes: number | null;
  status: 'open' | 'closing' | 'expired' | 'never';
} {
  if (!lastInboundAt) return { withinWindow: false, expiresAt: null, remainingMinutes: null, status: 'never' };

  const lastInbound = new Date(lastInboundAt);
  const windowEnd = new Date(lastInbound.getTime() + 24 * 60 * 60 * 1000);
  const now = new Date();
  const withinWindow = now < windowEnd;
  const remainingMs = windowEnd.getTime() - now.getTime();
  const remainingMinutes = withinWindow ? Math.round(remainingMs / 60000) : null;

  let status: 'open' | 'closing' | 'expired' | 'never' = 'expired';
  if (withinWindow) {
    status = remainingMinutes! < 60 ? 'closing' : 'open';
  }

  return { withinWindow, expiresAt: windowEnd.toISOString(), remainingMinutes, status };
}
```

Also modify `sendMessage()`: Before sending free-text, check window. If expired, return error with guidance to use templates.

```
const window = WhatsAppChatService.getWindowStatus(conversation.last_inbound_at);
if (!window.withinWindow && messageType !== 'template') {
  throw new Error('Outside 24hr messaging window. Use sendTemplateMessage() instead.');
}
```

### API Route Change

**Modify:** `app/api/admission/chat/conversations/[id]/route.ts` — GET response

Include window status in the conversation response:

```typescript
const windowStatus = WhatsAppChatService.getWindowStatus(conversation.last_inbound_at);
return NextResponse.json({ ...conversation, window_status: windowStatus });
```

### UI Changes

**Modify:** `app/(routes)/admission/chat/_components/chat-thread.tsx`

Add window status banner above the message input area:

```
Window Status Banner (renders above message composer):
- status='open': Green banner — "Messaging window open — Xh Ym remaining"
  → Countdown via useEffect + setInterval(1 minute)
  → Full message input enabled
- status='closing': Orange banner — "Window closing in Xm — switch to templates soon"
  → Full input enabled but with visual urgency
- status='expired': Red banner — "Window expired. Only template messages can be sent."
  → Hide free-text input
  → Show template selector button only
- status='never': Gray banner — "No messages from this contact. Send a template to start."
  → Hide free-text input
  → Show template selector button only
```

The window status comes from `useConversation` hook data (which fetches the conversation including `last_inbound_at`). Compute locally — no new hook needed.

---

## 2.2 Template Quality Rating Display (Gap 5)

**Problem:** Template quality ratings (HIGH/MEDIUM/LOW) are fetched by `WhatsAppTemplateService.getTemplateQualityRating()` and stored in `admission_communication_templates.metadata.quality_rating`, but no UI surfaces this to users when selecting templates.

**No migration needed.** Quality rating is already in the `metadata` JSONB column.

### Service Changes

**Modify:** `lib/services/whatsapp/whatsapp-template-service.ts`

Add batch quality refresh method:

```typescript
static async refreshAllQualityRatings(institutionId: string): Promise<number> {
  // 1. Fetch all WhatsApp templates for institution
  const templates = await this.getTemplates({ institution_id: institutionId });
  let updated = 0;

  // 2. For each template with a name, fetch quality rating from Meta
  for (const template of templates.data) {
    if (!template.name) continue;
    const rating = await this.getTemplateQualityRating(template.name);
    if (rating !== 'UNKNOWN') {
      await this.updateTemplate(template.id, {});
      // Update metadata.quality_rating
      const supabase = getServiceClient();
      await supabase
        .from('admission_communication_templates')
        .update({
          metadata: { ...template.metadata, quality_rating: rating },
          updated_at: new Date().toISOString(),
        })
        .eq('id', template.id);
      updated++;
    }
  }
  return updated;
}
```

### API Route

**New file:** `app/api/admission/chat/templates/refresh-quality/route.ts`

```
POST /api/admission/chat/templates/refresh-quality
  Body: { institution_id: string }
  → Calls WhatsAppTemplateService.refreshAllQualityRatings(institutionId)
  → Returns { updated: number }
```

### UI Changes

**Modify:** Wherever templates are displayed (template manager page, template selector in chat):

Add quality rating badge next to each template:
- **HIGH** → green badge with shield-check icon
- **MEDIUM** → yellow badge with alert-triangle icon
- **LOW** → red badge with alert-circle icon + tooltip: "This template may be throttled by Meta. Consider revising."
- **UNKNOWN** → gray badge with help-circle icon

In the template selector modal within chat-thread.tsx:
- Sort templates by quality rating (HIGH first, LOW last)
- Show quality badge inline with template name
- Add "Refresh Ratings" button at top (calls refresh-quality API)

### Hook Changes

**Modify:** `hooks/admission/use-communication-templates.ts`

Add `refreshQuality` mutation:
```typescript
const refreshQuality = useMutation({
  mutationFn: (institutionId: string) =>
    fetch('/api/admission/chat/templates/refresh-quality', {
      method: 'POST',
      body: JSON.stringify({ institution_id: institutionId }),
    }).then(r => r.json()),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.all }),
});
```

---

## 2.3 Audience Segmentation Builder (Gap 6)

**Problem:** WhatsApp campaigns can only target manually selected leads or all leads. No way to build and save audience segments (e.g., "B.Pharm interested, score > 50, not contacted in 7 days, opted in to WhatsApp").

### Migration

**File:** `supabase/migrations/20260222100002_create_wa_audience_segments.sql`

```sql
-- ============================================
-- WhatsApp Gap Fill: Audience Segments
-- Gap 6 — P1 Important
-- ============================================

CREATE TABLE IF NOT EXISTS public.wa_audience_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  -- Filter criteria as structured JSON array
  criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Format: [
  --   { "field": "interested_programs", "operator": "contains", "value": "B.Pharm" },
  --   { "field": "score", "operator": "greater_than", "value": 50 },
  --   { "field": "last_contacted_at", "operator": "older_than_days", "value": 7 },
  --   { "field": "wa_opt_in", "operator": "equals", "value": true }
  -- ]

  logic TEXT NOT NULL DEFAULT 'AND',  -- AND | OR

  -- Cache
  cached_count INT,
  cached_at TIMESTAMPTZ,

  -- Usage
  last_used_at TIMESTAMPTZ,
  use_count INT NOT NULL DEFAULT 0,

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.wa_audience_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_segments_access" ON public.wa_audience_segments;
CREATE POLICY "wa_segments_access" ON public.wa_audience_segments
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_wa_segments_institution ON public.wa_audience_segments(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_segments_active ON public.wa_audience_segments(is_active) WHERE is_active = true;
```

### New Service

**File:** `lib/services/whatsapp/whatsapp-segment-service.ts`

```
WhatsAppSegmentService — Static-method class

Types:
  interface SegmentCriterion {
    field: string;         // admission_leads column name
    operator: string;      // equals | not_equals | contains | greater_than | less_than |
                           // in | not_in | is_null | is_not_null | older_than_days | newer_than_days
    value: unknown;
  }

  interface Segment {
    id: string;
    institution_id: string;
    name: string;
    description: string | null;
    criteria: SegmentCriterion[];
    logic: 'AND' | 'OR';
    cached_count: number | null;
    cached_at: string | null;
    last_used_at: string | null;
    use_count: number;
    is_active: boolean;
    created_at: string;
  }

Methods:
- getSegments(institutionId: string, isActive?: boolean): Promise<Segment[]>
  → SELECT * FROM wa_audience_segments WHERE institution_id = ... ORDER BY last_used_at DESC

- getSegment(segmentId: string): Promise<Segment | null>
  → Single fetch by ID

- createSegment(params: {
    institution_id: string; name: string; description?: string;
    criteria: SegmentCriterion[]; logic?: 'AND' | 'OR'; created_by: string;
  }): Promise<Segment>
  → INSERT + return

- updateSegment(segmentId: string, params: Partial<...>): Promise<Segment>

- deleteSegment(segmentId: string): Promise<void>

- previewSegment(institutionId: string, criteria: SegmentCriterion[], logic: 'AND' | 'OR'): Promise<{
    count: number;
    sample: Array<{ id: string; full_name: string; phone: string; email: string | null; funnel_stage: string; wa_opt_in: boolean }>;
  }>
  → Builds dynamic Supabase query from criteria using buildQueryFromCriteria()
  → ALWAYS includes wa_opt_in = true filter (compliance — never target non-consented leads)
  → Returns count + first 10 leads as sample

- resolveSegment(segmentId: string): Promise<Array<{ id: string; phone: string; full_name: string }>>
  → Fetches segment, builds query, returns ALL matching leads
  → Updates cached_count and cached_at
  → Increments use_count and sets last_used_at

- buildQueryFromCriteria(
    baseQuery: SupabaseQuery,
    criteria: SegmentCriterion[],
    logic: 'AND' | 'OR'
  ): SupabaseQuery
  → Internal method that translates each criterion to Supabase filter:
    equals         → .eq(field, value)
    not_equals     → .neq(field, value)
    contains       → .ilike(field, '%' + value + '%')
    greater_than   → .gt(field, value)
    less_than      → .lt(field, value)
    in             → .in(field, value)          // value is array
    not_in         → .not('field', 'in', value)
    is_null        → .is(field, null)
    is_not_null    → .not(field, 'is', null)
    older_than_days→ .lt(field, new Date(now - value*86400000))
    newer_than_days→ .gt(field, new Date(now - value*86400000))
  → For AND logic: chain .eq/.gt etc
  → For OR logic: build .or() string
```

### API Routes

**New file:** `app/api/admission/campaigns/segments/route.ts`

```
GET /api/admission/campaigns/segments?institution_id={id}&is_active={bool}
  → Returns all segments for the institution

POST /api/admission/campaigns/segments
  Body: { institution_id, name, description?, criteria, logic?, created_by }
  → Creates new segment
```

**New file:** `app/api/admission/campaigns/segments/[id]/route.ts`

```
GET    /api/admission/campaigns/segments/{id}
PUT    /api/admission/campaigns/segments/{id}
  Body: { name?, description?, criteria?, logic?, is_active? }
DELETE /api/admission/campaigns/segments/{id}
```

**New file:** `app/api/admission/campaigns/segments/preview/route.ts`

```
POST /api/admission/campaigns/segments/preview
  Body: { institution_id, criteria, logic }
  → Returns { count: number, sample: Lead[] }
```

**New file:** `app/api/admission/campaigns/segments/[id]/resolve/route.ts`

```
POST /api/admission/campaigns/segments/{id}/resolve
  → Returns { leads: Array<{ id, phone, full_name }>, total: number }
```

### UI

**New page:** `app/(routes)/admission/campaigns/segments/page.tsx`

Layout:
```
┌─────────────────────────────────────────────────────────────────┐
│ Audience Segments                              [+ New Segment]  │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Segment Builder (Dialog or inline)                          │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ [Field ▼] [Operator ▼] [Value input] [× Remove]        │ │ │
│ │ │ [Field ▼] [Operator ▼] [Value input] [× Remove]        │ │ │
│ │ │ [+ Add Condition]                    [AND ↔ OR toggle]  │ │ │
│ │ ├─────────────────────────────────────────────────────────┤ │ │
│ │ │ Preview: Matches 247 leads (✓ all opted-in)             │ │ │
│ │ │ Sample: [Lead 1] [Lead 2] [Lead 3] ...                  │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ Saved Segments:                                                   │
│ ┌───────────────────┬───────┬──────────┬──────────┬───────────┐ │
│ │ Name              │ Count │ Last Used│ Created  │ Actions   │ │
│ ├───────────────────┼───────┼──────────┼──────────┼───────────┤ │
│ │ B.Pharm Hot Leads │ 127   │ 2d ago   │ Feb 15   │ [Use][Edit│ │
│ │ Cold > 14 days    │ 89    │ 1w ago   │ Feb 10   │ [Use][Edit│ │
│ └───────────────────┴───────┴──────────┴──────────┴───────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

Available fields for criteria:
- `full_name` (text), `email` (text), `phone` (text)
- `funnel_stage` (select: new, contacted, qualified, applied, offered, enrolled, lost)
- `score` (number), `engagement_score` (number)
- `source` (select: website, walk_in, referral, social_media, etc.)
- `interested_programs` (text, contains match)
- `last_contacted_at` (older_than_days / newer_than_days)
- `created_at` (older_than_days / newer_than_days)
- `wa_opt_in` (boolean — always auto-included as true for WhatsApp segments)
- `tags` (contains)
- `counselor_id` (select)

Integration with campaign send:
- When creating a WhatsApp campaign, add "Use Saved Segment" dropdown next to manual lead selection
- Selecting a segment calls /resolve to get matching leads

### Hook

**New file:** `hooks/admission/use-wa-segments.ts`

```typescript
export const waSegmentKeys = {
  all: ['wa-segments'] as const,
  list: (institutionId: string) => [...waSegmentKeys.all, 'list', institutionId] as const,
  detail: (segmentId: string) => [...waSegmentKeys.all, 'detail', segmentId] as const,
  preview: () => [...waSegmentKeys.all, 'preview'] as const,
};

// useWASegments(institutionId) → { segments, isLoading }
// useWASegment(segmentId) → { segment, isLoading }
// useWASegmentPreview() → mutation { preview({ institutionId, criteria, logic }) → { count, sample } }
// useWASegmentMutations() → { create, update, delete, resolve }
```

---

## 2.4 Per-Template Engagement Analytics (Gap 7)

**Problem:** No visibility into which templates perform well. Delivery/read rates are tracked per message but not aggregated per template.

**No migration needed.** Data exists in `admission_whatsapp_logs` (delivery_status, template_id) and `wa_messages` (status, content.template_name).

### New Service

**File:** `lib/services/whatsapp/whatsapp-template-analytics-service.ts`

```
WhatsAppTemplateAnalyticsService — Static-method class

Types:
  interface TemplateAnalytics {
    template_id: string;
    template_name: string;
    category: string | null;
    sent_count: number;
    delivered_count: number;
    read_count: number;
    failed_count: number;
    delivery_rate: number;  // delivered / sent * 100
    read_rate: number;      // read / delivered * 100
    fail_rate: number;      // failed / sent * 100
    quality_rating: string | null;
  }

  interface DailyMetric {
    date: string;          // YYYY-MM-DD
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  }

Methods:
- getTemplateAnalytics(institutionId: string, dateFrom?: string, dateTo?: string): Promise<TemplateAnalytics[]>
  → Query admission_whatsapp_logs grouped by template_id
  → JOIN admission_communication_templates for name and category
  → Calculate rates
  → Sort by sent_count DESC

- getTemplateTimeline(templateId: string, institutionId: string, dateFrom: string, dateTo: string): Promise<DailyMetric[]>
  → Daily breakdown grouped by DATE(created_at)
  → For Recharts time-series chart

- getTopPerformingTemplates(institutionId: string, limit?: number): Promise<TemplateAnalytics[]>
  → Top N by read_rate, minimum 10 sends to qualify
  → Default limit = 5

- getWorstPerformingTemplates(institutionId: string, limit?: number): Promise<TemplateAnalytics[]>
  → Lowest delivery_rate, minimum 10 sends
  → These templates likely need revision
```

### API Route

**New file:** `app/api/admission/chat/templates/analytics/route.ts`

```
GET /api/admission/chat/templates/analytics
  Query: { institution_id, from?, to?, template_id? }
  → If template_id provided: returns timeline data
  → Otherwise: returns all template analytics
  → Response: { analytics: TemplateAnalytics[], top_performing: TemplateAnalytics[], worst_performing: TemplateAnalytics[] }
```

### UI

**New page:** `app/(routes)/admission/templates/analytics/page.tsx`

Layout:
```
┌─────────────────────────────────────────────────────────────────┐
│ Template Performance Analytics           [Date Range Picker]     │
├─────────────────────────────────────────────────────────────────┤
│ KPI Cards (4 across):                                            │
│ [Total Sent] [Avg Delivery %] [Avg Read %] [Avg Fail %]         │
├─────────────────────────────────────────────────────────────────┤
│ Bar Chart: Delivery Rate vs Read Rate per Template               │
│ (Recharts horizontal bar chart, sorted by read_rate)             │
├─────────────────────────────────────────────────────────────────┤
│ Table:                                                            │
│ ┌──────────────┬──────┬──────────┬──────┬────────┬─────────────┐│
│ │ Template     │ Sent │ Delivered│ Read │ Failed │ Quality     ││
│ ├──────────────┼──────┼──────────┼──────┼────────┼─────────────┤│
│ │ jkkn_welcome │ 1240 │ 95.2%   │ 68.1%│ 2.3%  │ 🟢 HIGH    ││
│ │ jkkn_fee     │ 890  │ 91.0%   │ 45.3%│ 5.1%  │ 🟡 MEDIUM  ││
│ └──────────────┴──────┴──────────┴──────┴────────┴─────────────┘│
│ Click row → expands to daily timeline chart                       │
└─────────────────────────────────────────────────────────────────┘
```

### Hook

**New file:** `hooks/admission/use-template-analytics.ts`

```typescript
export const templateAnalyticsKeys = {
  all: ['template-analytics'] as const,
  list: (institutionId: string, from?: string, to?: string) =>
    [...templateAnalyticsKeys.all, 'list', institutionId, from, to] as const,
  timeline: (templateId: string, from?: string, to?: string) =>
    [...templateAnalyticsKeys.all, 'timeline', templateId, from, to] as const,
};

// useTemplateAnalytics(institutionId, dateRange?) → { analytics, topPerforming, worstPerforming, isLoading }
// useTemplateTimeline(templateId, institutionId, dateRange) → { timeline: DailyMetric[], isLoading }
```

---

# PHASE 3: P2+P3 Gaps (est. 7 days)

Competitive differentiation. High-value features that separate MyJKKN from basic WhatsApp CRMs.

---

## 3.1 Pre-built Enrollment Template Library (Gap 8)

**Problem:** Counselors create templates from scratch. Meritto provides field-tested templates. Need 10+ ready-to-use enrollment templates.

**No migration needed.** Templates are stored in `admission_communication_templates`.

### Service Changes

**Modify:** `lib/services/whatsapp/whatsapp-template-service.ts`

Add static method with 12 predefined admission templates:

```typescript
static getStarterTemplates(): Array<{
  name: string;
  category: 'MARKETING' | 'UTILITY';
  language: string;
  body: string;
  variables: string[];
  suggested_header?: string;
  suggested_buttons?: Array<{ type: 'QUICK_REPLY' | 'URL'; text: string }>;
  use_case: string;
}> {
  return [
    // Welcome & Introduction
    { name: 'jkkn_welcome', category: 'MARKETING', language: 'en',
      body: 'Hello {{1}}! Thank you for your interest in JKKN Institutions. We offer world-class programs in Engineering, Pharmacy, Nursing, and Management. Reply YES to learn more!',
      variables: ['full_name'], use_case: 'First contact after inquiry',
      suggested_buttons: [{ type: 'QUICK_REPLY', text: 'Yes, tell me more' }, { type: 'QUICK_REPLY', text: 'Call me' }] },

    { name: 'jkkn_counselor_intro', category: 'MARKETING', language: 'en',
      body: 'Hi {{1}}, I am {{2}}, your admission counselor at JKKN. I will be your guide throughout the admission process for {{3}}. Feel free to ask me anything!',
      variables: ['full_name', 'counselor_name', 'program'], use_case: 'Counselor assignment notification' },

    // Application Process
    { name: 'jkkn_application_received', category: 'UTILITY', language: 'en',
      body: 'Hi {{1}}, we have received your application for {{2}} at JKKN. Your application reference number is {{3}}. We will review it within 3 working days.',
      variables: ['full_name', 'program', 'reference_number'], use_case: 'Application confirmation' },

    { name: 'jkkn_application_status', category: 'UTILITY', language: 'en',
      body: 'Hi {{1}}, update on your {{2}} application: {{3}}. Log in to MyJKKN to view details.',
      variables: ['full_name', 'program', 'status_message'], use_case: 'Status change notification' },

    { name: 'jkkn_document_request', category: 'UTILITY', language: 'en',
      body: 'Hi {{1}}, to proceed with your admission to {{2}}, please submit the following documents: {{3}}. Upload them via the link below by {{4}}.',
      variables: ['full_name', 'program', 'documents_list', 'deadline'], use_case: 'Document collection' },

    // Financial
    { name: 'jkkn_fee_reminder', category: 'UTILITY', language: 'en',
      body: 'Hi {{1}}, your fee payment of INR {{2}} for {{3}} is due by {{4}}. Pay online to confirm your seat. Contact us if you need a payment plan.',
      variables: ['full_name', 'amount', 'program', 'deadline'], use_case: 'Fee payment reminder' },

    { name: 'jkkn_scholarship_info', category: 'MARKETING', language: 'en',
      body: 'Hi {{1}}, based on your academic profile, you may be eligible for scholarships worth up to INR {{2}} for {{3}} at JKKN. Reply SCHOLARSHIP for details.',
      variables: ['full_name', 'amount', 'program'], use_case: 'Scholarship notification' },

    // Engagement
    { name: 'jkkn_campus_visit', category: 'MARKETING', language: 'en',
      body: 'Hi {{1}}, experience JKKN campus first-hand! We would love to show you our facilities, labs, and hostel. Reply VISIT to schedule a campus tour at your convenience.',
      variables: ['full_name'], use_case: 'Campus visit invitation' },

    { name: 'jkkn_event_invite', category: 'MARKETING', language: 'en',
      body: 'Hi {{1}}, you are invited to {{2}} at JKKN on {{3}}. It is a great chance to meet faculty and current learners. Register now!',
      variables: ['full_name', 'event_name', 'event_date'], use_case: 'Event/webinar invitation' },

    { name: 'jkkn_offer_letter', category: 'UTILITY', language: 'en',
      body: 'Congratulations {{1}}! Your offer letter for {{2}} at JKKN Institutions is ready. Download it and complete acceptance by {{3}} to secure your seat.',
      variables: ['full_name', 'program', 'deadline'], use_case: 'Offer letter delivery' },

    // Re-engagement
    { name: 'jkkn_followup', category: 'MARKETING', language: 'en',
      body: 'Hi {{1}}, we noticed you were exploring {{2}} at JKKN. Do you have any questions about the program, fees, or campus life? Reply HELP to connect with your counselor.',
      variables: ['full_name', 'program'], use_case: 'Follow-up for inactive leads' },

    { name: 'jkkn_deadline_alert', category: 'UTILITY', language: 'en',
      body: 'Hi {{1}}, reminder: the admission deadline for {{2}} at JKKN is {{3}}. Only {{4}} seats remaining. Complete your application now to avoid missing out.',
      variables: ['full_name', 'program', 'deadline', 'seats_remaining'], use_case: 'Urgency/deadline reminder' },
  ];
}

static async installStarterTemplates(institutionId: string, userId: string): Promise<{ installed: number; skipped: number }> {
  const starters = this.getStarterTemplates();
  const existing = await this.getTemplates({ institution_id: institutionId });
  const existingNames = new Set(existing.data.map(t => t.name));

  let installed = 0;
  let skipped = 0;

  for (const starter of starters) {
    if (existingNames.has(starter.name)) { skipped++; continue; }

    await this.createTemplate({
      institution_id: institutionId,
      name: starter.name,
      content: starter.body,
      category: starter.category.toLowerCase(),
      variables: starter.variables,
      is_active: false, // Must be submitted to Meta before use
    }, userId);
    installed++;
  }

  return { installed, skipped };
}
```

### UI Changes

**Modify:** Templates management page

Add "Template Library" section or tab:
- Grid of starter templates with preview cards
- Each card shows: name, use case, body preview, variable list
- "Install" button per template (adds to local DB with is_active=false)
- "Install All" button
- "Submit to Meta" button (after install, calls submitTemplate for Meta approval)
- Note: Templates start as inactive until Meta approves them

---

## 3.2 Document Catalog (Gap 9)

**Problem:** Counselors manually type URLs or search for brochures. Need a centralized catalog of shareable documents (brochures, fee structures, virtual tour links).

### Migration

**File:** `supabase/migrations/20260222100003_create_wa_document_catalog.sql`

```sql
-- ============================================
-- WhatsApp Gap Fill: Document Catalog
-- Gap 9 — P2 Valuable
-- ============================================

CREATE TABLE IF NOT EXISTS public.wa_document_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  -- brochure | fee_structure | virtual_tour | campus_map | scholarship | hostel | placement | other
  document_type TEXT NOT NULL,
  -- pdf | image | video | link
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  file_size_bytes INT,
  share_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.wa_document_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_doc_catalog_access" ON public.wa_document_catalog;
CREATE POLICY "wa_doc_catalog_access" ON public.wa_document_catalog
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_wa_doc_catalog_institution ON public.wa_document_catalog(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_doc_catalog_category ON public.wa_document_catalog(category);
CREATE INDEX IF NOT EXISTS idx_wa_doc_catalog_active ON public.wa_document_catalog(is_active) WHERE is_active = true;
```

### New Service

**File:** `lib/services/whatsapp/whatsapp-document-catalog-service.ts`

```
WhatsAppDocumentCatalogService — Static-method class

Types:
  interface CatalogDocument {
    id: string;
    institution_id: string;
    title: string;
    description: string | null;
    category: string;
    document_type: string;
    url: string;
    thumbnail_url: string | null;
    file_size_bytes: number | null;
    share_count: number;
    is_active: boolean;
    created_at: string;
  }

Methods:
- getCatalog(institutionId: string, category?: string, search?: string): Promise<CatalogDocument[]>
  → Filtered fetch, ordered by share_count DESC

- getDocument(documentId: string): Promise<CatalogDocument | null>

- createDocument(params: {
    institution_id: string; title: string; description?: string;
    category: string; document_type: string; url: string;
    thumbnail_url?: string; file_size_bytes?: number; created_by: string;
  }): Promise<CatalogDocument>

- updateDocument(id: string, params: Partial<...>): Promise<CatalogDocument>

- deleteDocument(id: string): Promise<void>

- shareDocument(params: {
    documentId: string; conversationId: string; senderId: string;
  }): Promise<ChatMessage>
  → Fetches document from catalog
  → If document_type is 'pdf' or 'image' → call sendMediaMessage (via whatsapp-api-client)
  → If document_type is 'video' → call sendMediaMessage with type 'video'
  → If document_type is 'link' → call sendTextMessage with the URL
  → Stores message in wa_messages via WhatsAppChatService.sendMessage()
  → Increments share_count on the catalog entry

- getPopularDocuments(institutionId: string, limit?: number): Promise<CatalogDocument[]>
  → Top N by share_count
```

### API Routes

**New file:** `app/api/admission/chat/documents/route.ts`

```
GET  /api/admission/chat/documents?institution_id={id}&category={cat}&search={q}
POST /api/admission/chat/documents
  Body: { institution_id, title, description?, category, document_type, url, thumbnail_url?, file_size_bytes?, created_by }
```

**New file:** `app/api/admission/chat/documents/[id]/route.ts`

```
GET    /api/admission/chat/documents/{id}
PUT    /api/admission/chat/documents/{id}
DELETE /api/admission/chat/documents/{id}
```

**New file:** `app/api/admission/chat/documents/[id]/share/route.ts`

```
POST /api/admission/chat/documents/{id}/share
  Body: { conversation_id, sender_id }
  → Returns { success: true, message: ChatMessage }
```

### UI Changes

**Modify:** `app/(routes)/admission/chat/_components/chat-thread.tsx`

Add "Documents" button (Folder icon) in the message input toolbar, next to the attachment/template buttons. Clicking opens a slide-over panel with:
- Category tabs: Brochures | Fees | Virtual Tours | Hostel | Scholarships | All
- Search input
- Grid of documents with thumbnail, title, share count
- Click → sends to current conversation
- "Manage Catalog" link to full management page

**New page:** `app/(routes)/admission/templates/documents/page.tsx`

Full document catalog management:
- Table view with category, document type, share count, created date
- Upload dialog (for PDFs/images → upload to Supabase Storage, get URL)
- Add external URL dialog (for links)
- Edit/delete actions

### Hook

**New file:** `hooks/admission/use-wa-document-catalog.ts`

```typescript
export const waDocCatalogKeys = {
  all: ['wa-doc-catalog'] as const,
  list: (institutionId: string, category?: string) =>
    [...waDocCatalogKeys.all, 'list', institutionId, category] as const,
  detail: (id: string) => [...waDocCatalogKeys.all, 'detail', id] as const,
};

// useWADocumentCatalog(institutionId, category?) → { documents, isLoading }
// useWADocumentMutations() → { create, update, delete, share }
```

---

## 3.3 Counselor Performance Dashboard (Gap 10)

**Problem:** No visibility into which counselors respond fastest, resolve most conversations, or have the best outcomes.

**No migration needed.** All data exists in `wa_conversations` and `wa_messages`.

### New Service

**File:** `lib/services/whatsapp/whatsapp-counselor-analytics-service.ts`

```
WhatsAppCounselorAnalyticsService — Static-method class

Types:
  interface CounselorMetrics {
    counselor_id: string;
    counselor_name: string;
    avatar_url: string | null;
    total_conversations: number;
    resolved_conversations: number;
    open_conversations: number;
    avg_first_response_minutes: number | null;
    avg_resolution_minutes: number | null;
    messages_sent: number;
    messages_received: number;
    resolution_rate: number;  // resolved / total * 100
  }

  interface ResponseTimeDistribution {
    bucket: string;           // '<1m' | '1-5m' | '5-15m' | '15-60m' | '>60m'
    count: number;
    percentage: number;
  }

Methods:
- getCounselorPerformance(institutionId: string, dateFrom?: string, dateTo?: string): Promise<CounselorMetrics[]>
  → Query wa_conversations grouped by assigned_to
  → JOIN profiles for counselor_name
  → For avg_first_response_minutes:
    For each conversation, find time diff between first inbound message and first outbound message
    Average across all conversations for that counselor
  → For avg_resolution_minutes:
    Time diff between first message and resolution (status change to 'resolved')
  → Sort by resolution_rate DESC

- getCounselorTimeline(counselorId: string, institutionId: string, dateFrom: string, dateTo: string): Promise<Array<{
    date: string; conversations: number; messages: number; avg_response_min: number;
  }>>
  → Daily breakdown for Recharts

- getResponseTimeDistribution(institutionId: string, dateFrom?: string, dateTo?: string): Promise<ResponseTimeDistribution[]>
  → Compute first-response time for each conversation
  → Bucket into: <1min, 1-5min, 5-15min, 15-60min, >60min
  → Return counts and percentages

- getLeaderboard(institutionId: string, metric: 'resolution_rate' | 'response_time' | 'conversations', limit?: number): Promise<CounselorMetrics[]>
  → Sorted by the specified metric
  → Default limit = 10
```

### API Route

**New file:** `app/api/admission/chat/counselor-performance/route.ts`

```
GET /api/admission/chat/counselor-performance
  Query: { institution_id, from?, to?, counselor_id? }
  → If counselor_id provided: returns timeline for that counselor
  → Otherwise: returns all counselor metrics + response time distribution
  → Response: { counselors: CounselorMetrics[], distribution: ResponseTimeDistribution[] }
```

### UI

**New page:** `app/(routes)/admission/chat/performance/page.tsx`

Layout:
```
┌─────────────────────────────────────────────────────────────────┐
│ Counselor Performance                    [Date Range Picker]     │
├─────────────────────────────────────────────────────────────────┤
│ KPI Cards (4):                                                   │
│ [Avg Response Time] [Resolution Rate] [Active Convos] [Total]   │
├─────────────────────────────────────────────────────────────────┤
│ Response Time Distribution Chart (Recharts bar chart)            │
│ [<1m ████████] [1-5m ████████████] [5-15m ████] [15-60m ██] [>60m █] │
├─────────────────────────────────────────────────────────────────┤
│ Leaderboard Table:                                               │
│ ┌────┬──────────────┬──────┬─────────┬──────────┬──────────┐   │
│ │ #  │ Counselor    │ Conv │ Resolved│ Avg Resp │ Res Rate │   │
│ ├────┼──────────────┼──────┼─────────┼──────────┼──────────┤   │
│ │ 1  │ Priya M      │ 156  │ 142     │ 3.2m     │ 91%      │   │
│ │ 2  │ Rahul K      │ 134  │ 118     │ 5.1m     │ 88%      │   │
│ └────┴──────────────┴──────┴─────────┴──────────┴──────────┘   │
│ Click row → expands to daily timeline chart                       │
└─────────────────────────────────────────────────────────────────┘
```

### Hook

**New file:** `hooks/admission/use-counselor-performance.ts`

```typescript
export const counselorPerfKeys = {
  all: ['counselor-performance'] as const,
  list: (institutionId: string, from?: string, to?: string) =>
    [...counselorPerfKeys.all, 'list', institutionId, from, to] as const,
  timeline: (counselorId: string) =>
    [...counselorPerfKeys.all, 'timeline', counselorId] as const,
};

// useCounselorPerformance(institutionId, dateRange?) → { counselors, distribution, isLoading }
// useCounselorTimeline(counselorId, institutionId, dateRange) → { timeline, isLoading }
```

---

## 3.4 Re-engagement Workflows (Gap 11)

**Problem:** The re-engagement page and hook exist, but there are no automated WhatsApp re-engagement sequences. Cold leads stay cold.

**No migration needed.** Uses existing `admission_drip_sequences` and `admission_drip_schedule` tables.

### New Service

**File:** `lib/services/whatsapp/whatsapp-reengagement-service.ts`

```
WhatsAppReengagementService — Static-method class

Types:
  interface SequenceTemplate {
    name: string;
    description: string;
    steps: Array<{
      day: number;
      action_type: 'send_whatsapp';
      template_name: string;
      message_fallback: string;
      delay_hours: number;
    }>;
    target_criteria: SegmentCriterion[];
  }

Methods:
- getColdLeads(institutionId: string, daysSinceContact: number, limit?: number): Promise<Lead[]>
  → Leads WHERE last_contacted_at < NOW() - interval 'X days'
  → AND funnel_stage NOT IN ('enrolled', 'lost')
  → AND wa_opt_in = true
  → ORDER BY last_contacted_at ASC (oldest first)

- getPredefinedSequences(): SequenceTemplate[]
  → Returns 3 pre-built sequences:
    1. "Gentle Re-engagement" (3 steps over 7 days):
       Day 0: jkkn_followup template
       Day 3: jkkn_campus_visit template
       Day 7: jkkn_counselor_intro template
    2. "Deadline Urgency" (2 steps over 3 days):
       Day 0: jkkn_deadline_alert template
       Day 3: jkkn_fee_reminder template
    3. "Scholarship Nudge" (1 step):
       Day 0: jkkn_scholarship_info template

- launchReengagementCampaign(params: {
    institutionId: string;
    sequenceTemplate: SequenceTemplate;
    leadIds: string[];
    createdBy: string;
  }): Promise<{ sequencesCreated: number; errors: string[] }>
  → For each lead, creates a DripSequence via DripExecutorService.startDripSequence()
  → With send_whatsapp action steps
  → Returns count of sequences created

- getReengagementStats(institutionId: string): Promise<{
    total_cold_leads: number;
    active_sequences: number;
    reengaged_count: number;
    conversion_rate: number;
  }>
```

### UI Changes

**Modify:** `app/(routes)/admission/re-engagement/page.tsx`

Add "WhatsApp Sequences" tab to the existing re-engagement page:
- Predefined sequence cards with description, steps preview, and "Launch" button
- "Launch" opens a dialog:
  - Select target: "All Cold Leads (X)" or "Use Segment"
  - Preview lead count
  - Confirm to launch
- Active sequences list with progress bars (step X of Y completed)
- Stats: Active Sequences, Re-engaged Count, Conversion Rate

### No new API routes — uses existing drip executor routes for sequence management.

---

## 3.5 Multiple WABA Number Support (Gap 12)

**Problem:** Single `WHATSAPP_PHONE_NUMBER_ID` env var. JKKN has 9 institutions — each may need its own WhatsApp number for branding and volume scaling.

### Migration

**File:** `supabase/migrations/20260222100004_create_wa_phone_numbers.sql`

```sql
-- ============================================
-- WhatsApp Gap Fill: Multiple WABA Numbers
-- Gap 12 — P2 Valuable
-- ============================================

CREATE TABLE IF NOT EXISTS public.wa_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL,         -- Meta's phone_number_id
  business_account_id TEXT NOT NULL,     -- Meta's WABA ID
  display_number TEXT NOT NULL,          -- Human-readable phone number
  verified_name TEXT,                    -- Meta-verified business name
  quality_rating TEXT DEFAULT 'GREEN',   -- GREEN | YELLOW | RED
  messaging_limit TEXT DEFAULT 'TIER_1K',-- TIER_1K | TIER_10K | TIER_100K | UNLIMITED
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Access token stored per number (different WABA may have different tokens)
  access_token_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_wa_phone_number UNIQUE(phone_number_id)
);

ALTER TABLE public.wa_phone_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_phone_numbers_access" ON public.wa_phone_numbers;
CREATE POLICY "wa_phone_numbers_access" ON public.wa_phone_numbers
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_wa_phone_numbers_institution ON public.wa_phone_numbers(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_phone_numbers_phone_id ON public.wa_phone_numbers(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_wa_phone_numbers_active ON public.wa_phone_numbers(is_active) WHERE is_active = true;
```

### Service Changes

**Modify:** `app/api/webhooks/whatsapp/route.ts`

Replace the `resolveInstitutionId()` function to look up the `wa_phone_numbers` table:

```typescript
async function resolveInstitutionId(phoneNumberId: string): Promise<string | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('wa_phone_numbers')
    .select('institution_id')
    .eq('phone_number_id', phoneNumberId)
    .eq('is_active', true)
    .single();

  if (data) return data.institution_id;

  // Fallback to env var for backward compatibility
  if (phoneNumberId === process.env.WHATSAPP_PHONE_NUMBER_ID) {
    // Resolve to first institution (existing behavior)
    const { data: first } = await supabase.from('institutions').select('id').limit(1).single();
    return first?.id || null;
  }

  return null;
}
```

**Modify:** `lib/services/whatsapp/whatsapp-api-client.ts`

Add institution-aware factory method:

```typescript
static async forInstitution(institutionId: string): Promise<WhatsAppCloudAPIClient> {
  // 1. Look up wa_phone_numbers for this institution (is_primary = true, is_active = true)
  // 2. If found, create client with that number's phone_number_id and access_token
  // 3. If not found, fall back to env var credentials (existing behavior)
  // This allows different institutions to use different WABA numbers
}
```

### UI

**New page:** `app/(routes)/admission/settings/whatsapp-numbers/page.tsx`

WhatsApp number management (admin-only):
- List of configured numbers per institution
- Fields: display number, verified name, quality rating, messaging limit, primary toggle
- Add number form: phone_number_id, business_account_id, access_token, display_number
- Remove number (with confirmation)
- Primary number selector (one per institution)
- Quality rating and messaging limit badges (GREEN/YELLOW/RED)

---

## 3.6 Echo Bubble — Floating Chat Widget (Gap 13)

**Problem:** Counselors must navigate to the chat page to see new messages. Need a persistent notification + quick-reply widget.

**No migration needed.**

### UI

**New component:** `components/admission/echo-bubble.tsx`

```
EchoBubble — Floating chat widget for counselors

Behavior:
- Renders as a fixed-position circle (bottom-right, 56x56px) on ALL admission pages
- Shows unread count badge (red circle with number, pulsing animation if > 0)
- Minimized state: Just the badge
- Expanded state (on click): Mini chat panel (320x480px) with:
  - Header: "WhatsApp Chat" + minimize button
  - Conversation list (recent 10, sorted by last_message_at)
  - Unread indicator per conversation
  - Click conversation → inline message view + reply input
  - Quick reply using existing useQuickReplies hook
  - "Open Full Chat" link → navigates to /admission/chat

Data sources:
- useChatStats() → for unread count
- useConversations({ assigned_to: currentUser, status: 'open' }) → for conversation list
- useChatRealtime() → for live updates
- useChatMutations() → for sending replies

Mount point: app/(routes)/admission/layout.tsx
  → Add <EchoBubble /> at the bottom of the layout (after children)
  → Only renders if user has 'admission' module permission
```

---

## 3.7 Funnel View in Chat (Gap 14)

**Problem:** Counselors cannot see which admission stage each conversation's lead is in without clicking the profile sidebar.

**No migration needed.** Lead stage is already available via the joined `lead` relation on conversations.

### UI Changes

**Modify:** `app/(routes)/admission/chat/_components/conversation-list.tsx`

1. Add funnel stage colored dot next to each conversation:
   - Use the same color scheme as the admission funnel elsewhere in MyJKKN:
     new (blue), contacted (cyan), qualified (green), applied (purple), offered (orange), enrolled (emerald), lost (red)
   - Small colored circle (8px) inline with the contact name

2. Add stage filter dropdown:
   - "All Stages" | "New" | "Contacted" | "Qualified" | "Applied" | "Offered" | "Enrolled"
   - Filters conversations by lead.funnel_stage

3. Optional Kanban toggle:
   - Toggle button to switch between "List" and "Kanban" view
   - Kanban view: Horizontal columns per funnel stage, conversations as cards
   - Each column shows count

### Hook Changes

**Modify:** `hooks/admission/use-conversations.ts`

Add `funnel_stage` to the `ConversationFilters` interface. The API route already supports filtering by joined lead data.

---

## 3.8 Conversation Cost Tracking (Gap 15)

**Problem:** The `communication_cost_log` table exists (migration `20260222000012`) and the `use-communication-costs.ts` hook is built, but WhatsApp conversations are not logging costs.

**No migration needed.** Tables and hooks exist.

### Service Changes

**Modify:** `lib/services/whatsapp/whatsapp-chat-service.ts`

In `sendMessage()` and `sendTemplateMessage()`, after successful send, log cost:

```typescript
// After successful WA send, log cost
try {
  const supabase = getServiceClient();
  await supabase.from('communication_cost_log').insert({
    institution_id: conversation.institution_id,
    channel: 'whatsapp',
    event_type: messageType === 'template' ? 'template_send' : 'session_send',
    unit_cost: messageType === 'template' ? 0.47 : 0.00,
    // Template (business-initiated) costs ~INR 0.47, session messages are free within 24hr window
    quantity: 1,
    reference_id: msg.id,
    metadata: { conversation_id: conversationId, template_name: templateName || null },
  });
} catch { /* Non-critical — don't fail the send */ }
```

**Modify:** `app/api/webhooks/whatsapp/route.ts`

When processing `statuses` events that include `pricing` data from Meta, extract and log actual cost:

```typescript
// In the statuses processing section:
if (statusUpdate.pricing) {
  const costMap: Record<string, number> = {
    business_initiated: 0.47,  // INR approximate
    user_initiated: 0.28,
    referral_conversion: 0.00,
    utility: 0.20,
    authentication: 0.15,
    marketing: 0.75,
    service: 0.00,
  };
  const estimatedCost = costMap[statusUpdate.pricing.category] || 0.50;

  await supabase.from('communication_cost_log').insert({
    institution_id: institutionId,
    channel: 'whatsapp',
    event_type: statusUpdate.pricing.category || 'unknown',
    unit_cost: estimatedCost,
    quantity: 1,
    reference_id: statusUpdate.id,
    metadata: { pricing_model: statusUpdate.pricing.pricing_model, billable: statusUpdate.pricing.billable },
  });
}
```

### UI Changes

**Modify:** `app/(routes)/admission/chat/page.tsx`

Add a cost widget to the header stats area (next to Open/Waiting/Unread badges):

```
Today: INR X.XX | This Month: INR Y.YY
```

This uses the existing `use-communication-costs.ts` hook — the data will appear automatically once costs are being logged.

---

# SUMMARY TABLES

## All New Migrations

| # | Migration File | Tables/Changes | Phase | Gap |
|---|---|---|---|---|
| 1 | `20260222100001_add_wa_consent_tracking.sql` | ALTER `admission_leads` + CREATE `wa_consent_log` | 1 | 2 |
| 2 | `20260222100002_create_wa_audience_segments.sql` | CREATE `wa_audience_segments` | 2 | 6 |
| 3 | `20260222100003_create_wa_document_catalog.sql` | CREATE `wa_document_catalog` | 3 | 9 |
| 4 | `20260222100004_create_wa_phone_numbers.sql` | CREATE `wa_phone_numbers` | 3 | 12 |

## All New Service Files

| # | Service File | Purpose | Phase | Gap |
|---|---|---|---|---|
| 1 | `lib/services/whatsapp/whatsapp-consent-service.ts` | Opt-in consent tracking + compliance | 1 | 2 |
| 2 | `lib/services/whatsapp/whatsapp-routing-service.ts` | Smart routing + message categorization | 1 | 3 |
| 3 | `lib/services/whatsapp/whatsapp-segment-service.ts` | Audience segmentation builder | 2 | 6 |
| 4 | `lib/services/whatsapp/whatsapp-template-analytics-service.ts` | Per-template engagement analytics | 2 | 7 |
| 5 | `lib/services/whatsapp/whatsapp-document-catalog-service.ts` | Document catalog for chat sharing | 3 | 9 |
| 6 | `lib/services/whatsapp/whatsapp-counselor-analytics-service.ts` | Counselor performance metrics | 3 | 10 |
| 7 | `lib/services/whatsapp/whatsapp-reengagement-service.ts` | Re-engagement workflows | 3 | 11 |

## All Modified Service Files

| # | Service File | Modifications | Phase | Gap |
|---|---|---|---|---|
| 1 | `lib/services/admission/drip-executor-service.ts` | Wire send_whatsapp case + consent check | 1 | 1, 2 |
| 2 | `lib/services/admission/whatsapp-campaign-service.ts` | Add consent check before sending | 1 | 2 |
| 3 | `lib/services/whatsapp/whatsapp-chat-service.ts` | Auto-consent on inbound, STOP keywords, smart routing hook, 24hr window method, window enforcement, cost logging | 1, 2, 3 | 2, 3, 4, 15 |
| 4 | `lib/services/whatsapp/whatsapp-template-service.ts` | Batch quality refresh, starter templates | 2, 3 | 5, 8 |
| 5 | `lib/services/whatsapp/whatsapp-api-client.ts` | Institution-aware factory method | 3 | 12 |
| 6 | `app/api/webhooks/whatsapp/route.ts` | Multi-WABA routing, cost extraction | 3 | 12, 15 |

## All New API Routes

| # | Route File | Methods | Phase | Gap |
|---|---|---|---|---|
| 1 | `app/api/admission/chat/consent/route.ts` | GET, POST | 1 | 2 |
| 2 | `app/api/admission/chat/consent/stats/route.ts` | GET | 1 | 2 |
| 3 | `app/api/admission/chat/templates/refresh-quality/route.ts` | POST | 2 | 5 |
| 4 | `app/api/admission/campaigns/segments/route.ts` | GET, POST | 2 | 6 |
| 5 | `app/api/admission/campaigns/segments/[id]/route.ts` | GET, PUT, DELETE | 2 | 6 |
| 6 | `app/api/admission/campaigns/segments/preview/route.ts` | POST | 2 | 6 |
| 7 | `app/api/admission/campaigns/segments/[id]/resolve/route.ts` | POST | 2 | 6 |
| 8 | `app/api/admission/chat/templates/analytics/route.ts` | GET | 2 | 7 |
| 9 | `app/api/admission/chat/documents/route.ts` | GET, POST | 3 | 9 |
| 10 | `app/api/admission/chat/documents/[id]/route.ts` | GET, PUT, DELETE | 3 | 9 |
| 11 | `app/api/admission/chat/documents/[id]/share/route.ts` | POST | 3 | 9 |
| 12 | `app/api/admission/chat/counselor-performance/route.ts` | GET | 3 | 10 |

## All New UI Pages/Components

| # | Path | Purpose | Phase | Gap |
|---|---|---|---|---|
| 1 | `app/(routes)/admission/campaigns/segments/page.tsx` | Segment builder + saved segments | 2 | 6 |
| 2 | `app/(routes)/admission/templates/analytics/page.tsx` | Template engagement analytics | 2 | 7 |
| 3 | `app/(routes)/admission/templates/documents/page.tsx` | Document catalog management | 3 | 9 |
| 4 | `app/(routes)/admission/chat/performance/page.tsx` | Counselor performance dashboard | 3 | 10 |
| 5 | `app/(routes)/admission/settings/whatsapp-numbers/page.tsx` | Multi-WABA number management | 3 | 12 |
| 6 | `components/admission/echo-bubble.tsx` | Floating chat widget | 3 | 13 |

## All Modified UI Files

| # | Path | Modifications | Phase | Gap |
|---|---|---|---|---|
| 1 | `chat/_components/lead-profile-sidebar.tsx` | Consent badge + grant/revoke buttons | 1 | 2 |
| 2 | `chat/_components/chat-thread.tsx` | Consent warning, 24hr window banner, template quality badges, document sharing button | 1, 2, 3 | 2, 4, 5, 9 |
| 3 | `chat/_components/conversation-list.tsx` | Category filter chips, priority dots, funnel stage dots, stage filter | 1, 3 | 3, 14 |
| 4 | `chat/page.tsx` | Cost widget in header | 3 | 15 |
| 5 | `re-engagement/page.tsx` | WhatsApp Sequences tab | 3 | 11 |
| 6 | `admission/layout.tsx` | Mount EchoBubble component | 3 | 13 |

## All New Hooks

| # | Hook File | Purpose | Phase | Gap |
|---|---|---|---|---|
| 1 | `hooks/admission/use-wa-consent.ts` | Consent status + grant/revoke mutations | 1 | 2 |
| 2 | `hooks/admission/use-wa-segments.ts` | Segment CRUD + preview + resolve | 2 | 6 |
| 3 | `hooks/admission/use-template-analytics.ts` | Template engagement data + timeline | 2 | 7 |
| 4 | `hooks/admission/use-wa-document-catalog.ts` | Document catalog CRUD + share | 3 | 9 |
| 5 | `hooks/admission/use-counselor-performance.ts` | Counselor metrics + timeline | 3 | 10 |

## Modified Hooks

| # | Hook File | Changes | Phase | Gap |
|---|---|---|---|---|
| 1 | `hooks/admission/use-communication-templates.ts` | Add refreshQuality mutation | 2 | 5 |
| 2 | `hooks/admission/use-conversations.ts` | Add funnel_stage to filters | 3 | 14 |

## No New Dependencies Required

All features use existing packages already in `package.json`:
- `axios` (API calls)
- `@tanstack/react-query` (data fetching)
- `recharts` (charts)
- `shadcn/ui` components (UI)
- `lucide-react` (icons)
- `@supabase/supabase-js` (database)

## Environment Variables

No new env vars required. All features use existing `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` from `.env`. Multi-WABA (Gap 12) stores per-institution credentials in the database instead of env vars.

---

## Gap 16: WhatsApp Commerce/Catalog

**Status:** Research phase only — not included in this spec.

WhatsApp now supports product catalogs and payment links via the Commerce API. This could enable fee payment directly within WhatsApp conversations. Requires:
- Meta Commerce Manager setup
- Product catalog creation (programs as "products")
- Payment gateway integration (Razorpay/PayU)
- WhatsApp Payments API (India-specific)

This is a separate initiative that should be explored once the core 15 gaps above are implemented and the WhatsApp channel is production-ready.
