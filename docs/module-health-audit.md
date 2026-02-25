# MyJKKN Module Health Audit

**Date**: 2026-02-25
**Scope**: 28 major modules across 5 architectural layers
**Methodology**: 7-step audit (Pattern → Integrity → Bypasses → Infrastructure → Types → Structure → Security → API Surface)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total route modules | 41 |
| Total API route files | 480 (405 session + 75 api-mgmt) |
| Service directories | 41 |
| Hook directories | 30 (+35 standalone) |
| `as any` casts (services) | **1,892 total** |
| Files > 500 lines | **30+** |
| API routes with `withAuth` | 124 / 405 (31%) |
| API routes with permission checks | 148 / 405 (36%) |
| API-mgmt routes (SERVICE_ROLE_KEY) | 75 (all bypass RLS by design) |
| Hooks using fetch (Pattern A) | 47 |
| Hooks using direct Supabase | 23 (bypasses) |
| Hooks using Service classes | 201 (Pattern B) |

### Pattern Distribution

| Pattern | Modules | Description |
|---------|---------|-------------|
| **A (fetch)** | 6 | Hook → fetch(/api/) → withAuth → Service → DB |
| **B (service)** | 12 | Hook → Service → browser Supabase → DB (RLS) |
| **B+bypass** | 5 | Mostly B but some hooks call Supabase directly |
| **Hybrid** | 4 | Mix of fetch + Supabase in same module |
| **C (direct)** | 1 | Hooks call Supabase with no service layer |

### Top 5 Critical Findings

1. **SERVICE_ROLE_KEY in 75 api-management routes** — bypasses ALL RLS. API key validation is the only guard. If an API key leaks, full database access.
2. **1,892 `as any` casts** across services — type safety is severely degraded in admission (348), academic (347), learners-council (227), okr (179)
3. **Only 31% of API routes use withAuth** — 281 routes lack the standard auth wrapper
4. **23 hooks have direct Supabase calls** — bypasses the service layer, creating inconsistent data access patterns
5. **attendance-service.ts is 4,011 lines** — the largest service file, needs decomposition

---

## Module Reports

---

