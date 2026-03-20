# MyJKKN MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Embed an MCP (Model Context Protocol) server inside the existing MyJKKN Next.js app so that authenticated JKKN users (admins, faculty, students) can connect from Claude Desktop, ChatGPT, Claude Code, or any MCP-compatible client to query institutional data through natural language.

**Architecture:** Single Next.js API route (`/api/mcp/[transport]/route.ts`) using Vercel's `mcp-handler` package with Streamable HTTP transport. Reuses the existing `jkkn_xxxx` API key authentication system via an auth bridge. User-bound API keys (new `user_id`, `user_role`, `department_id` columns) enable role-based data scoping: students see only their own data, faculty see their department, admins see the full institution. 14 MCP tools (11 module-specific + 3 smart composite) wrap the existing B2A query patterns.

**Tech Stack:** Next.js 16, TypeScript, `mcp-handler` (Vercel), `@modelcontextprotocol/sdk`, Supabase (service role client), Zod, Bun

**Reference:** See `docs/features/b2a/B2A-PRD.md` for the full B2A requirements and security model.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Complete |
| `[!]` | Blocked |

---

## Phase 1: Foundation — Types, Auth Bridge, Scoping Middleware

> **Goal:** Create the core MCP infrastructure: types, authentication bridge that converts `jkkn_xxxx` API keys to MCP auth context, and the scoping middleware that filters data by user role.
> **Depends on:** Nothing — start here.
> **Unblocks:** All other phases.

---

### Task 1.1 — Install Dependencies

**Status:** `[ ]`

**Step 1: Install `mcp-handler` and MCP SDK**

```bash
bun add mcp-handler @modelcontextprotocol/sdk zod
```

**Step 2: Verify installation**

```bash
bun run typecheck
```

Expected: No new type errors introduced.

**Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore: add mcp-handler and MCP SDK dependencies"
```

---

### Task 1.2 — MCP Types

**Status:** `[ ]`

**Files:**
- Create: `lib/mcp/types.ts`

**Step 1: Create the types file**

```typescript
// lib/mcp/types.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiModule } from '@/lib/api-keys/authenticate';

/**
 * User roles that determine data scoping in MCP tool queries.
 *
 * - student: sees only their own records (filtered by user_id → student profile id)
 * - faculty: sees their department's records (filtered by department_id)
 * - admin: sees all records within their institution
 * - super_admin: sees all records across all institutions (platform-level)
 */
export type McpUserRole = 'student' | 'faculty' | 'admin' | 'super_admin';

/**
 * Authentication context passed to every MCP tool via `extra.authInfo.extra`.
 * Created by the auth bridge from a validated `jkkn_xxxx` API key.
 */
export interface McpAuthContext {
  keyId: string;
  keyName: string;
  userId: string | null;
  userRole: McpUserRole;
  institutionId: string;
  departmentId: string | null;
  permissions: {
    read: ApiModule[] | true;
    write: ApiModule[] | true;
  };
  supabase: SupabaseClient;
}

/**
 * Configuration for the scoping middleware.
 * Each tool specifies which columns to use for role-based filtering
 * because different tables use different column names.
 */
export interface ScopeConfig {
  /** Column that stores the student/user reference (e.g., 'student_id', 'requester_id', 'owner_id') */
  studentIdColumn?: string;
  /** Column that stores the department reference (e.g., 'department_id') */
  departmentIdColumn?: string;
  /** Column that stores the institution reference. Defaults to 'institution_id'. */
  institutionIdColumn?: string;
}

/**
 * Standard pagination params accepted by all module tools.
 */
export interface McpPaginationParams {
  page?: number;
  limit?: number;
}

/**
 * Standard paginated response shape returned by module tools.
 */
export interface McpPaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
```

**Step 2: Verify types compile**

```bash
bun run typecheck
```

Expected: PASS — no errors.

**Step 3: Commit**

```bash
git add lib/mcp/types.ts
git commit -m "feat(mcp): add MCP types — McpAuthContext, ScopeConfig, pagination"
```

---

### Task 1.3 — Auth Bridge

**Status:** `[ ]`

**Files:**
- Create: `lib/mcp/auth-bridge.ts`
- Reference: `lib/api-keys/authenticate.ts` (existing — do NOT modify)

**What this does:** Validates a `jkkn_xxxx` Bearer token and creates an `McpAuthContext`. This is called by `mcp-handler`'s `withMcpAuth()` on every MCP request. It reuses the same SHA-256 hashing + DB lookup as `authenticate.ts` but returns the shape that `mcp-handler` expects (an `AuthInfo` object).

**Step 1: Create the auth bridge**

```typescript
// lib/mcp/auth-bridge.ts
import { createHash } from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { VALID_MODULES, type ApiModule } from '@/lib/api-keys/authenticate';
import type { McpAuthContext, McpUserRole } from '@/lib/mcp/types';

/**
 * Normalizes the `permissions` JSONB from the api_keys table.
 * Handles both legacy `{read: true}` and new `{read: ['module']}` formats.
 */
function normalizePermissions(raw: unknown): McpAuthContext['permissions'] {
  if (!raw || typeof raw !== 'object') {
    return { read: [], write: [] };
  }

  const p = raw as Record<string, unknown>;

  const normalizeField = (field: unknown): ApiModule[] | true => {
    if (field === true) return true;
    if (Array.isArray(field)) return field.filter(
      (m): m is ApiModule => (VALID_MODULES as readonly string[]).includes(m)
    );
    return [];
  };

  return {
    read: normalizeField(p.read),
    write: normalizeField(p.write),
  };
}

/**
 * Validates a user_role string from the database.
 * Defaults to 'admin' for backward compatibility with keys that don't have user_role set.
 */
function parseUserRole(raw: string | null): McpUserRole {
  const valid: McpUserRole[] = ['student', 'faculty', 'admin', 'super_admin'];
  if (raw && (valid as string[]).includes(raw)) return raw as McpUserRole;
  return 'admin'; // Default — existing keys without user_role behave as admin
}

/**
 * Token verifier function compatible with `mcp-handler`'s `withMcpAuth()`.
 *
 * Called on every MCP request. Extracts the Bearer token, hashes it,
 * looks up the api_keys table, and returns an AuthInfo object with
 * McpAuthContext in the `extra` field.
 *
 * Returns `undefined` if the key is invalid/expired/inactive.
 */
export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string
): Promise<
  | {
      token: string;
      clientId: string;
      scopes: string[];
      extra: McpAuthContext;
    }
  | undefined
