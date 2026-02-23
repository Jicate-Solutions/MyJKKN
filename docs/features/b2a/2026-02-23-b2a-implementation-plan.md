# B2A (Business-to-Agent) Transformation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Transform MyJKKN from a UI-only platform into a dual-interface B2A platform where both humans (UI) and AI agents (REST API + MCP) can access institutional intelligence.

**Architecture:** New `/api/b2a/` route prefix with centralized auth middleware (`authenticate.ts`), rate limiting, and audit logging. Service role Supabase client used throughout (bypasses RLS — institution scoping enforced manually via `WHERE institution_id = ?`).

**Tech Stack:** Next.js 16, TypeScript, Supabase (service role client), Bun, Vitest

**Reference:** See `docs/features/b2a/B2A-PRD.md` for full requirements and security model.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Complete |
| `[!]` | Blocked |

---

## Phase 1: API Gateway Foundation

> **Goal:** Centralized auth, rate limiting, audit logging, database migration.
> **Estimated effort:** 3-5 days
> **Depends on:** Nothing — start here.
> **Unblocks:** All other phases.

---

### Task 1.1 — Database Migration (B2A Foundation)

**Status:** `[x]`

**Files:**
- Create: `supabase/migrations/20260224000001_b2a_api_gateway_foundation.sql`

**What this does:** Adds `institution_id` column to `api_keys` table, creates `api_key_usage_logs` audit table with RLS.

**Step 1: Create the migration file**

```sql
-- supabase/migrations/20260224000001_b2a_api_gateway_foundation.sql

-- 1. Add institution binding to api_keys
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_institution_id
  ON api_keys(institution_id);

-- 2. API Key Usage Logs (audit trail)
CREATE TABLE IF NOT EXISTS public.api_key_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  module TEXT NOT NULL,
  institution_id UUID REFERENCES institutions(id),
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_key_usage_key_id ON api_key_usage_logs(api_key_id);
CREATE INDEX idx_api_key_usage_created ON api_key_usage_logs(created_at DESC);
CREATE INDEX idx_api_key_usage_module ON api_key_usage_logs(module);

-- 3. RLS on usage logs
ALTER TABLE api_key_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages usage logs"
  ON api_key_usage_logs FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Admins view usage logs"
  ON api_key_usage_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

-- 4. Document the permissions format
COMMENT ON COLUMN api_keys.permissions IS
  'JSONB. New: {"read":["admission","attendance"],"write":[]}. Legacy: {"read":true} = all modules.';

COMMENT ON COLUMN api_keys.institution_id IS
  'If set, key is scoped to this institution only. NULL = all institutions (requires institutionId param).';
```

**Step 2: Apply the migration**

```bash
# From project root:
~/bin/supabase db push
# OR if using local dev:
~/bin/supabase migration up
```

**Step 3: Verify in Supabase dashboard**

- [ ] `api_keys` table has `institution_id` column
- [ ] `api_key_usage_logs` table exists with all columns
- [ ] Both RLS policies created

**Step 4: Commit**

```bash
git add supabase/migrations/20260224000001_b2a_api_gateway_foundation.sql
git commit -m "feat(b2a): add institution_id to api_keys and create api_key_usage_logs table"
```

---

### Task 1.2 — `authenticate.ts` — Shared API Key Auth Helper

**Status:** `[ ]`

**Files:**
- Create: `lib/api-keys/authenticate.ts`
- Reference: `lib/supabase/server.ts` (for `createServiceRoleClient()`)
- Reference: `lib/api-keys/api-key-service.ts` (for existing key format)
- Reference: `app/api/api-management/organizations/institutions/route.ts` (pattern being replaced)

**What this does:** Single function that replaces the 30-line auth boilerplate duplicated in 31 routes. Returns `ApiKeyContext` with service role Supabase client ready to use.

**Step 1: Write the test file first**

Create `__tests__/lib/api-keys/authenticate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authenticateApiKey } from '@/lib/api-keys/authenticate';
import { NextRequest } from 'next/server';

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  })),
}));

function makeRequest(token?: string) {
  return new NextRequest('http://localhost/api/b2a/test', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe('authenticateApiKey', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const result = await authenticateApiKey(makeRequest());
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(401);
    }
  });

  it('returns 401 when Authorization header does not start with Bearer', async () => {
    const req = new NextRequest('http://localhost/api/b2a/test', {
      headers: { Authorization: 'Basic abc123' },
    });
    const result = await authenticateApiKey(req);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(401);
    }
  });
});
```

