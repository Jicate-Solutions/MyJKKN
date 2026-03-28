# Exhibition Lead Capture & Conversion Bridge — Specification (v2)

> Generated: 2026-03-27 | **Revised after deep interview** | Branch: `omm-dev`
> Priority: **URGENT** — 9 events running this week, 170 team deployed, 0 digital capture

---

## Problem Statement

JKKN deploys 7-10 team members (student learner ambassadors + 1-2 senior staff) at education exhibitions across Tamil Nadu. The expo management system (`expo_events`, 21 events, 4 organizers) and admission CRM (`admission_leads`, 81 leads) both exist but are completely disconnected.

**What happens today:** Team members at booths capture visitor interest on paper or not at all. `total_leads_collected = 0` on all 21 events. 76% of walk-in leads are never contacted. Average time to first contact: 11 hours (the golden window is 30 minutes).

**Root cause:** No digital bridge between the booth encounter and the CRM. Intent decays exponentially — by the time paper forms are entered (if ever), the visitor has forgotten which booth was JKKN.

**The key insight from production data:** Referrals convert at 78% while walk-ins convert at 16%. The difference? A referrer has skin in the game. This spec turns learner ambassadors into pseudo-referrers by tracking who captured each lead and incentivizing conversion — replicating the referral success pattern with automation.

---

## What This Builds

A bridge connecting `expo_events` → `admission_leads` with 5 components:

1. **Rapid Capture Form** — Authenticated, mobile-first, team-member-operated, bilingual (Tamil + English), rapid-fire mode
2. **Learner Ambassador Referral Tracking** — captured_by field + extension of existing referral_rewards system
3. **Auto-Pipeline Trigger** — WhatsApp welcome (when API ready) + counselor assignment + follow-up scheduling
4. **Live Event Dashboard** — Real-time lead counter for team leaders
5. **Event ROI Analytics** — Cost per lead, cost per conversion, organizer comparison

---

## Success Criteria

1. Team member captures a lead in **<30 seconds** (form submit + instant reset for next visitor)
2. Lead appears in CRM within 5 seconds, tagged with event + captured_by
3. `expo_events.total_leads_collected` increments automatically
4. Counselor auto-assigned within 5 minutes
5. Follow-up auto-scheduled for next business day
6. Live dashboard shows lead count (real-time)
7. Learner ambassador sees their personal capture count
8. Works on mobile browsers (Android phones, mostly)
9. Works offline (queues locally, syncs when online)
10. Bilingual form labels (Tamil + English)

---

## User Roles

| Role | Who | What They Do |
|------|-----|-------------|
| **Learner Ambassador** | Student volunteer at booth (3-4 per stall) | Logs in on own phone, captures visitor info, sees personal count |
| **AI Zone Volunteer** | Student at AI Experience Zone (3-4 per stall) | Same capture flow, tagged as "AI zone" source |
| **Team Leader** | Senior learner or staff member | Views live lead count, submits daily report, manages team |
| **Admission Manager** | Campus-based admission head | Views all events, ROI analytics, monitors conversion pipeline |
| **Super Admin** | Cross-institution admin | All of the above, across institutions |

---

## Screens / Pages

### Screen 1: Rapid Capture Form (Authenticated — Team Member)

- **URL**: `/admission/capture/[eventId]`
- **Who sees it**: Logged-in team members assigned to this event
- **Auth**: MyJKKN login required (each volunteer uses their own phone)
- **Mobile-first**: Designed for one-thumb Android operation
- **Language**: Tamil + English bilingual labels

**Form fields (rapid mode — 5 core fields):**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Learner Name | Text | Yes | Visitor's name |
| Phone | Tel | Yes | Indian 10-digit, auto-format |
| Parent/Guardian Name | Text | Yes | Parents decide in Indian education |
| Parent Phone | Tel | Yes | May be same as learner phone |
| Programs Interested | Multi-select chips | Yes | Tap to select 1-3 programs, first = primary |

**Optional expandable section** (team member taps "More details" if visitor has time):
- Email
- District/City
- 12th marks/percentage
- Current school/college
- How did you hear about JKKN?
- Capture zone: Regular Stall / AI Experience Zone

**UX Flow:**
1. Team member opens form (pre-loaded with event context + their name as captured_by)
2. Enters visitor info (30 seconds)
3. Taps "Save & Next" → toast shows "Lead #[N] saved!" for 2 seconds → form resets instantly
4. Repeat for next visitor
5. Bottom bar shows: "You: 12 leads | Team: 47 leads" (personal + team count)

