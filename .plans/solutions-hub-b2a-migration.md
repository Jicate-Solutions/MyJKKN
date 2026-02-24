# Solutions Hub — B2A Migration Specification

**Date:** 2026-02-24
**Module:** Solutions Hub (`app/(routes)/solutions/`)
**Goal:** 100% Pattern A compliance with unified auth
**Current State:** Pattern B (96%) + 4 bypasses + 1 critical security hole
**Target State:** Pattern A — Hook → API Route → withAuth → Service → DB

---

## FST Analysis: Why B2A?

### 1. Fundamentals (First Principles)

**What do we KNOW to be true?**
- [x] 24/25 hooks correctly call services. The service layer is mature (24 classes, 15K lines)
- [x] All 42 `sh_*` tables have RLS enabled with custom helper functions
- [x] `withApiKeyAuth` exists but uses SERVICE_ROLE_KEY → bypasses ALL RLS
- [x] Zero external API routes for core CRUD (only dept tracker has 7 routes)
- [x] Upload route has NO auth — anyone can upload files
- [x] BaseService uses `createClientSupabaseClient()` which calls `createBrowserClient()` from `@supabase/ssr` — this ONLY works in browser context (reads `document.cookie`). In API routes, `document` is undefined, so the client has NO auth context — queries execute as anonymous/anon-key-only
- [x] **PRE-EXISTING BUG (CONFIRMED):** All 7 existing dept tracker API routes call `DepartmentTrackerService` → `BaseService.supabase` → browser client singleton → anon key on server (role: "anon") → ALL dept tracker RLS policies are `TO authenticated USING (true)` with NO `TO anon` policies → **queries WILL return zero rows**. This is not "may fail" — it IS broken. The routes return empty arrays silently (HTTP 200, `data: []`)

**What are we ASSUMING (unverified)?**
- ⚠️ Every service method needs an API route — Confidence: Low
  → REFRAMED: Only externally-useful operations need routes. Portal and admin operations can be session-only initially.
- ⚠️ Hooks must switch from service calls to fetch() — Confidence: Medium
  → For true B2A, yes. Pattern B works in the **browser** (services use browser client with `document.cookie`). However, Pattern B is broken on the server — API routes that call services get the browser client singleton which has NO auth context (see Fundamentals point 6). This is why AsyncLocalStorage injection (Phase 0.4) is critical.
- ⚠️ API key auth must preserve RLS — Confidence: High
  → This is non-negotiable. SERVICE_ROLE_KEY bypass is a security anti-pattern.

**Assumption most worth challenging:**
> "We need to move ALL operations to Pattern A simultaneously."
> Reality: The migration can be phased. Pattern B is functional and secure for browser sessions. The priority is: (1) fix security holes, (2) add the unified auth layer, (3) incrementally add routes for external consumers.

### 2. System Map

**Current data flow:**
```
Browser User → Page → Hook → Service.method() → createClientSupabaseClient() → Supabase
                                                        ↑ (cookie-based, RLS enforced)
                 ↘ BYPASS: 3 pages call Supabase directly (skip hook+service)
                 ↘ BYPASS: use-client-portal calls Supabase directly (skip service)
                 ↘ BYPASS: upload route uses SERVICE_ROLE_KEY (no auth, no RLS)
```

**Target data flow:**
```
Browser User → Page → Hook → fetch(/api/solutions/...) → withAuth(session) → Service → Supabase (RLS)
API Key User → HTTP → /api/solutions/...                → withAuth(apiKey) → Service → Supabase (RLS)
                                                                ↑
                                                    Unified auth: detects method,
                                                    creates appropriate client,
                                                    RLS always enforced
```

**Key Components:**

| Component | Role | Current | Target |
|-----------|------|---------|--------|
| `withAuth` | Unified auth middleware | Does not exist | Detect session vs API key, create right client |
| `BaseService` | Supabase query layer | Module-level singleton client | Accept injected client for API key context |
| API routes | HTTP endpoints | 8 (dept tracker only) | ~181 endpoints across ~109 route files |
| Hooks | React Query wrappers | Call services directly | Call fetch() to API routes |
| Response envelope | Standardized output | Inconsistent | Unified: `{ data, metadata?, error? }` |

### 3. Feedback Loops

**Reinforcing (bad):**
🔄 R1: Bypass exists → New dev copies pattern → More bypasses → Harder to migrate
🔄 R2: No API routes → No external consumers → No pressure to add routes → Routes never added

**Balancing (good):**
⚖️ B1: RLS policies → Even if bypasses exist, data access is still role-gated at DB level
⚖️ B2: Service layer maturity → 24 well-tested services make API routes thin wrappers

**Dominant loop right now:**
> R1 — bypass propagation. Every new feature copies existing patterns. Without intervention, the bypass count will grow.

### 4. Leverage Points

**High Leverage:**
1. 🎯 `withAuth` middleware (Rank 5 — Rules of the system) — One file enables the entire migration. Every API route wraps with `withAuth(handler)`. Auth logic written once, used everywhere.
2. 🎯 BaseService client injection (Rank 10 — Structure of flows) — Adding `runWithClient(client, fn)` to BaseService lets services work with any auth context without rewriting query logic.

**Medium Leverage:**
3. Response envelope standardization — Consistent `{ data, metadata }` shape across all routes
4. Route file generation — Routes are thin wrappers; the real logic is in services

**Low Leverage (avoid):**
- ❌ Rewriting services — They work. Don't touch business logic.
- ❌ Changing RLS model — Custom helper functions are correct for SH's cross-institution nature.
- ❌ Creating separate api-management routes — Unified auth means ONE route tree, not two.