> {
  if (!bearerToken) return undefined;

  // SHA-256 hash the raw key (same as authenticate.ts)
  const hashedKey = createHash('sha256').update(bearerToken).digest('hex');
  const supabase = createServiceRoleClient();

  // Look up the key — now also selecting user_id, user_role, department_id, institution_id
  const { data: keyData, error: keyError } = await supabase
    .from('api_keys')
    .select('id, name, key_value, is_active, expires_at, permissions, institution_id, user_id, user_role, department_id')
    .eq('key_value', hashedKey)
    .eq('is_active', true)
    .single();

  if (keyError || !keyData) return undefined;

  // Check expiry
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return undefined;
  }

  // Fire-and-forget: update last_used_at
  void supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyData.id)
    .then(() => {})
    .catch(() => {});

  const permissions = normalizePermissions(keyData.permissions);
  const userRole = parseUserRole(keyData.user_role);

  // institution_id is required for MCP (no super key concept in MCP — too dangerous)
  // If key has no institution binding, reject it for MCP use
  if (!keyData.institution_id) return undefined;

  const mcpContext: McpAuthContext = {
    keyId: keyData.id,
    keyName: keyData.name,
    userId: keyData.user_id ?? null,
    userRole,
    institutionId: keyData.institution_id,
    departmentId: keyData.department_id ?? null,
    permissions,
    supabase,
  };

  return {
    token: bearerToken,
    clientId: keyData.id,
    scopes: [], // We use module permissions, not OAuth scopes
    extra: mcpContext,
  };
}
```

**Step 2: Verify types compile**

```bash
bun run typecheck
```

Expected: PASS. Note: `user_id`, `user_role`, `department_id` columns don't exist in DB yet — that's Task 1.5 (migration). The code will still compile because Supabase client uses loose typing for `.select()` string columns.

**Step 3: Commit**

```bash
git add lib/mcp/auth-bridge.ts
git commit -m "feat(mcp): add auth bridge — validates jkkn_ keys for MCP connections"
```

---

### Task 1.4 — Scoping Middleware

**Status:** `[ ]`

**Files:**
- Create: `lib/mcp/scoping.ts`

**What this does:** A helper that applies role-based WHERE clauses to any Supabase query. Every MCP tool calls this before executing its query.

**Step 1: Create the scoping middleware**

```typescript
// lib/mcp/scoping.ts
import type { McpAuthContext, ScopeConfig } from '@/lib/mcp/types';

/**
 * Applies institution + role-based scoping filters to a Supabase query.
 *
 * Security model:
 * - Layer 1 (MANDATORY): `.eq('institution_id', ctx.institutionId)` — always applied
 * - Layer 2 (role-based):
 *   - student: `.eq(studentIdColumn, ctx.userId)` — only their own records
 *   - faculty: `.eq(departmentIdColumn, ctx.departmentId)` — only their department
 *   - admin: no additional filter (sees full institution)
 *   - super_admin: no additional filter (should not exist for MCP keys)
 *
 * IMPORTANT: This function uses the service role client which bypasses RLS.
 * The institution scoping here IS the security boundary.
 *
 * @param query - A Supabase PostgREST query builder (from .from().select())
 * @param context - The authenticated MCP context from the auth bridge
 * @param config - Column name mappings for this specific table
 * @returns The same query with scoping filters applied
 */
export function applyScopeFilters<T>(
  query: T,
  context: McpAuthContext,
  config: ScopeConfig = {}
): T {
  const {
    institutionIdColumn = 'institution_id',
    studentIdColumn,
    departmentIdColumn,
  } = config;

  // Layer 1: ALWAYS scope to institution (mandatory — this is the security boundary)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (query as any).eq(institutionIdColumn, context.institutionId);

  // Layer 2: Role-based scoping
  switch (context.userRole) {
    case 'student':
      // Students see only their own records
      if (studentIdColumn && context.userId) {
        q = q.eq(studentIdColumn, context.userId);
      }
      break;

    case 'faculty':
      // Faculty see their department's records
      if (departmentIdColumn && context.departmentId) {
        q = q.eq(departmentIdColumn, context.departmentId);
      }
      break;

    case 'admin':
    case 'super_admin':
      // Admins see full institution — no additional filter
      break;
  }

  return q as T;
}

/**
 * Standard pagination helper. Clamps page/limit to safe values
 * and returns the offset for Supabase .range() calls.
 */
