# Exhibition Lead Bridge — Architecture & Current State

## System Map

```
┌──────────────────────────────────────────────────────────────────────┐
│                         EXISTING SYSTEMS                             │
│                                                                      │
│  ┌─────────────────────┐              ┌──────────────────────────┐   │
│  │ EXPO MANAGEMENT     │              │ ADMISSION CRM            │   │
│  │ (DB only, no UI)    │              │ (Full UI + services)     │   │
│  │                     │              │                          │   │
│  │ expo_masters        │              │ admission_leads (78 cols)│   │
│  │ expo_events (21)    │   ← BRIDGE → │   has expo_event_id ✓   │   │
│  │ expo_event_team_    │   MISSING    │   has referral fields ✓  │   │
│  │   members           │              │   has captured_by? ✗     │   │
│  │ expo_daily_reports  │              │                          │   │
│  │                     │              │ admission_counselors     │   │
│  │ event_checklists    │              │ admission_lead_activities│   │
│  │ event_registrations │              │ admission_workflows      │   │
│  │ event_staff_assign  │              │ admission_drip_sequences │   │
│  └─────────────────────┘              └──────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────┐              ┌──────────────────────────┐   │
│  │ REFERRAL SYSTEM     │              │ CONSULTANT SYSTEM        │   │
│  │                     │              │                          │   │
│  │ referral_rewards    │              │ education_consultants    │   │
│  │ referral_reward_    │              │ consultant_commission_*  │   │
│  │   configs           │              │ consultant_lead_attrib   │   │
│  └─────────────────────┘              └──────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

## What EXISTS vs What's MISSING

### Already in Database (No Schema Changes Needed)

| What | Where | Status |
|------|-------|--------|
| `expo_event_id` on admission_leads | `admission_leads.expo_event_id` (uuid) | **EXISTS in production** |
| Referral fields on leads | `referral_type`, `referred_by_id`, `referred_by_name` | **EXISTS** |
| Expo events with real data | `expo_events` — 21 events, 170 team members | **EXISTS, being used TODAY** |
| Daily expense reports structure | `expo_daily_reports` — expenses, visitors, leads count | **EXISTS (empty — no reports submitted yet)** |
| Team member assignments | `expo_event_team_members` — staff + student volunteers | **EXISTS with real assignments** |
| Referral rewards infrastructure | `referral_rewards`, `referral_reward_configs` | **EXISTS** |
| Consultant commissions | `consultant_commission_structures`, `consultant_commission_transactions` | **EXISTS** |

### Missing (Need to Build)

| What | Why |
|------|-----|
| **Capture form UI** | No page exists for booth team to enter leads |
| **Expo services** | No `lib/services/admission/expo-*` service files |
| **Expo hooks** | No `hooks/admission/use-expo-*` hook files |
| **Expo API routes** | No `app/api/admission/expo/*` routes |
| **QR code generator** | No way to generate per-event QR |
| **Live dashboard** | No real-time lead counter for events |
| **ROI analytics** | No cost-per-lead or event comparison page |
| **`captured_by` column** | Missing from `admission_leads` — need to add |
| **Auto-pipeline on capture** | No trigger that auto-assigns counselor + schedules follow-up |
| **Expo pages in MyJKKN** | The expo_events data is entered via another system or directly in DB |

## Key Schema Discovery (CORRECTED 2026-03-28)

**⚠️ Staging and Production have DIFFERENT schemas:**

| Field | Staging (65 cols) | Production (78 cols) |
|-------|:-:|:-:|
| `expo_event_id` | **MISSING** | Exists |
| `referral_type` | **MISSING** | Exists |
| `referred_by_id` | **MISSING** | Exists |
| `referred_by_name` | **MISSING** | Exists |
| `referrer_id` | **MISSING** | Exists |
| `first_name` / `last_name` | **MISSING** | Exists |
| `program_id` / `degree_id` | **MISSING** | Exists |
| Expo tables (15) | **ZERO** | 15 tables with real data |

**The developer must add 17 columns to staging's admission_leads AND create 15 expo/event tables on staging before any code will work.** See `06-PRODUCTION-DELTA.md` for the exact list.

## Current Module Flow (Expo Management)

```
CURRENT (no UI in MyJKKN):
  Someone → enters expo_events directly in DB/other tool
  Someone → assigns team members in expo_event_team_members
  No one → submits daily reports (table empty)
  No one → captures leads linked to events (expo_event_id unused)

TARGET (after bridge):
  Admission Manager → creates/views events in MyJKKN UI
  Team Leader → generates QR code, shares with team
  Learner Ambassador → logs in on phone → rapid capture form → enters visitor info
  System → auto-creates lead with expo_event_id + referred_by_id
  System → auto-assigns counselor + schedules follow-up
  System → sends WhatsApp (when API ready)
  Team Leader → views live dashboard + submits daily report
  Admission Manager → views ROI analytics
```

## Connected Modules

| Module | How It Connects to Expo Bridge |
|--------|-------------------------------|
| **Leads Management** | New leads created with `expo_event_id` appear in lead list with source = `education_fair` |
| **Counselors** | Auto-assigned via existing assignment rules or round-robin |
| **Campaigns/Drip** | Can trigger exhibition-specific drip sequences on capture |
| **Consultants/Referrals** | Learner ambassadors are tracked like referrers with lower commission |
| **Analytics** | Exhibition leads tracked in funnel analytics as a separate source |
| **WhatsApp Chat** | Auto-welcome message to captured leads (when API ready) |
| **Startup Studio Events** | Different module entirely — `startup_events` table, NOT `expo_events`. No overlap. |
| **Learners Council Events** | Different module — `learners_council` events. No overlap. |

## Auth Pattern for New Routes

All new expo API routes should use `withAuth` (except capture form if we decide to make it semi-public):

```typescript
// For capture route: authenticated (team member logged in)
export const POST = withAuth(async (request, auth) => {
  const body = await request.json();
  const result = await ExpoCaptureService.captureLead({
    ...body,
    expo_event_id: body.expo_event_id,
    referred_by_id: auth.user.id,  // The ambassador who captured
    referral_type: 'learner_ambassador',
    source: body.zone === 'ai' ? 'ai_experience_zone' : 'education_fair',
    institution_id: auth.institutionId,
  });
  return createdResponse(result);
});
```