### 5. Blind Spots

- 👁️ **CONFIRMED BUG** — BaseService module-level singleton: `createClientSupabaseClient()` uses `createBrowserClient()` which reads `document.cookie`. In API routes (server), `document` is undefined → client has NO auth context → `auth.uid()` returns NULL → RLS denies access. This is the MOST critical issue to fix — `AsyncLocalStorage` client injection solves both this AND the API key auth problem
- 👁️ **RESOLVED** — API key impersonation: Use JWT generation with `SUPABASE_JWT_SECRET` to create a client that PostgREST treats as the key owner. SERVICE_ROLE_KEY only needed for the initial API key lookup in `api_keys` table (see Phase 0.3)
- 👁️ File upload is a different beast — storage operations don't go through services, they need their own auth pattern

**Strongest counterargument:**
> "Pattern B already works. The services use RLS-enforced clients. Adding an API route layer just adds latency and complexity for browser users with zero functional benefit."

**Rebuttal:** True for browser-only use. But (a) the upload route is a real security hole RIGHT NOW, (b) external API access is a stated goal for the platform, (c) bypasses will multiply without structural enforcement. The cost of migration is real but bounded; the cost of inaction compounds.

---

## Specification

### Phase 0: Foundation (Critical Security + Infrastructure)

#### 0.1 Fix Upload Route Security

**File:** `app/api/upload/solutions-documents/route.ts`

**Current:** No auth, uses SERVICE_ROLE_KEY directly
**Fix:**
```
1. Add getAuthUser() check — reject 401 if no session (NOTE: getAuthSession() is DEPRECATED, use getAuthUser() from lib/supabase/server.ts)
2. Extract user ID from auth user for audit trail
3. Keep SERVICE_ROLE_KEY for storage operations (required for upload)
4. Add user.id to file path: `${folderName}/${entityId}/${user.id}/${fileName}`
```

#### 0.2 Create `withAuth` Unified Auth Middleware

**File:** `lib/auth/with-auth.ts` (new)

**Design:**
```typescript
interface AuthContext {
  user: User;                    // Authenticated user (from session or key owner)
  authMethod: 'session' | 'api_key';
  supabase: SupabaseClient;     // Server-side client with user's RLS context
  apiKeyData?: ApiKeyData;      // Present only for API key auth
  institutionId?: string;       // From profile or API key org
}

type AuthenticatedHandler = (
  request: NextRequest,
  auth: AuthContext,
  context?: { params?: Promise<Record<string, string>> }
) => Promise<NextResponse>;

interface AuthOptions {
  requiredPermission?: 'read' | 'write';
  allowApiKey?: boolean;   // default: true
  requireRole?: string[];  // optional role check
}

function withAuth(handler: AuthenticatedHandler, options?: AuthOptions)
```

**Auth detection order (CRITICAL — cookies first, not Bearer first):**
1. Check cookies (via `next/headers`) → Session flow (browser users always send cookies)
2. If no session cookie, check `Authorization: Bearer <token>` header → API key flow
3. Neither → 401

**Why cookies-first?** Supabase session JWTs and API keys both use `Authorization: Bearer <token>`. If we checked Bearer first, a browser request with a session JWT in the Authorization header would be hashed, looked up in `api_keys`, and fail with 401. By checking cookies first, browser sessions are handled correctly. API consumers (external scripts, cURL) never send cookies, so they fall through to Bearer → API key lookup. This is a clean, reliable disambiguation.

**Session flow:**
1. `const serverClient = await createServerSupabaseClient()` — **this is async** (internally `await`s `cookies()` from `next/headers`)
2. Verify user via `const { data: { user } } = await serverClient.auth.getUser()` — reject 401 if no user
3. Wrap handler: `return await BaseService.runWithClient(serverClient, async () => handler(request, auth, context))` — the `await` is mandatory (see Phase 0.4 warning about error handling)
4. RLS enforced via user's JWT from cookies

**API key flow:**
1. SHA256 hash the token, look up in `api_keys` table (using SERVICE_ROLE_KEY client)
2. Verify: is_active, not expired, has required permission
3. Get key owner's `created_by` user ID
4. Create an impersonated Supabase client via JWT generation:
   - Sign a JWT with `{ sub: created_by, role: 'authenticated' }` using `SUPABASE_JWT_SECRET`
   - Create a standard Supabase client with this JWT as the Authorization header
   - PostgREST automatically reads this JWT and sets `request.jwt.claims` per-request
   - All RLS policies (`auth.uid()`, `sh_is_admin()`, etc.) evaluate correctly as the key owner
   - **NOTE:** `set_config()` / `set_auth_context()` SQL approach does NOT work — PostgREST uses separate connections per query, so transaction-local config doesn't persist
5. Update `last_used_at` (fire-and-forget)
6. Pass to handler — RLS enforced as key owner

**Key principle:** The handler never knows or cares which auth method was used. It gets `auth.user` and `auth.supabase` and works identically.

**CORS:** `withAuth` must include CORS headers on all responses (including 401/403 errors) so that browser-based API key consumers and external tools get proper CORS. Reuse `corsHeaders` from `lib/api-keys/cors.ts`. The error responses inside `withAuth` (invalid key, expired, missing permission) must all include these headers.

**OPTIONS handler (CRITICAL for CORS preflight):** There is NO global CORS middleware in this project — no `middleware.ts` at project root. Every existing `api-management` route exports its own OPTIONS handler. All new route files MUST also export OPTIONS:
```typescript
import { corsHeaders } from '@/lib/api-keys/cors';
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}
```
Without this, browsers will block cross-origin API key requests at the preflight stage.

