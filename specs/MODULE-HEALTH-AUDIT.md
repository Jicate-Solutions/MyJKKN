# MyJKKN Module Health Audit Report

**Date:** 2026-02-25
**Scope:** 21 modules audited across API routes, hooks, and services
**Method:** 6 parallel audit agents performing 7-step framework analysis
**Codebase:** Next.js 16 + Supabase + React Query v5

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Modules Audited | 21 (of ~41 total) |
| Total API Routes | 481 across 41 modules |
| Total Issues Found | 78 |
| Critical Issues | 11 |
| `as any` Casts | ~2,000+ across codebase |
| Avg API Readiness | 72% |
| Test Coverage | <10% avg |

### Critical Findings (Immediate Action Required)

1. **12 unauthed API routes** in Admission module
2. **75 routes with inline auth** in API-Management (should use `withAuth`)
3. **No institution_id scoping** in Organizations and Learners modules
4. **Components calling Supabase directly** in Admission (3 files)
5. **347 `as any` casts** in Academic module alone
6. **Permission checks live in hooks only, not services** — affects regulatory, alumni, competency, learning-path, resource-management, learners-council (if called via API, zero permission enforcement)

---

## Module Audit Cards

### Tier 1: Large Modules

---

```
Module: solutions
Pattern: A-ext
Internal Health: Clean / 0 critical issues
External Readiness: API-Ready (124/124 routes)
Score: 8.5/10
Priority fixes:
1. Add optimistic updates (onMutate) to 25+ mutations
2. Reduce 62 "as any" casts in services
3. Add component-level error boundaries
```

**Key Strengths:** Textbook Pattern A architecture. All 124 routes use `withAuth()`. 253 query invalidation calls. Consistent `{ data, metadata }` response envelope. Role-based RLS (not institution-based). Zero bypasses detected.

---

```
Module: admission
Pattern: Hybrid (A + B, predominantly B)
Internal Health: 8 issues found (2 critical)
External Readiness: API-Partial (29% hooks use API routes)
Score: 5.5/10
Priority fixes:
1. CRITICAL: Add auth to 12 unprotected API routes
2. CRITICAL: Fix direct Supabase calls in 3 components
3. HIGH: Standardize response envelopes (3+ formats)
4. HIGH: Reduce 348 "as any" casts
5. HIGH: Close lead_activity_log security gap (no institution_id)
6. MEDIUM: Create API routes for 43 hooks using direct services
```

**Key Weaknesses:** 12 unauthed routes (voice-agents, email, remarketing, costs, alerts, chat forms). Components bypassing API layer. 43/62 hooks call services directly instead of API routes. Response envelopes inconsistent.

---

```
Module: api-management
Pattern: A-ext (but inline auth, not using withAuth)
Internal Health: 12 issues found (3 critical)
External Readiness: API-Partial (75 routes, 68 GET, 3 POST, 1 PATCH, 0 DELETE)
Score: 4.0/10
Priority fixes:
1. CRITICAL: Replace inline auth with withAuth on all 75 routes
2. CRITICAL: Enforce institution_id scoping on all queries
3. CRITICAL: Stop using SERVICE_ROLE_KEY for data queries
4. HIGH: Standardize response envelope (pagination vs metadata)
5. HIGH: Reduce 62 "as any" casts
6. HIGH: Add missing write endpoints (DELETE, PATCH)
7. MEDIUM: Add audit logging
```

**Key Weaknesses:** Every route reimplements auth (75x duplication). SERVICE_ROLE_KEY used for data queries (bypasses RLS). No institution_id validation. No audit logging. Write endpoints almost nonexistent.

---

### Tier 2: Medium Modules

---

```
Module: billing
Pattern: B (hybrid with A-ext for payments)
Internal Health: 8 issues found
External Readiness: API-Partial (60%)
Score: 6.0/10
Priority fixes:
1. Add super_admin institutional override (currently 0 instances)
2. Reduce 89 "as any" casts
3. Standardize API response envelope
4. Verify payment webhook auth (potential RLS bypass)
5. Extend test coverage (currently 15%)
```

---

```
Module: okr
Pattern: A (pure service pattern)
Internal Health: 5 issues found
External Readiness: API-Ready (85%)
Score: 6.5/10
Priority fixes:
1. CRITICAL: Reduce 179 "as any" casts (metric-engine has 52 alone)
2. Consolidate super_admin bypass (currently fragmented)
3. Move query construction from routes to services (duplication)
4. Add test coverage (currently 10%)
```

