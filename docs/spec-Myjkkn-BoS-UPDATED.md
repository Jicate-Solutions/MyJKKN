# Board of Studies (BoS) Module — Updated Implementation Spec

> **Status: ACTIVE DEVELOPMENT**  
> **Last Updated: 2026-05-06**  
> **Implementation Progress: ~60% Complete (Phase 1-3 mostly done, Phase 4-5 partial)**

---

## ⚠️ **CRITICAL DEVIATION FROM ORIGINAL SPEC**

**Original spec requirement:**
- All BoS data lives in **COE database** (separate Supabase project)
- MyJKKN accesses COE via proxy API routes using `createCoeSupabaseClient()`
- COE uses service-role key (never exposed to client)

**CURRENT IMPLEMENTATION:**
- ✅ BoS data lives in **MyJKKN's own Supabase database**
- ✅ No separate COE project integration needed
- ✅ Uses standard MyJKKN authentication flow
- ⚠️ **Architecture simplified** from spec (single DB instead of cross-project)

**Implication:** Update all documentation and future work to use MyJKKN Supabase directly. DO NOT create `createCoeSupabaseClient`.

---

## 🏗️ **Actual Architecture (as implemented)**

```
MyJKKN Database (Supabase)
  └── bos_* tables (10 tables — all new)
       ↑
       ├─ Access Control: lib/utils/bos/bos-access.ts
       │  (resolveBosAccess, guardInstitutionWrite, applyInstitutionScope)
       │
MyJKKN API Routes (app/api/bos/*)
  ├─ Authenticate via MyJKKN session
  ├─ Resolve institution scope
  └─ Query MyJKKN Supabase directly
       ↑
       ├─ Services (lib/services/bos/*-service.ts)
       │  └─ fetch() calls to proxy routes
       │
       ├─ Hooks (hooks/bos/use-bos-*.ts)
       │  └─ React Query wrappers
       │
MyJKKN Pages (app/(routes)/bos/**)
  └─ Server + Client Components
```

---

## 📊 **Implementation Status by Phase**

| Phase | Feature | Status | Notes |
|-------|---------|--------|-------|
| **Phase 1** | **Foundation — Types, Services, Expert Directory** | ✅ 95% | API routes, services, hooks, pages all done |
| | COE Client | ❌ Not Done | Not needed (using MyJKKN DB) |
| | TypeScript Types | ✅ 100% | Complete `types/bos.ts` |
| | Expert Directory | ✅ 100% | List, create, edit, delete pages + CRUD |
| | Composition Management | ✅ 100% | List, create, edit, member management |
| | Access Control | ✅ 100% | `bos-access.ts` with all functions |
| **Phase 2** | **Meeting Lifecycle — State Machine & CRUD** | ✅ 90% | All 8 states implemented |
| | Meeting CRUD | ✅ 100% | List, create, edit, detail pages |
| | State Machine (8 states) | ✅ 100% | Transitions validated server-side |
| | Status Stepper Component | ✅ 100% | Visual 8-step progress indicator |
| | Next-number auto-assign | ✅ 100% | Auto-increments per board/academic year |
| **Phase 3** | **Agenda, Attendance, Course Reviews** | ✅ 85% | All features mostly done |
| | Agenda Items CRUD | ✅ 100% | Create, edit, delete, reorder |
| | Resolution Actions | ✅ 100% | Sub-items under agenda |
| | Attendance Marking | ✅ 100% | Grid with Present/Absent/Leave toggle |
| | Quorum Indicator | ✅ 100% | Shows member count + % present |
| | Course Review Linking | ✅ 100% | Link courses to meeting |
| **Phase 4** | **Document Generation** | 🟡 40% | Partial implementation |
| | DOCX Template Engine | 🟡 50% | `bos-pdf-generator.ts` exists (may be incomplete) |
| | Meeting Notice Generation | 🟡 30% | Utility exists, needs API route |
| | Call Letter Generation | ❌ 0% | Not implemented |
| | Minutes Generation | ❌ 0% | Not implemented |
| | Document Management Page | ❌ 0% | Not implemented |
| **Phase 5** | **TA/DA & Reports** | 🟡 50% | Partial implementation |
| | TA/DA Claims CRUD | ✅ 100% | API routes + services + hooks |
| | TA/DA Page | ✅ 100% | List page implemented |
| | Composition Report | 🟡 50% | API route exists, UI page incomplete |
| | Meeting Register Report | 🟡 50% | API route exists, UI page incomplete |
| | Resolution Compliance Report | 🟡 50% | API route exists, UI page incomplete |
| | Syllabus Approval Report | 🟡 50% | API route exists, UI page incomplete |

