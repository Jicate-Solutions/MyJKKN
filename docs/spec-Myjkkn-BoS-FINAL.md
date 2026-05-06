# Board of Studies (BoS) Module — Final Implementation Spec

> **Architecture: MyJKKN Primary + COE Board Reference**  
> **Status: Active Development (Phase 1-3 Complete, Phase 4-5 In Progress)**  
> **Updated: 2026-05-06**  
> **9 BoS tables live in MyJKKN Supabase. Board table references come from COE API.**

---

## 🎯 **Architecture Principle**

```
MyJKKN Supabase (BoS Operations)     COE Supabase (Shared Reference)
  │                                      │
  ├─ 9 BoS tables                       └─ boards table
  │  (experts, compositions,
  │   members, meetings, etc.)
  │
  ├─ All store board_id (UUID only)
  │  └─ Resolve board details via COE API
  │
  └─ Access Control (lib/utils/bos/bos-access.ts)
     ├─ Institution-scoped queries (MyJKKN)
     └─ Board lookup (via COE API proxy)

API Routes (app/api/bos/*)
  ├─ /experts, /compositions, /members, /meetings, etc. → MyJKKN direct
  ├─ /boards → COE API proxy (read-only)
  └─ Authenticate + Apply institution scope + Call COE where needed

Services (lib/services/bos/)
  └─ fetch() calls to proxy API routes

Hooks (hooks/bos/)
  └─ React Query wrappers

Pages (app/(routes)/bos/**)
  └─ Server + Client Components
```

**Everything in MyJKKN EXCEPT boards (comes from COE).**  
**Board table is reference-only; MyJKKN stores only board_id.**

---

## 📦 **Database Schema**

### **MyJKKN Supabase: 9 BoS Tables (All in `public` schema)**

**NOTE:** Board table is NOT in MyJKKN. It lives in COE Supabase.  
MyJKKN tables store only `board_id` (UUID reference). Board details are fetched via COE API proxy route (`/api/bos/boards`).

