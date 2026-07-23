# Board of Studies (BoS) Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Build a full Board of Studies management module for JKKN autonomous colleges -- BoS composition management, meeting lifecycle (8-state machine), document generation, resolution tracking, course review linkage, TA/DA claims, and NAAC/NBA-ready reports.

**Architecture:** 7-layer pattern (Database -> Types -> Services -> React Query Hooks -> Server Data (`_data/`) -> Components -> Pages). COE database tables accessed from MyJKKN via proxy API routes using `createCoeSupabaseClient()`. Meetings follow a strict state machine. Documents generated as DOCX with PDF export.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase PostgreSQL (COE project), React Query (`@tanstack/react-query`), Shadcn UI, Tailwind CSS, docx/pdf-lib for document generation.

**Source Spec:** `docs/plans/bos-spec-extracted.md` (1895 lines, full spec with DB schema, TypeScript interfaces, service patterns, UI screens, API endpoints, validation rules)

---

## Orchestrator & Sub-Agent Strategy

> **Reference:** `.claude/agents/jkkn-coe-orchestrator.md`

This plan is designed for execution via the **jkkn-coe-orchestrator** agent, which coordinates specialized sub-agents. Each phase maps to a sub-agent delegation chain.

### Agent Delegation Map

| Phase | Primary Agent | Supporting Agent(s) | Parallel? |
|-------|---------------|---------------------|-----------|
| Phase 1: Foundation | `api-developer` + `ui-component-builder` | `code-architecture` (design), `code-reviewer` (review) | Yes - API + UI can parallelize after types |
| Phase 2: Meeting Lifecycle | `api-developer` + `ui-component-builder` | `code-reviewer` | Yes - API + UI parallel |
| Phase 3: Agenda & Attendance | `ui-component-builder` + `api-developer` | `code-reviewer` | Yes |
| Phase 4: Document Generation | `api-developer` + `automation-engineer` | `code-reviewer` | Sequential (template engine first, then routes) |
| Phase 5: Reports & TA/DA | `ui-component-builder` + `api-developer` | `technical-writer`, `code-reviewer` | Yes |

### Orchestration Flow Per Phase

```
1. code-architecture -> Design phase architecture (sequential, needed first)
2. api-developer + ui-component-builder -> Build API & UI (PARALLEL)
3. code-reviewer -> Review all changes (sequential, after build)
4. Commit checkpoint
```

### Sub-Agent Invocation Pattern

```typescript
// Phase start: Architecture design
Agent({
  subagent_type: "code-architecture",
  prompt: "Design architecture for Phase N: [description]. Review spec at docs/plans/bos-spec-extracted.md lines X-Y.",
  description: "Architect BoS Phase N"
})

// Build: API + UI in parallel
Agent({
  subagent_type: "api-developer",
  prompt: "Build API routes for [entity]. Follow spec patterns in docs/plans/bos-spec-extracted.md.",
  description: "Build BoS [entity] API"
})
Agent({
  subagent_type: "ui-component-builder",
  prompt: "Build UI page for [entity]. Follow mobile-responsive patterns.",
  description: "Build BoS [entity] UI"
})

// Review
Agent({
  subagent_type: "code-reviewer",
  prompt: "Review Phase N changes. Check JKKN terminology, mobile responsiveness, TypeScript strict mode.",
  description: "Review BoS Phase N"
})
```

---

## Cross-Cutting Concerns

### JKKN Terminology Rules (applied to ALL phases)

> Reference: `.claude/skills/jkkn-terminologies/SKILL.md`

| Context | Standard Academic Term | JKKN Internal UI Label |
|---------|----------------------|------------------------|
| Official documents (PDF/DOCX output) | Chairman, Faculty, Student | Chairman, Faculty, Student (NAAC compliance) |
| UI labels for internal members | Faculty / Teacher | **Learning Facilitator** |
| UI labels for curriculum | Syllabus, Curriculum | **Learning Pathway**, **Learning Framework** |
| UI labels for learners | Student | **Learner** |
| Error/status messages | Failed | **Needs Support** |

**Rule:** Official BoS documents use standard academic terms (NAAC/UGC requirement). UI screens use JKKN terminology. The mapping happens at the component/template level, NOT in the database or API.

### Mobile-Responsive Rules (applied to ALL UI tasks)

> Reference: `.claude/skills/mobile-responsive/SKILL.md`

Every page/component MUST follow these patterns:

1. **Container:** `px-4 sm:px-6 lg:px-8 py-4 sm:py-6`
2. **Tables:** Desktop table (`hidden md:block`) + Mobile cards (`md:hidden space-y-3`)
3. **Forms:** `flex-col sm:flex-row`, inputs `w-full sm:w-auto`
4. **Buttons:** `min-h-[44px]`, stack vertically on mobile (`flex-col-reverse sm:flex-row`)
5. **Typography:** `text-2xl sm:text-3xl lg:text-4xl` for headings
6. **Dialogs/Sheets:** `w-full max-w-[600px] mx-4 sm:mx-auto`
7. **Touch targets:** Minimum 44x44px for all interactive elements
8. **Bottom nav padding:** `pb-20 md:pb-0` on main content

### Project Structure (MyJKKN target)

> Reference: `.claude/skills/project-structure/SKILL.md`

```
MyJKKN/
  types/bos.ts                           # Layer 2
  lib/supabase/coe-client.ts             # COE Supabase client
  lib/services/academic/bos-*.ts         # Layer 3 (services)
  hooks/academic/use-bos-*.ts            # Layer 4 (React Query hooks)
  app/(routes)/academic/bos/             # Layer 7 (pages)
    [entity]/_data/get-*.ts              # Layer 5 (server data)
    [entity]/_components/*.tsx           # Layer 6 (page components)
  components/academic/bos/*.tsx          # Shared BoS components
  app/api/bos/                           # Proxy API routes (COE DB)
```

**COE project (this repo):**
```
supabase/migrations/20260306_create_bos_tables.sql  # Already created
```

---

## Phase 1: Foundation -- Types, COE Client & Expert Directory

**Goal:** Set up the foundation layers and build the first complete CRUD feature (External Expert Directory).

**Orchestrator delegation:**
```
1. code-architecture -> Review existing spec, validate DB migration
2. api-developer -> Build COE client + Expert API routes (PARALLEL with Step 3)
3. ui-component-builder -> Build Expert Directory page + components
4. code-reviewer -> Review Phase 1
```

---

### Task 1.1: Validate COE Migration

**Files:**
- Verify: `supabase/migrations/20260306_create_bos_tables.sql`

**Step 1: Verify migration file exists and is complete**

Read `supabase/migrations/20260306_create_bos_tables.sql` and confirm all 10 tables are present:
1. `bos_external_experts`
2. `bos_compositions`
3. `bos_members`
4. `bos_meetings`
5. `bos_meeting_attendees`
6. `bos_agenda_items`
7. `bos_resolution_actions`
8. `bos_course_reviews`
9. `bos_ta_da_claims`
10. `bos_documents`

**Step 2: Apply migration to COE database**

Run: `npx supabase db push` (or apply via Supabase dashboard)
Expected: All 10 tables created with indexes and constraints.

**Step 3: Verify tables exist**

Query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'bos_%' ORDER BY table_name;`
Expected: 10 rows returned.

---

### Task 1.2: Create COE Supabase Client

**Files:**
- Create: `lib/supabase/coe-client.ts`

**Step 1: Create the COE client file**

```typescript
// lib/supabase/coe-client.ts
// Server-side only -- used inside app/api/bos/* routes to query COE database
import { createClient } from '@supabase/supabase-js'

export function createCoeSupabaseClient() {
  const url = process.env.COE_SUPABASE_URL
  const key = process.env.COE_SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('COE Supabase environment variables not configured')
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}
```

**Step 2: Add environment variables**

Add to `.env.local` and `.env.example`:
```env
# COE Database (Supabase -- separate project)
COE_SUPABASE_URL=https://your-coe-project.supabase.co
COE_SUPABASE_SERVICE_ROLE_KEY=your-coe-service-role-key
```

**Step 3: Verify import works**

Create a quick test in any API route:
```typescript
import { createCoeSupabaseClient } from '@/lib/supabase/coe-client'
const coe = createCoeSupabaseClient()
const { data } = await coe.from('bos_external_experts').select('count')
```
Expected: No errors, returns `{ count: 0 }`.

---

### Task 1.3: Create TypeScript Interfaces

**Files:**
- Create: `types/bos.ts`

**Step 1: Create complete types file**

Copy the full TypeScript interfaces from spec lines 689-1102. This includes:

- **Union types:** `BosExpertCategory`, `BosMemberType`, `BosMeetingStatus`, `BosMeetingType`, `BosAttendanceStatus`, `BosResolutionStatus`, `BosCourseReviewAction`, `BosDocumentType`, `BosClaimStatus`
- **Label maps:** `BOS_MEMBER_TYPE_LABELS`, `BOS_MEETING_STATUS_LABELS`
- **Interfaces:** `BosExternalExpert`, `BosComposition`, `BosMember`, `BosMeeting`, `BosMeetingAttendee`, `BosAgendaItem`, `BosResolutionAction`, `BosCourseReview`, `BosTaDaClaim`, `BosDocument`
- **DTOs:** `CreateBos*Dto`, `UpdateBos*Dto` for each entity
- **Filter interfaces:** `BosExpertFilters`, `BosCompositionFilters`, `BosMeetingFilters`
- **Response type:** `BosListResponse<T>`
- **Report types:** `BosCompositionReport`, `BosMeetingRegisterEntry`

**Step 2: Add state machine transitions constant**

```typescript
// Valid state transitions for the meeting state machine
export const VALID_TRANSITIONS: Record<BosMeetingStatus, BosMeetingStatus[]> = {
  draft: ['principal_approved'],
  principal_approved: ['noticed', 'draft'],
  noticed: ['expert_invited', 'principal_approved'],
  expert_invited: ['completed', 'noticed'],
  completed: ['minutes_drafted', 'expert_invited'],
  minutes_drafted: ['minutes_approved', 'completed'],
  minutes_approved: ['ratified', 'minutes_drafted'],
  ratified: [],
}
```

**Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit types/bos.ts`
Expected: No errors.

**Step 4: Commit**

```bash
git add types/bos.ts lib/supabase/coe-client.ts
git commit -m "feat(bos): add TypeScript interfaces and COE Supabase client"
```

---

### Task 1.4: Create Institution Access Utility

**Files:**
- Create: `lib/utils/bos-access.ts`

**Step 1: Create the access resolution utility**

```typescript
// lib/utils/bos-access.ts
// Resolves institution scope for BoS API routes based on user profile

import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface BosAccessScope {
  isSuperAdmin: boolean
  institutionsId: string | null
  userId: string
}

/**
 * Resolves the BoS access scope for the authenticated user.
 * - Super admins: no institution filter (see all data)
 * - Normal users: forced to their own institution_id
 */
export async function resolveBosAccess(): Promise<BosAccessScope | null> {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('institution_id, is_super_admin')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  return {
    isSuperAdmin: profile.is_super_admin ?? false,
    institutionsId: profile.institution_id ?? null,
    userId: user.id,
  }
}

/**
 * Applies institution scope to a Supabase query builder.
 * Super admins skip filtering; normal users are locked to their institution.
 */
export function applyInstitutionScope(
  query: any,
  scope: BosAccessScope,
  overrideInstitutionId?: string | null
) {
  if (scope.isSuperAdmin) {
    // Super admin can optionally filter by a specific institution
    if (overrideInstitutionId) {
      return query.eq('institutions_id', overrideInstitutionId)
    }
    return query // No filter -- see all
  }
  // Normal user -- always filter by their institution
  return query.eq('institutions_id', scope.institutionsId)
}

/**
 * Guards write operations to ensure the user can only write to their institution.
 * Returns an error message if the write is not allowed, or null if OK.
 */
export function guardInstitutionWrite(
  scope: BosAccessScope,
  bodyInstitutionsId: string
): string | null {
  if (scope.isSuperAdmin) return null // Super admin can write to any institution
  if (!scope.institutionsId) return 'User has no institution assigned'
  if (bodyInstitutionsId !== scope.institutionsId) {
    return 'Cannot write to a different institution'
  }
  return null
}
```

**Step 2: Commit**

```bash
git add lib/utils/bos-access.ts
git commit -m "feat(bos): add institution access resolution utility"
```

---

### Task 1.5: Build Expert Directory API Routes

**Files:**
- Create: `app/api/bos/experts/route.ts` (GET, POST)
- Create: `app/api/bos/experts/[id]/route.ts` (GET, PUT, DELETE)

**Step 1: Create GET + POST route**

