# Board of Studies (BoS) Module Implementation Spec

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Build a full Board of Studies (BoS) management module for JKKN autonomous colleges, covering BoS composition management, meeting lifecycle (Draft → Approval → Notices → Meeting → Minutes → Ratification), document generation (meeting notices, call letters, minutes, certificates), resolution tracking with action follow-up, course/syllabus review linkage, and NAAC/NBA-ready reports. All operational tables reside in the **COE database**; the frontend is served from **MyJKKN** via proxy API routes.

**Architecture:** 7-layer pattern (Database → Types → Services → React Query Hooks → Server Data (_data/) → Components → Pages). COE database is accessed from MyJKKN via Next.js proxy API routes using a COE Supabase service-role client. Meetings follow a strict state machine. Documents are generated as DOCX (template-fill) with PDF export.

> **Skill Reference:** This module follows the `myjkkn-page-development` skill conventions exactly.
> Refer to `.claude/skills/myjkkn-page-development/SKILL.md` for full layer templates and component patterns.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase PostgreSQL (COE project), React Query (`@tanstack/react-query`) for hooks, Shadcn UI, Tailwind CSS, docx / pdf-lib for document generation.

---

## Regulatory & Institutional Context

### What is the Board of Studies?

The Board of Studies (BoS) is the primary academic body mandated by UGC/NAAC for every autonomous college. It is responsible for:
- Designing, reviewing, and approving curricula and syllabi for all programs under its purview
- Recommending new courses, credit structures, and evaluation methods
- Ensuring industry relevance and alignment with national education policy
- Meeting at least **once every six months** (UGC guideline)
- Providing documented evidence of academic governance for NAAC Criterion 1 & 2 and NBA SAR

### Applicable Regulatory Bodies

| Body | Role |
|---|---|
| **NAAC** | Criterion 1.1 (Curriculum Design), Criterion 2.1 (Student Enrolment); BoS records are primary evidence |
| **UGC** | Mandates BoS composition and minimum meeting frequency for autonomous colleges |
| **AICTE** | Engineering/technical programs: BoS must include industry representatives |
| **IQAC** | Internal Quality Assurance Cell coordinates BoS record-keeping and action reports |

### BoS Composition (UGC Standard)

| Position | Category | Source in System |
|---|---|---|
| Chairman | Head of Department | Auto-linked from staff/department records |
| Internal Members | All departmental faculty | Linked from learning facilitator (staff) records |
| University Nominee | Expert nominated by VC/university | External Expert Directory |
| Subject Expert | External expert from another institution | External Expert Directory |
| Industry Representative | Corporate/industry professional | External Expert Directory |
| Alumni | Meritorious alumnus | External Expert Directory |

**Term:** 3 years (UGC norm). System tracks term start/end and alerts HOD 60 days before expiry.

### BoS Structure in JKKN

- Each **Board** (`board` table in COE database) represents one BoS entity (e.g., "PG Computer Science Board")
- One board covers one or more programs/regulations
- All BoS tables reference `board.id` as the parent key
- `courses.board_id` links courses to the approving board

---

## Terminology

Standard academic terminology is used throughout (for NAAC/NBA compliance in official documents).

| Term | Used In |
|---|---|
| Board of Studies / BoS | Module name, official documents |
| Chairman | HOD role in BoS |
| Member | Internal faculty member |
| Subject Expert | External expert from another institution |
| University Nominee | Expert nominated by the Vice-Chancellor |
| Meeting Notice | Internal communication to members |
| Call Letter | Formal invitation sent to external experts |
| Minutes of Meeting | Official record of proceedings |
| Resolution | Decision/recommendation passed in a meeting |
| Action Taken Report | Record of how each resolution was implemented |
| Composition | The formal list of members for a BoS term |
| Syllabus Approval | Formal record of a course/regulation approved by BoS |

> **JKKN Internal UI Labels:** Use JKKN terminology where applicable —
> "Learning Facilitators" for internal members (faculty), "Learning Framework" for syllabus,
> "Learner" for student. Official document output always uses standard academic terms.

---

## System Architecture

### Data Flow

```
COE Database (Supabase)
  └── board, courses, departments, institutions (existing)
  └── bos_compositions, bos_members, bos_external_experts (NEW)
  └── bos_meetings, bos_agenda_items, bos_resolutions (NEW)
  └── bos_meeting_attendees, bos_course_reviews (NEW)
  └── bos_ta_da_claims, bos_documents, bos_attachments (NEW)
       ↑
       │  COE Supabase Service Role Client
       │  (createCoeSupabaseClient → process.env.COE_SUPABASE_URL)
       ↑
MyJKKN Next.js API Routes (Proxy Layer)
  └── app/api/bos/*  ← authenticates MyJKKN user, then queries COE
       ↑
       │  fetch('/api/bos/...')
       ↑
MyJKKN Service Layer
  └── lib/services/bos/*.ts  ← calls proxy API routes
       ↑
MyJKKN Hooks
  └── hooks/bos/*.ts
       ↑
MyJKKN Pages & Components
  └── app/(routes)/academic/bos/**
  └── components/academic/bos/**
```

### Multi-Institution Access Control

JKKN deploys a single MyJKKN instance shared across multiple colleges (institutions). BoS data is partitioned by `institutions_id` on every table. Access is enforced **server-side** in every API route using `lib/utils/bos-access.ts`.

#### Access Tiers

| User Type | `is_super_admin` | `role` | Access Scope |
|---|---|---|---|
| **Super Admin** | `true` | any | ALL institutions — no `institutions_id` filter applied |
| **Principal** | `false` | `principal` | Own institution only (`profile.institution_id` forced on all queries) |
| **HOD / Faculty** | `false` | `hod` / `faculty` | Own institution only; board scope via `bos_members.staff_id` |
| **Board Member** | `false` | any | Own institution; assigned to specific boards via `bos_members.staff_id` |

#### Data Flow — Multi-Institution Access

```
MyJKKN User (JWT)
       │
       ▼
API Route: auth check → resolveBosAccess(user.id)
       │
       ├── is_super_admin = true → no institution filter, query all
       │
       └── is_super_admin = false
               │
               ▼
           profile.institution_id → forced onto all SELECT/INSERT/UPDATE
               │
               ├── GET  → .eq('institutions_id', scope.institutionsId)
               └── POST → guardInstitutionWrite(scope, body.institutions_id)
                          → 403 if mismatch
```

#### Institution → Board Assignment

Board membership is tracked via `bos_members`:
- `bos_members.staff_id` — links a MyJKKN staff record (HOD/faculty) to a composition
- `bos_members.institutions_id` — ensures member is scoped to their institution
- `bos_members.composition_id → bos_compositions.board_id` — resolves which board the member belongs to

A staff member becomes a **Board Member** when they are added to a `bos_compositions` record for a specific `board_id` within their institution. No separate access-control table is required — membership itself is the authority.

#### Key Files

| File | Purpose |
|---|---|
| `lib/utils/bos-access.ts` | `resolveBosAccess()`, `applyInstitutionScope()`, `guardInstitutionWrite()` |
| `app/api/bos/meetings/route.ts` | GET + POST scoped |
| `app/api/bos/compositions/route.ts` | GET + POST scoped |
| `app/api/bos/boards/route.ts` | GET scoped |
| `app/api/bos/experts/route.ts` | GET + POST scoped |
| `app/api/bos/ta-da/route.ts` | GET + POST scoped |

---

### Meeting State Machine

```
DRAFT
  │
  ▼ (HOD submits for approval)
PRINCIPAL_APPROVED
  │
  ▼ (Notices generated & sent to internal members)
NOTICED
  │
  ▼ (Call letters generated & sent to external experts)
EXPERT_INVITED
  │
  ▼ (Meeting conducted, attendance recorded)
COMPLETED
  │
  ▼ (Minutes drafted and saved)
MINUTES_DRAFTED
  │
  ▼ (HOD/Chairman reviews and approves minutes)
MINUTES_APPROVED
  │
  ▼ (Academic Council ratification date recorded)
RATIFIED
```