#### 0.3 Create JWT Impersonation Helper (Application Code)

**File:** `lib/auth/impersonate.ts` (new)

**Why not `set_auth_context()` SQL function?**
> Supabase uses PostgREST as its API layer. Each `.from().select()` or `.rpc()` call is a separate HTTP request to PostgREST, which gets its own database connection from the pool. `set_config('request.jwt.claims', ..., true)` is transaction-local — it sets the config for the current transaction only. The next PostgREST request gets a different connection where those configs don't exist. This means calling `supabase.rpc('set_auth_context')` followed by `supabase.from('sh_solutions').select()` would NOT work — the second call wouldn't see the auth context.

**Correct approach: JWT impersonation**

```typescript
// lib/auth/impersonate.ts
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

/**
 * Create a Supabase client that impersonates a specific user.
 * Used by withAuth when API key auth is detected — the client
 * carries a JWT for the key owner, so PostgREST sets
 * request.jwt.claims automatically on every request.
 *
 * All RLS policies (auth.uid(), sh_is_admin(), auth_institution_id())
 * evaluate correctly as the impersonated user.
 */
export function createImpersonatedClient(userId: string) {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('SUPABASE_JWT_SECRET is required for API key impersonation');
  }

  const token = jwt.sign(
    {
      sub: userId,
      role: 'authenticated',
      iss: 'supabase',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60, // 60 seconds — disposable per-request token, no reason for long expiry
    },
    jwtSecret
  );

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
```

**Dependencies:**
- `bun add jsonwebtoken && bun add -d @types/jsonwebtoken`