---

```
Module: organizations
Pattern: C (direct route + service)
Internal Health: 3 issues found (1 critical)
External Readiness: API-Ready (95%)
Score: 7.0/10 (type safety excellent, security gap)
Priority fixes:
1. CRITICAL: Add institution_id scoping to all service queries
2. Add test coverage (currently 0%)
3. Standardize response envelope (3 different formats)
4. Separate utility routes from CRUD routes
```

**Standout:** Zero `as any` casts — best type safety in the entire audit.

---

```
Module: parent-portal
Pattern: C + A-ext (custom auth hybrid)
Internal Health: 4 issues found
External Readiness: API-Ready (95%)
Score: 7.0/10
Priority fixes:
1. Add error handling to 9/15 routes (missing try-catch)
2. Add test coverage (currently 0%)
3. Document why SERVICE_ROLE_KEY is necessary (custom parent session model)
```

**Note:** Uses ParentSessionService (non-Supabase session), so SERVICE_ROLE_KEY usage is intentional and necessary.

---

```
Module: learners
Pattern: C (API-only, no hooks)
Internal Health: 4 issues found (1 critical)
External Readiness: API-Ready (90%)
Score: 6.0/10
Priority fixes:
1. CRITICAL: Add institution_id validation to all routes
2. Add test coverage (currently 0%)
3. Standardize response envelope
4. Add pagination to list endpoints
```

---

```
Module: grievance
Pattern: B (clean)
Internal Health: 3 issues found
External Readiness: API-Ready (100%)
Score: 8.0/10
Priority fixes:
1. Add super_admin institutional override
2. Add error handling to 2 remaining routes
3. Extend test coverage from 15% to 60%+
```

**Standout:** Only 3 `as any` casts. 100% API coverage. Clean pattern delegation.

---

```
Module: process-excellence
Pattern: B + C (inline queries in routes)
Internal Health: 4 issues found
External Readiness: API-Ready (90%)
Score: 6.5/10
Priority fixes:
1. Refactor 22 inline Supabase queries from routes to services
2. Move aggregation logic to services
3. Add super_admin institutional override
4. Extend test coverage
```

---

```
Module: maturity-assessment
Pattern: B (clean)
Internal Health: 2 issues found
External Readiness: API-Ready (85%)
Score: 7.5/10
Priority fixes:
1. Add error handling to 3 remaining routes
2. Extend test coverage (scoring, approval workflows)
```

**Standout:** Only 1 `as any` cast — second-best type safety in the audit.

---

### Tier 3: Pattern B Modules (Hooks + Services, No API Routes)

---

```
Module: campus-living
Pattern: B (Hooks → Services → Supabase RLS)
Internal Health: Type safety issues
External Readiness: API-Partial (api-management routes exist separately)
Score: 5.5/10
Priority fixes:
1. Add super_admin bypass logic (0 instances, 370 institutionId refs)
2. Add QUERY_CONFIG (0 references — no cache strategy)
3. Reduce 131 "as any" casts (mostly in services)
```

---

```
Module: academic
Pattern: B (Hooks → Services → Supabase RLS)
Internal Health: Major type safety issues
External Readiness: API-Partial (3 api-management routes)
Score: 4.5/10
Priority fixes:
1. CRITICAL: Reduce 347 "as any" casts (attendance-service: 179 alone)
2. Implement TODO: attendance-service JSON timetable refactor
3. Add QUERY_CONFIG consistency
4. Complete leave/approval service TODOs
```

---

```
Module: regulatory
Pattern: B (Hooks → Services → Supabase RLS)
Internal Health: Clean (well-structured)
External Readiness: API-None
Score: 8.0/10
Priority fixes:
1. Complete seed data (only 1 framework + placeholder)
2. Reduce 95 "as any" casts (moderate)
```

**Standout:** Correct super_admin pattern (94 references). Best QUERY_CONFIG adoption (43 refs). Reference implementation for Pattern B modules.

---

```
Module: alumni
Pattern: B
Internal Health: Clean
External Readiness: API-None
Score: 7.5/10
Priority fixes:
1. Only 15 "as any" casts (acceptable)
2. Small scope — no major issues
```

---

```
Module: competency
Pattern: B
Internal Health: Clean
External Readiness: API-None
Score: 7.0/10
Priority fixes:
1. Reduce 59 "as any" casts
```

