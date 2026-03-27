# Admission CRM B2A Migration — Complete Specification

> **Source**: Deep interview (2026-03-27) + codebase analysis + live DB verification
> **Audience**: AI Coding Agent (Claude Code / Cursor)
> **Branch**: `omm-dev`
> **Scope**: Full migration of all 42 sub-modules, all priorities, no deadline

---

## Problem Statement

The MyJKKN Admission CRM has 42 sub-modules with 97 pages, 49 services, and 64 hooks. Currently, most modules use a **Direct Service Call** pattern where React hooks call Supabase service classes directly from the browser. This means:

1. **No API boundary** — external consumers (mobile app, n8n automations, third-party integrations) cannot access admission data
2. **No unified auth** — no API key support, only browser session cookies
3. **Inconsistent patterns** — some modules have API routes (with old `getAuthUser`), others have none
4. **No standardized responses** — different shapes across modules

The migration wraps all service calls behind **withAuth API routes** (B2A Pattern A) to create a proper, externally-consumable API.

---

## Success Criteria

1. All 42 sub-modules use `withAuth` API routes (except `/apply` public route)
2. All hooks call `fetch('/api/admission/...')` instead of `Service.method()` directly
3. External API key consumers can access all admission endpoints
4. Zero breaking changes — each module migrated atomically (route + hook + page in one commit)
5. All 18 duplicate page routes deleted (keep nested, delete flat)
6. Sidebar menu updated to nested paths
7. 35 missing DB tables created from service code analysis
8. Full browser testing per module (click every button)

---

## Decisions Made (Interview Results)

| Decision | Answer | Rationale |
|----------|--------|-----------|
| Missing DB tables | **Create them** from service code + standard columns | Services reference them, API routes need them |
| Breaking changes | **Atomic per module** — route + hook + page in one commit | No intermediate broken state |
| Duplicate page routes | **Keep nested, delete flat** + update sidebar | Cleaner URL structure |
| withAuth purpose | **API key support for external apps** | Mobile, n8n, third-party integrations |
| Schema source | **Service code + standard columns** (id, institution_id, created_at, updated_at, created_by) | Services define actual column usage |
| Service refactor | **No** — withAuth handles auth transparently | Services keep createClientSupabaseClient() |
| Testing level | **Build + API curl + Browser + click every button** | Full verification required |
| Scope | **All priorities, no deadline** | P0→P1→P2→P3, each priority is a milestone |
| API consumers | **Generic** (mobile, n8n, third-party) | Build for multiple unknown consumers |

---

## Critical Blocker: 35 Missing Database Tables

The following tables are referenced by admission services but **DO NOT EXIST** in the staging database. These MUST be created before the corresponding modules can be migrated.

### Admission Core (6 tables)

| Table | Referenced By | Related Module |
|-------|--------------|----------------|
| `admission_scoring_rules` | `scoring-rules-service.ts` | Settings > Scoring Rules |
| `admission_loan_applications` | `loan-service.ts` | Financial > Loans |
| `admission_loan_partners` | `loan-service.ts` | Financial > Loans |
| `admission_payments` | `seat-confirmation-service.ts` | Enrollment > Seat Confirmation |
| `admission_action_executions` | `insight-actions-service.ts` | AI Insights |
| `admission_query_history` | `agentic-query-service.ts` | AI Queries |

### GD-PI (4 tables)

| Table | Referenced By |
|-------|--------------|
| `admission_gdpi_sessions` | `gdpi-service.ts` |
| `admission_gdpi_candidates` | `gdpi-service.ts` |
| `admission_gdpi_evaluators` | `gdpi-service.ts` |
| `admission_gdpi_scores` | `gdpi-service.ts` |

### Campaign / Workflow (3 tables)

| Table | Referenced By |
|-------|--------------|
| `admission_campaign_step_queue` | `campaign-processor-service.ts` |
| `admission_whatsapp_campaign_logs` | `whatsapp-campaign-service.ts` |
| `admission_workflow_executions` | `workflows-service.ts` |

### Alerts (2 tables)

| Table | Referenced By |
|-------|--------------|
| `activity_alert_rules` | `activity-alert-service.ts` |
| `activity_alert_history` | `activity-alert-service.ts` |

### Selection (5 tables)