---

## Database Schema (COE Database)

> **CRITICAL:** Create a new migration file in the COE project:
> `D:\JKKN\Development\Application\COE\jkkncoe\supabase\migrations\20260306_create_bos_tables.sql`
> Follow the existing COE migration file naming convention: `YYYYMMDD_description.sql`
> NEVER create standalone SQL files or modify existing migration files.

### Existing Tables Referenced (COE Database)

```sql
-- Already exists — do NOT modify
public.board         -- BoS entity (board_id, board_code, board_name, board_type, institutions_id)
                     -- board.institutions_id is the primary tenant key for all BoS data
public.courses       -- Courses with board_id FK → board
public.departments   -- Department data
public.institutions  -- Institution data (one row per college in JKKN group)
```

> **Multi-Institution Note:** Every BoS table carries `institutions_id` to support the JKKN
> group of colleges. `board.institutions_id` is the root authority — all child tables
> (compositions, meetings, members, etc.) inherit their institution from the board they belong
> to. The `bos_members.staff_id` column links a MyJKKN staff profile to a board, forming the
> institution→board assignment for HODs and faculty.

### Table: `bos_external_experts`

Master directory of external experts reusable across departments and meeting years.

```sql
CREATE TABLE bos_external_experts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  title               VARCHAR(50),               -- Dr., Prof., Mr., Ms.
  designation         VARCHAR(255),              -- e.g., "Assistant Professor"
  institution_name    VARCHAR(255),              -- Employing institution (if academic)
  department_name     VARCHAR(255),
  address             TEXT,
  contact_no          VARCHAR(20),
  email               VARCHAR(255),
  category            VARCHAR(50) NOT NULL CHECK (category IN (
    'university_nominee', 'subject_expert', 'industry_expert', 'alumni'
  )),
  specialization      TEXT,
  qualifications      TEXT,                      -- e.g., "MCA, M.Phil, ME(CSE), Ph.D."
  is_active           BOOLEAN DEFAULT true,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
```

### Table: `bos_compositions`

Formal constitution of a BoS for a specific board and term period.

```sql
CREATE TABLE bos_compositions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  board_id            UUID NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  composition_title   VARCHAR(255) NOT NULL,     -- e.g., "2024-2027 Composition"
  term_start_date     DATE NOT NULL,
  term_end_date       DATE NOT NULL,             -- term_start + 3 years
  academic_year       VARCHAR(10) NOT NULL,      -- e.g., "2024-25"
  is_active           BOOLEAN DEFAULT true,      -- only one active composition per board
  constituted_by      UUID,                      -- staff ID who constituted this BoS
  ratified_by_gc      BOOLEAN DEFAULT false,     -- Governing Council ratified
  ratified_date       DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE(board_id, term_start_date)
);
```

### Table: `bos_members`

Individual members belonging to a composition.

```sql
CREATE TABLE bos_members (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  composition_id      UUID NOT NULL REFERENCES bos_compositions(id) ON DELETE CASCADE,
  member_type         VARCHAR(30) NOT NULL CHECK (member_type IN (
    'chairman', 'internal_member', 'university_nominee',
    'subject_expert', 'industry_expert', 'alumni'
  )),
  -- Internal members (faculty/staff from MyJKKN)
  staff_id            UUID,                      -- NULL for external members
  staff_name          VARCHAR(255),              -- denormalized for display
  staff_designation   VARCHAR(255),
  -- External members
  expert_id           UUID REFERENCES bos_external_experts(id),
  -- Display fields (computed/denormalized)
  display_name        VARCHAR(255) NOT NULL,
  display_designation VARCHAR(255),
  display_institution VARCHAR(255),
  address             TEXT,
  contact_no          VARCHAR(20),
  email               VARCHAR(255),
  sort_order          INTEGER DEFAULT 0,
  is_active           BOOLEAN DEFAULT true,
  joined_date         DATE,
  left_date           DATE,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT bos_members_source_check CHECK (
    (staff_id IS NOT NULL AND expert_id IS NULL) OR
    (staff_id IS NULL AND expert_id IS NOT NULL)
  )
);
```

### Table: `bos_meetings`

BoS meeting records with full state machine.

```sql
CREATE TABLE bos_meetings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  board_id            UUID NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  composition_id      UUID NOT NULL REFERENCES bos_compositions(id),
  meeting_number      INTEGER NOT NULL,          -- auto: sequential per board per academic_year
  academic_year       VARCHAR(10) NOT NULL,      -- e.g., "2024-25"
  meeting_title       VARCHAR(255),              -- e.g., "Second Meeting of PG CS BoS"
  meeting_type        VARCHAR(30) NOT NULL CHECK (meeting_type IN (
    'regular', 'special', 'emergency', 'online'
  )) DEFAULT 'regular',
  status              VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'principal_approved', 'noticed', 'expert_invited',
    'completed', 'minutes_drafted', 'minutes_approved', 'ratified'
  )),
  -- Scheduling
  scheduled_date      DATE,
  scheduled_time      TIME,
  venue               VARCHAR(255),
  -- Conduct
  actual_date         DATE,
  actual_start_time   TIME,
  actual_end_time     TIME,
  quorum_met          BOOLEAN,
  -- Approval trail
  submitted_for_approval_at  TIMESTAMPTZ,
  principal_approved_at      TIMESTAMPTZ,
  principal_approved_by      UUID,               -- staff_id of principal
  -- Ratification
  ratified_by_ac      BOOLEAN DEFAULT false,     -- Academic Council ratified
  ratified_date       DATE,
  -- Agenda
  agenda_text         TEXT,                      -- overall meeting agenda description
  -- Minutes
  minutes_summary     TEXT,                      -- overall meeting summary
  minutes_drafted_at  TIMESTAMPTZ,
  minutes_approved_at TIMESTAMPTZ,
  minutes_approved_by UUID,
  -- Signature page
  signature_page_url  TEXT,                      -- uploaded scanned signature page
  notes               TEXT,
  created_by          UUID,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE(board_id, academic_year, meeting_number)
);
```

### Table: `bos_meeting_attendees`

Attendance record per member per meeting.

```sql
CREATE TABLE bos_meeting_attendees (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id          UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,
  member_id           UUID NOT NULL REFERENCES bos_members(id),
  attendance_status   VARCHAR(20) NOT NULL CHECK (attendance_status IN (
    'present', 'absent', 'leave_of_absence'
  )) DEFAULT 'absent',
  absence_reason      TEXT,
  ta_da_eligible      BOOLEAN DEFAULT false,     -- external experts only
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE(meeting_id, member_id)
);
```

### Table: `bos_agenda_items`

Individual agenda items discussed in a meeting.

```sql
CREATE TABLE bos_agenda_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id          UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,
  item_number         INTEGER NOT NULL,          -- 1, 2, 3...
  item_title          VARCHAR(255) NOT NULL,     -- e.g., "Framing of Syllabus for 2024-25"
  item_description    TEXT,
  discussion_notes    TEXT,                      -- what was discussed
  resolution_text     TEXT,                      -- the resolution passed (can be null if no resolution)
  resolution_status   VARCHAR(20) CHECK (resolution_status IN (
    'pending', 'in_progress', 'completed', 'deferred', 'not_applicable'
  )),
  responsible_person  VARCHAR(255),              -- who is responsible for action
  target_date         DATE,
  sort_order          INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE(meeting_id, item_number)
);
```

### Table: `bos_resolution_actions`

Action tracking for follow-up on resolutions.

```sql
CREATE TABLE bos_resolution_actions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  agenda_item_id      UUID NOT NULL REFERENCES bos_agenda_items(id) ON DELETE CASCADE,
  action_description  TEXT NOT NULL,
  action_date         DATE,
  action_by           VARCHAR(255),
  remarks             TEXT,
  status              VARCHAR(20) NOT NULL CHECK (status IN (
    'pending', 'in_progress', 'completed'
  )) DEFAULT 'pending',
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
```

### Table: `bos_course_reviews`

Courses reviewed and approved/rejected in a specific meeting.