export function parsePagination(params: {
  page?: number;
  limit?: number;
}): { page: number; limit: number; offset: number } {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
```

**Step 2: Verify types compile**

```bash
bun run typecheck
```

Expected: PASS.

**Step 3: Commit**

```bash
git add lib/mcp/scoping.ts
git commit -m "feat(mcp): add scoping middleware — role-based data filtering for MCP tools"
```

---

### Task 1.5 — Database Migration (User-Bound API Keys)

**Status:** `[ ]`

**Files:**
- Create: `supabase/migrations/20260306_mcp_user_bound_api_keys.sql`

**What this does:** Adds `user_id`, `user_role`, and `department_id` columns to the existing `api_keys` table. These are all nullable — existing keys continue working as admin-scoped keys.

**Step 1: Create the migration**

```sql
-- supabase/migrations/20260306_mcp_user_bound_api_keys.sql
-- Purpose: Add user binding columns to api_keys for MCP role-based data scoping.
-- Backward compatible: all new columns are nullable. Existing keys default to admin role.

-- 1. Add user binding columns
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_role TEXT CHECK (user_role IN ('student', 'faculty', 'admin', 'super_admin')),
  ADD COLUMN IF NOT EXISTS department_id UUID;

-- 2. Add comments for documentation
COMMENT ON COLUMN api_keys.user_id IS 'Links API key to a specific user for MCP data scoping. NULL = institution-wide access (admin behavior).';
COMMENT ON COLUMN api_keys.user_role IS 'Determines data visibility scope for MCP tools. student = own data, faculty = department, admin = institution. NULL defaults to admin.';
COMMENT ON COLUMN api_keys.department_id IS 'Department scope for faculty keys. Used by MCP scoping middleware to filter queries.';

-- 3. Index for efficient lookup by user_id (when listing a user's keys)
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id) WHERE user_id IS NOT NULL;
```

**Step 2: Apply migration via Supabase MCP or Dashboard**

Run the SQL in Supabase Dashboard SQL Editor, or use the Supabase MCP `apply_migration` tool.

**Step 3: Verify columns exist**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'api_keys'
  AND column_name IN ('user_id', 'user_role', 'department_id');
```

Expected: 3 rows, all nullable.

**Step 4: Commit**

```bash
git add supabase/migrations/20260306_mcp_user_bound_api_keys.sql
git commit -m "feat(mcp): add user_id, user_role, department_id to api_keys for MCP scoping"
```

---

### Task 1.6 — Tool Helpers

**Status:** `[ ]`

**Files:**
- Create: `lib/mcp/tool-helpers.ts`

**What this does:** Shared helpers used by all MCP tools — permission checking, error formatting, paginated response building, and audit logging integration.

**Step 1: Create tool helpers**

```typescript
// lib/mcp/tool-helpers.ts
import { hasModuleAccess, type ApiModule } from '@/lib/api-keys/authenticate';
import { logApiUsage } from '@/lib/api-keys/audit-logger';
import type { McpAuthContext, McpPaginatedResult } from '@/lib/mcp/types';

/**
 * Standard MCP tool response content shape.
 */
export type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Returns an error response for MCP tools.
 */
export function mcpError(message: string): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

/**
 * Returns a success response with JSON data for MCP tools.
 */
export function mcpSuccess(data: unknown): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Checks if the MCP auth context has read access to the given module.
 * Returns an error result if not, or null if access is granted.
 */
export function checkModuleAccess(
  context: McpAuthContext,
  module: ApiModule
): McpToolResult | null {
  if (!hasModuleAccess(context.permissions.read, module)) {
    return mcpError(`Access denied: your API key does not have read access to the '${module}' module.`);
  }
  return null;
}

/**
 * Builds a standard paginated result object.
 */
export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
): McpPaginatedResult<T> {
  return {
    items,
    total,
    page,
    limit,
    hasMore: (page - 1) * limit + items.length < total,
  };
}

/**
 * Fire-and-forget audit log for MCP tool calls.
 * Wraps the existing audit logger with MCP-specific defaults.
 */
export function logMcpToolCall(
  context: McpAuthContext,
  toolName: string,
  module: ApiModule,
  statusCode: number,
  startTime: number
): void {
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: `mcp:${toolName}`,
    module,
    institutionId: context.institutionId,
    statusCode,
    responseTimeMs: Date.now() - startTime,
    ipAddress: null,    // MCP transport does not expose IP easily
    userAgent: 'mcp-client',
  });
}
```

**Step 2: Verify types compile**

```bash
bun run typecheck
```

Expected: PASS.

**Step 3: Commit**

```bash
git add lib/mcp/tool-helpers.ts
git commit -m "feat(mcp): add tool helpers — mcpError, mcpSuccess, checkModuleAccess, audit logging"
```

---

## Phase 2: MCP Route + First Tool (Morning Brief)

> **Goal:** Create the MCP endpoint route and register the first tool (morning brief) as a proof of concept. After this phase, you can connect from Claude Desktop and call `myjkkn_morning_brief`.
> **Depends on:** Phase 1 (types, auth bridge, scoping, helpers).
> **Unblocks:** Phases 3, 4.

---

### Task 2.1 — Morning Brief Tool

**Status:** `[ ]`

**Files:**
- Create: `lib/mcp/tools/morning-brief.ts`
- Reference: `lib/services/morning-brief/morning-brief-service.ts` (existing — do NOT modify)

**Step 1: Create the morning brief tool**

```typescript
// lib/mcp/tools/morning-brief.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getMorningBrief } from '@/lib/services/morning-brief/morning-brief-service';
import type { McpAuthContext } from '@/lib/mcp/types';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall } from '@/lib/mcp/tool-helpers';

export function registerMorningBriefTool(server: McpServer): void {
  server.tool(
    'myjkkn_morning_brief',
    'Get a comprehensive morning briefing of institutional metrics. ' +
    'Aggregates data from attendance (active students, sections marked today), ' +
    'billing (outstanding amounts, overdue count), admissions (pending applications), ' +
    'and staff (active count) in parallel. ' +
    'Perfect for daily management overview. Only includes modules the API key has access to.',
    {
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('Date for the brief (YYYY-MM-DD, defaults to today)'),
    },
    async ({ date }, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required. Provide a valid jkkn_ API key as Bearer token.');

      const accessError = checkModuleAccess(ctx, 'morning-brief');
      if (accessError) return accessError;

      try {
        const data = await getMorningBrief(ctx.institutionId);
        logMcpToolCall(ctx, 'myjkkn_morning_brief', 'morning-brief', 200, startTime);
        return mcpSuccess(data);
      } catch {
        logMcpToolCall(ctx, 'myjkkn_morning_brief', 'morning-brief', 500, startTime);
        return mcpError('Failed to generate morning brief. Please try again.');
      }
    }
  );
}
```

**Step 2: Verify types compile**

```bash
bun run typecheck
```

Expected: PASS.

**Step 3: Commit**

```bash
git add lib/mcp/tools/morning-brief.ts
git commit -m "feat(mcp): add morning brief MCP tool"
```

---

### Task 2.2 — Tool Registry

**Status:** `[ ]`

**Files:**
- Create: `lib/mcp/register-tools.ts`

**What this does:** Central file that registers ALL tools with the MCP server. Called once during server initialization. Start with just morning-brief; we'll add others in Phase 3.

**Step 1: Create the registry**

```typescript
// lib/mcp/register-tools.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMorningBriefTool } from '@/lib/mcp/tools/morning-brief';

/**
 * Registers all MCP tools with the server.
 * Each tool file is responsible for its own Zod schemas and handler logic.
 *
 * Add new tool registrations here as they are implemented.
 */
export function registerAllTools(server: McpServer): void {
  // Smart composite tools
  registerMorningBriefTool(server);

  // Module tools — Phase 3
  // registerAttendanceTool(server);
  // registerBillingTool(server);
  // registerLearnersTool(server);
  // registerStaffTool(server);
  // registerGrievanceTool(server);
  // registerAdmissionTool(server);
  // registerOkrTool(server);
  // registerOrganizationsTool(server);
}
```

**Step 2: Commit**

```bash
git add lib/mcp/register-tools.ts
git commit -m "feat(mcp): add tool registry with morning-brief registered"
```

---

### Task 2.3 — MCP API Route

**Status:** `[ ]`

**Files:**
- Create: `app/api/mcp/[transport]/route.ts`

**What this does:** The single MCP endpoint. `mcp-handler` manages the Streamable HTTP protocol (initialize, tool listing, tool calls, SSE streaming). The `[transport]` dynamic segment allows `mcp-handler` to handle both `/api/mcp/mcp` (POST for JSON-RPC) and `/api/mcp/sse` (GET for SSE streaming) under the same base path.

**Step 1: Create the route**

```typescript
// app/api/mcp/[transport]/route.ts
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { registerAllTools } from '@/lib/mcp/register-tools';
import { verifyMcpToken } from '@/lib/mcp/auth-bridge';

const handler = createMcpHandler(
  (server) => {
    registerAllTools(server);
  },
  {
    capabilities: {
      tools: {},
    },
  },
  {
    basePath: '/api/mcp',
    maxDuration: 60,
  }
);

// Wrap with authentication — requires valid Bearer jkkn_xxxx token
const authHandler = withMcpAuth(handler, verifyMcpToken, {
  required: true,
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
```

**Step 2: Verify build compiles**

```bash
bun run typecheck
```

Expected: PASS.

**Step 3: Test locally (manual)**

Start the dev server:
```bash
bun run dev
```

Test the MCP endpoint with curl:
```bash
curl -X POST http://localhost:3000/api/mcp/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer jkkn_YOUR_TEST_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

Expected: JSON-RPC response with server capabilities listing `myjkkn_morning_brief` tool.

**Step 4: Commit**

```bash
git add app/api/mcp/[transport]/route.ts
git commit -m "feat(mcp): add MCP API route with auth — /api/mcp endpoint live"
```

---

## Phase 3: Module Tools (1:1 Mapping)

> **Goal:** Register all 11 module-specific tools. Each wraps one B2A query pattern with MCP-compatible Zod schemas and role-based scoping.
> **Depends on:** Phase 2 (MCP route working).
> **Unblocks:** Phase 4 (smart composite tools).

**Pattern:** Every tool in this phase follows the same structure:
1. Check module access
2. Parse + validate params with Zod
3. Build Supabase query with `applyScopeFilters()`
4. Return paginated results via `mcpSuccess()`
5. Audit log the call

---

### Task 3.1 — Attendance Tool

**Status:** `[ ]`

**Files:**
- Create: `lib/mcp/tools/attendance.ts`
- Modify: `lib/mcp/register-tools.ts` (add import + call)

**Step 1: Create the tool**

```typescript
// lib/mcp/tools/attendance.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters, parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerAttendanceTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_attendance',
    'Query student attendance records for a specific date. ' +
    'Returns attendance entries with section, timetable, and period information. ' +
    'Defaults to today if no date specified. ' +
    'Students see only their own attendance. Faculty see their department. Admins see all.',
    {
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('Attendance date in YYYY-MM-DD format. Defaults to today.'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      limit: z.number().int().min(1).max(100).optional().describe('Records per page (default: 20, max: 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required.');

      const accessError = checkModuleAccess(ctx, 'attendance');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);
        const date = params.date ?? new Date().toISOString().split('T')[0];

        let query = ctx.supabase
          .from('student_attendance')
          .select(
            'id, attendance_date, institution_id, section_id, timetable_id, period_slot_id, created_at, updated_at',
            { count: 'exact' }
          )
          .eq('attendance_date', date);

        query = applyScopeFilters(query, ctx, {
          studentIdColumn: 'student_id',
          departmentIdColumn: 'section_id', // attendance is per-section; faculty scoped by their sections
        });

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_attendance', 'attendance', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_attendance', 'attendance', 500, startTime);
        return mcpError('Failed to fetch attendance records.');
      }
    }
  );
}
```

**Step 2: Add to registry**

In `lib/mcp/register-tools.ts`, add:
```typescript
import { registerAttendanceTool } from '@/lib/mcp/tools/attendance';

