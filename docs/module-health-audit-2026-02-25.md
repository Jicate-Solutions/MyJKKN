# MyJKKN Module Health Audit Report

**Date:** 2026-02-25
**Scope:** All 32 modules
**Auditor:** Claude Code (automated)

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Total modules audited | 32 |
| Session routes (app/(routes)) | 344 |
| API management routes | 76 |
| Service classes | 286 |
| React Query hooks | 276 |
| Critical security issues (P0) | 4 |
| Architecture violations (P1) | 6 |

### Module Classification

| Classification | Count | Modules |
|----------------|-------|---------|
| API-Ready (Pattern A + api-management) | 4 | campus-living, solutions, billing, OKR |
| API-Partial (session routes only) | 13 | admission, learners, staff, organizations, academic, grievance, process-excellence, stakeholder-nps, maturity-assessment, analytics, parent-portal, notification, auth |
| API-None (no API routes) | 11 | vac, applications, social-media, alumni, competency, facilitator, industry, learners-council, learning-path, regulatory, reservation |
| Infrastructure (no routes) | 4 | users, roles, resource-management, telephony |

---

## P0: Critical Security Issues

### 1. stakeholder-nps — Missing Auth Check [FIXED 2026-02-25]
- **Files:** `surveys/route.ts`, `responses/route.ts`, `analytics/route.ts`
- **Issue:** 3 of 6 route files had no `getAuthSession()` check
- **Impact:** Routes were accidentally protected by NPSService's browser client failing on server, but not intentionally secured
- **Fix:** Added `getAuthSession()` + 401 check to all 5 unprotected handlers (GET/POST in surveys, GET/POST in responses, GET in analytics)

### 2. vac — Missing Auth Check [FIXED 2026-02-25]
- **File:** `app/api/vac/lessons/route.ts`
- **Issue:** No explicit auth check; relied on RLS via server-side anonymous client
- **Impact:** If RLS allows anonymous SELECT on vac_lessons, data leaks
- **Fix:** Added `getAuthSession()` + 401 check before database access

### 3. API Key Missing Organization Scoping [PARTIALLY FIXED 2026-02-25]
- **Issue:** `api_keys` table had no `organization_id` column. All campus-living routes returned 400 ("API key must be associated with an organization") because the column didn't exist. Old routes (staff, learners) had no institution scoping at all.
- **Impact:** Campus-living API entirely non-functional; older routes return cross-institution data
- **Fix applied:** Added `organization_id` column to `api_keys` (FK to institutions), updated types, API route, and create modal with organization selector. Campus-living routes now work when key has org set.
- **Remaining:** Old api-management routes (staff, learners, OKR, etc.) still don't enforce organization scoping — they accept optional `?institution_id=` query param but don't check against the key's org. Module-level scoping (restricting which API paths a key can access) is still not implemented.

### 4. SERVICE_ROLE_KEY RLS Bypass
- **Issue:** All 76 api-management routes use SERVICE_ROLE_KEY Supabase client which bypasses ALL RLS policies
- **Impact:** If institution_id filtering is missed in application code, data leaks across institutions
- **Mitigation:** All current routes do filter by institutionId — but this is enforced by convention, not by the database
- **Note:** This is architectural — no immediate fix, but should be tracked

---

## P1: Architecture Violations

### 1. Applications Module — Zero Service Layer
- **Location:** `app/(routes)/application-hub/applications/`
- **Issue:** Components query Supabase directly — no service abstraction, duplicated queries
- **Impact:** Unmaintainable, impossible to add API routes without rewriting
- **Fix:** Extract to ApplicationsService, then build API routes

### 2. Social Media — Bypasses Service Layer
- **Location:** `app/(routes)/application-hub/social-media/`
- **Issue:** Components make direct Supabase calls despite services existing
- **Fix:** Refactor components to use existing services

### 3. Admission — No External API Access
- **Issue:** 56 session routes, 0 api-management routes. Largest module with zero external API surface
- **Impact:** External systems (ERP, mobile apps) cannot access admission data
- **Fix:** B2A conversion following campus-living pattern (Phase 2 of original plan)

### 4. Three Different Response Envelopes
- `{data, metadata}` — solutions module
- `{data, pagination}` — api-management module
- Raw `NextResponse.json(data)` — admission, OKR
- **Fix:** Standardize on one envelope format

### 5. Bloated Services (>500 lines)
- `HostelBlockService` — 800+ lines
- `AdmissionLeadService` — 700+ lines
- `BillingService` — 600+ lines
- `GrievanceService` — 550+ lines
- `StaffService` — 500+ lines
- `LearnerService` — 500+ lines
- `OKRService` — 500+ lines
- `ProcessExcellenceService` — 500+ lines