**Step 2: Run test to verify it fails (file doesn't exist yet)**

```bash
bun test __tests__/lib/api-keys/authenticate.test.ts
# Expected: FAIL — "Cannot find module '@/lib/api-keys/authenticate'"
```

**Step 3: Create `lib/api-keys/authenticate.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Module Registry ────────────────────────────────────────────────────────

export const VALID_MODULES = [
  'admission', 'attendance', 'billing', 'grievance', 'okr',
  'learners', 'staff', 'organizations', 'campus-living', 'solutions',
  'learners-council', 'competency', 'learning-paths', 'alumni',
  'facilitator', 'industry', 'parent-portal', 'social-media',
  'vac', 'maturity-assessment', 'process-excellence', 'notifications',
  'resource-management', 'bug-reports', 'stakeholder-nps', 'audit-trail',
] as const;

export type ApiModule = typeof VALID_MODULES[number];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ApiKeyContext {
  keyId: string;
  keyName: string;
  institutionId: string | null;   // null = super key (all institutions)
  permissions: {
    read: ApiModule[] | true;     // true = legacy all-access
    write: ApiModule[] | true;
  };
  supabase: SupabaseClient;       // Service role client — bypasses RLS
}

type AuthSuccess = { context: ApiKeyContext };
type AuthError   = { error: NextResponse };
type AuthResult  = AuthSuccess | AuthError;

// ─── Error helpers ──────────────────────────────────────────────────────────

function unauthorized(message: string): AuthError {
  return {
    error: NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message } },
      { status: 401, headers: corsHeaders }
    ),
  };
}

function forbidden(message: string): AuthError {
  return {
    error: NextResponse.json(
      { error: { code: 'FORBIDDEN', message } },
      { status: 403, headers: corsHeaders }
    ),
  };
}

// ─── Permission helpers ─────────────────────────────────────────────────────

function hasModuleAccess(
  permissions: ApiKeyContext['permissions']['read'],
  module: ApiModule
): boolean {
  if (permissions === true) return true;          // legacy all-access
  return permissions.includes(module);
}

function normalizePermissions(raw: unknown): ApiKeyContext['permissions'] {
  if (!raw || typeof raw !== 'object') {
    return { read: [], write: [] };
  }

  const p = raw as Record<string, unknown>;

  const normalizeField = (field: unknown): ApiModule[] | true => {
    if (field === true) return true;
    if (Array.isArray(field)) return field.filter(
      (m): m is ApiModule => VALID_MODULES.includes(m as ApiModule)
    );
    return [];
  };

  return {
    read: normalizeField(p.read),
    write: normalizeField(p.write),
  };
}

// ─── Main function ──────────────────────────────────────────────────────────

export async function authenticateApiKey(
  request: NextRequest,
  options?: {
    requiredModule?: ApiModule;
    requireRead?: boolean;   // default: true
    requireWrite?: boolean;  // default: false
  }
): Promise<AuthResult> {
  const { requiredModule, requireRead = true, requireWrite = false } = options ?? {};

  // 1. Extract Bearer token
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized('API key is required. Use Authorization: Bearer <key>');
  }

  const apiKey = authHeader.substring(7).trim();
  if (!apiKey) {
    return unauthorized('API key is empty');
  }

  // 2. SHA-256 hash the raw key
  const hashedKey = createHash('sha256').update(apiKey).digest('hex');

  // 3. Create service role client
  const supabase = createServiceRoleClient();

  // 4. Look up key in database
  const { data: keyData, error: keyError } = await supabase
    .from('api_keys')
    .select('id, name, key_value, is_active, expires_at, permissions, institution_id')
    .eq('key_value', hashedKey)
    .eq('is_active', true)
    .single();

  if (keyError || !keyData) {
    return unauthorized('Invalid or inactive API key');
  }

  // 5. Check expiry
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return unauthorized('API key has expired');
  }

  // 6. Normalize permissions (handle legacy + new format)
  const permissions = normalizePermissions(keyData.permissions);

  // 7. Check module access
  if (requiredModule) {
    if (requireRead && !hasModuleAccess(permissions.read, requiredModule)) {
      return forbidden(`API key does not have read access to module: ${requiredModule}`);
    }
    if (requireWrite && !hasModuleAccess(permissions.write, requiredModule)) {
      return forbidden(`API key does not have write access to module: ${requiredModule}`);
    }
  }

  // 8. Fire-and-forget: update last_used_at
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyData.id)
    .then(() => {}) // intentionally fire-and-forget
    .catch(() => {}); // silent — never block the response

  // 9. Return context with service role client ready
  return {
    context: {
      keyId: keyData.id,
      keyName: keyData.name,
      institutionId: keyData.institution_id ?? null,
      permissions,
      supabase,
    },
  };
}

// ─── Institution resolver (shared helper for routes) ────────────────────────

export function resolveInstitutionId(
  context: ApiKeyContext,
  request: NextRequest
): string | null {
  const url = new URL(request.url);
  const queryId = url.searchParams.get('institutionId')
    ?? url.searchParams.get('institution_id');

  if (context.institutionId) {
    // Key is bound — reject if caller requests a different institution
    if (queryId && queryId !== context.institutionId) return null;
    return context.institutionId;
  }

  return queryId; // null if not provided — caller should return 400
}
```

**Step 4: Run tests**

```bash
bun test __tests__/lib/api-keys/authenticate.test.ts
# Expected: PASS (the 2 basic tests)
```

**Step 5: Commit**

```bash
git add lib/api-keys/authenticate.ts __tests__/lib/api-keys/authenticate.test.ts
git commit -m "feat(b2a): add centralized authenticateApiKey helper with module scoping"
```

---

### Task 1.3 — `rate-limiter.ts` — In-Memory Sliding Window

**Status:** `[x]`

**Files:**
- Create: `lib/api-keys/rate-limiter.ts`
- Create: `__tests__/lib/api-keys/rate-limiter.test.ts`

**What this does:** 60 requests/minute per API key. In-memory Map — resets on deploy. Sufficient for MVP.

**Step 1: Write the test first**

```typescript
// __tests__/lib/api-keys/rate-limiter.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('allows first request', () => {
    const result = checkRateLimit('key-1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
  });

  it('allows up to 60 requests', () => {
    for (let i = 0; i < 59; i++) {
      checkRateLimit('key-2');
    }
    const result = checkRateLimit('key-2'); // 60th
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('blocks 61st request', () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit('key-3');
    }
    const result = checkRateLimit('key-3'); // 61st
    expect(result.allowed).toBe(false);
  });

  it('resets after 60 seconds', () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit('key-4');
    }
    vi.advanceTimersByTime(61_000); // advance 61 seconds
    const result = checkRateLimit('key-4');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
  });

  it('different keys have independent limits', () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit('key-a');
    }
    const result = checkRateLimit('key-b');
    expect(result.allowed).toBe(true); // key-b is independent
  });
});
```

**Step 2: Run test to see it fail**

```bash
bun test __tests__/lib/api-keys/rate-limiter.test.ts
# Expected: FAIL — "Cannot find module"
```

**Step 3: Create `lib/api-keys/rate-limiter.ts`**

```typescript
const WINDOW_MS = 60_000;      // 60 second window
const MAX_REQUESTS = 60;       // requests per window
const CLEANUP_INTERVAL_MS = 300_000; // cleanup every 5 minutes

interface RateLimitEntry {
  requests: number[];  // timestamps of requests within the window
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS * 2;
    for (const [key, entry] of store.entries()) {
      if (!entry.requests.some(t => t > cutoff)) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

export function checkRateLimit(apiKeyId: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;  // Unix timestamp (ms)
} {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  let entry = store.get(apiKeyId);
  if (!entry) {
    entry = { requests: [] };
    store.set(apiKeyId, entry);
  }

  // Slide the window: remove timestamps older than 60s
  entry.requests = entry.requests.filter(t => t > windowStart);

  const count = entry.requests.length;

  if (count >= MAX_REQUESTS) {
    const oldestInWindow = entry.requests[0];
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldestInWindow + WINDOW_MS,
    };
  }

  entry.requests.push(now);

  return {
    allowed: true,
    remaining: MAX_REQUESTS - entry.requests.length,
    resetAt: now + WINDOW_MS,
  };
}
```

**Step 4: Run tests**

```bash
bun test __tests__/lib/api-keys/rate-limiter.test.ts
# Expected: PASS (all 5 tests)
```

**Step 5: Commit**

```bash
git add lib/api-keys/rate-limiter.ts __tests__/lib/api-keys/rate-limiter.test.ts
git commit -m "feat(b2a): add in-memory sliding window rate limiter (60 req/min per key)"
```

---

### Task 1.4 — `audit-logger.ts` — Fire-and-Forget Usage Logger

**Status:** `[x]`

**Files:**
- Create: `lib/api-keys/audit-logger.ts`
- Depends on: Task 1.1 (migration), Task 1.2 (`authenticate.ts` for service role client)

**What this does:** Logs every API key usage to `api_key_usage_logs` without blocking the response.

**Step 1: Create `lib/api-keys/audit-logger.ts`**

```typescript
import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export interface AuditLogParams {
  apiKeyId: string;
  endpoint: string;
  module: string;
  institutionId?: string | null;
  statusCode: number;
  responseTimeMs: number;
  request: NextRequest;
}

export function logApiKeyUsage(params: AuditLogParams): void {
  // Fire-and-forget — never block the response
  const supabase = createServiceRoleClient();

  const ipAddress =
    params.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    params.request.headers.get('x-real-ip') ??
    null;

  const userAgent = params.request.headers.get('user-agent') ?? null;

  supabase
    .from('api_key_usage_logs')
    .insert({
      api_key_id: params.apiKeyId,
      endpoint: params.endpoint,
      module: params.module,
      institution_id: params.institutionId ?? null,
      status_code: params.statusCode,
      response_time_ms: params.responseTimeMs,
      ip_address: ipAddress,
      user_agent: userAgent,
    })
    .then(() => {})
    .catch((err) => {
      // Silent fail — never crash the API response over a logging failure
      console.error('[audit-logger] Failed to write usage log:', err);
    });
}
```

**Step 2: Verify TypeScript compiles**

```bash
bun run typecheck
# Expected: 0 errors
```

**Step 3: Commit**

```bash
git add lib/api-keys/audit-logger.ts
git commit -m "feat(b2a): add fire-and-forget audit logger for API key usage"
```

---

### Task 1.5 — Update `api-key-service.ts`

**Status:** `[x]`

**Files:**
- Modify: `lib/api-keys/api-key-service.ts`

**What this does:** Updates existing service to (1) use service role client instead of anon client, (2) add `institutionId` to create/update operations.

**Step 1: Read the current file**

```bash
# Read lib/api-keys/api-key-service.ts to understand current structure
```

**Step 2: Changes to make**

1. Import `createServiceRoleClient` from `@/lib/supabase/server`
2. Replace the existing Supabase client initialization with `createServiceRoleClient()`
3. Add `institutionId?: string` to `CreateApiKeyInput` type
4. Add `institutionId?: string` to `UpdateApiKeyInput` type
5. Include `institution_id: params.institutionId ?? null` in `.insert()` call
6. Include `institution_id: params.institutionId` in `.update()` call (if provided)

**Step 3: Verify build after changes**

```bash
bun run build
# Expected: 0 errors
```

**Step 4: Commit**

```bash
git add lib/api-keys/api-key-service.ts
git commit -m "feat(b2a): update ApiKeyService to use service role client and support institution binding"
```

---

### Task 1.6 — Verify Phase 1 End-to-End

**Status:** `[x]`

**Step 1: Run full test suite**

```bash
bun test
# Expected: All existing tests pass + new auth/rate-limiter tests pass
```

**Step 2: TypeScript check**

```bash
bun run typecheck
# Expected: 0 errors
```

**Step 3: Build check**

```bash
bun run build
# Expected: 0 errors, 0 warnings
```

**Step 4: Manual smoke test using SQL Editor (Supabase)**

```sql
-- Insert a test API key for Phase 2 testing
INSERT INTO api_keys (name, key_value, is_active, permissions, institution_id, created_by)
SELECT
  'Test B2A Key — All Modules',
  encode(sha256('jkkn_test_b2a_2026'::bytea), 'hex'),
  true,
  '{"read": ["admission", "attendance", "billing", "grievance", "okr"], "write": []}'::jsonb,
  id,        -- institution_id from your test institution
  (SELECT id FROM profiles WHERE role = 'super_admin' LIMIT 1)
FROM institutions
WHERE name ILIKE '%test%'
LIMIT 1;
```

---

## Phase 2: Morning Brief Endpoint

> **Goal:** Single endpoint proving the B2A model — aggregates 5 modules, returns unified briefing.
> **Estimated effort:** 2-3 days
> **Depends on:** Phase 1 complete (Tasks 1.1–1.5)
> **Unblocks:** Phase 3 (validates patterns before scaling to 25 routes)

---

### Task 2.1 — Read Reference Services

**Status:** `[x]`

Before writing the Morning Brief service, READ these files to understand existing patterns:

- `lib/services/admission/admission-service.ts` — look for `getDashboardAnalytics()` and how it accepts external client
- `lib/services/grievance/grievance-service.ts` — look for `getDashboardStats()` and the RPC call `get_grievance_sla_stats`
- `lib/services/academic/attendance-dashboard-service.ts` — `getTodayAttendanceStats()` query pattern
- `lib/services/billing/reports/billing-report-service.ts` — `getOutstandingReport()` query pattern
- `lib/services/okr/okr-analytics-service.ts` — `getAnalyticsSummary()` query pattern

**Note any:**
- Table names used for each module
- Column names (especially JSONB fields like `attendance_data`)
- Whether service accepts external supabase client parameter

---

### Task 2.2 — Morning Brief Service

**Status:** `[x]`

**Files:**
- Create: `lib/services/morning-brief/morning-brief-service.ts`
- Depends on: Task 2.1 (read reference services), Task 1.2 (authenticate.ts for types)

**Step 1: Create `lib/services/morning-brief/morning-brief-service.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiModule } from '@/lib/api-keys/authenticate';

// ─── Return Types ────────────────────────────────────────────────────────────

export interface AdmissionSummary {
  total_applications: number;
  pending: number;
  approved: number;
  enrolled: number;
  conversion_rate: number;
  new_today: number;
}

export interface AttendanceSummary {
  date: string;
  total_students: number;
  total_present: number;
  total_absent: number;
  attendance_percentage: number;
  departments_below_75: number;
}

export interface BillingSummary {
  total_amount_billed: number;
  total_amount_collected: number;
  total_outstanding: number;
  overdue_count: number;
  collection_rate: number;
}

export interface GrievanceSummary {
  total_open: number;
  total_in_progress: number;
  total_resolved: number;
  sla_breached: number;
  sla_at_risk: number;
  avg_resolution_time_hours: number;
}

export interface OkrSummary {
  total_objectives: number;
  active_objectives: number;
  avg_progress: number;
  at_risk_objectives: number;
  check_in_compliance_rate: number;
}

export interface MorningBriefData {
  generated_at: string;
  institution_id: string;
  institution_name?: string;
  modules: {
    admission?: AdmissionSummary;
    attendance?: AttendanceSummary;
    billing?: BillingSummary;
    grievance?: GrievanceSummary;
    okr?: OkrSummary;
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class MorningBriefService {
  static async generateBrief(
    supabase: SupabaseClient,
    institutionId: string,
    allowedModules: ApiModule[] | true
  ): Promise<MorningBriefData> {
    const canRead = (module: ApiModule): boolean =>
      allowedModules === true || allowedModules.includes(module);

    const today = new Date().toISOString().split('T')[0];

    // Run permitted module queries in parallel — individual failures are isolated
    const [admissionResult, attendanceResult, billingResult, grievanceResult, okrResult] =
      await Promise.allSettled([
        canRead('admission')  ? MorningBriefService.getAdmission(supabase, institutionId, today)  : Promise.resolve(null),
        canRead('attendance') ? MorningBriefService.getAttendance(supabase, institutionId, today) : Promise.resolve(null),
        canRead('billing')    ? MorningBriefService.getBilling(supabase, institutionId)           : Promise.resolve(null),
        canRead('grievance')  ? MorningBriefService.getGrievance(supabase, institutionId)         : Promise.resolve(null),
        canRead('okr')        ? MorningBriefService.getOkr(supabase, institutionId)               : Promise.resolve(null),
      ]);

    // Get institution name
    const { data: instData } = await supabase
      .from('institutions')
      .select('name')
      .eq('id', institutionId)
      .single();

    const modules: MorningBriefData['modules'] = {};

    if (admissionResult.status === 'fulfilled' && admissionResult.value) {
      modules.admission = admissionResult.value;
    } else if (admissionResult.status === 'rejected') {
      console.error('[morning-brief] Admission module failed:', admissionResult.reason);
    }

    if (attendanceResult.status === 'fulfilled' && attendanceResult.value) {
      modules.attendance = attendanceResult.value;
    } else if (attendanceResult.status === 'rejected') {
      console.error('[morning-brief] Attendance module failed:', attendanceResult.reason);
    }

    if (billingResult.status === 'fulfilled' && billingResult.value) {
      modules.billing = billingResult.value;
    } else if (billingResult.status === 'rejected') {
      console.error('[morning-brief] Billing module failed:', billingResult.reason);
    }

    if (grievanceResult.status === 'fulfilled' && grievanceResult.value) {
      modules.grievance = grievanceResult.value;
    } else if (grievanceResult.status === 'rejected') {
      console.error('[morning-brief] Grievance module failed:', grievanceResult.reason);
    }

    if (okrResult.status === 'fulfilled' && okrResult.value) {
      modules.okr = okrResult.value;
    } else if (okrResult.status === 'rejected') {
      console.error('[morning-brief] OKR module failed:', okrResult.reason);
    }

    return {
      generated_at: new Date().toISOString(),
      institution_id: institutionId,
      institution_name: instData?.name,
      modules,
    };
  }

  // ── Module Adapters ──────────────────────────────────────────────────────

  private static async getAdmission(
    supabase: SupabaseClient,
    institutionId: string,
    today: string
  ): Promise<AdmissionSummary> {
    // NOTE: If AdmissionService.getDashboardAnalytics() accepts external client, use it.
    // Otherwise use direct query pattern below. Check during Task 2.1.
    const { data, error } = await supabase
      .from('admission_leads')
      .select('id, status, created_at')
      .eq('institution_id', institutionId); // MANDATORY institution scope

    if (error) throw error;

    const total = data?.length ?? 0;
    const pending  = data?.filter(r => r.status === 'pending').length ?? 0;
    const approved = data?.filter(r => r.status === 'approved').length ?? 0;
    const enrolled = data?.filter(r => r.status === 'enrolled').length ?? 0;
    const newToday = data?.filter(r => r.created_at?.startsWith(today)).length ?? 0;

    return {
      total_applications: total,
      pending,
      approved,
      enrolled,
      conversion_rate: total > 0 ? Math.round((enrolled / total) * 100) : 0,
      new_today: newToday,
    };
  }

  private static async getAttendance(
    supabase: SupabaseClient,
    institutionId: string,
    today: string
  ): Promise<AttendanceSummary> {
    const { data, error } = await supabase
      .from('student_attendance')
      .select('attendance_data, department_id')
      .eq('institution_id', institutionId) // MANDATORY
      .eq('attendance_date', today);

    if (error) throw error;

    let totalStudents = 0;
    let totalPresent = 0;
    const deptAttendance: Record<string, { present: number; total: number }> = {};

    for (const record of data ?? []) {
      // Handle JSONB dual-format: array or object
      const attendanceArray = Array.isArray(record.attendance_data)
        ? record.attendance_data
        : Object.values(record.attendance_data ?? {});

      for (const entry of attendanceArray) {
        totalStudents++;
        if (entry.status === 'present') totalPresent++;

        const deptId = record.department_id ?? 'unknown';
        if (!deptAttendance[deptId]) deptAttendance[deptId] = { present: 0, total: 0 };
        deptAttendance[deptId].total++;
        if (entry.status === 'present') deptAttendance[deptId].present++;
      }
    }

    const deptsBelowThreshold = Object.values(deptAttendance).filter(
      d => d.total > 0 && (d.present / d.total) * 100 < 75
    ).length;

    return {
      date: today,
      total_students: totalStudents,
      total_present: totalPresent,
      total_absent: totalStudents - totalPresent,
      attendance_percentage: totalStudents > 0
        ? Math.round((totalPresent / totalStudents) * 100)
        : 0,
      departments_below_75: deptsBelowThreshold,
    };
  }

  private static async getBilling(
    supabase: SupabaseClient,
    institutionId: string
  ): Promise<BillingSummary> {
    const { data, error } = await supabase
      .from('billing_student_bills')
      .select('final_amount, balance_amount, status')
      .eq('institution_id', institutionId); // MANDATORY

    if (error) throw error;

    const totalBilled = data?.reduce((s, r) => s + (r.final_amount ?? 0), 0) ?? 0;
    const totalOutstanding = data?.reduce((s, r) => s + (r.balance_amount ?? 0), 0) ?? 0;
    const totalCollected = totalBilled - totalOutstanding;
    const overdueCount = data?.filter(r => r.status === 'overdue').length ?? 0;

    return {
      total_amount_billed: totalBilled,
      total_amount_collected: totalCollected,
      total_outstanding: totalOutstanding,
      overdue_count: overdueCount,
      collection_rate: totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0,
    };
  }

  private static async getGrievance(
    supabase: SupabaseClient,
    institutionId: string
  ): Promise<GrievanceSummary> {
    // Use RPC if available: get_grievance_sla_stats(p_institution_id)
    const { data, error } = await supabase
      .rpc('get_grievance_sla_stats', { p_institution_id: institutionId });

    if (error) {
      // Fallback: direct query if RPC doesn't exist
      console.warn('[morning-brief] RPC get_grievance_sla_stats failed, using fallback');
      const { data: fallback, error: fbError } = await supabase
        .from('grievances')
        .select('status, sla_deadline, created_at')
        .eq('institution_id', institutionId); // MANDATORY

      if (fbError) throw fbError;

      const open       = fallback?.filter(r => r.status === 'open').length ?? 0;
      const inProgress = fallback?.filter(r => r.status === 'in_progress').length ?? 0;
      const resolved   = fallback?.filter(r => r.status === 'resolved').length ?? 0;

      return {
        total_open: open,
        total_in_progress: inProgress,
        total_resolved: resolved,
        sla_breached: 0,
        sla_at_risk: 0,
        avg_resolution_time_hours: 0,
      };
    }

    return {
      total_open: data?.total_open ?? 0,
      total_in_progress: data?.total_in_progress ?? 0,
      total_resolved: data?.total_resolved ?? 0,
      sla_breached: data?.sla_breached ?? 0,
      sla_at_risk: data?.sla_at_risk ?? 0,
      avg_resolution_time_hours: data?.avg_resolution_time_hours ?? 0,
    };
  }

  private static async getOkr(
    supabase: SupabaseClient,
    institutionId: string
  ): Promise<OkrSummary> {
    const { data: objectives, error: objError } = await supabase
      .from('okr_objectives')
      .select('id, status, overall_progress')
      .eq('institution_id', institutionId); // MANDATORY

    if (objError) throw objError;

    const total = objectives?.length ?? 0;
    const active = objectives?.filter(o => o.status === 'active').length ?? 0;
    const atRisk = objectives?.filter(
      o => o.status === 'active' && (o.overall_progress ?? 0) < 25
    ).length ?? 0;
    const avgProgress = total > 0
      ? Math.round(
          (objectives ?? []).reduce((s, o) => s + (o.overall_progress ?? 0), 0) / total
        )
      : 0;

    // Check-in compliance
    const objectiveIds = (objectives ?? []).map(o => o.id);
    let complianceRate = 0;

    if (objectiveIds.length > 0) {
      const { data: checkIns } = await supabase
        .from('okr_check_ins')
        .select('objective_id, is_completed')
        .in('objective_id', objectiveIds);

      const completedIds = new Set(
        (checkIns ?? []).filter(c => c.is_completed).map(c => c.objective_id)
      );
      complianceRate = total > 0
        ? Math.round((completedIds.size / total) * 100)
        : 0;
    }

    return {
      total_objectives: total,
      active_objectives: active,
      avg_progress: avgProgress,
      at_risk_objectives: atRisk,
      check_in_compliance_rate: complianceRate,
    };
  }
}
```

**Step 2: Run typecheck**

```bash
bun run typecheck
# Expected: 0 errors
```

**Step 3: Commit**

```bash
git add lib/services/morning-brief/morning-brief-service.ts
git commit -m "feat(b2a): add MorningBriefService aggregating 5 modules with graceful degradation"
```

---

### Task 2.3 — Morning Brief API Route

**Status:** `[x]`

**Files:**
- Create: `app/api/api-management/morning-brief/route.ts`
- Depends on: Tasks 1.2, 1.3, 1.4, 2.2

**Step 1: Create `app/api/api-management/morning-brief/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiKeyUsage } from '@/lib/api-keys/audit-logger';
import { MorningBriefService } from '@/lib/services/morning-brief/morning-brief-service';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // 1. Authenticate
  const auth = await authenticateApiKey(request, { requireRead: true });
  if ('error' in auth) return auth.error;
  const { context } = auth;

  // 2. Rate limit
  const rate = checkRateLimit(context.keyId);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded. Try again shortly.' } },
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Retry-After': String(Math.ceil((rate.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // 3. Resolve institution
  const institutionId = resolveInstitutionId(context, request);
  if (!institutionId) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'institutionId is required as query parameter' } },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // 4. Generate morning brief
    const brief = await MorningBriefService.generateBrief(
      context.supabase,
      institutionId,
      context.permissions.read
    );

    const modulesIncluded = Object.keys(brief.modules);
    const allModules = ['admission', 'attendance', 'billing', 'grievance', 'okr'];
    const modulesSkipped = allModules.filter(m => !modulesIncluded.includes(m));

    const responseTimeMs = Date.now() - startTime;

    // 5. Audit log (fire-and-forget)
    logApiKeyUsage({
      apiKeyId: context.keyId,
      endpoint: '/api/api-management/morning-brief',
      module: 'morning-brief',
      institutionId,
      statusCode: 200,
      responseTimeMs,
      request,
    });

    // 6. Return
    return NextResponse.json(
      {
        data: brief,
        meta: {
          response_time_ms: responseTimeMs,
          modules_included: modulesIncluded,
          modules_skipped: modulesSkipped,
          api_key: context.keyName,
        },
      },
      {
        headers: {
          ...corsHeaders,
          'X-RateLimit-Remaining': String(rate.remaining),
        },
      }
    );
  } catch (err) {
    const responseTimeMs = Date.now() - startTime;
    console.error('[morning-brief] Unexpected error:', err);

    logApiKeyUsage({
      apiKeyId: context.keyId,
      endpoint: '/api/api-management/morning-brief',
      module: 'morning-brief',
      institutionId,
      statusCode: 500,
      responseTimeMs,
      request,
    });

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500, headers: corsHeaders }
    );
  }
}
```

**Step 2: Test with curl (start dev server first)**

```bash
# Start dev server
bun dev

# Test with your test key from Task 1.6
curl -s \
  -H "Authorization: Bearer jkkn_test_b2a_2026" \
  "http://localhost:3000/api/api-management/morning-brief?institutionId=<your-institution-uuid>" \
  | jq .

# Expected: JSON with data.modules containing admission, attendance, billing, grievance, okr
```

**Step 3: Test rate limiting (run 61 requests)**

```bash
for i in $(seq 1 61); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer jkkn_test_b2a_2026" \
    "http://localhost:3000/api/api-management/morning-brief?institutionId=<uuid>")
  echo "Request $i: $STATUS"
done
# Expected: Requests 1-60 return 200, request 61 returns 429
```

**Step 4: Verify audit log**

```sql
-- In Supabase SQL Editor:
SELECT * FROM api_key_usage_logs ORDER BY created_at DESC LIMIT 5;
-- Expected: Rows with endpoint='/api/api-management/morning-brief', module='morning-brief'
```

**Step 5: Build check**

```bash
bun run build
# Expected: 0 errors
```

**Step 6: Commit**

```bash
git add app/api/api-management/morning-brief/route.ts
git commit -m "feat(b2a): add morning brief endpoint aggregating 5 institutional modules"
```

---

## Phase 3: Full Module API Exposure

> **Goal:** All existing service modules exposed as read-only REST APIs under `/api/b2a/`.
> **Estimated effort:** 7-10 days
> **Depends on:** Phase 1 complete (Tasks 1.1–1.5) + Phase 2 complete (validates patterns)
> **Unblocks:** Phase 4 (Context Engine)

**Standard route template for ALL Phase 3 routes:**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiKeyUsage } from '@/lib/api-keys/audit-logger';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const auth = await authenticateApiKey(request, { requiredModule: 'MODULE_NAME', requireRead: true });
  if ('error' in auth) return auth.error;
  const { context } = auth;

  const rate = checkRateLimit(context.keyId);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } },
      { status: 429, headers: { ...corsHeaders, 'Retry-After': String(Math.ceil((rate.resetAt - Date.now()) / 1000)) } }
    );
  }

  const institutionId = resolveInstitutionId(context, request);
  if (!institutionId) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'institutionId is required' } },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const url = new URL(request.url);
    const page   = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
    const limit  = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20')));
    const from   = (page - 1) * limit;
    const to     = from + limit - 1;

    const { data, error, count } = await context.supabase
      .from('TABLE_NAME')
      .select('COLUMNS', { count: 'exact' })
      .eq('institution_id', institutionId)  // MANDATORY — service role bypasses RLS
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    logApiKeyUsage({
      apiKeyId: context.keyId,
      endpoint: '/api/b2a/MODULE_NAME',
      module: 'MODULE_NAME',
      institutionId,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      request,
    });

    return NextResponse.json(
      {
        data,
        meta: {
          total: count ?? 0,
          page,
          limit,
          totalPages: Math.ceil((count ?? 0) / limit),
        },
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error('[b2a/MODULE_NAME] Error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500, headers: corsHeaders }
    );
  }
}
```

---

### Task 3.1 — Admission Module Endpoints

**Status:** `[x]`

**Files to create:**
- `app/api/b2a/admission/route.ts` — list applications/leads with pagination
- `app/api/b2a/admission/stats/route.ts` — admission analytics summary
- `app/api/b2a/admission/[id]/route.ts` — single lead detail

**Tables to use:**
- `admission_leads` — main leads table (check column names during Task 2.1)
- Filter columns: `institution_id`, `status`, `created_at`

**Step 1:** Create `app/api/b2a/admission/route.ts` using the standard template above with:
- `requiredModule: 'admission'`
- Table: `admission_leads`
- Columns: `id, name, email, phone, status, source, created_at, updated_at`
- Support `?status=pending|approved|enrolled` filter

**Step 2:** Create `app/api/b2a/admission/stats/route.ts`
- Returns admission funnel counts (total, pending, approved, enrolled, conversion_rate)
- No pagination needed — single aggregate object

**Step 3:** Create `app/api/b2a/admission/[id]/route.ts`
- Single record by UUID
- Returns full lead detail

**Step 4: Verify institution isolation**

```bash
# Test: Key for Institution A should NOT retrieve Institution B's data
curl -H "Authorization: Bearer jkkn_institution_a_key" \
  "http://localhost:3000/api/b2a/admission?institutionId=<institution-b-uuid>"
