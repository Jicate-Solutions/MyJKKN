# Board of Studies (BoS) Module — Developer Handoff
**Date:** 2026-04-25  
**Author:** Viswanathan Shanmugam  
**Status:** Core module complete — Document generation & OBE integration pending

---

## 1. What Was Built

The MyJKKN Board of Studies module is a full-stack academic governance system for autonomous colleges. It manages the entire BoS lifecycle: from constituting the board, to running meetings with a strict 8-state workflow, to recording resolutions and tracking TA/DA reimbursements for external experts.

### Regulatory Context

| Body | Criterion | Requirement Addressed |
|------|-----------|----------------------|
| NAAC | 1.1, 2.1 | BoS composition certificate, syllabus approval audit trail |
| UGC | Norms 2018 | 3-year term compositions, external expert inclusion |
| AICTE | Monitoring | Meeting register, resolution compliance records |
| IQAC | Evidence | Minutes of meetings, action taken reports |

---

## 2. Architecture Overview

The module follows the MyJKKN 7-layer pattern:

```
Database (Supabase/PostgreSQL)
  ↕ RLS Policies
Next.js API Routes  (/api/bos/*)
  ↕ Auth + Institution Scope Guard
Service Classes  (lib/services/bos/)
  ↕ Fetch + Error Handling
React Query Hooks  (hooks/bos/)
  ↕ Cache + Mutations
React Components  (_components/)
  ↕ Forms, Tables, Dialogs
Pages  (app/(routes)/bos/)
```

**COE Integration:** `board_id`, `course_id`, `programme_id` are bare UUIDs — no FK constraints. COE metadata is fetched via proxy API routes (`/api/bos/boards`, `/api/bos/courses/[id]`, `/api/bos/institutions`). This keeps COE as a read-only reference source.

---

## 3. Database Schema

### 10 Tables

| Table | Purpose |
|-------|---------|
| `bos_external_experts` | Master directory of external experts (industry, alumni, university nominees) |
| `bos_compositions` | Formal BoS constitution per 3-year term |
| `bos_members` | Members within a composition (internal staff or external experts) |
| `bos_meetings` | Core meeting records with 8-state workflow |
| `bos_meeting_attendees` | Per-member attendance for each meeting |
| `bos_agenda_items` | Agenda items with discussion notes and resolutions |
| `bos_resolution_actions` | Follow-up actions per agenda item (Action Taken Report) |
| `bos_course_reviews` | Courses reviewed/approved in a meeting |
| `bos_ta_da_claims` | TA/DA reimbursement for external experts |
| `bos_documents` | Metadata for generated notices, call letters, minutes PDFs |

### Key Design Decisions

- **`institutions_id` (plural):** Matches MyJKKN convention. Fixed in migration `20260424_bos_align_institutions_id_and_drop_expert_fk.sql`.
- **Bare UUIDs for COE refs:** `board_id`, `course_id` have no FK constraints — resolved via proxy API, not joined directly.
- **`constituted_by` is free text:** VARCHAR(255), not a FK. Accepts values like "Principal", "Vice Chancellor". Fixed in `20260424_bos_compositions_constituted_by_to_text.sql`.
- **`total_amount` is a computed column:** `bos_ta_da_claims.total_amount` is `GENERATED ALWAYS AS (travel_amount + da_amount + other_amount)`. DB computes it; clients never submit totals.
- **Member constraint:** Each `bos_members` row must have exactly one of `staff_id` OR `expert_id` set — enforced by DB check constraint.

### Migration Files (apply in order)

```
supabase/migrations/20260306_create_bos_tables.sql           — Initial 10 tables + RLS
supabase/migrations/20260424_bos_align_institutions_id_and_drop_expert_fk.sql
supabase/migrations/20260424_bos_compositions_constituted_by_to_text.sql
```

---

## 4. Meeting State Machine (8 States)

This is the most critical piece of logic in the module.

```
draft
  → principal_approved   (Principal signs off on holding the meeting)
    → noticed            (Meeting notice sent to members)
      → expert_invited   (External experts formally invited with TA/DA)
        → completed      (Meeting held, quorum confirmed)
          → minutes_drafted   (Secretary drafts minutes)
            → minutes_approved (Chairman/Principal approves minutes)
              → ratified       (Academic Council ratification — TERMINAL)
```

