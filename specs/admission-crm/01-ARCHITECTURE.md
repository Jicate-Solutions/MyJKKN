# Admission CRM — Architecture Reference

## System Layers

```
┌─────────────────────────────────────────────────────┐
│  Browser (React, shadcn/ui)                         │
│  app/(routes)/admission/[module]/page.tsx            │
│  'use client' components                            │
├─────────────────────────────────────────────────────┤
│  Hooks Layer (React Query)                          │
│  hooks/admission/use-[module].ts                    │
│  useQuery / useMutation                             │
├──────────────────────┬──────────────────────────────┤
│  CURRENT (Direct)    │  TARGET (B2A Pattern A)      │
│  Hook calls          │  Hook calls                  │
│  Service.method()    │  fetch('/api/admission/...')  │
│  directly            │  → withAuth() → Service      │
├──────────────────────┴──────────────────────────────┤
│  Service Layer (Static Classes)                     │
│  lib/services/admission/[module]-service.ts         │
│  createClientSupabaseClient()                       │
├─────────────────────────────────────────────────────┤
│  Supabase (PostgreSQL + RLS)                        │
│  Staging: hhprjbgknupaplivtoib                      │
└─────────────────────────────────────────────────────┘
```

## Auth Patterns

### CURRENT: `getAuthUser` (Pre-B2A)

Used by existing admission API routes (loans, leads, calls, etc.).

```typescript
// app/api/admission/loans/route.ts (CURRENT PATTERN)
import { getAuthUser } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  // Manual institution_id extraction from query params
  const institutionId = searchParams.get('institution_id');
  const data = await Service.getItems(institutionId, filters);
  return NextResponse.json({ success: true, data });
}
```

**Problems:**
- No API key support (session-only)
- Manual auth boilerplate in every route
- No standardized error mapping
- Inconsistent response shapes

### TARGET: `withAuth` (B2A Pattern A)

Used by Solutions Hub (111 routes). This is the migration target.

```typescript
// app/api/solutions/clients/route.ts (TARGET PATTERN)
import { withAuth } from '@/lib/auth/with-auth';
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response';
import { corsHeaders } from '@/lib/api-keys/cors';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export const GET = withAuth(async (request, auth) => {
  // auth.institutionId is auto-extracted (session or API key)
  // auth.user has { id, email, role, institution_id, full_name }
  // auth.supabase is a server-side client with RLS context
  const result = await Service.getItems({
    institution_id: auth.institutionId ?? undefined,
    page, limit, search
  });
  return paginatedResponse(result.data, result.metadata.total, page, limit);
}, { requiredPermission: 'read' });

export const POST = withAuth(async (request, auth) => {
  const body = await request.json();
  const institutionId = auth.institutionId ?? body.institution_id;
  if (!institutionId) return errorResponse('institution_id is required', 400);
  const result = await Service.createItem({ ...body, created_by: auth.user.id });
  return createdResponse(result);
});
```

**Benefits:**
- Dual auth: session + API key
- Auto institution_id extraction
- Postgres error mapping (23505→409, 23502→400, etc.)
- CORS headers included
- Consistent response envelope

### `withAuth` Interface

```typescript
// lib/auth/with-auth.ts
interface AuthContext {
  user: AuthUser;          // { id, email, role, institution_id, full_name }
  authMethod: 'session' | 'api_key';
  supabase: any;           // Server client with RLS
  apiKeyData?: ApiKeyData; // Only for API key auth
  institutionId: string | null; // Convenience accessor
}

interface AuthOptions {
  requiredPermission?: 'read' | 'write'; // Default: 'write'
  allowApiKey?: boolean;                  // Default: true
  requireRole?: string[];                 // Optional role check
}
```

## Response Helpers

File: `lib/api/response.ts`

```typescript
paginatedResponse(data[], total, page, limit)  // → { data, metadata: { page, limit, total, totalPages } }
successApiResponse(data, status?)               // → { data }
createdResponse(data)                           // → { data } with 201
errorResponse(message, status?)                 // → { error: message }
```

## API Client (for hooks)