---

```
Module: learning-path
Pattern: B
Internal Health: Clean
External Readiness: API-None
Score: 7.5/10
Priority fixes:
1. Minimal — only 15 "as any" casts
```

---

```
Module: resource-management
Pattern: B
Internal Health: Clean
External Readiness: API-Partial (1 upload route)
Score: 7.0/10
Priority fixes:
1. Add QUERY_CONFIG (0 references)
```

---

```
Module: learners-council
Pattern: B
Internal Health: Major type safety issues
External Readiness: API-None
Score: 5.0/10
Priority fixes:
1. CRITICAL: Reduce 227 "as any" casts (communication-service: 59 alone)
2. Add QUERY_CONFIG (0 references)
3. Add super_admin checks (0 references)
```

---

### Tier 4: Auth & Infrastructure

---

```
Module: auth
Pattern: B (minimal)
Internal Health: 3 issues found
External Readiness: API-None (1 route: logout)
Score: 5.0/10
Priority fixes:
1. Fix StudentValidationService RLS design (remove SERVICE_ROLE_KEY bypass)
2. Migrate logout route to use withAuth
3. Add password reset, session refresh endpoints
```

---

```
Module: profiles
Pattern: A-ext (poorly integrated)
Internal Health: 5 issues found
External Readiness: API-Partial (1 read route)
Score: 4.5/10
Priority fixes:
1. Consolidate with api-management/learners/profiles (duplicate APIs)
2. Enforce institution_id scoping
3. Switch from ANON_KEY to withAuth
4. Add write endpoints
```

---

## Cross-Module Analysis

### Pattern Distribution

| Pattern | Modules | Count |
|---------|---------|-------|
| **A-ext** (full B2A) | solutions | 1 |
| **A** (service-direct) | okr | 1 |
| **B** (hook→service→DB) | regulatory, alumni, competency, learning-path, resource-mgmt, grievance, maturity-assessment, campus-living, academic, learners-council, billing, auth | 12 |
| **C** (direct Supabase) | organizations, learners, parent-portal | 3 |
| **Hybrid** | admission, api-management, process-excellence, profiles | 4 |

### `as any` Cast Leaderboard (Worst First)

| Module | Count | Worst File |
|--------|-------|------------|
| admission | 348 | Multiple services |
| academic | 347 | attendance-service.ts (179) |
| learners-council | 227 | communication-service.ts (59) |
| okr | 179 | okr-metric-engine.ts (52) |
| campus-living | 131 | dashboard-service |
| regulatory | 95 | Various services |
| billing | 89 | receipts-service (12) |
| solutions | 62 | compliance-service (22) |
| competency | 59 | catalog-service |
| resource-mgmt | 27 | Various |
| learners | 19 | Various services |
| alumni | 15 | Various |
| learning-path | 15 | Various |
| parent-portal | 4 | Minimal |
| grievance | 3 | Minimal |
| maturity-assessment | 1 | Single cast |
| organizations | 0 | **ZERO — reference standard** |
| **TOTAL** | **~1,621** | |

### Super Admin Bypass Coverage

| Status | Modules |
|--------|---------|
| Correct | regulatory (94 refs), solutions (role-based RLS), learners (27), parent-portal (17), okr (11), maturity-assessment (3) |
| Missing | billing (0), grievance (0), process-excellence (0), campus-living (0), learners-council (0), organizations (1) |
| N/A | alumni, competency, learning-path, resource-mgmt (small, rely on DB RLS) |

### API Readiness Spectrum

| Readiness | Modules |
|-----------|---------|
| **API-Ready** (>80%) | solutions, organizations, parent-portal, learners, grievance, process-excellence, maturity-assessment, okr |
| **API-Partial** (30-80%) | admission, api-management, billing, campus-living, academic, profiles, resource-mgmt |
| **API-None** (<30%) | auth, regulatory, alumni, competency, learning-path, learners-council |

### Response Envelope Inconsistency

| Pattern | Used By |
|---------|---------|
| `{ data, metadata }` | solutions (canonical), some api-management routes |
| `{ data, pagination }` | api-management learners/profiles |
| `{ success, data }` | admission routes |
| `{ data }` or raw arrays | grievance, organizations, parent-portal |
| `{ error, message }` | Various error responses (inconsistent) |

### Test Coverage