**Enforcement:** PATCH `/api/bos/meetings/[id]/status` validates transitions against `BOS_MEETING_NEXT_STATUS` in `types/bos.ts`. No skipping states. Each transition accepts optional metadata (approver name, ratification date, minutes summary).

---

## 5. File Inventory

### Types
- [types/bos.ts](../../types/bos.ts) — All interfaces, enums, label maps, state machine record, DTOs

### Database Migrations
- [supabase/migrations/20260306_create_bos_tables.sql](../../supabase/migrations/20260306_create_bos_tables.sql)
- [supabase/migrations/20260424_bos_align_institutions_id_and_drop_expert_fk.sql](../../supabase/migrations/20260424_bos_align_institutions_id_and_drop_expert_fk.sql)
- [supabase/migrations/20260424_bos_compositions_constituted_by_to_text.sql](../../supabase/migrations/20260424_bos_compositions_constituted_by_to_text.sql)

### API Routes (24 routes)
```
app/api/bos/
├── experts/route.ts                    GET list, POST create
├── experts/[id]/route.ts               GET, PUT, DELETE
├── compositions/route.ts               GET list, POST create
├── compositions/[id]/route.ts          GET, PUT, DELETE
├── members/route.ts                    GET list, POST create
├── members/[id]/route.ts               GET, PUT, DELETE
├── meetings/route.ts                   GET list, POST create
├── meetings/[id]/route.ts              GET, PUT, DELETE
├── meetings/next-number/route.ts       GET next sequential meeting number
├── meetings/[id]/status/route.ts       PATCH — state machine transition
├── meetings/[id]/attendance/route.ts   GET list, POST bulk upsert
├── meetings/[id]/agenda/route.ts       GET list, POST create item
├── meetings/[id]/courses/route.ts      GET list, POST create review
├── agenda/[id]/route.ts                GET, PUT, DELETE agenda item
├── agenda/[id]/actions/route.ts        GET list, POST create action
├── actions/[id]/route.ts               GET, PUT, DELETE action
├── courses/[id]/route.ts               GET — COE proxy for course metadata
├── ta-da/route.ts                      GET list, POST create
├── ta-da/[id]/route.ts                 GET, PUT, DELETE
├── boards/route.ts                     GET — COE proxy for boards
├── institutions/route.ts               GET — COE proxy for institutions
├── reports/composition/route.ts        GET composition certificate report
├── reports/meeting-register/route.ts   GET meeting register report
└── reports/resolution-compliance/route.ts  GET resolution compliance report
```

### Services (8 classes)
```
lib/services/bos/
├── bos-expert-service.ts
├── bos-composition-service.ts
├── bos-member-service.ts
├── bos-meeting-service.ts
├── bos-attendance-service.ts
├── bos-agenda-service.ts
├── bos-course-review-service.ts
└── bos-ta-da-service.ts
```

### React Query Hooks (7 files)
```
hooks/bos/
├── use-bos-experts.ts        useBoSExperts, useBosExpert, useCreate/Update/DeleteBosExpert
├── use-bos-compositions.ts   useBosCompositions, useBosComposition, mutations
├── use-bos-members.ts        useBosMembersByComposition, useAdd/RemoveBosMember
├── use-bos-meetings.ts       useBosMeetings, useBosMeeting, useTransitionBosMeetingStatus
├── use-bos-attendance.ts     useBosAttendance, useUpsertBosAttendance
├── use-bos-agenda.ts         useBosAgendaItems, mutations
└── use-bos-ta-da.ts          useBosTaDaClaims, useCreate/Update/DeleteBosTaDaClaim
```

### Utilities (2 files)
```
lib/utils/bos/
├── bos-access.ts         resolveBosAccess(), guardInstitutionWrite(), applyInstitutionScope()
└── bos-pdf-generator.ts  PLACEHOLDER — not implemented yet (see section 7)
```