```sql
-- 1. External Expert Directory (reusable across departments/years)
CREATE TABLE bos_external_experts (
  id UUID PRIMARY KEY,
  institutions_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(50),
  designation VARCHAR(255),
  institution_name VARCHAR(255),
  department_name VARCHAR(255),
  address TEXT,
  contact_no VARCHAR(20),
  email VARCHAR(255),
  category VARCHAR(50) NOT NULL CHECK (category IN ('university_nominee', 'subject_expert', 'industry_expert', 'alumni')),
  specialization TEXT,
  qualifications TEXT,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- 2. BoS Composition (formal constitution for a specific board + term)
CREATE TABLE bos_compositions (
  id UUID PRIMARY KEY,
  institutions_id UUID NOT NULL,
  board_id UUID NOT NULL,
  composition_title VARCHAR(255) NOT NULL,
  term_start_date DATE NOT NULL,
  term_end_date DATE NOT NULL,
  academic_year VARCHAR(10) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  constituted_by UUID,
  ratified_by_gc BOOLEAN DEFAULT false,
  ratified_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(board_id, term_start_date)
);

-- 3. BoS Members (composition membership: internal staff + external experts)
CREATE TABLE bos_members (
  id UUID PRIMARY KEY,
  institutions_id UUID NOT NULL,
  composition_id UUID NOT NULL,
  member_type VARCHAR(30) NOT NULL CHECK (member_type IN ('chairman', 'internal_member', 'university_nominee', 'subject_expert', 'industry_expert', 'alumni')),
  staff_id UUID,
  staff_name VARCHAR(255),
  staff_designation VARCHAR(255),
  expert_id UUID,
  display_name VARCHAR(255) NOT NULL,
  display_designation VARCHAR(255),
  display_institution VARCHAR(255),
  address TEXT,
  contact_no VARCHAR(20),
  email VARCHAR(255),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  joined_date DATE,
  left_date DATE,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  CONSTRAINT bos_members_source_check CHECK (
    (staff_id IS NOT NULL AND expert_id IS NULL) OR
    (staff_id IS NULL AND expert_id IS NOT NULL)
  )
);

-- 4. BoS Meetings (meeting records with 8-state machine)
CREATE TABLE bos_meetings (
  id UUID PRIMARY KEY,
  institutions_id UUID NOT NULL,
  board_id UUID NOT NULL,
  composition_id UUID NOT NULL,
  meeting_number INTEGER NOT NULL,
  academic_year VARCHAR(10) NOT NULL,
  meeting_title VARCHAR(255),
  meeting_type VARCHAR(30) NOT NULL DEFAULT 'regular' CHECK (meeting_type IN ('regular', 'special', 'emergency', 'online')),
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'principal_approved', 'noticed', 'expert_invited', 'completed', 'minutes_drafted', 'minutes_approved', 'ratified')),
  scheduled_date DATE,
  scheduled_time TIME,
  venue VARCHAR(255),
  actual_date DATE,
  actual_start_time TIME,
  actual_end_time TIME,
  quorum_met BOOLEAN,
  submitted_for_approval_at TIMESTAMPTZ,
  principal_approved_at TIMESTAMPTZ,
  principal_approved_by UUID,
  ratified_by_ac BOOLEAN DEFAULT false,
  ratified_date DATE,
  agenda_text TEXT,
  minutes_summary TEXT,
  minutes_drafted_at TIMESTAMPTZ,
  minutes_approved_at TIMESTAMPTZ,
  minutes_approved_by UUID,
  signature_page_url TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(board_id, academic_year, meeting_number)
);

-- 5. BoS Meeting Attendees (attendance tracking per member per meeting)
CREATE TABLE bos_meeting_attendees (
  id UUID PRIMARY KEY,
  institutions_id UUID NOT NULL,
  meeting_id UUID NOT NULL,
  member_id UUID NOT NULL,
  attendance_status VARCHAR(20) NOT NULL DEFAULT 'absent' CHECK (attendance_status IN ('present', 'absent', 'leave_of_absence')),
  absence_reason TEXT,
  ta_da_eligible BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(meeting_id, member_id)
);

-- 6. BoS Agenda Items (numbered items discussed in a meeting)
CREATE TABLE bos_agenda_items (
  id UUID PRIMARY KEY,
  institutions_id UUID NOT NULL,
  meeting_id UUID NOT NULL,
  item_number INTEGER NOT NULL,
  item_title VARCHAR(255) NOT NULL,
  item_description TEXT,
  discussion_notes TEXT,
  resolution_text TEXT,
  resolution_status VARCHAR(20) CHECK (resolution_status IN ('pending', 'in_progress', 'completed', 'deferred', 'not_applicable')),
  responsible_person VARCHAR(255),
  target_date DATE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(meeting_id, item_number)
);

-- 7. BoS Resolution Actions (action tracking for follow-up on resolutions)
CREATE TABLE bos_resolution_actions (
  id UUID PRIMARY KEY,
  institutions_id UUID NOT NULL,
  agenda_item_id UUID NOT NULL,
  action_description TEXT NOT NULL,
  action_date DATE,
  action_by VARCHAR(255),
  remarks TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- 8. BoS Course Reviews (courses reviewed and approved/rejected in meetings)
CREATE TABLE bos_course_reviews (
  id UUID PRIMARY KEY,
  institutions_id UUID NOT NULL,
  meeting_id UUID NOT NULL,
  agenda_item_id UUID,
  course_id UUID NOT NULL,
  course_code VARCHAR(50) NOT NULL,
  course_name VARCHAR(255) NOT NULL,
  review_action VARCHAR(30) NOT NULL CHECK (review_action IN ('approved', 'approved_with_changes', 'rejected', 'deferred', 'noted')),
  changes_suggested TEXT,
  remarks TEXT,
  regulation_code VARCHAR(50),
  created_at TIMESTAMPTZ
);

-- 9. BoS TA/DA Claims (travel & daily allowance reimbursement for external experts)
CREATE TABLE bos_ta_da_claims (
  id UUID PRIMARY KEY,
  institutions_id UUID NOT NULL,
  meeting_id UUID NOT NULL,
  member_id UUID NOT NULL,
  expert_id UUID NOT NULL,
  travel_mode VARCHAR(50),
  travel_from VARCHAR(255),
  travel_to VARCHAR(255),
  travel_amount NUMERIC(10,2) DEFAULT 0,
  da_days NUMERIC(4,1) DEFAULT 1,
  da_rate NUMERIC(8,2) DEFAULT 0,
  da_amount NUMERIC(10,2) DEFAULT 0,
  other_amount NUMERIC(10,2) DEFAULT 0,
  other_description TEXT,
  total_amount NUMERIC(10,2) GENERATED ALWAYS AS (travel_amount + da_amount + other_amount) STORED,
  claim_status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (claim_status IN ('draft', 'submitted', 'approved', 'paid')),
  bill_number VARCHAR(50),
  payment_date DATE,
  payment_reference VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(meeting_id, member_id)
);

-- 9. BoS Documents (generated documents: notices, minutes, certificates, etc.)
CREATE TABLE bos_documents (
  id UUID PRIMARY KEY,
  institutions_id UUID NOT NULL,
  meeting_id UUID NOT NULL,
  document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('meeting_notice', 'call_letter', 'minutes_of_meeting', 'composition_certificate', 'syllabus_approval_certificate', 'ta_da_bill', 'action_taken_report')),
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_format VARCHAR(10) NOT NULL CHECK (file_format IN ('pdf', 'docx')),
  recipient_member_id UUID,
  generated_at TIMESTAMPTZ DEFAULT now(),
  generated_by UUID,
  is_latest BOOLEAN DEFAULT true
);
```

