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
/**
 * Unified auth user — NOT the GoTrue User object.
 * For session auth: built from profiles table (same data as hooks use).
 * For API key auth: built from profiles table lookup on api_keys.created_by.
 * Handlers should NEVER rely on GoTrue-specific fields like app_metadata or user_metadata.
 */
interface AuthUser {
  id: string;                    // User UUID (= auth.uid() for RLS)
  email: string;
  role: string;                  // 'super_admin' | 'admin' | 'staff' | etc.
  institution_id: string | null; // From profiles.institution_id (null for some super_admins)
  full_name?: string;
}

interface AuthContext {
  user: AuthUser;                // Authenticated user (from session profile or API key owner profile)
  authMethod: 'session' | 'api_key';
  supabase: SupabaseClient;     // Server-side client with user's RLS context (for direct queries OUTSIDE services)
  apiKeyData?: ApiKeyData;      // Present only for API key auth
  institutionId: string | null;  // Shorthand for user.institution_id (from profiles table)
}

// NOTE on auth.supabase vs BaseService.runWithClient:
// - Service calls (SolutionsService.getSolutions, etc.) get the correct client automatically
//   via AsyncLocalStorage injection — handlers do NOT need auth.supabase for service calls
// - auth.supabase is provided for cases where a handler needs to make a DIRECT Supabase
//   query outside of services (e.g., a one-off join or RPC call not covered by services)
// - In 95% of routes, you will NOT use auth.supabase directly — just call service methods

type AuthenticatedHandler = (
  request: NextRequest,
  auth: AuthContext,
  context?: { params?: Promise<Record<string, string>> }
) => Promise<NextResponse>;

interface AuthOptions {
  requiredPermission?: 'read' | 'write';
  allowApiKey?: boolean;   // default: true — set false for portal routes
  requireRole?: string[];  // optional role check (e.g., ['admin', 'super_admin'])
}