```sql
CREATE TABLE bos_course_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id          UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,
  agenda_item_id      UUID REFERENCES bos_agenda_items(id),
  course_id           UUID NOT NULL,             -- references COE courses.id
  course_code         VARCHAR(50) NOT NULL,      -- denormalized
  course_name         VARCHAR(255) NOT NULL,     -- denormalized
  review_action       VARCHAR(30) NOT NULL CHECK (review_action IN (
    'approved', 'approved_with_changes', 'rejected', 'deferred', 'noted'
  )),
  changes_suggested   TEXT,
  remarks             TEXT,
  regulation_code     VARCHAR(50),
  created_at          TIMESTAMPTZ DEFAULT now()
);
```

### Table: `bos_ta_da_claims`

TA/DA reimbursement tracking for external experts.

```sql
CREATE TABLE bos_ta_da_claims (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id          UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,
  member_id           UUID NOT NULL REFERENCES bos_members(id),
  expert_id           UUID NOT NULL REFERENCES bos_external_experts(id),
  -- Travel
  travel_mode         VARCHAR(50),               -- bus, train, air, own vehicle
  travel_from         VARCHAR(255),
  travel_to           VARCHAR(255),
  travel_amount       NUMERIC(10,2) DEFAULT 0,
  -- Daily allowance
  da_days             NUMERIC(4,1) DEFAULT 1,
  da_rate             NUMERIC(8,2) DEFAULT 0,
  da_amount           NUMERIC(10,2) DEFAULT 0,
  -- Other
  other_amount        NUMERIC(10,2) DEFAULT 0,
  other_description   TEXT,
  total_amount        NUMERIC(10,2) GENERATED ALWAYS AS (
    travel_amount + da_amount + other_amount
  ) STORED,
  -- Status
  claim_status        VARCHAR(20) NOT NULL CHECK (claim_status IN (
    'draft', 'submitted', 'approved', 'paid'
  )) DEFAULT 'draft',
  bill_number         VARCHAR(50),
  payment_date        DATE,
  payment_reference   VARCHAR(100),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE(meeting_id, member_id)
);
```

### Table: `bos_documents`

Generated documents metadata (notices, call letters, minutes PDFs).

```sql
CREATE TABLE bos_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id          UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,
  document_type       VARCHAR(50) NOT NULL CHECK (document_type IN (
    'meeting_notice', 'call_letter', 'minutes_of_meeting',
    'composition_certificate', 'syllabus_approval_certificate',
    'ta_da_bill', 'action_taken_report'
  )),
  file_name           VARCHAR(255) NOT NULL,
  file_url            TEXT NOT NULL,             -- Supabase Storage URL
  file_format         VARCHAR(10) NOT NULL CHECK (file_format IN ('pdf', 'docx')),
  recipient_member_id UUID REFERENCES bos_members(id),  -- NULL = general document
  generated_at        TIMESTAMPTZ DEFAULT now(),
  generated_by        UUID,
  is_latest           BOOLEAN DEFAULT true       -- supersedes previous versions
);
```

---

## Module Structure (MyJKKN Folder Conventions — 7-Layer)

> Follows the `myjkkn-page-development` skill structure exactly.
> BoS is under the `academic` module group. Services use `fetch()` (not direct Supabase) because data lives in the COE database accessed via proxy API routes.

```
MyJKKN/
│
├── types/
│   └── bos.ts                                    # Layer 2: All BoS TypeScript interfaces
│
├── lib/supabase/
│   └── coe-client.ts                             # NEW — COE Supabase server client
│
├── lib/services/academic/                         # Layer 3: Service layer (fetch-based proxy)
│   ├── bos-composition-service.ts
│   ├── bos-member-service.ts
│   ├── bos-expert-service.ts
│   ├── bos-meeting-service.ts
│   ├── bos-agenda-service.ts
│   ├── bos-attendance-service.ts
│   ├── bos-course-review-service.ts
│   ├── bos-ta-da-service.ts
│   └── bos-document-service.ts
│
├── hooks/academic/                                # Layer 4: React Query hooks
│   ├── use-bos-compositions.ts
│   ├── use-bos-members.ts
│   ├── use-bos-experts.ts
│   ├── use-bos-meetings.ts
│   ├── use-bos-agenda.ts
│   ├── use-bos-attendance.ts
│   └── use-bos-documents.ts
│
├── components/academic/bos/                       # Layer 6: Shared BoS UI components
│   ├── member-category-badge.tsx                  # Color-coded: Chairman/Internal/External
│   ├── meeting-status-badge.tsx                   # State machine status chip
│   ├── composition-member-card.tsx                # Member card with photo placeholder
│   ├── meeting-timeline.tsx                       # Visual state machine progress
│   ├── attendance-grid.tsx                        # Present/Absent toggle grid
│   ├── resolution-tracker.tsx                     # Agenda items + resolutions + actions
│   └── document-download-panel.tsx                # Download notices/minutes
│
├── app/(routes)/academic/bos/                     # Layer 7: Pages
│   │
│   ├── layout.tsx                                 # BoS sub-navigation layout
│   ├── page.tsx                                   # BoS Dashboard (Server Component)
│   │
│   ├── experts/                                   # External Expert Directory
│   │   ├── page.tsx                               # Server Component — list page
│   │   ├── new/page.tsx                           # Client Component — create form
│   │   ├── [id]/edit/page.tsx                     # Client Component — edit form
│   │   └── _components/
│   │       ├── columns.tsx                        # TanStack Table column defs
│   │       ├── expert-data-table.tsx              # DataTable wrapper + toolbar
│   │       ├── expert-form.tsx                    # Create/Edit form (shared)
│   │       ├── expert-filters.tsx                 # Filter UI (presentation)
│   │       ├── expert-filters-client.tsx          # Filter logic (URL state)
│   │       ├── row-actions.tsx                    # View/Edit/Delete dropdown
│   │       └── data-table-schema.ts               # Zod schema for URL search params
│   │   └── _data/
│   │       └── get-experts.ts                     # Layer 5: Server-side data fetch
│   │
│   ├── compositions/                              # BoS Composition Management
│   │   ├── page.tsx                               # Server Component — list
│   │   ├── new/page.tsx                           # Client Component
│   │   ├── [compositionId]/
│   │   │   ├── page.tsx                           # Detail (member list card view)
│   │   │   └── edit/page.tsx
│   │   └── _components/
│   │       ├── columns.tsx
│   │       ├── composition-data-table.tsx
│   │       ├── composition-form.tsx
│   │       ├── composition-filters.tsx
│   │       ├── composition-filters-client.tsx
│   │       ├── member-list.tsx                    # S.No / Position / Name / Designation grid
│   │       ├── add-member-drawer.tsx              # Sheet: search staff or pick expert
│   │       ├── row-actions.tsx
│   │       └── data-table-schema.ts
│   │   └── _data/
│   │       └── get-compositions.ts
│   │
│   ├── meetings/                                  # Meeting Management
│   │   ├── page.tsx                               # Server Component — meeting list
│   │   ├── new/page.tsx                           # Client Component
│   │   ├── [meetingId]/
│   │   │   ├── page.tsx                           # Meeting detail hub (tabs)
│   │   │   ├── agenda/page.tsx                    # Agenda & resolution entry
│   │   │   ├── attendance/page.tsx                # Attendance marking
│   │   │   ├── courses/page.tsx                   # Course review entry
│   │   │   ├── minutes/page.tsx                   # Minutes drafting
│   │   │   └── documents/page.tsx                 # Generate & download documents
│   │   └── _components/
│   │       ├── columns.tsx
│   │       ├── meeting-data-table.tsx
│   │       ├── meeting-form.tsx
│   │       ├── meeting-filters.tsx
│   │       ├── meeting-filters-client.tsx
│   │       ├── meeting-status-stepper.tsx         # 8-step state machine visual
│   │       ├── agenda-item-form.tsx
│   │       ├── resolution-form.tsx
│   │       ├── action-tracker-row.tsx
│   │       ├── course-review-table.tsx
│   │       ├── attendance-grid.tsx
│   │       ├── notice-preview.tsx
│   │       ├── row-actions.tsx
│   │       └── data-table-schema.ts
│   │   └── _data/
│   │       └── get-meetings.ts
│   │
│   ├── ta-da/
│   │   ├── page.tsx
│   │   └── _components/
│   │       ├── columns.tsx
│   │       ├── ta-da-data-table.tsx
│   │       ├── ta-da-form.tsx
│   │       ├── row-actions.tsx
│   │       └── data-table-schema.ts
│   │   └── _data/
│   │       └── get-ta-da.ts
│   │
│   └── reports/
│       ├── page.tsx
│       └── _components/
│           ├── composition-report-panel.tsx
│           ├── meeting-register-table.tsx
│           ├── resolution-compliance-table.tsx
│           └── syllabus-approval-panel.tsx
│
└── app/api/bos/                                   # Proxy API routes (COE database)
    ├── compositions/
    │   ├── route.ts                               # GET, POST
    │   └── [id]/route.ts                          # GET, PUT, DELETE
    ├── members/
    │   ├── route.ts                               # GET, POST
    │   └── [id]/route.ts                          # PUT, DELETE
    ├── experts/
    │   ├── route.ts                               # GET, POST
    │   └── [id]/route.ts
    ├── meetings/
    │   ├── route.ts                               # GET, POST
    │   ├── next-number/route.ts                   # GET (auto meeting number)
    │   ├── [id]/route.ts                          # GET, PUT
    │   ├── [id]/status/route.ts                   # PATCH (state transitions)
    │   ├── [id]/agenda/route.ts                   # GET, POST
    │   ├── [id]/attendance/route.ts               # GET, POST (bulk)
    │   ├── [id]/courses/route.ts                  # GET, POST
    │   └── [id]/documents/route.ts                # POST (generate), GET
    ├── ta-da/
    │   ├── route.ts
    │   └── [id]/route.ts
    └── reports/
        ├── composition/route.ts
        ├── meeting-register/route.ts
        ├── resolution-compliance/route.ts
        └── syllabus-approval/route.ts
```