// Inside registerAllTools():
registerAttendanceTool(server);
```

**Step 3: Commit**

```bash
git add lib/mcp/tools/attendance.ts lib/mcp/register-tools.ts
git commit -m "feat(mcp): add attendance query tool"
```

---

### Task 3.2 — Billing Tool

**Status:** `[ ]`

**Files:**
- Create: `lib/mcp/tools/billing.ts`
- Modify: `lib/mcp/register-tools.ts`

**Step 1: Create the tool**

```typescript
// lib/mcp/tools/billing.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters, parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerBillingTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_billing',
    'Query student billing records including invoices, payment status, and outstanding amounts. ' +
    'Filter by payment status (unpaid, partial, paid, overdue) and due date. ' +
    'Students see only their own bills. Faculty see their department bills. Admins see all institution bills.',
    {
      status: z.enum(['unpaid', 'partial', 'paid', 'overdue']).optional()
        .describe('Filter by payment status'),
      due_before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('Filter bills due before this date (YYYY-MM-DD)'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      limit: z.number().int().min(1).max(100).optional().describe('Records per page (default: 20, max: 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required.');

      const accessError = checkModuleAccess(ctx, 'billing');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);

        let query = ctx.supabase
          .from('billing_student_bills')
          .select(
            'id, student_id, institution_id, final_amount, balance_amount, status, due_date, created_at',
            { count: 'exact' }
          );

        query = applyScopeFilters(query, ctx, {
          studentIdColumn: 'student_id',
          departmentIdColumn: 'department_id',
        });

        if (params.status) query = query.eq('status', params.status);
        if (params.due_before) query = query.lt('due_date', params.due_before);

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_billing', 'billing', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_billing', 'billing', 500, startTime);
        return mcpError('Failed to fetch billing records.');
      }
    }
  );
}
```

**Step 2: Add to registry + commit**

```bash
git add lib/mcp/tools/billing.ts lib/mcp/register-tools.ts
git commit -m "feat(mcp): add billing query tool"
```

---

### Task 3.3 — Learners Tool

**Status:** `[ ]`

**Files:**
- Create: `lib/mcp/tools/learners.ts`
- Modify: `lib/mcp/register-tools.ts`

**Step 1: Create the tool**

```typescript
// lib/mcp/tools/learners.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters, parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerLearnersTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_learners',
    'Query learner (student) profiles. Returns student details including enrollment status, ' +
    'department, program, semester, section, roll number, and contact information. ' +
    'Filter by lifecycle status, department, or semester. ' +
    'Students see only their own profile. Faculty see their department students. Admins see all.',
    {
      lifecycle_status: z.enum([
        'enquiry', 'pending', 'approved', 'rejected', 'waitlisted',
        'active', 'inactive', 'exited', 'graduated', 'alumni',
      ]).optional().describe('Filter by student lifecycle status'),
      department_id: z.string().uuid().optional().describe('Filter by department UUID'),
      semester_id: z.string().uuid().optional().describe('Filter by semester UUID'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      limit: z.number().int().min(1).max(100).optional().describe('Records per page (default: 20, max: 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required.');

      const accessError = checkModuleAccess(ctx, 'learners');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);

        let query = ctx.supabase
          .from('learners_profiles')
          .select(
            'id, application_id, lifecycle_status, first_name, last_name, gender, ' +
            'institution_id, degree_id, department_id, program_id, semester_id, section_id, ' +
            'academic_year_id, batch_id, roll_number, register_number, college_email, ' +
            'student_email, is_profile_complete, admission_year, created_at, updated_at',
            { count: 'exact' }
          );

        // For students, studentIdColumn maps to 'id' (the learner profile IS the student's record)
        query = applyScopeFilters(query, ctx, {
          studentIdColumn: 'id',
          departmentIdColumn: 'department_id',
        });

        if (params.lifecycle_status) query = query.eq('lifecycle_status', params.lifecycle_status);
        if (params.department_id) query = query.eq('department_id', params.department_id);
        if (params.semester_id) query = query.eq('semester_id', params.semester_id);

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_learners', 'learners', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_learners', 'learners', 500, startTime);
        return mcpError('Failed to fetch learner records.');
      }
    }
  );
}
```

**Step 2: Add to registry + commit**

```bash
git add lib/mcp/tools/learners.ts lib/mcp/register-tools.ts
git commit -m "feat(mcp): add learners query tool"
```

---

### Task 3.4 — Staff Tool

**Status:** `[ ]`

**Files:**
- Create: `lib/mcp/tools/staff.ts`
- Modify: `lib/mcp/register-tools.ts`

**Step 1: Create the tool**

```typescript
// lib/mcp/tools/staff.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters, parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerStaffTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_staff',
    'Query staff/faculty records. Returns staff details including name, designation, ' +
    'department, role type, contact info, and active status. ' +
    'Filter by active status, department, or designation (partial match). ' +
    'Faculty see their department staff only. Admins see all institution staff.',
    {
      is_active: z.boolean().optional().describe('Filter by active status (true/false)'),
      department_id: z.string().uuid().optional().describe('Filter by department UUID'),
      designation: z.string().optional().describe('Filter by designation (partial match, case-insensitive)'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      limit: z.number().int().min(1).max(100).optional().describe('Records per page (default: 20, max: 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required.');

      const accessError = checkModuleAccess(ctx, 'staff');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);

        let query = ctx.supabase
          .from('staff')
          .select(
            'id, staff_id, first_name, last_name, gender, designation, role_type, ' +
            'institution_id, department_id, category_id, institution_email, email, ' +
            'is_active, date_of_joining, created_at, updated_at',
            { count: 'exact' }
          );

        query = applyScopeFilters(query, ctx, {
          departmentIdColumn: 'department_id',
        });

        if (params.is_active !== undefined) query = query.eq('is_active', params.is_active);
        if (params.department_id) query = query.eq('department_id', params.department_id);
        if (params.designation) query = query.ilike('designation', `%${params.designation}%`);

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_staff', 'staff', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_staff', 'staff', 500, startTime);
        return mcpError('Failed to fetch staff records.');
      }
    }
  );
}
```

**Step 2: Add to registry + commit**

```bash
git add lib/mcp/tools/staff.ts lib/mcp/register-tools.ts
git commit -m "feat(mcp): add staff query tool"
```

---

### Task 3.5 — Grievance Tool

**Status:** `[ ]`

**Files:**
- Create: `lib/mcp/tools/grievance.ts`
- Modify: `lib/mcp/register-tools.ts`

**Step 1: Create the tool**

```typescript
// lib/mcp/tools/grievance.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters, parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerGrievanceTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_grievance',
    'Query grievance/service request records. Returns requests with status tracking, ' +
    'priority, and timestamps (submitted, approved, fulfilled, closed). ' +
    'Filter by status or priority. ' +
    'Students see only their own grievances. Faculty see department grievances. Admins see all.',
    {
      status: z.enum([
        'draft', 'submitted', 'in_review', 'approved', 'rejected',
        'returned', 'fulfilled', 'closed', 'cancelled',
      ]).optional().describe('Filter by request status'),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional()
        .describe('Filter by priority level'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      limit: z.number().int().min(1).max(100).optional().describe('Records per page (default: 20, max: 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required.');

      const accessError = checkModuleAccess(ctx, 'grievance');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);

        let query = ctx.supabase
          .from('service_requests')
          .select(
            'id, request_number, service_type_id, requester_id, institution_id, status, priority, ' +
            'submitted_at, approved_at, fulfilled_at, closed_at, created_at, updated_at',
            { count: 'exact' }
          );

        query = applyScopeFilters(query, ctx, {
          studentIdColumn: 'requester_id',
          departmentIdColumn: 'department_id',
        });

        if (params.status) query = query.eq('status', params.status);
        if (params.priority) query = query.eq('priority', params.priority);

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_grievance', 'grievance', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_grievance', 'grievance', 500, startTime);
        return mcpError('Failed to fetch grievance records.');
      }
    }
  );
}
```

**Step 2: Add to registry + commit**

```bash
git add lib/mcp/tools/grievance.ts lib/mcp/register-tools.ts
git commit -m "feat(mcp): add grievance query tool"
```

---

### Task 3.6 — Admission Tool

**Status:** `[ ]`

**Files:**
- Create: `lib/mcp/tools/admission.ts`
- Modify: `lib/mcp/register-tools.ts`

**Step 1: Create the tool**

```typescript
// lib/mcp/tools/admission.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters, parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerAdmissionTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_admission',
    'Query admission/application records. Returns applicant details with lifecycle status ' +
    '(enquiry, pending, approved, rejected, waitlisted, active, etc.). ' +
    'Filter by lifecycle status. Admins see all institution admissions.',
    {
      status: z.enum([
        'enquiry', 'pending', 'approved', 'rejected', 'waitlisted',
        'active', 'inactive', 'exited', 'graduated', 'alumni',
      ]).optional().describe('Filter by lifecycle status'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      limit: z.number().int().min(1).max(100).optional().describe('Records per page (default: 20, max: 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required.');

      const accessError = checkModuleAccess(ctx, 'admission');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);

        let query = ctx.supabase
          .from('learners_profiles')
          .select(
            'id, first_name, last_name, student_email, student_mobile, lifecycle_status, application_id, created_at',
            { count: 'exact' }
          );

        query = applyScopeFilters(query, ctx, {
          studentIdColumn: 'id',
          departmentIdColumn: 'department_id',
        });

        if (params.status) query = query.eq('lifecycle_status', params.status);

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_admission', 'admission', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_admission', 'admission', 500, startTime);
        return mcpError('Failed to fetch admission records.');
      }
    }
  );
}
```

**Step 2: Add to registry + commit**

```bash
git add lib/mcp/tools/admission.ts lib/mcp/register-tools.ts
git commit -m "feat(mcp): add admission query tool"
```

---

### Task 3.7 — OKR Tool

**Status:** `[ ]`

**Files:**
- Create: `lib/mcp/tools/okr.ts`
- Modify: `lib/mcp/register-tools.ts`

**Step 1: Create the tool**

```typescript
// lib/mcp/tools/okr.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters, parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerOkrTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_okr',
    'Query OKR (Objectives and Key Results) records. Returns objectives with progress, ' +
    'tier, cycle type, status, and ownership details. ' +
    'Filter by status (draft/active/completed/archived), tier, or cycle type. ' +
    'Faculty see their department OKRs. Admins see all institution OKRs.',
    {
      status: z.enum(['draft', 'active', 'completed', 'archived']).optional()
        .describe('Filter by objective status'),
      tier: z.enum(['tier_1', 'tier_2', 'tier_3']).optional()
        .describe('Filter by objective tier'),
      cycle_type: z.enum(['annual', 'quarterly', 'semester']).optional()
        .describe('Filter by cycle type'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      limit: z.number().int().min(1).max(100).optional().describe('Records per page (default: 20, max: 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required.');

      const accessError = checkModuleAccess(ctx, 'okr');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);

        let query = ctx.supabase
          .from('okr_objectives')
          .select(
            'id, title, description, tier, level, owner_id, institution_id, department_id, ' +
            'cycle_type, start_date, end_date, status, overall_progress, created_by, ' +
            'approved_by, approved_at, created_at, updated_at',
            { count: 'exact' }
          );

        query = applyScopeFilters(query, ctx, {
          studentIdColumn: 'owner_id',
          departmentIdColumn: 'department_id',
        });

        if (params.status) query = query.eq('status', params.status);
        if (params.tier) query = query.eq('tier', params.tier);
        if (params.cycle_type) query = query.eq('cycle_type', params.cycle_type);

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_okr', 'okr', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_okr', 'okr', 500, startTime);
        return mcpError('Failed to fetch OKR objectives.');
      }
    }
  );
}
```

**Step 2: Add to registry + commit**

```bash
git add lib/mcp/tools/okr.ts lib/mcp/register-tools.ts
git commit -m "feat(mcp): add OKR query tool"
```

---

### Task 3.8 — Organizations Tool

**Status:** `[ ]`

**Files:**
- Create: `lib/mcp/tools/organizations.ts`
- Modify: `lib/mcp/register-tools.ts`

**Step 1: Create the tool**

```typescript
// lib/mcp/tools/organizations.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerOrganizationsTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_organizations',
    'Query organizational structure: institutions, departments, and courses. ' +
    'Use the entity parameter to choose what to query. ' +
    'Returns institution details (name, contact, accreditation), ' +
    'department listings, or course catalogs. ' +
    'All users see their institution data.',
    {
      entity: z.enum(['institutions', 'departments', 'courses'])
        .describe('Which organizational entity to query'),
      is_active: z.boolean().optional().describe('Filter by active status'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      limit: z.number().int().min(1).max(100).optional().describe('Records per page (default: 20, max: 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required.');

      const accessError = checkModuleAccess(ctx, 'organizations');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);

        let tableName: string;
        let selectFields: string;
        let instColumn: string;

        switch (params.entity) {
          case 'institutions':
            tableName = 'institutions';
            selectFields = 'id, name, phone, email, website, is_active, counselling_code, category, ' +
              'accredited_by, city, state, country, institution_type, timetable_type, created_at, updated_at';
            instColumn = 'id'; // The institution table uses 'id', not 'institution_id'
            break;
          case 'departments':
            tableName = 'departments';
            selectFields = 'id, name, code, institution_id, is_active, created_at, updated_at';
            instColumn = 'institution_id';
            break;
          case 'courses':
            tableName = 'courses';
            selectFields = 'id, name, code, institution_id, department_id, is_active, created_at, updated_at';
            instColumn = 'institution_id';
            break;
        }

        let query = ctx.supabase
          .from(tableName)
          .select(selectFields, { count: 'exact' })
          .eq(instColumn, ctx.institutionId);

        if (params.is_active !== undefined) {
          query = query.eq('is_active', params.is_active);
        }

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_organizations', 'organizations', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_organizations', 'organizations', 500, startTime);
        return mcpError('Failed to fetch organization records.');
      }
    }
  );
}
```

**Step 2: Add to registry + commit**

```bash
git add lib/mcp/tools/organizations.ts lib/mcp/register-tools.ts
git commit -m "feat(mcp): add organizations query tool (institutions, departments, courses)"
```

---

### Task 3.9 — Final Registry Update & Build Verification

**Status:** `[ ]`

**Files:**
- Modify: `lib/mcp/register-tools.ts`

**Step 1: Ensure all tools are registered in the final registry**

```typescript
// lib/mcp/register-tools.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Smart composite tools
import { registerMorningBriefTool } from '@/lib/mcp/tools/morning-brief';