### **COE Supabase: Board Reference Table (Read-Only)**

MyJKKN does not store the board table. Board details are fetched via `/api/bos/boards` proxy route.

```sql
-- Structure (in COE, not in MyJKKN):
-- CREATE TABLE boards (
--   id UUID PRIMARY KEY,
--   institutions_id UUID NOT NULL,
--   board_code VARCHAR(50) NOT NULL,
--   board_name VARCHAR(255) NOT NULL,
--   board_type VARCHAR(100),
--   is_active BOOLEAN DEFAULT true,
--   ... other fields
-- );
```

**Key Constraints:**
- All 9 MyJKKN tables have `institutions_id` for multi-tenant isolation
- All BoS tables reference `board_id` (UUID foreign key, NOT stored locally)
- BoS meetings enforce 8-state machine via CHECK constraint
- BoS members enforce source constraint (either staff OR expert, not both)
- Composition uniqueness per board per term
- Meeting uniqueness per board per academic year per number

---

## 🏗️ **Layer Architecture (7-Layer)**

### **Layer 1: Types** (`types/bos.ts`)
- All enums, interfaces, DTOs
- Label maps for UI display
- Filter interfaces
- Response types

### **Layer 2: Database** (MyJKKN Supabase)
- 9 BoS tables (as above) — stores all operational data
- Board references only (no board table — comes from COE API)
- Direct queries via `createClient()` (MyJKKN standard)
- No ORM — use `supabase.from()` directly
- Board details resolved via `/api/bos/boards` proxy to COE

### **Layer 3: Utilities** (`lib/utils/bos/`)
- `bos-access.ts` — Institution scope resolution + guard functions
- `bos-pdf-generator.ts` — Document generation utilities

### **Layer 4: Services** (`lib/services/bos/`)
- 8 service classes (Expert, Composition, Member, Meeting, Agenda, Attendance, CourseReview, TaDa)
- Each service: `fetch()` calls to proxy API routes
- Pattern: static class with `baseUrl` per entity

### **Layer 5: Hooks** (`hooks/bos/`)
- 7 React Query hooks
- Query keys: `['bos-entities', filters]`
- Mutations: create, update, delete with toast notifications

### **Layer 6: API Routes** (`app/api/bos/`)
- 24 routes handling GET/POST/PUT/DELETE/PATCH
- Every route:
  1. Authenticate user
  2. Resolve institution scope
  3. Apply scope to queries
  4. Guard writes
  5. Return response

### **Layer 7: Pages & Components**
- **Pages** (`app/(routes)/bos/`): Server + Client components
- **Shared Components** (`components/bos/`): Badge, status, grids, panels

---