### Pages (12 pages, 40+ components)
```
app/(routes)/bos/
├── page.tsx                           Dashboard (summary cards, alerts, recent meetings)
├── compositions/page.tsx              Composition list
├── compositions/new/page.tsx          Create composition form
├── compositions/[compositionId]/page.tsx       Composition detail + member roster
├── compositions/[compositionId]/edit/page.tsx  Edit composition
├── meetings/page.tsx                  Meeting list (status filter tabs)
├── meetings/new/page.tsx              Schedule new meeting
├── meetings/[meetingId]/page.tsx      Meeting detail (stepper + tabs: agenda, attendance, docs)
├── meetings/[meetingId]/edit/page.tsx Edit meeting basics
├── experts/page.tsx                   Expert directory
├── experts/new/page.tsx               Add expert
├── experts/[id]/edit/page.tsx         Edit expert
├── ta-da/page.tsx                     TA/DA claims + add/edit dialog
└── reports/page.tsx                   Reports (3 tabs: register, compliance, composition cert)
```

### Specification Docs
- [docs/plans/spec-Myjkkn-BoS.md](spec-Myjkkn-BoS.md) — Full BoS implementation spec
- [docs/plans/spec-Myjkkn-BOS-OBE-Combined.md](spec-Myjkkn-BOS-OBE-Combined.md) — Future OBE integration spec

---

## 6. Permissions

All permission keys follow the `module.submodule.action` convention.  
Add new keys to [lib/constants/permissions.ts](../../lib/constants/permissions.ts).

| Permission Key | What it guards |
|---------------|---------------|
| `academic.bos-experts.view` | View expert directory |
| `academic.bos-experts.create` | Add new experts |
| `academic.bos-experts.edit` | Edit experts |
| `academic.bos-experts.delete` | Delete experts |
| `academic.bos-compositions.view` | View compositions |
| `academic.bos-compositions.create` | Create compositions |
| `academic.bos-compositions.edit` | Edit compositions |
| `academic.bos-compositions.delete` | Delete compositions |
| `academic.bos-meetings.view` | View meetings |
| `academic.bos-meetings.create` | Schedule meetings |
| `academic.bos-meetings.edit` | Edit meetings + trigger state transitions |
| `academic.bos-meetings.delete` | Delete meetings |
| `academic.bos-ta-da.view` | View TA/DA claims |
| `academic.bos-ta-da.create` | Create TA/DA claims |
| `academic.bos-ta-da.edit` | Edit TA/DA claims |

**RLS pattern used on every table:**
```sql
CREATE POLICY "bos_<table>_select" ON bos_<table>
FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('academic.bos-<resource>.view')
        AND role_has_institution_access(institutions_id))
);
```

---

## 7. What's Pending (Next Developer Picks Up Here)

### 7a. Document Generation — NOT IMPLEMENTED

`lib/utils/bos/bos-pdf-generator.ts` is a placeholder stub. The `bos_documents` table exists to store metadata after a document is generated.

**Documents to generate:**

| Document | When | Recipients |
|----------|------|-----------|
| Meeting Notice | Status → `noticed` | All members |
| Call Letter | Status → `expert_invited` | External experts |
| Minutes of Meeting | Status → `minutes_approved` | All members |
| Composition Certificate | On demand | NAAC/IQAC |
| Syllabus Approval Certificate | On demand (post-ratification) | Program coordinator |
| TA/DA Bill | Claim status → `approved` | Expert + accounts |
| Action Taken Report | On demand | Principal/IQAC |

**Recommended approach:**
- Use `docx` npm package (already in many MyJKKN modules) for Word template fill
- Use `pdf-lib` or server-side `puppeteer` for PDF export
- Store files in Supabase Storage bucket `bos-documents`
- On upload, INSERT row into `bos_documents` with `file_url`

**Integration point:** POST `/api/bos/meetings/[id]/documents` (route does not exist yet — create it)

### 7b. OBE Integration — NOT STARTED

`docs/plans/spec-Myjkkn-BOS-OBE-Combined.md` has the approved design. Key points:
- OBE is gated behind BoS: faculty drafts outcomes → BoS approves → frozen snapshot
- Requires 17 new tables (`obe_regulations`, `obe_pos`, `obe_cos`, `obe_co_po_mapping`, etc.)
- `bos_course_reviews.course_id` will link to OBE regulation versions when OBE is built
- Do NOT alter current BOS tables for OBE — add new tables and join

### 7c. Sidebar + Navigation Registration

Verify `/bos` and its sub-routes are registered in [lib/sidebarMenuLink.ts](../../lib/sidebarMenuLink.ts) with the correct permission keys. Check that the link appears for HOD / academic admin roles.