# Expected: 403 FORBIDDEN (key bound to Institution A)
```

**Step 5: Commit**

```bash
git add app/api/b2a/admission/
git commit -m "feat(b2a): add admission module read-only API endpoints"
```

---

### Task 3.2 — Attendance Module Endpoints

**Status:** `[x]`

**Files to create:**
- `app/api/b2a/attendance/route.ts` — today's attendance (default) or `?date=YYYY-MM-DD`
- `app/api/b2a/attendance/trend/route.ts` — attendance trend over date range `?from=&to=`
- `app/api/b2a/attendance/pending/route.ts` — classes where attendance not yet marked today

**Tables:** `student_attendance`
**Key columns:** `attendance_date`, `institution_id`, `department_id`, `attendance_data` (JSONB)

**Note:** Handle JSONB dual-format for `attendance_data` (see MEMORY.md — can be array or object).

**Step 1:** Implement list route with default `?date=<today>` when no date param

**Step 2:** Implement trend route with `from` and `to` date params

**Step 3:** Commit

```bash
git add app/api/b2a/attendance/
git commit -m "feat(b2a): add attendance module read-only API endpoints"
```

---

### Task 3.3 — Billing Module Endpoints

**Status:** `[ ]`

**Files to create:**
- `app/api/b2a/billing/route.ts` — invoice list with pagination
- `app/api/b2a/billing/outstanding/route.ts` — outstanding bills report
- `app/api/b2a/billing/summary/route.ts` — collection summary (totals, rates)

**Tables:** `billing_student_bills`
**Key columns:** `final_amount`, `balance_amount`, `status` (unpaid/partially_paid/overdue/paid), `institution_id`, `due_date`

**Filters to support:** `?status=overdue`, `?due_before=YYYY-MM-DD`

**Step 1:** Implement all 3 routes using standard template

**Step 2:** Commit

```bash
git add app/api/b2a/billing/
git commit -m "feat(b2a): add billing module read-only API endpoints"
```

---

### Task 3.4 — Grievance Module Endpoints

**Status:** `[x]`

**Files to create:**
- `app/api/b2a/grievance/route.ts` — ticket list with pagination
- `app/api/b2a/grievance/[id]/route.ts` — single ticket detail
- `app/api/b2a/grievance/dashboard/route.ts` — SLA stats via RPC

**Tables:** `grievances`
**RPC:** `get_grievance_sla_stats(p_institution_id)` for the dashboard endpoint

**Filters to support:** `?status=open|in_progress|resolved`, `?sla_breached=true`

**Step 1:** Implement list, detail, and dashboard routes

**Step 2:** Commit

```bash
git add app/api/b2a/grievance/
git commit -m "feat(b2a): add grievance module read-only API endpoints with SLA dashboard"
```

---

### Task 3.5 — OKR Module Endpoints

**Status:** `[x]`

**Files to create:**
- `app/api/b2a/okr/objectives/route.ts` — objectives list
- `app/api/b2a/okr/stats/route.ts` — analytics summary
- `app/api/b2a/okr/compliance/route.ts` — check-in compliance report

**Tables:** `okr_objectives`, `okr_check_ins`
**Key columns:** `status`, `overall_progress`, `is_completed`

**Step 1:** Implement all 3 routes

**Step 2:** Commit

```bash
git add app/api/b2a/okr/
git commit -m "feat(b2a): add OKR module read-only API endpoints"
```

---

### Task 3.6 — Learners Module Endpoints

**Status:** `[x]`

**Files to create:**
- `app/api/b2a/learners/route.ts` — learner list
- `app/api/b2a/learners/[id]/route.ts` — learner profile

**Tables:** Verify during Task 2.1 — likely `learner_profiles` or `students`

**Step 1:** Read existing learner service to find correct table names

**Step 2:** Implement list and detail routes

**Step 3:** Commit

```bash
git add app/api/b2a/learners/
git commit -m "feat(b2a): add learners module read-only API endpoints"
```

---

### Task 3.7 — Staff Module Endpoints

**Status:** `[x]`

**Files to create:**
- `app/api/b2a/staff/route.ts` — staff list
- `app/api/b2a/staff/[id]/route.ts` — staff profile

**Tables:** Verify from existing routes in `app/api/api-management/staff/`

**Step 1:** Copy pattern from existing `app/api/api-management/staff/route.ts`, adapt to use `authenticate.ts` helper

**Step 2:** Commit

```bash
git add app/api/b2a/staff/
git commit -m "feat(b2a): add staff module read-only API endpoints"
```

---

### Task 3.8 — Organizations Module Endpoints

**Status:** `[x]`

**Files to create:**
- `app/api/b2a/organizations/institutions/route.ts`
- `app/api/b2a/organizations/departments/route.ts`
- `app/api/b2a/organizations/courses/route.ts`

**Tables:** `institutions`, `departments`, `courses`

**Step 1:** Implement all 3 routes

**Step 2:** Commit

```bash
git add app/api/b2a/organizations/
git commit -m "feat(b2a): add organizations module read-only API endpoints"
```

---

### Task 3.9 — Campus Living Module Endpoints

**Status:** `[x]` *(stub — no backing tables exist; returns 501 MODULE_NOT_IMPLEMENTED with full auth/rate-limit/audit pipeline)*

**Files to create:**
- `app/api/b2a/campus-living/hostels/route.ts` — hostel occupancy
- `app/api/b2a/campus-living/dining/route.ts` — dining menu

**Step 1:** Find relevant tables from existing services

**Step 2:** Implement routes

**Step 3:** Commit

```bash
git add app/api/b2a/campus-living/
git commit -m "feat(b2a): add campus-living module read-only API endpoints"
```

---

### Task 3.10 — Solutions Module Endpoints

**Status:** `[x]` *(stub — no backing tables exist; returns 501 MODULE_NOT_IMPLEMENTED with full auth/rate-limit/audit pipeline)*

**Files to create:**
- `app/api/b2a/solutions/builders/route.ts`
- `app/api/b2a/solutions/clients/route.ts`
- `app/api/b2a/solutions/projects/route.ts`

**Step 1:** Find relevant tables from existing services

**Step 2:** Implement routes

**Step 3:** Commit

```bash
git add app/api/b2a/solutions/
git commit -m "feat(b2a): add solutions module read-only API endpoints"
```

---

### Task 3.11 — Learners Council Module Endpoints

**Status:** `[x]` *(stub — no backing tables exist; returns 501 MODULE_NOT_IMPLEMENTED with full auth/rate-limit/audit pipeline)*

**Files to create:**
- `app/api/b2a/learners-council/announcements/route.ts`
- `app/api/b2a/learners-council/events/route.ts`
- `app/api/b2a/learners-council/polls/route.ts`

**Step 1:** Find relevant tables from existing services

**Step 2:** Implement routes

**Step 3:** Commit

```bash
git add app/api/b2a/learners-council/
git commit -m "feat(b2a): add learners-council module read-only API endpoints"
```

---

### Task 3.12 — Phase 3 Integration Verification

**Status:** `[x]` *(TypeScript: 0 errors across all 26 b2a routes; retryAfterMs removed from all 429 bodies)*

**Step 1: Institution isolation integration test**

```bash
# Run this for EVERY module endpoint:
# Key bound to Institution A must not return Institution B data
curl -H "Authorization: Bearer jkkn_institution_a_key" \
  "http://localhost:3000/api/b2a/admission?institutionId=<institution-b-uuid>"
