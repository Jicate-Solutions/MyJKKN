# Admission CRM — B2A Migration Guide

> Step-by-step guide for migrating each admission module from Direct Service calls to B2A Pattern A (withAuth + API routes).

## The Migration Pattern

```
BEFORE (Direct Service):
  Hook → ServiceClass.method(institutionId, ...) → Supabase

AFTER (B2A Pattern A):
  Hook → fetch('/api/admission/...') → withAuth() → ServiceClass.method(...) → Supabase (RLS)
```

## Template: New API Route File

```typescript
// app/api/admission/[MODULE]/route.ts
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { [Service] } from '@/lib/services/admission/[module]-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
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
    page,
    limit,
    search,
  })

  // Use paginatedResponse if service returns { data, total }
  // Use successApiResponse for simple arrays
  return paginatedResponse(result.data, result.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  const institutionId = auth.institutionId ?? body.institution_id
  if (!institutionId) {
    return errorResponse('institution_id is required', 400)
  }

  const result = await [Service].create({
    ...body,
    institution_id: institutionId,
    created_by: auth.user.id,
  })

  return createdResponse(result)
})
```

## Template: Detail API Route File

```typescript
// app/api/admission/[MODULE]/[id]/route.ts
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { [Service] } from '@/lib/services/admission/[module]-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await [Service].getById(id)
  if (!result) return errorResponse('Not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PUT = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const result = await [Service].update(id, body)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  await [Service].delete(id)
  return successApiResponse({ deleted: true })
})
```

## Template: Hook Migration (fetch pattern)

```typescript
// BEFORE (hooks/admission/use-[module].ts)
import { [Service] } from '@/lib/services/admission/[module]-service'

export function use[Module]s(institutionId?: string) {
  return useQuery({
    queryKey: ['[module]s', institutionId],
    queryFn: () => [Service].getAll(institutionId!),
    enabled: !!institutionId,
  })
}

// AFTER (hooks/admission/use-[module].ts)
import { apiClient } from '@/lib/api/client'

export function use[Module]s(institutionId?: string, isSuperAdmin = false) {
  return useQuery({
    queryKey: ['[module]s', institutionId],
    queryFn: () => apiClient.get('/api/admission/[module]', {
      institution_id: institutionId,
    }),
    enabled: isSuperAdmin || !!institutionId,
  })
}

export function useCreate[Module]() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Create[Module]Input) =>
      apiClient.post('/api/admission/[module]', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['[module]s'] })
    },
  })
}
```

---

## Migration Checklist Per Module

For each module, complete ALL steps before moving to the next:

- [ ] **Step 1**: Create API route file(s) with `withAuth`
- [ ] **Step 2**: Add `OPTIONS` handler for CORS
- [ ] **Step 3**: Use `lib/api/response.ts` helpers for response envelope
- [ ] **Step 4**: Use `lib/api-keys/query-helpers.ts` for params
- [ ] **Step 5**: Update hook to use `fetch()` via `apiClient` instead of Service
- [ ] **Step 6**: Handle super_admin: `auth.institutionId` may be `null`
- [ ] **Step 7**: Test with session auth (browser login)
- [ ] **Step 8**: Test with super_admin (cross-institution)
- [ ] **Step 9**: Verify existing page still works end-to-end

---

## P0 Migration: Dashboard

**Files to create:**
- `app/api/admission/dashboard/route.ts`

**Files to modify:**
- `hooks/admission/index.ts` — update `useAdmissionDashboard`, `useDashboardSummary`, `useFunnelSummary`

**Service methods used:** `LeadService.getDashboardSummary()`, `LeadService.getFunnelSummary()`

**Route implementation:**
```typescript
// app/api/admission/dashboard/route.ts
export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const view = getStringParam(url, 'view') // 'summary' | 'funnel' | 'all'

  const institutionId = auth.institutionId ?? undefined

  if (view === 'funnel') {
    const funnel = await LeadService.getFunnelSummary(institutionId)
    return successApiResponse(funnel)
  }

  const summary = await LeadService.getDashboardSummary(institutionId)
  const funnel = await LeadService.getFunnelSummary(institutionId)
  return successApiResponse({ summary, funnel })
}, { requiredPermission: 'read' })
```

---

## P0 Migration: Leads

**Files to create:**
```
app/api/admission/leads/[id]/route.ts          # GET, PUT, DELETE
app/api/admission/leads/[id]/stage/route.ts     # PATCH
app/api/admission/leads/[id]/assign/route.ts    # PATCH
app/api/admission/leads/[id]/hot/route.ts       # PATCH
app/api/admission/leads/[id]/followup/route.ts  # POST
app/api/admission/leads/[id]/tags/route.ts      # POST, DELETE
```

**Files to modify:**
- `app/api/admission/leads/route.ts` — wrap with `withAuth` (currently uses `getAuthUser`)
- `hooks/admission/index.ts` — update all lead hooks to use fetch()
- `hooks/admission/use-activities.ts` — update to fetch()
- `hooks/admission/use-lead-scoring.ts` — update to fetch()

---

## P0 Migration: Applications

**Files to create:**
```
app/api/admission/applications/route.ts          # GET, POST
app/api/admission/applications/[id]/route.ts     # GET, PUT, DELETE
app/api/admission/applications/[id]/status/route.ts  # PATCH
```

**Files to modify:**
- `hooks/admission/index.ts` — update application hooks

---

## P0 Migration: Counselors