### Module: academic
**Pattern**: Hybrid (fetch + Supabase + api-management)
**Layers**: Route ✓ | API · | API-Mgmt ✓ (6 routes) | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: MIXED — hooks use fetch (5), Supabase direct (4), AND Service calls (108). Three competing patterns.
- **Bypasses**: 4 direct Supabase references in hooks, plus page-level Supabase in attendance dashboard components
- **Infrastructure gaps**: No session-auth API routes (`app/api/academic/` doesn't exist) — hooks go directly to services or Supabase
- **Type safety**: **347 `as any` casts** — second worst in codebase
- **Structural health**: CRITICAL
  - `attendance-service.ts`: **4,011 lines**
  - `timetable-service.ts`: **2,555 lines**
  - `attendance-report-service.ts`: **1,420 lines**
  - `staff-plan-service.ts`: **1,194 lines**
  - `attendance-dashboard-service.ts`: **980 lines**
  - `attendance-consolidation-service.ts`: **941 lines**

#### Security
- **API-mgmt auth**: Custom API-key validation + SERVICE_ROLE_KEY (bypasses RLS)
- **RLS**: Relied upon for browser-side access via hooks
- **SERVICE_ROLE_KEY**: Used in 6 api-management routes
- **Permissions**: Not enforced in hook-level access

#### External Readiness
- **API-key routes**: 6 (academic-years CRUD, batches CRUD, regulations CRUD)
- **Coverage**: Partial — attendance, timetable, staff-plan have NO external API
- **Verdict**: **API-Partial**

#### Priority Fixes
1. Decompose `attendance-service.ts` (4,011 lines → split by domain)
2. Eliminate 347 `as any` casts
3. Standardize hook pattern — pick fetch OR service, not both
4. Add session-auth API routes for attendance/timetable
5. Add api-management routes for attendance data

---

### Module: admission
**Pattern**: Hybrid (fetch + Supabase)
**Layers**: Route ✓ | API ✓ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: MIXED — hooks use fetch (57), Supabase direct (25), AND Service calls (386). The highest volume of all three patterns.
- **Bypasses**: 25 direct Supabase references in hooks. `use-chat-realtime.ts` uses Supabase for real-time subscriptions (acceptable), but other bypasses need fixing.
- **Infrastructure**: Very comprehensive — covers leads, activities, counselors, communication, analytics, workflows, SMS, WhatsApp
- **Type safety**: **348 `as any` casts** — WORST in codebase
- **Structural health**:
  - `hooks/admission/index.ts`: **1,344 lines** (barrel file with implementations)
  - `consultant-service.ts`: **2,413 lines**
  - `admission-service.ts`: **1,466 lines**
  - `sms-campaign-service.ts`: **998 lines**
  - `insight-actions-service.ts`: **987 lines**

#### Security
- **API auth**: Session-auth routes use `withAuth`
- **SERVICE_ROLE_KEY**: Used in whatsapp-number settings routes (3 routes)
- **Permissions**: Enforced via RLS INSERT policy (admin, super_admin, staff, institution_admin, administrator, active education consultants)

#### External Readiness
- **API-key routes**: None
- **Auth mode**: Session-only
- **Verdict**: **API-None** — CRM data could benefit from external API for integrations

#### Priority Fixes
1. Eliminate 348 `as any` casts (highest in codebase)
2. Split `hooks/admission/index.ts` into per-feature files
3. Decompose `consultant-service.ts` (2,413 lines)
4. Migrate remaining 25 Supabase-direct hooks to fetch pattern
5. Consider api-management routes for lead import/export

---

### Module: ai-query
**Pattern**: A (fetch)
**Layers**: Route ✓ | API ✓ (1 route) | API-Mgmt ✗ | Service ✓ (standalone) | Hook ✓ (standalone)

#### Internal Health
- **Pattern integrity**: Clean — `use-ai-query.ts` → fetch(`/api/ai-query`) → `ai-query-service.ts` → Supabase
- **Bypasses**: None detected
- **Infrastructure**: Single-purpose module (chat with Claude AI)
- **Type safety**: 14 `as any` casts in `lib/services/ai/`
- **Structural health**:
  - `app/api/ai-query/route.ts`: **1,134 lines** (22 tool definitions inline)
  - `lib/services/ai-query-service.ts`: **870 lines**
  - `lib/config/ai-query-tools-config.ts`: **690 lines**

#### Security
- **API auth**: Route checks session auth manually (not withAuth wrapper)
- **Rate limiting**: Implemented via `AIQueryService.checkRateLimit`
- **SERVICE_ROLE_KEY**: Not in browser code
- **Permissions**: Session-based, user must be authenticated

#### External Readiness
- **API-key routes**: None (and shouldn't have — AI queries are user-specific)
- **Verdict**: **API-None** (by design)

#### Priority Fixes
1. Extract 22 tool definitions from route.ts into config file (reduce 1,134 → ~400)
2. Add withAuth wrapper for consistency
3. Reduce `as any` casts in ai services

---

### Module: alumni
**Pattern**: B (service)
**Layers**: Route ✓ | API ✗ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Clean — hooks call AlumniService methods directly
- **Bypasses**: None (0 Supabase references in hooks)
- **Infrastructure**: Covers alumni profiles, events, networking, mentorship
- **Type safety**: 15 `as any` casts
- **Structural health**: Clean, well-organized

#### Security
- **RLS**: Critical (no API layer, browser Supabase is only protection)
- **SERVICE_ROLE_KEY**: None in browser code
- **Permissions**: Relies entirely on RLS policies

#### External Readiness
- **API routes**: None
- **Verdict**: **API-None**
- **Recommendation**: Consider B→A migration for alumni directory data

#### Priority Fixes
1. Verify RLS policies use `auth_institution_id()`
2. Reduce 15 `as any` casts

---

### Module: applications
**Pattern**: A-ext
**Layers**: Route ✓ (application-hub) | API ✓ | API-Mgmt ✓ (2 routes) | Service ✓ | Hook ✓ (use-applications.ts, use-api-applications.ts)

#### Internal Health
- **Pattern integrity**: Clean — dual hook pattern (session + API-key)
- **Bypasses**: `_components/application-form.tsx` has Supabase reference (file upload)
- **Infrastructure**: Applications CRUD, status management
- **Type safety**: 8 `as any` casts (low)
- **Structural health**: Clean

#### Security
- **API auth**: withAuth on session routes
- **API-mgmt**: SERVICE_ROLE_KEY + API key validation
- **Permissions**: Enforced

#### External Readiness
- **API-key routes**: 2 (list + get by ID)
- **Missing**: POST, PATCH, DELETE operations
- **Verdict**: **API-Partial**

#### Priority Fixes
1. Add PATCH/DELETE to api-management routes
2. Move file upload logic out of component

---

### Module: audit-trail
**Pattern**: B (service)
**Layers**: Route ✓ | API ✗ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Clean — hooks (0 fetch, 0 supabase, 0 service calls in directory?). Hook directory may contain barrel imports.
- **Bypasses**: None detected
- **Type safety**: 5 `as any` casts (good)
- **Structural health**: Clean, small module

#### Security
- **RLS**: Critical (browser Supabase)
- **Permissions**: Read-only typically

#### External Readiness
- **Verdict**: **API-None**

#### Priority Fixes
1. Verify hooks actually connect to services (detected 0 calls — may be stub)

---

### Module: billing
**Pattern**: A (fetch) + B (service)
**Layers**: Route ✓ | API ✓ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Mixed — hooks use fetch (2) AND Service calls (99). Mostly Pattern B with some Pattern A routes.
- **Bypasses**: None (0 Supabase in hooks)
- **Infrastructure**: Comprehensive — invoices, receipts, COPQ, reports, payment gateway
- **Type safety**: **90 `as any` casts**
- **Structural health**:
  - `billing-report-service.ts`: **1,510 lines**
  - `payment-gateway-service.ts`: **1,316 lines**
  - `billing-receipt-service.ts`: **1,071 lines**
  - `billing-invoice-service.ts`: **1,017 lines**

#### Security
- **API auth**: Session routes use withAuth
- **RLS**: Special — billing tables use `user_institution_access` (by design, per CLAUDE.md)
- **SERVICE_ROLE_KEY**: None in hooks

#### External Readiness
- **API-key routes**: None
- **Verdict**: **API-None** — billing data is sensitive, session-only is appropriate

#### Priority Fixes
1. Decompose 4 billing service files (all > 1,000 lines)
2. Reduce 90 `as any` casts
3. Standardize on fetch OR service pattern (currently mixed)

---

### Module: bug-reports
**Pattern**: Hybrid (fetch + Supabase)
**Layers**: Route ✓ (bug-leaderboard, my-bug-reports) | API ✓ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Mixed — hooks use fetch (15), Supabase (6), Service (4)
- **Bypasses**: `use-message-reads.ts` has direct Supabase, plus page components (`bug-report-chat.tsx`, `bug-report-user-chat.tsx`)
- **Type safety**: 16 `as any` casts
- **Structural health**: Moderate

#### Security
- **API auth**: withAuth on API routes
- **Real-time**: Supabase real-time for chat (acceptable bypass)

#### External Readiness
- **Verdict**: **API-None** (internal tool)

#### Priority Fixes
1. Separate real-time subscriptions from data fetch bypasses
2. Migrate non-realtime Supabase calls to fetch pattern

---

### Module: campus-living
**Pattern**: A-ext (most comprehensive external API)
**Layers**: Route ✓ | API ✗ | API-Mgmt ✓ (**37 routes**) | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: B+bypass — hooks mostly use Service (233) but 3 direct Supabase calls
- **Bypasses**: 3 (`use-is-hostel-resident.ts` plus others)
- **Infrastructure**: VERY comprehensive — residents, rooms, blocks, mess, gate-passes, incidents, health, laundry, maintenance, inspections, visitors, safety, onboarding, cleaning, reports
- **Type safety**: **130 `as any` casts**
- **Structural health**: Large module with many sub-domains

#### Security
- **API-mgmt**: 37 routes ALL use SERVICE_ROLE_KEY (bypasses RLS)
- **API-key validation**: Custom inline validation per route
- **RLS**: For browser-side hook access

#### External Readiness
- **API-key routes**: **37** — most comprehensive external API in the system
- **CRUD coverage**: Full — list, get, create, update, delete for all entities
- **Verdict**: **API-Ready**

#### Priority Fixes
1. Reduce 130 `as any` casts
2. Fix 3 Supabase bypasses in hooks
3. Consider extracting shared api-management auth middleware (currently inline in each route)

---

### Module: competency (competency-catalog)
**Pattern**: B (service)
**Layers**: Route ✓ (competency-catalog) | API ✗ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Clean — hooks call Service methods (30 calls)
- **Bypasses**: None
- **Type safety**: **59 `as any` casts**
- **Structural health**: Clean

#### Security
- **RLS**: Critical (browser Supabase only)

#### External Readiness
- **Verdict**: **API-None**

#### Priority Fixes
1. Reduce 59 `as any` casts
2. Verify RLS policies

---

### Module: facilitator (facilitator-development, facilitator-impact)
**Pattern**: B (service)
**Layers**: Route ✓ (2 sub-routes) | API ✗ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Clean — hooks call Service (12 calls)
- **Bypasses**: None
- **Type safety**: 27 `as any` casts
- **Structural health**: Clean

#### Security
- **RLS**: Critical (browser Supabase)

#### External Readiness
- **Verdict**: **API-None**

#### Priority Fixes
1. Reduce 27 `as any` casts

---

### Module: grievance
**Pattern**: B (service) despite having API routes
**Layers**: Route ✓ | API ✓ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Inconsistent — API routes exist but hooks call Service directly (24 calls, 0 fetch)
- **Bypasses**: None in hooks, but the API routes may be unused
- **Type safety**: 3 `as any` casts (excellent)
- **Structural health**: Clean
  - Test file: `grievance-service.test.ts`: **1,408 lines**

#### Security
- **API auth**: Routes have withAuth
- **RLS**: Also protected by browser Supabase RLS

#### External Readiness
- **API-key routes**: None
- **Auth mode**: Session-only (routes exist but hooks don't use them)
- **Verdict**: **API-None**

#### Priority Fixes
1. DECISION NEEDED: Either migrate hooks to use API routes (make it Pattern A) or remove unused API routes
2. This is a B/A identity crisis — hooks bypass the API entirely

---

### Module: industry
**Pattern**: B (service)
**Layers**: Route ✓ | API ✗ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Clean — hooks call Service (38 calls)
- **Bypasses**: None
- **Type safety**: **49 `as any` casts**
- **Structural health**: Clean

#### Security
- **RLS**: Critical (browser Supabase)

#### External Readiness
- **Verdict**: **API-None**

#### Priority Fixes
1. Reduce 49 `as any` casts

---

### Module: learners
**Pattern**: A-ext
**Layers**: Route ✓ | API ✓ | API-Mgmt ✓ (5 routes) | Service ✓ | Hook ✓ (learner-profile)

#### Internal Health
- **Pattern integrity**: A(fetch) — `hooks/learner-profile/` uses fetch (7), no Supabase
- **Bypasses**: Page components have Supabase: `bulk-upload-learner-images.tsx`, `profile-image-upload.tsx` (file uploads), `analytics/dashboard-filters.tsx`
- **Infrastructure**: Comprehensive — profiles, enquiries, bulk upload, validation, onboarding, analytics
- **Type safety**: 19 `as any` casts
- **Structural health**:
  - `learner-profile-service.ts`: **2,499 lines**
  - `app/api/learners/enquiries/template/route.ts`: **1,304 lines**
  - `app/api/learners/enquiries/import/route.ts`: **987 lines**

#### Security
- **API auth**: withAuth on session routes + additional admin routes for check-missing-profiles, create-missing-profiles (SERVICE_ROLE_KEY)
- **API-mgmt**: 5 routes (profiles CRUD, enquiries CRUD, alumni list)
- **SERVICE_ROLE_KEY**: In admin utility routes (check/create missing profiles, complete-onboarding)

#### External Readiness
- **API-key routes**: 5 (profiles list/get, enquiries list/get, alumni list)
- **Missing**: POST/PATCH for profiles via api-mgmt
- **Verdict**: **API-Partial**

#### Priority Fixes
1. Decompose `learner-profile-service.ts` (2,499 lines)
2. Split enquiry template/import routes (1,304 + 987 lines)
3. Move file upload Supabase calls out of page components
4. Add write operations to api-management routes

---

### Module: learners-council
**Pattern**: B (service)
**Layers**: Route ✓ | API ✗ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Clean — hooks call Service (137 calls — very heavy)
- **Bypasses**: None
- **Type safety**: **227 `as any` casts** — 3rd worst
- **Structural health**:
  - `communication-service.ts`: **1,490 lines**

#### Security
- **RLS**: Critical (browser Supabase only)

#### External Readiness
- **Verdict**: **API-None**

#### Priority Fixes
1. Eliminate 227 `as any` casts (3rd worst in codebase)
2. Decompose `communication-service.ts` (1,490 lines)

---

### Module: learning-path
**Pattern**: B (service)
**Layers**: Route ✓ (learning-paths) | API ✗ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Clean — hooks call Service (11 calls)
- **Bypasses**: None
- **Type safety**: 15 `as any` casts
- **Structural health**: Clean

#### Security
- **RLS**: Critical (browser Supabase)

#### External Readiness
- **Verdict**: **API-None**

#### Priority Fixes
1. Reduce 15 `as any` casts

---

### Module: maturity-assessment
**Pattern**: B (service) with API routes existing but unused by hooks
**Layers**: Route ✓ | API ✓ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Inconsistent — API routes exist but hooks use Service directly (33 calls, 0 fetch)
- **Bypasses**: Page-level Supabase in `_data/get-dashboard.ts`, `_data/get-assessments.ts`, `progress/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx`
- **Type safety**: 1 `as any` cast (excellent)
- **Structural health**: Has `_data/` pattern (server-side data fetching) mixed with hook pattern

#### Security
- **API auth**: Routes have withAuth
- **RLS**: Browser Supabase for hook access
- **Page-level**: `_data/` files use server-side Supabase (server component pattern — OK)

#### External Readiness
- **Verdict**: **API-None**

#### Priority Fixes
1. DECISION NEEDED: Same identity crisis as grievance — hooks don't use API routes
2. Clarify `_data/` vs hooks pattern — currently using BOTH for different pages

---

### Module: notifications
**Pattern**: A (but hooks may be stubs)
**Layers**: Route ✓ | API ✓ | API-Mgmt ✗ | Service ✓ (notification/) | Hook ✓ (notification/ — 0 calls detected)

#### Internal Health
- **Pattern integrity**: Unclear — hook directory exists but 0 fetch/service/supabase calls detected
- **Infrastructure**: API routes exist, standalone `use-notifications.ts` uses Supabase directly
- **Type safety**: 10 `as any` casts
- **Structural health**: Moderate

#### Security
- **API auth**: Routes use withAuth

#### External Readiness
- **Verdict**: **API-None**

#### Priority Fixes
1. Investigate if `hooks/notification/` contains stubs or actual implementations
2. `use-notifications.ts` (standalone) bypasses any API layer

---

### Module: okr
**Pattern**: A-ext (but hooks bypass API)
**Layers**: Route ✓ | API ✓ | API-Mgmt ✓ (7 routes) | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: B+bypass — despite having API routes, hooks use Service (93) + direct Supabase (18), zero fetch calls
- **Bypasses**: **18 direct Supabase references** in hooks (`use-check-ins.ts`, `use-okr-notifications.ts`)
- **Type safety**: **179 `as any` casts**
- **Structural health**:
  - `okr-metric-engine.ts`: **1,091 lines**

#### Security
- **API-mgmt**: 7 routes (objectives, key-results, check-ins, compliance, stats, team) — all SERVICE_ROLE_KEY
- **RLS**: For browser access
- **Identity crisis**: Hooks bypass both session and api-management routes

#### External Readiness
- **API-key routes**: 7 (objectives CRUD, key-results, check-ins, compliance, stats, team)
- **Verdict**: **API-Partial** (routes exist but internal hooks don't use them)

#### Priority Fixes
1. Migrate hooks from Service+Supabase to fetch pattern (align with API routes)
2. Eliminate 18 direct Supabase bypasses in hooks
3. Reduce 179 `as any` casts
4. Decompose `okr-metric-engine.ts` (1,091 lines)

---

### Module: organizations
**Pattern**: A-ext (Hybrid hooks)
**Layers**: Route ✓ | API ✓ | API-Mgmt ✓ (16 routes) | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Hybrid — hooks use fetch (1), Supabase (4), Service (14)
- **Bypasses**: 4 direct Supabase in hooks + 8 `_data/` files in route pages (institutions, sections, departments, semesters, programs, courses, degrees, course-mappings)
- **Type safety**: 64 `as any` casts
- **Structural health**: Moderate — `_data/` server-side pattern is clean but different from hooks

#### Security
- **API-mgmt**: 16 routes covering institutions, departments, courses, degrees, programs, sections, semesters — all SERVICE_ROLE_KEY
- **RLS**: For browser access

#### External Readiness
- **API-key routes**: 16 (comprehensive CRUD for org hierarchy)
- **Verdict**: **API-Ready**

#### Priority Fixes
1. Standardize hook pattern (currently 3 different approaches)
2. Reduce 64 `as any` casts
3. Reduce 4 Supabase bypasses in hooks

---

### Module: parent-portal
**Pattern**: A (fetch)
**Layers**: Route ✓ (parent + parent-portal) | API ✓ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Clean — hooks use fetch (1) + Service (37). Mostly Pattern B with some A migration.
- **Bypasses**: None
- **Type safety**: 4 `as any` casts (excellent)
- **Structural health**: Clean

#### Security
- **API auth**: withAuth on API routes

#### External Readiness
- **API-key routes**: None
- **Verdict**: **API-None**

#### Priority Fixes
1. Minor — standardize between fetch and Service patterns

---

### Module: process-excellence
**Pattern**: B (service) with unused API routes
**Layers**: Route ✓ | API ✓ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Inconsistent — API routes exist but hooks use Service directly (37 calls, 0 fetch)
- **Bypasses**: None
- **Type safety**: 2 `as any` casts (excellent)
- **Structural health**:
  - `process-excellence-service.ts`: **1,445 lines**
  - Test file: **1,125 lines**

#### Security
- **API auth**: Routes use withAuth

#### External Readiness
- **Verdict**: **API-None**

#### Priority Fixes
1. DECISION: Same pattern as grievance/maturity-assessment — hooks ignore API routes
2. Decompose `process-excellence-service.ts` (1,445 lines)

---

### Module: regulatory
**Pattern**: B+bypass
**Layers**: Route ✓ | API ✗ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Mixed — hooks use Service (47) + direct Supabase (29). **Most bypasses of any Pattern B module.**
- **Bypasses**: **29 direct Supabase references** across: `use-benchmarks.ts`, `use-evidence.ts`, `use-frameworks.ts`, `use-governance.ts`, `use-simulations.ts`, `use-syllabi.ts`
- **Type safety**: 72 `as any` casts
- **Structural health**: Well-organized with shared `utils.ts`

#### Security
- **RLS**: Critical — no API layer, all browser Supabase
- **SERVICE_ROLE_KEY**: In `seed-data/index.ts` (server-side seeding, acceptable)

#### External Readiness
- **Verdict**: **API-None**
- **Recommendation**: High value for B→A migration — compliance data often needs external reporting

#### Priority Fixes
1. Migrate 29 Supabase bypasses to service calls
2. Reduce 72 `as any` casts
3. Consider creating API routes for compliance reporting

---

### Module: resource-management
**Pattern**: B (service)
**Layers**: Route ✓ | API ✗ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Clean — hooks call Service (50 calls)
- **Bypasses**: None
- **Type safety**: 27 `as any` casts
- **Structural health**: Clean

#### Security
- **RLS**: Critical (browser Supabase)

#### External Readiness
- **Verdict**: **API-None**

#### Priority Fixes
1. Reduce 27 `as any` casts

---

### Module: social-media
**Pattern**: A (fetch) + page-level Supabase
**Layers**: Route ✓ | API ✓ | API-Mgmt ✗ | Service ✓ | Hook ✗ (no hook directory)

#### Internal Health
- **Pattern integrity**: BROKEN — no hooks directory, pages call Supabase directly
- **Bypasses**: 5 pages with direct Supabase: `accounts/page.tsx`, `accounts/[id]/page.tsx`, `accounts/[id]/manual-entry/page.tsx`, `analytics/page.tsx`, `page.tsx`
- **Infrastructure gap**: No hooks layer at all
- **Type safety**: 2 `as any` casts (good)
- **Structural health**: Missing architectural layer

#### Security
- **API auth**: withAuth on API routes + cron route
- **SERVICE_ROLE_KEY**: In `instagram-service.ts`, `youtube-service.ts` (server-side, acceptable)
- **Cron route**: `app/api/social-media/cron/route.ts` — needs verification

#### External Readiness
- **Verdict**: **API-None**

#### Priority Fixes
1. **Create hooks layer** — pages should not call Supabase directly
2. Migrate page-level Supabase calls to hooks → API pattern

---

### Module: solutions
**Pattern**: A (fetch) with B+bypass in hooks
**Layers**: Route ✓ | API ✓ (111 routes!) | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Mostly A — hooks use Service (7) + Supabase (1 bypass). API routes are comprehensive.
- **Bypasses**: 1 (`use-phases.ts` has direct Supabase)
- **Infrastructure**: VERY comprehensive — clients, products, payments, training, production-portal, builder-portal, validations, TRL
- **Type safety**: 22 `as any` casts (good)
- **Structural health**:
  - `types.ts`: **941 lines** (type definitions file)
  - 111 API route files (most of any module)

#### Security
- **API auth**: ALL routes use withAuth (verified — 0 unauthenticated)
- **withAuth pattern**: Consistent `withAuth(async (request, auth) => {...})`
- **Response envelope**: Uses `{ data, metadata }` pattern via `lib/api/response.ts`

#### External Readiness
- **API-key routes**: None (but 111 session-auth routes ready for extension)
- **Verdict**: **API-Partial** — massive internal API, no external exposure yet
- **Recommendation**: High candidate for api-management routes (client/product data)

#### Priority Fixes
1. Fix 1 Supabase bypass in `use-phases.ts`
2. Consider api-management routes for client/product data
3. Split `types.ts` (941 lines)

---

### Module: staff
**Pattern**: A-ext
**Layers**: Route ✓ | API ✓ | API-Mgmt ✓ (2 routes) | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: B(service) — hooks use Service (13), no fetch despite API routes existing
- **Bypasses**: None in hooks
- **Type safety**: 40 `as any` casts
- **Structural health**:
  - `staff-service.ts`: **1,571 lines**

#### Security
- **API auth**: withAuth + SERVICE_ROLE_KEY in admin routes (check-missing-profiles, create-missing-profiles)
- **API-mgmt**: 2 routes (list + get by ID)

#### External Readiness
- **API-key routes**: 2 (list, get by ID)
- **Missing**: POST, PATCH, DELETE
- **Verdict**: **API-Partial**

#### Priority Fixes
1. Migrate hooks to use API routes (currently bypassing them)
2. Decompose `staff-service.ts` (1,571 lines)
3. Reduce 40 `as any` casts
4. Add write operations to api-management

---

### Module: stakeholder-nps
**Pattern**: B (service) with unused API routes
**Layers**: Route ✓ | API ✓ | API-Mgmt ✗ | Service ✓ | Hook ✓

#### Internal Health
- **Pattern integrity**: Inconsistent — hooks use Service (15), 0 fetch. API routes unused by frontend.
- **Bypasses**: None
- **Type safety**: 11 `as any` casts
- **Structural health**:
  - Test file: **1,838 lines**

#### Security
- **API auth**: withAuth on routes

#### External Readiness
- **Verdict**: **API-None**

#### Priority Fixes
1. DECISION: Migrate hooks to fetch or remove unused API routes

---

## Utility Module Summary

| Module | Pattern | Layers | Health | Key Issue |
|--------|---------|--------|--------|-----------|
| **dashboard** | C/Hook | Route ✓, Hook (standalone) | OK | `use-dashboard.ts` standalone, may bypass service |
| **crm** | A(fetch) | API ✓, Hook ✓ | Clean | 4 fetch calls, no Supabase |
| **system** | Misc | Route ✓, API ✓ | OK | Admin system settings |
| **admin** | Misc | Route ✓, API ✓ | OK | Admin panel routes |
| **profile** | Hybrid | Route ✓, API ✓ | Mixed | `profile-form.tsx` has direct Supabase |
| **analytics** | A(fetch) | API ✓, Service ✓, Hook ✓ | Clean | 5 fetch + 6 Service calls |
| **reservation** | B+bypass | Service ✓, Hook ✓ | Mixed | 5 Supabase bypasses in hooks |
| **vac** | A(fetch) | Hook ✓ | Clean | 8 fetch + 29 Service calls |

---

## Cross-Cutting Issues

### 1. Pattern Identity Crisis (4 modules)
These modules have API routes that hooks DON'T USE:
- **grievance**: hooks → Service (24), API routes exist but unused
- **maturity-assessment**: hooks → Service (33), API routes exist but unused
- **process-excellence**: hooks → Service (37), API routes exist but unused
- **stakeholder-nps**: hooks → Service (15), API routes exist but unused

**Decision needed**: Either migrate hooks to use the API routes (Pattern A) or acknowledge these as Pattern B and keep API routes for future use.

### 2. `as any` Epidemic (Top 10)
| Module | Count |
|--------|-------|
| admission | 348 |
| academic | 347 |
| learners-council | 227 |
| okr | 179 |
| campus-living | 130 |
| billing | 90 |
| regulatory | 72 |
| organization | 64 |
| competency | 59 |
| industry | 49 |
| **Total top 10** | **1,565** |

### 3. Giant Files (> 1,000 lines)
| File | Lines |
|------|-------|
| `academic/attendance-service.ts` | 4,011 |
| `academic/timetable-service.ts` | 2,555 |
| `learner-profile-service.ts` | 2,499 |
| `admission/consultant-service.ts` | 2,413 |
| `stakeholder-nps/__tests__/nps-service.test.ts` | 1,838 |
| `staff/staff-service.ts` | 1,571 |
| `billing/reports/billing-report-service.ts` | 1,510 |
| `learners-council/communication-service.ts` | 1,490 |
| `admission/admission-service.ts` | 1,466 |
| `process-excellence/process-excellence-service.ts` | 1,445 |
| `academic/attendance-report-service.ts` | 1,420 |
| `hooks/admission/index.ts` | 1,344 |
| `billing/payment-gateway-service.ts` | 1,316 |
| `api/learners/enquiries/template/route.ts` | 1,304 |
| `academic/staff-plan-service.ts` | 1,194 |
| `api/ai-query/route.ts` | 1,134 |
| `process-excellence/__tests__` | 1,125 |
| `okr/okr-metric-engine.ts` | 1,091 |
| `billing/receipts/billing-receipt-service.ts` | 1,071 |
| `whatsapp/whatsapp-chat-service.ts` | 1,063 |
| `billing/invoices/billing-invoice-service.ts` | 1,017 |
| `admission/sms-campaign-service.ts` | 998 |
| `admission/insight-actions-service.ts` | 987 |

### 4. SERVICE_ROLE_KEY Exposure
- **75 api-management routes** all use SERVICE_ROLE_KEY (by design — API key auth bypasses RLS)
- **Admin utility routes**: 6 routes in learners/, staff/, admission/ use SERVICE_ROLE_KEY for one-off operations
- **External services**: WhatsApp, Instagram, YouTube services use it server-side (acceptable)
- **Risk**: If ANY api-management API key is compromised, attacker gets full RLS-bypassed access to that module's data

### 5. Response Envelope Inconsistency
- **31 files** use `{ data, metadata }` pattern (Solutions Hub standard)
- **441 route files** use `NextResponse.json()` directly (various shapes)
- No standardized envelope for non-Solutions modules

---

## Priority Action Matrix

### P0 — Security (do first)
1. Audit RLS policies for all Pattern B modules (12 modules with browser-only Supabase)
2. Verify api-management API key rotation and scoping
3. Review 6 admin utility routes using SERVICE_ROLE_KEY

### P1 — Architecture (decide direction)
4. Resolve Pattern Identity Crisis for grievance, maturity-assessment, process-excellence, stakeholder-nps
5. Create hooks layer for social-media (currently page → Supabase direct)
6. Standardize academic/admission/okr from Hybrid to single pattern

### P2 — Type Safety (ongoing)
7. Type generation campaign: regenerate `database.types.ts` and replace top `as any` offenders
8. Target: admission (348), academic (347), learners-council (227) first

### P3 — Structural (refactoring)
9. Decompose files > 2,000 lines: attendance-service, timetable-service, learner-profile-service, consultant-service
10. Split `hooks/admission/index.ts` (1,344 lines) into per-feature files

### P4 — External API (growth)
11. Add write operations to api-management for applications, learners, staff
12. Standardize api-management auth middleware (currently inline per route)
13. Consider OpenAPI spec generation for api-management routes
14. Evaluate solutions module for api-management exposure

---

## Module Scorecard

| Module | Pattern | Health | Security | API Ready | Score |
|--------|---------|--------|----------|-----------|-------|
| solutions | A | Good | Strong | Partial | ★★★★☆ |
| campus-living | A-ext | Good | Good | **Ready** | ★★★★☆ |
| organizations | A-ext | Mixed | Good | **Ready** | ★★★½☆ |
| parent-portal | A | Clean | Good | None | ★★★½☆ |
| crm | A | Clean | Good | None | ★★★½☆ |
| applications | A-ext | Clean | Good | Partial | ★★★☆☆ |
| learners | A-ext | Mixed | Good | Partial | ★★★☆☆ |
| alumni | B | Clean | RLS-dep | None | ★★★☆☆ |
| billing | A/B | Mixed | Good | None | ★★★☆☆ |
| staff | A-ext | Mixed | Good | Partial | ★★★☆☆ |
| ai-query | A | Clean | Good | None | ★★★☆☆ |
| resource-management | B | Clean | RLS-dep | None | ★★★☆☆ |
| learning-path | B | Clean | RLS-dep | None | ★★★☆☆ |
| bug-reports | Hybrid | Mixed | Good | None | ★★½☆☆ |
| facilitator | B | Clean | RLS-dep | None | ★★½☆☆ |
| audit-trail | B | Clean | RLS-dep | None | ★★½☆☆ |
| competency | B | OK | RLS-dep | None | ★★½☆☆ |
| industry | B | OK | RLS-dep | None | ★★½☆☆ |
| stakeholder-nps | B/A? | Identity Crisis | Good | None | ★★☆☆☆ |
| process-excellence | B/A? | Identity Crisis | Good | None | ★★☆☆☆ |
| grievance | B/A? | Identity Crisis | Good | None | ★★☆☆☆ |
| maturity-assessment | B/A? | Identity Crisis | Mixed | None | ★★☆☆☆ |
| notifications | A? | Unclear | OK | None | ★★☆☆☆ |
| okr | A-ext | Poor | Mixed | Partial | ★★☆☆☆ |
| regulatory | B+bypass | Mixed | RLS-dep | None | ★★☆☆☆ |
| admission | Hybrid | Poor | Mixed | None | ★½☆☆☆ |
| academic | Hybrid | Poor | Mixed | Partial | ★½☆☆☆ |
| social-media | Broken | Poor | Mixed | None | ★☆☆☆☆ |
| learners-council | B | Poor (types) | RLS-dep | None | ★½☆☆☆ |