# Expected: 403 FORBIDDEN
```

**Step 2: Module permission test**

```bash
# Key with only 'admission' access should get 403 on billing
curl -H "Authorization: Bearer jkkn_admission_only_key" \
  "http://localhost:3000/api/b2a/billing"
# Expected: 403 FORBIDDEN
```

**Step 3: Build and test**

```bash
bun run build && bun test
# Expected: 0 errors, all tests pass
```

**Step 4: Commit**

```bash
git commit -m "feat(b2a): phase 3 complete — all module read-only endpoints with institution isolation"
```

---

## Phase 4: Cross-Module Context Engine

> **Goal:** Single endpoint allowing agents to query and correlate data across multiple modules.
> **Estimated effort:** 5-7 days
> **Depends on:** Phase 3 complete (all module adapters tested)
> **Unblocks:** Phase 5 (Memory needs rich context to store meaningful observations)

---

### Task 4.1 — Context Query Types and Pre-Built Queries

**Status:** `[ ]`

**Files:**
- Create: `lib/services/b2a/context-query-service.ts`

**What this does:** Defines the pre-built cross-module query library. Each query fetches multiple module datasets in parallel, then computes cross-module correlations.

**Pre-built queries to implement:**

| Query ID | Modules | Join Key | Description |
|----------|---------|----------|-------------|
| `daily-ops` | admission, attendance, billing, grievance, okr | N/A (parallel fetch) | Full operational snapshot |
| `at-risk-learners` | attendance, billing, grievance | `student_id` / `learner_id` | Students with multiple risk signals |
| `department-health` | attendance, okr, grievance | `department_id` | Department-level health index |
| `admission-pipeline` | admission, billing | enrollment join | Lead-to-revenue pipeline |
| `sla-violations` | grievance, organizations | `department_id` | Breached SLAs by responsible department |
| `financial-health` | billing | N/A | Collection rates and outstanding analysis |

**Step 1:** Create service with types and all 6 pre-built query implementations

**Step 2:** Each query function signature:

```typescript
async function runQuery(
  supabase: SupabaseClient,
  institutionId: string,
  dateRange?: { from: string; to: string }
): Promise<QueryResult>
```

**Step 3:** Commit

```bash
git add lib/services/b2a/context-query-service.ts
git commit -m "feat(b2a): add context query service with 6 pre-built cross-module queries"
```

---

### Task 4.2 — Context Query Endpoint

**Status:** `[ ]`

**Files:**
- Create: `app/api/b2a/context/query/route.ts`

**Step 1: Create the endpoint**

```typescript
// POST /api/b2a/context/query
// Body: { "query_id": "at-risk-learners", "institutionId": "uuid", "date_range": {...} }
// OR:   { "modules": ["attendance", "grievance"], "institutionId": "uuid" }