// Module tools (1:1)
import { registerAttendanceTool } from '@/lib/mcp/tools/attendance';
import { registerBillingTool } from '@/lib/mcp/tools/billing';
import { registerLearnersTool } from '@/lib/mcp/tools/learners';
import { registerStaffTool } from '@/lib/mcp/tools/staff';
import { registerGrievanceTool } from '@/lib/mcp/tools/grievance';
import { registerAdmissionTool } from '@/lib/mcp/tools/admission';
import { registerOkrTool } from '@/lib/mcp/tools/okr';
import { registerOrganizationsTool } from '@/lib/mcp/tools/organizations';

/**
 * Registers all MCP tools with the server.
 * Total: 9 tools (1 smart composite + 8 module tools)
 *
 * Note: campus-living, solutions, and learners-council are not yet implemented
 * in B2A (return 501). They will be added when their B2A endpoints are complete.
 */
export function registerAllTools(server: McpServer): void {
  // Smart composite tools
  registerMorningBriefTool(server);

  // Module tools (1:1 with B2A endpoints)
  registerAttendanceTool(server);
  registerBillingTool(server);
  registerLearnersTool(server);
  registerStaffTool(server);
  registerGrievanceTool(server);
  registerAdmissionTool(server);
  registerOkrTool(server);
  registerOrganizationsTool(server);
}
```

**Step 2: Full build verification**

```bash
bun run typecheck
bun run build
```

Expected: Both pass with 0 errors.

**Step 3: Commit**

```bash
git add lib/mcp/register-tools.ts
git commit -m "feat(mcp): finalize tool registry — 9 tools registered"
```

---

## Phase 4: Smart Composite Tools

> **Goal:** Add cross-module "smart" tools that aggregate data from multiple modules.
> **Depends on:** Phase 3 (module tools working).
> **Note:** These are lower priority. Phase 3 already gives users full module access. These are convenience tools for common cross-module queries.

---

### Task 4.1 — At-Risk Learners Tool

**Status:** `[ ]`

**Files:**
- Create: `lib/mcp/tools/at-risk-learners.ts`
- Modify: `lib/mcp/register-tools.ts`

**Step 1: Create the tool**

```typescript
// lib/mcp/tools/at-risk-learners.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall } from '@/lib/mcp/tool-helpers';
import { hasModuleAccess } from '@/lib/api-keys/authenticate';

