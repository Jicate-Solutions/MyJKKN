# Parent Portal Module Implementation Spec (School-First)

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Build a mobile-first **Parent Portal** for JKKN that lets a parent log in with their child's admission number **or** their registered mobile number + a password (separate from the staff Google SSO), switch between multiple children (siblings across one or more institutions from a single login), and view/act on each child's school life: learner profile, parent details, announcements, achievements, exam results, fee payment, attendance, homework (with submission + marking), opinion poll, parent concerns, bus tracking, wellness, gate pass, events & gallery, spotlight, notifications, and support pages.

**Architecture:** The portal lives in a **dedicated, isolated route group** `app/(parent-portal)/` with its own JWT-cookie auth, its own middleware, and a mobile-first PWA shell — fully separated from the Google-SSO staff app. Data is **mixed-source**: core academic data is READ from existing MyJKKN Supabase tables (`learners_profiles`, `student_attendance`, `billing_*`), exam results are proxied from the external **COE** database (same pattern as the BoS module), and all parent-engagement features get **new `pp_*` tables**. File attachments (homework, gallery) live on **one shared Google Drive** owned by a service account.

**Phasing:** **Phase A = School parent portal (this spec).** Phase B = Institution (college) parent portal, which reuses 90% of this foundation and only swaps label adaptation (`school-label-adapter`) and a few college-specific features. This document specifies School-first; the College delta is captured in "Phase B Notes".

> **Skill Reference:** Follows `myjkkn-page-development` (7-layer), `jkkn-terminologies` (learner-centered labels), `brand-styling` (green/yellow/cream), and reuses `meta-whatsapp-integration` for OTP/notifications.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase PostgreSQL (MyJKKN), COE Supabase (proxy, exam results only), React Query (`@tanstack/react-query`), Shadcn UI + Tailwind, `jose` (JWT), `bcryptjs` (password hashing), Google Drive API (`googleapis`), Web Push (`web-push`), Meta WhatsApp Cloud API (existing infra), `next-pwa` (service worker / installable PWA).

---

## Institutional Context

### Why a Parent Portal?

Parent engagement is a measured quality indicator for K-12 schools (and a NAAC/NBA stakeholder-feedback signal for colleges). A single app that gives a parent a real-time window into attendance, fees, homework, achievements, and two-way concerns dramatically improves retention and trust. The reference mobile experience (see **UI Reference** section) is the design north-star: a profile card up top, a child switcher, and a grid of feature tiles.

### Key Behavioural Requirements (from stakeholder)

| Requirement | Design Consequence |
|---|---|
| Parents log in with **admission number OR mobile + password** | Custom credential auth, NOT Google SSO. `parent_accounts` table. |
| Father **and** mother can each log in | Login identifier matches `father_mobile` **or** `mother_mobile`; one account row per parent contact, both linked to the same learner(s). |
| **Siblings** may study in the **same** or **different** institutions (school and/or college) | One parent login → many `pp_parent_learner_links` rows → a child switcher. Each child carries its own `institutions_id`. |
| **Single login → select child → see that child's activity** | Active-child context stored in session/state; every data query is scoped to the selected `learner_profile_id` + its `institution_id`. |
| Parent area must be **separate** from Google-SSO pages | Isolated `app/(parent-portal)/` route group + separate cookie + separate middleware matcher. |
| **One Google Drive** for the whole software's file storage | Single service-account Drive client; deterministic foldering. |
| Homework **submission + marks** like Google Classroom | New `pp_homework` + `pp_homework_submissions` (with `marks` column). |

---

## Terminology (JKKN Standard)

Per `jkkn-terminologies` + `school-label-adapter`. Internal code/UI uses learner-centered terms; the portal renders **school labels** when `institutions.entity_type = 'school'`.

| Concept | College label (default) | School label (`entity_type='school'`) | Code term |
|---|---|---|---|
| Student | Learner | Learner / Child | `learner` |
| Program | Program | **Class** | `program` |
| Semester | Semester | **Term** | `semester` |
| Course | Course | **Subject** | `course` |
| Department | Department | **Wing** | `department` |
| Degree | Degree | **Stream** | `degree` |
| Faculty | Learning Facilitator | Learning Facilitator | `facilitator` |
| Homework | Independent Learning Activity | Homework (parent-facing) | `homework` |

> **Parent-facing exception:** Parents are not JKKN staff and expect familiar words. UI copy MAY use "Student"/"Homework"/"Marks" in parent-facing screens (legal/clarity exception in the terminology skill), while **all code identifiers, table names, and API routes use the learner-centered terms** (`learner`, `pp_homework`, `assessment`).

---

## System Architecture

### Data Flow

```
                         ┌────────────────────────────────────────┐
                         │  Parent (mobile browser / installed PWA) │
                         └───────────────────┬────────────────────┘
                                             │  parent_session JWT (HttpOnly cookie)
                                             ▼
              app/(parent-portal)/*  ──►  middleware (parent matcher)  ──►  validates JWT
                                             │
                                             ▼
                                   app/api/parent/*   (parent-scoped proxy API)
                                             │
            ┌────────────────────────────────┼───────────────────────────────────────┐
            ▼                                 ▼                                        ▼
  MyJKKN Supabase (READ)            COE Supabase (READ, proxy)            Google Drive (service acct)
  - learners_profiles              - exam marks / grades                 - homework attachments
  - student_attendance             (same pattern as BoS COE client)      - gallery media
  - billing_student_bills,                                               (one shared Drive)
    billing_receipts,
    payment_transactions
            │
            ▼
  MyJKKN Supabase (READ+WRITE, NEW pp_* tables)
  - pp_parent_accounts, pp_parent_learner_links, pp_otp_verifications, pp_devices
  - pp_announcements, pp_achievements, pp_homework, pp_homework_submissions
  - pp_polls, pp_poll_responses, pp_concerns, pp_concern_messages
  - pp_bus_routes, pp_bus_assignments, pp_wellness_records
  - pp_gate_passes, pp_leave_requests, pp_pickup_members
  - pp_events, pp_gallery_items, pp_spotlight, pp_feedback, pp_notifications_log
```

### Dual-Auth Isolation (critical)

The staff app authenticates via **Supabase Google SSO** (`lib/supabase/server.ts`, cookie `sb-*`). The parent portal MUST NOT touch that session.

| Concern | Staff App | Parent Portal |
|---|---|---|
| Route group | `app/(routes)/*` | `app/(parent-portal)/*` |
| Auth | Supabase Google OAuth | Custom credential (`pp_parent_accounts`) |
| Session | Supabase cookie (`sb-access-token`) | `parent_session` JWT (HttpOnly, `jose`-signed) |
| Middleware | existing guard | new matcher `['/parent/:path*', '/api/parent/:path*']` |
| Identity hook | `useAuth()` / `usePermissions()` | `useParentSession()` (NEW) |
| Logout | `/api/auth/logout` | `/api/parent/auth/logout` (clears `parent_session`) |

> A request that has a Supabase cookie but no `parent_session` cookie is **not** authenticated for `/parent/*`, and vice-versa. The two auth domains are fully independent.

### Multi-Child (Sibling) Model

```
pp_parent_accounts (1)  ──<  pp_parent_learner_links (N)  >──  learners_profiles (N)
   one parent contact            link rows (verified)            each child (own institution_id)

Login → JWT carries parent_account_id (NOT a single learner).
Dashboard → GET /api/parent/children  → returns all linked learners across institutions.
Child switcher → sets activeLearnerId (cookie `pp_active_learner` + React state).
Every feature query → scoped to (activeLearnerId, that learner's institution_id).
```

A learner studying in a **school** and a sibling in a **college** appear under the same parent login; the active-child's `institutions_id` + `entity_type` drives label adaptation and which feature tiles are visible.