// CRITICAL: Check permissions for ALL modules in the query, not just the primary one
const requiredModules = getRequiredModules(body.query_id ?? body.modules);
for (const module of requiredModules) {
  if (!hasModuleAccess(context.permissions.read, module)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: `Key lacks read access to module: ${module}` } },
      { status: 403, headers: corsHeaders }
    );
  }
}
```

**Step 2: Test cross-module permission bypass prevention**

```bash
# Key with only 'attendance' should NOT be able to get billing via context query
curl -X POST \
  -H "Authorization: Bearer jkkn_attendance_only_key" \
  -H "Content-Type: application/json" \
  -d '{"query_id": "at-risk-learners", "institutionId": "<uuid>"}' \
  "http://localhost:3000/api/b2a/context/query"
# Expected: 403 FORBIDDEN (at-risk-learners needs billing + attendance)
```

**Step 3: Commit**

```bash
git add app/api/b2a/context/ lib/services/b2a/context-query-service.ts
git commit -m "feat(b2a): add cross-module context query engine with 6 pre-built queries"
```

---

## Phase 5: Agent Memory System

> **Goal:** Persistent memory for agents — decision logs, pattern observations, changelogs.
> **Estimated effort:** 3-5 days
> **Depends on:** Phase 1 (auth infrastructure)
> **Unblocks:** Phase 6 (MCP with institutional context)

---

### Task 5.1 — Agent Memory Database Migration

**Status:** `[ ]`

**Files:**
- Create: `supabase/migrations/20260224000003_b2a_agent_memory.sql`

**Step 1: Create migration with both tables (see PRD section 9)**

**Step 2: Apply migration**

```bash
~/bin/supabase db push
```

**Step 3: Verify tables created**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('b2a_agent_memories', 'b2a_decision_log');
-- Expected: 2 rows
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260224000003_b2a_agent_memory.sql
git commit -m "feat(b2a): add agent memory and decision log database tables"
```