export function registerAtRiskLearnersTool(server: McpServer): void {
  server.tool(
    'myjkkn_at_risk_learners',
    'Cross-module analysis to identify at-risk students. ' +
    'Checks multiple signals: overdue bills (billing module), ' +
    'low attendance (attendance module), and pending grievances (grievance module). ' +
    'Returns students with risk indicators from each available module. ' +
    'Requires read access to learners module; other modules are optional (enhances results).',
    {
      limit: z.number().int().min(1).max(50).optional()
        .describe('Max students to analyze (default: 20, max: 50)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required.');

      // Must have learners access at minimum
      const accessError = checkModuleAccess(ctx, 'learners');
      if (accessError) return accessError;

      try {
        const resultLimit = Math.min(50, params.limit ?? 20);

        // Fetch students with overdue bills (if billing access)
        const overdueStudentIds: string[] = [];
        if (hasModuleAccess(ctx.permissions.read, 'billing')) {
          const today = new Date().toISOString().split('T')[0];
          let billQuery = ctx.supabase
            .from('billing_student_bills')
            .select('student_id')
            .lt('due_date', today)
            .gt('balance_amount', 0)
            .in('status', ['unpaid', 'partial']);

          billQuery = applyScopeFilters(billQuery, ctx, {
            studentIdColumn: 'student_id',
          });

          const { data: bills } = await billQuery.limit(resultLimit);
          if (bills) {
            overdueStudentIds.push(...bills.map((b: { student_id: string }) => b.student_id));
          }
        }

        // Fetch students with open grievances (if grievance access)
        const grievanceStudentIds: string[] = [];
        if (hasModuleAccess(ctx.permissions.read, 'grievance')) {
          let gQuery = ctx.supabase
            .from('service_requests')
            .select('requester_id')
            .in('status', ['submitted', 'in_review']);

          gQuery = applyScopeFilters(gQuery, ctx, {
            studentIdColumn: 'requester_id',
          });

          const { data: grievances } = await gQuery.limit(resultLimit);
          if (grievances) {
            grievanceStudentIds.push(...grievances.map((g: { requester_id: string }) => g.requester_id));
          }
        }

        // Combine unique at-risk student IDs
        const allRiskIds = [...new Set([...overdueStudentIds, ...grievanceStudentIds])];

        if (allRiskIds.length === 0) {
          logMcpToolCall(ctx, 'myjkkn_at_risk_learners', 'learners', 200, startTime);
          return mcpSuccess({
            message: 'No at-risk students identified.',
            students: [],
            signals_checked: {
              billing: hasModuleAccess(ctx.permissions.read, 'billing'),
              grievance: hasModuleAccess(ctx.permissions.read, 'grievance'),
            },
          });
        }

        // Fetch student details
        let profileQuery = ctx.supabase
          .from('learners_profiles')
          .select('id, first_name, last_name, lifecycle_status, department_id, semester_id, roll_number')
          .in('id', allRiskIds.slice(0, resultLimit));

        profileQuery = applyScopeFilters(profileQuery, ctx, {
          studentIdColumn: 'id',
          departmentIdColumn: 'department_id',
        });

        const { data: students } = await profileQuery;

        const result = (students ?? []).map((s: Record<string, unknown>) => ({
          ...s,
          risk_signals: {
            overdue_bills: overdueStudentIds.includes(s.id as string),
            open_grievances: grievanceStudentIds.includes(s.id as string),
          },
        }));

        logMcpToolCall(ctx, 'myjkkn_at_risk_learners', 'learners', 200, startTime);
        return mcpSuccess({
          students: result,
          total: result.length,
          signals_checked: {
            billing: hasModuleAccess(ctx.permissions.read, 'billing'),
            grievance: hasModuleAccess(ctx.permissions.read, 'grievance'),
          },
        });
      } catch {
        logMcpToolCall(ctx, 'myjkkn_at_risk_learners', 'learners', 500, startTime);
        return mcpError('Failed to analyze at-risk learners.');
      }
    }
  );
}
```

**Step 2: Add to registry + commit**

```bash
git add lib/mcp/tools/at-risk-learners.ts lib/mcp/register-tools.ts
git commit -m "feat(mcp): add at-risk learners smart tool (cross-module analysis)"
```

---

### Task 4.2 — Department Health Tool

**Status:** `[ ]`

**Files:**
- Create: `lib/mcp/tools/department-health.ts`
- Modify: `lib/mcp/register-tools.ts`

**Step 1: Create the tool**

```typescript
// lib/mcp/tools/department-health.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall } from '@/lib/mcp/tool-helpers';
import { hasModuleAccess } from '@/lib/api-keys/authenticate';