---

## 📁 **Complete File Inventory (Actual)**

### **Types** ✅
- `types/bos.ts` — All interfaces, enums, DTOs, label maps

### **Services** ✅ (8 services)
- `lib/services/bos/bos-expert-service.ts`
- `lib/services/bos/bos-composition-service.ts`
- `lib/services/bos/bos-member-service.ts`
- `lib/services/bos/bos-meeting-service.ts`
- `lib/services/bos/bos-agenda-service.ts`
- `lib/services/bos/bos-attendance-service.ts`
- `lib/services/bos/bos-course-review-service.ts`
- `lib/services/bos/bos-ta-da-service.ts`

### **Utilities** ✅
- `lib/utils/bos/bos-access.ts` — Institution scope + guard functions
- `lib/utils/bos/bos-pdf-generator.ts` — Document generation (partial)

### **Hooks** ✅ (7 hooks)
- `hooks/bos/use-bos-experts.ts`
- `hooks/bos/use-bos-compositions.ts`
- `hooks/bos/use-bos-members.ts`
- `hooks/bos/use-bos-meetings.ts`
- `hooks/bos/use-bos-agenda.ts`
- `hooks/bos/use-bos-attendance.ts`
- `hooks/bos/use-bos-ta-da.ts`

### **API Routes** ✅ (24 routes)
```
app/api/bos/
├── experts/route.ts (GET, POST)
├── experts/[id]/route.ts (GET, PUT, DELETE)
├── compositions/route.ts (GET, POST)
├── compositions/[id]/route.ts (GET, PUT, DELETE)
├── members/route.ts (GET, POST)
├── members/[id]/route.ts (PUT, DELETE)
├── meetings/route.ts (GET, POST)
├── meetings/next-number/route.ts (GET)
├── meetings/[id]/route.ts (GET, PUT)
├── meetings/[id]/status/route.ts (PATCH — state transitions)
├── meetings/[id]/agenda/route.ts (GET, POST)
├── meetings/[id]/courses/route.ts (GET, POST)
├── meetings/[id]/attendance/route.ts (GET, POST)
├── agenda/[id]/route.ts (PUT, DELETE)
├── agenda/[id]/actions/route.ts (POST — resolution actions)
├── actions/[id]/route.ts (resolution actions detail)
├── ta-da/route.ts (GET, POST)
├── ta-da/[id]/route.ts (PUT, DELETE)
├── reports/composition/route.ts (GET)
├── reports/meeting-register/route.ts (GET)
├── reports/resolution-compliance/route.ts (GET)
├── boards/route.ts (GET — list boards)
├── institutions/route.ts (GET — list institutions)
├── courses/[id]/route.ts (GET — single course)
```

