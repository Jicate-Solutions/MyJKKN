# MyJKKN WhatsApp CRM — Audit Phase 2 (Gaps 4-7)
**Date:** 2026-02-22
**Auditor:** auditor-phase2
**Overall Completion:** 2.5%

---

## Executive Summary

Phase 2 audits the implementation of 4 critical features in the WhatsApp 16-Gap spec:
- **Gap 4:** 24hr Messaging Window UI Indicator
- **Gap 5:** Template Quality Rating Display
- **Gap 6:** Audience Segmentation Builder
- **Gap 7:** Per-Template Engagement Analytics

**Finding:** Only Gap 5 has partial implementation (metadata storage only). Gaps 4, 6, and 7 are entirely missing and require full-stack development.

---

## Gap 4: 24hr Messaging Window UI Indicator

### Purpose
Enforce WhatsApp's 24-hour response window rule. After the last *inbound* message from the prospect, counselors can only send free-text messages within 24 hours. After that window expires, only templates are allowed.

### Requirement Checklist

| Deliverable | Status | Details |
|---|---|---|
| `getWindowStatus(lastInboundAt)` method in whatsapp-chat-service.ts | ✗ MISSING | Should return `{ withinWindow: boolean, expiresAt: Date, remainingMinutes: number, status: 'green'\|'orange'\|'red'\|'gray' }` |
| Window enforcement in `sendMessage()` | ✗ MISSING | Must block free-text when window expired; allow templates always |
| API response includes `window_status` | ✗ MISSING | `/api/admission/chat/conversations/[id]` should augment response with window metadata |
| UI banner in chat-thread.tsx | ✗ MISSING | Visual indicator above message input; color-coded by status |

### Implementation Path
1. Add `getWindowStatus()` to WhatsAppChatService
2. Modify `sendMessage()` to validate window before sending free-text
3. Update conversation endpoint to return `window_status` object
4. Create banner component in chat UI with visual states

### Compliance Impact
**CRITICAL** — Without this, institution violates WhatsApp's messaging policy and risks account suspension.

---

## Gap 5: Template Quality Rating Display

### Purpose
Surface Meta's template quality scores (HIGH/MEDIUM/LOW) to show counselors which templates perform best. Enable in-app refresh of quality ratings from Meta API.

### Requirement Checklist

| Deliverable | Status | Details |
|---|---|---|
| `refreshAllQualityRatings(institutionId)` method | PARTIAL | Metadata stored during sync (line 176: `quality_rating: mt.quality_score?.score`); missing dedicated refresh |
| API route for refresh | ✗ MISSING | `POST /api/admission/chat/templates/refresh-quality` should fetch latest from Meta |
| UI quality badges | ✗ MISSING | Template displays should show HIGH (green), MEDIUM (yellow), LOW (red) badges |
| Hook mutation | ✗ MISSING | `use-communication-templates.ts` needs `refreshQuality()` mutation |

### Current State
- Templates sync includes quality_score from Meta (line 176 of whatsapp-template-service.ts)
- Stored in metadata JSONB field as `quality_rating: 'HIGH'\|'MEDIUM'\|'LOW'\|'UNKNOWN'`
- **Not exposed in UI** — templates page doesn't display ratings

### Implementation Path
1. Add `refreshAllQualityRatings()` method to WhatsAppTemplateService
2. Create refresh-quality API route (POST)
3. Add quality badges to template list/detail components
4. Add refreshQuality mutation to hook

### Impact
Medium priority — enhances template management but not blocking core functionality.

---

## Gap 6: Audience Segmentation Builder

### Purpose
Enable counselors to build dynamic audience segments (e.g., "All engineering leads in Bangalore, scored 7+, no response for 3+ days") and preview who matches before sending campaigns.

### Requirement Checklist

| Deliverable | Status | Details |
|---|---|---|
| Migration: `wa_audience_segments` table | ✗ MISSING | Should include: `id`, `institution_id`, `name`, `criteria` (JSONB), `created_by`, `member_count`, `last_resolved_at` |
| whatsapp-segment-service.ts | ✗ MISSING | Methods: `getSegments`, `createSegment`, `previewSegment`, `resolveSegment`, `buildQueryFromCriteria` |
| API routes (4x) | ✗ MISSING | `GET/POST /api/admission/campaigns/segments`, `GET/PUT/DELETE /api/admission/campaigns/segments/[id]`, `POST /api/admission/campaigns/segments/preview`, `POST /api/admission/campaigns/segments/[id]/resolve` |
| UI page: segments/page.tsx | ✗ MISSING | Segment builder with criteria selector, member count preview, action menu |
| Hook: use-wa-segments.ts | ✗ MISSING | Queries and mutations for segment CRUD and preview |

### Database Schema (Expected)
```sql
CREATE TABLE wa_audience_segments (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions,
  name TEXT NOT NULL,
  criteria JSONB NOT NULL, -- { "stage": "prospect", "score_min": 7, "days_no_response": 3 }
  member_count INT,
  created_by UUID REFERENCES profiles,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(institution_id, name)
);
```

### Criteria Examples
- Admission stage: prospect, shortlisted, selected
- Lead score: min/max range
- Source: form, call, referral
- Days without response: > N days
- Geography: city/state
- Program interest: engineering, business, law
- Communication channel: whatsapp, email, sms