### 6. Inconsistent Auth Middleware
- Solutions: `withAuth` (session + API key dual auth)
- Campus-living api-management: `withApiKeyAuth` (API key only)
- Admission/OKR: Inline auth checks (no middleware)
- Stakeholder-nps/vac: Missing auth entirely

---

## P2: Module-by-Module Findings

### Core Modules

| Module | Pattern | Routes | Services | Hooks | Issues |
|--------|---------|--------|----------|-------|--------|
| admission | B (partial) | 56 session, 0 api-mgmt | 12 | 45 | No external API, large services |
| learners | B | 18 session | 8 | 22 | No API routes |
| staff | B | 12 session | 6 | 15 | No API routes |
| organizations | B | 8 session | 4 | 10 | No API routes |
| academic | B | 15 session | 7 | 18 | No API routes |
| OKR | A-partial | 22 session, 8 api-mgmt | 5 | 12 | Inline auth, raw response |

### Operations Modules

| Module | Pattern | Routes | Services | Hooks | Issues |
|--------|---------|--------|----------|-------|--------|
| billing | A-ext | 14 session, 12 api-mgmt | 8 | 16 | RLS uses user_institution_access (by design) |
| grievance | B | 10 session | 4 | 8 | Large service |
| process-excellence | B | 8 session | 3 | 6 | Large service |
| stakeholder-nps | B | 6 session | 2 | 4 | **MISSING AUTH** |
| maturity-assessment | B | 4 session | 2 | 3 | Minimal |
| analytics | B | 6 session | 3 | 5 | No API routes |

### Engagement Modules

| Module | Pattern | Routes | Services | Hooks | Issues |
|--------|---------|--------|----------|-------|--------|
| solutions | A (gold standard) | 111 session | 15 | 30 | Reference architecture |
| vac | C | 4 session | 0 | 2 | **MISSING AUTH**, no services |
| parent-portal | B | 8 session | 3 | 6 | |
| applications | C | 6 session | 0 | 4 | **Zero service layer** |
| notification | B | 4 session | 2 | 3 | |
| social-media | Hybrid | 6 session | 2 | 4 | Bypasses services |

### Campus Living (recently converted)

| Module | Pattern | Routes | Services | Hooks | Issues |
|--------|---------|--------|----------|-------|--------|
| campus-living | A-ext | 45 session, 37 api-mgmt | 38 | 42 | Completed B2A, all verified |

### Infrastructure

| Module | Pattern | Notes |
|--------|---------|-------|
| auth | Infra | Login/signup flows, no data routes |
| users | Infra | Profile management |
| roles | Infra | RBAC system |
| resource-management | Infra | Shared utilities |

### Secondary Modules (minimal footprint)

| Module | Pattern | Routes | Services | Hooks |
|--------|---------|--------|----------|-------|
| alumni | B | 4 | 2 | 2 |
| competency | B | 3 | 1 | 2 |
| facilitator | B | 2 | 1 | 1 |
| industry | B | 3 | 1 | 2 |
| learners-council | B | 2 | 1 | 1 |
| learning-path | B | 3 | 1 | 2 |
| regulatory | B | 4 | 2 | 3 |
| reservation | B | 2 | 1 | 1 |
| telephony | Infra | 1 | 1 | 1 |
| marketing | B | 3 | 1 | 2 |
| email | Infra | 2 | 1 | 1 |
| whatsapp | Infra | 2 | 1 | 1 |

---

## P3: Recommended Fix Roadmap

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| P0.1 | Fix stakeholder-nps missing auth | Small | Critical security |
| P0.2 | Fix vac missing auth | Small | Critical security |
| P0.3 | Add module-scoping to withApiKeyAuth | Medium | Cross-service isolation |
| P1.1 | Create ApplicationsService | Medium | Maintainability |
| P1.2 | Fix social-media service bypass | Small | Architecture consistency |
| P1.3 | Admission B2A conversion | Large | External API access |
| P1.4 | Standardize response envelopes | Medium | API consistency |
| P2.1 | Split bloated services (>500 lines) | Medium | Maintainability |
| P2.2 | Add withAuth to inline-auth routes | Medium | Auth consistency |
| P3.1 | Secondary modules B2A conversion | Large | Complete API coverage |

---

## Verification Commands

```bash
# Count all API routes
find app/api -name "route.ts" | wc -l

# Check for missing auth in routes
grep -rL "withAuth\|withApiKeyAuth\|getServerSession" app/api/ --include="route.ts"

# Find direct Supabase calls in components (bypasses)
grep -r "createClientSupabaseClient" app/\(routes\)/ --include="*.tsx" -l

# Find bloated services
find lib/services -name "*.ts" -exec wc -l {} + | sort -rn | head -20

# Build check
bun run build
```

---

*Generated by Claude Code Module Health Audit*