| Table | Referenced By |
|-------|--------------|
| `interview_bookings` | `interview-service.ts` |
| `interview_slots` | `interview-service.ts` |
| `merit_lists` | `merit-list-service.ts` |
| `screening_exams` | `screening-exam-service.ts` |
| `scholarships` | `scholarship-service.ts` |

### Enrollment (7 tables)

| Table | Referenced By |
|-------|--------------|
| `scholarship_applications` | `scholarship-service.ts` |
| `offer_letters` | `offer-letter-service.ts` |
| `lateral_entry_applications` | `lateral-entry-service.ts` |
| `lateral_entry_documents` | `lateral-entry-service.ts` |
| `lateral_entry_eligibility_rules` | `lateral-entry-service.ts` |
| `lateral_entry_vacancies` | `lateral-entry-service.ts` |
| `application_documents` | `document-service.ts` |

### Consultants (2 tables)

| Table | Referenced By |
|-------|--------------|
| `consultant_institutions` | `consultant-service.ts` |
| `communication_cost_log` | `communication-cost-service.ts` |

### Hostel (5 tables)

| Table | Referenced By |
|-------|--------------|
| `hostels` | `hostel-service.ts` |
| `hostel_allocations` | `hostel-service.ts` |
| `hostel_allocation_requests` | `hostel-service.ts` |
| `hostel_room_availability` | `hostel-service.ts` |
| `hostel_occupancy_summary` | `hostel-service.ts` |

### Other (1 table)

| Table | Referenced By |
|-------|--------------|
| `document_types` | `document-service.ts` |
| `exports` | multiple services |

### How to Create Missing Tables

For each missing table:
1. Read the service file that references it
2. Extract all column names from `.select()`, `.insert()`, `.update()`, `.eq()` calls
3. Infer column types from context (uuid for `_id` suffixes, text for names, jsonb for data/config, etc.)
4. Always add standard columns: `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`, `institution_id uuid NOT NULL REFERENCES institutions(id)`, `created_at timestamptz DEFAULT now()`, `updated_at timestamptz DEFAULT now()`
5. Add `created_by uuid REFERENCES profiles(id)` where relevant
6. Enable RLS with institution-scoped policy + super_admin bypass
7. Create via Supabase Management API on staging (NOT MCP execute_sql which targets production)

```bash
# Create table on STAGING
ACCESS_TOKEN=$(cat ~/.supabase/access-token)
curl -s -X POST "https://api.supabase.com/v1/projects/hhprjbgknupaplivtoib/database/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "CREATE TABLE IF NOT EXISTS [table_name] (...); ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY; CREATE POLICY ..."}'
```

---

## Migration Execution Order

### Phase 0: Pre-Migration Setup

- [ ] **0.1** Create all 35 missing database tables (read service code for column specs)
- [ ] **0.2** Add RLS policies with super_admin bypass to all new tables
- [ ] **0.3** Verify build passes (`npm run build`)
- [ ] **0.4** Delete 18 flat duplicate page directories (keep nested paths)
- [ ] **0.5** Update `lib/sidebarMenuLink.ts` — all admission links point to nested paths
- [ ] **0.6** Commit: "chore: pre-migration setup — create missing tables, remove duplicate routes"

### Phase 1: P0 — Core CRM (4 modules)

**Each module = atomic commit: route + hook + page updates together**

- [ ] **1.1** Dashboard — create `/api/admission/dashboard/route.ts`, update hooks
- [ ] **1.2** Leads — create 7 route files, migrate existing `leads/route.ts` to withAuth, update all lead hooks
- [ ] **1.3** Applications — create 3 route files, update hooks
- [ ] **1.4** Counselors — create 4 route files, migrate 5 existing call/alert routes, update all counselor hooks
- [ ] **1.5** Browser test ALL P0 modules (click every button)
- [ ] **1.6** Commit per module

### Phase 2: P1 — Settings & Analytics (8 modules)

- [ ] **2.1** Workflows — create 2 route files, update hooks
- [ ] **2.2** Assignment Rules — create 2 route files, update hooks
- [ ] **2.3** Scoring Rules — create 2 route files, update hooks
- [ ] **2.4** Templates CRUD — create 2 route files, update hooks
- [ ] **2.5** Analytics — create route, move inline aggregation to route/service
- [ ] **2.6** Apply (Public) — create POST route WITHOUT withAuth, add rate limiting
- [ ] **2.7** Campaigns — create monitoring route, migrate existing ROI/segments routes
- [ ] **2.8** Consultants — create CRUD routes, migrate import/template routes
- [ ] **2.9** Browser test ALL P1 modules
- [ ] **2.10** Commit per module