| Coverage | Modules |
|----------|---------|
| **>10%** | billing (15%), grievance (15%), maturity-assessment (15%), okr (10%), process-excellence (10%) |
| **0%** | organizations, parent-portal, learners, campus-living, academic, regulatory, alumni, competency, learning-path, resource-mgmt, learners-council |

---

## Priority Action Plan

### Phase 1: Security (Week 1) — 11 Critical Issues

| # | Action | Module | Impact |
|---|--------|--------|--------|
| 1 | Add auth to 12 unprotected routes | admission | Prevents unauthorized access to voice/email/costs APIs |
| 2 | Replace inline auth with `withAuth` on 75 routes | api-management | Eliminates 75x auth duplication, centralizes security |
| 3 | Add institution_id scoping to services | organizations | Prevents cross-institution data leak |
| 4 | Add institution_id validation to routes | learners | Prevents cross-institution data leak |
| 5 | Fix direct Supabase calls in 3 components | admission | Ensures RLS enforcement |
| 6 | Stop SERVICE_ROLE_KEY for data queries | api-management | Restores RLS enforcement |
| 7 | Fix lead_activity_log security gap | admission | Add institution_id column + RLS |
| 8 | Enforce institution_id on `/api/profiles` | profiles | Prevents cross-institution profile access |

### Phase 2: Architecture Consistency (Week 2-3)

| # | Action | Modules | Impact |
|---|--------|---------|--------|
| 9 | Standardize response envelope to `{ data, metadata }` | all | Frontend API consistency |
| 10 | Add super_admin bypass | billing, grievance, process-excellence, campus-living, learners-council | Enables cross-institutional admin views |
| 11 | Migrate admission hooks from direct services to API routes | admission | API-first architecture |
| 12 | Add QUERY_CONFIG to all hooks | campus-living, resource-mgmt, learners-council | Consistent cache behavior |

### Phase 3: Type Safety (Week 3-4)

| # | Action | Modules | Casts to Fix |
|---|--------|---------|--------------|
| 13 | Regenerate database types + type admission tables | admission | 348 → <50 |
| 14 | Type attendance-service.ts | academic | 179 → <20 |
| 15 | Type communication-service.ts | learners-council | 227 → <30 |
| 16 | Type okr-metric-engine.ts | okr | 52 → <10 |
| 17 | Type dashboard-service | campus-living | 131 → <20 |

### Phase 4: Testing (Week 5-6)

| # | Action | Modules | Target |
|---|--------|---------|--------|
| 18 | Add integration tests | organizations, parent-portal, learners | 0% → 40% |
| 19 | Extend existing tests | billing, grievance, okr | 10-15% → 50% |
| 20 | Add service unit tests | academic, campus-living, learners-council | 0% → 30% |

---

## Modules Not Yet Audited (~20 Small/Utility)

The following modules were not included in this audit round due to agent loss. They represent smaller modules that likely follow similar patterns:

**Small Feature Modules:** social-media (10 routes), staff (6 routes), lti (9 routes), stakeholder-nps (6 routes), notifications (5 routes), analytics (5 routes), bug-reports (13 routes), users (12 routes)

**Hook-Only Modules:** crm, industry, facilitator, reservation

**Infrastructure/Utility:** ai, ai-query, chatbot, vac, webhooks, admin, activity, applications, audit-logs, debug, departments, examples, institutions, learner-profile, proxy, roles, system, test-env, upload, check-database-tables

**Recommendation:** Schedule a follow-up audit for these modules, prioritizing bug-reports (13 routes), users (12 routes), and social-media (10 routes).

---

## Reference Architecture (Solutions Module)

The **Solutions** module represents the gold standard implementation:

```
Hook (usePayments)
  → apiClient.post('/api/solutions/payments')
    → withAuth(handler, { requiredPermission: 'write' })
      → PaymentsService.createPayment()
        → BaseService.runWithClient() [AsyncLocalStorage injection]
          → Supabase (RLS enforced via role-based policies)
```

**Why it's the reference:**
- 100% route auth coverage (124/124 routes use `withAuth`)
- Zero bypasses (no direct Supabase in hooks or components)
- Consistent response envelope (`{ data, metadata }`)
- Excellent query invalidation (253 calls)
- Role-based RLS (not just institution-based)
- API-key support controlled per-route (`allowApiKey: false` for portals)

All other modules should converge toward this pattern over time.

---

*Generated by 6 parallel audit agents on 2026-02-25*
*Total modules audited: 21 | Total issues: 78 | Critical: 11*