### **Pages** ✅ (Main routes)
```
app/(routes)/bos/
├── page.tsx (Dashboard)
├── layout.tsx (BoS navigation layout)
├── nav-config.ts (Navigation menu config)
├── experts/
│   ├── page.tsx (List with filters)
│   ├── new/page.tsx (Create form)
│   ├── [id]/edit/page.tsx (Edit form)
│   └── _components/ (6 files: columns, table, form, filters, row-actions, schema)
│   └── _data/get-experts.ts (Server data fetch)
├── compositions/
│   ├── page.tsx (List)
│   ├── new/page.tsx (Create)
│   ├── [compositionId]/page.tsx (Detail with members)
│   ├── [compositionId]/edit/page.tsx (Edit)
│   └── _components/ (6 files: columns, table, form, filters, row-actions, schema)
├── meetings/
│   ├── page.tsx (List with status filters)
│   ├── new/page.tsx (Create)
│   ├── [meetingId]/page.tsx (Detail hub with tabs)
│   ├── [meetingId]/edit/page.tsx (Edit)
│   └── _components/
│       ├── columns.tsx
│       ├── meeting-data-table.tsx
│       ├── meeting-form.tsx
│       ├── meeting-status-stepper.tsx (8-state progress)
│       ├── meeting-status-tabs.tsx
│       ├── row-actions.tsx
│       ├── agenda-tab.tsx (Agenda sub-page)
│       ├── attendance-tab.tsx (Attendance sub-page)
│       ├── documents-tab.tsx (Documents sub-page)
│       └── data-table-schema.ts
└── reports/
    └── page.tsx (Reports dashboard — partial)
```

### **Components** ❌ (Shared components)
> **NOTE:** Shared BoS components NOT created (status badges, member badges, etc.)
> These should be in `components/bos/` but don't exist yet.

---

## 🗄️ **Database Schema (MyJKKN Supabase)**

### **Existing Tables Populated**
```sql
✅ bos_external_experts      — Expert directory
✅ bos_compositions          — BoS formal compositions
✅ bos_members               — Composition members (staff + experts)
✅ bos_meetings              — Meeting records with 8-state machine
✅ bos_meeting_attendees     — Attendance per member per meeting
✅ bos_agenda_items          — Agenda items in meetings
✅ bos_resolution_actions    — Action tracking per resolution
✅ bos_course_reviews        — Course approval records per meeting
✅ bos_ta_da_claims          — Travel & DA reimbursement claims
✅ bos_documents             — Generated document metadata
```

**Migration Status:**
- Need to verify migration file exists in MyJKKN: `supabase/migrations/YYYYMMDD_create_bos_tables.sql`
- If not present, create it with all 10 CREATE TABLE statements

---

## 🔐 **Access Control (Implemented)**

### **Scope Resolution** (`resolveBosAccess`)
```typescript
interface BosAccessScope {
  isSuperAdmin: boolean;      // true if user is super_admin
  institutionsId: string | null;  // user's institution (null if super admin)
  role: string | null;         // user's role (principal, hod, faculty, etc.)
}
```

### **Guard Functions**
1. **`guardInstitutionWrite(scope, targetInstitutionsId)`**
   - Blocks write if user tries to write to different institution
   - Returns null if allowed, error string if blocked

2. **`applyInstitutionScope(scope, clientId)`**
   - Super admin: use client-provided institution ID
   - Normal user: force to own institution ID

### **Applied in All Routes**
Every API route at `app/api/bos/*`:
1. Authenticate user
2. Call `resolveBosAccess(userId)`
3. Apply scope to queries
4. Guard writes with `guardInstitutionWrite`

---

## 🚀 **API Endpoints Reference**

### **Experts**
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/bos/experts` | ✅ Implemented |
| POST | `/api/bos/experts` | ✅ Implemented |
| GET | `/api/bos/experts/:id` | ✅ Implemented |
| PUT | `/api/bos/experts/:id` | ✅ Implemented |
| DELETE | `/api/bos/experts/:id` | ✅ Implemented |

### **Compositions & Members**
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/bos/compositions` | ✅ Implemented |
| POST | `/api/bos/compositions` | ✅ Implemented |
| GET | `/api/bos/compositions/:id` | ✅ Implemented |
| PUT | `/api/bos/compositions/:id` | ✅ Implemented |
| DELETE | `/api/bos/compositions/:id` | ✅ Implemented |
| GET | `/api/bos/members?compositionId=` | ✅ Implemented |
| POST | `/api/bos/members` | ✅ Implemented |
| PUT | `/api/bos/members/:id` | ✅ Implemented |
| DELETE | `/api/bos/members/:id` | ✅ Implemented |