**Files to create:**
```
app/api/admission/counselors/route.ts            # GET, POST
app/api/admission/counselors/[id]/route.ts       # GET, PUT, DELETE
app/api/admission/counselors/daily-view/route.ts # GET
app/api/admission/counselors/briefing/route.ts   # GET, POST
```

**Files to modify:**
- `app/api/admission/calls/route.ts` — migrate to withAuth
- `app/api/admission/calls/initiate/route.ts` — migrate to withAuth
- `app/api/admission/calls/stats/route.ts` — migrate to withAuth
- `app/api/admission/calls/[id]/notes/route.ts` — migrate to withAuth
- `app/api/admission/alerts/route.ts` — migrate to withAuth
- All counselor hooks

---

## P1 Migration: Settings Modules

**Assignment Rules:**
```
app/api/admission/settings/assignment-rules/route.ts      # GET, POST
app/api/admission/settings/assignment-rules/[id]/route.ts  # GET, PUT, DELETE
```

**Scoring Rules:**
```
app/api/admission/settings/scoring-rules/route.ts      # GET, POST
app/api/admission/settings/scoring-rules/[id]/route.ts  # GET, PUT, DELETE
```

**Workflows:**
```
app/api/admission/settings/workflows/route.ts      # GET, POST
app/api/admission/settings/workflows/[id]/route.ts  # GET, PUT, DELETE
```

**Templates:**
```
app/api/admission/settings/templates/route.ts      # GET, POST
app/api/admission/settings/templates/[id]/route.ts  # GET, PUT, DELETE
```

**Analytics:**
```
app/api/admission/analytics/route.ts  # GET (funnel, source ROI, counselor benchmarking)
```

**Apply (Public):**
```
app/api/admission/apply/route.ts  # POST only — NO auth (public route)
```
⚠️ **Special case**: Apply route must NOT use withAuth. Needs rate limiting + captcha.

---

## P2 Migration: Remaining Modules

Create route files following the template above for:

| Module | Route Path |
|--------|------------|
| Sources | `settings/sources/route.ts` |
| Workflow Config | `settings/workflow-config/route.ts` |
| Group Dashboard | `group-dashboard/route.ts` (super_admin only) |
| Phone Validation | `data-quality/phone-validation/route.ts` |
| Deduplication | `data-quality/deduplication/route.ts` |
| Data Profiling | `data-quality/data-profiling/route.ts` |
| Screening Exam | `screening-exam/route.ts` + `/[id]` |
| Merit List | `merit-list/route.ts` |
| Interviews | `interviews/route.ts` + `/[id]` |
| Scholarships | `scholarships/route.ts` + `/[id]` |
| Hostels | `hostels/route.ts` |
| Offer Letters | `offer-letters/route.ts` + `/[id]` |
| Seat Confirmation | `seat-confirmation/route.ts` |
| Lateral Entry | `lateral-entry/route.ts` |
| Documents | `documents/route.ts` + `/[id]` |
| Feedback | `feedback/route.ts` |
| Parent Communication | `parent-communication/route.ts` |
| Re-engagement | `re-engagement/route.ts` |

---

## P3: Existing Routes to Migrate to withAuth

These already have API routes but use the old `getAuthUser` pattern:

| Module | Route Files | Count |
|--------|-------------|-------|
| WhatsApp Chat | `app/api/admission/chat/*` | 13+ |
| Chatbot | `app/api/admission/chatbot/*` | 6 |
| Loans | `app/api/admission/loans/*` | 4 |
| GD-PI | `app/api/admission/gdpi/*` | 4 |
| Calls | `app/api/admission/calls/*` | 4 |
| Campaign Segments | `app/api/admission/campaigns/segments/*` | 4 |
| WA Numbers | `app/api/admission/settings/whatsapp-numbers/*` | 4 |
| Email | `app/api/admission/email/*` | 3 |
| Voice Agents | `app/api/admission/voice-agents/*` | 2 |
| Consultants | `app/api/admission/consultants/*` | 2 |
| Others | alerts, roi, costs, insights, leads, remarketing, voice-broadcast, bridge | 8 |

**Total existing routes to migrate**: ~54 files

**Migration per route:**
1. Replace `getAuthUser()` with `withAuth()` wrapper
2. Replace `const { user, error } = await getAuthUser()` with function signature `(request, auth) =>`
3. Replace manual `institution_id` from query params with `auth.institutionId`
4. Replace `NextResponse.json({ success: true, data })` with `successApiResponse(data)`
5. Add `OPTIONS` handler if missing

---

## Hook Cleanup Tasks

| Issue | Files | Fix |
|-------|-------|-----|
| Hooks misplaced in `use-data-quality.ts` | Scholarships, Hostels hooks | Move to `use-scholarships.ts`, `use-hostels.ts` |
| Components call service directly (no hooks used) | Offer Letters, Seat Confirmation, Lateral Entry, Feedback | Wire page → hook → API |
| No hook at all | Documents, Merit List | Create `use-documents.ts`, wire `use-merit-lists.ts` |
| Heavy inline aggregation (~100 lines) | Analytics hooks in `index.ts` | Move to analytics service / API route |

---

## Validation Checklist (After All Migrations)

- [ ] All 42 sub-modules accessible and functional
- [ ] Zero direct service calls from hooks (all via fetch)
- [ ] All routes use `withAuth` (except `/apply` public route)
- [ ] All routes have `OPTIONS` handler
- [ ] Super admin can access all modules (institutionId = null handled)
- [ ] Regular user scoped to their institution
- [ ] Misplaced hooks moved to correct files
- [ ] Components no longer call services directly
- [ ] Response envelopes consistent (using `lib/api/response.ts`)