**Environment variable (CRITICAL PREREQUISITE):**
- `SUPABASE_JWT_SECRET` — **Currently MISSING from `.env.local`**. Must be added before Phase 0.3 can work.
- Get from: Supabase Dashboard → Project Settings → API → JWT Secret
- This is the same HS256 secret Supabase uses internally to sign all JWTs
- The Supabase anon key JWT structure is: `{ iss: "supabase", ref: "<project_ref>", role: "anon", iat, exp }` — no `aud` claim, so our impersonated JWT doesn't need one either
- The impersonated JWT intentionally omits the `ref` claim (it's Supabase metadata, not checked by PostgREST)

This approach is reliable because PostgREST reads the JWT from the `Authorization` header on EVERY request, so `auth.uid()` and all derived RLS functions work correctly across all queries made by the impersonated client.

#### 0.4 BaseService Client Injection via AsyncLocalStorage

**File:** `lib/services/base-service.ts`

**Current problem (TWO bugs, one fix):**

1. **Browser-client-on-server bug:** BaseService uses `createClientSupabaseClient()` which calls `createBrowserClient()` from `@supabase/ssr`. This client reads `document.cookie` for auth tokens. In API routes (server-side), `document` is undefined → the client has NO auth context → `auth.uid()` returns NULL → RLS policies deny all access. **This means any API route calling a service method currently runs queries as anonymous.**

2. **No API key client injection:** For B2A, API key auth needs to inject an impersonated client (from Phase 0.3) into services. Currently there's no way to override the module-level singleton.

**AsyncLocalStorage solves BOTH problems with ONE change:**

```typescript
// lib/services/base-service.ts — additions to existing file

// CRITICAL: base-service.ts is imported by 23 services, which are imported by
// browser-side hooks. A top-level `import { AsyncLocalStorage } from 'node:async_hooks'`
// would crash the browser bundle. Use conditional require instead.
import type { AsyncLocalStorage as ALS } from 'node:async_hooks'; // type-only — erased at compile time

// Request-scoped Supabase client override.
// - Session auth: withAuth stores a createServerClient (with cookies) here
// - API key auth: withAuth stores a createImpersonatedClient (with JWT) here
// - Browser hooks: No override set → falls back to browser client singleton (correct)
// - On browser: clientOverride is null → getter always returns browser singleton
let clientOverride: ALS<any> | null = null;
if (typeof window === 'undefined') {
  // Server-only: dynamically require node:async_hooks
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AsyncLocalStorage } = require('node:async_hooks');
  clientOverride = new AsyncLocalStorage();
}

export abstract class BaseService {
  protected static get supabase(): any {
    // If running inside withAuth (API route), use the injected client
    // Otherwise fall back to browser client singleton (hooks calling from browser)
    // On browser, clientOverride is null → always returns browser singleton
    return clientOverride?.getStore() ?? supabase;
  }

  /**
   * Run a callback with a specific Supabase client injected into all service calls.
   * Used by withAuth middleware to provide the correct auth-context client.
   *
   * For session auth: passes createServerClient (reads cookies from request)
   * For API key auth: passes createImpersonatedClient (JWT for key owner)
   *
   * CRITICAL: When using in a try/catch with async callbacks, the caller MUST
   * use `return await runWithClient(...)` not `return runWithClient(...)`.
   * Without `await`, errors from the async callback escape the try/catch entirely.
   *
   * @example
   * // In withAuth middleware — note the `await`:
   * return await BaseService.runWithClient(auth.supabase, async () => {
   *   return handler(request, auth, context);
   * });
   */
  static runWithClient<T>(client: any, fn: () => T): T {
    if (!clientOverride) return fn(); // Browser — no AsyncLocalStorage, just run directly
    return clientOverride.run(client, fn);
  }
}
```

**How this works with existing code:**

All 24 SH services use static methods that access `this.supabase` via the getter. The getter returns `clientOverride.getStore() ?? supabase`. Since `.bind(ClassName)` preserves `this` as the class, and the class resolves `this.supabase` through the prototype chain to `BaseService.supabase`, the override is transparent to all services. No service refactoring needed.

**Flow for session auth (API route):**
```
withAuth → createServerClient(cookies) → BaseService.runWithClient(serverClient, () => {
  handler calls SomeService.list() → this.supabase → clientOverride.getStore() → serverClient
  // RLS enforced via user's JWT from cookies ✓
})
```

**Flow for API key auth (API route):**
```
withAuth → createImpersonatedClient(keyOwnerId) → BaseService.runWithClient(impersonatedClient, () => {
  handler calls SomeService.list() → this.supabase → clientOverride.getStore() → impersonatedClient
  // RLS enforced via key owner's JWT ✓
})
```

**Flow for browser hooks (no API route):**
```
Hook calls solutionsService.list() → this.supabase → clientOverride.getStore() → null → fallback to browser singleton
// RLS enforced via browser cookies ✓
```

This is the **highest-leverage change in the entire migration.** One addition to BaseService, and ALL 24 services automatically work with injected clients. No service refactoring needed. It simultaneously fixes the pre-existing browser-client-on-server bug in the dept tracker routes.

**Important:** `AsyncLocalStorage` from `node:async_hooks` is safe here because no API routes use Edge Runtime (verified). All routes run on Node.js.

#### 0.5 Unified Response Envelope

**File:** `lib/api/response.ts` (new)

Standardize ALL API responses:

```typescript
// List response
{ data: T[], metadata: { page, limit, total, totalPages } }

// Single item
{ data: T }

// Mutation success
{ data: T, message?: string }

// Error
{ error: string, code?: string }
```

Reuse existing helpers from `lib/api-keys/response-helpers.ts` but rename `pagination` to `metadata` for consistency with BaseService's `BaseListResponse`.

---

### Phase 1: Core CRUD Routes

The highest-value routes — these cover the primary entities that external consumers need.

#### Route Structure Convention

```
app/api/solutions/[resource]/route.ts           → GET (list), POST (create)
app/api/solutions/[resource]/[id]/route.ts      → GET (detail), PATCH (update), DELETE
app/api/solutions/[resource]/[sub]/route.ts     → Nested resources
app/api/solutions/[resource]/stats/route.ts     → Aggregated stats
```

Every route follows this template:
```typescript
import { withAuth } from '@/lib/auth/with-auth';
import { SolutionsService } from '@/lib/services/solutions/solutions-service';
import { paginatedResponse, errorResponse } from '@/lib/api/response';
import { getPaginationParams, getSortParams, getStringParam } from '@/lib/api-keys/query-helpers';

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit } = getPaginationParams(url);
  const search = getStringParam(url, 'search');
  const status = getStringParam(url, 'status');

  // auth.supabase is already injected via BaseService.runWithClient() inside withAuth
  // All service calls automatically use the correct client (session or impersonated)
  const result = await SolutionsService.getSolutions({ page, limit, search, status });

  return paginatedResponse(result.data, result.metadata.total, page, limit);
}, { requiredPermission: 'read' });
```

**NOTE:** Use the query helpers from `lib/api-keys/query-helpers.ts` (already exist) to extract pagination, date ranges, sort, and string/UUID params. Do NOT create a new `extractFilters()` function — the existing helpers are well-tested and cover all cases.

**NOTE:** The handler does NOT need to call `BaseService.runWithClient()` — `withAuth` already wraps the entire handler execution in `runWithClient`. Service calls inside the handler transparently use the correct auth-context client.

#### 1.1 Solutions CRUD

| Route | Methods | Service Methods |
|-------|---------|-----------------|
| `/api/solutions/route.ts` | GET, POST | `SolutionsService.getSolutions()`, `.createSolution()` |
| `/api/solutions/[id]/route.ts` | GET, PATCH, DELETE | `.getSolutionById()`, `.updateSolution()`, `.deleteSolution()` |
| `/api/solutions/stats/route.ts` | GET | `.getSolutionStats()` |

#### 1.2 Clients CRUD

| Route | Methods | Service Methods |
|-------|---------|-----------------|
| `/api/solutions/clients/route.ts` | GET, POST | `ClientsService.list()`, `.create()` |
| `/api/solutions/clients/[id]/route.ts` | GET, PATCH, DELETE | `.getById()`, `.update()`, `.deactivate()` |

#### 1.3 Prospects & Pipeline

| Route | Methods | Service Methods |
|-------|---------|-----------------|
| `/api/solutions/prospects/route.ts` | GET, POST | `ProspectsService.list()`, `.create()` |
| `/api/solutions/prospects/[id]/route.ts` | GET, PATCH, DELETE | `.getById()`, `.update()`, `.delete()` |
| `/api/solutions/prospects/[id]/activities/route.ts` | GET, POST | `.getActivities()`, `.logActivity()` |
| `/api/solutions/prospects/[id]/stage/route.ts` | PATCH | `.updateStage()` |
| `/api/solutions/prospects/stats/route.ts` | GET | `.getStats()` |
| `/api/solutions/prospects/pipeline/route.ts` | GET | `.getPipelineBoard()` |
| `/api/solutions/prospects/analytics/route.ts` | GET | `.getAnalytics()` |

#### 1.4 Phases

| Route | Methods | Service Methods |
|-------|---------|-----------------|
| `/api/solutions/phases/route.ts` | GET, POST | `PhasesService.list()`, `.create()` |
| `/api/solutions/phases/[id]/route.ts` | GET, PATCH, DELETE | `.getById()`, `.update()`, `.delete()` |
| `/api/solutions/phases/[id]/status/route.ts` | PATCH | `.updateStatus()` |
| `/api/solutions/phases/stats/route.ts` | GET | `.getStats()` |

---

### Phase 2: Sub-Module Routes

#### 2.1 Software Module

| Route | Methods | Service |
|-------|---------|---------|
| `/api/solutions/builders/route.ts` | GET, POST | BuildersService |
| `/api/solutions/builders/[id]/route.ts` | GET, PATCH, DELETE | BuildersService |
| `/api/solutions/builders/[id]/skills/route.ts` | GET, POST | BuildersService |
| `/api/solutions/builders/[id]/skills/[skillId]/route.ts` | PATCH, DELETE | BuildersService |
| `/api/solutions/builders/[id]/assignments/route.ts` | GET | BuildersService |
| `/api/solutions/builders/stats/route.ts` | GET | BuildersService |
| `/api/solutions/iterations/route.ts` | GET, POST | IterationsService |
| `/api/solutions/iterations/[id]/route.ts` | GET, PATCH, DELETE | IterationsService |
| `/api/solutions/bugs/route.ts` | GET, POST | BugsService |
| `/api/solutions/bugs/[id]/route.ts` | GET, PATCH, DELETE | BugsService |
| `/api/solutions/bugs/[id]/status/route.ts` | PATCH | BugsService |
| `/api/solutions/deployments/route.ts` | GET, POST | DeploymentsService |
| `/api/solutions/deployments/[id]/route.ts` | GET, PATCH, DELETE | DeploymentsService |

#### 2.2 Training Module

| Route | Methods | Service |
|-------|---------|---------|
| `/api/solutions/training/programs/route.ts` | GET, POST | TrainingService |
| `/api/solutions/training/programs/[id]/route.ts` | GET, PATCH, DELETE | TrainingService |
| `/api/solutions/training/sessions/route.ts` | GET, POST | TrainingService |
| `/api/solutions/training/sessions/[id]/route.ts` | GET, PATCH, DELETE | TrainingService |
| `/api/solutions/training/sessions/[id]/assign/route.ts` | POST | TrainingService |
| `/api/solutions/training/sessions/[id]/claim/route.ts` | POST | TrainingService |
| `/api/solutions/training/cohort/route.ts` | GET, POST | CohortService |
| `/api/solutions/training/cohort/[id]/route.ts` | GET, PATCH, DELETE | CohortService |

#### 2.3 Content Module

| Route | Methods | Service |
|-------|---------|---------|
| `/api/solutions/content/orders/route.ts` | GET, POST | ContentService |
| `/api/solutions/content/orders/[id]/route.ts` | GET, PATCH, DELETE | ContentService |
| `/api/solutions/content/deliverables/route.ts` | GET, POST | ContentService |
| `/api/solutions/content/deliverables/[id]/route.ts` | GET, PATCH, DELETE | ContentService |
| `/api/solutions/content/deliverables/[id]/submit/route.ts` | POST | ContentService |
| `/api/solutions/content/deliverables/[id]/approve/route.ts` | POST | ContentService |
| `/api/solutions/content/deliverables/[id]/reject/route.ts` | POST | ContentService |

#### 2.4 Financial Module

| Route | Methods | Service |
|-------|---------|---------|
| `/api/solutions/payments/route.ts` | GET, POST | PaymentsService |
| `/api/solutions/payments/[id]/route.ts` | GET, PATCH, DELETE | PaymentsService |
| `/api/solutions/payments/[id]/splits/route.ts` | POST | PaymentsService |
| `/api/solutions/payments/stats/route.ts` | GET | PaymentsService |
| `/api/solutions/earnings/route.ts` | GET | EarningsService |
| `/api/solutions/earnings/summary/route.ts` | GET | EarningsService |
| `/api/solutions/earnings/report/route.ts` | GET | EarningsService |
| `/api/solutions/revenue-splits/models/route.ts` | GET, POST | RevenueSplitService |
| `/api/solutions/revenue-splits/models/[id]/route.ts` | GET, PATCH, DELETE | RevenueSplitService |
| `/api/solutions/revenue-splits/calculate/route.ts` | POST | RevenueSplitService |
| `/api/solutions/unified-earnings/route.ts` | GET | UnifiedEarningsService |
| `/api/solutions/unified-earnings/summary/route.ts` | GET | UnifiedEarningsService |
| `/api/solutions/unified-earnings/payouts/route.ts` | GET | UnifiedEarningsService |

#### 2.5 MOUs

| Route | Methods | Service |
|-------|---------|---------|
| `/api/solutions/mous/route.ts` | GET, POST | MouService |
| `/api/solutions/mous/[id]/route.ts` | GET, PATCH, DELETE | MouService |
| `/api/solutions/mous/[id]/status/route.ts` | PATCH | MouService |

---

### Phase 3: Portal & Analytics Routes

#### 3.1 Builder Portal (session-only initially)

| Route | Methods | Service |
|-------|---------|---------|
| `/api/solutions/builder-portal/profile/route.ts` | GET | BuilderPortalService |
| `/api/solutions/builder-portal/overview/route.ts` | GET | BuilderPortalService |
| `/api/solutions/builder-portal/assignments/route.ts` | GET | BuilderPortalService |
| `/api/solutions/builder-portal/available-phases/route.ts` | GET | BuilderPortalService |
| `/api/solutions/builder-portal/claim/route.ts` | POST | BuilderPortalService |
| `/api/solutions/builder-portal/earnings/route.ts` | GET | BuilderPortalService |

#### 3.2 Cohort Portal (session-only initially)

| Route | Methods | Service |
|-------|---------|---------|
| `/api/solutions/cohort-portal/profile/route.ts` | GET | CohortService (portal methods) |
| `/api/solutions/cohort-portal/sessions/route.ts` | GET | CohortService |
| `/api/solutions/cohort-portal/earnings/route.ts` | GET | CohortService |
| `/api/solutions/cohort-portal/claim/route.ts` | POST | CohortService |

#### 3.3 Client Portal (replaces bypass hook)

| Route | Methods | Service |
|-------|---------|---------|
| `/api/solutions/client-portal/profile/route.ts` | GET | NEW: ClientPortalService |
| `/api/solutions/client-portal/dashboard/route.ts` | GET | NEW: ClientPortalService |
| `/api/solutions/client-portal/solutions/route.ts` | GET | NEW: ClientPortalService |
| `/api/solutions/client-portal/deliverables/route.ts` | GET | NEW: ClientPortalService |
| `/api/solutions/client-portal/payments/route.ts` | GET | NEW: ClientPortalService |
| `/api/solutions/client-portal/communications/route.ts` | GET, POST | NEW: ClientPortalService |

**NOTE:** This phase requires creating `ClientPortalService` in `lib/services/solutions/` to replace the direct Supabase queries in `use-client-portal.ts`.

#### 3.4 Production Portal (session-only initially)

| Route | Methods | Service |
|-------|---------|---------|
| `/api/solutions/production-portal/profile/route.ts` | GET | ProductionService |
| `/api/solutions/production-portal/available-work/route.ts` | GET | ProductionService |
| `/api/solutions/production-portal/my-work/route.ts` | GET | ProductionService |
| `/api/solutions/production-portal/claim/route.ts` | POST | ProductionService |
| `/api/solutions/production-portal/submit/route.ts` | POST | ProductionService |
| `/api/solutions/production-portal/earnings/route.ts` | GET | ProductionService |

#### 3.5 Discovery & Communications

| Route | Methods | Service |
|-------|---------|---------|
| `/api/solutions/discovery/visits/route.ts` | GET, POST | DiscoveryService |
| `/api/solutions/discovery/visits/[id]/route.ts` | GET, PATCH, DELETE | DiscoveryService |
| `/api/solutions/discovery/communications/route.ts` | GET, POST | DiscoveryService |
| `/api/solutions/discovery/communications/[id]/route.ts` | GET, PATCH, DELETE | DiscoveryService |

#### 3.6 Publications & Accreditation

| Route | Methods | Service |
|-------|---------|---------|
| `/api/solutions/publications/route.ts` | GET, POST | PublicationsService |
| `/api/solutions/publications/[id]/route.ts` | GET, PATCH, DELETE | PublicationsService |
| `/api/solutions/publications/[id]/contributors/route.ts` | GET, POST, DELETE | PublicationsService |
| `/api/solutions/publications/accreditation/route.ts` | GET | PublicationsService |
| `/api/solutions/publications/accreditation/nirf/route.ts` | GET | PublicationsService |
| `/api/solutions/publications/accreditation/naac/route.ts` | GET | PublicationsService |

#### 3.7 Products, TRL & RDIF

| Route | Methods | Service |
|-------|---------|---------|
| `/api/solutions/products/route.ts` | GET, POST | ProductsService |
| `/api/solutions/products/[id]/route.ts` | GET, PATCH, DELETE | ProductsService |
| `/api/solutions/products/[id]/trl/route.ts` | PATCH | ProductsService |
| `/api/solutions/products/[id]/validations/route.ts` | GET, POST | ProductsService |
| `/api/solutions/products/[id]/validations/[vid]/route.ts` | PATCH, DELETE | ProductsService |
| `/api/solutions/products/rdif/prerequisites/route.ts` | GET, PATCH | RDIFService |
| `/api/solutions/products/rdif/readiness/route.ts` | GET | RDIFService |
| `/api/solutions/products/rdif/milestones/route.ts` | GET | RDIFService |
| `/api/solutions/products/stats/route.ts` | GET | ProductsService |

#### 3.8 Compliance & Notifications

| Route | Methods | Service |
|-------|---------|---------|
| `/api/solutions/compliance/dashboard/route.ts` | GET | ComplianceService |
| `/api/solutions/notifications/route.ts` | GET | NotificationsService |
| `/api/solutions/notifications/[id]/read/route.ts` | PATCH | NotificationsService |

#### 3.9 Departments (7 existing routes — NEED FIX)

**Pre-existing auth bug:** These routes call `getAuthSession()` for access control (correct), but then call `DepartmentTrackerService` methods which use `BaseService.supabase` → browser client singleton → no auth context on server → queries run as anonymous.

**Fix:** After Phase 0.4 (AsyncLocalStorage injection), update these routes to use `withAuth` wrapper. The `withAuth` middleware injects the correct server client via `BaseService.runWithClient()`, which automatically fixes all `DepartmentTrackerService` calls. This is a thin refactor — replace manual `getAuthSession()` with `withAuth(handler)`.

| Route | Current | After Fix |
|-------|---------|-----------|
| All 7 dept routes | `getAuthSession()` + bare service call | `withAuth(handler)` → service calls use injected client |

---

### Phase 4: Hook Migration

Convert ALL hooks from calling services directly to calling `/api/solutions/` routes via `fetch()`.

#### Hook Migration Template

**Before (Pattern B):**
```typescript
// hooks/solutions/use-solutions.ts
import { solutionsService } from '@/lib/services/solutions';

export function useSolutions(filters) {
  return useQuery({
    queryKey: solutionsHubKeys.solutions.list(filters),
    queryFn: () => solutionsService.list(filters),
  });
}
```

**After (Pattern A):**
```typescript
// hooks/solutions/use-solutions.ts
import { apiClient } from '@/lib/api/client';

export function useSolutions(filters) {
  return useQuery({
    queryKey: solutionsHubKeys.solutions.list(filters),
    queryFn: () => apiClient.get('/api/solutions', { params: filters }),
  });
}
```

#### 4.1 Create API Client Helper

**File:** `lib/api/client.ts` (new)

```typescript
// Thin wrapper around fetch() for internal API calls
// Handles: JSON parsing, error extraction, query param serialization, auth headers

export const apiClient = {
  async get<T>(url: string, options?: { params?: Record<string, any> }): Promise<T> { ... },
  async post<T>(url: string, body: any): Promise<T> { ... },
  async patch<T>(url: string, body: any): Promise<T> { ... },
  async delete(url: string): Promise<void> { ... },
};
```

#### 4.2 Hook Migration Order (by dependency)

| Priority | Hook File | Service | Dependent Hooks |
|----------|-----------|---------|-----------------|
| 1 | use-solutions.ts | SolutionsService | Many (core entity) |
| 2 | use-clients.ts | ClientsService | use-client-portal |
| 3 | use-prospects.ts | ProspectsService | use-overdue-prospects |
| 4 | use-phases.ts | PhasesService | Builder assignments |
| 5 | use-builders.ts | BuildersService | use-builder-portal |
| 6 | use-training.ts | TrainingService | use-cohort-portal |
| 7 | use-content.ts | ContentService | use-production-portal |
| 8 | use-mous.ts | MouService | None |
| 9 | use-payments.ts | PaymentsService | use-earnings |
| 10 | use-earnings.ts | EarningsService | use-unified-earnings |
| 11 | use-revenue-splits.ts | RevenueSplitService | None |
| 12 | use-discovery.ts | DiscoveryService | None |
| 13 | use-publications.ts | PublicationsService | None |
| 14 | use-products.ts | ProductsService, RDIFService | None |
| 15 | use-builder-portal.ts | BuilderPortalService | None |
| 16 | use-cohort-portal.ts | CohortService | None |
| 17 | use-production-portal.ts | ProductionService | None |
| 18 | use-client-portal.ts | NEW ClientPortalService | None |
| 19 | use-compliance-dashboard.ts | ComplianceService | None |
| 20 | use-unified-earnings.ts | UnifiedEarningsService | None |
| 21 | use-deployments.ts | DeploymentsService | None |
| 22 | use-iterations.ts | IterationsService | None |
| 23 | use-bugs.ts | BugsService | None |
| 24 | use-overdue-prospects.ts | ProspectsService | None |

---

### Phase 5: Bypass Elimination

#### 5.1 Fix `use-client-portal.ts` (647 lines, 25 `as any` casts)

**Action:** Create `lib/services/solutions/client-portal-service.ts`
- Extract all Supabase queries from the hook into a proper service class
- Service extends BaseService
- Hook becomes a thin wrapper calling API routes (Phase 3.3 + Phase 4)
- All 25 `as any` casts eliminated via proper typing

#### 5.2 Fix `clients/page.tsx` (1 inline query)

**Current:** Inline `useQuery` fetching `sh_prospects.converted_client_id` to determine pipeline vs direct clients
**Fix:** Add a `GET /api/solutions/prospects/converted-ids` route OR add a `isPipelineClient` field to the clients list response by joining in the service layer

#### 5.3 Fix `pipeline/_components/pipeline-board.tsx` (2 inline queries)

**Current:** Direct Supabase calls for drag-drop stage updates on `sh_prospects`
**Fix:** Use `useUpdatePipelineStage` mutation from `use-prospects` hook (already exists). Remove inline Supabase client.

#### 5.4 Fix `pipeline/analytics/_components/pipeline-analytics.tsx` (3 inline queries)

**Current:** Direct Supabase queries to `sh_prospects`, `sh_clients`, `sh_solutions` for analytics calculations
**Fix:** Use `usePipelineAnalytics` hook from `use-prospects` (already exists in hook index). The hook calls `ProspectsService.getAnalytics()` which already computes these aggregations.

---

### Phase 6: API Documentation & External Access

#### 6.1 Developer Portal Documentation

**Location:** `/application-hub/api-guidelines` (existing portal page)

For Solutions Hub, document:
- All endpoints with HTTP methods
- Request/response shapes with TypeScript types
- Query parameter reference (pagination, filters, sorting)
- Authentication methods (session + API key)
- Code examples (JavaScript, Python, curl)
- AI prompt templates for common operations

#### 6.2 API Key Permission Scoping

Extend `api_keys.permissions` to include service-level scoping:

```typescript
permissions: {
  services: ['solutions-hub'],  // Which modules this key can access
  read: true,
  write: false,
}
```

`withAuth` checks that the API key is authorized for the `solutions-hub` service before allowing access.

#### 6.3 Rate Limiting

Add rate limiting to `withAuth`:
- Session auth: No rate limit (browser users)
- API key auth: Respect `api_keys.permissions.rate_limit` (default 100 req/min)

---

## Route Count Summary

Counted from the phase-by-phase tables above:

| Phase | New Route Files | Endpoints (approx) |
|-------|----------------:|--------------------:|
| Phase 0 | 3 new files (withAuth, impersonate, response) + 1 modified (upload fix) | — |
| Phase 1 | 16 (solutions 3, clients 2, prospects 7, phases 4) | ~29 |
| Phase 2 | 44 (software 13, training 8, content 7, financial 13, mous 3) | ~87 |
| Phase 3 | 44 (portals 22, discovery 4, publications 6, products 9, compliance 3) | ~53 |
| Phase 4 | 1 (api client helper) | — |
| Phase 5 | 1 (client-portal-service) | — |
| Phase 6 | 0 (docs only) | — |
| **Existing** | **8** (dept tracker 7 + upload 1) — to be refactored | **~12** |
| **Total** | **~109 route files** | **~181 endpoints** |

**Note:** This is a large surface area. Consider implementing in priority order and gating external API access behind feature flags initially.

---

## New Files to Create

| File | Purpose |
|------|---------|
| `lib/auth/with-auth.ts` | Unified auth middleware (session + API key detection, runWithClient wrapping) |
| `lib/auth/impersonate.ts` | JWT impersonation helper for API key auth |
| `lib/api/response.ts` | Standardized response helpers |
| `lib/api/client.ts` | Internal API client for hooks |
| `lib/services/solutions/client-portal-service.ts` | Service for client portal (replace bypass) |
| ~104 route files under `app/api/solutions/` | API endpoints (Phases 1-3) |

## Files to Modify

| File | Change |
|------|--------|
| `lib/services/base-service.ts` | Add `AsyncLocalStorage` client injection |
| `app/api/upload/solutions-documents/route.ts` | Add auth check |
| `hooks/solutions/*.ts` (24 files) | Migrate from service calls to fetch() |
| `app/(routes)/solutions/clients/page.tsx` | Remove inline Supabase query |
| `app/(routes)/solutions/pipeline/_components/pipeline-board.tsx` | Remove inline Supabase queries |
| `app/(routes)/solutions/pipeline/analytics/_components/pipeline-analytics.tsx` | Remove inline Supabase queries |
| `hooks/solutions/use-client-portal.ts` | Rewrite to use ClientPortalService via API |
| `app/api/solutions/departments/*/route.ts` (7 files) | Migrate from bare `getAuthSession()` to `withAuth()` wrapper (fixes browser-client-on-server bug) |

---

## Execution Order & Dependencies

```
Phase 0 ─── Foundation (MUST complete first)
  ├── 0.1 Fix upload route (standalone, do first)
  ├── 0.2 withAuth middleware (depends on 0.3 + 0.4)
  ├── 0.3 JWT impersonation helper (standalone, requires `bun add jsonwebtoken`)
  ├── 0.4 BaseService AsyncLocalStorage injection (standalone, highest leverage)
  └── 0.5 Response helpers (standalone)

Phase 1 ─── Core routes (depends on Phase 0)
  └── 16 route files (~29 endpoints), can be done in parallel

Phase 2 ─── Sub-module routes (depends on Phase 0)
  └── 44 route files (~87 endpoints), can be done in parallel with Phase 1

Phase 3 ─── Portal routes (depends on Phase 0 + Phase 5.1)
  └── 44 route files (~53 endpoints), Phase 3.3 depends on 5.1 (ClientPortalService)

Phase 4 ─── Hook migration (depends on Phases 1-3)
  ├── 4.1 API client helper (standalone)
  └── 4.2 Migrate 24 hook files (depends on matching routes existing)

Phase 5 ─── Bypass elimination (can start after Phase 0)
  ├── 5.1 ClientPortalService (do BEFORE Phase 3.3 and 4.18)
  ├── 5.2 clients/page.tsx (do after Phase 1.2 routes exist)
  ├── 5.3 pipeline-board.tsx (standalone, just use existing hook)
  └── 5.4 pipeline-analytics.tsx (standalone, just use existing hook)

Phase 6 ─── Documentation (after Phases 1-5)
```

---

## Verification Criteria (100% B2A Compliance)

- [ ] **Zero bypasses**: No file in `app/(routes)/solutions/` imports `createClientSupabaseClient`
- [ ] **Zero `as any` supabase casts**: All hooks use typed API client
- [ ] **All hooks call API routes**: `grep -r 'from.*services/solutions' hooks/solutions/` returns 0 results
- [ ] **Upload route authenticated**: `getAuthSession()` check present
- [ ] **withAuth on all routes**: Every route file in `app/api/solutions/` uses `withAuth()`
- [ ] **Unified response envelope**: All routes return `{ data, metadata? }` shape
- [ ] **API key auth works**: External consumers can authenticate with Bearer token
- [ ] **RLS preserved for API keys**: API key queries are scoped to key owner's permissions
- [ ] **Service role not used in routes**: `SUPABASE_SERVICE_ROLE_KEY` only in withAuth (for API key lookup) and upload (for storage)
- [ ] **JWT impersonation works**: API key auth creates a valid JWT via `SUPABASE_JWT_SECRET`, and `auth.uid()` returns the key owner's ID
- [ ] **Dept tracker routes fixed**: All 7 existing routes migrated from bare `getAuthSession()` to `withAuth()` wrapper
- [ ] **No browser client in API routes**: `createBrowserClient()` only used in browser context, never in API route server code
- [ ] **Portal documented**: All endpoints listed at /application-hub/api-guidelines