```typescript
// app/api/bos/experts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createCoeSupabaseClient } from '@/lib/supabase/coe-client'
import { resolveBosAccess, applyInstitutionScope, guardInstitutionWrite } from '@/lib/utils/bos-access'

export async function GET(request: NextRequest) {
  try {
    const scope = await resolveBosAccess()
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const filters = {
      institutions_id: searchParams.get('institutions_id') ?? undefined,
      category: searchParams.get('category') ?? undefined,
      is_active: searchParams.has('is_active') ? searchParams.get('is_active') === 'true' : undefined,
      search: searchParams.get('search') ?? undefined,
      page: Number(searchParams.get('page') ?? '1'),
      limit: Number(searchParams.get('limit') ?? '20'),
    }

    const coe = createCoeSupabaseClient()
    let query = coe.from('bos_external_experts').select('*', { count: 'exact' })

    query = applyInstitutionScope(query, scope, filters.institutions_id)
    if (filters.category) query = query.eq('category', filters.category)
    if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active)
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,institution_name.ilike.%${filters.search}%`)
    }

    const offset = (filters.page - 1) * filters.limit
    query = query.range(offset, offset + filters.limit - 1).order('name')

    const { data, error, count } = await query
    if (error) throw error

    return NextResponse.json({
      data: data || [],
      metadata: {
        total: count || 0,
        page: filters.page,
        limit: filters.limit,
        totalPages: count ? Math.ceil(count / filters.limit) : 0,
      },
    })
  } catch (error) {
    console.error('bos/experts GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const scope = await resolveBosAccess()
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()

    // Validate required fields
    if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!body.category) return NextResponse.json({ error: 'Category is required' }, { status: 400 })
    if (!body.institutions_id) return NextResponse.json({ error: 'Institution is required' }, { status: 400 })

    // Guard institution write
    const writeError = guardInstitutionWrite(scope, body.institutions_id)
    if (writeError) return NextResponse.json({ error: writeError }, { status: 403 })

    const coe = createCoeSupabaseClient()
    const { data, error } = await coe
      .from('bos_external_experts')
      .insert([body])
      .select()
      .single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Expert already exists' }, { status: 400 })
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('bos/experts POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Step 2: Create [id] route (GET, PUT, DELETE)**

```typescript
// app/api/bos/experts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createCoeSupabaseClient } from '@/lib/supabase/coe-client'
import { resolveBosAccess, applyInstitutionScope } from '@/lib/utils/bos-access'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const scope = await resolveBosAccess()
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const coe = createCoeSupabaseClient()
    let query = coe.from('bos_external_experts').select('*').eq('id', id)
    query = applyInstitutionScope(query, scope)

    const { data, error } = await query.single()
    if (error) return NextResponse.json({ error: 'Expert not found' }, { status: 404 })

    return NextResponse.json(data)
  } catch (error) {
    console.error('bos/experts/[id] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const scope = await resolveBosAccess()
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    // Don't allow changing institution
    delete body.institutions_id
    delete body.id

    const coe = createCoeSupabaseClient()
    let query = coe.from('bos_external_experts').update(body).eq('id', id)
    query = applyInstitutionScope(query, scope)

    const { data, error } = await query.select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json(data)
  } catch (error) {
    console.error('bos/experts/[id] PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const scope = await resolveBosAccess()
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const coe = createCoeSupabaseClient()
    let query = coe.from('bos_external_experts').delete().eq('id', id)
    query = applyInstitutionScope(query, scope)

    const { error } = await query
    if (error) {
      if (error.code === '23503') return NextResponse.json({ error: 'Cannot delete - expert is assigned to a BoS composition' }, { status: 400 })
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('bos/experts/[id] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Step 3: Commit**

```bash
git add app/api/bos/experts/
git commit -m "feat(bos): add External Expert Directory API routes"
```

---

### Task 1.6: Build Expert Service Layer

**Files:**
- Create: `lib/services/academic/bos-expert-service.ts`

**Step 1: Create the service**

```typescript
// lib/services/academic/bos-expert-service.ts
import type {
  BosExternalExpert,
  BosExpertFilters,
  CreateBosExpertDto,
  UpdateBosExpertDto,
  BosListResponse,
} from '@/types/bos'

export class BosExpertService {
  private static baseUrl = '/api/bos/experts'

  static async getExperts(
    filters: BosExpertFilters = {}
  ): Promise<BosListResponse<BosExternalExpert>> {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null) params.set(k, String(v))
    })

    const res = await fetch(`${this.baseUrl}?${params}`)
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to fetch experts')
    }
    return res.json()
  }

  static async getExpert(id: string): Promise<BosExternalExpert> {
    const res = await fetch(`${this.baseUrl}/${id}`)
    if (!res.ok) throw new Error((await res.json()).error || 'Expert not found')
    return res.json()
  }

  static async createExpert(data: CreateBosExpertDto): Promise<BosExternalExpert> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json()
      const enhanced: any = new Error(err.error || 'Failed to create expert')
      enhanced.code = err.code
      throw enhanced
    }
    return res.json()
  }

  static async updateExpert(id: string, data: UpdateBosExpertDto): Promise<BosExternalExpert> {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update expert')
    return res.json()
  }

  static async deleteExpert(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete expert')
  }
}
```

**Step 2: Commit**

```bash
git add lib/services/academic/bos-expert-service.ts
git commit -m "feat(bos): add Expert Directory service layer"
```

---

### Task 1.7: Build Expert React Query Hooks

**Files:**
- Create: `hooks/academic/use-bos-experts.ts`

**Step 1: Create hooks with React Query**

```typescript
// hooks/academic/use-bos-experts.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { BosExpertService } from '@/lib/services/academic/bos-expert-service'
import type {
  BosExpertFilters,
  CreateBosExpertDto,
  UpdateBosExpertDto,
} from '@/types/bos'

// List experts
export function useBosExperts(filters: BosExpertFilters = {}) {
  return useQuery({
    queryKey: ['bos-experts', filters],
    queryFn: () => BosExpertService.getExperts(filters),
    placeholderData: (prev) => prev,
  })
}

// Single expert
export function useBosExpert(id: string) {
  return useQuery({
    queryKey: ['bos-experts', id],
    queryFn: () => BosExpertService.getExpert(id),
    enabled: !!id,
  })
}

// Create
export function useCreateBosExpert() {
  const qc = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: (data: CreateBosExpertDto) => BosExpertService.createExpert(data),
    onSuccess: () => {
      toast.success('Expert added successfully')
      qc.invalidateQueries({ queryKey: ['bos-experts'] })
      router.refresh()
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add expert'),
  })
}