### Multi-Institution Access Control

Every `pp_*` table carries `institutions_id`. A parent may only read/write rows for learners they are **verified-linked** to. Enforced server-side in `lib/utils/parent-access.ts`:

```
resolveParentScope(jwt) -> { parentAccountId, learnerIds: string[], institutionIds: string[] }
assertLearnerAccess(scope, learnerId)        -> 403 if learnerId ∉ scope.learnerIds
assertInstitutionAccess(scope, institutionId)-> 403 if institutionId ∉ scope.institutionIds
```

#### Key Files

| File | Purpose |
|---|---|
| `lib/utils/parent-access.ts` | `resolveParentScope()`, `assertLearnerAccess()`, `assertInstitutionAccess()` |
| `lib/auth/parent-jwt.ts` | sign/verify `parent_session` JWT (`jose`) |
| `lib/auth/parent-password.ts` | bcrypt hash/verify |
| `middleware.ts` (add matcher) | gate `/parent/*` + `/api/parent/*` |
| `lib/google/drive-client.ts` | shared service-account Drive client |
| `lib/services/parent/*` | fetch-based service layer |

---

## Authentication & Registration

### Identifiers

A parent can log in with **either**:
- **Admission number** — matched against `learners_profiles.application_id` / `roll_number` / `register_number`, OR
- **Mobile number** — matched against `learners_profiles.father_mobile` / `mother_mobile`.

…plus a **password** stored (bcrypt) in `pp_parent_accounts`.

### Self-Registration + OTP (chosen flow)

```
1. Parent taps "Register" → enters Admission Number + Mobile.
2. Server looks up learners_profiles WHERE (application_id|roll_number|register_number = admission)
   AND (father_mobile = mobile OR mother_mobile = mobile).
   - No match → generic "details not found" (no enumeration leak).
3. Server creates pp_otp_verifications row, sends OTP via WhatsApp (primary) → SMS (fallback).
4. Parent enters OTP → verified → sets password.
5. Server creates pp_parent_accounts (mobile, password_hash, parent_type) and one
   pp_parent_learner_links row (verified=true) for the matched learner.
6. Sibling auto-link: any OTHER learners_profiles sharing that mobile (father/mother) are
   offered as siblings to link in the same step.
```

**Forgot password:** mobile → OTP → reset. **Add sibling later:** in-app, enter sibling admission number → OTP to the same registered mobile → link.

### JWT Session

```typescript
// parent_session payload
{ sub: parentAccountId, mobile, parentType: 'father'|'mother'|'guardian', iat, exp }
// signed with PARENT_JWT_SECRET (jose, HS256), 30-day expiry, HttpOnly, Secure, SameSite=Lax
```

> The JWT deliberately does **not** embed the learner list (it changes when siblings are added). `learnerIds` are resolved per-request from `pp_parent_learner_links`.

---

## Database Schema (MyJKKN Supabase)

> **CRITICAL:** Create ONE new migration file following MyJKKN convention:
> `supabase/migrations/20260613_create_parent_portal_tables.sql`
> NEVER modify existing migration files. Use the `supabase-expert` skill + MCP to apply.

### Existing Tables — READ ONLY (do NOT recreate)

```sql
-- Already exist. Parent portal reads these; no schema changes.
public.learners_profiles   -- id, application_id, roll_number, register_number,
                           -- first_name, last_name, date_of_birth, gender, student_photo_url,
                           -- father_name, father_mobile, mother_name, mother_mobile,
                           -- institution_id, program_id, section_id, semester_id,
                           -- academic_year_id, lifecycle_status
public.student_attendance  -- institution_id, section_id, attendance_date,
                           -- attendance_data (JSONB), present_count, absent_count
public.billing_student_bills -- id, student_id, institution_id, category_id, amount, due_date, status
public.billing_receipts      -- payment receipts
public.payment_transactions  -- HDFC SmartGateway sessions (reuse for fee payment)
public.institutions          -- id, name, entity_type ('school'|'institution'|...), logo, ...
public.notifications         -- existing in-app notification store (optional reuse)
```

### NEW Tables (`pp_` prefix = "parent portal")

All carry `institutions_id UUID NOT NULL REFERENCES institutions(id)`, `created_at`, `updated_at`.

#### `pp_parent_accounts`

```sql
CREATE TABLE pp_parent_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile          VARCHAR(15) NOT NULL UNIQUE,     -- login identifier
  email           VARCHAR(255),
  password_hash   TEXT NOT NULL,                   -- bcrypt
  parent_type     VARCHAR(20) NOT NULL CHECK (parent_type IN ('father','mother','guardian')),
  display_name    VARCHAR(255),
  is_active       BOOLEAN DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  push_enabled    BOOLEAN DEFAULT true,
  preferred_locale VARCHAR(10) DEFAULT 'en',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

#### `pp_parent_learner_links`

```sql
CREATE TABLE pp_parent_learner_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_account_id   UUID NOT NULL REFERENCES pp_parent_accounts(id) ON DELETE CASCADE,
  learner_profile_id  UUID NOT NULL,               -- references learners_profiles(id)
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  relationship        VARCHAR(20) NOT NULL CHECK (relationship IN ('father','mother','guardian')),
  is_verified         BOOLEAN DEFAULT false,
  verified_at         TIMESTAMPTZ,
  is_primary          BOOLEAN DEFAULT false,        -- the default child shown first
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(parent_account_id, learner_profile_id)
);
```

#### `pp_otp_verifications`

```sql
CREATE TABLE pp_otp_verifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile          VARCHAR(15) NOT NULL,
  otp_hash        TEXT NOT NULL,                    -- never store raw OTP
  purpose         VARCHAR(20) NOT NULL CHECK (purpose IN ('register','login','reset','add_sibling')),
  channel         VARCHAR(10) CHECK (channel IN ('whatsapp','sms')),
  attempts        INTEGER DEFAULT 0,
  expires_at      TIMESTAMPTZ NOT NULL,             -- now()+5min
  consumed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

#### `pp_devices` (Web Push)

```sql
CREATE TABLE pp_devices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_account_id UUID NOT NULL REFERENCES pp_parent_accounts(id) ON DELETE CASCADE,
  endpoint          TEXT NOT NULL,
  p256dh            TEXT NOT NULL,
  auth              TEXT NOT NULL,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(parent_account_id, endpoint)
);
```

#### `pp_announcements`