function withAuth(handler: AuthenticatedHandler, options?: AuthOptions)
```

**Relationship to existing `withApiKeyAuth`:**
The existing `lib/api-keys/with-api-key-auth.ts` handles API-key-only auth for `api-management` routes. It uses SERVICE_ROLE_KEY (bypasses RLS) and maps `organization_id` → `institutionId`. The NEW `withAuth` in `lib/auth/with-auth.ts` is a **superset** that handles BOTH session + API key auth, uses JWT impersonation (preserves RLS), and is for Solutions Hub routes. The two coexist:
- `api-management/*` routes → keep using `withApiKeyAuth` (unchanged)
- `api/solutions/*` routes → use new `withAuth`
- Future: existing api-management routes CAN be migrated to `withAuth` for RLS benefit, but this is NOT part of the current spec

**Auth detection order (CRITICAL — cookies first, not Bearer first):**
1. Check cookies (via `next/headers`) → Session flow (browser users always send cookies)
2. If no session cookie, check `Authorization: Bearer <token>` header → API key flow
3. Neither → 401

**Why cookies-first?** Supabase session JWTs and API keys both use `Authorization: Bearer <token>`. If we checked Bearer first, a browser request with a session JWT in the Authorization header would be hashed, looked up in `api_keys`, and fail with 401. By checking cookies first, browser sessions are handled correctly. API consumers (external scripts, cURL) never send cookies, so they fall through to Bearer → API key lookup. This is a clean, reliable disambiguation.

**Latency optimization (IMPORTANT):** "Check cookies" does NOT mean "create a full server client and call `getUser()`" — that would add ~100-200ms of wasted latency for every API key request (GoTrue HTTP round-trip that returns no user). Instead, check for the **presence** of Supabase session cookies first:
```typescript
const cookieStore = await cookies();
const hasSessionCookie = cookieStore.getAll().some(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));
```
If `hasSessionCookie` is true → proceed to Session flow (create server client, call `getUser()`).
If false → skip directly to Bearer header check → API key flow.
This avoids any server-side HTTP call for API key requests.

**Session flow:**
1. `const serverClient = await createServerSupabaseClient()` — **this is async** (internally `await`s `cookies()` from `next/headers`)
2. Verify user via `const { data: { user } } = await serverClient.auth.getUser()` — reject 401 if no user
3. Fetch profile: `await serviceClient.from('profiles').select('*').eq('id', user.id).single()` — to populate `AuthUser` fields (role, institution_id, full_name). Use the `serverClient` for this, not a SERVICE_ROLE_KEY client, since the user is authenticated.
4. Wrap handler: `return await BaseService.runWithClient(serverClient, async () => handler(request, auth, context))` — the `await` is mandatory (see Phase 0.4 warning about error handling)
5. RLS enforced via user's JWT from cookies

**Why `createServerSupabaseClient()` + `auth.getUser()` instead of the existing `getAuthUser()`?**
`getAuthUser()` from `lib/supabase/server.ts` creates a server client AND calls `auth.getUser()` but does NOT return the client reference. `withAuth` needs BOTH the user AND the client (to inject into BaseService via `runWithClient`). So we call `createServerSupabaseClient()` separately to keep the client reference.

**Cookie spoofing edge case:** If an external consumer sends BOTH a fake `sb-*-auth-token` cookie AND a valid Bearer API key, the cookie-first check will trigger Session flow → `getUser()` fails (fake cookie) → returns 401. The valid API key is never checked. This is correct security behavior (cookie presence = session attempt, which failed). If this causes confusion during testing, add a hint to the 401 body: `"Session authentication failed. If using API key auth, clear cookies and retry."`

**API key flow:**
1. SHA256 hash the token, look up in `api_keys` table (using SERVICE_ROLE_KEY client)
2. Verify: is_active, not expired, has required permission
3. Get key owner's `created_by` user ID → use this as `auth.user.id`. For the full `auth.user` object, fetch the profile from the `profiles` table using the SERVICE_ROLE_KEY client: `await serviceClient.from('profiles').select('*').eq('id', created_by).single()`. This gives `id`, `email`, `role`, `institution_id`, etc. Cache this per-request (it's already fetched once).
   - **Error handling:** If the profile lookup returns no row (user deleted, orphaned API key), return 401 with `"API key owner account not found"`. Do NOT fall back to a minimal user object — RLS policies depend on `institution_id` from profiles, and a missing profile means the key owner can't be properly scoped.
4. Create an impersonated Supabase client via JWT generation:
   - Sign a JWT with `{ sub: created_by, role: 'authenticated' }` using `SUPABASE_JWT_SECRET`
   - Create a standard Supabase client with this JWT as the Authorization header
   - PostgREST automatically reads this JWT and sets `request.jwt.claims` per-request
   - All RLS policies (`auth.uid()`, `sh_is_admin()`, etc.) evaluate correctly as the key owner
   - **NOTE:** `set_config()` / `set_auth_context()` SQL approach does NOT work — PostgREST uses separate connections per query, so transaction-local config doesn't persist
5. Update `last_used_at` (fire-and-forget)
6. Pass to handler — RLS enforced as key owner

**Key principle:** The handler never knows or cares which auth method was used. It gets `auth.user` and `auth.supabase` and works identically.

**Terminology mapping:** The `api_keys` table has a column `organization_id`. The `profiles` table has `institution_id`. These refer to the same concept (the institution/org the user belongs to). In `AuthContext`, we use `institutionId` — for session auth, it comes from `profiles.institution_id`; for API key auth, it comes from the profile lookup on `created_by` (prefer `profiles.institution_id` over `api_keys.organization_id` since profiles is the source of truth for user scoping).

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

**SECURITY: Never log the impersonated JWT.** The token is server-side only (never sent to the original client) and travels over TLS to Supabase, so interception risk is minimal. But if it appears in error logs, an attacker with log access could impersonate ANY user for 60 seconds. Ensure error handlers in `withAuth` do NOT include the JWT in `console.error()` messages.

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
   * // eslint-disable-next-line no-return-await — INTENTIONAL, errors escape try/catch without await
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

**ESLint guard:** The `no-return-await` rule flags `return await` as unnecessary. In `withAuth`'s try/catch, it IS necessary — without `await`, rejected promises from the async handler escape the catch block entirely. Add `// eslint-disable-next-line no-return-await` at the `return await runWithClient(...)` line. Alternatively, configure `@typescript-eslint/return-await` with the `in-try-catch` option in `.eslintrc` to allow `return await` only inside try/catch.

**How this works with existing code:**

All 24 SH services use static methods that access `this.supabase` via the getter. The getter returns `clientOverride?.getStore() ?? supabase` (optional chaining because `clientOverride` is `null` on browser). Since `.bind(ClassName)` preserves `this` as the class, and the class resolves `this.supabase` through the prototype chain to `BaseService.supabase`, the override is transparent to all services. No service refactoring needed.

**Flow for session auth (API route):**
```
withAuth → await createServerSupabaseClient() → BaseService.runWithClient(serverClient, () => {
  handler calls SolutionsService.getSolutions() → this.supabase → clientOverride?.getStore() → serverClient
  // RLS enforced via user's JWT from cookies ✓
})
```

**Flow for API key auth (API route):**
```
withAuth → createImpersonatedClient(keyOwnerId) → BaseService.runWithClient(impersonatedClient, () => {
  handler calls SolutionsService.getSolutions() → this.supabase → clientOverride?.getStore() → impersonatedClient
  // RLS enforced via key owner's JWT ✓
})
```

**Flow for browser hooks (no API route):**
```
Hook calls solutionsService.getSolutions() → this.supabase → clientOverride?.getStore() → null → fallback to browser singleton
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

**Implementation approach (DECIDED — `metadata` key, not `pagination`):**

The existing `lib/api-keys/response-helpers.ts` uses `{ data, count, pagination: {...} }` envelope. The new `lib/api/response.ts` uses `{ data, metadata: {...} }` to match `BaseService.BaseListResponse`. These are DIFFERENT contracts:

| Key | Existing api-management routes | New solutions routes |
|-----|-------------------------------|---------------------|
| Pagination key | `pagination` | `metadata` |
| Top-level `count` | Yes | No (inside metadata) |

Create `lib/api/response.ts` with its own implementation (do NOT delegate to basePaginatedResponse):

```typescript
// lib/api/response.ts — response helpers for solutions API routes
import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';

export function paginatedResponse<T>(data: T[], total: number, page: number, limit: number) {
  return NextResponse.json({
    data: data ?? [],
    metadata: { page, limit, total, totalPages: total ? Math.ceil(total / limit) : 0 },
  }, { headers: corsHeaders });
}

export function successApiResponse<T>(data: T, status: number = 200) {
  return NextResponse.json({ data }, { status, headers: corsHeaders });
}

export function createdResponse<T>(data: T) {
  return successApiResponse(data, 201);
}

export function errorResponse(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status, headers: corsHeaders });
}

export function noContentResponse() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
```

This is intentionally separate from `lib/api-keys/response-helpers.ts` — the two coexist with different envelope shapes. Existing api-management routes keep using the old helpers; solutions routes use the new ones.

**Existing file `lib/api-keys/cors.ts` already exists** — it provides `corsHeaders` and `getCorsHeadersWithOrigin()`. No modification needed.

**Pre-existing CORS issue (out of scope but noted):** The current `corsHeaders` sets BOTH `Access-Control-Allow-Credentials: 'true'` AND `Access-Control-Allow-Origin: '*'`. Per the CORS spec, browsers reject this combination — you cannot use `*` with credentials. This doesn't affect API key consumers (non-browser), but WILL affect browser-based cross-origin requests that include cookies. For development this is fine; for production, `getCorsHeadersWithOrigin(origin)` should be used instead of `corsHeaders`. This is NOT part of the B2A migration — it's a pre-existing issue affecting all api-management routes too.

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
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { SolutionsService } from '@/lib/services/solutions/solutions-service';
import { paginatedResponse, errorResponse } from '@/lib/api/response';
import { getPaginationParams, getSortParams, getStringParam } from '@/lib/api-keys/query-helpers';
import { corsHeaders } from '@/lib/api-keys/cors'; // ← EXISTING file, do NOT create a new lib/api/cors.ts

// CORS preflight — required in every route file (no global middleware)
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// ── GET (list) ──────────────────────────────────────────────
export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit } = getPaginationParams(url);
  const search = getStringParam(url, 'search');
  const status = getStringParam(url, 'status');

  // CRITICAL: BaseService.executeListQuery REQUIRES institution_id (throws if missing).
  // Pass auth.institutionId from the withAuth context. For super_admin wanting ALL
  // institutions, individual services must handle that (e.g., skip the institution filter
  // when the caller is super_admin). This is a pre-existing limitation of BaseService,
  // not introduced by B2A.
  const result = await SolutionsService.getSolutions({
    institution_id: auth.institutionId ?? undefined,
    page, limit, search, status,
  });

  return paginatedResponse(result.data, result.metadata.total, page, limit);
}, { requiredPermission: 'read' });

// ── POST (create) ───────────────────────────────────────────
export const POST = withAuth(async (request, auth) => {
  const body = await request.json(); // Throws SyntaxError if invalid JSON (caught by withAuth)

  // NOTE: No Zod validation in this project — services validate at the DB level.
  // If validation is desired, add Zod schemas to lib/services/solutions/types.ts.
  const result = await SolutionsService.createSolution({
    ...body,
    institution_id: auth.institutionId,
    created_by: auth.user.id,
  });

  return createdResponse(result);
}, { requiredPermission: 'write' });
```

**Route template for `[id]/route.ts` (detail, update, delete):**
```typescript
import { withAuth } from '@/lib/auth/with-auth';
import { SolutionsService } from '@/lib/services/solutions/solutions-service';
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response';
import { corsHeaders } from '@/lib/api-keys/cors';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// ── GET (single) ────────────────────────────────────────────
export const GET = withAuth(async (request, auth, context) => {
  // Next.js 16: params is a Promise, must await
  const { id } = await context!.params!;

  const result = await SolutionsService.getSolutionById(id, auth.institutionId ?? undefined);
  if (!result) return errorResponse('Solution not found', 404);

  return successApiResponse(result);
}, { requiredPermission: 'read' });

// ── PATCH (update) ──────────────────────────────────────────
export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!;
  const body = await request.json();

  const result = await SolutionsService.updateSolution(id, body, auth.institutionId ?? undefined);
  return successApiResponse(result);
}, { requiredPermission: 'write' });

// ── DELETE ──────────────────────────────────────────────────
export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!;

  await SolutionsService.deleteSolution(id, auth.institutionId ?? undefined);
  return noContentResponse();
}, { requiredPermission: 'write' });
```

**CRITICAL: `institution_id` in service calls:**
`BaseService.executeListQuery()` (line 91 of `base-service.ts`) **throws** if `institution_id` is missing. This is a hard requirement for ALL list queries. Route handlers MUST pass `auth.institutionId` to service filter objects. For single/update/delete operations, `institutionId` is optional but recommended for defense-in-depth (RLS also filters). **Super_admin cross-institution queries** are a pre-existing Pattern B limitation — services that need it must override `executeListQuery` to skip the institution filter when the caller's role is `super_admin`. This is NOT a B2A concern.

**NOTE:** Use the query helpers from `lib/api-keys/query-helpers.ts` (already exist) to extract pagination, date ranges, sort, and string/UUID params. Do NOT create a new `extractFilters()` function — the existing helpers are well-tested and cover all cases.

**NOTE:** The handler does NOT need to call `BaseService.runWithClient()` — `withAuth` already wraps the entire handler execution in `runWithClient`. Service calls inside the handler transparently use the correct auth-context client.

#### 1.1 Solutions CRUD

| Route | Methods | Service Methods |
|-------|---------|-----------------|
| `/api/solutions/route.ts` | GET, POST | `SolutionsService.getSolutions()`, `.createSolution()` |
| `/api/solutions/[id]/route.ts` | GET, PATCH, DELETE | `.getSolutionById()`, `.updateSolution()`, `.deleteSolution()` |
| `/api/solutions/stats/route.ts` | GET | `.getSolutionStats()` |

**NOTE on service method names in tables below:** Phases 1.2-3.8 use shorthand like `.list()`, `.create()`, `.getById()` for brevity. The actual method names follow the pattern `get{Entity}s()`, `create{Entity}()`, `get{Entity}ById()`, `update{Entity}()`, `delete{Entity}()`. Always check the actual service file for exact method names during implementation.

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

**IMPORTANT: Portal routes are session-only.** Sections 3.1–3.4 are internal user portals. They MUST use `withAuth(handler, { allowApiKey: false })` to reject API key requests. The `allowApiKey` option defaults to `true` in the withAuth spec (line 147), so omitting it would accidentally expose portal endpoints to external API consumers.

#### 3.1 Builder Portal (session-only initially, `allowApiKey: false`)

| Route | Methods | Service |
|-------|---------|---------|
| `/api/solutions/builder-portal/profile/route.ts` | GET | BuilderPortalService |
| `/api/solutions/builder-portal/overview/route.ts` | GET | BuilderPortalService |
| `/api/solutions/builder-portal/assignments/route.ts` | GET | BuilderPortalService |
| `/api/solutions/builder-portal/available-phases/route.ts` | GET | BuilderPortalService |
| `/api/solutions/builder-portal/claim/route.ts` | POST | BuilderPortalService |
| `/api/solutions/builder-portal/earnings/route.ts` | GET | BuilderPortalService |

#### 3.2 Cohort Portal (session-only initially, `allowApiKey: false`)

| Route | Methods | Service |
|-------|---------|---------|
| `/api/solutions/cohort-portal/profile/route.ts` | GET | CohortService (portal methods) |
| `/api/solutions/cohort-portal/sessions/route.ts` | GET | CohortService |
| `/api/solutions/cohort-portal/earnings/route.ts` | GET | CohortService |
| `/api/solutions/cohort-portal/claim/route.ts` | POST | CohortService |

#### 3.3 Client Portal (replaces bypass hook, `allowApiKey: false`)

| Route | Methods | Service |
|-------|---------|---------|
| `/api/solutions/client-portal/profile/route.ts` | GET | NEW: ClientPortalService |
| `/api/solutions/client-portal/dashboard/route.ts` | GET | NEW: ClientPortalService |
| `/api/solutions/client-portal/solutions/route.ts` | GET | NEW: ClientPortalService |
| `/api/solutions/client-portal/deliverables/route.ts` | GET | NEW: ClientPortalService |
| `/api/solutions/client-portal/payments/route.ts` | GET | NEW: ClientPortalService |
| `/api/solutions/client-portal/communications/route.ts` | GET, POST | NEW: ClientPortalService |

**NOTE:** This phase requires creating `ClientPortalService` in `lib/services/solutions/` to replace the direct Supabase queries in `use-client-portal.ts`.

#### 3.4 Production Portal (session-only initially, `allowApiKey: false`)

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

**Pre-existing auth bug:** These routes call `getAuthSession()` for access control (the intent to check auth is correct, but `getAuthSession()` is deprecated — use `getAuthUser()` in the rewrite), then call `DepartmentTrackerService` methods which use `BaseService.supabase` → browser client singleton → no auth context on server → queries run as anonymous.

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
import { solutionsService } from '@/lib/services/solutions/solutions-service';

export function useSolutions(filters) {
  return useQuery({
    queryKey: solutionsHubKeys.solutions.list(filters),
    queryFn: () => solutionsService.getSolutions(filters),
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
**Fix (DECIDED):** Add an `isPipelineClient` boolean field to the clients list response by joining `sh_prospects.converted_client_id` in `ClientsService.getClients()`. This is better than a separate route because: (1) it avoids an extra HTTP round-trip from the page, (2) the join is cheap (indexed FK), (3) the data is always needed when listing clients. Do NOT create a separate `/prospects/converted-ids` route.

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
| Phase 3 | 44 NEW (portals 22, discovery 4, publications 6, products 9, compliance+notifications 3) + 7 EXISTING dept tracker routes to refactor | ~53 new endpoints + ~12 from refactored dept routes |
| Phase 4 | 1 utility file (api client helper — NOT a route) | — |
| Phase 5 | 1 service file (client-portal-service — NOT a route) | — |
| Phase 6 | 0 (docs only) | — |
| **Existing** | **1** (upload route) — to be modified in Phase 0.1 | — |
| **Total NEW route files** | **~104** (Phase 1: 16 + Phase 2: 44 + Phase 3: 44) | **~169 endpoints** |
| **Total NEW non-route files** | **2** (Phase 4 utility + Phase 5 service) | — |
| **Total (incl. 7 refactored dept + 1 modified upload)** | **~112 files touched** | **~181 endpoints** |

**Breakdown note:** The 7 existing dept tracker routes (Phase 3.9) are refactored from `getAuthSession()` to `withAuth()`, not created from scratch. The 1 upload route (Phase 0.1) is modified, not created. Phase 0 creates 3 infrastructure files (withAuth, impersonate, response wrapper) listed in the "New Files" table below.

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
  IMPLEMENTATION ORDER (not document order):
  1st: 0.1 Fix upload route (standalone quick security fix)
  2nd: 0.3 JWT impersonation helper (standalone, requires `bun add jsonwebtoken`)
  3rd: 0.4 BaseService AsyncLocalStorage injection (standalone, highest leverage)
  4th: 0.5 Response helpers (standalone)
  5th: 0.2 withAuth middleware (LAST — depends on 0.3 + 0.4 being complete)

  NOTE: Document sections are numbered 0.1-0.5 for logical grouping, but
  0.2 should be IMPLEMENTED last because it depends on 0.3 and 0.4.

Phase 1 ─── Core routes (depends on Phase 0)
  └── 16 route files (~29 endpoints), can be done in parallel

Phase 2 ─── Sub-module routes (depends on Phase 0)
  └── 44 route files (~87 endpoints), can be done in parallel with Phase 1

Phase 3 ─── Portal routes (depends on Phase 0; Phase 3.3 ALSO depends on 5.1)
  ├── 3.1-3.2, 3.4-3.9: 38 route files — can start immediately after Phase 0
  └── 3.3 Client Portal: 6 route files — BLOCKED on Phase 5.1 (ClientPortalService must exist first)

Phase 5.1 ─── Create ClientPortalService (can start after Phase 0, MUST finish before 3.3 and 4.18)
  └── This is pulled ahead of Phase 5 because it blocks Phase 3.3

Phase 4 ─── Hook migration (depends on Phases 1-3 routes existing)
  ├── 4.1 API client helper (standalone, can start any time)
  └── 4.2 Migrate 24 hook files (each hook depends on its matching route existing)
  └── 4.18 (use-client-portal) also depends on Phase 5.1

Phase 5.2-5.4 ─── Remaining bypass elimination (can start after Phase 0)
  ├── 5.2 clients/page.tsx (do after Phase 1.2 routes exist)
  ├── 5.3 pipeline-board.tsx (standalone, just use existing hook)
  └── 5.4 pipeline-analytics.tsx (standalone, just use existing hook)

Phase 6 ─── Documentation (after Phases 1-5)
```

---

## Verification Criteria (100% B2A Compliance)

- [ ] **Zero bypasses**: No file in `app/(routes)/solutions/` imports `createClientSupabaseClient`
- [ ] **Zero `as any` supabase casts in solutions hooks**: `grep -r 'as any' hooks/solutions/` returns 0 supabase-related casts (hooks use typed API client, not raw Supabase)
- [ ] **All hooks call API routes**: `grep -r 'from.*services/solutions' hooks/solutions/` returns 0 results
- [ ] **Upload route authenticated**: `getAuthUser()` check present (NOT deprecated `getAuthSession()`)
- [ ] **withAuth on all routes**: Every route file in `app/api/solutions/` uses `withAuth()`
- [ ] **Unified response envelope**: All routes return `{ data, metadata? }` shape
- [ ] **API key auth works**: External consumers can authenticate with Bearer token
- [ ] **RLS preserved for API keys**: API key queries are scoped to key owner's permissions
- [ ] **Service role not used in routes**: `SUPABASE_SERVICE_ROLE_KEY` only in withAuth (for API key lookup) and upload (for storage)
- [ ] **JWT impersonation works**: API key auth creates a valid JWT via `SUPABASE_JWT_SECRET`, and `auth.uid()` returns the key owner's ID
- [ ] **JWT expiry is 60s**: Disposable per-request token, NOT 3600s
- [ ] **SUPABASE_JWT_SECRET configured**: Env var added to `.env.local` (from Supabase Dashboard → Project Settings → API → JWT Secret)
- [ ] **Cookies-first auth detection**: `withAuth` checks session cookie presence BEFORE checking Bearer header
- [ ] **Cookie presence check is lightweight**: No `getUser()` HTTP call for API key requests — check `sb-*-auth-token` cookie existence only
- [ ] **Profile lookup error handling**: API key flow returns 401 `"API key owner account not found"` if `profiles` row missing for `created_by`
- [ ] **AsyncLocalStorage conditional require**: `base-service.ts` uses `import type` (compile-time erased) + `typeof window === 'undefined'` guard + `require()` — NOT a top-level value import
- [ ] **Portal routes session-only**: All portal routes (3.1–3.4) use `allowApiKey: false`
- [ ] **Dept tracker routes fixed**: All 7 existing routes migrated from bare `getAuthSession()` to `withAuth()` wrapper
- [ ] **No browser client in API routes**: `createBrowserClient()` only used in browser context, never in API route server code
- [ ] **OPTIONS on all routes**: Every route file exports an `OPTIONS` handler for CORS preflight
- [ ] **Portal documented**: All endpoints listed at /application-hub/api-guidelines