**Behind the scenes on submit:**
1. `INSERT admission_lead` with `source='education_fair'`, `expo_event_id`, `captured_by` (team member's user ID)
2. `UPDATE expo_events SET total_leads_collected = total_leads_collected + 1`
3. `INSERT admission_lead_activities` (type='captured_at_event')
4. If duplicate phone: update existing lead, add this event as additional touchpoint, keep original captured_by
5. Enqueue auto-pipeline (counselor assignment + follow-up + WhatsApp when ready)

**Edge cases:**
- **Offline**: Form queues submissions in IndexedDB. Shows "3 pending sync" badge. Auto-syncs when online.
- **Duplicate phone**: "This number was captured on [date]. Update interest?" → adds programs, doesn't create duplicate
- **Event not assigned**: If logged-in user isn't in this event's team → "You're not assigned to this event. Contact your team leader."
- **Event expired**: Past end_date → "This event has ended. Use [current event] instead."
- **Rush mode**: Form remembers the last "zone" selection so it doesn't need re-tapping

### Screen 2: QR Code & Link Generator

- **URL**: `/admission/events/[eventId]/qr`
- **Who sees it**: Team Leader, Admission Manager
- **What it shows**:
  - QR code that points to the capture form for this event
  - Event name, date, venue
  - "Download QR" (high-res PNG for printing on standee)
  - "Share Link" (copy URL for WhatsApp group)
  - Team member count and list

**Use case**: Team leader prints QR on standee. But primary use is the **link shared in the team's WhatsApp group** — each member opens it on their phone, logs in, and starts capturing.

### Screen 3: Live Event Dashboard

- **URL**: `/admission/events/[eventId]/live`
- **Who sees it**: Team Leader, Admission Manager
- **What it shows**:
  - **Hero counter**: Total leads today (large animated number)
  - **Leaderboard**: Which team member captured how many (gamification!)
  - **Programs chart**: Which programs are most popular at this venue
  - **Leads by hour**: Activity pattern chart
  - **Recent captures**: Last 10 leads (auto-refreshes via Supabase Realtime)
  - **Zone breakdown**: Regular Stall vs AI Experience Zone
  - **Daily report quick-fill**: Link to submit `expo_daily_reports` with pre-filled lead count

**The leaderboard is intentional**: Student volunteers are competitive. Showing "Priyanka: 14, Sathish: 11, Soundharya: 9" drives more captures.

### Screen 4: Event ROI Analytics

- **URL**: `/admission/events/analytics`
- **Who sees it**: Admission Manager, Super Admin
- **What it shows**:
  - **Event comparison table**: Event name, city, date, team size, expenses (from `expo_daily_reports`), leads captured, leads contacted, leads converted, cost per lead, cost per conversion
  - **Organizer comparison**: VIJAY INFO MEDIA vs SMART EVENTZ vs OMEGA vs APEX — which delivers best ROI?
  - **City heatmap**: Which cities produce most conversions
  - **Ambassador leaderboard**: Top 10 learner ambassadors by total captures across all events + conversion rate
  - **Funnel by event**: new → contacted → interested → application → enrolled per event
  - **Time-to-contact comparison**: Exhibition leads vs walk-ins vs referrals

### Screen 5: Events List Enhancement (Existing page)

- **URL**: Existing expo events list page
- **Add columns**: Leads count (live), QR Code button, Live Dashboard link
- **Add badges**: "Active now" for today's events, "Starts in 3 days" countdown

---

## Data Model Changes

### Modify: `admission_leads` (2 new columns)

```sql
ALTER TABLE admission_leads
  ADD COLUMN expo_event_id uuid REFERENCES expo_events(id),
  ADD COLUMN captured_by uuid REFERENCES profiles(id);

CREATE INDEX idx_admission_leads_expo_event ON admission_leads(expo_event_id) WHERE expo_event_id IS NOT NULL;
CREATE INDEX idx_admission_leads_captured_by ON admission_leads(captured_by) WHERE captured_by IS NOT NULL;
```

### Modify: `LeadSource` type

Add `'ai_experience_zone'` as a new source type alongside `'education_fair'`:

```typescript
export type LeadSource =
  | 'website' | 'walk_in' | 'referral' | 'social_media'
  | 'newspaper' | 'education_fair' | 'ai_experience_zone'  // NEW
  | 'agent' | 'publisher' | 'google_ads' | 'facebook_ads' | 'other';
```

### New Table: `expo_lead_capture_links`

```sql
CREATE TABLE expo_lead_capture_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  expo_event_id uuid NOT NULL REFERENCES expo_events(id),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  short_code text UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  scan_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
ALTER TABLE expo_lead_capture_links ENABLE ROW LEVEL SECURITY;
```

### Extend: Referral Rewards (for Learner Ambassadors)

Use existing `referral_rewards` / `referral_reward_configs` tables. Add a new reward tier:

```
Type: 'learner_ambassador'
Commission: lower than consultants (institution bears booth + travel costs)
Trigger: when a lead captured_by this ambassador reaches 'enrolled' stage
```

No new table needed — the existing referral infrastructure handles this.

---

## Auto-Pipeline (On Lead Capture)

```
1. [0 sec]    INSERT admission_lead (expo_event_id, captured_by, source)
2. [0 sec]    UPDATE expo_events.total_leads_collected++
3. [0 sec]    INSERT activity: "Captured at [event] in [city] by [ambassador name]"
4. [5 min]    AUTO-ASSIGN counselor (primary program's institution counselor, or round-robin)
5. [5 min]    SCHEDULE follow-up: next business day 10:00 AM
6. [5 min]    NOTIFY counselor: "New exhibition lead: [name] interested in [programs]"
```

**When WhatsApp API is ready (Phase 2), add:**
```
7. [30 sec]   SEND WhatsApp to visitor: "நன்றி! JKKN [event]-ல் சந்தித்ததற்கு... / Thank you for visiting JKKN at [event]..."
8. [24 hrs]   SEND WhatsApp: Program brochure + campus video
9. [72 hrs]   SEND WhatsApp to PARENT phone: Placement records, fee structure
10. [7 days]  If no response → alert counselor for manual follow-up
```

---

## Scope Boundaries

### In Scope

- Authenticated rapid capture form (team member fills, mobile-first, offline-capable, bilingual)
- `expo_event_id` + `captured_by` columns on admission_leads
- Learner ambassador tracking + referral reward extension
- Live event dashboard with leaderboard
- QR code/link generation per event
- Event ROI analytics
- Auto counselor assignment + follow-up scheduling
- Enhancement to existing events list page

### Out of Scope (V1)

- WhatsApp API setup (separate task, will be added as Phase 2 when ready)
- Visitor self-service QR form (team member fills it, not visitor)
- Payment collection at booth
- Document upload at booth
- New referral reward configuration UI (use existing)
- Campus visit scheduling from booth
- Multi-language beyond Tamil + English

### Future Considerations (V2+)

- Visitor self-service QR scan for pre-registration
- AI chatbot at booth (for AI Experience Zone)
- Geo-fencing to auto-detect which event the team member is at
- Photo capture of visitor (for identification)
- Digital brochure sharing via NFC/Bluetooth

---

## Technical Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Auth on capture form | **Authenticated (MyJKKN login)** | Need to track captured_by for referral incentives |
| Form operator | **Team member fills it** (not visitor) | 30-second capture window, team member types faster |
| Submit UX | **Toast + instant reset** | Rapid-fire mode for rush periods |
| Offline | **IndexedDB queue + background sync** | Marriage hall WiFi is unreliable |
| Multi-program | **One lead, multi-select, first = primary** | Avoid duplicate leads across institutions |
| Language | **Tamil + English labels** | Tamil Nadu context, parents may not read English |
| Ambassador tracking | **captured_by column + existing referral_rewards** | Replicates referral conversion pattern |
| Rate limiting | **Authenticated = no IP rate limit needed** | Login prevents abuse |
| Duplicate detection | **Phone number match** | Phone is unique identifier in Indian education |
| Real-time dashboard | **Supabase Realtime subscription** | Already used in WhatsApp chat module |
| Zone tracking | **Source field: education_fair vs ai_experience_zone** | Different conversion patterns expected |

---

## Files to Create

| File | Purpose |
|------|---------|
| `app/(routes)/admission/capture/[eventId]/page.tsx` | Rapid capture form (authenticated) |
| `app/(routes)/admission/capture/[eventId]/layout.tsx` | Minimal layout (no sidebar, mobile-optimized) |
| `app/(routes)/admission/capture/[eventId]/_components/rapid-capture-form.tsx` | Form with Tamil+English, multi-select programs, rapid-fire mode |
| `app/(routes)/admission/capture/[eventId]/_components/offline-sync-badge.tsx` | Offline queue indicator |
| `app/(routes)/admission/capture/[eventId]/_components/capture-stats-bar.tsx` | Bottom bar: "You: 12 | Team: 47" |
| `app/(routes)/admission/events/[eventId]/qr/page.tsx` | QR code generator |
| `app/(routes)/admission/events/[eventId]/live/page.tsx` | Live event dashboard + leaderboard |
| `app/(routes)/admission/events/analytics/page.tsx` | Event ROI analytics |
| `app/api/admission/capture/route.ts` | POST: create lead (authenticated, withAuth) |
| `app/api/admission/capture/sync/route.ts` | POST: bulk sync offline-queued leads |
| `app/api/admission/events/[eventId]/stats/route.ts` | GET: live stats + leaderboard |
| `app/api/admission/events/[eventId]/qr/route.ts` | GET: generate QR link |
| `app/api/admission/events/analytics/route.ts` | GET: ROI data |
| `lib/services/admission/expo-capture-service.ts` | Lead creation + auto-pipeline + ambassador tracking |
| `hooks/admission/use-expo-capture.ts` | React Query hooks for capture, stats, leaderboard |
| `types/expo-capture.ts` | TypeScript interfaces |

## Files to Modify

| File | Change |
|------|--------|
| `types/admission.ts` | Add `expo_event_id`, `captured_by` to `AdmissionLead`, add `'ai_experience_zone'` to `LeadSource` |
| `lib/services/admission/lead-service.ts` | Handle `expo_event_id` + `captured_by` in create/filter |
| Existing events list page | Add leads count column, QR button, live dashboard link |

---

## Phasing

### Phase 1: Capture Bridge + Rapid Form (Day 1-2)

1. Add `expo_event_id` + `captured_by` columns on staging
2. Create `expo_lead_capture_links` table
3. Build authenticated rapid capture form
4. Build capture API route (withAuth)
5. Build expo-capture-service (create + increment + activity log)
6. Offline queue (IndexedDB + sync endpoint)
7. Personal + team lead count on form
8. **Test**: Log in as team member → capture lead → appears in CRM with event tag

### Phase 2: Auto-Pipeline + WhatsApp (Day 2-3)

9. Auto-assign counselor on capture
10. Auto-schedule follow-up
11. Set up WhatsApp Business API
12. Create Tamil+English message templates
13. Wire WhatsApp send on capture
14. Parent-targeted message on day 3
15. **Test**: Capture → WhatsApp to visitor + parent → counselor assigned

### Phase 3: Dashboard + Leaderboard (Day 3)

16. Build live event dashboard
17. Build leaderboard (who captured most)
18. Build QR code generator page
19. Add leads column to existing events list
20. Supabase Realtime subscription for live updates
21. **Test**: Capture lead → dashboard counter updates in real-time → leaderboard reflects

### Phase 4: ROI Analytics + Ambassador Rewards (Day 4)

22. Build event ROI analytics page
23. Connect `expo_daily_reports` expenses → `admission_leads` conversions
24. Organizer comparison, city heatmap
25. Ambassador leaderboard (cross-event)
26. Extend referral_rewards for learner_ambassador type
27. **Test**: Verify cost-per-lead calculation, ambassador tracking

---

## Assumptions

- [CONFIRMED] Team members have MyJKKN accounts (they're in expo_event_team_members)
- [CONFIRMED] Referral rewards tables exist (can be extended)
- [CONFIRMED] Expo events have team member assignments (expo_event_team_members)
- [TO VERIFY] All team member phones have mobile data or event venues have WiFi
- [TO DO] WhatsApp Business API setup — must be done for Phase 2
- [TO VERIFY] Tamil font rendering on all Android devices used by team
- [ASSUMPTION] Programs table is populated for all 9 JKKN institutions

---

## Key Behavioral Design Decisions

**Why team-member-operated (not visitor self-service)**: At a busy booth, the team member is already talking to the visitor. Handing them a phone to type breaks the conversation flow. The team member captures info while chatting — it's faster, more accurate, and maintains engagement.

**Why the leaderboard**: Student volunteers are inherently competitive. A visible "Priyanka: 14 leads, Sathish: 11 leads" creates peer pressure and gamification. Events with leaderboards consistently outperform those without.

**Why captured_by = referrer**: This is the spec's key innovation. Production data shows referrals convert at 78% vs walk-ins at 16%. The difference is that a referrer follows up personally. By making the learner ambassador the "captured_by" referrer with an incentive (even ₹100-200 per enrollment), they're motivated to personally WhatsApp the visitor after the event: "Hey, remember me from the JKKN booth? Let me help you with the application." This personal follow-up is what closes the 76% gap.

**Why Tamil + English**: These events are in tier-2/3 Tamil Nadu cities — Ramanathapuram, Pudukottai, Kallakurichi. Parents who visit these fairs often read Tamil better than English. Form labels in Tamil reduce friction. WhatsApp messages in Tamil feel personal, not institutional.

**Why AI Experience Zone as separate source**: JKKN has an AI demo zone at booths. Visitors attracted by AI demos have a different psychology than those seeking traditional programs. Tracking them separately will reveal whether the AI zone is a lead magnet or just entertainment.

---

*Spec v2: Revised after deep interview revealing team-operated (not visitor) capture, learner ambassador referral model, WhatsApp API not yet configured, multi-institution multi-program reality, Tamil+English requirement, and rapid-fire volume needs.*