```sql
CREATE TABLE pp_announcements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  body            TEXT,
  category        VARCHAR(50),                      -- general, exam, fee, holiday, event
  audience        VARCHAR(20) DEFAULT 'all' CHECK (audience IN ('all','class','section','learner')),
  program_id      UUID, section_id UUID, learner_profile_id UUID,   -- targeting
  banner_url      TEXT,
  published_at    TIMESTAMPTZ DEFAULT now(),
  expires_at      TIMESTAMPTZ,
  created_by      UUID,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

#### `pp_achievements`

```sql
CREATE TABLE pp_achievements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  learner_profile_id UUID NOT NULL,
  title              VARCHAR(255) NOT NULL,
  description        TEXT,
  category           VARCHAR(50),                   -- academic, sports, cultural, conduct
  achieved_on        DATE,
  certificate_url    TEXT,                          -- Drive file
  created_by         UUID,
  created_at         TIMESTAMPTZ DEFAULT now()
);
```

#### `pp_homework` + `pp_homework_submissions` (Google-Classroom style)

```sql
CREATE TABLE pp_homework (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  section_id         UUID,                          -- assigned to a class/section
  subject            VARCHAR(255),                  -- course/subject name (denormalized)
  title              VARCHAR(255) NOT NULL,
  instructions       TEXT,
  attachment_urls    JSONB DEFAULT '[]',            -- [{name, driveFileId, url}]
  assigned_on        DATE DEFAULT CURRENT_DATE,
  due_date           DATE,
  max_marks          NUMERIC(6,2),
  requires_submission BOOLEAN DEFAULT true,
  created_by         UUID,                          -- facilitator
  is_active          BOOLEAN DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pp_homework_submissions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  homework_id        UUID NOT NULL REFERENCES pp_homework(id) ON DELETE CASCADE,
  learner_profile_id UUID NOT NULL,
  submission_text    TEXT,
  attachment_urls    JSONB DEFAULT '[]',            -- learner-uploaded Drive files
  submitted_at       TIMESTAMPTZ,
  status             VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
                       'pending','submitted','marked','returned','late')),
  marks              NUMERIC(6,2),                  -- given by facilitator
  feedback           TEXT,
  marked_by          UUID,
  marked_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE(homework_id, learner_profile_id)
);
```

#### `pp_polls` + `pp_poll_responses` (Opinion Poll)

```sql
CREATE TABLE pp_polls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  question        VARCHAR(500) NOT NULL,
  options         JSONB NOT NULL,                   -- [{id, label}]
  audience        VARCHAR(20) DEFAULT 'all',
  section_id      UUID,
  closes_at       TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT true,
  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pp_poll_responses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id   UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  poll_id           UUID NOT NULL REFERENCES pp_polls(id) ON DELETE CASCADE,
  parent_account_id UUID NOT NULL REFERENCES pp_parent_accounts(id),
  learner_profile_id UUID NOT NULL,
  option_id         VARCHAR(50) NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(poll_id, parent_account_id, learner_profile_id)
);
```

#### `pp_concerns` + `pp_concern_messages` (Parent Concerns — two-way thread)

```sql
CREATE TABLE pp_concerns (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  parent_account_id  UUID NOT NULL REFERENCES pp_parent_accounts(id),
  learner_profile_id UUID NOT NULL,
  category           VARCHAR(50),                   -- JKKN taxonomy: fees_billing, learning_academics,
                                                    -- learning_studio_infrastructure, food_water, transport_bus,
                                                    -- learner_wellbeing_health, uniform_materials,
                                                    -- records_personal_details, hygiene_washroom,
                                                    -- gps_tracking, attendance, other
  subject            VARCHAR(255) NOT NULL,
  status             VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  priority           VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  assigned_to        UUID,                          -- staff
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pp_concern_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concern_id   UUID NOT NULL REFERENCES pp_concerns(id) ON DELETE CASCADE,
  sender_type  VARCHAR(10) NOT NULL CHECK (sender_type IN ('parent','staff')),
  sender_id    UUID,
  message      TEXT NOT NULL,
  attachment_urls JSONB DEFAULT '[]',
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

#### `pp_bus_routes` + `pp_bus_assignments` (Bus Tracking — static now, GPS later)

```sql
CREATE TABLE pp_bus_routes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  route_name      VARCHAR(255) NOT NULL,
  bus_number      VARCHAR(50),
  driver_name     VARCHAR(255),
  driver_contact  VARCHAR(15),
  stops           JSONB DEFAULT '[]',               -- [{name, lat, lng, pickup_time, drop_time}]
  is_active       BOOLEAN DEFAULT true,
  -- GPS (later phase): live_lat, live_lng, last_ping_at
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pp_bus_assignments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  learner_profile_id UUID NOT NULL,
  route_id           UUID NOT NULL REFERENCES pp_bus_routes(id),
  stop_name          VARCHAR(255),
  created_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE(learner_profile_id, route_id)
);
```

#### `pp_wellness_records`

```sql
CREATE TABLE pp_wellness_records (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  learner_profile_id UUID NOT NULL,
  record_date        DATE DEFAULT CURRENT_DATE,
  height_cm          NUMERIC(5,1),
  weight_kg          NUMERIC(5,1),
  bmi                NUMERIC(5,2),
  vision_left        VARCHAR(20), vision_right VARCHAR(20),
  remarks            TEXT,
  recorded_by        UUID,
  created_at         TIMESTAMPTZ DEFAULT now()
);
```

#### `pp_gate_passes`

```sql
CREATE TABLE pp_gate_passes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  learner_profile_id UUID NOT NULL,
  parent_account_id  UUID NOT NULL REFERENCES pp_parent_accounts(id),
  pass_type          VARCHAR(20) CHECK (pass_type IN ('early_leave','late_arrival','outpass','medical')),
  reason             TEXT NOT NULL,
  requested_date     DATE NOT NULL,
  requested_time     TIME,
  status             VARCHAR(20) DEFAULT 'requested' CHECK (status IN (
                       'requested','approved','rejected','used','expired')),
  qr_token           VARCHAR(100) UNIQUE,           -- scannable at gate
  pickup_member_id   UUID,                          -- authorised pickup person (pp_pickup_members)
  approved_by        UUID,
  approved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);
```

#### `pp_leave_requests` (Leaves tab)

```sql
CREATE TABLE pp_leave_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  learner_profile_id UUID NOT NULL,
  parent_account_id  UUID NOT NULL REFERENCES pp_parent_accounts(id),
  leave_type         VARCHAR(20) NOT NULL CHECK (leave_type IN (
                       'sick','casual','emergency','on_duty','planned_family')),
  from_date          DATE NOT NULL,
  to_date            DATE NOT NULL,
  reason             TEXT NOT NULL,
  attachment_urls    JSONB DEFAULT '[]',            -- e.g. medical note on Drive
  status             VARCHAR(20) DEFAULT 'requested' CHECK (status IN (
                       'requested','approved','rejected','cancelled')),
  approved_by        UUID, approved_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  CHECK (to_date >= from_date)
);
```

#### `pp_pickup_members` (authorised pickup persons)

```sql
CREATE TABLE pp_pickup_members (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  parent_account_id  UUID NOT NULL REFERENCES pp_parent_accounts(id) ON DELETE CASCADE,
  learner_profile_id UUID,                          -- NULL = applies to all the parent's children
  name               VARCHAR(255) NOT NULL,
  relationship       VARCHAR(50),
  contact_no         VARCHAR(15),
  id_proof_url       TEXT,                          -- Drive
  photo_url          TEXT,
  is_active          BOOLEAN DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT now()
);
```

#### `pp_events` + `pp_gallery_items` (Event & Gallery)

```sql
CREATE TABLE pp_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  event_date      DATE,
  start_time      TIME, end_time TIME,
  venue           VARCHAR(255),
  banner_url      TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pp_gallery_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  event_id        UUID REFERENCES pp_events(id) ON DELETE SET NULL,
  title           VARCHAR(255),
  media_type      VARCHAR(10) CHECK (media_type IN ('image','video')),
  drive_file_id   VARCHAR(255) NOT NULL,
  thumbnail_url   TEXT,
  url             TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

#### `pp_spotlight`, `pp_feedback`, `pp_notifications_log`

```sql
CREATE TABLE pp_spotlight (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL, body TEXT, media_url TEXT,
  link_url TEXT, sort_order INT DEFAULT 0, is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pp_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  parent_account_id UUID NOT NULL REFERENCES pp_parent_accounts(id),
  type VARCHAR(20) CHECK (type IN ('issue','improvement','appreciation','question','rating')),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  message TEXT, status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pp_notifications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  parent_account_id UUID REFERENCES pp_parent_accounts(id),
  learner_profile_id UUID,
  title VARCHAR(255), body TEXT, category VARCHAR(50),
  channels JSONB DEFAULT '[]',                       -- ['push','whatsapp','sms','email']
  action_url TEXT, is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Indexes (add to migration)

```sql
CREATE INDEX idx_pp_links_parent ON pp_parent_learner_links(parent_account_id);
CREATE INDEX idx_pp_links_learner ON pp_parent_learner_links(learner_profile_id);
CREATE INDEX idx_pp_homework_section ON pp_homework(section_id, is_active);
CREATE INDEX idx_pp_submissions_learner ON pp_homework_submissions(learner_profile_id);
CREATE INDEX idx_pp_concerns_parent ON pp_concerns(parent_account_id, status);
CREATE INDEX idx_pp_announcements_inst ON pp_announcements(institutions_id, is_active, published_at);
CREATE INDEX idx_pp_otp_mobile ON pp_otp_verifications(mobile, purpose);
```

---

## Module Structure (7-Layer + isolated route group)

```
MyJKKN/
│
├── middleware.ts                              # ADD parent matcher (gate /parent/* + /api/parent/*)
│
├── types/
│   └── parent-portal.ts                       # Layer 2: all TS interfaces
│
├── lib/
│   ├── auth/
│   │   ├── parent-jwt.ts                       # sign/verify parent_session (jose)
│   │   └── parent-password.ts                  # bcrypt hash/verify
│   ├── utils/parent-access.ts                  # resolveParentScope / assert* guards
│   ├── google/drive-client.ts                  # shared service-account Drive client
│   ├── push/web-push-client.ts                 # VAPID web-push sender
│   └── services/parent/                         # Layer 3 (fetch-based proxy services)
│       ├── parent-auth-service.ts
│       ├── parent-children-service.ts
│       ├── parent-profile-service.ts
│       ├── parent-attendance-service.ts
│       ├── parent-exam-service.ts               # COE proxy
│       ├── parent-fee-service.ts
│       ├── parent-homework-service.ts
│       ├── parent-announcement-service.ts
│       ├── parent-achievement-service.ts
│       ├── parent-poll-service.ts
│       ├── parent-concern-service.ts
│       ├── parent-bus-service.ts
│       ├── parent-wellness-service.ts
│       ├── parent-gatepass-service.ts
│       ├── parent-event-service.ts
│       ├── parent-spotlight-service.ts
│       └── parent-feedback-service.ts
│
├── hooks/parent/                                # Layer 4: React Query hooks
│   ├── use-parent-session.ts                    # active child + parent identity
│   ├── use-parent-children.ts
│   ├── use-parent-attendance.ts
│   ├── use-parent-exam-results.ts
│   ├── use-parent-fees.ts
│   ├── use-parent-homework.ts
│   ├── use-parent-announcements.ts
│   ├── use-parent-achievements.ts
│   ├── use-parent-polls.ts
│   ├── use-parent-concerns.ts
│   ├── use-parent-bus.ts
│   ├── use-parent-wellness.ts
│   ├── use-parent-gatepass.ts
│   └── use-parent-events.ts
│
├── components/parent/                           # Layer 6: shared mobile UI
│   ├── parent-shell.tsx                         # PWA shell: home header (logo+bell+menu), drawer
│   ├── parent-bottom-nav.tsx                    # bottom tab bar (Home·Attendance·Fees·Notifications·More)
│   ├── splash.tsx                               # branded splash + Get Started
│   ├── onboarding-carousel.tsx                  # 3–4 intro slides (Skip/Next)
│   ├── child-switcher.tsx                       # avatar chevron → bottom-sheet switch/select child
│   ├── feature-tile-grid.tsx                    # the home grid of tiles
│   ├── feature-tile.tsx
│   ├── whats-new-banner.tsx                     # dismissible NEW banner on dashboard
│   ├── profile-card.tsx                         # Student / Parents details tabs (collapsible)
│   ├── attendance-ring.tsx                      # % donut (Present/Absent/Not Updated)
│   ├── time-grouped-list.tsx                    # This Week/Last Week/Previous + date filter
│   ├── status-pill.tsx
│   ├── empty-state.tsx                          # illustrated empty states
│   ├── bottom-sheet.tsx                         # switch-child/theme/share/help/picker sheets
│   ├── share-dialog.tsx                         # Image&Text | Link (Web Share API)
│   ├── theme-dialog.tsx                         # Light/Dark/System
│   └── install-prompt.tsx                       # PWA add-to-home
│
└── app/
    ├── (parent-portal)/                         # ISOLATED route group (no staff sidebar/layout)
    │   ├── layout.tsx                            # mobile shell, ParentSessionProvider, theme, bottom-nav+drawer
    │   ├── page.tsx                              # splash (Get Started) → onboarding/login
    │   ├── onboarding/page.tsx                   # intro carousel (Skip/Next)
    │   ├── login/page.tsx                        # admission/mobile + password
    │   ├── register/page.tsx                     # admission+mobile → OTP → password
    │   ├── forgot/page.tsx                       # OTP reset
    │   ├── dashboard/page.tsx                    # profile card + tile grid (Client)
    │   ├── profile/page.tsx                      # learner + parent details
    │   ├── attendance/page.tsx
    │   ├── exam-results/page.tsx
    │   ├── fees/page.tsx                         # bills + HDFC pay
    │   ├── homework/page.tsx                     # list
    │   ├── homework/[id]/page.tsx                # detail + submit
    │   ├── announcements/page.tsx
    │   ├── achievements/page.tsx
    │   ├── polls/page.tsx
    │   ├── concerns/page.tsx
    │   ├── concerns/[id]/page.tsx                # thread
    │   ├── bus/page.tsx
    │   ├── wellness/page.tsx
    │   ├── gate-pass/page.tsx
    │   ├── events/page.tsx
    │   ├── gallery/page.tsx
    │   ├── spotlight/page.tsx
    │   ├── add-sibling/page.tsx
    │   ├── notifications/page.tsx
    │   ├── settings/page.tsx
    │   ├── about/page.tsx
    │   ├── help/page.tsx
    │   └── contact/page.tsx
    │
    └── api/parent/                              # parent-scoped proxy API
        ├── auth/
        │   ├── login/route.ts                    # POST → issues parent_session
        │   ├── register/route.ts                 # POST (verify OTP, create account)
        │   ├── otp/route.ts                      # POST (send), PATCH (verify)
        │   ├── forgot/route.ts
        │   └── logout/route.ts
        ├── children/route.ts                     # GET linked learners
        ├── children/add/route.ts                 # POST add sibling (OTP-gated)
        ├── profile/route.ts                      # GET learner + parent details
        ├── attendance/route.ts
        ├── exam-results/route.ts                 # COE proxy
        ├── fees/route.ts                         # GET bills
        ├── fees/pay/route.ts                     # POST → HDFC session (reuse payment_transactions)
        ├── homework/route.ts                     # GET list
        ├── homework/[id]/route.ts                # GET detail
        ├── homework/[id]/submit/route.ts         # POST (Drive upload + submission)
        ├── announcements/route.ts
        ├── achievements/route.ts
        ├── polls/route.ts                        # GET, POST (respond)
        ├── concerns/route.ts                     # GET, POST
        ├── concerns/[id]/route.ts                # GET thread, POST message
        ├── bus/route.ts
        ├── wellness/route.ts
        ├── gate-pass/route.ts                    # GET, POST request (QR on approve)
        ├── leaves/route.ts                       # GET, POST leave request
        ├── pickup-members/route.ts               # GET, POST authorised pickup persons
        ├── events/route.ts
        ├── gallery/route.ts
        ├── spotlight/route.ts
        ├── notifications/route.ts                # GET, PATCH (mark read)
        ├── devices/route.ts                      # POST register push subscription
        └── feedback/route.ts
```

---

## TypeScript Interfaces (`types/parent-portal.ts`) — excerpt

```typescript
// ── Session & Children ───────────────────────────────────────────────
export type ParentType = 'father' | 'mother' | 'guardian';

export interface ParentSession {
  parentAccountId: string;
  mobile: string;
  parentType: ParentType;
  displayName?: string;
}

export interface ParentChild {
  learnerProfileId: string;
  institutionsId: string;
  institutionName: string;
  entityType: 'school' | 'institution';            // drives label adaptation
  admissionNumber: string;                          // application_id / roll_number
  fullName: string;
  photoUrl?: string;
  className?: string;                               // program (school label)
  sectionName?: string;
  isPrimary: boolean;
}

// ── Profile ──────────────────────────────────────────────────────────
export interface LearnerProfileView {
  admissionNumber: string;
  fullName: string;
  dateOfBirth?: string;
  gender?: string;
  className?: string;
  sectionName?: string;
  branch?: string;
  address?: string;
  photoUrl?: string;
}
export interface ParentDetailsView {
  fatherName?: string;
  motherName?: string;
  primaryMobile?: string;
  secondaryMobile?: string;
  email?: string;
}

// ── Attendance ───────────────────────────────────────────────────────
export interface AttendanceSummary {
  academicYear: string;
  totalWorkingDays: number;
  present: number;
  absent: number;
  notUpdated: number;
  percentage: number;
  recentMissed: Array<{ date: string; status: 'absent' | 'not_updated' | 'leave' }>;
}

// ── Homework ─────────────────────────────────────────────────────────
export type HomeworkStatus = 'pending' | 'submitted' | 'marked' | 'returned' | 'late';
export interface Homework {
  id: string;
  subject?: string;
  title: string;
  instructions?: string;
  attachmentUrls: Array<{ name: string; driveFileId: string; url: string }>;
  assignedOn: string;
  dueDate?: string;
  maxMarks?: number;
  requiresSubmission: boolean;
  submission?: HomeworkSubmission;                 // joined for active child
}
export interface HomeworkSubmission {
  id: string;
  status: HomeworkStatus;
  submittedAt?: string;
  attachmentUrls: Array<{ name: string; driveFileId: string; url: string }>;
  marks?: number;
  feedback?: string;
}

export interface ParentListResponse<T> {
  data: T[];
  metadata: { total: number; page: number; limit: number; totalPages: number };
}
```

> Full interfaces for Announcement, Achievement, Poll, Concern, BusRoute, Wellness, GatePass, Event, GalleryItem, Spotlight, Feedback, Fee/Bill follow the same shape (entity + `Create*Dto` + `*Filters` with camelCase keys).

---

## Service Layer Pattern (`lib/services/parent/`)

Like BoS services, parent services use `fetch()` to call the portal's own `/api/parent/*` routes (because they aggregate Supabase + COE + Drive server-side).

```typescript
// lib/services/parent/parent-attendance-service.ts
import { logger } from '@/lib/utils/enhanced-logger';
import type { AttendanceSummary } from '@/types/parent-portal';

export class ParentAttendanceService {
  static async getSummary(learnerId: string, academicYear?: string): Promise<AttendanceSummary> {
    const params = new URLSearchParams({ learnerId });
    if (academicYear) params.set('academicYear', academicYear);
    const res = await fetch(`/api/parent/attendance?${params}`);
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to load attendance');
    return res.json();
  }
}
```

---

## Hook Pattern (`hooks/parent/`)

React Query, scoped to the **active child** from `useParentSession()`.

```typescript
// hooks/parent/use-parent-attendance.ts
import { useQuery } from '@tanstack/react-query';
import { useParentSession } from './use-parent-session';
import { ParentAttendanceService } from '@/lib/services/parent/parent-attendance-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

export function useParentAttendance(academicYear?: string) {
  const { activeLearnerId } = useParentSession();
  return useQuery({
    queryKey: ['parent-attendance', activeLearnerId, academicYear],
    queryFn: () => ParentAttendanceService.getSummary(activeLearnerId!, academicYear),
    enabled: !!activeLearnerId,
    ...QUERY_CONFIG.DYNAMIC_DATA,                   // attendance changes daily
  });
}
```

### Query Keys & Caching

| Entity | Key | Tier |
|---|---|---|
| Children list | `['parent-children', parentAccountId]` | STABLE (5m) |
| Profile | `['parent-profile', learnerId]` | STABLE |
| Attendance | `['parent-attendance', learnerId, year]` | DYNAMIC (30s) |
| Exam results | `['parent-exam', learnerId]` | SEMI_STABLE (2m) |
| Fees | `['parent-fees', learnerId]` | DYNAMIC |
| Homework | `['parent-homework', learnerId]` | SEMI_STABLE |
| Announcements | `['parent-announcements', institutionId]` | SEMI_STABLE |
| Concerns | `['parent-concerns', parentAccountId]` | DYNAMIC |

> **Cross-child cache safety (see project memory):** every key includes `learnerId` or `parentAccountId` so switching children never leaks another child's cached data. On logout, call `queryClient.clear()`.

---

## API Proxy Route Patterns

### Auth — Login (`app/api/parent/auth/login/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { verifyPassword } from '@/lib/auth/parent-password';
import { signParentSession } from '@/lib/auth/parent-jwt';

export async function POST(req: NextRequest) {
  const { identifier, password } = await req.json();   // identifier = admission OR mobile
  const db = createAdminSupabaseClient();

  // 1. Resolve mobile from identifier (admission → learners_profiles → father/mother mobile)
  const mobile = await resolveMobileFromIdentifier(db, identifier);
  if (!mobile) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  // 2. Load account + verify bcrypt password
  const { data: acct } = await db.from('pp_parent_accounts')
    .select('*').eq('mobile', mobile).eq('is_active', true).single();
  if (!acct || !(await verifyPassword(password, acct.password_hash)))
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  // 3. Issue JWT cookie
  const token = await signParentSession({
    sub: acct.id, mobile: acct.mobile, parentType: acct.parent_type,
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set('parent_session', token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
  });
  await db.from('pp_parent_accounts').update({ last_login_at: new Date().toISOString() }).eq('id', acct.id);
  return res;
}
```

### Scoped read — Attendance (`app/api/parent/attendance/route.ts`)

```typescript
export async function GET(req: NextRequest) {
  const scope = await resolveParentScope(req);                 // throws 401 if no/invalid JWT
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const learnerId = new URL(req.url).searchParams.get('learnerId')!;
  assertLearnerAccess(scope, learnerId);                        // 403 if not this parent's child

  const db = createAdminSupabaseClient();
  // read student_attendance JSONB, aggregate present/absent/not-updated for the learner
  const summary = await buildAttendanceSummary(db, learnerId);
  return NextResponse.json(summary);
}
```

### Exam results — COE proxy (`app/api/parent/exam-results/route.ts`)

```typescript
// Same pattern as BoS: createCoeSupabaseClient() service-role read,
// scoped to the learner's register_number / roll_number.
const coe = createCoeSupabaseClient();
const marks = await fetchCoeMarksForLearner(coe, registerNumber);
```

### Middleware matcher (`middleware.ts`)

```typescript
export const config = {
  matcher: [/* existing staff matchers */, '/parent/:path*', '/api/parent/:path*'],
};
// In middleware: if path startsWith('/parent') or '/api/parent' →
//   require valid parent_session JWT; else redirect to /parent/login (pages)
//   or return 401 (api). Auth routes (/api/parent/auth/*, /parent/login|register|forgot) are public.
```

---

## Google Drive Integration (`lib/google/drive-client.ts`)

```typescript
// One shared service-account Drive for the WHOLE software.
import { google } from 'googleapis';

export function createDriveClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}
```

**Foldering scheme** (created lazily, IDs cached):
```
<SHARED_DRIVE_ROOT>/<institution_code>/<academic_year>/<section>/<learner_admission>/homework/
<SHARED_DRIVE_ROOT>/<institution_code>/gallery/<event>/
```
Uploads return `{ driveFileId, webViewLink }`; store on the row's `attachment_urls` JSONB. Parent downloads go through `/api/parent/files/[id]` which validates `assertLearnerAccess` then streams the Drive file (never expose raw Drive links cross-tenant).

---

## Notifications (multi-channel)

Single dispatcher `lib/push/notify-parent.ts`:

```
notifyParent({ parentAccountId, title, body, category, actionUrl, channels })
  → writes pp_notifications_log
  → channels.includes('push')     → web-push to all pp_devices
  → channels.includes('whatsapp') → reuse meta-whatsapp-integration template send
  → channels.includes('sms')      → SMS gateway (fallback for OTP/critical)
  → channels.includes('email')    → email (receipts/digests)
```

**Triggers (examples):** new announcement → push+whatsapp; attendance marked absent → whatsapp+push; new homework → push; fee due → whatsapp+sms; concern reply → push; gate pass approved → push+sms; OTP → whatsapp→sms fallback.

---

## Key UI Screens (mobile-first, reference-matched)

### 1. Login (`/parent/login`)
- JKKN logo, "Parent Login", tab/segment: **Admission No.** | **Mobile**, password field, "Forgot password?", "Register New Account", language switcher.

### 2. Register (`/parent/register`)
- Admission number + mobile → "Send OTP" → OTP entry → set password → sibling auto-link prompt.

### 3. Dashboard (`/parent/dashboard`) — the home
- Header: hamburger (drawer), JKKN logo, notification bell (unread badge).
- **Profile card:** avatar with **chevron = child switcher**, "Good evening, <Name>", `D/O / S/O <parent>`, admission no., class line. Tabs: **Student Details** | **Parents Details** (collapsible).
- **Feature tile grid** (3-col), tiles conditional on active child's `entity_type` and enabled features:
  Announcements · Achievements · Exam Results · Fee Payments · Attendance · Opinion Poll · Parent Concerns · Bus Tracking · Wellness · Gate Pass · Events & Gallery · Homework.

### 4. Child Switcher (`child-switcher.tsx`)
- Bottom sheet listing all linked children (name, institution, class, photo) + "Add Sibling". Selecting sets `pp_active_learner` cookie + invalidates child-scoped queries.

### 5. Attendance (`/parent/attendance`)
- Tabs **Class | Exam**, academic-year dropdown, **donut %** with Present/Absent/Not-Updated legend, "Recently Missed Days" list. (Matches reference screenshot.)

### 6. Homework (`/parent/homework`, `/[id]`)
- List grouped by due date with status pills. Detail: instructions, attachments (Drive), **Submit** (upload files → Drive), shows marks + feedback once `marked`.

### 7. Fees (`/parent/fees`)
- Outstanding bills (`billing_student_bills`), "Pay Now" → HDFC SmartGateway (reuse `payment_transactions`), receipts list (`billing_receipts`).

### 8. Parent Concerns (`/parent/concerns`, `/[id]`)
- Create concern (category, subject, message, attachment) → staff-reply thread (`pp_concern_messages`), status pill.

### 9. Gate Pass (`/parent/gate-pass`)
- Request form (type, date/time, reason) → status; on approval shows **QR token** to scan at gate.

### 10. Drawer (hamburger)
- Home · Add Sibling · Notifications · About Us · Spotlight · Help & Feedback · Rate the App · Contact Us · Settings · Switch Account · Logout. (Matches reference drawer.)

### 11. Bottom Tab Bar (chosen: bottom tabs + drawer)
- Persistent bottom navigation (reuse `mobile-bottom-navbar`): **Home · Attendance · Fees · Notifications · More**. "More" opens the hamburger drawer (long-tail items above). Active tab uses JKKN green; bottom bar hides on scroll-down, reveals on scroll-up.

---

## UI Reference — Screen-by-Screen

> Derived from the K-12 parent-app reference screenshots. Each entry: **purpose → layout → data source → notes**. JKKN brand (green/yellow/cream) replaces the reference palette; copy uses JKKN terminology. Light **and** dark mode both supported.

### Global UI Patterns (apply to every screen)
- **Header:** back chevron (left) · centered screen title · context action (right: share / download / calendar-filter / bell).
- **Home header (special):** hamburger (left) · institution logo (center) · notification bell with unread badge (right).
- **Academic-year dropdown:** top-right pill (e.g. `'25–'26`) on Attendance / Exam / Fee screens; drives all data on that screen.
- **Time-grouped lists:** cards grouped under **This Week / Last Week / Previous** headers; "Previous" shows a `Showing N of M` counter + a calendar **Filter by Date** icon.
- **Card list item:** colored left accent bar · category eyebrow (UPPERCASE) · title (truncated) · 1-line preview · date · right chevron · optional green **NEW** badge.
- **Illustrated empty state:** centered illustration + "You have no X to show…" + (where relevant) an Add CTA; branded institution logo footer.
- **Filter chips:** horizontal scrollable pill row (e.g. All Exams / Assessment / Annual; Parenting / Soft Skills / Wellbeing).
- **Primary CTA:** full-width gradient button pinned to bottom (Proceed to Pay, Add New Member, Get Started).
- **Bottom sheets:** used for switch-child, theme, share-option, help-actions, and "choose the required" pickers.

### A. Onboarding & Auth

**A1 — Splash (`/parent`)**
- Logo + product wordmark + tagline; big **Get Started** gradient button; social links; "Powered by JKKN" footer. → routes to carousel.

**A2 — Feature Carousel**
- 3–4 swipeable slides (illustration + headline + 3 bullet points), e.g. "Attendance Statistics for Classes and Exams". Page dots (left), **Skip** (center), **Next ›** (right, gradient). Last slide → Login.

**A3 — Login (`/parent/login`)**
- Logo + product mark; a profile-style card; segmented identifier **Admission No. | Mobile**; password; **Change Language** + **Register New Account** links; social row.

**A4 — Register (`/parent/register`)** — admission + mobile → **Send OTP** → OTP entry → set password → sibling-link prompt.

**A5 — Forgot (`/parent/forgot`)** — mobile → OTP → reset password.

**A6 — Login Success / Sync (optional)** — confetti "Login Successful!" + a "Downloading data" progress card (Student Data / Class data) then **Proceed**. *(For PWA: a one-time prefetch + cache warm; can be a lightweight splash instead of a literal download.)*

### B. Shell & Navigation

**B1 — Dashboard / Home (`/parent/dashboard`)**
- Home header (hamburger · logo · bell).
- **Profile card:** circular avatar with a **down-chevron (child switcher)**; "Good evening, **<Learner>**"; `D/O / S/O <parent>`; admission no.; class line. Tabs **Student Details | Parents Details** (collapsible, chevron to expand/collapse).
- **"What's new" banner:** dismissible card with **NEW** badge + date → links to announcement/spotlight.
- **Feature tile grid:** 3-col rounded tiles with illustrated icons + label: Announcements · Achievements · Exam Results · Fee Payments · Attendance · Opinion Poll · Parent Concerns · Bus Tracking · Wellness · Gate Pass · Events & Gallery · Homework. Tiles conditional on active child's `entity_type` + enabled features.
- **Bottom tab bar** (B/11). Dark mode fully themed.

**B2 — Profile tabs (within card / `/parent/profile`)**
- **Student Details:** Admission Number, Class Group, Date of Birth, Branch, Address. (reads `learners_profiles`)
- **Parents Details:** Father's Name, Mother's Name, Primary Mobile, Secondary Mobile, Email.

**B3 — Drawer** — see screen 10. Header shows learner name + admission no. + chevron.

**B4 — Child Switcher (bottom sheet)** — list of linked children (avatar, name, institution, class) + **Add Sibling**; tap to set active child.

**B5 — Theme dialog** — "Select Theme": **Light / Dark / System** radio + Cancel/Okay. (Settings → Theme)

### C. Feature Screens

**C1 — Announcements**
- Time-grouped card list (This Week / Last Week / Previous, `Showing 20 of 501`). **Filter by Date** dialog (Start→End, Reset/Filter, "Set to Latest").
- **Detail:** date · category · emoji title · rich body · external link · banner image · **Share** (top-right).
- **Share dialog:** "Select Share Option" → **Image & Text** (off-platform) | **Link** (on-platform) + Share. *(Web: use Web Share API; "Link" = deep link into the PWA.)*
- Source: `pp_announcements`.

**C2 — Achievements**
- Time/category list of achievement cards (title, category, date, certificate link). Illustrated **empty state** "You have no Achievements to show. Check back later!". Source: `pp_achievements`.

**C3 — Exam Results** *(COE proxy)*
- **Overall card:** "Student's Overall Percentage" big % + progress bar + **Class Average** with up/down arrow.
- **Show Previous Exams** button.
- **Cumulative Score Analytics:** dropdowns **Assessment/Annual Exams** + **Last N Exams**; tabs **Exam Trend** (line: Student Performance / Class Average / Student Absent) and **Subject Graph** (bars per subject with High/Low/Very-Low bands + Personal Best marker).
- **Previous Exams list:** filter chips (All/Assessment/Annual); per-exam card → Date Conducted, Marks Obtained (e.g. 641/700), Exam Rank; **Load more**.
- **Exam detail:** title + date; donut % + Marks Obtained, Exam Rank, Subjects count, Branch Rank, star; **Subject Wise Marks Scored** rows (per-subject Rank + scored/total); **Share**.

**C4 — Fee Payment**
- **Total Due card:** ₹ amount + academic year + learner name/admission/parent.
- Editable **Mobile** + **Email** (required); fee breakdown row(s) (e.g. "Course Fee → Current Due ₹22,360", expandable); editable **Total Amount to Pay**; **Proceed to Pay** (→ HDFC SmartGateway, reuse `payment_transactions`).
- Source: `billing_student_bills` / `billing_receipts`.

**C5 — Attendance**
- Tabs **Class | Exam**; academic-year dropdown.
- **Class:** Total Working Days; **donut %** (green/red/amber) + legend **Present / Absent / Not Updated** (days); **View Details**; **Recently Missed Days** list (date + status with colored clock).
- **Exam:** Total Exams Conducted; Present/Absent (exams); "No Data" states. Source: `student_attendance` (JSONB) aggregated per learner.

**C6 — Homework** *(new)*
- List grouped by due date, status pills (Pending / Submitted / Marked / Late). **Detail:** subject, title, instructions, attachments (Drive), **Submit** (upload files → Drive), shows **marks + feedback** once marked. Source: `pp_homework` / `pp_homework_submissions`.

**C7 — Opinion Poll** *(new)*
- Active poll card (question + options as selectable choices) → submit; shows aggregate result after voting; closed polls read-only. Source: `pp_polls` / `pp_poll_responses`.

**C8 — Parent Concerns**
- **Add Concern** banner (＋). Illustrated empty state.
- **Category picker:** "Select Concern Main Category" list (JKKN-specific — see Taxonomies). → subject + description + attachment → submit.
- **Thread detail:** two-way messages (parent/staff), status pill (open/in-progress/resolved/closed). Source: `pp_concerns` / `pp_concern_messages`.

**C9 — Bus Tracking** *(static now)*
- Route name, bus number, driver name + **call** action, assigned stop, pickup/drop times; map placeholder ("live GPS coming"). Source: `pp_bus_routes` / `pp_bus_assignments`.

**C10 — Wellness**
- **Filter by Category** chips (JKKN: Parenting / Soft Skills / Wellbeing Corner). Time-grouped article cards (category eyebrow, title, preview, date, NEW badge) → article detail. Source: `pp_wellness_records` (and a wellness-articles set; see Open Questions).

**C11 — Gate Pass & Leaves**
- **Request New Pass** (＋) + **authorised-members** icon; tabs **Gate Passes | Leaves**; illustrated empty states with QR illustration.
- **"Choose the required"** sheet: **Gate Pass** ("leave campus for less than a day") | **Leave Request**.
- **Select Pickup Person:** list of authorised members + **Add New Member** (name, relation, photo, ID).
- **Select type of Leave:** JKKN-specific (see Taxonomies) → dates + reason → submit.
- Approved gate pass shows a **scannable QR** (`qr_token`). Source: `pp_gate_passes`.

**C12 — Events & Gallery**
- **Completed Events** list (`Showing 10 of 179`): thumbnail + title + preview + time/date + chevron; calendar filter.
- **Event detail:** date · title · multi-paragraph description · **Image (N)** gallery thumbnails (Drive media) · **Download** + **Share**. Source: `pp_events` / `pp_gallery_items`.

**C13 — Spotlight** *(drawer)* — curated highlight cards (title, media, link). Source: `pp_spotlight`.

**C14 — Notifications** *(drawer/bell)* — chronological list, read/unread, tap → `action_url`; mark-read. Source: `pp_notifications_log`.

**C15 — Help & Feedback** *(drawer, bottom sheet)*
- "Hi there 👋" sheet with action cards (JKKN-specific — see Taxonomies): **Report an Issue · Suggest an Improvement · Share Appreciation** (+ optional Ask a Question). Source: `pp_feedback`.

**C16 — Settings** *(drawer)* — Theme (B5), Language, Push toggle, Change Password, Logout (`queryClient.clear()` + clears `parent_session`).

**C17 — About Us / Contact Us** *(drawer)* — static institution info, address, phone (call), email, map link, social.

**C18 — Add Sibling** *(drawer / switcher)* — enter sibling admission no. → OTP to registered mobile → link; appears in switcher.

### JKKN-Specific Taxonomies (replacing reference enums)

> Chosen: JKKN learner-centered taxonomies (not the reference's verbatim lists).

**Concern main categories** (`pp_concerns.category`):
`fees_billing` · `learning_academics` · `learning_studio_infrastructure` · `food_water` · `transport_bus` · `learner_wellbeing_health` · `uniform_materials` · `records_personal_details` · `hygiene_washroom` · `gps_tracking` · `attendance` · `other`.

**Leave types** (Gate Pass & Leaves):
`sick` · `casual` · `emergency` · `on_duty` (event/competition/representing institution) · `planned_family`.

**Gate-pass types** (`pp_gate_passes.pass_type`): `early_leave` · `late_arrival` · `outpass` · `medical`.

**Help & Feedback actions** (`pp_feedback.type`):
`issue` (Report an Issue) · `improvement` (Suggest an Improvement) · `appreciation` (Share Appreciation) · `question` (Ask a Question).

**Wellness categories**: `parenting` · `soft_skills` · `wellbeing_corner`.

> These are encoded as enum/CHECK values in the migration; UI labels are mapped via a `PARENT_PORTAL_LABELS` map in `types/parent-portal.ts`.

---

## PWA Setup

- `public/manifest.json` (name "JKKN Parent", icons, `display: standalone`, theme `#0b6d41`).
- Service worker (`next-pwa`) scoped to `/parent` — offline shell + Web Push (`web-push` + VAPID keys).
- `install-prompt.tsx` shows add-to-home banner.
- `layout.tsx` sets viewport `maximum-scale=1`, safe-area insets, mobile theme.

---

## Branding

Per `brand-styling`: primary green `#0b6d41`, secondary yellow `#ffde59`, cream `#fbfbee`, Inter/Poppins. Mobile card UI from the reference, JKKN-recolored. Dark mode supported (reference app has it). Per-institution logo from `institutions` table in the header.

---

## RBAC / Access Control

The parent portal has **no JKKN staff RBAC** — authorization = **verified link** in `pp_parent_learner_links`. Staff-side management of `pp_*` content (announcements, homework, concerns, achievements) is a **separate Phase A.5** under the existing staff app `app/(routes)/academic/parent-portal-admin/*` using the standard `myjkkn-page-development` pattern and permission keys:

```
academic.parent-portal.announcements.[view|create|edit|delete]
academic.parent-portal.homework.[view|create|edit|mark]
academic.parent-portal.concerns.[view|respond]
academic.parent-portal.accounts.[view|manage]
```

---

## Validation Rules

| Rule | Detail |
|---|---|
| Identifier resolution | Admission must match `application_id`/`roll_number`/`register_number`; mobile must match `father_mobile`/`mother_mobile`. |
| No enumeration leak | Registration/forgot return generic messages; never confirm which field failed. |
| OTP | 6-digit, hashed, 5-min expiry, max 5 attempts, single-use (`consumed_at`). |
| Password | min 8 chars, bcrypt cost 10; never logged. |
| Sibling link | Requires OTP to the registered mobile before `is_verified=true`. |
| Learner scope | Every `/api/parent/*` read/write runs `assertLearnerAccess`. |
| Homework submission | Only before/at due date sets `submitted`; after → `late`; cannot resubmit once `marked`. |
| Poll | One response per (poll, parent, learner). |
| Gate pass | `requested_date` ≥ today; QR token single-use. |
| Fee payment | Amount/status read from `billing_student_bills`; never client-trusted. |
| Active child | All queries require a valid `activeLearnerId` in scope. |

---

## Environment Variables (`.env.example`)

```env
# Parent Portal auth
PARENT_JWT_SECRET=__random_32+_chars__

# Google Drive (single shared drive for whole software)
GOOGLE_DRIVE_CLIENT_EMAIL=svc@project.iam.gserviceaccount.com
GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID=...

# Web Push (PWA)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...

# OTP / SMS
SMS_GATEWAY_API_KEY=...
SMS_SENDER_ID=JKKNPS
# WhatsApp reuses existing META_WHATSAPP_* vars

# COE (exam results proxy — reuse BoS vars if already set)
COE_SUPABASE_URL=...
COE_SUPABASE_SERVICE_ROLE_KEY=...
```

---

## RLS Policies

`pp_*` tables: enable RLS as defense-in-depth (proxy uses service-role/admin client which bypasses, so app-layer `assertLearnerAccess` is the real gate). Mirror BoS approach:

```sql
ALTER TABLE pp_parent_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pp_parent_learner_links ENABLE ROW LEVEL SECURITY;
-- ... all pp_* tables ...
-- service-role bypasses; no public anon policy (parents never hit Supabase directly).
```

---

## Pre-Flight Checklist

- [ ] Migration `supabase/migrations/20260613_create_parent_portal_tables.sql` created (all `pp_*` + indexes + RLS).
- [ ] `.env` vars added (`PARENT_JWT_SECRET`, Drive, VAPID, SMS, COE).
- [ ] `lib/auth/parent-jwt.ts`, `lib/auth/parent-password.ts`, `lib/utils/parent-access.ts` created.
- [ ] `middleware.ts` matcher extended for `/parent/*` + `/api/parent/*` (auth routes public).
- [ ] `lib/google/drive-client.ts` + foldering helper created.
- [ ] `types/parent-portal.ts` complete.
- [ ] Services in `lib/services/parent/`, hooks in `hooks/parent/` (React Query, child-scoped keys).
- [ ] `app/(parent-portal)/layout.tsx` isolated shell (no staff sidebar), `ParentSessionProvider`.
- [ ] PWA manifest + service worker scoped to `/parent`.
- [ ] Reads use existing tables (`learners_profiles`, `student_attendance`, `billing_*`) — NOT recreated.
- [ ] Exam results via COE proxy (BoS pattern).
- [ ] `queryClient.clear()` on logout (cross-user cache safety).

---

## Implementation Phases (School-First)

### Phase A1 — Auth & Shell (Foundation, start here)
1. Migration: `pp_parent_accounts`, `pp_parent_learner_links`, `pp_otp_verifications`, `pp_devices`.
2. `parent-jwt.ts`, `parent-password.ts`, `parent-access.ts`, middleware matcher.
3. OTP service (WhatsApp→SMS), `/api/parent/auth/*` (login/register/otp/forgot/logout).
4. `app/(parent-portal)/layout.tsx` (bottom-nav + drawer), splash + onboarding carousel, login/register/forgot pages, `ParentSessionProvider`, `useParentSession`.
5. `/api/parent/children`, child switcher (bottom sheet), dashboard shell + tile grid + profile card (reads `learners_profiles`), theme dialog (light/dark/system).

### Phase A2 — Core Academic (read existing data)
1. Profile (learner + parent tabs). 2. Attendance (donut, `student_attendance`). 3. Exam Results (COE proxy). 4. Fees (bills + HDFC pay + receipts). 5. Announcements.

### Phase A3 — Homework (Classroom-style + Drive)
1. `pp_homework` + `pp_homework_submissions` migration. 2. Drive client + upload. 3. Homework list/detail/submit. 4. Facilitator marking (staff admin Phase A.5). 5. Notifications on assign/mark.

### Phase A4 — Engagement
Achievements · Opinion Poll · Parent Concerns (thread) · Events & Gallery · Spotlight · Wellness · Notifications center.

### Phase A5 — Operational + Support
Bus Tracking (static) · Gate Pass (QR) · Leaves (Sick/Casual/Emergency/On-Duty/Planned) · Authorised Pickup Members · Add Sibling · Settings · About Us · Help & Feedback (Issue/Improvement/Appreciation/Question) · Contact Us · staff-side admin pages for `pp_*` content.

### Phase A6 — PWA polish
Manifest, service worker, Web Push subscription (`pp_devices`), install prompt, offline shell, dark mode.

---

## Phase B Notes — Institution (College) Parent Portal

The college portal reuses **everything** above. Deltas only:
- Label adaptation switches off school labels (`entity_type='institution'` → "Class"→"Program", "Subject"→"Course", etc. via `school-label-adapter`).
- Exam results richer (CIA + semester GPA) from COE.
- Some tiles hidden (Wellness/Gate Pass may be school-only); add college-specific (e.g., internship, placements) later.
- Same `pp_*` tables, same auth, same child switcher (a parent with a school child **and** a college child sees both under one login — the switcher already spans institutions).

> **No fork.** Build Phase A generically with `entity_type`-driven tile visibility so Phase B is a configuration + a few new tiles, not a rewrite.

---

## Open Questions (clarify before/within implementation)

- [ ] SMS gateway vendor (for OTP fallback) — which provider/API is licensed for JKKN?
- [ ] Google Shared Drive: confirm a Workspace Shared Drive (not a personal My Drive) and the service account is a member.
- [ ] Does HDFC SmartGateway (existing `payment_transactions`) support a parent-initiated session without a staff context? Confirm callback handling for the parent route.
- [ ] Who authors homework/announcements — facilitators in the staff app (Phase A.5), or imported? Confirm the staff-admin surface scope.
- [ ] Achievements/wellness data entry — staff app only, or bulk import?
- [ ] Attendance JSONB shape: confirm how to resolve a single learner's present/absent across `attendance_data` for both `period_wise` and `session_wise` modes.
- [ ] Rate-limit policy for OTP send (per mobile / per IP).

---

*Spec version: 1.1 | Created: 2026-06-13 | Module: Parent Portal (School-First) | Author: Claude (JKKN MyJKKN)*
*Design derived via brainstorming skill + parent-app reference screenshots (mobile, K-12 school).*