### 7d. No Tests Written

Zero test coverage currently. High-value test targets:
- State machine: attempt invalid transitions (e.g., `draft → completed`)
- RLS: cross-institution read attempt should return empty
- TA/DA total: confirm computed column ignores client-submitted total
- E2E happy path: create composition → add members → schedule meeting → mark attendance → ratify

---

## 8. Common Extension Tasks

### Add a field to experts (e.g., LinkedIn URL)

1. Migration: `ALTER TABLE bos_external_experts ADD COLUMN linkedin_url VARCHAR(255);`
2. [types/bos.ts](../../types/bos.ts): Add `linkedin_url?: string` to `BosExternalExpert`
3. [app/api/bos/experts/route.ts](../../app/api/bos/experts/route.ts): Include in POST body parsing
4. [app/api/bos/experts/[id]/route.ts](../../app/api/bos/experts/%5Bid%5D/route.ts): Include in PUT body
5. Expert form component: Add `<Input>` field
6. Expert table columns: Add column def if needed

### Add a new meeting status

1. [types/bos.ts](../../types/bos.ts): Add to `BosMeetingStatus` union, `BOS_MEETING_STATUS_LABELS`, `BOS_MEETING_NEXT_STATUS`, `BOS_MEETING_STATUS_ORDER`
2. [app/api/bos/meetings/[id]/status/route.ts](../../app/api/bos/meetings/%5BmeetingId%5D/status/route.ts): No code change needed — it reads from `BOS_MEETING_NEXT_STATUS` dynamically
3. `meeting-status-stepper.tsx`: Update stepper display if visual order changes

### Add a new report tab

1. Create API route: `/api/bos/reports/<report-name>/route.ts`
2. Add service method to the appropriate service class
3. Add React Query hook
4. Add tab to `app/(routes)/bos/reports/page.tsx`

---

## 9. Known Gotchas

| Gotcha | Detail |
|--------|--------|
| `institutions_id` not `institution_id` | All BOS tables use plural form. COE tables use singular. Don't mix them in joins. |
| `board_id` is a bare UUID | No FK to any table. Resolve board name via `/api/bos/boards`. Never join directly. |
| `total_amount` is read-only | It's `GENERATED ALWAYS AS` — Supabase will error if you try to INSERT/UPDATE this column. |
| Expert-to-member flow | Create expert in directory first (`/bos/experts/new`), then add to composition as member. Can't create expert inline from the members form. |
| State machine is one-directional | No rollback. Once `ratified`, the meeting is permanently closed. If a mistake was made, create a new meeting with corrected records. |
| Composition uniqueness | `UNIQUE(board_id, term_start_date)` — same board cannot have two compositions starting on the same date. |

---

## 10. Quick Verification Checklist

Before marking the module as production-deployed:

- [ ] All 3 migrations applied (`SELECT tablename FROM pg_tables WHERE tablename LIKE 'bos_%'` → 10 rows)
- [ ] RLS enabled on all 10 tables
- [ ] `/bos` route visible in sidebar for HOD / academic admin roles
- [ ] Create one expert → verify appears in list
- [ ] Create one composition → add members → verify member count on dashboard
- [ ] Schedule meeting → transition through all 8 states
- [ ] Add TA/DA claim → verify `total_amount` auto-calculated by DB
- [ ] Reports page loads all 3 tabs without error

---

## 11. Contacts & References

| Resource | Location |
|----------|---------|
| Full BoS spec | [docs/plans/spec-Myjkkn-BoS.md](spec-Myjkkn-BoS.md) |
| BOS + OBE combined spec | [docs/plans/spec-Myjkkn-BOS-OBE-Combined.md](spec-Myjkkn-BOS-OBE-Combined.md) |
| OBE-only spec | [docs/plans/spec-Myjkkn-OBE.md](spec-Myjkkn-OBE.md) |
| Permission keys reference | [lib/constants/permissions.ts](../../lib/constants/permissions.ts) |
| Sidebar nav links | [lib/sidebarMenuLink.ts](../../lib/sidebarMenuLink.ts) |
| RLS functions | `supabase/setup/02_functions.sql` → `user_has_permission()`, `role_has_institution_access()` |
| SQL policies | `supabase/setup/03_policies.sql` |
