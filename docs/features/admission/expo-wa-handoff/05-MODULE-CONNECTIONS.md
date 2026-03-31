# Module Connections — How Expo + WhatsApp + CRM Connect

## Connection Diagram

```
EXHIBITION BOOTH
      │
      ▼
┌─────────────────┐
│ CAPTURE FORM     │  /capture/[eventId]
│ (5 fields, mobile)│
└────────┬────────┘
         │ POST /api/admission/capture
         ▼
┌─────────────────────────────────────────────────────────┐
│ expo-capture-service.ts                                  │
│                                                          │
│  1. Check duplicate phone                                │
│  2. Create admission_lead (expo_event_id, referred_by_id)│
│  3. Increment expo_events.total_leads_collected          │
│  4. Log activity (admission_lead_activities)              │
│  5. Auto-assign counselor (round-robin)                  │
│  6. Auto-schedule follow-up (next business day 10 AM)    │
│  7. [TODO] Send WhatsApp welcome (exhibition_thankyou)   │
└────────┬────────────────────────────────────┬───────────┘
         │                                     │
         ▼                                     ▼
┌─────────────────┐              ┌──────────────────────┐
│ ADMISSION CRM    │              │ WHATSAPP              │
│                  │              │                       │
│ Lead appears in  │              │ exhibition_thankyou   │
│ lead list with:  │              │ template sent to      │
│ - source: expo   │              │ parent phone          │
│ - event linked   │              │                       │
│ - counselor set  │              │ Counselor can then    │
│ - follow-up date │              │ continue conversation │
│                  │              │ in chat inbox         │
└─────────────────┘              └──────────────────────┘
```

## Data Flow: Lead Creation

```sql
-- When booth team captures a lead:
INSERT INTO admission_leads (
  institution_id,          -- From auth
  first_name, last_name,   -- Parsed from learner_name
  phone,                   -- 10-digit normalized
  parent_name, parent_phone,
  interested_programs,     -- Array of program IDs
  program_id,              -- First selected program
  source,                  -- 'education_fair' or 'ai_experience_zone'
  expo_event_id,           -- Links to expo_events
  referral_type,           -- 'learner_ambassador'
  referred_by_id,          -- Auth user (the ambassador)
  referred_by_name,        -- Ambassador's display name
  funnel_stage,            -- 'new'
  tags                     -- ['exhibition-capture']
);
```

## Cross-Module Impact

| When This Happens | These Modules React |
|---|---|
| Lead captured at expo | CRM: lead appears in list. Dashboard: count increments. Leaderboard: ambassador rank updates. |
| WhatsApp welcome sent | CRM: activity logged. Cost: communication_cost_log entry. |
| Lead replies to WhatsApp | Chat: conversation created. Routing: intent categorized. Counselor: notification. |
| Counselor sends follow-up | Chat: message logged. Drip: sequence continues. Cost: tracked. |
| Lead applies | Analytics: expo→application attribution. ROI: cost-per-conversion calculated. |

## Shared Tables

| Table | Used By |
|-------|---------|
| `admission_leads` | Expo capture, CRM, WhatsApp chat, campaigns, analytics |
| `admission_counselors` | Expo auto-assign, WhatsApp routing, CRM |
| `admission_lead_activities` | Expo logging, CRM timeline, WhatsApp activity |
| `institutions` | All modules (multi-tenant) |
| `profiles` | Auth for all modules |
| `programs` | Expo capture (program selection), CRM, analytics |

## WhatsApp Cross-Module Routing

WhatsApp serves ALL modules, not just admission. Inbound messages are categorized:

| Intent Category | Routed To | Example Message |
|----------------|-----------|-----------------|
| `fee_inquiry` | Billing team | "When is my fee due?" |
| `program_inquiry` | Admission counselor | "Tell me about B.Pharm" |
| `admission_status` | Assigned counselor | "What's my application status?" |
| `complaint` | Escalation queue | "I have a problem with hostel" |
| `callback_request` | Available counselor | "Please call me" |
| `hostel_query` | Campus living team | "Is hostel available?" |
| `document_submission` | Document team | "I'm sending my certificates" |
| `general` | Default counselor | Everything else |

This routing is handled by `whatsapp-routing-service.ts` (390 lines).