// Update
export function useUpdateBosExpert() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBosExpertDto }) =>
      BosExpertService.updateExpert(id, data),
    onSuccess: () => {
      toast.success('Expert updated')
      qc.invalidateQueries({ queryKey: ['bos-experts'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update expert'),
  })
}

// Delete
export function useDeleteBosExpert() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => BosExpertService.deleteExpert(id),
    onSuccess: () => {
      toast.success('Expert removed')
      qc.invalidateQueries({ queryKey: ['bos-experts'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove expert'),
  })
}
```

**Step 2: Commit**

```bash
git add hooks/academic/use-bos-experts.ts
git commit -m "feat(bos): add Expert Directory React Query hooks"
```

---

### Task 1.8: Build Shared BoS UI Components

**Files:**
- Create: `components/academic/bos/member-category-badge.tsx`
- Create: `components/academic/bos/meeting-status-badge.tsx`

**Step 1: Create member category badge**

```tsx
// components/academic/bos/member-category-badge.tsx
'use client'

import { Badge } from '@/components/ui/badge'
import type { BosMemberType, BosExpertCategory } from '@/types/bos'
import { BOS_MEMBER_TYPE_LABELS } from '@/types/bos'

const CATEGORY_COLORS: Record<string, string> = {
  chairman: 'bg-red-100 text-red-800 border-red-200',
  internal_member: 'bg-gray-100 text-gray-800 border-gray-200',
  university_nominee: 'bg-blue-100 text-blue-800 border-blue-200',
  subject_expert: 'bg-purple-100 text-purple-800 border-purple-200',
  industry_expert: 'bg-amber-100 text-amber-800 border-amber-200',
  alumni: 'bg-green-100 text-green-800 border-green-200',
}

interface Props {
  category: BosMemberType | BosExpertCategory
  className?: string
}

export function MemberCategoryBadge({ category, className }: Props) {
  const label = BOS_MEMBER_TYPE_LABELS[category as BosMemberType] || category
  const colors = CATEGORY_COLORS[category] || 'bg-gray-100 text-gray-800'

  return (
    <Badge variant="outline" className={`${colors} ${className || ''}`}>
      {label}
    </Badge>
  )
}
```

**Step 2: Create meeting status badge**

```tsx
// components/academic/bos/meeting-status-badge.tsx
'use client'

import { Badge } from '@/components/ui/badge'
import type { BosMeetingStatus } from '@/types/bos'
import { BOS_MEETING_STATUS_LABELS } from '@/types/bos'

const STATUS_COLORS: Record<BosMeetingStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  principal_approved: 'bg-blue-100 text-blue-700 border-blue-200',
  noticed: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  expert_invited: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  completed: 'bg-amber-100 text-amber-700 border-amber-200',
  minutes_drafted: 'bg-orange-100 text-orange-700 border-orange-200',
  minutes_approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ratified: 'bg-green-100 text-green-700 border-green-200',
}

interface Props {
  status: BosMeetingStatus
  className?: string
}

export function MeetingStatusBadge({ status, className }: Props) {
  return (
    <Badge variant="outline" className={`${STATUS_COLORS[status]} ${className || ''}`}>
      {BOS_MEETING_STATUS_LABELS[status]}
    </Badge>
  )
}
```

**Step 3: Commit**

```bash
git add components/academic/bos/
git commit -m "feat(bos): add MemberCategoryBadge and MeetingStatusBadge components"
```

---

### Task 1.9: Build Expert Directory Page

**Files:**
- Create: `app/(routes)/academic/bos/experts/page.tsx` (Server Component)
- Create: `app/(routes)/academic/bos/experts/_data/get-experts.ts` (Server data fetch)
- Create: `app/(routes)/academic/bos/experts/_components/columns.tsx`
- Create: `app/(routes)/academic/bos/experts/_components/expert-data-table.tsx`
- Create: `app/(routes)/academic/bos/experts/_components/expert-form.tsx`
- Create: `app/(routes)/academic/bos/experts/_components/row-actions.tsx`

> **Mobile-responsive:** Expert table uses `hidden md:block` for desktop table + `md:hidden space-y-3` for mobile cards. Form inputs `w-full sm:w-auto`. Touch targets 44px minimum.

> **JKKN Terminology:** UI labels use "Learning Facilitator" for internal staff references.

**This task creates 6 files. Each follows the patterns from the spec (lines 577-590) and mobile-responsive skill. The detailed code for each file follows the patterns already established in this plan (API routes, services, hooks). The page should:**

1. **Server Component** at `page.tsx` that calls `_data/get-experts.ts` for initial data
2. **DataTable** with columns: Name, Category (badge), Institution, Contact, Status, Actions
3. **Expert Form** in a Sheet drawer for create/edit
4. **Row Actions** dropdown: Edit, Delete
5. **Filter bar** by Category (tabs or dropdown)
6. **Mobile cards** showing Name, Category badge, Institution, Contact

**Step 1: Create server data fetcher**

```typescript
// app/(routes)/academic/bos/experts/_data/get-experts.ts
import { createCoeSupabaseClient } from '@/lib/supabase/coe-client'

export async function getExperts(institutionsId?: string) {
  const coe = createCoeSupabaseClient()
  let query = coe.from('bos_external_experts').select('*').order('name')

  if (institutionsId) {
    query = query.eq('institutions_id', institutionsId)
  }

  const { data, error } = await query.range(0, 9999)
  if (error) throw error
  return data || []
}
```

**Step 2-6:** Create the remaining component files following the established project patterns. Each file should:
- Use `'use client'` directive
- Import from `@/types/bos` for type safety
- Use `@/components/ui/*` Shadcn components
- Apply mobile-responsive classes per the rules above
- Use React Query hooks from `hooks/academic/use-bos-experts.ts`

**Step 7: Commit**

```bash
git add app/(routes)/academic/bos/experts/
git commit -m "feat(bos): add Expert Directory page with CRUD"
```

---

### Task 1.10: Build Composition API Routes & Service

**Files:**
- Create: `app/api/bos/compositions/route.ts` (GET, POST)
- Create: `app/api/bos/compositions/[id]/route.ts` (GET, PUT, DELETE)
- Create: `app/api/bos/members/route.ts` (GET, POST)
- Create: `app/api/bos/members/[id]/route.ts` (PUT, DELETE)
- Create: `lib/services/academic/bos-composition-service.ts`
- Create: `lib/services/academic/bos-member-service.ts`
- Create: `hooks/academic/use-bos-compositions.ts`
- Create: `hooks/academic/use-bos-members.ts`

**Pattern:** Follow the exact same patterns as Expert routes/service/hooks (Tasks 1.5-1.7) with these additions:
- Composition GET joins `board(board_code, board_name, board_type)`
- Members GET joins `bos_external_experts(*)`
- Composition POST validates `board_id` exists
- Members POST validates the `bos_members_source_check` constraint (either `staff_id` or `expert_id`)
- Only one `is_active = true` composition per `board_id` (validate in POST/PUT)

**Commit:**

```bash
git add app/api/bos/compositions/ app/api/bos/members/ lib/services/academic/bos-composition-service.ts lib/services/academic/bos-member-service.ts hooks/academic/use-bos-compositions.ts hooks/academic/use-bos-members.ts
git commit -m "feat(bos): add Composition & Member API routes, services, and hooks"
```

---

### Task 1.11: Build Composition Management Page

**Files:**
- Create: `app/(routes)/academic/bos/compositions/page.tsx`
- Create: `app/(routes)/academic/bos/compositions/_data/get-compositions.ts`
- Create: `app/(routes)/academic/bos/compositions/_components/columns.tsx`
- Create: `app/(routes)/academic/bos/compositions/_components/composition-data-table.tsx`
- Create: `app/(routes)/academic/bos/compositions/_components/composition-form.tsx`
- Create: `app/(routes)/academic/bos/compositions/_components/member-list.tsx`
- Create: `app/(routes)/academic/bos/compositions/_components/add-member-drawer.tsx`
- Create: `app/(routes)/academic/bos/compositions/[compositionId]/page.tsx`

**Key features:**
1. **List page**: Board -> Composition hierarchy, term dates, member count, active/inactive badge
2. **Detail page** (`[compositionId]`): Member list card view (S.No, Position, Name, Designation, Address, Contact, Email)
3. **Add Internal Member**: Search staff from MyJKKN learning facilitator list
4. **Add External Expert**: Pick from expert directory or create new
5. **Term expiry countdown** chip (red if < 60 days, amber if < 180 days)
6. **Mobile:** Cards for composition list, stacked member cards on mobile

**Commit:**

```bash
git add app/(routes)/academic/bos/compositions/
git commit -m "feat(bos): add Composition Management page with member list"
```

---

### Task 1.12: Build BoS Layout & Navigation

**Files:**
- Create: `app/(routes)/academic/bos/layout.tsx`
- Create: `app/(routes)/academic/bos/page.tsx` (Dashboard)
- Modify: `lib/sidebarMenuLink.ts` (add BoS navigation)

**Step 1: Create BoS sub-navigation layout**

```tsx
// app/(routes)/academic/bos/layout.tsx
import Link from 'next/link'

const BOS_NAV_ITEMS = [
  { href: '/academic/bos', label: 'Dashboard' },
  { href: '/academic/bos/experts', label: 'Expert Directory' },
  { href: '/academic/bos/compositions', label: 'Compositions' },
  { href: '/academic/bos/meetings', label: 'Meetings' },
  { href: '/academic/bos/ta-da', label: 'TA/DA Claims' },
  { href: '/academic/bos/reports', label: 'Reports' },
]

export default function BosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {/* Desktop: horizontal tabs */}
      <nav className="hidden md:flex border-b px-4 sm:px-6 lg:px-8 gap-1 overflow-x-auto">
        {BOS_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="px-4 py-3 text-sm font-medium whitespace-nowrap hover:bg-gray-50 border-b-2 border-transparent"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Mobile: scrollable tabs */}
      <nav className="md:hidden flex border-b overflow-x-auto scrollbar-hide">
        {BOS_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="px-3 py-3 text-xs font-medium whitespace-nowrap min-w-[80px] text-center"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">{children}</main>
    </div>
  )
}
```

**Step 2: Create Dashboard page**

Dashboard shows summary cards: Active compositions, meetings this year, pending resolutions, expiring terms (60-day alert).

**Step 3: Register in sidebar**

Add to `lib/sidebarMenuLink.ts`:
```typescript
{ href: '/academic/bos', label: 'Board of Studies', icon: BookOpenCheck }
```

**Step 4: Commit**

```bash
git add app/(routes)/academic/bos/layout.tsx app/(routes)/academic/bos/page.tsx lib/sidebarMenuLink.ts
git commit -m "feat(bos): add BoS layout, dashboard, and sidebar navigation"
```

---

## Phase 2: Meeting Lifecycle

**Goal:** Build the meeting creation, listing, state machine transitions, and meeting detail hub.

**Orchestrator delegation:**
```
1. api-developer -> Meeting API routes + status transition route (PARALLEL with Step 2)
2. ui-component-builder -> Meeting list page + detail hub + stepper
3. code-reviewer -> Review Phase 2
```

---

### Task 2.1: Build Meeting API Routes

**Files:**
- Create: `app/api/bos/meetings/route.ts` (GET, POST)
- Create: `app/api/bos/meetings/next-number/route.ts` (GET -- auto meeting number)
- Create: `app/api/bos/meetings/[id]/route.ts` (GET, PUT)
- Create: `app/api/bos/meetings/[id]/status/route.ts` (PATCH -- state transitions)

**Key implementation details:**

1. **Auto meeting number:** `SELECT COALESCE(MAX(meeting_number), 0) + 1 FROM bos_meetings WHERE board_id = $1 AND academic_year = $2`
2. **State transition validation:** `VALID_TRANSITIONS[currentStatus].includes(newStatus)` -- reject invalid transitions with 400
3. **Status metadata:** Each transition can include metadata fields:
   - `draft -> principal_approved`: sets `submitted_for_approval_at`, `principal_approved_at`, `principal_approved_by`
   - `completed -> minutes_drafted`: sets `minutes_drafted_at`
   - `minutes_drafted -> minutes_approved`: sets `minutes_approved_at`, `minutes_approved_by`
   - `minutes_approved -> ratified`: sets `ratified_by_ac = true`, `ratified_date`
4. **Transition guards:**
   - Cannot complete if no attendance records
   - Cannot draft minutes if no agenda items with resolutions
   - Quorum warning (not blocking) if < 50% present

**Commit:**

```bash
git add app/api/bos/meetings/
git commit -m "feat(bos): add Meeting API routes with 8-state machine"
```

---

### Task 2.2: Build Meeting Service & Hooks

**Files:**
- Create: `lib/services/academic/bos-meeting-service.ts`
- Create: `hooks/academic/use-bos-meetings.ts`

**Key methods in service:**
- `getMeetings(filters)` -- standard list with filters
- `getMeeting(id)` -- single meeting with board/composition joins
- `createMeeting(data)` -- auto-assigns meeting_number via `getNextMeetingNumber()`
- `updateMeeting(id, data)` -- standard update
- `transitionStatus(meetingId, newStatus, metadata?)` -- PATCH to status route
- `getNextMeetingNumber(boardId, academicYear)` -- GET from next-number route

**Hooks:**
- `useBossMeetings(filters)` -- list query
- `useBosMeeting(id)` -- single query
- `useCreateBosMeeting()` -- create mutation
- `useUpdateBosMeeting()` -- update mutation
- `useTransitionMeetingStatus()` -- status transition mutation

**Commit:**

```bash
git add lib/services/academic/bos-meeting-service.ts hooks/academic/use-bos-meetings.ts
git commit -m "feat(bos): add Meeting service and React Query hooks"
```

---

### Task 2.3: Build Meeting Status Stepper Component

**Files:**
- Create: `components/academic/bos/meeting-timeline.tsx`

**Design:** Horizontal stepper showing all 8 states. Current state is highlighted, completed states have checkmarks, future states are grayed out. On mobile, the stepper becomes vertical or a compact progress bar.

**States in order:**
1. Draft
2. Principal Approved
3. Notice Sent
4. Experts Invited
5. Meeting Completed
6. Minutes Drafted
7. Minutes Approved
8. Ratified

**Mobile:** Vertical stepper with compact labels, or a progress bar with fraction (e.g., "4/8 - Experts Invited").

**Commit:**

```bash
git add components/academic/bos/meeting-timeline.tsx
git commit -m "feat(bos): add Meeting Timeline stepper component"
```

---

### Task 2.4: Build Meeting List & Detail Pages

**Files:**
- Create: `app/(routes)/academic/bos/meetings/page.tsx` (Server Component -- list)
- Create: `app/(routes)/academic/bos/meetings/_data/get-meetings.ts`
- Create: `app/(routes)/academic/bos/meetings/_components/columns.tsx`
- Create: `app/(routes)/academic/bos/meetings/_components/meeting-data-table.tsx`
- Create: `app/(routes)/academic/bos/meetings/_components/meeting-form.tsx`
- Create: `app/(routes)/academic/bos/meetings/_components/meeting-filters.tsx`
- Create: `app/(routes)/academic/bos/meetings/_components/row-actions.tsx`
- Create: `app/(routes)/academic/bos/meetings/new/page.tsx` (Client -- create)
- Create: `app/(routes)/academic/bos/meetings/[meetingId]/page.tsx` (Meeting detail hub)

**Meeting detail hub features:**
1. State machine stepper at the top
2. Tab navigation: Details | Agenda | Attendance | Course Reviews | Documents
3. Status transition buttons contextual to current state (per spec lines 1529-1537)
4. Each tab loads sub-page content

**Mobile:**
- Status stepper becomes vertical/compact
- Tabs become a horizontal scroll with smaller labels
- Action buttons stack vertically
- Detail fields stack in a single column

**Commit:**

```bash
git add app/(routes)/academic/bos/meetings/
git commit -m "feat(bos): add Meeting list, detail hub, and create form pages"
```

---

## Phase 3: Agenda, Attendance & Course Reviews

**Goal:** Build the meeting sub-features: agenda items with resolutions, attendance marking, and course review linking.

**Orchestrator delegation:**
```
1. api-developer -> Agenda + Attendance + Course Review API routes (PARALLEL)
2. ui-component-builder -> Agenda page + Attendance grid + Course review table (PARALLEL)
3. code-reviewer -> Review Phase 3
```

---

### Task 3.1: Build Agenda & Resolution API Routes

**Files:**
- Create: `app/api/bos/meetings/[id]/agenda/route.ts` (GET, POST)
- Create: `app/api/bos/agenda/[id]/route.ts` (PUT, DELETE)
- Create: `app/api/bos/resolution-actions/route.ts` (POST)
- Create: `app/api/bos/resolution-actions/[id]/route.ts` (PUT, DELETE)
- Create: `lib/services/academic/bos-agenda-service.ts`
- Create: `hooks/academic/use-bos-agenda.ts`

**Key details:**
- Agenda items join `bos_resolution_actions` and `bos_course_reviews`
- `item_number` is auto-assigned: `MAX(item_number) + 1 WHERE meeting_id = $1`
- Resolution actions are sub-rows under agenda items

---

### Task 3.2: Build Attendance API & Grid

**Files:**
- Create: `app/api/bos/meetings/[id]/attendance/route.ts` (GET, POST -- bulk save)
- Create: `lib/services/academic/bos-attendance-service.ts`
- Create: `hooks/academic/use-bos-attendance.ts`
- Create: `app/(routes)/academic/bos/meetings/[meetingId]/attendance/page.tsx`
- Create: `components/academic/bos/attendance-grid.tsx`

**Key features:**
- Pre-populated list of all composition members (sorted: Chairman first, then internal, then external)
- Toggle: Present / Absent / Leave of Absence (radio group)
- External experts: TA/DA eligible checkbox
- Quorum indicator: "X/Y members present" (red warning if < 50%)
- Bulk save: POST sends entire attendance array
- Upload signature page (file upload to Supabase Storage)

**Mobile:** Stacked member cards with toggle buttons (min 44px touch targets).

---

### Task 3.3: Build Course Review Linking

**Files:**
- Create: `app/api/bos/meetings/[id]/courses/route.ts` (GET, POST)
- Create: `lib/services/academic/bos-course-review-service.ts`
- Create: `app/(routes)/academic/bos/meetings/[meetingId]/courses/page.tsx`

**Key features:**
- Search COE courses by board (courses.board_id matches the meeting's board)
- Review action: Approved / Approved with Changes / Rejected / Deferred / Noted
- Changes suggested text field
- Linked to agenda item (optional)

---

### Task 3.4: Build Agenda Page

**Files:**
- Create: `app/(routes)/academic/bos/meetings/[meetingId]/agenda/page.tsx`
- Create: `components/academic/bos/resolution-tracker.tsx`

**Key features:**
- Numbered agenda items (add/reorder with drag handles)
- Expandable per item: Discussion notes, Resolution text, Status, Responsible person, Target date
- Action tracker sub-rows under each resolution
- "Link Course Review" button within agenda item

---

### Phase 3 Commit:

```bash
git add app/api/bos/meetings/*/agenda/ app/api/bos/meetings/*/attendance/ app/api/bos/meetings/*/courses/ app/api/bos/agenda/ app/api/bos/resolution-actions/ lib/services/academic/bos-agenda-service.ts lib/services/academic/bos-attendance-service.ts lib/services/academic/bos-course-review-service.ts hooks/academic/use-bos-agenda.ts hooks/academic/use-bos-attendance.ts app/(routes)/academic/bos/meetings/*/agenda/ app/(routes)/academic/bos/meetings/*/attendance/ app/(routes)/academic/bos/meetings/*/courses/ components/academic/bos/attendance-grid.tsx components/academic/bos/resolution-tracker.tsx
git commit -m "feat(bos): add Agenda, Attendance, and Course Review features"
```

---

## Phase 4: Document Generation

**Goal:** Build DOCX template-based document generation for meeting notices, call letters, minutes, and certificates.

**Orchestrator delegation:**
```
1. automation-engineer -> Template engine setup (docx-templater) (SEQUENTIAL)
2. api-developer -> Document generation API route (AFTER Step 1)
3. ui-component-builder -> Document management page
4. code-reviewer -> Review Phase 4
```

---

### Task 4.1: Set Up Document Template Engine

**Files:**
- Create: `lib/utils/bos-document-generator.ts`
- Create: `templates/bos/meeting_notice.docx` (template file)
- Create: `templates/bos/call_letter.docx`
- Create: `templates/bos/minutes_of_meeting.docx`

**Technology:** Use `docxtemplater` + `pizzip` for DOCX template filling. For PDF export, use `libreoffice` CLI or `pdf-lib`.

**Template variables per spec lines 1572-1578.**

---

### Task 4.2: Build Document Generation API

**Files:**
- Create: `app/api/bos/meetings/[id]/documents/route.ts` (POST -- generate, GET -- list)
- Create: `lib/services/academic/bos-document-service.ts`
- Create: `hooks/academic/use-bos-documents.ts`

**POST body:** `{ document_type, format: 'docx' | 'pdf', recipient_member_id? }`

**Flow:**
1. Load template from `/templates/bos/[document_type].docx`
2. Fetch all required data (meeting, composition, members, agenda)
3. Fill template using docxtemplater
4. Upload to COE Supabase Storage
5. Save record to `bos_documents` table
6. Return signed download URL

---

### Task 4.3: Build Document Management Page

**Files:**
- Create: `app/(routes)/academic/bos/meetings/[meetingId]/documents/page.tsx`
- Create: `components/academic/bos/document-download-panel.tsx`

**Key features:**
- Generate buttons per document type (contextual to meeting status)
- Call letter bulk generation (one per external expert, ZIP download)
- Document history table with generated timestamp and download links
- Email dispatch button (if email service configured)

---

## Phase 5: TA/DA Claims & Reports

**Goal:** Build TA/DA reimbursement tracking and NAAC/NBA-ready report exports.

**Orchestrator delegation:**
```
1. api-developer -> TA/DA API + Report API routes (PARALLEL)
2. ui-component-builder -> TA/DA page + Reports dashboard (PARALLEL)
3. technical-writer -> Update documentation
4. code-reviewer -> Final review
```

---

### Task 5.1: Build TA/DA Claims

**Files:**
- Create: `app/api/bos/ta-da/route.ts` (GET, POST)
- Create: `app/api/bos/ta-da/[id]/route.ts` (PUT, DELETE)
- Create: `lib/services/academic/bos-ta-da-service.ts`
- Create: `hooks/academic/use-bos-ta-da.ts` (custom hook name, NOT `use-bos-tada`)
- Create: `app/(routes)/academic/bos/ta-da/page.tsx`
- Create: `app/(routes)/academic/bos/ta-da/_components/ta-da-form.tsx`
- Create: `app/(routes)/academic/bos/ta-da/_components/columns.tsx`

**Key features:**
- Filter by meeting (select dropdown)
- Auto-populate external experts who attended the selected meeting (from attendance records with `ta_da_eligible = true`)
- Travel details: mode, from, to, amount
- DA: days, rate, amount
- Total auto-calculated (via DB `GENERATED ALWAYS AS` column)
- Claim status workflow: Draft -> Submitted -> Approved -> Paid
- Bill number and payment reference fields

---

### Task 5.2: Build Report API Routes

**Files:**
- Create: `app/api/bos/reports/composition/route.ts`
- Create: `app/api/bos/reports/meeting-register/route.ts`
- Create: `app/api/bos/reports/resolution-compliance/route.ts`
- Create: `app/api/bos/reports/syllabus-approval/route.ts`

**Report data:**
1. **Composition Report:** Member list in official format (S.No, Position, Name, Designation, Address, Contact, Email)
2. **Meeting Register:** All meetings for a board/academic year with attendance %, agenda items, resolutions
3. **Resolution Compliance:** All resolutions with action status (pending/in-progress/completed)
4. **Syllabus Approval:** Per course/regulation, certifying BoS approval date and meeting reference

---

### Task 5.3: Build Reports Dashboard

**Files:**
- Create: `app/(routes)/academic/bos/reports/page.tsx`
- Create: `app/(routes)/academic/bos/reports/_components/composition-report-panel.tsx`
- Create: `app/(routes)/academic/bos/reports/_components/meeting-register-table.tsx`
- Create: `app/(routes)/academic/bos/reports/_components/resolution-compliance-table.tsx`
- Create: `app/(routes)/academic/bos/reports/_components/syllabus-approval-panel.tsx`

**Key features:**
- Board selector + Academic year filter
- Each report section in a collapsible card
- Export buttons: PDF, DOCX, Excel
- NAAC/NBA ready formatting

---

### Task 5.4: Final Review & Documentation

**Agent:** `code-reviewer` + `technical-writer`

**Review checklist:**
- [ ] All 10 DB tables have corresponding API routes
- [ ] All API routes enforce institution scope via `resolveBosAccess()`
- [ ] All UI pages follow mobile-responsive patterns
- [ ] All UI labels use JKKN terminology (Learning Facilitator, not Faculty)
- [ ] All hooks use React Query (NOT useState + useCallback)
- [ ] All filter interfaces use camelCase
- [ ] Permission keys follow `academic.bos-[entity].[action]` format
- [ ] State machine transitions are validated server-side
- [ ] Document generation produces valid DOCX output
- [ ] Report exports match NAAC/NBA formats

**Final commit:**

```bash
git add .
git commit -m "feat(bos): complete Board of Studies module - all 5 phases"
```

---

## Validation Rules Summary

| Rule | Implementation Location |
|------|------------------------|
| One active composition per board | POST/PUT API: check `is_active = true` count per `board_id` |
| Member source exclusivity | DB constraint `bos_members_source_check` + API validation |
| One chairman per composition | POST API: check `member_type = 'chairman'` count per `composition_id` |
| Term dates 3 years | Form validation: `term_end_date = term_start_date + 3 years` |
| Meeting number uniqueness | DB constraint `UNIQUE(board_id, academic_year, meeting_number)` |
| State machine enforcement | `VALID_TRANSITIONS[current].includes(new)` in PATCH `/status` route |
| Attendance before completion | PATCH `/status` guard: check attendance records exist |
| Agenda before minutes | PATCH `/status` guard: check agenda items with resolutions exist |
| Quorum warning | UI warning (not blocking) if `present_count < total_count * 0.5` |
| TA/DA non-negative | DB constraint + form validation |
| No composition change after draft | PUT `/meetings` rejects `composition_id` change when `status !== 'draft'` |

---

## Environment Variables

```env
# Add to .env.local and .env.example in MyJKKN project
COE_SUPABASE_URL=https://your-coe-project.supabase.co
COE_SUPABASE_SERVICE_ROLE_KEY=your-coe-service-role-key