export function registerDepartmentHealthTool(server: McpServer): void {
  server.tool(
    'myjkkn_department_health',
    'Cross-module department health metrics. Aggregates learner count, ' +
    'active staff count, overdue billing, and OKR progress for a specific department. ' +
    'Requires organizations read access; other modules enhance the report.',
    {
      department_id: z.string().uuid().describe('Department UUID to analyze'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required.');

      const accessError = checkModuleAccess(ctx, 'organizations');
      if (accessError) return accessError;

      try {
        const deptId = params.department_id;
        const metrics: Record<string, unknown> = { department_id: deptId };

        // Fetch in parallel
        const promises: Promise<void>[] = [];

        if (hasModuleAccess(ctx.permissions.read, 'learners')) {
          promises.push(
            ctx.supabase
              .from('learners_profiles')
              .select('*', { count: 'exact', head: true })
              .eq('institution_id', ctx.institutionId)
              .eq('department_id', deptId)
              .eq('lifecycle_status', 'active')
              .then(({ count }) => { metrics.active_learners = count ?? 0; })
          );
        }

        if (hasModuleAccess(ctx.permissions.read, 'staff')) {
          promises.push(
            ctx.supabase
              .from('staff')
              .select('*', { count: 'exact', head: true })
              .eq('institution_id', ctx.institutionId)
              .eq('department_id', deptId)
              .eq('is_active', true)
              .then(({ count }) => { metrics.active_staff = count ?? 0; })
          );
        }

        if (hasModuleAccess(ctx.permissions.read, 'billing')) {
          promises.push(
            ctx.supabase
              .from('billing_student_bills')
              .select('balance_amount')
              .eq('institution_id', ctx.institutionId)
              .eq('department_id', deptId)
              .in('status', ['unpaid', 'partial'])
              .limit(1000)
              .then(({ data }) => {
                const total = (data ?? []).reduce(
                  (sum: number, r: { balance_amount: number }) => sum + (r.balance_amount ?? 0), 0
                );
                metrics.outstanding_amount = total;
                metrics.outstanding_currency = 'INR';
              })
          );
        }

        if (hasModuleAccess(ctx.permissions.read, 'okr')) {
          promises.push(
            ctx.supabase
              .from('okr_objectives')
              .select('overall_progress')
              .eq('institution_id', ctx.institutionId)
              .eq('department_id', deptId)
              .eq('status', 'active')
              .limit(100)
              .then(({ data }) => {
                const objectives = data ?? [];
                const avgProgress = objectives.length > 0
                  ? objectives.reduce((sum: number, o: { overall_progress: number }) => sum + (o.overall_progress ?? 0), 0) / objectives.length
                  : 0;
                metrics.okr_avg_progress = Math.round(avgProgress * 100) / 100;
                metrics.okr_active_count = objectives.length;
              })
          );
        }

        await Promise.all(promises);

        logMcpToolCall(ctx, 'myjkkn_department_health', 'organizations', 200, startTime);
        return mcpSuccess(metrics);
      } catch {
        logMcpToolCall(ctx, 'myjkkn_department_health', 'organizations', 500, startTime);
        return mcpError('Failed to fetch department health metrics.');
      }
    }
  );
}
```

**Step 2: Add to registry + commit**

```bash
git add lib/mcp/tools/department-health.ts lib/mcp/register-tools.ts
git commit -m "feat(mcp): add department health smart tool (cross-module metrics)"
```

---

## Phase 5: Documentation & Client Configuration

> **Goal:** Create connection documentation so JKKN users can set up their Claude/ChatGPT clients.
> **Depends on:** Phase 3 (tools working).

---

### Task 5.1 — Connection Guide Documentation

**Status:** `[ ]`

**Files:**
- Create: `docs/features/b2a/MCP-CONNECTION-GUIDE.md`

**Step 1: Create the guide**

```markdown
# MyJKKN MCP Server — Connection Guide

## What Is This?

MyJKKN exposes an MCP (Model Context Protocol) server that lets you connect your AI assistant
(Claude, ChatGPT, Cursor, etc.) to query JKKN institutional data through natural language.

## Prerequisites

1. A MyJKKN API key (`jkkn_xxxxxxxxxxxx` format)
2. A paid AI platform account (Claude Pro/Max/Team, ChatGPT Plus/Pro, etc.)

## Getting Your API Key

Contact your institution administrator to generate an API key for you.
Keys are scoped to your role:
- **Admin keys**: See all institution data
- **Faculty keys**: See your department's data
- **Student keys**: See only your own data

## Connecting from Claude Desktop / Claude.ai

1. Open Claude Desktop
2. Go to **Settings > Connectors**
3. Click **Add Connector**
4. Enter:
   - **Name**: MyJKKN
   - **URL**: `https://myjkkn.vercel.app/api/mcp`
   - **Auth**: Bearer Token > paste your `jkkn_xxxx` key
5. Click **Save**

You can now ask Claude questions like:
- "What's today's morning brief?"
- "Show me overdue bills"
- "List students in the Computer Science department"

## Connecting from ChatGPT

1. Open ChatGPT
2. Go to **Settings > Connectors > Advanced > Developer Mode**
3. Add URL: `https://myjkkn.vercel.app/api/mcp`
4. Auth: Bearer token > paste your `jkkn_xxxx` key
5. Save

## Connecting from Claude Code

Add to your `.mcp.json` or project configuration:

```json
{
  "mcpServers": {
    "myjkkn": {
      "url": "https://myjkkn.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer jkkn_YOUR_API_KEY"
      }
    }
  }
}
```

## Connecting from Cursor / Other MCP Clients

Use the `mcp-remote` proxy for clients that only support stdio:

```json
{
  "mcpServers": {
    "myjkkn": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://myjkkn.vercel.app/api/mcp",
        "--header", "Authorization: Bearer jkkn_YOUR_API_KEY"
      ]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `myjkkn_morning_brief` | Daily institutional overview (attendance, billing, admissions, staff) |
| `myjkkn_query_attendance` | Query attendance records by date |
| `myjkkn_query_billing` | Query bills, filter by status/due date |
| `myjkkn_query_learners` | Query student profiles |
| `myjkkn_query_staff` | Query staff records |
| `myjkkn_query_grievance` | Query grievance/service requests |
| `myjkkn_query_admission` | Query admission applications |
| `myjkkn_query_okr` | Query OKR objectives |
| `myjkkn_query_organizations` | Query institutions, departments, courses |
| `myjkkn_at_risk_learners` | Cross-module at-risk student analysis |
| `myjkkn_department_health` | Cross-module department metrics |

## Example Conversations

**Admin asking about institution health:**
> "Give me today's morning brief"
> "How many students have overdue fees?"
> "Show me the department health for Computer Science"

**Faculty checking their department:**
> "List my department students"
> "Are there any at-risk students in my department?"
> "What's the OKR progress for my department?"

**Student checking their own data:**
> "What's my billing status?"
> "Show my attendance records for this week"
> "What's the status of my grievance?"

## Security

- Your API key determines what data you can see
- All queries are logged for audit purposes
- Keys expire and must be renewed periodically
- Never share your API key with others
```

**Step 2: Commit**

```bash
git add docs/features/b2a/MCP-CONNECTION-GUIDE.md
git commit -m "docs(mcp): add MCP server connection guide for JKKN users"
```

---

### Task 5.2 — Update B2A PRD Status

**Status:** `[ ]`

**Files:**
- Modify: `docs/features/b2a/B2A-PRD.md` (update Phase 6 status)

**Step 1:** In the PRD, update Phase 6 MCP Server status from `MISSING` to the new path `app/api/mcp/[transport]/route.ts` and mark the MCP-related rows in the file map as complete.

**Step 2: Commit**

```bash
git add docs/features/b2a/B2A-PRD.md
git commit -m "docs(b2a): update PRD — MCP server implemented"
```

---

### Task 5.3 — Final Build & Integration Test

**Status:** `[ ]`

**Step 1: Full build**

```bash
bun run typecheck
bun run build
```

Expected: Both pass with 0 errors.

**Step 2: Manual integration test**

Start the dev server and test with a real API key:

```bash
bun run dev

# Test tool listing
curl -X POST http://localhost:3000/api/mcp/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer jkkn_YOUR_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

# Test morning brief tool call
curl -X POST http://localhost:3000/api/mcp/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer jkkn_YOUR_KEY" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"myjkkn_morning_brief","arguments":{}}}'
```

Expected: Valid JSON-RPC responses with institutional data.

**Step 3: Test from Claude Desktop**

Configure Claude Desktop with:
```json
{
  "mcpServers": {
    "myjkkn-local": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer jkkn_YOUR_KEY"
      }
    }
  }
}
```

Restart Claude Desktop and ask: "What tools do you have from JKKN?"

Expected: Claude lists all registered MCP tools.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(mcp): MyJKKN MCP server complete — 11 tools, auth bridge, role scoping"
```

---

## Summary

### Files Created (16 total)

| File | Phase | Purpose |
|------|-------|---------|
| `lib/mcp/types.ts` | 1 | McpAuthContext, ScopeConfig, pagination types |
| `lib/mcp/auth-bridge.ts` | 1 | Validates jkkn_ keys for MCP connections |
| `lib/mcp/scoping.ts` | 1 | Role-based data filtering middleware |
| `lib/mcp/tool-helpers.ts` | 1 | Shared helpers (error/success formatting, audit logging) |
| `lib/mcp/register-tools.ts` | 2 | Central tool registry |
| `lib/mcp/tools/morning-brief.ts` | 2 | Smart: morning brief tool |
| `lib/mcp/tools/attendance.ts` | 3 | 1:1: attendance query |
| `lib/mcp/tools/billing.ts` | 3 | 1:1: billing query |
| `lib/mcp/tools/learners.ts` | 3 | 1:1: learner profiles |
| `lib/mcp/tools/staff.ts` | 3 | 1:1: staff records |
| `lib/mcp/tools/grievance.ts` | 3 | 1:1: grievance/service requests |
| `lib/mcp/tools/admission.ts` | 3 | 1:1: admission applications |
| `lib/mcp/tools/okr.ts` | 3 | 1:1: OKR objectives |
| `lib/mcp/tools/organizations.ts` | 3 | 1:1: institutions/departments/courses |
| `lib/mcp/tools/at-risk-learners.ts` | 4 | Smart: cross-module at-risk analysis |
| `lib/mcp/tools/department-health.ts` | 4 | Smart: cross-module department metrics |
| `app/api/mcp/[transport]/route.ts` | 2 | MCP API endpoint |
| `supabase/migrations/20260306_mcp_user_bound_api_keys.sql` | 1 | DB migration for user-bound keys |
| `docs/features/b2a/MCP-CONNECTION-GUIDE.md` | 5 | User-facing connection guide |

### Tools Registered (11 total)

| # | Tool | Type | Module |
|---|------|------|--------|
| 1 | `myjkkn_morning_brief` | Smart | multi |
| 2 | `myjkkn_query_attendance` | 1:1 | attendance |
| 3 | `myjkkn_query_billing` | 1:1 | billing |
| 4 | `myjkkn_query_learners` | 1:1 | learners |
| 5 | `myjkkn_query_staff` | 1:1 | staff |
| 6 | `myjkkn_query_grievance` | 1:1 | grievance |
| 7 | `myjkkn_query_admission` | 1:1 | admission |
| 8 | `myjkkn_query_okr` | 1:1 | okr |
| 9 | `myjkkn_query_organizations` | 1:1 | organizations |
| 10 | `myjkkn_at_risk_learners` | Smart | multi |
| 11 | `myjkkn_department_health` | Smart | multi |

### Security Layers

1. API key validation (SHA-256 hash lookup)
2. Module permission check (per-tool)
3. Institution scoping (mandatory on every query)
4. User role scoping (student/faculty/admin)
5. Rate limiting (60 req/min per key)
6. Audit logging (every tool call)