### Phase 3: P2 — Data Quality, Enrollment, Selection, Settings (20 modules)

- [ ] **3.1** Move misplaced hooks: Scholarships from `use-data-quality.ts` → `use-scholarships.ts`
- [ ] **3.2** Move misplaced hooks: Hostels from `use-data-quality.ts` → `use-hostels.ts`
- [ ] **3.3** Create missing hooks: `use-documents.ts`, wire `use-merit-lists.ts`
- [ ] **3.4** Wire unused hooks: Offer Letters, Seat Confirmation, Lateral Entry, Feedback (page → hook → API)
- [ ] **3.5** Create routes for all 18 P2 modules (see migration guide)
- [ ] **3.6** Migrate GD-PI (4 routes) and Loans (4 routes) from getAuthUser to withAuth
- [ ] **3.7** Browser test ALL P2 modules
- [ ] **3.8** Commit per module

### Phase 4: P3 — Migrate Existing Routes to withAuth (54 files)

- [ ] **4.1** WhatsApp Chat (13+ routes) — getAuthUser → withAuth
- [ ] **4.2** Chatbot (6 routes)
- [ ] **4.3** Voice Agents/Broadcast (3 routes)
- [ ] **4.4** Email (3 routes)
- [ ] **4.5** Campaign segments (4 routes)
- [ ] **4.6** WA Numbers (4 routes)
- [ ] **4.7** Remaining: alerts, ROI, costs, insights, remarketing, bridge
- [ ] **4.8** Browser test ALL P3 modules

### Phase 5: Validation

- [ ] **5.1** Run `npm run build` — zero errors
- [ ] **5.2** Grep for remaining direct service calls: `grep -r "Service\." hooks/admission/ | grep -v "apiClient"` — should return 0
- [ ] **5.3** Grep for remaining getAuthUser: `grep -r "getAuthUser" app/api/admission/` — should return 0
- [ ] **5.4** Verify all routes have OPTIONS handler: count matches withAuth count
- [ ] **5.5** Test super_admin access across all modules
- [ ] **5.6** Test regular user access (scoped to institution)
- [ ] **5.7** Test API key access on at least one route per priority

---

## Atomic Migration Template (Per Module)

### Step 1: Create API Route

```typescript
// app/api/admission/[MODULE]/route.ts
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { [Service] } from '@/lib/services/admission/[module]-service'
import { successApiResponse, paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const search = getStringParam(url, 'search')

  const result = await [Service].getAll({
    institution_id: auth.institutionId ?? undefined,
    page, limit, search,
  })

  return paginatedResponse(result.data, result.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  const institutionId = auth.institutionId ?? body.institution_id
  if (!institutionId) return errorResponse('institution_id is required', 400)

  const result = await [Service].create({
    ...body,
    institution_id: institutionId,
    created_by: auth.user.id,
  })
  return createdResponse(result)
})
```

### Step 2: Update Hook (in same commit)

```typescript
// BEFORE:
queryFn: () => [Service].getAll(institutionId),

// AFTER:
import { apiClient } from '@/lib/api/client'
queryFn: () => apiClient.get('/api/admission/[module]', {
  params: { institution_id: institutionId, page, limit }
}),
```

**Important**: `apiClient.get()` accepts `{ params }` for query string. The `handleResponse` function auto-unwraps `{ data }` envelope for single responses and returns full response for paginated (when `metadata` key is present).

### Step 3: Verify (in same commit)

1. `npm run build` passes
2. `curl http://localhost:3000/api/admission/[module]` with auth header returns data
3. Page loads and all buttons work in browser

---

## apiClient Interface (for hooks)