### Implementation Path
1. Create wa_audience_segments migration
2. Build WhatsAppSegmentService with buildQueryFromCriteria (SQL generator)
3. Create 4 API routes
4. Build segment builder UI (criteria selector, live preview count)
5. Add segment selection to campaign creation flow

### Impact
**CRITICAL** — Blocks campaigns module. Campaign creation requires audience selection.

---

## Gap 7: Per-Template Engagement Analytics

### Purpose
Show template-level performance metrics (sent count, delivery rate, open rate, reply rate, click rate) to identify which templates drive engagement.

### Requirement Checklist

| Deliverable | Status | Details |
|---|---|---|
| whatsapp-template-analytics-service.ts | ✗ MISSING | Methods: `getTemplateAnalytics(templateId, institutionId)`, `getTemplateTimeline(templateId, dateRange)`, `getTopPerformingTemplates(institutionId)`, `getWorstPerformingTemplates(institutionId)` |
| API route: /templates/analytics | ✗ MISSING | `GET /api/admission/chat/templates/analytics?template_id=...` |
| UI page: templates/analytics/page.tsx | ✗ MISSING | KPI cards (sent, delivered, read, reply%), bar chart (performance by template), sortable table |
| Hook: use-template-analytics.ts | ✗ MISSING | Queries for analytics data with caching |

### Metrics to Calculate
- **Sent Count:** Total messages sent with template
- **Delivery Rate:** (delivered + read) / sent
- **Read Rate:** read / delivered
- **Reply Rate:** replies / sent
- **Click Rate:** link clicks / sent (if applicable)
- **Average Response Time:** Mean hours between send and first reply

### Data Sources
- `wa_messages` table: sent count, status (sent/delivered/read), timestamps
- `wa_conversations` table: reply status
- Campaign logs (if applicable): link tracking

### Implementation Path
1. Create analytics service with metric aggregations
2. Add analytics API route
3. Build analytics dashboard UI (KPI cards, trend chart, table)
4. Add hook with query caching

### Impact
Medium priority — performance insights but not blocking core functionality.

---

## Audit Details

### Files Examined

**Services (lib/services/whatsapp/):**
- ✓ whatsapp-chat-service.ts (856 lines) — No window logic
- ✓ whatsapp-template-service.ts (489 lines) — Metadata only, no refresh
- ✓ whatsapp-connection-service.ts
- ✓ whatsapp-forms-service.ts
- ✓ whatsapp-message-log-service.ts
- ✓ whatsapp-settings-service.ts
- ✓ whatsapp-api-client.ts

**Migrations:**
- ✓ 20260222000002_create_whatsapp_chat_tables.sql — Tables: wa_conversations, wa_messages, wa_quick_replies

**API Routes:**
- ✓ /api/admission/chat/conversations/[id]/route.ts — No window_status
- ✓ /api/admission/chat/conversations/route.ts
- ✓ /api/admission/chat/conversations/[id]/messages/route.ts
- ✓ /api/admission/campaigns/roi/route.ts

**Pages:**
- ✓ app/(routes)/admission/templates/page.tsx — No quality badges, no analytics
- ✓ app/(routes)/admission/campaigns/page.tsx — No segments

### Files Not Found
- lib/services/whatsapp/whatsapp-segment-service.ts
- lib/services/whatsapp/whatsapp-template-analytics-service.ts
- app/api/admission/campaigns/segments/ (entire directory)
- app/api/admission/chat/templates/analytics/route.ts
- app/api/admission/chat/templates/refresh-quality/route.ts
- app/(routes)/admission/campaigns/segments/page.tsx
- app/(routes)/admission/templates/analytics/page.tsx
- hooks/admission/use-wa-segments.ts
- hooks/admission/use-template-analytics.ts
- supabase/migrations/*wa_audience_segments*

---

## Summary Matrix

| Gap | Feature | Status | Done | Blocker | Priority |
|-----|---------|--------|------|---------|----------|
| 4 | 24hr Window Indicator | ✗ MISSING | 0% | Compliance | CRITICAL |
| 5 | Quality Rating Display | ⚠️ PARTIAL | 10% | UI/API | MEDIUM |
| 6 | Audience Segmentation | ✗ MISSING | 0% | Campaigns | CRITICAL |
| 7 | Template Analytics | ✗ MISSING | 0% | Insights | MEDIUM |

**Phase 2 Total:** 2.5% complete

---

## Recommendations

### Immediate (Week 1)
1. **Gap 6:** Create wa_audience_segments migration + WhatsAppSegmentService
   - Unblocks campaign creation
   - Most impactful implementation

2. **Gap 4:** Add getWindowStatus() method + sendMessage validation
   - Compliance requirement
   - Simple method, no DB changes needed

### Short-term (Week 2-3)
3. **Gap 5:** Add refreshAllQualityRatings() + API + UI badges
   - Enhances template management
   - Leverages existing metadata storage

### Later (Week 4+)
4. **Gap 7:** Build analytics service + API + dashboard
   - Performance optimization feature
   - Can be added incrementally

---

## Next Steps

1. Review audit findings with team-lead
2. Prioritize implementation order
3. Assign gaps to development team
4. Create implementation tasks for each gap
5. Verify each deliverable during Phase 3 audit