---

## TypeScript Interfaces (`types/bos.ts`)

```typescript
// types/bos.ts

// ── Enums & Union Types ─────────────────────────────────────────────────────

export type BosExpertCategory =
  | 'university_nominee'
  | 'subject_expert'
  | 'industry_expert'
  | 'alumni';

export type BosMemberType =
  | 'chairman'
  | 'internal_member'
  | 'university_nominee'
  | 'subject_expert'
  | 'industry_expert'
  | 'alumni';

export type BosMeetingStatus =
  | 'draft'
  | 'principal_approved'
  | 'noticed'
  | 'expert_invited'
  | 'completed'
  | 'minutes_drafted'
  | 'minutes_approved'
  | 'ratified';

export type BosMeetingType = 'regular' | 'special' | 'emergency' | 'online';

export type BosAttendanceStatus = 'present' | 'absent' | 'leave_of_absence';

export type BosResolutionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'deferred'
  | 'not_applicable';

export type BosCourseReviewAction =
  | 'approved'
  | 'approved_with_changes'
  | 'rejected'
  | 'deferred'
  | 'noted';

export type BosDocumentType =
  | 'meeting_notice'
  | 'call_letter'
  | 'minutes_of_meeting'
  | 'composition_certificate'
  | 'syllabus_approval_certificate'
  | 'ta_da_bill'
  | 'action_taken_report';

export type BosClaimStatus = 'draft' | 'submitted' | 'approved' | 'paid';

// ── Label Maps ──────────────────────────────────────────────────────────────

export const BOS_MEMBER_TYPE_LABELS: Record<BosMemberType, string> = {
  chairman: 'Chairman',
  internal_member: 'Member',
  university_nominee: 'University Nominee',
  subject_expert: 'Subject Expert',
  industry_expert: 'Industry Expert',
  alumni: 'Alumni',
};

export const BOS_MEETING_STATUS_LABELS: Record<BosMeetingStatus, string> = {
  draft: 'Draft',
  principal_approved: 'Principal Approved',
  noticed: 'Notice Sent',
  expert_invited: 'Experts Invited',
  completed: 'Meeting Completed',
  minutes_drafted: 'Minutes Drafted',
  minutes_approved: 'Minutes Approved',
  ratified: 'Ratified',
};

// ── External Expert ─────────────────────────────────────────────────────────

export interface BosExternalExpert {
  id: string;
  institutions_id: string;
  name: string;
  title?: string;
  designation?: string;
  institution_name?: string;
  department_name?: string;
  address?: string;
  contact_no?: string;
  email?: string;
  category: BosExpertCategory;
  specialization?: string;
  qualifications?: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type CreateBosExpertDto = Omit<BosExternalExpert, 'id' | 'created_at' | 'updated_at'>;
export type UpdateBosExpertDto = Partial<CreateBosExpertDto>;

// Filters use camelCase (per myjkkn-page-development skill convention)
export interface BosExpertFilters {
  institutionsId?: string;
  category?: BosExpertCategory;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── Composition ─────────────────────────────────────────────────────────────

export interface BosComposition {
  id: string;
  institutions_id: string;
  board_id: string;
  composition_title: string;
  term_start_date: string;
  term_end_date: string;
  academic_year: string;
  is_active: boolean;
  constituted_by?: string;
  ratified_by_gc: boolean;
  ratified_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined
  board?: { board_code: string; board_name: string; board_type?: string };
  members?: BosMember[];
  member_count?: number;
}

export type CreateBosCompositionDto = Omit<BosComposition, 'id' | 'created_at' | 'updated_at' | 'board' | 'members' | 'member_count'>;
export type UpdateBosCompositionDto = Partial<CreateBosCompositionDto>;

export interface BosCompositionFilters {
  institutionsId?: string;
  boardId?: string;
  academicYear?: string;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── Member ───────────────────────────────────────────────────────────────────

export interface BosMember {
  id: string;
  institutions_id: string;
  composition_id: string;
  member_type: BosMemberType;
  staff_id?: string;
  staff_name?: string;
  staff_designation?: string;
  expert_id?: string;
  display_name: string;
  display_designation?: string;
  display_institution?: string;
  address?: string;
  contact_no?: string;
  email?: string;
  sort_order: number;
  is_active: boolean;
  joined_date?: string;
  left_date?: string;
  created_at: string;
  updated_at: string;
  // Joined
  expert?: BosExternalExpert;
}

export type CreateBosMemberDto = Omit<BosMember, 'id' | 'created_at' | 'updated_at' | 'expert'>;
export type UpdateBosMemberDto = Partial<CreateBosMemberDto>;

// ── Meeting ──────────────────────────────────────────────────────────────────

export interface BosMeeting {
  id: string;
  institutions_id: string;
  board_id: string;
  composition_id: string;
  meeting_number: number;
  academic_year: string;
  meeting_title?: string;
  meeting_type: BosMeetingType;
  status: BosMeetingStatus;
  scheduled_date?: string;
  scheduled_time?: string;
  venue?: string;
  actual_date?: string;
  actual_start_time?: string;
  actual_end_time?: string;
  quorum_met?: boolean;
  submitted_for_approval_at?: string;
  principal_approved_at?: string;
  principal_approved_by?: string;
  ratified_by_ac: boolean;
  ratified_date?: string;
  agenda_text?: string;
  minutes_summary?: string;
  minutes_drafted_at?: string;
  minutes_approved_at?: string;
  minutes_approved_by?: string;
  signature_page_url?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Joined
  board?: { board_code: string; board_name: string };
  composition?: { composition_title: string };
  attendee_count?: number;
  agenda_item_count?: number;
}

export type CreateBosMeetingDto = Omit<BosMeeting, 'id' | 'meeting_number' | 'created_at' | 'updated_at' | 'board' | 'composition' | 'attendee_count' | 'agenda_item_count'>;
export type UpdateBosMeetingDto = Partial<CreateBosMeetingDto>;

export interface BosMeetingFilters {
  institutionsId?: string;
  boardId?: string;
  compositionId?: string;
  academicYear?: string;
  status?: BosMeetingStatus;
  meetingType?: BosMeetingType;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── Meeting Attendee ─────────────────────────────────────────────────────────

export interface BosMeetingAttendee {
  id: string;
  institutions_id: string;
  meeting_id: string;
  member_id: string;
  attendance_status: BosAttendanceStatus;
  absence_reason?: string;
  ta_da_eligible: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  member?: BosMember;
}

// ── Agenda Item ──────────────────────────────────────────────────────────────

export interface BosAgendaItem {
  id: string;
  institutions_id: string;
  meeting_id: string;
  item_number: number;
  item_title: string;
  item_description?: string;
  discussion_notes?: string;
  resolution_text?: string;
  resolution_status?: BosResolutionStatus;
  responsible_person?: string;
  target_date?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Joined
  actions?: BosResolutionAction[];
  course_reviews?: BosCourseReview[];
}

export type CreateBosAgendaItemDto = Omit<BosAgendaItem, 'id' | 'created_at' | 'updated_at' | 'actions' | 'course_reviews'>;
export type UpdateBosAgendaItemDto = Partial<CreateBosAgendaItemDto>;

// ── Resolution Action ────────────────────────────────────────────────────────

export interface BosResolutionAction {
  id: string;
  institutions_id: string;
  agenda_item_id: string;
  action_description: string;
  action_date?: string;
  action_by?: string;
  remarks?: string;
  status: 'pending' | 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
}

// ── Course Review ────────────────────────────────────────────────────────────

export interface BosCourseReview {
  id: string;
  institutions_id: string;
  meeting_id: string;
  agenda_item_id?: string;
  course_id: string;
  course_code: string;
  course_name: string;
  review_action: BosCourseReviewAction;
  changes_suggested?: string;
  remarks?: string;
  regulation_code?: string;
  created_at: string;
}

// ── TA/DA Claim ──────────────────────────────────────────────────────────────

export interface BosTaDaClaim {
  id: string;
  institutions_id: string;
  meeting_id: string;
  member_id: string;
  expert_id: string;
  travel_mode?: string;
  travel_from?: string;
  travel_to?: string;
  travel_amount: number;
  da_days: number;
  da_rate: number;
  da_amount: number;
  other_amount: number;
  other_description?: string;
  total_amount: number;
  claim_status: BosClaimStatus;
  bill_number?: string;
  payment_date?: string;
  payment_reference?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined
  member?: BosMember;
  expert?: BosExternalExpert;
}

// ── Document ─────────────────────────────────────────────────────────────────

export interface BosDocument {
  id: string;
  institutions_id: string;
  meeting_id: string;
  document_type: BosDocumentType;
  file_name: string;
  file_url: string;
  file_format: 'pdf' | 'docx';
  recipient_member_id?: string;
  generated_at: string;
  generated_by?: string;
  is_latest: boolean;
}

// ── Report Types ─────────────────────────────────────────────────────────────

export interface BosCompositionReport {
  board_name: string;
  board_code: string;
  composition_title: string;
  term_start_date: string;
  term_end_date: string;
  members: Array<{
    sno: number;
    position: string;
    name: string;
    designation: string;
    address: string;
    contact_no: string;
    email: string;
    category: BosMemberType;
  }>;
}

export interface BosMeetingRegisterEntry {
  meeting_number: number;
  meeting_title: string;
  academic_year: string;
  scheduled_date: string;
  status: BosMeetingStatus;
  attendee_count: number;
  total_members: number;
  agenda_item_count: number;
  resolutions_count: number;
  courses_reviewed: number;
}

// ── Filters ──────────────────────────────────────────────────────────────────

export interface BosFilters {
  institutionsId?: string;
  boardId?: string;
  academicYear?: string;
}

export interface BosListResponse<T> {
  data: T[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

---

## Service Layer (`lib/services/bos/`)

> **KEY DIFFERENCE from other services:** BoS services use `fetch()` to call MyJKKN's own proxy API routes (not direct Supabase client), because the data lives in the COE database.

### COE Client (`lib/supabase/coe-client.ts`)

```typescript
// lib/supabase/coe-client.ts
// Server-side only — used inside app/api/bos/* routes
import { createClient } from '@supabase/supabase-js';