---

### Task 5.2 — Memory Service

**Status:** `[ ]`

**Files:**
- Create: `lib/services/b2a/memory-service.ts`

**Step 1:** Implement `MemoryService` class with:
- `createMemory(supabase, apiKeyId, institutionId, params)` — insert memory record
- `listMemories(supabase, apiKeyId, filters)` — list with type/tag/importance filters
- `updateMemory(supabase, id, apiKeyId, updates)` — update (including `superseded_by`)
- `softDeleteMemory(supabase, id, apiKeyId)` — set `expires_at` to NOW()
- `searchMemories(supabase, apiKeyId, query, filters)` — full-text search via `ILIKE`
- `logDecision(supabase, apiKeyId, institutionId, params)` — insert decision log
- `listDecisions(supabase, apiKeyId, filters)` — list decisions
- `updateDecisionOutcome(supabase, id, apiKeyId, outcome)` — add outcome after the fact

**Step 2: Commit**

```bash
git add lib/services/b2a/memory-service.ts
git commit -m "feat(b2a): add MemoryService for agent memory CRUD operations"
```

---

### Task 5.3 — Memory API Routes

**Status:** `[ ]`

**Files to create:**
- `app/api/b2a/memory/route.ts` — GET list + POST create
- `app/api/b2a/memory/[id]/route.ts` — PATCH update + DELETE soft-delete
- `app/api/b2a/memory/decisions/route.ts` — GET list + POST create decision
- `app/api/b2a/memory/search/route.ts` — GET full-text search