# Optional: Email dispatch
BOS_EMAIL_FROM=principal@jkkn.ac.in
BOS_EMAIL_REPLY_TO=iqac@jkkn.ac.in
```

---

## Open Questions (Clarify Before Starting)

1. Does MyJKKN already have `@tanstack/react-query` installed? If not, install it first.
2. Is there an existing `profiles` table in MyJKKN for staff lookup (for internal members)?
3. Which Supabase Storage bucket for BoS documents -- COE or MyJKKN?
4. Is there an existing email service (Resend, SendGrid, SMTP) in the project?
5. Does `board_type` (UG/PG) affect minimum member count or required categories?
6. Are DOCX templates stored in codebase (`/templates/`) or in Supabase Storage (admin-uploadable)?
7. Is "BoS Coordinator" an existing role in MyJKKN's RBAC, or a new one to create?

---

*Plan version: 1.0 | Created: 2026-03-07*
*Skills referenced: writing-plans, jkkn-terminologies, mobile-responsive, project-structure*
*Agents referenced: jkkn-coe-orchestrator, api-developer, ui-component-builder, code-architecture, code-reviewer, automation-engineer, technical-writer*

---
---

# APPENDIX: Full Board of Studies (BoS) Module Specification

> This is the complete spec embedded for self-contained reference. The implementation plan above is derived from this spec.




> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.



**Goal:** Build a full Board of Studies (BoS) management module for JKKN autonomous colleges, covering BoS composition management, meeting lifecycle (Draft â Approval â Notices â Meeting â Minutes â Ratification), document generation (meeting notices, call letters, minutes, certificates), resolution tracking with action follow-up, course/syllabus review linkage, and NAAC/NBA-ready reports. All operational tables reside in the **COE database**; the frontend is served from **MyJKKN** via proxy API routes.



**Architecture:** 7-layer pattern (Database â Types â Services â React Query Hooks â Server Data (_data/) â Components â Pages). COE database is accessed from MyJKKN via Next.js proxy API routes using a COE Supabase service-role client. Meetings follow a strict state machine. Documents are generated as DOCX (template-fill) with PDF export.



> **Skill Reference:** This module follows the `myjkkn-page-development` skill conventions exactly.

> Refer to `.claude/skills/myjkkn-page-development/SKILL.md` for full layer templates and component patterns.



**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase PostgreSQL (COE project), React Query (`@tanstack/react-query`) for hooks, Shadcn UI, Tailwind CSS, docx / pdf-lib for document generation.



---



## Regulatory & Institutional Context



### What is the Board of Studies?



The Board of Studies (BoS) is the primary academic body mandated by UGC/NAAC for every autonomous college. It is responsible for:

- Designing, reviewing, and approving curricula and syllabi for all programs under its purview

- Recommending new courses, credit structures, and evaluation methods

- Ensuring industry relevance and alignment with national education policy

- Meeting at least **once every six months** (UGC guideline)

- Providing documented evidence of academic governance for NAAC Criterion 1 & 2 and NBA SAR



### Applicable Regulatory Bodies



| Body | Role |

|---|---|

| **NAAC** | Criterion 1.1 (Curriculum Design), Criterion 2.1 (Student Enrolment); BoS records are primary evidence |

| **UGC** | Mandates BoS composition and minimum meeting frequency for autonomous colleges |

| **AICTE** | Engineering/technical programs: BoS must include industry representatives |

| **IQAC** | Internal Quality Assurance Cell coordinates BoS record-keeping and action reports |



### BoS Composition (UGC Standard)



| Position | Category | Source in System |

|---|---|---|

| Chairman | Head of Department | Auto-linked from staff/department records |

| Internal Members | All departmental faculty | Linked from learning facilitator (staff) records |

| University Nominee | Expert nominated by VC/university | External Expert Directory |

| Subject Expert | External expert from another institution | External Expert Directory |

| Industry Representative | Corporate/industry professional | External Expert Directory |

| Alumni | Meritorious alumnus | External Expert Directory |



**Term:** 3 years (UGC norm). System tracks term start/end and alerts HOD 60 days before expiry.



### BoS Structure in JKKN



- Each **Board** (`board` table in COE database) represents one BoS entity (e.g., "PG Computer Science Board")

- One board covers one or more programs/regulations

- All BoS tables reference `board.id` as the parent key

- `courses.board_id` links courses to the approving board



---



## Terminology



Standard academic terminology is used throughout (for NAAC/NBA compliance in official documents).



| Term | Used In |

|---|---|

| Board of Studies / BoS | Module name, official documents |

| Chairman | HOD role in BoS |

| Member | Internal faculty member |

| Subject Expert | External expert from another institution |

| University Nominee | Expert nominated by the Vice-Chancellor |

| Meeting Notice | Internal communication to members |

| Call Letter | Formal invitation sent to external experts |

| Minutes of Meeting | Official record of proceedings |

| Resolution | Decision/recommendation passed in a meeting |

| Action Taken Report | Record of how each resolution was implemented |

| Composition | The formal list of members for a BoS term |

| Syllabus Approval | Formal record of a course/regulation approved by BoS |



> **JKKN Internal UI Labels:** Use JKKN terminology where applicable â

> "Learning Facilitators" for internal members (faculty), "Learning Framework" for syllabus,

> "Learner" for student. Official document output always uses standard academic terms.



---



## System Architecture



### Data Flow



```

COE Database (Supabase)

  âââ board, courses, departments, institutions (existing)

  âââ bos_compositions, bos_members, bos_external_experts (NEW)

  âââ bos_meetings, bos_agenda_items, bos_resolutions (NEW)

  âââ bos_meeting_attendees, bos_course_reviews (NEW)

  âââ bos_ta_da_claims, bos_documents, bos_attachments (NEW)

       â

       â  COE Supabase Service Role Client

       â  (createCoeSupabaseClient â process.env.COE_SUPABASE_URL)

       â