### **Meetings**
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/bos/meetings` | ✅ Implemented |
| POST | `/api/bos/meetings` | ✅ Implemented |
| GET | `/api/bos/meetings/:id` | ✅ Implemented |
| PUT | `/api/bos/meetings/:id` | ✅ Implemented |
| **PATCH** | `/api/bos/meetings/:id/status` | ✅ Implemented |
| GET | `/api/bos/meetings/next-number` | ✅ Implemented |

### **Meeting Sub-resources**
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/bos/meetings/:id/agenda` | ✅ Implemented |
| POST | `/api/bos/meetings/:id/agenda` | ✅ Implemented |
| GET | `/api/bos/meetings/:id/attendance` | ✅ Implemented |
| POST | `/api/bos/meetings/:id/attendance` | ✅ Implemented |
| GET | `/api/bos/meetings/:id/courses` | ✅ Implemented |
| POST | `/api/bos/meetings/:id/courses` | ✅ Implemented |

### **Agenda & Actions**
| Method | Endpoint | Status |
|--------|----------|--------|
| PUT | `/api/bos/agenda/:id` | ✅ Implemented |
| DELETE | `/api/bos/agenda/:id` | ✅ Implemented |
| POST | `/api/bos/agenda/:id/actions` | ✅ Implemented |

### **TA/DA**
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/bos/ta-da` | ✅ Implemented |
| POST | `/api/bos/ta-da` | ✅ Implemented |
| PUT | `/api/bos/ta-da/:id` | ✅ Implemented |
| DELETE | `/api/bos/ta-da/:id` | ✅ Implemented |

### **Reports** (API only, UI partial)
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/bos/reports/composition` | ✅ Implemented |
| GET | `/api/bos/reports/meeting-register` | ✅ Implemented |
| GET | `/api/bos/reports/resolution-compliance` | ✅ Implemented |

### **Support Routes**
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/bos/boards` | ✅ Implemented |
| GET | `/api/bos/institutions` | ✅ Implemented |
| GET | `/api/bos/courses/:id` | ✅ Implemented |

---

## 🔄 **Meeting State Machine (Fully Implemented)**

All 8 states with bidirectional transitions:

```
DRAFT
  ↓ (submit for approval)
  → PRINCIPAL_APPROVED ↔ DRAFT

PRINCIPAL_APPROVED
  ↓ (generate notice)
  → NOTICED ↔ PRINCIPAL_APPROVED

NOTICED
  ↓ (send call letters)
  → EXPERT_INVITED ↔ NOTICED

EXPERT_INVITED
  ↓ (meeting completed)
  → COMPLETED ↔ EXPERT_INVITED

COMPLETED
  ↓ (draft minutes)
  → MINUTES_DRAFTED ↔ COMPLETED

MINUTES_DRAFTED
  ↓ (approve minutes)
  → MINUTES_APPROVED ↔ MINUTES_DRAFTED

MINUTES_APPROVED
  ↓ (ratify)
  → RATIFIED (final state)