**Note:** Memory routes don't need `requiredModule` — they are always accessible to any valid key.

**Step 1:** Implement all 4 route files

**Step 2:** Test memory creation

```bash
curl -X POST \
  -H "Authorization: Bearer jkkn_test_b2a_2026" \
  -H "Content-Type: application/json" \
  -d '{
    "memory_type": "observation",
    "title": "Engineering attendance lowest on Mondays",
    "content": {"observation": "12% lower on Mondays vs other days", "confidence": "high"},
    "tags": ["attendance", "engineering", "weekly-pattern"],
    "importance": 6
  }' \
  "http://localhost:3000/api/b2a/memory?institutionId=<uuid>"
# Expected: 201 with created memory record
```

**Step 3: Commit**

```bash
git add app/api/b2a/memory/
git commit -m "feat(b2a): add agent memory CRUD and decision log API endpoints"
```

---

## Phase 6: MCP Server

> **Goal:** Expose MyJKKN as MCP tools for Claude Code and MCP-compatible agents.
> **Estimated effort:** 3-5 days
> **Depends on:** All previous phases (MCP wraps the REST API)
> **Unblocks:** Claude Code native integration

---

### Task 6.1 — MCP Server Setup

**Status:** `[ ]`

**Files to create:**
- `mcp-server/package.json`
- `mcp-server/index.ts`
- `mcp-server/tools/morning-brief.ts`
- `mcp-server/tools/query-modules.ts`
- `mcp-server/tools/context-query.ts`
- `mcp-server/tools/memory.ts`

**Step 1: Create `mcp-server/package.json`**