export function createCoeSupabaseClient() {
  const url = process.env.COE_SUPABASE_URL;
  const key = process.env.COE_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('COE Supabase environment variables not configured');
  }

  return createClient(url, key, {
    auth: { persistSession: false }
  });
}
```

### Service Pattern (`lib/services/bos/bos-composition-service.ts`)

```typescript
// lib/services/bos/bos-composition-service.ts
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  BosComposition,
  BosCompositionFilters,
  CreateBosCompositionDto,
  UpdateBosCompositionDto,
  BosListResponse,
} from '@/types/bos';

export class BosCompositionService {
  private static baseUrl = '/api/bos/compositions';

  static async getCompositions(
    filters: BosCompositionFilters = {}
  ): Promise<BosListResponse<BosComposition>> {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null) params.set(k, String(v));
      });

      const res = await fetch(`${this.baseUrl}?${params}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch compositions');
      }
      return res.json();
    } catch (error) {
      logger.error('bos/compositions', 'Error fetching compositions', error);
      throw error;
    }
  }

  static async createComposition(
    data: CreateBosCompositionDto
  ): Promise<BosComposition> {
    try {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        const enhanced: any = new Error(err.error || 'Failed to create composition');
        enhanced.code = err.code;
        throw enhanced;
      }
      return res.json();
    } catch (error) {
      logger.error('bos/compositions', 'Error creating composition', error);
      throw error;
    }
  }

  static async updateComposition(
    id: string,
    data: UpdateBosCompositionDto
  ): Promise<BosComposition> {
    try {
      const res = await fetch(`${this.baseUrl}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    } catch (error) {
      logger.error('bos/compositions', 'Error updating composition', error);
      throw error;
    }
  }

  static async deleteComposition(id: string): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (error) {
      logger.error('bos/compositions', 'Error deleting composition', error);
      throw error;
    }
  }
}
```

### Meeting Service (with state transition) — Key methods

```typescript
// lib/services/bos/bos-meeting-service.ts  (selected methods)