## 📂 **File Structure (Complete)**

```
MyJKKN/
├── types/bos.ts                                      ✅ Layer 1

├── lib/
│   ├── utils/bos/
│   │   ├── bos-access.ts                             ✅ Access control
│   │   └── bos-pdf-generator.ts                      ✅ Document generation
│   │
│   └── services/bos/                                 ✅ Layer 4
│       ├── bos-expert-service.ts
│       ├── bos-composition-service.ts
│       ├── bos-member-service.ts
│       ├── bos-meeting-service.ts
│       ├── bos-agenda-service.ts
│       ├── bos-attendance-service.ts
│       ├── bos-course-review-service.ts
│       └── bos-ta-da-service.ts

├── hooks/bos/                                        ✅ Layer 5
│   ├── use-bos-experts.ts
│   ├── use-bos-compositions.ts
│   ├── use-bos-members.ts
│   ├── use-bos-meetings.ts
│   ├── use-bos-agenda.ts
│   ├── use-bos-attendance.ts
│   └── use-bos-ta-da.ts

├── components/bos/                                   🟡 Partial
│   ├── member-category-badge.tsx                     ❌ TODO
│   ├── meeting-status-badge.tsx                      ❌ TODO
│   ├── attendance-grid.tsx                           ❌ TODO
│   ├── resolution-tracker.tsx                        ❌ TODO
│   ├── meeting-timeline.tsx                          ❌ TODO
│   └── document-download-panel.tsx                   ❌ TODO

├── app/
│   ├── api/bos/                                      ✅ Layer 6 (24 routes)
│   │   ├── experts/route.ts                          ✅ GET, POST
│   │   ├── experts/[id]/route.ts                     ✅ GET, PUT, DELETE
│   │   ├── compositions/route.ts                     ✅ GET, POST
│   │   ├── compositions/[id]/route.ts                ✅ GET, PUT, DELETE
│   │   ├── members/route.ts                          ✅ GET, POST
│   │   ├── members/[id]/route.ts                     ✅ PUT, DELETE
│   │   ├── meetings/route.ts                         ✅ GET, POST
│   │   ├── meetings/next-number/route.ts             ✅ GET
│   │   ├── meetings/[id]/route.ts                    ✅ GET, PUT
│   │   ├── meetings/[id]/status/route.ts             ✅ PATCH (state transitions)
│   │   ├── meetings/[id]/agenda/route.ts             ✅ GET, POST
│   │   ├── meetings/[id]/courses/route.ts            ✅ GET, POST
│   │   ├── meetings/[id]/attendance/route.ts         ✅ GET, POST
│   │   ├── agenda/[id]/route.ts                      ✅ PUT, DELETE
│   │   ├── agenda/[id]/actions/route.ts              ✅ POST
│   │   ├── actions/[id]/route.ts                     ✅ GET, PUT, DELETE
│   │   ├── ta-da/route.ts                            ✅ GET, POST
│   │   ├── ta-da/[id]/route.ts                       ✅ PUT, DELETE
│   │   ├── reports/composition/route.ts              ✅ GET
│   │   ├── reports/meeting-register/route.ts         ✅ GET
│   │   ├── reports/resolution-compliance/route.ts    ✅ GET
│   │   ├── boards/route.ts                           ✅ GET
│   │   ├── institutions/route.ts                     ✅ GET
│   │   └── courses/[id]/route.ts                     ✅ GET
│   │
│   └── (routes)/bos/                                 ✅ Layer 7
│       ├── layout.tsx                                ✅ Navigation
│       ├── nav-config.ts                             ✅ Menu config
│       ├── page.tsx                                  ✅ Dashboard
│       │
│       ├── experts/
│       │   ├── page.tsx                              ✅ List
│       │   ├── new/page.tsx                          ✅ Create
│       │   ├── [id]/edit/page.tsx                    ✅ Edit
│       │   ├── _components/                          ✅ 6 components
│       │   └── _data/get-experts.ts                  ✅ Server fetch
│       │
│       ├── compositions/
│       │   ├── page.tsx                              ✅ List
│       │   ├── new/page.tsx                          ✅ Create
│       │   ├── [compositionId]/page.tsx              ✅ Detail
│       │   ├── [compositionId]/edit/page.tsx         ✅ Edit
│       │   ├── _components/                          ✅ 6 components
│       │   └── _data/
│       │
│       ├── meetings/
│       │   ├── page.tsx                              ✅ List
│       │   ├── new/page.tsx                          ✅ Create
│       │   ├── [meetingId]/page.tsx                  ✅ Detail hub
│       │   ├── [meetingId]/edit/page.tsx             ✅ Edit
│       │   ├── _components/                          ✅ 9 components
│       │   │   ├── agenda-tab.tsx                    ✅ Agenda view
│       │   │   ├── attendance-tab.tsx                ✅ Attendance view
│       │   │   ├── documents-tab.tsx                 ✅ Documents view
│       │   │   ├── meeting-status-stepper.tsx        ✅ 8-state visualizer
│       │   │   └── ... (more)
│       │
│       └── reports/
│           └── page.tsx                              🟡 Partial

└── docs/
    └── spec-Myjkkn-BoS-FINAL.md                     📄 This file
```