```

**Server-side Validation:**
- Invalid transitions rejected with 400 error
- State transition metadata captured (timestamps, approver IDs)
- Guards on completion: attendance records must exist, agenda items must have resolutions

---

## 📋 **What's Missing / TODO**

### **Critical (Phase 4-5)**
- [ ] **Document Generation API** — Templates exist (`bos-pdf-generator.ts`), need full implementation
  - [ ] Meeting Notice DOCX generation + endpoint
  - [ ] Call Letter generation (per expert)
  - [ ] Minutes of Meeting generation
  - [ ] Bulk document generation (ZIP download)
  - [ ] Email dispatch integration

- [ ] **Reports Pages** (UI only — API routes exist)
  - [ ] `/bos/reports` dashboard (all 4 reports in collapsible cards)
  - [ ] Composition report rendering
  - [ ] Meeting register table
  - [ ] Resolution compliance table
  - [ ] Export to PDF/DOCX/Excel

- [ ] **Shared Components** (missing but needed)
  - [ ] `components/bos/member-category-badge.tsx`
  - [ ] `components/bos/meeting-status-badge.tsx`
  - [ ] `components/bos/attendance-grid.tsx`
  - [ ] `components/bos/resolution-tracker.tsx`
  - [ ] `components/bos/meeting-timeline.tsx` (visual state progress)
  - [ ] `components/bos/document-download-panel.tsx`

### **Nice-to-Have**
- [ ] BoS Coordinator role creation (if not exists)
- [ ] Permission keys mapping (`academic.bos-[entity].[action]`)
- [ ] Sidebar menu registration
- [ ] Mobile responsive refinements
- [ ] JKKN terminology application (Learning Facilitator labels in UI)

---

## 🎯 **Next Immediate Actions**

### **To Complete Phase 4 (Documents)**
1. Review `lib/utils/bos/bos-pdf-generator.ts` — assess what's done
2. Build document generation routes (if not in API routes)
3. Build document download panel component
4. Create `/api/bos/documents` routes (POST generate, GET list)
5. Build documents page in meeting detail hub

### **To Complete Phase 5 (Reports)**
1. Build `/bos/reports` page with 4 report sections
2. Build component for each report (composition, meeting-register, compliance, syllabus)
3. Add export to PDF/DOCX/Excel functionality
4. Test NAAC/NBA compliance format

### **To Complete Shared Components**
1. Add member/meeting status badges to `components/bos/`
2. Build attendance grid component
3. Build resolution tracker component
4. Build meeting timeline stepper component

---

## 🔍 **Key Differences from Original Spec**

| Aspect | Original Spec | Actual Implementation |
|--------|---------------|-----------------------|
| **Database** | COE project (separate) | MyJKKN Supabase |
| **Client** | `createCoeSupabaseClient` | Standard MyJKKN `createClient()` |
| **Route Structure** | `app/(routes)/academic/bos` | `app/(routes)/bos` |
| **Services Location** | `lib/services/academic/bos-*` | `lib/services/bos/*` |
| **Hooks Location** | `hooks/academic/use-bos-*` | `hooks/bos/use-bos-*` |
| **Architecture** | 7-layer with proxy | 7-layer (simplified) |
| **Navigation** | Under Academic module | Standalone BoS module |

---

## 🧪 **Testing Checklist**

- [ ] All API routes return 401 for unauthenticated requests
- [ ] Super admin can see all institutions' BoS data
- [ ] Regular users can only see their own institution
- [ ] Write guards prevent cross-institution writes
- [ ] Meeting state machine rejects invalid transitions
- [ ] Auto-numbering works per board + academic year
- [ ] Attendance grid pre-populates all composition members
- [ ] Quorum calculation is accurate
- [ ] TA/DA claim calculations are correct (auto-total field)

---

## 📝 **Environment Variables**

No special env vars needed — uses standard MyJKKN Supabase variables:
```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 📞 **Questions Remaining**

1. Should shared BoS components be in `components/bos/` or `components/academic/bos/`?
2. Are document templates stored in codebase or uploaded to Supabase Storage?
3. Is there an email service configured for notice/call-letter dispatch?
4. Should BoS module appear in sidebar menu navigation?
5. Are JKKN terminology labels ("Learning Facilitator") needed in UI?
6. Does `bos_documents` table have a corresponding Supabase Storage bucket configured?

---

*Updated: 2026-05-06 | Implementation Status: ~60% Complete | Ready for Phase 4-5*