static async transitionStatus(
  meetingId: string,
  newStatus: BosMeetingStatus,
  metadata?: Record<string, unknown>
): Promise<BosMeeting> {
  const res = await fetch(`/api/bos/meetings/${meetingId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus, ...metadata }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

static async getNextMeetingNumber(
  boardId: string,
  academicYear: string
): Promise<number> {
  const res = await fetch(
    `/api/bos/meetings/next-number?boardId=${boardId}&academicYear=${academicYear}`
  );
  if (!res.ok) throw new Error('Failed to get meeting number');
  const { next_number } = await res.json();
  return next_number;
}
```

---

## Hook Pattern (`hooks/academic/use-bos-compositions.ts`)

> **Skill rule:** Hooks use **React Query** (`useQuery` / `useMutation`) — NOT manual `useState + useCallback`.
> BoS hooks call the `fetch()`-based services, which proxy to COE. React Query wraps any async function.

```typescript
// hooks/academic/use-bos-compositions.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { BosCompositionService } from '@/lib/services/academic/bos-composition-service';
import { usePermissions } from '@/hooks/use-permissions';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type {
  BosCompositionFilters,
  CreateBosCompositionDto,
  UpdateBosCompositionDto,
} from '@/types/bos';

// ── Query hook (list) ──────────────────────────────────────────────────────
export function useBosCompositions(filters: BosCompositionFilters = {}) {
  const { userProfile } = usePermissions();

  const scopedFilters: BosCompositionFilters = {
    ...filters,
    institutionsId: userProfile?.institution_id ?? filters.institutionsId,
  };

  return useQuery({
    queryKey: ['bos-compositions', scopedFilters],
    queryFn: () => BosCompositionService.getCompositions(scopedFilters),
    placeholderData: (previousData) => previousData,
    enabled: !!userProfile?.institution_id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,   // staleTime: 2min (compositions change rarely mid-session)
  });
}

// ── Query hook (single) ────────────────────────────────────────────────────
export function useBosComposition(id: string) {
  return useQuery({
    queryKey: ['bos-compositions', id],
    queryFn: () => BosCompositionService.getComposition(id),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ── Mutation: Create ───────────────────────────────────────────────────────
export function useCreateBosComposition() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (data: CreateBosCompositionDto) =>
      BosCompositionService.createComposition(data),
    onSuccess: () => {
      toast.success('BoS composition created successfully');
      queryClient.invalidateQueries({ queryKey: ['bos-compositions'] });
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create composition');
    },
  });
}

// ── Mutation: Update ───────────────────────────────────────────────────────
export function useUpdateBosComposition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBosCompositionDto }) =>
      BosCompositionService.updateComposition(id, data),
    onSuccess: () => {
      toast.success('Composition updated successfully');
      queryClient.invalidateQueries({ queryKey: ['bos-compositions'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update composition');
    },
  });
}

// ── Mutation: Delete ───────────────────────────────────────────────────────
export function useDeleteBosComposition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => BosCompositionService.deleteComposition(id),
    onSuccess: () => {
      toast.success('Composition deleted');
      queryClient.invalidateQueries({ queryKey: ['bos-compositions'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete composition');
    },
  });
}
```

### Query Key Convention

| Entity | Query Key |
|---|---|
| Compositions list | `['bos-compositions', filters]` |
| Single composition | `['bos-compositions', id]` |
| Meetings list | `['bos-meetings', filters]` |
| Single meeting | `['bos-meetings', id]` |
| Experts list | `['bos-experts', filters]` |
| Members list | `['bos-members', compositionId]` |
| Agenda items | `['bos-agenda', meetingId]` |
| Attendance | `['bos-attendance', meetingId]` |

### Caching Tiers (per skill)

```
STABLE_DATA:       staleTime: 5min,  gcTime: 10min  → Expert directory, composition data
SEMI_STABLE_DATA:  staleTime: 2min,  gcTime: 5min   → Meetings list, member list
DYNAMIC_DATA:      staleTime: 30sec, gcTime: 5min   → Attendance, resolution status, TA/DA
```

### Cache Invalidation (after mutations)

```typescript
// Invalidate related queries after state transitions:
queryClient.invalidateQueries({ queryKey: ['bos-meetings'] });
queryClient.invalidateQueries({ queryKey: ['bos-meetings', meetingId] });
router.refresh();  // Invalidate Next.js server cache
```

---

## API Proxy Routes (`app/api/bos/`)

> All proxy routes authenticate the MyJKKN user first, then query the COE database using the service-role client.

### Pattern (`app/api/bos/compositions/route.ts`)

```typescript
// app/api/bos/compositions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createCoeSupabaseClient } from '@/lib/supabase/coe-client';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate MyJKKN user
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 2. Parse filters
    const { searchParams } = new URL(request.url);
    const filters = {
      institutions_id: searchParams.get('institutions_id') ?? undefined,
      board_id: searchParams.get('board_id') ?? undefined,
      academic_year: searchParams.get('academic_year') ?? undefined,
      is_active: searchParams.has('is_active')
        ? searchParams.get('is_active') === 'true'
        : undefined,
      page: Number(searchParams.get('page') ?? '1'),
      limit: Number(searchParams.get('limit') ?? '20'),
    };

    // 3. Query COE database
    const coe = createCoeSupabaseClient();
    let query = (coe as any)
      .from('bos_compositions')
      .select('*, board:board(board_code, board_name, board_type)', { count: 'exact' });

    if (filters.institutions_id) query = query.eq('institutions_id', filters.institutions_id);
    if (filters.board_id) query = query.eq('board_id', filters.board_id);
    if (filters.academic_year) query = query.eq('academic_year', filters.academic_year);
    if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);

    const offset = (filters.page - 1) * filters.limit;
    query = query.range(offset, offset + filters.limit - 1).order('created_at', { ascending: false });

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      data: data || [],
      metadata: {
        total: count || 0,
        page: filters.page,
        limit: filters.limit,
        totalPages: count ? Math.ceil(count / filters.limit) : 0,
      },
    });
  } catch (error) {
    logger.error('bos/compositions', 'GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const coe = createCoeSupabaseClient();

    const { data, error } = await (coe as any)
      .from('bos_compositions')
      .insert([body])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    logger.error('bos/compositions', 'POST error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### State Transition Route (`app/api/bos/meetings/[id]/status/route.ts`)

```typescript
// Validates state transition before persisting
const VALID_TRANSITIONS: Record<BosMeetingStatus, BosMeetingStatus[]> = {
  draft: ['principal_approved'],
  principal_approved: ['noticed', 'draft'],
  noticed: ['expert_invited', 'principal_approved'],
  expert_invited: ['completed', 'noticed'],
  completed: ['minutes_drafted', 'expert_invited'],
  minutes_drafted: ['minutes_approved', 'completed'],
  minutes_approved: ['ratified', 'minutes_drafted'],
  ratified: [],
};
```

---

## Key UI Screens

### 1. BoS Dashboard (`/academic/bos`)
- Summary cards: Active compositions, meetings this year, pending resolutions, expiring terms (60-day alert)
- Board selector (filter by board/program)
- Recent meetings list with status badges
- Quick actions: Schedule Meeting, Add Expert, View Reports

### 2. External Expert Directory (`/academic/bos/experts`)
- Table: Name, Category badge, Institution, Contact, Status
- Filter by category (University Nominee / Subject Expert / Industry / Alumni)
- Add/Edit Expert in Sheet drawer
- Category color-coded badges: `university_nominee` = blue, `subject_expert` = purple, `industry_expert` = amber, `alumni` = green

### 3. Composition Management (`/academic/bos/compositions`)
- Board → Composition hierarchy
- Member list card view matching sample Excel format (S.No, Position, Name, Designation, Address, Contact, Email)
- "Add Internal Member" (search from staff/learning facilitator list)
- "Add External Expert" (pick from expert directory or create new)
- Sort members with drag-handle
- Term expiry countdown chip
- "Download Composition" → PDF matching the board member format sheet

### 4. Meeting Scheduling (`/academic/bos/meetings`)
- Meeting list with status stepper indicator
- Status filter tabs: All | Draft | Approved | Completed | Ratified
- Schedule form: Board selector, composition auto-populated, date/time/venue, meeting type, agenda overview
- Auto-generated meeting number display: "Meeting 1 of 2024-25"

### 5. Meeting Detail Hub (`/academic/bos/meetings/[id]`)
- State machine stepper at the top (horizontal progress bar with 8 states)
- Tab navigation: Details | Agenda | Attendance | Course Reviews | Documents
- Status transition buttons contextual to current state:
  - Draft → "Submit for Principal Approval"
  - Principal Approved → "Generate & Send Meeting Notice"
  - Noticed → "Generate & Send Call Letters to Experts"
  - Expert Invited → "Mark Meeting as Completed"
  - Completed → "Draft Minutes"
  - Minutes Drafted → "Approve Minutes"
  - Minutes Approved → "Record Academic Council Ratification"

### 6. Agenda & Resolutions (`/academic/bos/meetings/[id]/agenda`)
- Numbered agenda items (add/reorder)
- Expandable each item: Discussion notes, Resolution text, Status, Responsible person, Target date
- Action tracker sub-rows under each resolution
- "Link Course Review" button within agenda item

### 7. Attendance Marking (`/academic/bos/meetings/[id]/attendance`)
- Pre-populated list of all composition members (sorted by type: Chairman first)
- Toggle: Present / Absent / Leave of Absence
- External experts: TA/DA eligible checkbox
- Upload signature page button (stores in COE Supabase Storage)
- Quorum indicator: X/Y members present (highlight if quorum not met)

### 8. Document Generation (`/academic/bos/meetings/[id]/documents`)
- "Generate Meeting Notice" → fills DOCX template → download DOCX / Print Preview / Send via Email
- "Generate Call Letters" → one letter per external expert, bulk ZIP download
- "Generate Minutes of Meeting" → fills DOCX with agenda, attendance, resolutions
- "Generate TA/DA Bills" → per expert
- All generated docs listed in a table with generated timestamp and download links

### 9. Reports (`/academic/bos/reports`)
- **BoS Composition Report**: Member list in official format (matches Excel sample)
- **Meeting Register**: All meetings table — date, type, attendance %
- **Resolution Compliance Report**: All resolutions with action status (pending/completed)
- **Syllabus Approval Certificate**: Per course/regulation, certifying BoS approval date and meeting reference
- Export all as PDF or DOCX

---

## Document Templates (DOCX Template Fill)

### Template Variables

| Template | Variables |
|---|---|
| Meeting Notice | `{{college_name}}`, `{{principal_name}}`, `{{date}}`, `{{meeting_number}}`, `{{board_name}}`, `{{meeting_date}}`, `{{meeting_time}}`, `{{venue}}`, `{{agenda_items}}`, `{{chairman_name}}` |
| Call Letter (Expert) | All above + `{{expert_name}}`, `{{expert_designation}}`, `{{expert_address}}`, `{{ta_da_note}}` |
| Minutes of Meeting | `{{college_name}}`, `{{meeting_title}}`, `{{meeting_date}}`, `{{attendance_table}}`, `{{agenda_resolution_table}}`, `{{chairman_signature_block}}`, `{{principal_signature_block}}` |
| Composition Certificate | `{{board_name}}`, `{{term_period}}`, `{{member_table}}`, `{{ratification_date}}` |
| TA/DA Bill | `{{expert_name}}`, `{{meeting_date}}`, `{{travel_details}}`, `{{da_details}}`, `{{total_amount}}` |

### Document Generation API Route (`app/api/bos/meetings/[id]/documents/route.ts`)

```typescript
// POST body: { document_type: BosDocumentType, format: 'docx' | 'pdf', recipient_member_id?: string }
// 1. Load template from /templates/bos/[document_type].docx
// 2. Fetch all required data (meeting, composition, members, agenda)
// 3. Fill template using docx-templater or equivalent
// 4. Upload to COE Supabase Storage
// 5. Save record to bos_documents table
// 6. Return signed download URL
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/bos/compositions` | List compositions (filters: institutions_id, board_id, academic_year) |
| POST | `/api/bos/compositions` | Create composition |
| PUT | `/api/bos/compositions/:id` | Update composition |
| DELETE | `/api/bos/compositions/:id` | Delete composition |
| GET | `/api/bos/members?compositionId=` | List members of a composition |
| POST | `/api/bos/members` | Add member to composition |
| PUT | `/api/bos/members/:id` | Update member |
| DELETE | `/api/bos/members/:id` | Remove member |
| GET | `/api/bos/experts` | List external experts |
| POST | `/api/bos/experts` | Create expert |
| PUT | `/api/bos/experts/:id` | Update expert |
| GET | `/api/bos/meetings` | List meetings (filters: board_id, academic_year, status) |
| POST | `/api/bos/meetings` | Create meeting (auto-assigns meeting_number) |
| GET | `/api/bos/meetings/:id` | Get meeting detail |
| PUT | `/api/bos/meetings/:id` | Update meeting |
| PATCH | `/api/bos/meetings/:id/status` | Transition meeting status |
| GET | `/api/bos/meetings/:id/agenda` | Get agenda items |
| POST | `/api/bos/meetings/:id/agenda` | Add agenda item |
| PUT | `/api/bos/agenda/:id` | Update agenda item |
| DELETE | `/api/bos/agenda/:id` | Delete agenda item |
| GET | `/api/bos/meetings/:id/attendance` | Get attendance |
| POST | `/api/bos/meetings/:id/attendance` | Bulk save attendance |
| GET | `/api/bos/meetings/:id/courses` | Get course reviews |
| POST | `/api/bos/meetings/:id/courses` | Add course review |
| POST | `/api/bos/meetings/:id/documents` | Generate document |
| GET | `/api/bos/meetings/:id/documents` | List generated documents |
| GET | `/api/bos/ta-da?meetingId=` | List TA/DA claims |
| POST | `/api/bos/ta-da` | Create TA/DA claim |
| PUT | `/api/bos/ta-da/:id` | Update claim |
| GET | `/api/bos/reports/composition?boardId=&compositionId=` | Composition report data |
| GET | `/api/bos/reports/meeting-register?boardId=&academicYear=` | Meeting register |
| GET | `/api/bos/reports/resolution-compliance?boardId=` | Resolution compliance |
| GET | `/api/bos/reports/syllabus-approval?boardId=&regulationCode=` | Syllabus certificates |
| GET | `/api/bos/meetings/next-number?boardId=&academicYear=` | Get next meeting number |

---

## User Roles & RBAC

| Role | Permissions |
|---|---|
| **BoS Coordinator** (exam_coordinator) | Create/edit meetings, enter agenda & resolutions, mark attendance, generate documents, enter TA/DA |
| **HOD** (hod) | All BoS Coordinator permissions + Approve minutes + Manage composition members |
| **Principal** | Approve meetings (status transition: draft → principal_approved), read all BoS records |
| **IQAC Admin** (super_admin / institution_admin) | Full read access to all boards, export all reports, view resolution compliance |

### Permission Keys Convention (per skill: `module.entity.action`)

```typescript
// Permission key format: 'academic.bos-[entity].[action]'
'academic.bos-compositions.view'
'academic.bos-compositions.create'
'academic.bos-compositions.edit'
'academic.bos-compositions.delete'

'academic.bos-experts.view'
'academic.bos-experts.create'
'academic.bos-experts.edit'

'academic.bos-meetings.view'
'academic.bos-meetings.create'
'academic.bos-meetings.edit'
'academic.bos-meetings.approve'       // Principal only
'academic.bos-meetings.approve-minutes' // HOD only

'academic.bos-reports.view'
'academic.bos-ta-da.view'
'academic.bos-ta-da.create'
```

### Permission Check Pattern (per skill)

```typescript
const { canAccess, isSuperAdmin } = usePermissions();

const canCreate = isSuperAdmin || canAccess('academic.bos-compositions', 'create');
const canApproveMeeting = isSuperAdmin || canAccess('academic.bos-meetings', 'approve');
const canApproveMinutes = isSuperAdmin || canAccess('academic.bos-meetings', 'approve-minutes');

// In JSX — hide buttons user cannot perform:
{canCreate && <Button>New Composition</Button>}
```

---

## Navigation Registration

**Location:** `lib/sidebarMenuLink.ts`

```typescript
// Add BoS under the Academic module group
{ href: '/academic/bos', label: 'Board of Studies', icon: BookOpenCheck }

// Permission mapping
MENU_PERMISSIONS['/academic/bos'] = 'academic.bos-compositions.view';
MENU_PERMISSIONS['/academic/bos/experts'] = 'academic.bos-experts.view';
MENU_PERMISSIONS['/academic/bos/compositions'] = 'academic.bos-compositions.view';
MENU_PERMISSIONS['/academic/bos/meetings'] = 'academic.bos-meetings.view';
MENU_PERMISSIONS['/academic/bos/ta-da'] = 'academic.bos-ta-da.view';
MENU_PERMISSIONS['/academic/bos/reports'] = 'academic.bos-reports.view';
```

---

## Validation Rules

| Rule | Details |
|---|---|
| One active composition per board | `UNIQUE(board_id, term_start_date)` + check only one `is_active = true` per board |
| Member source exclusivity | Either `staff_id` or `expert_id` — not both (DB constraint) |
| One chairman per composition | Validate: only one member with `member_type = 'chairman'` per composition |
| Term dates | `term_end_date` must be exactly 3 years after `term_start_date` |
| Meeting number uniqueness | `UNIQUE(board_id, academic_year, meeting_number)` — auto-assigned, not user-editable |
| State machine enforcement | Backend validates `VALID_TRANSITIONS[currentStatus].includes(newStatus)` |
| Attendance before completion | Cannot transition to `completed` if no attendance records |
| Agenda before minutes | Cannot transition to `minutes_drafted` if no agenda items with resolutions |
| Quorum warning | Warn (not block) if < 50% members marked present |
| Marks within range | TA/DA amounts must be non-negative |
| Taxonomy locked | Cannot change `composition_id` of a meeting once `status !== 'draft'` |
| Threshold ordering | `term_end_date > term_start_date` |

---

## Environment Variables (Add to `.env.example`)

```env
# COE Database (Supabase — separate project)
COE_SUPABASE_URL=https://your-coe-project.supabase.co
COE_SUPABASE_SERVICE_ROLE_KEY=your-coe-service-role-key

# Email dispatch (for sending notices/call letters)
BOS_EMAIL_FROM=principal@jkkn.ac.in
BOS_EMAIL_REPLY_TO=iqac@jkkn.ac.in
```

---

## RLS Policies (COE Database)

```sql
-- All BoS tables: institution-scoped access only
-- Policies added to supabase/setup/03_policies.sql in COE project

-- Since MyJKKN uses service-role key (bypasses RLS) for proxy routes,
-- RLS policies enforce institution isolation as a defense-in-depth measure.

ALTER TABLE bos_compositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_external_experts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_resolution_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_course_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_ta_da_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_documents ENABLE ROW LEVEL SECURITY;

-- Example policy (repeat for all tables):
CREATE POLICY "bos_compositions_institution_isolation"
  ON bos_compositions FOR ALL
  USING (true)  -- service-role bypasses; add institution check if direct access is needed
  WITH CHECK (true);
```

---

## Pre-Flight Checklist (per myjkkn-page-development skill)

Before implementation begins, verify:

- [ ] COE migration file created: `D:\JKKN\Development\Application\COE\jkkncoe\supabase\migrations\20260306_create_bos_tables.sql`
- [ ] `COE_SUPABASE_URL` and `COE_SUPABASE_SERVICE_ROLE_KEY` added to `.env.local` and `.env.example`
- [ ] `lib/supabase/coe-client.ts` created
- [ ] `types/bos.ts` created with all interfaces
- [ ] Services placed in `lib/services/academic/` (NOT `lib/services/bos/`)
- [ ] Hooks placed in `hooks/academic/` (NOT `hooks/bos/`)
- [ ] Hooks use `useQuery` / `useMutation` (NOT `useState + useCallback`)
- [ ] Filter interfaces use camelCase (`boardId`, `isActive`, NOT `board_id`, `is_active`)
- [ ] Permission keys follow `academic.bos-[entity].[action]` format
- [ ] Navigation registered in `lib/sidebarMenuLink.ts`
- [ ] Each list page is a **Server Component** with `_data/get-*.ts` for pre-fetch
- [ ] Each form page is a **Client Component** in `new/` or `[id]/edit/`
- [ ] All `_components/` folders include `data-table-schema.ts` (Zod for URL search params)

---

## Implementation Phases

### Phase 1: Foundation — Member Management (Start Here)
1. Create all COE database tables (SQL migration)
2. Create `lib/supabase/coe-client.ts`
3. Create `types/bos.ts` (full interfaces)
4. Build External Expert Directory:
   - `app/api/bos/experts/*` proxy routes
   - `lib/services/bos/bos-expert-service.ts`
   - `hooks/bos/use-bos-experts.ts`
   - `components/academic/bos/member-category-badge.tsx`
   - Page: `/academic/bos/experts`
5. Build Composition Management:
   - `app/api/bos/compositions/*` + `app/api/bos/members/*` proxy routes
   - `lib/services/bos/bos-composition-service.ts` + `bos-member-service.ts`
   - `hooks/bos/use-bos-compositions.ts` + `use-bos-members.ts`
   - Page: `/academic/bos/compositions` (member list card view)
6. Composition PDF export (member list matching Excel format)

### Phase 2: Meeting Lifecycle
1. Meeting creation & listing with auto-numbering
2. State machine transitions (all 8 states)
3. Meeting status stepper component
4. Status-contextual action buttons
5. Principal approval workflow

### Phase 3: Agenda, Attendance & Course Reviews
1. Agenda item CRUD with drag-to-reorder
2. Resolution tracking per agenda item
3. Action Taken tracking
4. Attendance marking grid with quorum indicator
5. Signature page upload
6. Course review linking (search COE courses by board)

### Phase 4: Document Generation
1. DOCX template upload & storage (per document type)
2. Template fill engine (meeting notice, call letter, minutes)
3. Bulk call letter generation (ZIP download)
4. Email dispatch integration
5. Document history table

### Phase 5: TA/DA & Reports
1. TA/DA claim entry per external expert per meeting
2. TA/DA bill DOCX generation
3. NAAC/NBA Reports:
   - BoS Composition Report (PDF)
   - Meeting Register
   - Resolution Compliance Report
   - Syllabus Approval Certificates
4. IQAC admin report dashboard

---

## Open Questions (Clarify Before Implementation)

- [ ] Does the COE API already have an API server, or does the COE Supabase URL get accessed directly via service-role key? (Determines if `createCoeSupabaseClient` approach is correct)
- [ ] Is there an existing `staff` / `profiles` table in COE database, or should internal member lookup use the MyJKKN Supabase `profiles` table?
- [ ] Which storage bucket should BoS documents go into — COE Supabase Storage or MyJKKN Supabase Storage?
- [ ] For email dispatch, is there an existing email service (Resend, SendGrid, SMTP) configured in the project?
- [ ] Should `board_type` in the `board` table (e.g., "UG", "PG") determine any BoS-specific behavior (e.g., minimum member count, required categories)?
- [ ] Does "BoS Coordinator" map to an existing role in MyJKKN's RBAC, or is it a new role to create?
- [ ] For the DOCX templates — who maintains them? Should they be stored in Supabase Storage (admin-uploadable) or bundled in the codebase?
- [ ] Is there a sidebar menu entry needed for BoS under the Academic module? If so, what icon and label?

---

---

## Deployment Strategy

### Decision: `jkkn.ai` (MyJKKN) — Primary Recommendation

The BoS module is built **inside MyJKKN** at `app/(routes)/academic/bos/`. External access for experts is handled via a public token-based route within the same application.

```
jkkn.ai/academic/bos           ← Main BoS management
                                  Users: HOD, Principal, BoS Coordinator, IQAC Admin
                                  Auth: Existing MyJKKN RBAC

jkkn.ai/bos-portal/[token]     ← External Expert Portal (Phase 5+, optional)
                                  Users: External experts clicking their call letter link
                                  Auth: Magic link token (no MyJKKN account needed)
                                  Actions: View call letter, confirm attendance, download docs
```

### Why NOT a separate `bos.jkkn.ai` (now)

- Requires duplicate auth setup, separate Vercel project, extra DNS/SSL
- Duplicates the entire Shadcn/Tailwind design system
- Slows development — all 5-layer patterns must be rebuilt from scratch
- Can always migrate the expert portal to `bos.jkkn.ai` later as a micro-frontend

### Future Path to `bos.jkkn.ai` (if needed)

When external expert traffic grows or NAAC requires a dedicated portal:
1. Extract `app/(routes)/bos-portal/` into a standalone Next.js app
2. Deploy to Vercel as `bos.jkkn.ai` pointing to the same COE database
3. BoS management stays at `jkkn.ai/academic/bos` — no disruption

---

## COE Migration File

**Location:** `D:\JKKN\Development\Application\COE\jkkncoe\supabase\migrations\20260306_create_bos_tables.sql`

This single migration file contains all `CREATE TABLE` statements from the Database Schema section above, applied to the COE Supabase project. When implementing, use the Supabase MCP tool pointed at the COE project to apply this migration.

---

*Spec version: 1.0 | Created: 2026-03-06 | Author: Claude (JKKN COE Project)*
*Interviewer: Claude Sonnet 4.6 via AskUserQuestion | Interviewee: JKKN Development Team*