---

## 🔐 **Access Control (Complete Implementation)**

### **Pattern Used in Every API Route**

```typescript
// Step 1: Authenticate
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return 401;

// Step 2: Resolve scope
const scope = await resolveBosAccess(user.id);

// Step 3: Apply scope to query
if (scope.isSuperAdmin) {
  // Query all institutions (super admin)
} else {
  // Force query to own institution
  query = query.eq('institutions_id', scope.institutionsId);
}

// Step 4: Guard writes
const writeError = guardInstitutionWrite(scope, body.institutions_id);
if (writeError) return 403;
```

### **Scope Resolution**
```typescript
interface BosAccessScope {
  isSuperAdmin: boolean;      // From profiles.is_super_admin
  institutionsId: string | null;  // From profiles.institution_id
  role: string | null;         // From profiles.role
}
```

---

## 📌 **Board Reference (COE API Integration)**

Board table is NOT in MyJKKN Supabase. It lives in COE Supabase and is accessed via proxy API route.

### **How Board References Work**

1. **MyJKKN stores only `board_id`** (UUID)
   - `bos_compositions.board_id`
   - `bos_meetings.board_id`

2. **Board details fetched via COE proxy**
   - Route: `/api/bos/boards` (proxy to COE)
   - Returns: `{ board_code, board_name, board_type, ... }`
   - Cached in React Query hooks for performance

3. **When to fetch board details**
   - List/create compositions: fetch available boards
   - Create/edit meetings: fetch board name for display
   - Reports: fetch board code for headers

### **API Route Pattern**

The `/api/bos/boards` route is a COE proxy that:
1. Authenticates the user in MyJKKN
2. Maps MyJKKN institutions_id → COE institutions (via myjkkn_institution_ids)
3. Calls COE's `/api/public/boards` REST endpoint
4. Deduplicates and returns board list (no pagination for board dropdowns)

```typescript
// app/api/bos/boards/route.ts (existing)
// Returns: BoardItem[] (simple array, suitable for dropdowns)

const coe = CoeRestClient.create();
const coeInstitutions = await coe.get('/api/v1/institutions');
// Filter by myjkkn_institution_ids to find matching COE institutions
// Then fetch boards for each COE institution
const boards = await coe.get('/api/public/boards', { institution_code });
// Deduplicate and return
return NextResponse.json(allBoards);
```

### **Client-Side Usage**

```typescript
// hooks/bos/use-bos-boards.ts
export function useBosBoards(filters?: BosExpertFilters) {
  return useQuery({
    queryKey: ['bos-boards', filters],
    queryFn: () => BosService.getBoards(filters),
  });
}

// In a component:
const { data: boards } = useBosBoards({ isActive: true });
```

---

## 🔄 **Meeting State Machine (8 States)**

All transitions validated server-side in `/api/bos/meetings/[id]/status` PATCH route.

```
draft ←→ principal_approved ←→ noticed ←→ expert_invited
                                         ↓
                                    completed ←→ minutes_drafted
                                                    ↓
                                        minutes_approved ←→ minutes_approved
                                                    ↓
                                                 ratified
```