```json
{
  "name": "myjkkn-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "build": "tsc",
    "start": "node index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

**Step 2: Create `mcp-server/index.ts`**

Architecture: thin HTTP wrapper over the REST API. Each MCP tool maps to one REST endpoint call.

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const MYJKKN_API_URL = process.env.MYJKKN_API_URL ?? 'http://localhost:3000';
const MYJKKN_API_KEY = process.env.MYJKKN_API_KEY ?? '';

// Tool definitions — descriptions are LOAD-BEARING for agent intent-matching
const server = new Server(
  { name: 'myjkkn', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Register tools (see Task 6.2)
// ...

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Step 3: Implement tools in `mcp-server/tools/`**

Each tool:
1. Accepts typed parameters
2. Makes HTTP call to REST API with `Authorization: Bearer <key>`
3. Returns structured result for agent consumption
4. Includes domain-appropriate error messages (not raw HTTP errors)

**Tools to implement:**

| Tool Name | REST Endpoint | Description (for agent) |
|-----------|---------------|------------------------|
| `myjkkn_morning_brief` | `GET /api/api-management/morning-brief` | "Get today's operational briefing for an institution: attendance, billing, grievances, OKR status, and admission pipeline" |
| `myjkkn_query_admission` | `GET /api/b2a/admission` | "List admission leads and applications for an institution with status filtering" |
| `myjkkn_query_attendance` | `GET /api/b2a/attendance` | "Get attendance records for an institution, optionally for a specific date" |
| `myjkkn_query_billing` | `GET /api/b2a/billing` | "List student bills and fee records with outstanding balance information" |
| `myjkkn_query_grievance` | `GET /api/b2a/grievance` | "List grievance tickets with SLA status" |
| `myjkkn_query_okr` | `GET /api/b2a/okr/objectives` | "List OKR objectives and progress for an institution" |
| `myjkkn_context_query` | `POST /api/b2a/context/query` | "Query and correlate data across multiple modules (e.g., find at-risk students with low attendance AND unpaid fees)" |
| `myjkkn_remember` | `POST /api/b2a/memory` | "Store an observation, pattern, decision, or changelog entry for this institution" |
| `myjkkn_recall` | `GET /api/b2a/memory/search` | "Search previously stored memories by keyword, type, or tags" |
| `myjkkn_log_decision` | `POST /api/b2a/memory/decisions` | "Log a decision made for an institution with context, rationale, and alternatives considered" |

**Step 4: Build and test**

```bash
cd mcp-server
npm install
npm run build
echo '{"method":"tools/list"}' | node index.js
# Expected: JSON with all 10 tools listed
```

**Step 5: Create Claude Code config documentation**

Create `docs/features/b2a/MCP-SETUP.md`:

```json
// Add to your project's .mcp.json:
{
  "mcpServers": {
    "myjkkn": {
      "command": "node",
      "args": ["path/to/myjkkn-mcp-server/index.js"],
      "env": {
        "MYJKKN_API_URL": "https://myjkkn-omm-dev.vercel.app",
        "MYJKKN_API_KEY": "jkkn_<your-api-key>"
      }
    }
  }
}
```

**Step 6: Commit**

```bash
git add mcp-server/ docs/features/b2a/MCP-SETUP.md
git commit -m "feat(b2a): add MCP server exposing all B2A capabilities as Claude Code tools"
```

---

## Phase 1b: Progressive Route Migration (Non-Blocking)

> **Goal:** Migrate existing 31 `app/api/api-management/**` routes to use shared `authenticate.ts` helper.
> **Estimated effort:** 3-5 days (can be done incrementally alongside Phases 2-6)
> **Depends on:** Task 1.2 (`authenticate.ts`)
> **Priority:** Low — existing routes work. This is cleanup/consistency work.

---

### Task M1 — Migrate api-management Routes (31 files)

**Status:** `[ ]`

**For each route, change from:**

```typescript
// 30+ lines of duplicated auth boilerplate:
const authHeader = request.headers.get('authorization');
if (!authHeader || !authHeader.startsWith('Bearer ')) {
  return NextResponse.json({ error: 'API key is required' }, { status: 401, ... });
}
const apiKey = authHeader.substring(7);
const hashedKey = createHash('sha256').update(apiKey).digest('hex');
const supabase = createServerClient(...);
const { data: keyData } = await supabase.from('api_keys').select('*').eq(...)...
// etc.
```

**To:**

```typescript
// 3 lines:
const auth = await authenticateApiKey(request, { requireRead: true });
if ('error' in auth) return auth.error;
const { context } = auth;
// Use context.supabase for subsequent queries
```

**Migration list (do in batches of 5-10 routes):**

- [ ] `app/api/api-management/organizations/institutions/route.ts`
- [ ] `app/api/api-management/organizations/institutions/[id]/route.ts`
- [ ] `app/api/api-management/organizations/departments/route.ts`
- [ ] `app/api/api-management/organizations/departments/[id]/route.ts`
- [ ] `app/api/api-management/organizations/programs/route.ts`
- [ ] `app/api/api-management/organizations/programs/[id]/route.ts`
- [ ] `app/api/api-management/organizations/sections/route.ts`
- [ ] `app/api/api-management/organizations/sections/[id]/route.ts`
- [ ] `app/api/api-management/organizations/courses/route.ts`
- [ ] `app/api/api-management/organizations/courses/[id]/route.ts`
- [ ] `app/api/api-management/organizations/degrees/route.ts`
- [ ] `app/api/api-management/organizations/degrees/[id]/route.ts`
- [ ] `app/api/api-management/organizations/semesters/route.ts`
- [ ] `app/api/api-management/organizations/semesters/[id]/route.ts`
- [ ] `app/api/api-management/organizations/departments/institutions/route.ts`
- [ ] `app/api/api-management/organizations/institutions/names/route.ts`
- [ ] `app/api/api-management/academic/academic-years/route.ts`
- [ ] `app/api/api-management/academic/academic-years/[id]/route.ts`
- [ ] `app/api/api-management/academic/batches/route.ts`
- [ ] `app/api/api-management/academic/batches/[id]/route.ts`
- [ ] `app/api/api-management/academic/regulations/route.ts`
- [ ] `app/api/api-management/academic/regulations/[id]/route.ts`
- [ ] `app/api/api-management/applications/route.ts`
- [ ] `app/api/api-management/applications/[id]/route.ts`
- [ ] `app/api/api-management/learners/alumni/route.ts`
- [ ] `app/api/api-management/learners/enquiries/route.ts`
- [ ] `app/api/api-management/learners/enquiries/[id]/route.ts`
- [ ] `app/api/api-management/learners/profiles/route.ts`
- [ ] `app/api/api-management/learners/profiles/[id]/route.ts`
- [ ] `app/api/api-management/staff/route.ts`
- [ ] `app/api/api-management/staff/[id]/route.ts`

---

## Overall Progress Tracker

| Phase | Description | Status | Tasks |
|-------|-------------|--------|-------|
| **Phase 1** | API Gateway Foundation | `[ ]` | 1.1, 1.2, 1.3, 1.4, 1.5, 1.6 |
| **Phase 2** | Morning Brief Endpoint | `[ ]` | 2.1, 2.2, 2.3 |
| **Phase 3** | Full Module API Exposure | `[ ]` | 3.1–3.12 |
| **Phase 4** | Cross-Module Context Engine | `[ ]` | 4.1, 4.2 |
| **Phase 5** | Agent Memory System | `[ ]` | 5.1, 5.2, 5.3 |
| **Phase 6** | MCP Server | `[ ]` | 6.1 |
| **Phase 1b** | Route Migration (progressive) | `[ ]` | M1 (31 files) |

---

## Verification Commands (Run After Each Phase)

```bash
# After every phase:
bun run build          # Must pass: 0 errors
bun test               # Must pass: all tests including new ones
bun run typecheck      # Must pass: 0 TypeScript errors

# Integration smoke test (after Phase 2+):
curl -s \
  -H "Authorization: Bearer jkkn_test_b2a_2026" \
  "http://localhost:3000/api/api-management/morning-brief?institutionId=<uuid>" \
  | jq .meta

# Audit log verification (after any API call):
# In Supabase SQL Editor:
# SELECT * FROM api_key_usage_logs ORDER BY created_at DESC LIMIT 5;
```

---

*Plan end. See `docs/features/b2a/B2A-PRD.md` for full requirements, security model, and acceptance criteria.*