File: `lib/api/client.ts`

Thin fetch wrapper — handles JSON parsing, error extraction, query params. Browser cookies auto-sent.

```typescript
import { apiClient } from '@/lib/api/client';

// In hooks:
const data = await apiClient.get('/api/admission/leads', { institution_id, page, limit });
const result = await apiClient.post('/api/admission/leads', body);
const updated = await apiClient.patch(`/api/admission/leads/${id}`, body);
await apiClient.delete(`/api/admission/leads/${id}`);
```

## Query Param Helpers

File: `lib/api-keys/query-helpers.ts`

```typescript
import { getPaginationParams, getStringParam, getBoolParam } from '@/lib/api-keys/query-helpers';

const url = new URL(request.url);
const { page, limit } = getPaginationParams(url);    // defaults: page=1, limit=20
const search = getStringParam(url, 'search');          // string | undefined
const active = getBoolParam(url, 'is_active');         // boolean | undefined
```

## File Naming Conventions

| Layer | Path Pattern | Example |
|-------|-------------|---------|
| Page | `app/(routes)/admission/[module]/page.tsx` | `admission/leads/page.tsx` |
| Page (detail) | `app/(routes)/admission/[module]/[id]/page.tsx` | `admission/leads/[id]/page.tsx` |
| Components | `app/(routes)/admission/[module]/_components/` | `leads/_components/lead-table.tsx` |
| Hook | `hooks/admission/use-[module].ts` | `hooks/admission/use-loans.ts` |
| Service | `lib/services/admission/[module]-service.ts` | `lib/services/admission/loan-service.ts` |
| API Route | `app/api/admission/[module]/route.ts` | `app/api/admission/loans/route.ts` |
| API Route (detail) | `app/api/admission/[module]/[id]/route.ts` | `app/api/admission/loans/[id]/route.ts` |
| Types | `types/admission.ts` | Single file (518 lines) |

## Existing API Routes (59 files)

### Fully Wired (have API routes already)

| Module | Route Count | Pattern |
|--------|-------------|---------|
| WhatsApp Chat | 13+ routes | `app/api/admission/chat/*` |
| Chatbot | 6 routes | `app/api/admission/chatbot/*` |
| Loans | 4 routes | `app/api/admission/loans/*` |
| GD-PI | 4 routes | `app/api/admission/gdpi/*` |
| Calls | 4 routes | `app/api/admission/calls/*` |
| Campaign Segments | 4 routes | `app/api/admission/campaigns/segments/*` |
| WA Numbers | 4 routes | `app/api/admission/settings/whatsapp-numbers/*` |
| Email | 3 routes | `app/api/admission/email/*` |
| Voice Agents | 2 routes | `app/api/admission/voice-agents/*` |
| Consultants | 2 routes | `app/api/admission/consultants/*` |
| Alerts | 1 route | `app/api/admission/alerts/` |
| Campaign ROI | 1 route | `app/api/admission/campaigns/roi/` |
| Costs | 1 route | `app/api/admission/costs/` |
| Insights | 1 route | `app/api/admission/insights/generate/` |
| Leads | 1 route | `app/api/admission/leads/` |
| Remarketing | 1 route | `app/api/admission/remarketing/` |
| Voice Broadcast | 1 route | `app/api/admission/voice-broadcast/` |
| Bridge | 1 route | `app/api/admission/bridge/convert/` |

### Missing (need to be created) — see [04-B2A-MIGRATION-GUIDE.md](./04-B2A-MIGRATION-GUIDE.md)

~28 new route files needed across all priority levels.

## Super Admin Handling

Super admins (`role === 'super_admin'`) have cross-institution access:

```typescript
// In hooks: bypass institution_id requirement
const institutionId = isSuperAdmin ? undefined : profile?.institution_id;
const enabled = isSuperAdmin || !!institutionId;

// In services: conditional .eq()
if (institutionId) {
  query = query.eq('institution_id', institutionId);
}
// Without this guard, super_admin gets empty results
```

This pattern is already applied in ~48 hooks and ~24 services (see memory: Security Hardening 2026-02-25).