**Bidirectional Transitions Allowed** (except ratified → anything)

**Guard Conditions:**
- Cannot move to `completed` without attendance records
- Cannot move to `minutes_drafted` without agenda items
- Transitions populate metadata (timestamps, approver IDs)

---

## 📊 **Implementation Status**

### **Phase 1: Foundation** ✅ 90%
- [x] Types (types/bos.ts)
- [x] Access control (bos-access.ts)
- [x] Expert directory (API + pages)
- [x] Composition management (API + pages)
- [ ] **Board service + hook** (COE integration) — **TODO**
- [ ] Shared components — **TODO**

### **Phase 2: Meeting Lifecycle** ✅ 90%
- [x] Meeting CRUD (API + pages)
- [x] State machine (8 states, bidirectional)
- [x] Status stepper component
- [x] Auto-numbering per board/year

### **Phase 3: Agenda, Attendance, Courses** ✅ 85%
- [x] Agenda items CRUD
- [x] Resolution actions
- [x] Attendance grid + quorum
- [x] Course review linking

### **Phase 4: Document Generation** 🟡 40%
- [x] PDF generator utility exists
- [ ] Document generation API routes — **TODO**
- [ ] DOCX templates — **TODO**
- [ ] Document download component — **TODO**
- [ ] Email dispatch — **TODO**

### **Phase 5: TA/DA & Reports** 🟡 50%
- [x] TA/DA CRUD (API + pages)
- [x] Report API routes
- [ ] Reports dashboard UI — **TODO**
- [ ] Export to PDF/DOCX/Excel — **TODO**

---

## 📋 **Remaining Work (High Priority)**

### **P0 — Critical (Foundation)**
0. **Board service setup (COE Integration)** ✅ DONE
   - [x] `/api/bos/boards/route.ts` exists (CoeRestClient proxy)
   - [x] `lib/services/bos/bos-board-service.ts` created
   - [x] `hooks/bos/use-bos-boards.ts` created
   - [x] types/bos.ts updated with BosBoard interface
   - [ ] Update existing BoS forms to use `useBosBoards()` hook for board dropdowns

### **P0 — Critical (Needed for Phase 4)**
1. **Build shared BoS components** (`components/bos/`)
   - [ ] Member category badges
   - [ ] Meeting status badges
   - [ ] Attendance grid
   - [ ] Resolution tracker
   - [ ] Meeting timeline stepper