MyJKKN Next.js API Routes (Proxy Layer)

  âââ app/api/bos/*  â authenticates MyJKKN user, then queries COE

       â

       â  fetch('/api/bos/...')

       â

MyJKKN Service Layer

  âââ lib/services/bos/*.ts  â calls proxy API routes

       â

MyJKKN Hooks

  âââ hooks/bos/*.ts

       â

MyJKKN Pages & Components

  âââ app/(routes)/academic/bos/**

  âââ components/academic/bos/**

```



### Multi-Institution Access Control



JKKN deploys a single MyJKKN instance shared across multiple colleges (institutions). BoS data is partitioned by `institutions_id` on every table. Access is enforced **server-side** in every API route using `lib/utils/bos-access.ts`.



#### Access Tiers



| User Type | `is_super_admin` | `role` | Access Scope |

|---|---|---|---|

| **Super Admin** | `true` | any | ALL institutions â no `institutions_id` filter applied |

| **Principal** | `false` | `principal` | Own institution only (`profile.institution_id` forced on all queries) |

| **HOD / Faculty** | `false` | `hod` / `faculty` | Own institution only; board scope via `bos_members.staff_id` |

| **Board Member** | `false` | any | Own institution; assigned to specific boards via `bos_members.staff_id` |



#### Data Flow â Multi-Institution Access



```

MyJKKN User (JWT)

       â

       â¼

API Route: auth check â resolveBosAccess(user.id)

       â

       âââ is_super_admin = true â no institution filter, query all

       â

       âââ is_super_admin = false

               â

               â¼

           profile.institution_id â forced onto all SELECT/INSERT/UPDATE

               â

               âââ GET  â .eq('institutions_id', scope.institutionsId)

               âââ POST â guardInstitutionWrite(scope, body.institutions_id)

                          â 403 if mismatch

```



#### Institution â Board Assignment



Board membership is tracked via `bos_members`:

- `bos_members.staff_id` â links a MyJKKN staff record (HOD/faculty) to a composition

- `bos_members.institutions_id` â ensures member is scoped to their institution

- `bos_members.composition_id â bos_compositions.board_id` â resolves which board the member belongs to



A staff member becomes a **Board Member** when they are added to a `bos_compositions` record for a specific `board_id` within their institution. No separate access-control table is required â membership itself is the authority.



#### Key Files



| File | Purpose |

|---|---|

| `lib/utils/bos-access.ts` | `resolveBosAccess()`, `applyInstitutionScope()`, `guardInstitutionWrite()` |

| `app/api/bos/meetings/route.ts` | GET + POST scoped |

| `app/api/bos/compositions/route.ts` | GET + POST scoped |

| `app/api/bos/boards/route.ts` | GET scoped |

| `app/api/bos/experts/route.ts` | GET + POST scoped |

| `app/api/bos/ta-da/route.ts` | GET + POST scoped |



---



### Meeting State Machine



```

DRAFT

  â

  â¼ (HOD submits for approval)

PRINCIPAL_APPROVED

  â

  â¼ (Notices generated & sent to internal members)

NOTICED

  â

  â¼ (Call letters generated & sent to external experts)

EXPERT_INVITED

  â

  â¼ (Meeting conducted, attendance recorded)

COMPLETED

  â

  â¼ (Minutes drafted and saved)

MINUTES_DRAFTED

  â

  â¼ (HOD/Chairman reviews and approves minutes)

MINUTES_APPROVED

  â

  â¼ (Academic Council ratification date recorded)

RATIFIED

```



---



## Database Schema (COE Database)



> **CRITICAL:** Create a new migration file in the COE project:

> `D:\JKKN\Development\Application\COE\jkkncoe\supabase\migrations\20260306_create_bos_tables.sql`

> Follow the existing COE migration file naming convention: `YYYYMMDD_description.sql`

> NEVER create standalone SQL files or modify existing migration files.



### Existing Tables Referenced (COE Database)



```sql

-- Already exists â do NOT modify

public.board         -- BoS entity (board_id, board_code, board_name, board_type, institutions_id)

                     -- board.institutions_id is the primary tenant key for all BoS data

public.courses       -- Courses with board_id FK â board

public.departments   -- Department data

public.institutions  -- Institution data (one row per college in JKKN group)

```



> **Multi-Institution Note:** Every BoS table carries `institutions_id` to support the JKKN

> group of colleges. `board.institutions_id` is the root authority â all child tables

> (compositions, meetings, members, etc.) inherit their institution from the board they belong

> to. The `bos_members.staff_id` column links a MyJKKN staff profile to a board, forming the

> institutionâboard assignment for HODs and faculty.



### Table: `bos_external_experts`



Master directory of external experts reusable across departments and meeting years.



```sql

CREATE TABLE bos_external_experts (

  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  name                VARCHAR(255) NOT NULL,

  title               VARCHAR(50),               -- Dr., Prof., Mr., Ms.

  designation         VARCHAR(255),              -- e.g., "Assistant Professor"

  institution_name    VARCHAR(255),              -- Employing institution (if academic)

  department_name     VARCHAR(255),

  address             TEXT,

  contact_no          VARCHAR(20),

  email               VARCHAR(255),

  category            VARCHAR(50) NOT NULL CHECK (category IN (

    'university_nominee', 'subject_expert', 'industry_expert', 'alumni'

  )),

  specialization      TEXT,

  qualifications      TEXT,                      -- e.g., "MCA, M.Phil, ME(CSE), Ph.D."

  is_active           BOOLEAN DEFAULT true,

  notes               TEXT,

  created_at          TIMESTAMPTZ DEFAULT now(),

  updated_at          TIMESTAMPTZ DEFAULT now()

);

```



### Table: `bos_compositions`



Formal constitution of a BoS for a specific board and term period.



```sql

CREATE TABLE bos_compositions (

  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  board_id            UUID NOT NULL REFERENCES board(id) ON DELETE CASCADE,

  composition_title   VARCHAR(255) NOT NULL,     -- e.g., "2024-2027 Composition"

  term_start_date     DATE NOT NULL,

  term_end_date       DATE NOT NULL,             -- term_start + 3 years

  academic_year       VARCHAR(10) NOT NULL,      -- e.g., "2024-25"

  is_active           BOOLEAN DEFAULT true,      -- only one active composition per board

  constituted_by      UUID,                      -- staff ID who constituted this BoS

  ratified_by_gc      BOOLEAN DEFAULT false,     -- Governing Council ratified

  ratified_date       DATE,

  notes               TEXT,

  created_at          TIMESTAMPTZ DEFAULT now(),

  updated_at          TIMESTAMPTZ DEFAULT now(),



  UNIQUE(board_id, term_start_date)

);

```



### Table: `bos_members`



Individual members belonging to a composition.



```sql

CREATE TABLE bos_members (

  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  composition_id      UUID NOT NULL REFERENCES bos_compositions(id) ON DELETE CASCADE,

  member_type         VARCHAR(30) NOT NULL CHECK (member_type IN (

    'chairman', 'internal_member', 'university_nominee',

    'subject_expert', 'industry_expert', 'alumni'

  )),

  -- Internal members (faculty/staff from MyJKKN)

  staff_id            UUID,                      -- NULL for external members

  staff_name          VARCHAR(255),              -- denormalized for display

  staff_designation   VARCHAR(255),

  -- External members

  expert_id           UUID REFERENCES bos_external_experts(id),

  -- Display fields (computed/denormalized)

  display_name        VARCHAR(255) NOT NULL,

  display_designation VARCHAR(255),

  display_institution VARCHAR(255),

  address             TEXT,

  contact_no          VARCHAR(20),

  email               VARCHAR(255),

  sort_order          INTEGER DEFAULT 0,

  is_active           BOOLEAN DEFAULT true,

  joined_date         DATE,

  left_date           DATE,

  created_at          TIMESTAMPTZ DEFAULT now(),

  updated_at          TIMESTAMPTZ DEFAULT now(),



  CONSTRAINT bos_members_source_check CHECK (

    (staff_id IS NOT NULL AND expert_id IS NULL) OR

    (staff_id IS NULL AND expert_id IS NOT NULL)

  )

);

```



### Table: `bos_meetings`



BoS meeting records with full state machine.



```sql

CREATE TABLE bos_meetings (

  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  board_id            UUID NOT NULL REFERENCES board(id) ON DELETE CASCADE,

  composition_id      UUID NOT NULL REFERENCES bos_compositions(id),

  meeting_number      INTEGER NOT NULL,          -- auto: sequential per board per academic_year

  academic_year       VARCHAR(10) NOT NULL,      -- e.g., "2024-25"

  meeting_title       VARCHAR(255),              -- e.g., "Second Meeting of PG CS BoS"

  meeting_type        VARCHAR(30) NOT NULL CHECK (meeting_type IN (

    'regular', 'special', 'emergency', 'online'

  )) DEFAULT 'regular',

  status              VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN (

    'draft', 'principal_approved', 'noticed', 'expert_invited',

    'completed', 'minutes_drafted', 'minutes_approved', 'ratified'

  )),

  -- Scheduling

  scheduled_date      DATE,

  scheduled_time      TIME,

  venue               VARCHAR(255),

  -- Conduct

  actual_date         DATE,

  actual_start_time   TIME,

  actual_end_time     TIME,

  quorum_met          BOOLEAN,

  -- Approval trail

  submitted_for_approval_at  TIMESTAMPTZ,

  principal_approved_at      TIMESTAMPTZ,

  principal_approved_by      UUID,               -- staff_id of principal

  -- Ratification

  ratified_by_ac      BOOLEAN DEFAULT false,     -- Academic Council ratified

  ratified_date       DATE,

  -- Agenda

  agenda_text         TEXT,                      -- overall meeting agenda description

  -- Minutes

  minutes_summary     TEXT,                      -- overall meeting summary

  minutes_drafted_at  TIMESTAMPTZ,

  minutes_approved_at TIMESTAMPTZ,

  minutes_approved_by UUID,

  -- Signature page

  signature_page_url  TEXT,                      -- uploaded scanned signature page

  notes               TEXT,

  created_by          UUID,

  created_at          TIMESTAMPTZ DEFAULT now(),

  updated_at          TIMESTAMPTZ DEFAULT now(),



  UNIQUE(board_id, academic_year, meeting_number)

);

```



### Table: `bos_meeting_attendees`



Attendance record per member per meeting.



```sql

CREATE TABLE bos_meeting_attendees (

  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  meeting_id          UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,

  member_id           UUID NOT NULL REFERENCES bos_members(id),

  attendance_status   VARCHAR(20) NOT NULL CHECK (attendance_status IN (

    'present', 'absent', 'leave_of_absence'

  )) DEFAULT 'absent',

  absence_reason      TEXT,

  ta_da_eligible      BOOLEAN DEFAULT false,     -- external experts only

  created_at          TIMESTAMPTZ DEFAULT now(),

  updated_at          TIMESTAMPTZ DEFAULT now(),



  UNIQUE(meeting_id, member_id)

);

```



### Table: `bos_agenda_items`



Individual agenda items discussed in a meeting.



```sql

CREATE TABLE bos_agenda_items (

  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  meeting_id          UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,

  item_number         INTEGER NOT NULL,          -- 1, 2, 3...

  item_title          VARCHAR(255) NOT NULL,     -- e.g., "Framing of Syllabus for 2024-25"

  item_description    TEXT,

  discussion_notes    TEXT,                      -- what was discussed

  resolution_text     TEXT,                      -- the resolution passed (can be null if no resolution)

  resolution_status   VARCHAR(20) CHECK (resolution_status IN (

    'pending', 'in_progress', 'completed', 'deferred', 'not_applicable'

  )),

  responsible_person  VARCHAR(255),              -- who is responsible for action

  target_date         DATE,

  sort_order          INTEGER DEFAULT 0,

  created_at          TIMESTAMPTZ DEFAULT now(),

  updated_at          TIMESTAMPTZ DEFAULT now(),



  UNIQUE(meeting_id, item_number)

);

```



### Table: `bos_resolution_actions`



Action tracking for follow-up on resolutions.



```sql

CREATE TABLE bos_resolution_actions (

  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  agenda_item_id      UUID NOT NULL REFERENCES bos_agenda_items(id) ON DELETE CASCADE,

  action_description  TEXT NOT NULL,

  action_date         DATE,

  action_by           VARCHAR(255),

  remarks             TEXT,

  status              VARCHAR(20) NOT NULL CHECK (status IN (

    'pending', 'in_progress', 'completed'

  )) DEFAULT 'pending',

  created_at          TIMESTAMPTZ DEFAULT now(),

  updated_at          TIMESTAMPTZ DEFAULT now()

);

```



### Table: `bos_course_reviews`



Courses reviewed and approved/rejected in a specific meeting.



```sql

CREATE TABLE bos_course_reviews (

  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  meeting_id          UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,

  agenda_item_id      UUID REFERENCES bos_agenda_items(id),

  course_id           UUID NOT NULL,             -- references COE courses.id

  course_code         VARCHAR(50) NOT NULL,      -- denormalized

  course_name         VARCHAR(255) NOT NULL,     -- denormalized

  review_action       VARCHAR(30) NOT NULL CHECK (review_action IN (

    'approved', 'approved_with_changes', 'rejected', 'deferred', 'noted'

  )),

  changes_suggested   TEXT,

  remarks             TEXT,

  regulation_code     VARCHAR(50),

  created_at          TIMESTAMPTZ DEFAULT now()

);

```



### Table: `bos_ta_da_claims`



TA/DA reimbursement tracking for external experts.



```sql

CREATE TABLE bos_ta_da_claims (

  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  meeting_id          UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,

  member_id           UUID NOT NULL REFERENCES bos_members(id),

  expert_id           UUID NOT NULL REFERENCES bos_external_experts(id),

  -- Travel

  travel_mode         VARCHAR(50),               -- bus, train, air, own vehicle

  travel_from         VARCHAR(255),

  travel_to           VARCHAR(255),

  travel_amount       NUMERIC(10,2) DEFAULT 0,

  -- Daily allowance

  da_days             NUMERIC(4,1) DEFAULT 1,

  da_rate             NUMERIC(8,2) DEFAULT 0,

  da_amount           NUMERIC(10,2) DEFAULT 0,

  -- Other

  other_amount        NUMERIC(10,2) DEFAULT 0,

  other_description   TEXT,

  total_amount        NUMERIC(10,2) GENERATED ALWAYS AS (

    travel_amount + da_amount + other_amount

  ) STORED,

  -- Status

  claim_status        VARCHAR(20) NOT NULL CHECK (claim_status IN (

    'draft', 'submitted', 'approved', 'paid'

  )) DEFAULT 'draft',

  bill_number         VARCHAR(50),

  payment_date        DATE,

  payment_reference   VARCHAR(100),

  notes               TEXT,

  created_at          TIMESTAMPTZ DEFAULT now(),

  updated_at          TIMESTAMPTZ DEFAULT now(),



  UNIQUE(meeting_id, member_id)

);

```



### Table: `bos_documents`



Generated documents metadata (notices, call letters, minutes PDFs).



```sql

CREATE TABLE bos_documents (

  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  meeting_id          UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,

  document_type       VARCHAR(50) NOT NULL CHECK (document_type IN (

    'meeting_notice', 'call_letter', 'minutes_of_meeting',

    'composition_certificate', 'syllabus_approval_certificate',

    'ta_da_bill', 'action_taken_report'

  )),

  file_name           VARCHAR(255) NOT NULL,

  file_url            TEXT NOT NULL,             -- Supabase Storage URL

  file_format         VARCHAR(10) NOT NULL CHECK (file_format IN ('pdf', 'docx')),

  recipient_member_id UUID REFERENCES bos_members(id),  -- NULL = general document

  generated_at        TIMESTAMPTZ DEFAULT now(),

  generated_by        UUID,

  is_latest           BOOLEAN DEFAULT true       -- supersedes previous versions

);

```



---



## Module Structure (MyJKKN Folder Conventions â 7-Layer)



> Follows the `myjkkn-page-development` skill structure exactly.

> BoS is under the `academic` module group. Services use `fetch()` (not direct Supabase) because data lives in the COE database accessed via proxy API routes.



```

MyJKKN/

â

âââ types/

â   âââ bos.ts                                    # Layer 2: All BoS TypeScript interfaces

â

âââ lib/supabase/

â   âââ coe-client.ts                             # NEW â COE Supabase server client

â

âââ lib/services/academic/                         # Layer 3: Service layer (fetch-based proxy)

â   âââ bos-composition-service.ts

â   âââ bos-member-service.ts

â   âââ bos-expert-service.ts

â   âââ bos-meeting-service.ts

â   âââ bos-agenda-service.ts

â   âââ bos-attendance-service.ts

â   âââ bos-course-review-service.ts

â   âââ bos-ta-da-service.ts

â   âââ bos-document-service.ts

â

âââ hooks/academic/                                # Layer 4: React Query hooks

â   âââ use-bos-compositions.ts

â   âââ use-bos-members.ts

â   âââ use-bos-experts.ts

â   âââ use-bos-meetings.ts

â   âââ use-bos-agenda.ts

â   âââ use-bos-attendance.ts

â   âââ use-bos-documents.ts

â

âââ components/academic/bos/                       # Layer 6: Shared BoS UI components

â   âââ member-category-badge.tsx                  # Color-coded: Chairman/Internal/External

â   âââ meeting-status-badge.tsx                   # State machine status chip

â   âââ composition-member-card.tsx                # Member card with photo placeholder

â   âââ meeting-timeline.tsx                       # Visual state machine progress

â   âââ attendance-grid.tsx                        # Present/Absent toggle grid

â   âââ resolution-tracker.tsx                     # Agenda items + resolutions + actions

â   âââ document-download-panel.tsx                # Download notices/minutes

â

âââ app/(routes)/academic/bos/                     # Layer 7: Pages

â   â

â   âââ layout.tsx                                 # BoS sub-navigation layout

â   âââ page.tsx                                   # BoS Dashboard (Server Component)

â   â

â   âââ experts/                                   # External Expert Directory

â   â   âââ page.tsx                               # Server Component â list page

â   â   âââ new/page.tsx                           # Client Component â create form

â   â   âââ [id]/edit/page.tsx                     # Client Component â edit form

â   â   âââ _components/

â   â       âââ columns.tsx                        # TanStack Table column defs

â   â       âââ expert-data-table.tsx              # DataTable wrapper + toolbar

â   â       âââ expert-form.tsx                    # Create/Edit form (shared)

â   â       âââ expert-filters.tsx                 # Filter UI (presentation)

â   â       âââ expert-filters-client.tsx          # Filter logic (URL state)

â   â       âââ row-actions.tsx                    # View/Edit/Delete dropdown

â   â       âââ data-table-schema.ts               # Zod schema for URL search params

â   â   âââ _data/

â   â       âââ get-experts.ts                     # Layer 5: Server-side data fetch

â   â

â   âââ compositions/                              # BoS Composition Management

â   â   âââ page.tsx                               # Server Component â list

â   â   âââ new/page.tsx                           # Client Component

â   â   âââ [compositionId]/

â   â   â   âââ page.tsx                           # Detail (member list card view)

â   â   â   âââ edit/page.tsx

â   â   âââ _components/

â   â       âââ columns.tsx

â   â       âââ composition-data-table.tsx

â   â       âââ composition-form.tsx

â   â       âââ composition-filters.tsx

â   â       âââ composition-filters-client.tsx

â   â       âââ member-list.tsx                    # S.No / Position / Name / Designation grid

â   â       âââ add-member-drawer.tsx              # Sheet: search staff or pick expert

â   â       âââ row-actions.tsx

â   â       âââ data-table-schema.ts

â   â   âââ _data/

â   â       âââ get-compositions.ts

â   â

â   âââ meetings/                                  # Meeting Management

â   â   âââ page.tsx                               # Server Component â meeting list

â   â   âââ new/page.tsx                           # Client Component

â   â   âââ [meetingId]/

â   â   â   âââ page.tsx                           # Meeting detail hub (tabs)

â   â   â   âââ agenda/page.tsx                    # Agenda & resolution entry

â   â   â   âââ attendance/page.tsx                # Attendance marking

â   â   â   âââ courses/page.tsx                   # Course review entry

â   â   â   âââ minutes/page.tsx                   # Minutes drafting

â   â   â   âââ documents/page.tsx                 # Generate & download documents

â   â   âââ _components/

â   â       âââ columns.tsx

â   â       âââ meeting-data-table.tsx

â   â       âââ meeting-form.tsx

â   â       âââ meeting-filters.tsx

â   â       âââ meeting-filters-client.tsx

â   â       âââ meeting-status-stepper.tsx         # 8-step state machine visual

â   â       âââ agenda-item-form.tsx

â   â       âââ resolution-form.tsx

â   â       âââ action-tracker-row.tsx

â   â       âââ course-review-table.tsx

â   â       âââ attendance-grid.tsx

â   â       âââ notice-preview.tsx

â   â       âââ row-actions.tsx

â   â       âââ data-table-schema.ts

â   â   âââ _data/

â   â       âââ get-meetings.ts

â   â

â   âââ ta-da/

â   â   âââ page.tsx

â   â   âââ _components/

â   â       âââ columns.tsx

â   â       âââ ta-da-data-table.tsx

â   â       âââ ta-da-form.tsx

â   â       âââ row-actions.tsx

â   â       âââ data-table-schema.ts

â   â   âââ _data/

â   â       âââ get-ta-da.ts

â   â

â   âââ reports/

â       âââ page.tsx

â       âââ _components/

â           âââ composition-report-panel.tsx

â           âââ meeting-register-table.tsx

â           âââ resolution-compliance-table.tsx

â           âââ syllabus-approval-panel.tsx

â

âââ app/api/bos/                                   # Proxy API routes (COE database)

    âââ compositions/

    â   âââ route.ts                               # GET, POST

    â   âââ [id]/route.ts                          # GET, PUT, DELETE

    âââ members/

    â   âââ route.ts                               # GET, POST

    â   âââ [id]/route.ts                          # PUT, DELETE

    âââ experts/

    â   âââ route.ts                               # GET, POST

    â   âââ [id]/route.ts

    âââ meetings/

    â   âââ route.ts                               # GET, POST

    â   âââ next-number/route.ts                   # GET (auto meeting number)

    â   âââ [id]/route.ts                          # GET, PUT

    â   âââ [id]/status/route.ts                   # PATCH (state transitions)

    â   âââ [id]/agenda/route.ts                   # GET, POST

    â   âââ [id]/attendance/route.ts               # GET, POST (bulk)

    â   âââ [id]/courses/route.ts                  # GET, POST

    â   âââ [id]/documents/route.ts                # POST (generate), GET

    âââ ta-da/

    â   âââ route.ts

    â   âââ [id]/route.ts

    âââ reports/

        âââ composition/route.ts

        âââ meeting-register/route.ts

        âââ resolution-compliance/route.ts

        âââ syllabus-approval/route.ts

```



---



## TypeScript Interfaces (`types/bos.ts`)



```typescript

// types/bos.ts



// ââ Enums & Union Types âââââââââââââââââââââââââââââââââââââââââââââââââââââ



export type BosExpertCategory =

  | 'university_nominee'

  | 'subject_expert'

  | 'industry_expert'

  | 'alumni';



export type BosMemberType =

  | 'chairman'

  | 'internal_member'

  | 'university_nominee'

  | 'subject_expert'

  | 'industry_expert'

  | 'alumni';



export type BosMeetingStatus =

  | 'draft'

  | 'principal_approved'

  | 'noticed'

  | 'expert_invited'

  | 'completed'

  | 'minutes_drafted'

  | 'minutes_approved'

  | 'ratified';



export type BosMeetingType = 'regular' | 'special' | 'emergency' | 'online';



export type BosAttendanceStatus = 'present' | 'absent' | 'leave_of_absence';



export type BosResolutionStatus =

  | 'pending'

  | 'in_progress'

  | 'completed'

  | 'deferred'

  | 'not_applicable';



export type BosCourseReviewAction =

  | 'approved'

  | 'approved_with_changes'

  | 'rejected'

  | 'deferred'

  | 'noted';



export type BosDocumentType =

  | 'meeting_notice'

  | 'call_letter'

  | 'minutes_of_meeting'

  | 'composition_certificate'

  | 'syllabus_approval_certificate'

  | 'ta_da_bill'

  | 'action_taken_report';



export type BosClaimStatus = 'draft' | 'submitted' | 'approved' | 'paid';



// ââ Label Maps ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ



export const BOS_MEMBER_TYPE_LABELS: Record<BosMemberType, string> = {

  chairman: 'Chairman',

  internal_member: 'Member',

  university_nominee: 'University Nominee',

  subject_expert: 'Subject Expert',

  industry_expert: 'Industry Expert',

  alumni: 'Alumni',

};



export const BOS_MEETING_STATUS_LABELS: Record<BosMeetingStatus, string> = {

  draft: 'Draft',

  principal_approved: 'Principal Approved',

  noticed: 'Notice Sent',

  expert_invited: 'Experts Invited',

  completed: 'Meeting Completed',

  minutes_drafted: 'Minutes Drafted',

  minutes_approved: 'Minutes Approved',

  ratified: 'Ratified',

};



// ââ External Expert âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ



export interface BosExternalExpert {

  id: string;

  institutions_id: string;

  name: string;

  title?: string;

  designation?: string;

  institution_name?: string;

  department_name?: string;

  address?: string;

  contact_no?: string;

  email?: string;

  category: BosExpertCategory;

  specialization?: string;

  qualifications?: string;

  is_active: boolean;

  notes?: string;

  created_at: string;

  updated_at: string;

}



export type CreateBosExpertDto = Omit<BosExternalExpert, 'id' | 'created_at' | 'updated_at'>;

export type UpdateBosExpertDto = Partial<CreateBosExpertDto>;



// Filters use camelCase (per myjkkn-page-development skill convention)

export interface BosExpertFilters {

  institutionsId?: string;

  category?: BosExpertCategory;

  isActive?: boolean;

  search?: string;

  page?: number;

  limit?: number;

  sortBy?: string;

  sortOrder?: 'asc' | 'desc';

}



// ââ Composition âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ



export interface BosComposition {

  id: string;

  institutions_id: string;

  board_id: string;

  composition_title: string;

  term_start_date: string;

  term_end_date: string;

  academic_year: string;

  is_active: boolean;

  constituted_by?: string;

  ratified_by_gc: boolean;

  ratified_date?: string;

  notes?: string;

  created_at: string;

  updated_at: string;

  // Joined

  board?: { board_code: string; board_name: string; board_type?: string };

  members?: BosMember[];

  member_count?: number;

}



export type CreateBosCompositionDto = Omit<BosComposition, 'id' | 'created_at' | 'updated_at' | 'board' | 'members' | 'member_count'>;

export type UpdateBosCompositionDto = Partial<CreateBosCompositionDto>;



export interface BosCompositionFilters {

  institutionsId?: string;

  boardId?: string;

  academicYear?: string;

  isActive?: boolean;

  search?: string;

  page?: number;

  limit?: number;

  sortBy?: string;

  sortOrder?: 'asc' | 'desc';

}



// ââ Member âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ



export interface BosMember {

  id: string;

  institutions_id: string;

  composition_id: string;

  member_type: BosMemberType;

  staff_id?: string;

  staff_name?: string;

  staff_designation?: string;

  expert_id?: string;

  display_name: string;

  display_designation?: string;

  display_institution?: string;

  address?: string;

  contact_no?: string;

  email?: string;

  sort_order: number;

  is_active: boolean;

  joined_date?: string;

  left_date?: string;

  created_at: string;

  updated_at: string;

  // Joined

  expert?: BosExternalExpert;

}



export type CreateBosMemberDto = Omit<BosMember, 'id' | 'created_at' | 'updated_at' | 'expert'>;

export type UpdateBosMemberDto = Partial<CreateBosMemberDto>;



// ââ Meeting ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ



export interface BosMeeting {

  id: string;

  institutions_id: string;

  board_id: string;

  composition_id: string;

  meeting_number: number;

  academic_year: string;

  meeting_title?: string;

  meeting_type: BosMeetingType;

  status: BosMeetingStatus;

  scheduled_date?: string;

  scheduled_time?: string;

  venue?: string;

  actual_date?: string;

  actual_start_time?: string;

  actual_end_time?: string;

  quorum_met?: boolean;

  submitted_for_approval_at?: string;

  principal_approved_at?: string;

  principal_approved_by?: string;

  ratified_by_ac: boolean;

  ratified_date?: string;

  agenda_text?: string;

  minutes_summary?: string;

  minutes_drafted_at?: string;

  minutes_approved_at?: string;

  minutes_approved_by?: string;

  signature_page_url?: string;

  notes?: string;

  created_by?: string;

  created_at: string;

  updated_at: string;

  // Joined

  board?: { board_code: string; board_name: string };

  composition?: { composition_title: string };

  attendee_count?: number;

  agenda_item_count?: number;

}



export type CreateBosMeetingDto = Omit<BosMeeting, 'id' | 'meeting_number' | 'created_at' | 'updated_at' | 'board' | 'composition' | 'attendee_count' | 'agenda_item_count'>;

export type UpdateBosMeetingDto = Partial<CreateBosMeetingDto>;



export interface BosMeetingFilters {

  institutionsId?: string;

  boardId?: string;

  compositionId?: string;

  academicYear?: string;

  status?: BosMeetingStatus;

  meetingType?: BosMeetingType;

  search?: string;

  page?: number;

  limit?: number;

  sortBy?: string;

  sortOrder?: 'asc' | 'desc';

}



// ââ Meeting Attendee âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ



export interface BosMeetingAttendee {

  id: string;

  institutions_id: string;

  meeting_id: string;

  member_id: string;

  attendance_status: BosAttendanceStatus;

  absence_reason?: string;

  ta_da_eligible: boolean;

  created_at: string;

  updated_at: string;

  // Joined

  member?: BosMember;

}



// ââ Agenda Item ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ



export interface BosAgendaItem {

  id: string;

  institutions_id: string;

  meeting_id: string;

  item_number: number;

  item_title: string;

  item_description?: string;

  discussion_notes?: string;

  resolution_text?: string;

  resolution_status?: BosResolutionStatus;

  responsible_person?: string;

  target_date?: string;

  sort_order: number;

  created_at: string;

  updated_at: string;

  // Joined

  actions?: BosResolutionAction[];

  course_reviews?: BosCourseReview[];

}



export type CreateBosAgendaItemDto = Omit<BosAgendaItem, 'id' | 'created_at' | 'updated_at' | 'actions' | 'course_reviews'>;

export type UpdateBosAgendaItemDto = Partial<CreateBosAgendaItemDto>;



// ââ Resolution Action ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ



export interface BosResolutionAction {

  id: string;

  institutions_id: string;

  agenda_item_id: string;

  action_description: string;

  action_date?: string;

  action_by?: string;

  remarks?: string;

  status: 'pending' | 'in_progress' | 'completed';

  created_at: string;

  updated_at: string;

}



// ââ Course Review ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ



export interface BosCourseReview {

  id: string;

  institutions_id: string;

  meeting_id: string;

  agenda_item_id?: string;

  course_id: string;

  course_code: string;

  course_name: string;

  review_action: BosCourseReviewAction;

  changes_suggested?: string;

  remarks?: string;

  regulation_code?: string;

  created_at: string;

}



// ââ TA/DA Claim ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ



export interface BosTaDaClaim {

  id: string;

  institutions_id: string;

  meeting_id: string;

  member_id: string;

  expert_id: string;

  travel_mode?: string;

  travel_from?: string;

  travel_to?: string;

  travel_amount: number;

  da_days: number;

  da_rate: number;

  da_amount: number;

  other_amount: number;

  other_description?: string;

  total_amount: number;

  claim_status: BosClaimStatus;

  bill_number?: string;

  payment_date?: string;

  payment_reference?: string;

  notes?: string;

  created_at: string;

  updated_at: string;

  // Joined

  member?: BosMember;

  expert?: BosExternalExpert;

}



// ââ Document âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ



export interface BosDocument {

  id: string;

  institutions_id: string;

  meeting_id: string;

  document_type: BosDocumentType;

  file_name: string;

  file_url: string;

  file_format: 'pdf' | 'docx';

  recipient_member_id?: string;

  generated_at: string;

  generated_by?: string;

  is_latest: boolean;

}



// ââ Report Types âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ



export interface BosCompositionReport {

  board_name: string;

  board_code: string;

  composition_title: string;

  term_start_date: string;

  term_end_date: string;

  members: Array<{

    sno: number;

    position: string;

    name: string;

    designation: string;

    address: string;

    contact_no: string;

    email: string;

    category: BosMemberType;

  }>;

}



export interface BosMeetingRegisterEntry {

  meeting_number: number;

  meeting_title: string;

  academic_year: string;

  scheduled_date: string;

  status: BosMeetingStatus;

  attendee_count: number;

  total_members: number;

  agenda_item_count: number;

  resolutions_count: number;

  courses_reviewed: number;

}



// ââ Filters ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ



export interface BosFilters {

  institutionsId?: string;

  boardId?: string;

  academicYear?: string;

}



export interface BosListResponse<T> {

  data: T[];

  metadata: {

    total: number;

    page: number;

    limit: number;

    totalPages: number;

  };

}

```



---



## Service Layer (`lib/services/bos/`)



> **KEY DIFFERENCE from other services:** BoS services use `fetch()` to call MyJKKN's own proxy API routes (not direct Supabase client), because the data lives in the COE database.



### COE Client (`lib/supabase/coe-client.ts`)



```typescript

// lib/supabase/coe-client.ts

// Server-side only â used inside app/api/bos/* routes

import { createClient } from '@supabase/supabase-js';



export function createCoeSupabaseClient() {

  const url = process.env.COE_SUPABASE_URL;

  const key = process.env.COE_SUPABASE_SERVICE_ROLE_KEY;



  if (!url || !key) {

    throw new Error('COE Supabase environment variables not configured');

  }



  return createClient(url, key, {

    auth: { persistSession: false }

  });

}

```



### Service Pattern (`lib/services/bos/bos-composition-service.ts`)



```typescript

// lib/services/bos/bos-composition-service.ts

import { logger } from '@/lib/utils/enhanced-logger';

import type {

  BosComposition,

  BosCompositionFilters,

  CreateBosCompositionDto,

  UpdateBosCompositionDto,

  BosListResponse,

} from '@/types/bos';



export class BosCompositionService {

  private static baseUrl = '/api/bos/compositions';



  static async getCompositions(

    filters: BosCompositionFilters = {}

  ): Promise<BosListResponse<BosComposition>> {

    try {

      const params = new URLSearchParams();

      Object.entries(filters).forEach(([k, v]) => {

        if (v !== undefined && v !== null) params.set(k, String(v));

      });



      const res = await fetch(`${this.baseUrl}?${params}`);

      if (!res.ok) {

        const err = await res.json();

        throw new Error(err.error || 'Failed to fetch compositions');

      }

      return res.json();

    } catch (error) {

      logger.error('bos/compositions', 'Error fetching compositions', error);

      throw error;

    }

  }



  static async createComposition(

    data: CreateBosCompositionDto

  ): Promise<BosComposition> {

    try {

      const res = await fetch(this.baseUrl, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify(data),

      });

      if (!res.ok) {

        const err = await res.json();

        const enhanced: any = new Error(err.error || 'Failed to create composition');

        enhanced.code = err.code;

        throw enhanced;

      }

      return res.json();

    } catch (error) {

      logger.error('bos/compositions', 'Error creating composition', error);

      throw error;

    }

  }



  static async updateComposition(

    id: string,

    data: UpdateBosCompositionDto

  ): Promise<BosComposition> {

    try {

      const res = await fetch(`${this.baseUrl}/${id}`, {

        method: 'PUT',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify(data),

      });

      if (!res.ok) throw new Error((await res.json()).error);

      return res.json();

    } catch (error) {

      logger.error('bos/compositions', 'Error updating composition', error);

      throw error;

    }

  }



  static async deleteComposition(id: string): Promise<void> {

    try {

      const res = await fetch(`${this.baseUrl}/${id}`, { method: 'DELETE' });

      if (!res.ok) throw new Error((await res.json()).error);

    } catch (error) {

      logger.error('bos/compositions', 'Error deleting composition', error);

      throw error;

    }

  }

}

```



### Meeting Service (with state transition) â Key methods



```typescript

// lib/services/bos/bos-meeting-service.ts  (selected methods)



static async transitionStatus(

  meetingId: string,

  newStatus: BosMeetingStatus,

  metadata?: Record<string, unknown>

): Promise<BosMeeting> {

  const res = await fetch(`/api/bos/meetings/${meetingId}/status`, {

    method: 'PATCH',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify({ status: newStatus, ...metadata }),

  });

  if (!res.ok) throw new Error((await res.json()).error);

  return res.json();

}



static async getNextMeetingNumber(

  boardId: string,

  academicYear: string

): Promise<number> {

  const res = await fetch(

    `/api/bos/meetings/next-number?boardId=${boardId}&academicYear=${academicYear}`

  );

  if (!res.ok) throw new Error('Failed to get meeting number');

  const { next_number } = await res.json();

  return next_number;

}

```



---



## Hook Pattern (`hooks/academic/use-bos-compositions.ts`)



> **Skill rule:** Hooks use **React Query** (`useQuery` / `useMutation`) â NOT manual `useState + useCallback`.

> BoS hooks call the `fetch()`-based services, which proxy to COE. React Query wraps any async function.



```typescript

// hooks/academic/use-bos-compositions.ts



import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { toast } from 'react-hot-toast';

import { useRouter } from 'next/navigation';

import { BosCompositionService } from '@/lib/services/academic/bos-composition-service';

import { usePermissions } from '@/hooks/use-permissions';

import { QUERY_CONFIG } from '@/lib/config/query-config';

import type {

  BosCompositionFilters,

  CreateBosCompositionDto,

  UpdateBosCompositionDto,

} from '@/types/bos';



// ââ Query hook (list) ââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export function useBosCompositions(filters: BosCompositionFilters = {}) {

  const { userProfile } = usePermissions();



  const scopedFilters: BosCompositionFilters = {

    ...filters,

    institutionsId: userProfile?.institution_id ?? filters.institutionsId,

  };



  return useQuery({

    queryKey: ['bos-compositions', scopedFilters],

    queryFn: () => BosCompositionService.getCompositions(scopedFilters),

    placeholderData: (previousData) => previousData,

    enabled: !!userProfile?.institution_id,

    ...QUERY_CONFIG.SEMI_STABLE_DATA,   // staleTime: 2min (compositions change rarely mid-session)

  });

}



// ââ Query hook (single) ââââââââââââââââââââââââââââââââââââââââââââââââââââ

export function useBosComposition(id: string) {

  return useQuery({

    queryKey: ['bos-compositions', id],

    queryFn: () => BosCompositionService.getComposition(id),

    enabled: !!id,

    ...QUERY_CONFIG.SEMI_STABLE_DATA,

  });

}



// ââ Mutation: Create âââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export function useCreateBosComposition() {

  const queryClient = useQueryClient();

  const router = useRouter();



  return useMutation({

    mutationFn: (data: CreateBosCompositionDto) =>

      BosCompositionService.createComposition(data),

    onSuccess: () => {

      toast.success('BoS composition created successfully');

      queryClient.invalidateQueries({ queryKey: ['bos-compositions'] });

      router.refresh();

    },

    onError: (error: Error) => {

      toast.error(error.message || 'Failed to create composition');

    },

  });

}



// ââ Mutation: Update âââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export function useUpdateBosComposition() {

  const queryClient = useQueryClient();



  return useMutation({

    mutationFn: ({ id, data }: { id: string; data: UpdateBosCompositionDto }) =>

      BosCompositionService.updateComposition(id, data),

    onSuccess: () => {

      toast.success('Composition updated successfully');

      queryClient.invalidateQueries({ queryKey: ['bos-compositions'] });

    },

    onError: (error: Error) => {

      toast.error(error.message || 'Failed to update composition');

    },

  });

}



// ââ Mutation: Delete âââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export function useDeleteBosComposition() {

  const queryClient = useQueryClient();



  return useMutation({

    mutationFn: (id: string) => BosCompositionService.deleteComposition(id),

    onSuccess: () => {

      toast.success('Composition deleted');

      queryClient.invalidateQueries({ queryKey: ['bos-compositions'] });

    },

    onError: (error: Error) => {

      toast.error(error.message || 'Failed to delete composition');

    },

  });

}

```



### Query Key Convention



| Entity | Query Key |

|---|---|

| Compositions list | `['bos-compositions', filters]` |

| Single composition | `['bos-compositions', id]` |

| Meetings list | `['bos-meetings', filters]` |

| Single meeting | `['bos-meetings', id]` |

| Experts list | `['bos-experts', filters]` |

| Members list | `['bos-members', compositionId]` |

| Agenda items | `['bos-agenda', meetingId]` |

| Attendance | `['bos-attendance', meetingId]` |



### Caching Tiers (per skill)



```

STABLE_DATA:       staleTime: 5min,  gcTime: 10min  â Expert directory, composition data

SEMI_STABLE_DATA:  staleTime: 2min,  gcTime: 5min   â Meetings list, member list

DYNAMIC_DATA:      staleTime: 30sec, gcTime: 5min   â Attendance, resolution status, TA/DA

```



### Cache Invalidation (after mutations)



```typescript

// Invalidate related queries after state transitions:

queryClient.invalidateQueries({ queryKey: ['bos-meetings'] });

queryClient.invalidateQueries({ queryKey: ['bos-meetings', meetingId] });

router.refresh();  // Invalidate Next.js server cache

```



---



## API Proxy Routes (`app/api/bos/`)



> All proxy routes authenticate the MyJKKN user first, then query the COE database using the service-role client.



### Pattern (`app/api/bos/compositions/route.ts`)



```typescript

// app/api/bos/compositions/route.ts

import { NextRequest, NextResponse } from 'next/server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

import { createCoeSupabaseClient } from '@/lib/supabase/coe-client';

import { logger } from '@/lib/utils/enhanced-logger';



export async function GET(request: NextRequest) {

  try {

    // 1. Authenticate MyJKKN user

    const supabase = createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });



    // 2. Parse filters

    const { searchParams } = new URL(request.url);

    const filters = {

      institutions_id: searchParams.get('institutions_id') ?? undefined,

      board_id: searchParams.get('board_id') ?? undefined,

      academic_year: searchParams.get('academic_year') ?? undefined,

      is_active: searchParams.has('is_active')

        ? searchParams.get('is_active') === 'true'

        : undefined,

      page: Number(searchParams.get('page') ?? '1'),

      limit: Number(searchParams.get('limit') ?? '20'),

    };



    // 3. Query COE database

    const coe = createCoeSupabaseClient();

    let query = (coe as any)

      .from('bos_compositions')

      .select('*, board:board(board_code, board_name, board_type)', { count: 'exact' });



    if (filters.institutions_id) query = query.eq('institutions_id', filters.institutions_id);

    if (filters.board_id) query = query.eq('board_id', filters.board_id);

    if (filters.academic_year) query = query.eq('academic_year', filters.academic_year);

    if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);



    const offset = (filters.page - 1) * filters.limit;

    query = query.range(offset, offset + filters.limit - 1).order('created_at', { ascending: false });



    const { data, error, count } = await query;

    if (error) throw error;



    return NextResponse.json({

      data: data || [],

      metadata: {

        total: count || 0,

        page: filters.page,

        limit: filters.limit,

        totalPages: count ? Math.ceil(count / filters.limit) : 0,

      },

    });

  } catch (error) {

    logger.error('bos/compositions', 'GET error', error);

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });

  }

}



export async function POST(request: NextRequest) {

  try {

    const supabase = createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });



    const body = await request.json();

    const coe = createCoeSupabaseClient();



    const { data, error } = await (coe as any)

      .from('bos_compositions')

      .insert([body])

      .select()

      .single();



    if (error) {

      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });

    }



    return NextResponse.json(data, { status: 201 });

  } catch (error) {

    logger.error('bos/compositions', 'POST error', error);

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });

  }

}

```



### State Transition Route (`app/api/bos/meetings/[id]/status/route.ts`)



```typescript

// Validates state transition before persisting

const VALID_TRANSITIONS: Record<BosMeetingStatus, BosMeetingStatus[]> = {

  draft: ['principal_approved'],

  principal_approved: ['noticed', 'draft'],

  noticed: ['expert_invited', 'principal_approved'],

  expert_invited: ['completed', 'noticed'],

  completed: ['minutes_drafted', 'expert_invited'],

  minutes_drafted: ['minutes_approved', 'completed'],

  minutes_approved: ['ratified', 'minutes_drafted'],

  ratified: [],

};

```



---



## Key UI Screens



### 1. BoS Dashboard (`/academic/bos`)

- Summary cards: Active compositions, meetings this year, pending resolutions, expiring terms (60-day alert)

- Board selector (filter by board/program)

- Recent meetings list with status badges

- Quick actions: Schedule Meeting, Add Expert, View Reports



### 2. External Expert Directory (`/academic/bos/experts`)

- Table: Name, Category badge, Institution, Contact, Status

- Filter by category (University Nominee / Subject Expert / Industry / Alumni)

- Add/Edit Expert in Sheet drawer

- Category color-coded badges: `university_nominee` = blue, `subject_expert` = purple, `industry_expert` = amber, `alumni` = green



### 3. Composition Management (`/academic/bos/compositions`)

- Board â Composition hierarchy

- Member list card view matching sample Excel format (S.No, Position, Name, Designation, Address, Contact, Email)

- "Add Internal Member" (search from staff/learning facilitator list)

- "Add External Expert" (pick from expert directory or create new)

- Sort members with drag-handle

- Term expiry countdown chip

- "Download Composition" â PDF matching the board member format sheet



### 4. Meeting Scheduling (`/academic/bos/meetings`)

- Meeting list with status stepper indicator

- Status filter tabs: All | Draft | Approved | Completed | Ratified

- Schedule form: Board selector, composition auto-populated, date/time/venue, meeting type, agenda overview

- Auto-generated meeting number display: "Meeting 1 of 2024-25"



### 5. Meeting Detail Hub (`/academic/bos/meetings/[id]`)

- State machine stepper at the top (horizontal progress bar with 8 states)

- Tab navigation: Details | Agenda | Attendance | Course Reviews | Documents

- Status transition buttons contextual to current state:

  - Draft â "Submit for Principal Approval"

  - Principal Approved â "Generate & Send Meeting Notice"

  - Noticed â "Generate & Send Call Letters to Experts"

  - Expert Invited â "Mark Meeting as Completed"

  - Completed â "Draft Minutes"

  - Minutes Drafted â "Approve Minutes"

  - Minutes Approved â "Record Academic Council Ratification"



### 6. Agenda & Resolutions (`/academic/bos/meetings/[id]/agenda`)

- Numbered agenda items (add/reorder)

- Expandable each item: Discussion notes, Resolution text, Status, Responsible person, Target date

- Action tracker sub-rows under each resolution

- "Link Course Review" button within agenda item



### 7. Attendance Marking (`/academic/bos/meetings/[id]/attendance`)

- Pre-populated list of all composition members (sorted by type: Chairman first)

- Toggle: Present / Absent / Leave of Absence

- External experts: TA/DA eligible checkbox

- Upload signature page button (stores in COE Supabase Storage)

- Quorum indicator: X/Y members present (highlight if quorum not met)



### 8. Document Generation (`/academic/bos/meetings/[id]/documents`)

- "Generate Meeting Notice" â fills DOCX template â download DOCX / Print Preview / Send via Email

- "Generate Call Letters" â one letter per external expert, bulk ZIP download

- "Generate Minutes of Meeting" â fills DOCX with agenda, attendance, resolutions

- "Generate TA/DA Bills" â per expert

- All generated docs listed in a table with generated timestamp and download links



### 9. Reports (`/academic/bos/reports`)

- **BoS Composition Report**: Member list in official format (matches Excel sample)

- **Meeting Register**: All meetings table â date, type, attendance %

- **Resolution Compliance Report**: All resolutions with action status (pending/completed)

- **Syllabus Approval Certificate**: Per course/regulation, certifying BoS approval date and meeting reference

- Export all as PDF or DOCX



---



## Document Templates (DOCX Template Fill)



### Template Variables



| Template | Variables |

|---|---|

| Meeting Notice | `{{college_name}}`, `{{principal_name}}`, `{{date}}`, `{{meeting_number}}`, `{{board_name}}`, `{{meeting_date}}`, `{{meeting_time}}`, `{{venue}}`, `{{agenda_items}}`, `{{chairman_name}}` |

| Call Letter (Expert) | All above + `{{expert_name}}`, `{{expert_designation}}`, `{{expert_address}}`, `{{ta_da_note}}` |

| Minutes of Meeting | `{{college_name}}`, `{{meeting_title}}`, `{{meeting_date}}`, `{{attendance_table}}`, `{{agenda_resolution_table}}`, `{{chairman_signature_block}}`, `{{principal_signature_block}}` |

| Composition Certificate | `{{board_name}}`, `{{term_period}}`, `{{member_table}}`, `{{ratification_date}}` |

| TA/DA Bill | `{{expert_name}}`, `{{meeting_date}}`, `{{travel_details}}`, `{{da_details}}`, `{{total_amount}}` |



### Document Generation API Route (`app/api/bos/meetings/[id]/documents/route.ts`)



```typescript

// POST body: { document_type: BosDocumentType, format: 'docx' | 'pdf', recipient_member_id?: string }

// 1. Load template from /templates/bos/[document_type].docx

// 2. Fetch all required data (meeting, composition, members, agenda)

// 3. Fill template using docx-templater or equivalent

// 4. Upload to COE Supabase Storage

// 5. Save record to bos_documents table

// 6. Return signed download URL

```



---



## API Endpoints



| Method | Endpoint | Description |

|---|---|---|

| GET | `/api/bos/compositions` | List compositions (filters: institutions_id, board_id, academic_year) |

| POST | `/api/bos/compositions` | Create composition |

| PUT | `/api/bos/compositions/:id` | Update composition |

| DELETE | `/api/bos/compositions/:id` | Delete composition |

| GET | `/api/bos/members?compositionId=` | List members of a composition |

| POST | `/api/bos/members` | Add member to composition |

| PUT | `/api/bos/members/:id` | Update member |

| DELETE | `/api/bos/members/:id` | Remove member |

| GET | `/api/bos/experts` | List external experts |

| POST | `/api/bos/experts` | Create expert |

| PUT | `/api/bos/experts/:id` | Update expert |

| GET | `/api/bos/meetings` | List meetings (filters: board_id, academic_year, status) |

| POST | `/api/bos/meetings` | Create meeting (auto-assigns meeting_number) |

| GET | `/api/bos/meetings/:id` | Get meeting detail |

| PUT | `/api/bos/meetings/:id` | Update meeting |

| PATCH | `/api/bos/meetings/:id/status` | Transition meeting status |

| GET | `/api/bos/meetings/:id/agenda` | Get agenda items |

| POST | `/api/bos/meetings/:id/agenda` | Add agenda item |

| PUT | `/api/bos/agenda/:id` | Update agenda item |

| DELETE | `/api/bos/agenda/:id` | Delete agenda item |

| GET | `/api/bos/meetings/:id/attendance` | Get attendance |

| POST | `/api/bos/meetings/:id/attendance` | Bulk save attendance |

| GET | `/api/bos/meetings/:id/courses` | Get course reviews |

| POST | `/api/bos/meetings/:id/courses` | Add course review |

| POST | `/api/bos/meetings/:id/documents` | Generate document |

| GET | `/api/bos/meetings/:id/documents` | List generated documents |

| GET | `/api/bos/ta-da?meetingId=` | List TA/DA claims |

| POST | `/api/bos/ta-da` | Create TA/DA claim |

| PUT | `/api/bos/ta-da/:id` | Update claim |

| GET | `/api/bos/reports/composition?boardId=&compositionId=` | Composition report data |

| GET | `/api/bos/reports/meeting-register?boardId=&academicYear=` | Meeting register |

| GET | `/api/bos/reports/resolution-compliance?boardId=` | Resolution compliance |

| GET | `/api/bos/reports/syllabus-approval?boardId=&regulationCode=` | Syllabus certificates |

| GET | `/api/bos/meetings/next-number?boardId=&academicYear=` | Get next meeting number |



---



## User Roles & RBAC



| Role | Permissions |

|---|---|

| **BoS Coordinator** (exam_coordinator) | Create/edit meetings, enter agenda & resolutions, mark attendance, generate documents, enter TA/DA |

| **HOD** (hod) | All BoS Coordinator permissions + Approve minutes + Manage composition members |

| **Principal** | Approve meetings (status transition: draft â principal_approved), read all BoS records |

| **IQAC Admin** (super_admin / institution_admin) | Full read access to all boards, export all reports, view resolution compliance |



### Permission Keys Convention (per skill: `module.entity.action`)



```typescript

// Permission key format: 'academic.bos-[entity].[action]'

'academic.bos-compositions.view'

'academic.bos-compositions.create'

'academic.bos-compositions.edit'

'academic.bos-compositions.delete'



'academic.bos-experts.view'

'academic.bos-experts.create'

'academic.bos-experts.edit'



'academic.bos-meetings.view'

'academic.bos-meetings.create'

'academic.bos-meetings.edit'

'academic.bos-meetings.approve'       // Principal only

'academic.bos-meetings.approve-minutes' // HOD only



'academic.bos-reports.view'

'academic.bos-ta-da.view'

'academic.bos-ta-da.create'

```



### Permission Check Pattern (per skill)



```typescript

const { canAccess, isSuperAdmin } = usePermissions();



const canCreate = isSuperAdmin || canAccess('academic.bos-compositions', 'create');

const canApproveMeeting = isSuperAdmin || canAccess('academic.bos-meetings', 'approve');

const canApproveMinutes = isSuperAdmin || canAccess('academic.bos-meetings', 'approve-minutes');



// In JSX â hide buttons user cannot perform:

{canCreate && <Button>New Composition</Button>}

```



---



## Navigation Registration



**Location:** `lib/sidebarMenuLink.ts`



```typescript

// Add BoS under the Academic module group

{ href: '/academic/bos', label: 'Board of Studies', icon: BookOpenCheck }



// Permission mapping

MENU_PERMISSIONS['/academic/bos'] = 'academic.bos-compositions.view';

MENU_PERMISSIONS['/academic/bos/experts'] = 'academic.bos-experts.view';

MENU_PERMISSIONS['/academic/bos/compositions'] = 'academic.bos-compositions.view';

MENU_PERMISSIONS['/academic/bos/meetings'] = 'academic.bos-meetings.view';

MENU_PERMISSIONS['/academic/bos/ta-da'] = 'academic.bos-ta-da.view';

MENU_PERMISSIONS['/academic/bos/reports'] = 'academic.bos-reports.view';

```



---



## Validation Rules



| Rule | Details |

|---|---|

| One active composition per board | `UNIQUE(board_id, term_start_date)` + check only one `is_active = true` per board |

| Member source exclusivity | Either `staff_id` or `expert_id` â not both (DB constraint) |

| One chairman per composition | Validate: only one member with `member_type = 'chairman'` per composition |

| Term dates | `term_end_date` must be exactly 3 years after `term_start_date` |

| Meeting number uniqueness | `UNIQUE(board_id, academic_year, meeting_number)` â auto-assigned, not user-editable |

| State machine enforcement | Backend validates `VALID_TRANSITIONS[currentStatus].includes(newStatus)` |

| Attendance before completion | Cannot transition to `completed` if no attendance records |

| Agenda before minutes | Cannot transition to `minutes_drafted` if no agenda items with resolutions |

| Quorum warning | Warn (not block) if < 50% members marked present |

| Marks within range | TA/DA amounts must be non-negative |

| Taxonomy locked | Cannot change `composition_id` of a meeting once `status !== 'draft'` |

| Threshold ordering | `term_end_date > term_start_date` |



---



## Environment Variables (Add to `.env.example`)



```env

# COE Database (Supabase â separate project)

COE_SUPABASE_URL=https://your-coe-project.supabase.co

COE_SUPABASE_SERVICE_ROLE_KEY=your-coe-service-role-key



# Email dispatch (for sending notices/call letters)

BOS_EMAIL_FROM=principal@jkkn.ac.in

BOS_EMAIL_REPLY_TO=iqac@jkkn.ac.in

```



---



## RLS Policies (COE Database)



```sql

-- All BoS tables: institution-scoped access only

-- Policies added to supabase/setup/03_policies.sql in COE project



-- Since MyJKKN uses service-role key (bypasses RLS) for proxy routes,

-- RLS policies enforce institution isolation as a defense-in-depth measure.



ALTER TABLE bos_compositions ENABLE ROW LEVEL SECURITY;

ALTER TABLE bos_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE bos_external_experts ENABLE ROW LEVEL SECURITY;

ALTER TABLE bos_meetings ENABLE ROW LEVEL SECURITY;

ALTER TABLE bos_meeting_attendees ENABLE ROW LEVEL SECURITY;

ALTER TABLE bos_agenda_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE bos_resolution_actions ENABLE ROW LEVEL SECURITY;

ALTER TABLE bos_course_reviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE bos_ta_da_claims ENABLE ROW LEVEL SECURITY;

ALTER TABLE bos_documents ENABLE ROW LEVEL SECURITY;



-- Example policy (repeat for all tables):

CREATE POLICY "bos_compositions_institution_isolation"

  ON bos_compositions FOR ALL

  USING (true)  -- service-role bypasses; add institution check if direct access is needed

  WITH CHECK (true);

```



---



## Pre-Flight Checklist (per myjkkn-page-development skill)



Before implementation begins, verify:



- [ ] COE migration file created: `D:\JKKN\Development\Application\COE\jkkncoe\supabase\migrations\20260306_create_bos_tables.sql`

- [ ] `COE_SUPABASE_URL` and `COE_SUPABASE_SERVICE_ROLE_KEY` added to `.env.local` and `.env.example`

- [ ] `lib/supabase/coe-client.ts` created

- [ ] `types/bos.ts` created with all interfaces

- [ ] Services placed in `lib/services/academic/` (NOT `lib/services/bos/`)

- [ ] Hooks placed in `hooks/academic/` (NOT `hooks/bos/`)

- [ ] Hooks use `useQuery` / `useMutation` (NOT `useState + useCallback`)

- [ ] Filter interfaces use camelCase (`boardId`, `isActive`, NOT `board_id`, `is_active`)

- [ ] Permission keys follow `academic.bos-[entity].[action]` format

- [ ] Navigation registered in `lib/sidebarMenuLink.ts`

- [ ] Each list page is a **Server Component** with `_data/get-*.ts` for pre-fetch

- [ ] Each form page is a **Client Component** in `new/` or `[id]/edit/`

- [ ] All `_components/` folders include `data-table-schema.ts` (Zod for URL search params)



---



## Implementation Phases



### Phase 1: Foundation â Member Management (Start Here)

1. Create all COE database tables (SQL migration)

2. Create `lib/supabase/coe-client.ts`

3. Create `types/bos.ts` (full interfaces)

4. Build External Expert Directory:

   - `app/api/bos/experts/*` proxy routes

   - `lib/services/bos/bos-expert-service.ts`

   - `hooks/bos/use-bos-experts.ts`

   - `components/academic/bos/member-category-badge.tsx`

   - Page: `/academic/bos/experts`

5. Build Composition Management:

   - `app/api/bos/compositions/*` + `app/api/bos/members/*` proxy routes

   - `lib/services/bos/bos-composition-service.ts` + `bos-member-service.ts`

   - `hooks/bos/use-bos-compositions.ts` + `use-bos-members.ts`

   - Page: `/academic/bos/compositions` (member list card view)

6. Composition PDF export (member list matching Excel format)



### Phase 2: Meeting Lifecycle

1. Meeting creation & listing with auto-numbering

2. State machine transitions (all 8 states)

3. Meeting status stepper component

4. Status-contextual action buttons

5. Principal approval workflow



### Phase 3: Agenda, Attendance & Course Reviews

1. Agenda item CRUD with drag-to-reorder

2. Resolution tracking per agenda item

3. Action Taken tracking

4. Attendance marking grid with quorum indicator

5. Signature page upload

6. Course review linking (search COE courses by board)



### Phase 4: Document Generation

1. DOCX template upload & storage (per document type)

2. Template fill engine (meeting notice, call letter, minutes)

3. Bulk call letter generation (ZIP download)

4. Email dispatch integration

5. Document history table



### Phase 5: TA/DA & Reports

1. TA/DA claim entry per external expert per meeting

2. TA/DA bill DOCX generation

3. NAAC/NBA Reports:

   - BoS Composition Report (PDF)

   - Meeting Register

   - Resolution Compliance Report

   - Syllabus Approval Certificates

4. IQAC admin report dashboard



---



## Open Questions (Clarify Before Implementation)



- [ ] Does the COE API already have an API server, or does the COE Supabase URL get accessed directly via service-role key? (Determines if `createCoeSupabaseClient` approach is correct)

- [ ] Is there an existing `staff` / `profiles` table in COE database, or should internal member lookup use the MyJKKN Supabase `profiles` table?

- [ ] Which storage bucket should BoS documents go into â COE Supabase Storage or MyJKKN Supabase Storage?

- [ ] For email dispatch, is there an existing email service (Resend, SendGrid, SMTP) configured in the project?

- [ ] Should `board_type` in the `board` table (e.g., "UG", "PG") determine any BoS-specific behavior (e.g., minimum member count, required categories)?

- [ ] Does "BoS Coordinator" map to an existing role in MyJKKN's RBAC, or is it a new role to create?

- [ ] For the DOCX templates â who maintains them? Should they be stored in Supabase Storage (admin-uploadable) or bundled in the codebase?

- [ ] Is there a sidebar menu entry needed for BoS under the Academic module? If so, what icon and label?



---



---



## Deployment Strategy



### Decision: `jkkn.ai` (MyJKKN) â Primary Recommendation



The BoS module is built **inside MyJKKN** at `app/(routes)/academic/bos/`. External access for experts is handled via a public token-based route within the same application.



```

jkkn.ai/academic/bos           â Main BoS management

                                  Users: HOD, Principal, BoS Coordinator, IQAC Admin

                                  Auth: Existing MyJKKN RBAC



jkkn.ai/bos-portal/[token]     â External Expert Portal (Phase 5+, optional)

                                  Users: External experts clicking their call letter link

                                  Auth: Magic link token (no MyJKKN account needed)

                                  Actions: View call letter, confirm attendance, download docs

```



### Why NOT a separate `bos.jkkn.ai` (now)



- Requires duplicate auth setup, separate Vercel project, extra DNS/SSL

- Duplicates the entire Shadcn/Tailwind design system

- Slows development â all 5-layer patterns must be rebuilt from scratch

- Can always migrate the expert portal to `bos.jkkn.ai` later as a micro-frontend



### Future Path to `bos.jkkn.ai` (if needed)



When external expert traffic grows or NAAC requires a dedicated portal:

1. Extract `app/(routes)/bos-portal/` into a standalone Next.js app

2. Deploy to Vercel as `bos.jkkn.ai` pointing to the same COE database

3. BoS management stays at `jkkn.ai/academic/bos` â no disruption



---



## COE Migration File



**Location:** `D:\JKKN\Development\Application\COE\jkkncoe\supabase\migrations\20260306_create_bos_tables.sql`



This single migration file contains all `CREATE TABLE` statements from the Database Schema section above, applied to the COE Supabase project. When implementing, use the Supabase MCP tool pointed at the COE project to apply this migration.



---



*Spec version: 1.0 | Created: 2026-03-06 | Author: Claude (JKKN COE Project)*

*Interviewer: Claude Sonnet 4.6 via AskUserQuestion | Interviewee: JKKN Development Team*