```typescript
// lib/api/client.ts exports:
export const apiClient = {
  get<T>(path: string, options?: { params?: Record<string, any> }): Promise<T>,
  post<T>(path: string, body: any): Promise<T>,
  put<T>(path: string, body: any): Promise<T>,
  patch<T>(path: string, body: any): Promise<T>,
  delete<T>(path: string): Promise<T>,
}

// Response unwrapping:
// - { data: T } → returns T
// - { data: T[], metadata: {...} } → returns full object (for paginated)
// - 204 → returns undefined
// - Error → throws ApiError { message, status, data }
```

---

## Response Shape Contract

| Helper | Returns | Used For |
|--------|---------|----------|
| `successApiResponse(data)` | `{ data }` | Single item responses, mutations |
| `createdResponse(data)` | `{ data }` + 201 | Successful creates |
| `paginatedResponse(data, total, page, limit)` | `{ data, metadata: { page, limit, total, totalPages } }` | List endpoints |
| `errorResponse(message, status)` | `{ error: message }` | All errors |

**The apiClient auto-unwraps**: `{ data }` → `data`, but keeps `{ data, metadata }` intact.

---

## Known Issues to Address During Migration

| Issue | Action | Phase |
|-------|--------|-------|
| `lead_activity_log` has NO `institution_id` | Add column + RLS policy | Phase 0 |
| `lead_stage_history` vs `admission_lead_stage_history` duplicate | Verify which services use which, consolidate | Phase 0 |
| Scholarship hooks in `use-data-quality.ts` | Move to `use-scholarships.ts` | Phase 3 |
| Hostel hooks in `use-data-quality.ts` | Move to `use-hostels.ts` | Phase 3 |
| Merit List: no hook layer | Create `use-merit-lists.ts`, wire page | Phase 3 |
| Documents: no hook layer | Create `use-documents.ts`, wire page | Phase 3 |
| Analytics: ~100 lines inline aggregation | Move to analytics service | Phase 2 |
| Offer Letters/Seat Confirmation/Lateral Entry/Feedback: hooks exist but unused by pages | Wire page → hook → API | Phase 3 |

---

## Out of Scope

- Creating a new Supabase project or database
- Modifying `withAuth` middleware itself
- Modifying `lib/api/response.ts` or `lib/api/client.ts`
- Changing RLS policies on existing tables (only ADD to new tables)
- Building new UI features or pages
- External API documentation (Swagger/OpenAPI) — future task
- Rate limiting or captcha (except for `/apply` route)
- Performance optimization of services
- Test suite creation (no test files exist currently)

---

## Environment Requirements

| Var | Value | Source |
|-----|-------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://hhprjbgknupaplivtoib.supabase.co` | `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (in .env.local) | `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | (in .env.local) | `.env.local` |
| `SUPABASE_JWT_SECRET` | **REQUIRED for API key auth** | `.env.local` |
| Test login | `test-superadmin@jkkn.local` / `SuperAdmin@123` | Staging DB |
| Test institution | `a1111111-1111-1111-1111-111111111111` | Staging DB |

---

## Reference Files (Read These)

| File | Why |
|------|-----|
| `lib/auth/with-auth.ts` | The auth middleware to wrap all routes with |
| `lib/api/response.ts` | Response helpers (successApiResponse, paginatedResponse, etc.) |
| `lib/api/client.ts` | Fetch wrapper for hooks (apiClient.get/post/etc.) |
| `lib/api-keys/query-helpers.ts` | getPaginationParams, getStringParam, getBoolParam |
| `lib/api-keys/cors.ts` | corsHeaders for OPTIONS handlers |
| `app/api/solutions/clients/route.ts` | **THE reference route** — copy this pattern |
| `types/admission.ts` | All TypeScript interfaces (518 lines) |
| `hooks/admission/index.ts` | Barrel exports + major hooks (Dashboard, Leads, Applications) |
| `lib/sidebarMenuLink.ts` | Sidebar menu — update admission links |

---

## Handoff Package Location

All supporting files are in `specs/admission-crm/`:
- `00-HANDOFF-INDEX.md` — Quick start
- `01-ARCHITECTURE.md` — System design
- `02-SUBMODULE-SPECS.md` — All 42 module specs
- `03-DATABASE-SCHEMAS.md` — Live schemas (32 existing tables)
- `04-B2A-MIGRATION-GUIDE.md` — Migration templates + per-module instructions
- `05-MODULE-CONNECTIONS.md` — Dependencies + ERD

---

*Generated from deep requirements interview, 2026-03-27*