2. **Complete document generation**
   - [ ] Review `bos-pdf-generator.ts` (assess what's done)
   - [ ] Build `/api/bos/documents` routes (POST generate, GET list)
   - [ ] DOCX templates for:
     - Meeting notice
     - Call letters
     - Minutes of meeting
   - [ ] Document download panel component

### **P1 — Important (Phase 5)**
3. **Build reports dashboard**
   - [ ] `/bos/reports` page layout
   - [ ] Composition report component + rendering
   - [ ] Meeting register table
   - [ ] Resolution compliance table
   - [ ] Export functionality (PDF/DOCX/Excel)

4. **Optional enhancements**
   - [ ] Email dispatch integration
   - [ ] BoS Coordinator role (if not exists)
   - [ ] Sidebar menu registration
   - [ ] Mobile responsiveness refinements
   - [ ] JKKN terminology labels (Learning Facilitator, etc.)

---

## 🔧 **Development Guidelines**

### **Database Queries**

**For all BoS tables (in MyJKKN):**
```typescript
// ✅ CORRECT: Use MyJKKN Supabase directly
const supabase = await createClient();
const { data } = await supabase
  .from('bos_external_experts')
  .select('*')
  .eq('institutions_id', scope.institutionsId);
```

**For board reference (from COE REST API):**
```typescript
// ✅ CORRECT: Use CoeRestClient to call COE REST API (in API routes only)
const coe = CoeRestClient.create();

// 1. Resolve MyJKKN institutions_id → COE institutions (via myjkkn_institution_ids)
const coeInstitutions = await coe.get<CoeInstitution[]>('/api/v1/institutions');
const matchedCoeInstitutions = coeInstitutions.filter(ci =>
  (ci.myjkkn_institution_ids ?? []).includes(myjkknInstitutionsId)
);

// 2. Fetch boards for each COE institution
for (const ci of matchedCoeInstitutions) {
  const boards = await coe.get('/api/public/boards', {
    institution_code: ci.institution_code,
  });
  // Process boards...
}

// NOTE: CoeRestClient uses COE_API_URL, COE_API_KEY_ID, COE_API_SECRET from .env
// No direct database access — boards are queried via COE's public REST API
```

### **Service Pattern**
```typescript
// All services use fetch() to API routes
export class BosExpertService {
  private static baseUrl = '/api/bos/experts';
  
  static async getExperts(filters) {
    const params = new URLSearchParams(filters);
    const res = await fetch(`${this.baseUrl}?${params}`);
    return res.json();
  }
}
```

### **Hook Pattern**
```typescript
// React Query for all data fetching
export function useBosExperts(filters) {
  return useQuery({
    queryKey: ['bos-experts', filters],
    queryFn: () => BosExpertService.getExperts(filters),
  });
}
```

### **API Route Pattern**
```typescript
// Every route: Auth → Scope → Query → Guard → Response
export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const scope = await resolveBosAccess(user.id);
  // Apply scope, guard writes, return data
}
```

---

## 🎓 **Key Concepts**

### **Institution Scoping**
- Every table has `institutions_id` column
- Super admin sees all institutions
- Regular users see only their own institution
- Applied at query level: `query.eq('institutions_id', scope.institutionsId)`

### **Multi-Tenancy**
- Single MyJKKN Supabase instance
- Multiple institutions' data coexist
- Isolation enforced by `institutions_id` checks in every route

### **State Machine**
- 8 meeting states, all valid transitions in both directions (except ratified)
- Validated server-side only
- Metadata captured at each transition (timestamps, approver IDs)

---

## 📝 **Database Migration**

**MyJKKN Supabase Migration:**
Ensure migration file exists:
```
supabase/migrations/YYYYMMDD_create_bos_tables.sql
```

Create with all 9 CREATE TABLE statements (see "Database Schema" section above).

**Apply migration:**
```bash
npx supabase db push
```

**COE REST API (Prerequisite):**
No schema setup needed from MyJKKN. Board data is fetched from COE via REST API endpoints:
- `/api/v1/institutions` — Maps MyJKKN institutions to COE institutions
- `/api/public/boards` — Returns boards for a given institution code

Ensure `.env.local` has COE credentials:
```
COE_API_URL=http://localhost:3001 (or https://coe.jkkn.ai)
COE_API_KEY_ID=your_key_id
COE_API_SECRET=your_secret
```

---

## ✅ **Quality Checklist**

- [ ] All API routes authenticate + scope requests
- [ ] Super admin can access all institutions
- [ ] Regular users cannot see other institutions' data
- [ ] Write guards prevent cross-institution writes
- [ ] State machine rejects invalid transitions with 400
- [ ] Auto-numbering works per board + academic year
- [ ] Attendance grid pre-populates all members
- [ ] Quorum calculation accurate (≥50% present)
- [ ] TA/DA auto-total calculates correctly
- [ ] All pages are mobile-responsive
- [ ] All toasts show appropriate messages
- [ ] Error handling for all failures

---

## 🚀 **Next Immediate Actions**

1. **Review what's done**: Check all 24 API routes, 8 services, 7 hooks
2. **Identify blocking issues**: Any bugs in Phase 1-3?
3. **Prioritize Phase 4**: Document generation or Phase 5 reports?
4. **Build shared components**: Foundation for remaining UI work
5. **Execute implementation**: Use `executing-plans` skill to track progress

---

## 📞 **Reference**

- **All data**: MyJKKN Supabase (10 tables)
- **All code**: MyJKKN codebase only
- **No COE integration**: Simplified from original spec
- **Architecture**: 7-layer (Types → Database → Services → Hooks → API → Pages)
- **Access control**: Institution-scoped via `bos-access.ts`
- **Development**: Next.js 15, TypeScript, React Query, Supabase

---

*Final Spec | MyJKKN-Only Architecture | 2026-05-06*
