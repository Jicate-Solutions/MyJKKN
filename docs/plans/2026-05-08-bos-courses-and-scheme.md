# BOS Courses & Course Scheme Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add two new tabs to the BOS module — **Courses** (master data CRUD) and **Course Scheme** (semester-grouped mapping with view/edit modes) — backed by the COE external API.

**Architecture:** Thin Next.js proxy routes under `/api/bos/courses-master` and `/api/bos/course-mapping` forward authenticated, permission-checked, institution-scoped requests to COE's `/api/v1/courses` and `/api/v1/course-mapping` endpoints. The UI follows existing BOS conventions — shadcn `DataTable`, react-hook-form + Zod forms, TanStack Query hooks, `PermissionGuard` gating.

**Tech Stack:**
- Next.js 16 (App Router) + React 19 + TypeScript
- TanStack Query v5 (server state)
- react-hook-form + Zod (forms + validation)
- shadcn/ui + Tailwind (components)
- ExcelJS (template generation, import parsing)
- Existing `CoeRestClient` (server-side proxy, X-API-Key-Id auth)
- Supabase (auth + RBAC; not for course data — that lives in COE)

**Verification commands** (this codebase has no test runner — these are the gates):
- `npm run typecheck` — TypeScript strict check
- `npm run lint` — ESLint + Next.js rules
- `npm run check:reachability` — every route declared in nav must resolve
- `npm run dev` — visual + behavioral verification

---

## Phase 1 — Foundation (CoE client + RBAC + permissions)

### Task 1: Extend CoeRestClient with PUT and DELETE

**Files:**
- Modify: [lib/services/coe/coe-rest-client.ts](../../lib/services/coe/coe-rest-client.ts) (add two methods after existing `post`)

**Step 1: Open the file and locate `post`**

Open [lib/services/coe/coe-rest-client.ts:72-76](../../lib/services/coe/coe-rest-client.ts#L72-L76).

**Step 2: Insert two new methods after `post`**

```typescript
  /**
   * PUT request to COE API. Used for partial updates (e.g. PUT /api/v1/courses/{id}).
   */
  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', `${this.baseUrl}${path}`, {
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE request to COE API. Supports optional query params (e.g. ?check=true for dry-run).
   */
  async delete<T>(
    path: string,
    params?: Record<string, string | undefined>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, value);
        }
      });
    }
    return this.request<T>('DELETE', url.toString());
  }
```

**Step 3: Verify**

```bash
npm run typecheck
```
Expected: No type errors.

**Step 4: Commit**

```bash
git add lib/services/coe/coe-rest-client.ts
git commit -m "feat(coe-client): add put + delete methods for course master CRUD"
```

---

### Task 2: Create BOS-side access helper

**Files:**
- Create: `lib/utils/bos/bos-access.ts`

**Step 1: Inspect existing internal-marks helper for the pattern**

Read [lib/utils/internal-marks/internal-marks-access.ts](../../lib/utils/internal-marks/internal-marks-access.ts) — copy the `resolveCoeInstitutionId` helper export style.

**Step 2: Create the file**

```typescript
// lib/utils/bos/bos-access.ts
import { createClient } from '@/lib/supabase/server';

export type BosModule = 'academic.bos-courses' | 'academic.bos-scheme';
export type BosAction = 'view' | 'create' | 'edit' | 'delete' | 'import';

/**
 * Server-side permission check for BoS modules.
 * Mirrors the client-side usePermissions().canAccess() but runs in API routes.
 *
 * Reads role_permissions joined with user_roles; super-admin short-circuits to true.
 */
export async function canAccessBos(
  userId: string,
  module: BosModule,
  action: BosAction
): Promise<boolean> {
  const supabase = await createClient();

  // Super-admin bypass
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role_id, roles(role_name, is_super_admin)')
    .eq('user_id', userId);

  if (roles?.some((r: any) => r.roles?.is_super_admin)) return true;

  // Permission lookup by module + action
  const roleIds = (roles ?? []).map((r: any) => r.role_id);
  if (roleIds.length === 0) return false;

  const { data: perms } = await supabase
    .from('role_permissions')
    .select('module, action')
    .in('role_id', roleIds)
    .eq('module', module)
    .eq('action', action)
    .limit(1);

  return (perms ?? []).length > 0;
}

/**
 * Re-export for convenience — the COE-institution mapping is identical
 * to the one used by Internal Marks; we share the helper.
 */
export { resolveCoeInstitutionId } from '@/lib/utils/internal-marks/internal-marks-access';
```

**Step 3: Verify**

```bash
npm run typecheck
```
Expected: PASS. If fails because `roles` or `role_permissions` shape differs in your DB, open [lib/utils/internal-marks/internal-marks-access.ts](../../lib/utils/internal-marks/internal-marks-access.ts) and align the query shape — that file is the source of truth for this pattern.

**Step 4: Commit**

```bash
git add lib/utils/bos/bos-access.ts
git commit -m "feat(bos): add server-side permission check helper"
```

---

### Task 3: Register `bos.courses` and `bos.scheme` in permission catalog

**Files:**
- Modify: `scripts/check-permissions-catalog.mjs` (locate the `BOS_PERMISSIONS` block or equivalent)
- Modify: SQL migration or seed file under `supabase/migrations/` (find latest migration; add INSERT)

**Step 1: Find the permission catalog source**

```bash
grep -rn "bos.compositions" scripts/ supabase/ lib/ --include="*.ts" --include="*.mjs" --include="*.sql" | head -20
```

**Step 2: Add the two new keys** in the same file/format the existing BOS keys use. For example, if the catalog is a TypeScript constant:

```typescript
{ module: 'academic.bos-courses', actions: ['view', 'create', 'edit', 'delete', 'import'] },
{ module: 'academic.bos-scheme',  actions: ['view', 'edit'] },
```

**Step 3: Generate the SQL seed**

Create `supabase/migrations/20260508000000_bos_courses_scheme_permissions.sql`:

```sql
-- Permission seeds for the BoS Courses & Scheme tabs.
INSERT INTO public.permissions_catalog (module, action, description) VALUES
  ('academic.bos-courses', 'view',   'View BoS course master list'),
  ('academic.bos-courses', 'create', 'Create new BoS courses'),
  ('academic.bos-courses', 'edit',   'Edit existing BoS courses'),
  ('academic.bos-courses', 'delete', 'Delete BoS courses'),
  ('academic.bos-courses', 'import', 'Bulk import BoS courses from Excel'),
  ('academic.bos-scheme',  'view',   'View course scheme grouped by semester'),
  ('academic.bos-scheme',  'edit',   'Add/remove course-to-semester mappings')
ON CONFLICT (module, action) DO NOTHING;
```

> Adapt the table name (`permissions_catalog`) to match your actual schema — find it via `grep -rn "permissions_catalog\|create table.*permission" supabase/`.

**Step 4: Apply migration locally**

```bash
npx supabase db push   # or: psql against local DB
```

**Step 5: Verify catalog gate**

```bash
npm run check:permissions
```
Expected: No new violations. If it flags missing UI registration, that's resolved in later tasks.

**Step 6: Commit**

```bash
git add supabase/migrations/20260508000000_bos_courses_scheme_permissions.sql scripts/check-permissions-catalog.mjs
git commit -m "feat(bos): register bos.courses and bos.scheme permission keys"
```

---

## Phase 2 — Backend proxy routes + types + Zod schemas

### Task 4: Create canonical type definitions

**Files:**
- Create: `types/bos-courses.ts`

**Step 1: Author the types file**

```typescript
// types/bos-courses.ts
//
// Mirrors the COE `courses` and `course_mapping` tables.
// Only the columns we surface in the UI are typed — extra COE columns are passed through.

export type CoursePart =
  | 'Part I' | 'Part II' | 'Part III' | 'Part IV' | 'Part V';

export type CourseCategory =
  | 'Theory' | 'Practical' | 'Project' | 'Non Academic'
  | 'Theory + Practical' | 'Theory + Project'
  | 'Field Work' | 'Community Service' | 'Group Project';

export type CourseType =
  | 'Ability Enhancement' | 'Additional Credit course' | 'Advance learner course'
  | 'Audit Course' | 'Bridge course' | 'Core Practical' | 'Core'
  | 'Discipline Specific elective Practical' | 'Discipline Specific elective'
  | 'Elective Practical' | 'Elective' | 'English'
  | 'Extra Disciplinary Elective Practical' | 'Extra Disciplinary'
  | 'Foundation Course' | 'Generic Elective Practical' | 'Generic Elective'
  | 'Internship' | 'Language' | 'Naanmuthalvan' | 'Non Academic'
  | 'Non Major Elective Practical' | 'Non Major Elective'
  | 'Practical' | 'Project'
  | 'Skill Enhancement Practical' | 'Skill Enhancement';

export type EvaluationType = 'CIA' | 'ESE' | 'CIA + ESE';
export type ResultType = 'Mark' | 'Status' | 'comment' | 'credit';
export type CourseGroup =
  | 'General' | 'Elective - I' | 'Elective - II' | 'Elective - III'
  | 'Elective - IV' | 'Elective - V' | 'Elective - VI';

export interface BosCourseMaster {
  id: string;
  institutions_id: string | null;
  institution_code: string;
  regulation_id: string | null;
  regulation_code: string;
  course_code: string;
  course_name: string;
  display_code: string;
  course_category: CourseCategory;
  course_type: CourseType | null;
  course_part_master: CoursePart | null;
  credit: number;
  theory_credit: number | null;
  practical_credit: number | null;
  exam_duration: number;
  evaluation_type: EvaluationType;
  result_type: ResultType;
  theory_hours: number;
  practical_hours: number;
  class_hours: number;
  internal_max_mark: number;
  external_max_mark: number;
  total_max_mark: number;
  internal_pass_mark: number;
  external_pass_mark: number;
  total_pass_mark: number;
  status: boolean;
  course_status: 'Active' | 'Locked' | string;   // ← Lock state. 'Locked' hides edit/delete in UI + 423 on server.
  created_at: string;
  updated_at: string;
}

/** Reusable helper — single source of truth for "can this row be mutated?". */
export function isLocked(row: { course_status?: string | null } | undefined | null): boolean {
  return row?.course_status === 'Locked';
}

/** The 13-field manual form (per design Section 2). */
export interface BosCourseFormData {
  course_code: string;
  course_name: string;
  course_category: CourseCategory;
  course_part_master: CoursePart;
  course_type: CourseType;
  exam_duration: number;       // hours
  credit: number;
  theory_hours: number;
  practical_hours: number;
  internal_max_mark: number;
  external_max_mark: number;
  total_max_mark: number;       // auto = internal + external (server enforces)
  // total_max_mark fed twice: once as DB total_max_mark, once mirrored to max_marks for legacy
}

export interface BosCourseMapping {
  id: string;
  institutions_id: string;
  program_id: string | null;
  course_id: string;
  batch_id: string | null;
  institution_code: string;
  program_code: string;
  course_code: string;
  batch_code: string | null;
  course_group: CourseGroup | null;
  semester_code: string | null;
  course_order: number | null;
  regulation_code: string | null;
  is_active: boolean;
  mapping_status: 'Active' | 'Locked' | string;   // ← Lock state for the mapping row itself.
  created_at: string;
}

/** Twin of isLocked() for mapping rows. */
export function isMappingLocked(row: { mapping_status?: string | null } | undefined | null): boolean {
  return row?.mapping_status === 'Locked';
}

/** Response shape when ?details=true on /course-mapping list. */
export interface BosCourseMappingDetailed extends BosCourseMapping {
  course: Pick<
    BosCourseMaster,
    | 'course_code' | 'course_name' | 'course_category' | 'course_type'
    | 'course_part_master' | 'credit' | 'exam_duration'
    | 'theory_hours' | 'practical_hours'
    | 'internal_max_mark' | 'external_max_mark' | 'total_max_mark'
  >;
}

export interface BosCourseListResponse {
  data: BosCourseMaster[];
  metadata: { total: number; limit: number; offset: number };
}

export interface BosBulkImportResponse {
  inserted: number;
  updated: number;
  total: number;
  errors: { row: number; course_code?: string; message: string }[];
}
```

**Step 2: Verify**

```bash
npm run typecheck
```

**Step 3: Commit**

```bash
git add types/bos-courses.ts
git commit -m "feat(bos): add type definitions for courses and course-mapping"
```

---

### Task 5: Author Zod schemas for form + API validation

**Files:**
- Create: `lib/services/bos/courses-schemas.ts`

```typescript
// lib/services/bos/courses-schemas.ts
import { z } from 'zod';

export const COURSE_PART_VALUES = ['Part I','Part II','Part III','Part IV','Part V'] as const;

export const COURSE_CATEGORY_VALUES = [
  'Theory','Practical','Project','Non Academic',
  'Theory + Practical','Theory + Project',
  'Field Work','Community Service','Group Project',
] as const;

export const COURSE_TYPE_VALUES = [
  'Ability Enhancement','Additional Credit course','Advance learner course',
  'Audit Course','Bridge course','Core Practical','Core',
  'Discipline Specific elective Practical','Discipline Specific elective',
  'Elective Practical','Elective','English',
  'Extra Disciplinary Elective Practical','Extra Disciplinary',
  'Foundation Course','Generic Elective Practical','Generic Elective',
  'Internship','Language','Naanmuthalvan','Non Academic',
  'Non Major Elective Practical','Non Major Elective',
  'Practical','Project',
  'Skill Enhancement Practical','Skill Enhancement',
] as const;

export const COURSE_GROUP_VALUES = [
  'General','Elective - I','Elective - II','Elective - III',
  'Elective - IV','Elective - V','Elective - VI',
] as const;

/** Manual form schema — exactly the 13 fields per design Section 2. */
export const courseFormSchema = z.object({
  course_code:       z.string().min(3).max(50).regex(/^[A-Z0-9]+$/i, 'Letters & digits only'),
  course_name:       z.string().min(3).max(255),
  course_category:   z.enum(COURSE_CATEGORY_VALUES),
  course_part_master: z.enum(COURSE_PART_VALUES),
  course_type:       z.enum(COURSE_TYPE_VALUES),
  exam_duration:     z.coerce.number().int().min(0).max(8),
  credit:            z.coerce.number().min(0).max(10),
  theory_hours:      z.coerce.number().int().min(0).max(40),
  practical_hours:   z.coerce.number().int().min(0).max(40),
  internal_max_mark: z.coerce.number().int().min(0).max(100),
  external_max_mark: z.coerce.number().int().min(0).max(100),
  total_max_mark:    z.coerce.number().int().min(0).max(200),
});

export type CourseFormInput = z.infer<typeof courseFormSchema>;

/** Server-side payload to POST to COE — adds defaults the form omits. */
export function toCoeCreatePayload(
  form: CourseFormInput,
  ctx: { institution_code: string; regulation_code: string; institutions_id: string; regulation_id?: string }
) {
  return {
    institutions_id: ctx.institutions_id,
    regulation_id: ctx.regulation_id,
    institution_code: ctx.institution_code,
    regulation_code: ctx.regulation_code,
    course_code: form.course_code.toUpperCase(),
    course_name: form.course_name.trim(),
    display_code: form.course_code.toUpperCase(),  // mirror; UNIQUE in DB
    course_category: form.course_category,
    course_type: form.course_type,
    course_part_master: form.course_part_master,
    credit: form.credit,
    exam_duration: form.exam_duration,
    theory_hours: form.theory_hours,
    practical_hours: form.practical_hours,
    class_hours: form.theory_hours + form.practical_hours,
    internal_max_mark: form.internal_max_mark,
    external_max_mark: form.external_max_mark,
    total_max_mark: form.internal_max_mark + form.external_max_mark,
    // sensible defaults
    evaluation_type: 'CIA + ESE' as const,
    result_type: 'Mark' as const,
    status: true,
    credit_included: true,
    has_hall_ticket: true,
  };
}

/** Bulk import row schema — same as form + a 1-based row index for error reporting. */
export const importRowSchema = courseFormSchema.extend({
  __row: z.number().int().min(1),
});
```

**Step 2: Verify**

```bash
npm run typecheck
```

**Step 3: Commit**

```bash
git add lib/services/bos/courses-schemas.ts
git commit -m "feat(bos): add Zod schemas for courses form + bulk import"
```

---

### Task 6: Proxy route — list + create courses

**Files:**
- Create: `app/api/bos/courses-master/route.ts`

```typescript
// app/api/bos/courses-master/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { canAccessBos, resolveCoeInstitutionId } from '@/lib/utils/bos/bos-access';
import { courseFormSchema, toCoeCreatePayload } from '@/lib/services/bos/courses-schemas';

// ── GET /api/bos/courses-master ───────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await canAccessBos(user.id, 'academic.bos-courses', 'view'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');
    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const client = CoeRestClient.create();
    const data = await client.get<unknown>('/api/v1/courses', {
      institutions_id: coeInstitutionId,
      regulation_code: searchParams.get('regulation_code') ?? undefined,
      program_code:    searchParams.get('program_code') ?? undefined,
      search:          searchParams.get('search') ?? undefined,
      is_active:       searchParams.get('is_active') ?? 'true',
      limit:           searchParams.get('limit') ?? '100',
      offset:          searchParams.get('offset') ?? '0',
    });

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[bos/courses-master] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 });
  }
}

// ── POST /api/bos/courses-master ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await canAccessBos(user.id, 'academic.bos-courses', 'create'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = courseFormSchema.safeParse(body.form);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { institution_id, institution_code, regulation_code, regulation_id } = body.context ?? {};
    if (!institution_id || !institution_code || !regulation_code) {
      return NextResponse.json({ error: 'context.institution_id, .institution_code, .regulation_code required' }, { status: 400 });
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institution_id);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const payload = toCoeCreatePayload(parsed.data, {
      institutions_id: coeInstitutionId,
      institution_code,
      regulation_code,
      regulation_id,
    });

    const client = CoeRestClient.create();
    const created = await client.post<unknown>('/api/v1/courses', payload);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error('[bos/courses-master] POST error:', error);
    return NextResponse.json({ error: 'Failed to create course' }, { status: 500 });
  }
}
```

**Step 2: Verify**

```bash
npm run typecheck
npm run lint -- app/api/bos/courses-master/route.ts
```

**Step 3: Smoke-test in dev**

```bash
npm run dev
# In another terminal (logged-in cookies required), hit:
curl -i 'http://localhost:3000/api/bos/courses-master?institution_id=<UUID>'
```
Expected: 200 with `{ data: [...], metadata: {...} }`, OR 401 if no session.

**Step 4: Commit**

```bash
git add app/api/bos/courses-master/route.ts
git commit -m "feat(bos): add GET/POST proxy for courses-master"
```

---

### Task 7: Proxy route — single course (GET, PUT, DELETE)

**Files:**
- Create: `app/api/bos/courses-master/[id]/route.ts`

```typescript
// app/api/bos/courses-master/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { canAccessBos } from '@/lib/utils/bos/bos-access';
import { courseFormSchema } from '@/lib/services/bos/courses-schemas';

async function authenticate(action: 'view' | 'edit' | 'delete') {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!(await canAccessBos(user.id, 'academic.bos-courses', action))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user };
}

// ── GET /api/bos/courses-master/[id] ──────────────────────────────────────────
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate('view');
  if ('error' in auth) return auth.error;

  try {
    const { id } = await params;
    const client = CoeRestClient.create();
    const data = await client.get<unknown>(`/api/v1/courses/${id}`);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[bos/courses-master/:id] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch course' }, { status: 500 });
  }
}

// ── Lock-state guard (shared) ─────────────────────────────────────────────────
async function assertNotLocked(client: CoeRestClient, id: string): Promise<NextResponse | null> {
  const existing = await client.get<{ course_status?: string }>(`/api/v1/courses/${id}`);
  if (existing?.course_status === 'Locked') {
    return NextResponse.json(
      { error: 'Course is locked and cannot be modified', code: 'LOCKED' },
      { status: 423 },   // RFC 4918 — Locked
    );
  }
  return null;
}

// ── PUT /api/bos/courses-master/[id] ──────────────────────────────────────────
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate('edit');
  if ('error' in auth) return auth.error;

  try {
    const { id } = await params;

    // Defense in depth — even if the UI hid the button, refuse the mutation.
    const client = CoeRestClient.create();
    const lockResp = await assertNotLocked(client, id);
    if (lockResp) return lockResp;

    const body = await request.json();
    // Partial update — only validate fields that are present
    const partial = courseFormSchema.partial().safeParse(body.form ?? body);
    if (!partial.success) {
      return NextResponse.json({ error: 'Validation failed', details: partial.error.issues }, { status: 400 });
    }

    const updates: Record<string, unknown> = { ...partial.data };
    // Recompute totals if either side was sent
    if ('internal_max_mark' in updates || 'external_max_mark' in updates) {
      const i = (updates.internal_max_mark as number | undefined) ?? 0;
      const e = (updates.external_max_mark as number | undefined) ?? 0;
      if ('internal_max_mark' in updates && 'external_max_mark' in updates) {
        updates.total_max_mark = i + e;
      }
    }
    if ('theory_hours' in updates || 'practical_hours' in updates) {
      const t = (updates.theory_hours as number | undefined) ?? 0;
      const p = (updates.practical_hours as number | undefined) ?? 0;
      if ('theory_hours' in updates && 'practical_hours' in updates) {
        updates.class_hours = t + p;
      }
    }

    const updated = await client.put<unknown>(`/api/v1/courses/${id}`, updates);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error('[bos/courses-master/:id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update course' }, { status: 500 });
  }
}

// ── DELETE /api/bos/courses-master/[id]?check=true ────────────────────────────
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate('delete');
  if ('error' in auth) return auth.error;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const check = searchParams.get('check') ?? undefined;

    const client = CoeRestClient.create();
    const lockResp = await assertNotLocked(client, id);
    if (lockResp) return lockResp;

    const result = await client.delete<unknown>(`/api/v1/courses/${id}`, { check });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[bos/courses-master/:id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete course' }, { status: 500 });
  }
}
```

> ⚠️ Note: an existing `/api/bos/courses/[id]/route.ts` operates on `bos_course_reviews`. The new path is `/api/bos/courses-master/[id]` — different table, different semantics. Don't merge them.

**Step 2: Verify**

```bash
npm run typecheck && npm run lint
```

**Step 3: Commit**

```bash
git add app/api/bos/courses-master/[id]/route.ts
git commit -m "feat(bos): add single-course proxy with PUT/DELETE/dry-run"
```

---

### Task 8: Bulk import endpoint

**Files:**
- Create: `app/api/bos/courses-master/import/route.ts`

```typescript
// app/api/bos/courses-master/import/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { canAccessBos, resolveCoeInstitutionId } from '@/lib/utils/bos/bos-access';
import { importRowSchema, toCoeCreatePayload } from '@/lib/services/bos/courses-schemas';
import type { BosBulkImportResponse } from '@/types/bos-courses';

const CHUNK_SIZE = 500;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await canAccessBos(user.id, 'academic.bos-courses', 'import'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { rows, context } = body as {
      rows: unknown[];
      context: { institution_id: string; institution_code: string; regulation_code: string; regulation_id?: string };
    };

    if (!Array.isArray(rows) || !context?.institution_id) {
      return NextResponse.json({ error: 'rows[] and context required' }, { status: 400 });
    }

    const coeInstitutionId = await resolveCoeInstitutionId(context.institution_id);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    // ── Stage 1: validate every row, collect errors ───────────────────────────
    const validRows: Array<{ row: number; payload: ReturnType<typeof toCoeCreatePayload> }> = [];
    const errors: BosBulkImportResponse['errors'] = [];

    rows.forEach((raw, idx) => {
      const parsed = importRowSchema.safeParse({ ...(raw as object), __row: idx + 2 });
      if (!parsed.success) {
        errors.push({
          row: idx + 2,
          course_code: (raw as { course_code?: string })?.course_code,
          message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        });
        return;
      }
      const { __row, ...form } = parsed.data;
      validRows.push({
        row: __row,
        payload: toCoeCreatePayload(form, {
          institutions_id: coeInstitutionId,
          institution_code: context.institution_code,
          regulation_code: context.regulation_code,
          regulation_id: context.regulation_id,
        }),
      });
    });

    // ── Stage 2: chunk + POST sequentially ────────────────────────────────────
    const client = CoeRestClient.create();
    let inserted = 0, updated = 0;

    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      const slice = validRows.slice(i, i + CHUNK_SIZE);
      try {
        const resp = await client.post<{ inserted?: number; updated?: number; errors?: any[] }>(
          '/api/v1/courses',
          { courses: slice.map((s) => s.payload) },
        );
        inserted += resp.inserted ?? 0;
        updated += resp.updated ?? 0;
        (resp.errors ?? []).forEach((e: any, j: number) => {
          errors.push({ row: slice[j].row, course_code: slice[j].payload.course_code, message: e.message ?? String(e) });
        });
      } catch (err) {
        if (err instanceof CoeApiError) {
          slice.forEach((s) => errors.push({
            row: s.row, course_code: s.payload.course_code,
            message: err.message,
          }));
        } else {
          throw err;
        }
      }
    }

    const response: BosBulkImportResponse = {
      inserted,
      updated,
      total: rows.length,
      errors,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('[bos/courses-master/import] error:', error);
    return NextResponse.json({ error: 'Bulk import failed' }, { status: 500 });
  }
}
```

> If COE's POST endpoint expects `mappings: []` style for bulk on `/api/v1/courses` and not `courses: []`, adjust the wrapping shape — your spec says `mappings: []` for course-mapping; the wrapping for courses bulk should be confirmed against the COE OpenAPI doc.

**Step 2: Verify**

```bash
npm run typecheck && npm run lint
```

**Step 3: Commit**

```bash
git add app/api/bos/courses-master/import/route.ts
git commit -m "feat(bos): add bulk Excel import proxy with per-row error collection"
```

---

### Task 9: Proxy route — course-mapping list + bulk POST

**Files:**
- Create: `app/api/bos/course-mapping/route.ts`

```typescript
// app/api/bos/course-mapping/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { canAccessBos, resolveCoeInstitutionId } from '@/lib/utils/bos/bos-access';

// ── GET /api/bos/course-mapping ───────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await canAccessBos(user.id, 'academic.bos-scheme', 'view'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');
    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const client = CoeRestClient.create();
    const data = await client.get<unknown>('/api/v1/course-mapping', {
      institutions_id:  coeInstitutionId,
      program_code:     searchParams.get('program_code') ?? undefined,
      regulation_code:  searchParams.get('regulation_code') ?? undefined,
      batch_code:       searchParams.get('batch_code') ?? undefined,
      semester_code:    searchParams.get('semester_code') ?? undefined,
      is_active:        searchParams.get('is_active') ?? 'true',
      details:          searchParams.get('details') ?? 'true',
      id:               searchParams.get('id') ?? undefined,
      limit:            searchParams.get('limit') ?? '500',
    });

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[bos/course-mapping] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 });
  }
}

// ── POST /api/bos/course-mapping (single OR bulk via mappings: []) ────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await canAccessBos(user.id, 'academic.bos-scheme', 'edit'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const client = CoeRestClient.create();

    // Pass through — COE handles single vs bulk via the `mappings` key
    const result = await client.post<unknown>('/api/v1/course-mapping', body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error('[bos/course-mapping] POST error:', error);
    return NextResponse.json({ error: 'Failed to create mapping' }, { status: 500 });
  }
}
```

**Step 2: Verify + commit**

```bash
npm run typecheck && npm run lint
git add app/api/bos/course-mapping/route.ts
git commit -m "feat(bos): add course-mapping list+create proxy"
```

---

### Task 10: Proxy route — course-mapping single (PUT, DELETE soft)

**Files:**
- Create: `app/api/bos/course-mapping/[id]/route.ts`

```typescript
// app/api/bos/course-mapping/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { canAccessBos } from '@/lib/utils/bos/bos-access';

async function gate() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!(await canAccessBos(user.id, 'academic.bos-scheme', 'edit'))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user };
}

/** Refuses mutation if mapping is Locked (e.g. ratified by a BoS meeting). */
async function assertMappingNotLocked(client: CoeRestClient, id: string): Promise<NextResponse | null> {
  const r = await client.get<{ data?: Array<{ mapping_status?: string }> } | { mapping_status?: string }>(
    `/api/v1/course-mapping?id=${id}`,
  );
  const row = Array.isArray((r as any)?.data) ? (r as any).data[0] : r;
  if (row?.mapping_status === 'Locked') {
    return NextResponse.json(
      { error: 'Mapping is locked and cannot be modified', code: 'LOCKED' },
      { status: 423 },
    );
  }
  return null;
}

// ── PUT /api/bos/course-mapping/[id] ──────────────────────────────────────────
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await gate();
  if ('error' in auth) return auth.error;

  try {
    const { id } = await params;
    const client = CoeRestClient.create();
    const lockResp = await assertMappingNotLocked(client, id);
    if (lockResp) return lockResp;

    const body = await request.json();
    const result = await client.put<unknown>(`/api/v1/course-mapping/${id}`, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to update mapping' }, { status: 500 });
  }
}

// ── DELETE /api/bos/course-mapping/[id] (soft via is_active=false) ────────────
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await gate();
  if ('error' in auth) return auth.error;

  try {
    const { id } = await params;
    const client = CoeRestClient.create();
    const lockResp = await assertMappingNotLocked(client, id);
    if (lockResp) return lockResp;

    // Soft-delete: PUT is_active=false (matches partial-unique index in schema)
    const result = await client.put<unknown>(`/api/v1/course-mapping/${id}`, { is_active: false });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to remove mapping' }, { status: 500 });
  }
}
```

**Step 2: Verify + commit**

```bash
npm run typecheck && npm run lint
git add app/api/bos/course-mapping/[id]/route.ts
git commit -m "feat(bos): add course-mapping single PUT + soft-DELETE proxy"
```

---

## Phase 3 — Courses tab UI (list + form, no import yet)

### Task 11: TanStack Query hooks

**Files:**
- Create: `hooks/bos/use-bos-courses.ts`

```typescript
// hooks/bos/use-bos-courses.ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BosCourseListResponse, BosCourseMaster, BosBulkImportResponse,
} from '@/types/bos-courses';
import type { CourseFormInput } from '@/lib/services/bos/courses-schemas';

export interface CourseFilters {
  institution_id: string;          // required to even fetch
  regulation_code?: string;
  program_code?: string;
  search?: string;
  is_active?: 'true' | 'false';
  limit?: number;
  offset?: number;
}

const baseKey = ['bos', 'courses'] as const;

export function useBosCourses(filters: CourseFilters | undefined) {
  return useQuery<BosCourseListResponse>({
    queryKey: [...baseKey, 'list', filters] as const,
    enabled: !!filters?.institution_id,
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters!).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.set(k, String(v));
      });
      const r = await fetch(`/api/bos/courses-master?${params}`);
      if (!r.ok) throw new Error((await r.json()).error || 'Failed to load courses');
      return r.json();
    },
  });
}

export function useBosCourse(id: string | undefined) {
  return useQuery<BosCourseMaster>({
    queryKey: [...baseKey, 'one', id] as const,
    enabled: !!id,
    queryFn: async () => {
      const r = await fetch(`/api/bos/courses-master/${id}`);
      if (!r.ok) throw new Error('Failed to load course');
      return r.json();
    },
  });
}

interface MutateContext {
  institution_id: string;
  institution_code: string;
  regulation_code: string;
  regulation_id?: string;
}

export function useCreateBosCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { form: CourseFormInput; context: MutateContext }) => {
      const r = await fetch('/api/bos/courses-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Create failed');
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey }),
  });
}

export function useUpdateBosCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; form: Partial<CourseFormInput> }) => {
      const r = await fetch(`/api/bos/courses-master/${vars.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: vars.form }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Update failed');
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey }),
  });
}

export function useDeleteBosCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/bos/courses-master/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Delete failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey }),
  });
}

export function useImportBosCourses() {
  const qc = useQueryClient();
  return useMutation<BosBulkImportResponse, Error, { rows: unknown[]; context: MutateContext }>({
    mutationFn: async (vars) => {
      const r = await fetch('/api/bos/courses-master/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Import failed');
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey }),
  });
}
```

**Step 2: Verify + commit**

```bash
npm run typecheck
git add hooks/bos/use-bos-courses.ts
git commit -m "feat(bos): add TanStack Query hooks for courses CRUD + import"
```

---

### Task 12: Courses page — list + filters + board context

**Files:**
- Create: `app/(routes)/bos/courses/page.tsx`
- Create: `app/(routes)/bos/courses/_components/courses-data-table.tsx`
- Create: `app/(routes)/bos/courses/_components/courses-columns.tsx`
- Create: `app/(routes)/bos/courses/_components/courses-filters.tsx`
- Create: `app/(routes)/bos/courses/_components/board-context-bar.tsx`

**Step 1: Page entry (server component)**

```tsx
// app/(routes)/bos/courses/page.tsx
import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { CoursesPageClient } from './_components/courses-page-client';

export default function CoursesPage() {
  return (
    <PermissionGuard module='academic.bos-courses' action='view'>
      <Card>
        <CardContent className='p-6 space-y-6'>
          <CoursesPageClient />
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}
```

**Step 2: Client wrapper**

```tsx
// app/(routes)/bos/courses/_components/courses-page-client.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

import { BoardContextBar, type BoardContext } from './board-context-bar';
import { CoursesFilters, type CoursesFiltersState } from './courses-filters';
import { CoursesDataTable } from './courses-data-table';
import { ImportCoursesDialog } from './import-courses-dialog';   // Phase 4 — leave commented out until that phase
import { downloadCoursesTemplate } from './download-template';   // Phase 4

export function CoursesPageClient() {
  const router = useRouter();
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();

  const canCreate = isSuperAdmin || canAccess('academic.bos-courses', 'create');
  const canImport = isSuperAdmin || canAccess('academic.bos-courses', 'import');

  const [board, setBoard] = useState<BoardContext | null>(null);
  const [filters, setFilters] = useState<CoursesFiltersState>({ search: '', is_active: 'true' });
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className='space-y-6'>
      <div className='flex items-end justify-between gap-4 flex-wrap'>
        <BoardContextBar value={board} onChange={setBoard} defaultInstitutionId={profile?.institution_id} />
        <div className='flex gap-2'>
          {canImport && board && (
            <>
              <Button variant='outline' size='sm' onClick={() => downloadCoursesTemplate()}>
                <Download className='mr-2 h-4 w-4' /> Template
              </Button>
              <Button variant='outline' size='sm' onClick={() => setImportOpen(true)}>
                <Upload className='mr-2 h-4 w-4' /> Import
              </Button>
            </>
          )}
          {canCreate && board && (
            <Button size='sm' onClick={() => router.push('/bos/courses/new')}>
              <Plus className='mr-2 h-4 w-4' /> New Course
            </Button>
          )}
        </div>
      </div>

      {board ? (
        <>
          <CoursesFilters value={filters} onChange={setFilters} />
          <CoursesDataTable board={board} filters={filters} />
          {canImport && (
            <ImportCoursesDialog
              open={importOpen}
              onClose={() => setImportOpen(false)}
              board={board}
            />
          )}
        </>
      ) : (
        <p className='text-sm text-muted-foreground'>Select a board to view courses.</p>
      )}
    </div>
  );
}
```

**Step 3: Board context bar — wraps existing useBosBoards hook**

```tsx
// app/(routes)/bos/courses/_components/board-context-bar.tsx
'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBosBoards } from '@/hooks/bos/use-bos-boards';

export interface BoardContext {
  board_id: string;
  institution_id: string;
  institution_code: string;
  regulation_id?: string;
  regulation_code: string;
}

export function BoardContextBar({
  value, onChange, defaultInstitutionId,
}: {
  value: BoardContext | null;
  onChange: (b: BoardContext | null) => void;
  defaultInstitutionId?: string;
}) {
  const { data: boardsResp, isLoading } = useBosBoards({ institutionsId: defaultInstitutionId });
  const boards = boardsResp?.data ?? [];

  return (
    <div className='space-y-1'>
      <label className='text-xs font-medium text-muted-foreground'>Board</label>
      <Select
        value={value?.board_id ?? ''}
        onValueChange={(id) => {
          const b = boards.find((x: any) => x.id === id);
          if (!b) return onChange(null);
          onChange({
            board_id: b.id,
            institution_id: b.institutions_id,
            institution_code: b.institution_code ?? '',
            regulation_id: b.regulation_id,
            regulation_code: b.regulation_code ?? '',
          });
        }}
        disabled={isLoading}
      >
        <SelectTrigger className='w-[280px]'>
          <SelectValue placeholder='Select a board…' />
        </SelectTrigger>
        <SelectContent>
          {boards.map((b: any) => (
            <SelectItem key={b.id} value={b.id}>
              {b.board_code} — {b.regulation_code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

> If `useBosBoards` doesn't exist yet at `hooks/bos/use-bos-boards.ts`, find the existing query inside [app/api/bos/boards/route.ts](../../app/api/bos/boards/route.ts) and create a thin hook in the same style as `use-bos-meetings`.

**Step 4: Filters component**

```tsx
// app/(routes)/bos/courses/_components/courses-filters.tsx
'use client';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface CoursesFiltersState {
  search: string;
  is_active: 'true' | 'false';
}

export function CoursesFilters({
  value, onChange,
}: { value: CoursesFiltersState; onChange: (v: CoursesFiltersState) => void }) {
  return (
    <div className='flex gap-3 flex-wrap'>
      <Input
        placeholder='Search by code or name…'
        value={value.search}
        onChange={(e) => onChange({ ...value, search: e.target.value })}
        className='max-w-sm'
      />
      <Select value={value.is_active} onValueChange={(v) => onChange({ ...value, is_active: v as any })}>
        <SelectTrigger className='w-[140px]'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='true'>Active</SelectItem>
          <SelectItem value='false'>Inactive</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

**Step 5: Columns**

```tsx
// app/(routes)/bos/courses/_components/courses-columns.tsx
'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { BosCourseMaster } from '@/types/bos-courses';
import { CoursesRowActions } from './courses-row-actions';

export const coursesColumns: ColumnDef<BosCourseMaster>[] = [
  { accessorKey: 'course_code', header: 'Code', cell: ({ row }) => <span className='font-mono text-xs'>{row.original.course_code}</span> },
  { accessorKey: 'course_name', header: 'Name' },
  { accessorKey: 'course_part_master', header: 'Part' },
  { accessorKey: 'course_type', header: 'Type', cell: ({ row }) => <Badge variant='outline'>{row.original.course_type}</Badge> },
  { accessorKey: 'credit', header: 'Credits', cell: ({ row }) => row.original.credit.toFixed(2) },
  {
    id: 'hours',
    header: 'L+P',
    cell: ({ row }) => `${row.original.theory_hours}+${row.original.practical_hours}`,
  },
  {
    id: 'marks',
    header: 'Marks',
    cell: ({ row }) =>
      `${row.original.internal_max_mark}/${row.original.external_max_mark}/${row.original.total_max_mark}`,
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      // Locked takes precedence over active/inactive in the badge.
      if (row.original.course_status === 'Locked') {
        return <Badge variant='destructive' className='gap-1'><Lock className='h-3 w-3' />Locked</Badge>;
      }
      return row.original.status
        ? <Badge variant='default'>Active</Badge>
        : <Badge variant='secondary'>Inactive</Badge>;
    },
  },
  { id: 'actions', cell: ({ row }) => <CoursesRowActions course={row.original} /> },
];
```

**Step 6: Row actions menu**

```tsx
// app/(routes)/bos/courses/_components/courses-row-actions.tsx
'use client';

import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermissions } from '@/hooks/use-permissions';
import { useDeleteBosCourse } from '@/hooks/bos/use-bos-courses';
import { toast } from 'sonner';
import { type BosCourseMaster, isLocked } from '@/types/bos-courses';

export function CoursesRowActions({ course }: { course: BosCourseMaster }) {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const del = useDeleteBosCourse();

  const locked = isLocked(course);
  const canEdit = !locked && (isSuperAdmin || canAccess('academic.bos-courses', 'edit'));
  const canDelete = !locked && (isSuperAdmin || canAccess('academic.bos-courses', 'delete'));

  // If locked AND user has no other actions available, render nothing rather than an empty menu.
  if (!canEdit && !canDelete) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' className='h-8 w-8'><MoreHorizontal className='h-4 w-4' /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        {canEdit && (
          <DropdownMenuItem onClick={() => router.push(`/bos/courses/${course.id}/edit`)}>Edit</DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem
            className='text-red-600'
            onClick={async () => {
              if (!confirm(`Delete ${course.course_code}?`)) return;
              try {
                await del.mutateAsync(course.id);
                toast.success('Course deleted');
              } catch (e: any) {
                // Surface server-side 423 LOCKED specifically.
                toast.error(e.message?.includes('locked') ? 'This course is locked.' : e.message);
              }
            }}
          >Delete</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Step 7: DataTable wrapper**

```tsx
// app/(routes)/bos/courses/_components/courses-data-table.tsx
'use client';

import { DataTable } from '@/components/ui/data-table';   // existing shadcn-style table
import { Skeleton } from '@/components/ui/skeleton';
import { useBosCourses } from '@/hooks/bos/use-bos-courses';
import { coursesColumns } from './courses-columns';
import type { BoardContext } from './board-context-bar';
import type { CoursesFiltersState } from './courses-filters';

export function CoursesDataTable({
  board, filters,
}: { board: BoardContext; filters: CoursesFiltersState }) {
  const { data, isLoading, error } = useBosCourses({
    institution_id: board.institution_id,
    regulation_code: board.regulation_code,
    search: filters.search || undefined,
    is_active: filters.is_active,
    limit: 200,
  });

  if (isLoading) return <Skeleton className='h-64 w-full' />;
  if (error) return <p className='text-sm text-red-600'>{(error as Error).message}</p>;

  return <DataTable columns={coursesColumns} data={data?.data ?? []} />;
}
```

**Step 8: Verify**

```bash
npm run typecheck
npm run dev
# Navigate to http://localhost:3000/bos/courses — but wait, layout doesn't know this route yet.
```
You'll get a 404 until Task 18 wires the tab.

**Step 9: Commit**

```bash
git add app/\(routes\)/bos/courses
git commit -m "feat(bos): add courses listing page with filters, table, row actions"
```

---

### Task 13: Course form + new + edit pages

**Files:**
- Create: `app/(routes)/bos/courses/_components/course-form.tsx`
- Create: `app/(routes)/bos/courses/new/page.tsx`
- Create: `app/(routes)/bos/courses/[id]/edit/page.tsx`

**Step 1: Form component**

```tsx
// app/(routes)/bos/courses/_components/course-form.tsx
'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  courseFormSchema, COURSE_PART_VALUES, COURSE_CATEGORY_VALUES, COURSE_TYPE_VALUES,
  type CourseFormInput,
} from '@/lib/services/bos/courses-schemas';

interface Props {
  defaultValues?: Partial<CourseFormInput>;
  onSubmit: (values: CourseFormInput) => Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
}

export function CourseForm({ defaultValues, onSubmit, submitting, submitLabel = 'Save' }: Props) {
  const form = useForm<CourseFormInput>({
    resolver: zodResolver(courseFormSchema),
    defaultValues: {
      course_code: '',
      course_name: '',
      course_category: 'Theory',
      course_part_master: 'Part III',
      course_type: 'Core',
      exam_duration: 3,
      credit: 3,
      theory_hours: 0,
      practical_hours: 0,
      internal_max_mark: 25,
      external_max_mark: 75,
      total_max_mark: 100,
      ...defaultValues,
    },
  });

  // Auto-compute total_max_mark
  const internal = form.watch('internal_max_mark');
  const external = form.watch('external_max_mark');
  useEffect(() => {
    form.setValue('total_max_mark', Number(internal || 0) + Number(external || 0), { shouldValidate: false });
  }, [internal, external]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6 max-w-3xl'>
      {/* Identity */}
      <fieldset className='space-y-3 rounded-lg border p-4'>
        <legend className='px-2 text-sm font-semibold'>Identity</legend>
        <div className='grid grid-cols-2 gap-3'>
          <Field label='Course Code' error={form.formState.errors.course_code?.message}>
            <Input {...form.register('course_code')} placeholder='24UCSC01' className='font-mono' />
          </Field>
          <Field label='Course Name' error={form.formState.errors.course_name?.message}>
            <Input {...form.register('course_name')} />
          </Field>
        </div>
        <div className='grid grid-cols-3 gap-3'>
          <SelectField name='course_category' form={form} label='Category' options={COURSE_CATEGORY_VALUES} />
          <SelectField name='course_part_master' form={form} label='Part' options={COURSE_PART_VALUES} />
          <SelectField name='course_type' form={form} label='Type' options={COURSE_TYPE_VALUES} />
        </div>
      </fieldset>

      {/* Workload */}
      <fieldset className='space-y-3 rounded-lg border p-4'>
        <legend className='px-2 text-sm font-semibold'>Workload</legend>
        <div className='grid grid-cols-4 gap-3'>
          <Field label='Exam (Hrs)' error={form.formState.errors.exam_duration?.message}>
            <Input type='number' min={0} max={8} {...form.register('exam_duration', { valueAsNumber: true })} />
          </Field>
          <Field label='Credits' error={form.formState.errors.credit?.message}>
            <Input type='number' step='0.5' min={0} max={10} {...form.register('credit', { valueAsNumber: true })} />
          </Field>
          <Field label='Theory Hours' error={form.formState.errors.theory_hours?.message}>
            <Input type='number' min={0} max={40} {...form.register('theory_hours', { valueAsNumber: true })} />
          </Field>
          <Field label='Practical Hours' error={form.formState.errors.practical_hours?.message}>
            <Input type='number' min={0} max={40} {...form.register('practical_hours', { valueAsNumber: true })} />
          </Field>
        </div>
      </fieldset>

      {/* Marks */}
      <fieldset className='space-y-3 rounded-lg border p-4'>
        <legend className='px-2 text-sm font-semibold'>Max Marks</legend>
        <div className='grid grid-cols-3 gap-3'>
          <Field label='Internal (CIA)' error={form.formState.errors.internal_max_mark?.message}>
            <Input type='number' min={0} max={100} {...form.register('internal_max_mark', { valueAsNumber: true })} />
          </Field>
          <Field label='External (ESE)' error={form.formState.errors.external_max_mark?.message}>
            <Input type='number' min={0} max={100} {...form.register('external_max_mark', { valueAsNumber: true })} />
          </Field>
          <Field label='Total (auto)'>
            <Input disabled type='number' {...form.register('total_max_mark', { valueAsNumber: true })} />
          </Field>
        </div>
      </fieldset>

      <Button type='submit' disabled={submitting}>{submitting ? 'Saving…' : submitLabel}</Button>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className='space-y-1'>
      <Label className='text-xs'>{label}</Label>
      {children}
      {error && <p className='text-xs text-red-600'>{error}</p>}
    </div>
  );
}

function SelectField({ name, form, label, options }:
  { name: keyof CourseFormInput; form: any; label: string; options: readonly string[] }) {
  const value = form.watch(name);
  const error = form.formState.errors[name]?.message;
  return (
    <Field label={label} error={error}>
      <Select value={value} onValueChange={(v) => form.setValue(name, v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}
```

**Step 2: New course page**

```tsx
// app/(routes)/bos/courses/new/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { CourseForm } from '../_components/course-form';
import { BoardContextBar, type BoardContext } from '../_components/board-context-bar';
import { useCreateBosCourse } from '@/hooks/bos/use-bos-courses';
import { useAuth } from '@/hooks/use-auth';

export default function NewCoursePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [board, setBoard] = useState<BoardContext | null>(null);
  const create = useCreateBosCourse();

  return (
    <PermissionGuard module='academic.bos-courses' action='create'>
      <Card>
        <CardHeader><CardTitle className='text-base'>New Course</CardTitle></CardHeader>
        <CardContent className='space-y-6'>
          <BoardContextBar value={board} onChange={setBoard} defaultInstitutionId={profile?.institution_id} />
          {board && (
            <CourseForm
              submitting={create.isPending}
              submitLabel='Create Course'
              onSubmit={async (form) => {
                try {
                  await create.mutateAsync({ form, context: { ...board } });
                  toast.success('Course created');
                  router.push('/bos/courses');
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            />
          )}
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}
```

**Step 3: Edit page**

```tsx
// app/(routes)/bos/courses/[id]/edit/page.tsx
'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { CourseForm } from '../../_components/course-form';
import { useBosCourse, useUpdateBosCourse } from '@/hooks/bos/use-bos-courses';
import { isLocked } from '@/types/bos-courses';
import { Lock } from 'lucide-react';

export default function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: course, isLoading } = useBosCourse(id);
  const update = useUpdateBosCourse();

  return (
    <PermissionGuard module='academic.bos-courses' action='edit'>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {course ? `Edit ${course.course_code}` : 'Edit Course'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !course ? (
            <Skeleton className='h-96 w-full' />
          ) : isLocked(course) ? (
            <div className='flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800'>
              <Lock className='h-4 w-4' />
              This course is <strong>Locked</strong> and cannot be edited.
              <button onClick={() => router.push('/bos/courses')} className='ml-auto underline'>
                Back to list
              </button>
            </div>
          ) : (
            <CourseForm
              submitting={update.isPending}
              submitLabel='Save Changes'
              defaultValues={{
                course_code: course.course_code,
                course_name: course.course_name,
                course_category: course.course_category,
                course_part_master: course.course_part_master ?? 'Part III',
                course_type: (course.course_type as any) ?? 'Core',
                exam_duration: course.exam_duration,
                credit: course.credit,
                theory_hours: course.theory_hours,
                practical_hours: course.practical_hours,
                internal_max_mark: course.internal_max_mark,
                external_max_mark: course.external_max_mark,
                total_max_mark: course.total_max_mark,
              }}
              onSubmit={async (form) => {
                try {
                  await update.mutateAsync({ id, form });
                  toast.success('Course updated');
                  router.push('/bos/courses');
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            />
          )}
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}
```

**Step 4: Verify + commit**

```bash
npm run typecheck && npm run lint
git add app/\(routes\)/bos/courses
git commit -m "feat(bos): add course form, new and edit pages"
```

---

### Task 14: Wire Courses tab into BOS layout + sidebar

**Files:**
- Modify: [app/(routes)/bos/layout.tsx](../../app/(routes)/bos/layout.tsx) — `BOS_NAV_TABS` array, `resolveSubLeaf`
- Modify: [lib/sidebarMenuLink.ts](../../lib/sidebarMenuLink.ts) — add the two routes (and Course Scheme; we'll register both now)

**Step 1: Edit `BOS_NAV_TABS`**

Open [app/(routes)/bos/layout.tsx:7](../../app/(routes)/bos/layout.tsx#L7). Add icons:

```typescript
import { Users, ClipboardList, CalendarDays, Receipt, BarChart3, BookOpen, Layers, BookText, ListTree } from 'lucide-react';
```

Replace the `BOS_NAV_TABS` constant:

```typescript
const BOS_NAV_TABS = [
  { href: '/bos/taxonomy',      label: 'Taxonomy',         icon: Layers },
  { href: '/bos/courses',       label: 'Courses',          icon: BookText },
  { href: '/bos/course-scheme', label: 'Course Scheme',    icon: ListTree },
  { href: '/bos/experts',       label: 'External Experts', icon: Users },
  { href: '/bos/compositions',  label: 'Compositions',     icon: ClipboardList },
  { href: '/bos/syllabi',       label: 'Syllabi',          icon: BookOpen },
  { href: '/bos/meetings',      label: 'Meetings',         icon: CalendarDays },
  { href: '/bos/ta-da',         label: 'TA/DA Claims',     icon: Receipt },
  { href: '/bos/reports',       label: 'Reports',          icon: BarChart3 },
];
```

**Step 2: Update breadcrumb labels in `resolveSubLeaf`**

After line `if (tabHref === '/bos/meetings') return 'Schedule Meeting';` add:

```typescript
    if (tabHref === '/bos/courses') return 'New Course';
```

In the `tail.endsWith('/edit')` block, add:

```typescript
    if (tabHref === '/bos/courses') return 'Edit Course';
```

**Step 3: Sidebar entry**

Find the BOS section in [lib/sidebarMenuLink.ts](../../lib/sidebarMenuLink.ts) (search for `'/bos/syllabi'`) and add **two new entries** alongside the existing BOS items:

```typescript
{
  href: '/bos/courses',
  label: 'Courses',
  icon: 'BookText',
  permissionModule: 'academic.bos-courses',
  permissionAction: 'view',
},
{
  href: '/bos/course-scheme',
  label: 'Course Scheme',
  icon: 'ListTree',
  permissionModule: 'academic.bos-scheme',
  permissionAction: 'view',
},
```

(Adapt to whatever shape that file uses — copy a neighbor entry verbatim and rewrite the four fields.)

**Step 4: Regenerate route manifest**

```bash
npm run gen:routes
```

**Step 5: Verify reachability gate**

```bash
npm run check:reachability
```
Expected: 0 unreachable. If it complains the `/bos/course-scheme` page doesn't exist yet, that's resolved in Phase 5 — temporarily comment that sidebar entry and re-add in Task 23.

**Step 6: Manually verify in browser**

```bash
npm run dev
# Visit http://localhost:3000/bos/courses
```
Expected: Tab is visible, page renders, board picker shows boards, table is empty until a board is picked.

**Step 7: Commit**

```bash
git add app/\(routes\)/bos/layout.tsx lib/sidebarMenuLink.ts lib/navigation/route-manifest.generated.ts
git commit -m "feat(bos): register courses + course-scheme tabs in nav"
```

---

## Phase 4 — Excel import

### Task 15: Generate `.xlsx` template with cascading dropdowns

**Files:**
- Create: `app/(routes)/bos/courses/_components/download-template.ts`

```typescript
// app/(routes)/bos/courses/_components/download-template.ts
'use client';

import ExcelJS from 'exceljs';
import {
  COURSE_PART_VALUES, COURSE_CATEGORY_VALUES, COURSE_TYPE_VALUES,
} from '@/lib/services/bos/courses-schemas';

const HEADERS = [
  'course_code', 'course_name', 'course_category', 'course_part_master', 'course_type',
  'exam_duration', 'credit', 'theory_hours', 'practical_hours',
  'internal_max_mark', 'external_max_mark', 'total_max_mark',
];

export async function downloadCoursesTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Courses');
  const ref = wb.addWorksheet('_dropdowns');
  ref.state = 'hidden';

  ws.addRow(HEADERS);
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => (c.width = 18));

  // Reference lists on hidden sheet (Excel data validation can't take inline lists > 255 chars)
  COURSE_PART_VALUES.forEach((v, i) => ref.getCell(i + 1, 1).value = v);
  COURSE_CATEGORY_VALUES.forEach((v, i) => ref.getCell(i + 1, 2).value = v);
  COURSE_TYPE_VALUES.forEach((v, i) => ref.getCell(i + 1, 3).value = v);

  // Apply data validation to first 200 rows
  for (let row = 2; row <= 201; row++) {
    ws.getCell(`C${row}`).dataValidation = {
      type: 'list', allowBlank: false,
      formulae: [`_dropdowns!$B$1:$B$${COURSE_CATEGORY_VALUES.length}`],
    };
    ws.getCell(`D${row}`).dataValidation = {
      type: 'list', allowBlank: false,
      formulae: [`_dropdowns!$A$1:$A$${COURSE_PART_VALUES.length}`],
    };
    ws.getCell(`E${row}`).dataValidation = {
      type: 'list', allowBlank: false,
      formulae: [`_dropdowns!$C$1:$C$${COURSE_TYPE_VALUES.length}`],
    };
    // Numeric cells
    ['F', 'G', 'H', 'I', 'J', 'K', 'L'].forEach((col) => {
      ws.getCell(`${col}${row}`).dataValidation = {
        type: 'whole', operator: 'greaterThanOrEqual', formulae: [0], allowBlank: true,
      };
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bos-courses-template-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Step 2: Verify**

```bash
npm run typecheck
```

**Step 3: Commit**

```bash
git add app/\(routes\)/bos/courses/_components/download-template.ts
git commit -m "feat(bos): add Excel template with cascading dropdowns for course import"
```

---

### Task 16: Import dialog — file upload, parse, preview, submit

**Files:**
- Create: `app/(routes)/bos/courses/_components/import-courses-dialog.tsx`

```tsx
// app/(routes)/bos/courses/_components/import-courses-dialog.tsx
'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useImportBosCourses } from '@/hooks/bos/use-bos-courses';
import type { BoardContext } from './board-context-bar';
import type { BosBulkImportResponse } from '@/types/bos-courses';
import { toast } from 'sonner';

export function ImportCoursesDialog({
  open, onClose, board,
}: { open: boolean; onClose: () => void; board: BoardContext }) {
  const [rows, setRows] = useState<unknown[] | null>(null);
  const [result, setResult] = useState<BosBulkImportResponse | null>(null);
  const importMut = useImportBosCourses();

  const handleFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets['Courses'] ?? wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    setRows(data);
    setResult(null);
  };

  const submit = async () => {
    if (!rows) return;
    try {
      const r = await importMut.mutateAsync({
        rows,
        context: {
          institution_id: board.institution_id,
          institution_code: board.institution_code,
          regulation_code: board.regulation_code,
          regulation_id: board.regulation_id,
        },
      });
      setResult(r);
      if (r.errors.length === 0) {
        toast.success(`Imported ${r.inserted} new, updated ${r.updated}`);
      } else {
        toast.warning(`${r.errors.length} row(s) failed — see details below`);
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader><DialogTitle>Import Courses from Excel</DialogTitle></DialogHeader>

        {!rows && (
          <label className='flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-10 cursor-pointer hover:bg-muted/50'>
            <Upload className='h-8 w-8 text-muted-foreground mb-2' />
            <span className='text-sm font-medium'>Click to choose an .xlsx file</span>
            <span className='text-xs text-muted-foreground'>Use the downloaded template for best results</span>
            <input type='file' accept='.xlsx,.xls' className='hidden'
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>
        )}

        {rows && !result && (
          <div className='space-y-3'>
            <p className='text-sm'>Parsed <strong>{rows.length}</strong> rows. Ready to import?</p>
            {importMut.isPending && <Progress value={50} />}
          </div>
        )}

        {result && (
          <div className='space-y-2 max-h-80 overflow-y-auto'>
            <p className='text-sm'>
              ✅ Inserted: <strong>{result.inserted}</strong> · 🔁 Updated: <strong>{result.updated}</strong> ·
              ❌ Errors: <strong>{result.errors.length}</strong>
            </p>
            {result.errors.length > 0 && (
              <table className='w-full text-xs border'>
                <thead className='bg-muted'>
                  <tr><th className='p-2 text-left'>Row</th><th className='p-2 text-left'>Code</th><th className='p-2 text-left'>Error</th></tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i} className='border-t'>
                      <td className='p-2'>{e.row}</td>
                      <td className='p-2 font-mono'>{e.course_code ?? '-'}</td>
                      <td className='p-2 text-red-600'>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant='outline' onClick={onClose}>{result ? 'Close' : 'Cancel'}</Button>
          {rows && !result && (
            <Button onClick={submit} disabled={importMut.isPending}>
              {importMut.isPending ? 'Importing…' : `Import ${rows.length} courses`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Verify**

```bash
npm run typecheck
npm run dev
# Visit /bos/courses, pick a board, click Template → file downloads
# Fill 2-3 rows, save, click Import → choose file → click Import → see result table
```

**Step 3: Commit**

```bash
git add app/\(routes\)/bos/courses/_components/import-courses-dialog.tsx
git commit -m "feat(bos): add Excel import dialog with parse, preview, error display"
```

---

## Phase 5 — Course Scheme tab

### Task 17: useBosCourseScheme hook

**Files:**
- Create: `hooks/bos/use-bos-course-scheme.ts`

```typescript
// hooks/bos/use-bos-course-scheme.ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BosCourseMappingDetailed } from '@/types/bos-courses';

export interface SchemeFilters {
  institution_id: string;
  program_code: string;
  regulation_code: string;
  batch_code?: string;
}

const baseKey = ['bos', 'course-mapping'] as const;

export function useBosCourseScheme(filters: SchemeFilters | null) {
  return useQuery<{ data: BosCourseMappingDetailed[] }>({
    queryKey: [...baseKey, filters] as const,
    enabled: !!filters?.institution_id && !!filters?.program_code && !!filters?.regulation_code,
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters!).forEach(([k, v]) => v && params.set(k, String(v)));
      params.set('details', 'true');
      const r = await fetch(`/api/bos/course-mapping?${params}`);
      if (!r.ok) throw new Error((await r.json()).error || 'Failed to load scheme');
      return r.json();
    },
  });
}

export function useAddMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mapping: Record<string, unknown>) => {
      const r = await fetch('/api/bos/course-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapping),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Add failed');
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey }),
  });
}

export function useRemoveMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/bos/course-mapping/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Remove failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey }),
  });
}
```

**Step 2: Commit**

```bash
git add hooks/bos/use-bos-course-scheme.ts
git commit -m "feat(bos): add hooks for course scheme query + add/remove mappings"
```

---

### Task 18: Course Scheme page — view mode

**Files:**
- Create: `app/(routes)/bos/course-scheme/page.tsx`
- Create: `app/(routes)/bos/course-scheme/_components/scheme-page-client.tsx`
- Create: `app/(routes)/bos/course-scheme/_components/scheme-filters.tsx`
- Create: `app/(routes)/bos/course-scheme/_components/semester-table.tsx`

**Step 1: Server entry**

```tsx
// app/(routes)/bos/course-scheme/page.tsx
import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { SchemePageClient } from './_components/scheme-page-client';

export default function CourseSchemePage() {
  return (
    <PermissionGuard module='academic.bos-scheme' action='view'>
      <Card><CardContent className='p-6'><SchemePageClient /></CardContent></Card>
    </PermissionGuard>
  );
}
```

**Step 2: Client wrapper**

```tsx
// app/(routes)/bos/course-scheme/_components/scheme-page-client.tsx
'use client';

import { useMemo, useState } from 'react';
import { Eye, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { useBosCourseScheme } from '@/hooks/bos/use-bos-course-scheme';
import { SchemeFiltersBar, type SchemeFilterState } from './scheme-filters';
import { SemesterTable } from './semester-table';
import { AddMappingDialog } from './add-mapping-dialog';
import type { BosCourseMappingDetailed } from '@/types/bos-courses';

export function SchemePageClient() {
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEdit = isSuperAdmin || canAccess('academic.bos-scheme', 'edit');

  const [filters, setFilters] = useState<SchemeFilterState | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [addToSemester, setAddToSemester] = useState<string | null>(null);

  const { data, isLoading } = useBosCourseScheme(filters);

  const grouped = useMemo(() => {
    const map = new Map<string, BosCourseMappingDetailed[]>();
    (data?.data ?? []).forEach((m) => {
      const key = m.semester_code ?? 'Unassigned';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  }, [data]);

  return (
    <div className='space-y-6'>
      <div className='flex items-end justify-between gap-3 flex-wrap'>
        <SchemeFiltersBar value={filters} onChange={setFilters} />
        {canEdit && filters && (
          <Button variant={editMode ? 'default' : 'outline'} size='sm' onClick={() => setEditMode((v) => !v)}>
            {editMode ? <Pencil className='mr-2 h-4 w-4' /> : <Eye className='mr-2 h-4 w-4' />}
            {editMode ? 'Edit Mode' : 'View Mode'}
          </Button>
        )}
      </div>

      {!filters && <p className='text-sm text-muted-foreground'>Select board, program, regulation, and batch.</p>}

      {filters && isLoading && <Skeleton className='h-96 w-full' />}

      {filters && !isLoading && grouped.length === 0 && (
        <p className='text-sm text-muted-foreground'>No courses mapped for this scheme.</p>
      )}

      {filters && grouped.map(([semester, mappings]) => (
        <SemesterTable
          key={semester}
          semester={semester}
          mappings={mappings}
          editMode={editMode}
          onAddToSemester={() => setAddToSemester(semester)}
        />
      ))}

      {addToSemester && filters && (
        <AddMappingDialog
          semester={addToSemester}
          context={filters}
          onClose={() => setAddToSemester(null)}
        />
      )}
    </div>
  );
}
```

**Step 3: Filters bar**

```tsx
// app/(routes)/bos/course-scheme/_components/scheme-filters.tsx
'use client';

import { useState } from 'react';
import { BoardContextBar, type BoardContext } from '../../courses/_components/board-context-bar';
import { Input } from '@/components/ui/input';

export type SchemeFilterState = {
  institution_id: string;
  program_code: string;
  regulation_code: string;
  batch_code?: string;
};

export function SchemeFiltersBar({
  value, onChange,
}: { value: SchemeFilterState | null; onChange: (v: SchemeFilterState | null) => void }) {
  const [board, setBoard] = useState<BoardContext | null>(null);
  const [program, setProgram] = useState('');
  const [batch, setBatch] = useState('');

  const apply = (b: BoardContext | null = board, p = program, ba = batch) => {
    if (!b || !p) return onChange(null);
    onChange({
      institution_id: b.institution_id,
      program_code: p,
      regulation_code: b.regulation_code,
      batch_code: ba || undefined,
    });
  };

  return (
    <div className='flex gap-3 flex-wrap items-end'>
      <BoardContextBar value={board} onChange={(b) => { setBoard(b); apply(b); }} />
      <div className='space-y-1'>
        <label className='text-xs font-medium text-muted-foreground'>Program code</label>
        <Input value={program} onChange={(e) => setProgram(e.target.value.toUpperCase())} onBlur={() => apply()} placeholder='UCS' className='w-[140px]' />
      </div>
      <div className='space-y-1'>
        <label className='text-xs font-medium text-muted-foreground'>Batch (opt.)</label>
        <Input value={batch} onChange={(e) => setBatch(e.target.value)} onBlur={() => apply()} placeholder='2024' className='w-[120px]' />
      </div>
    </div>
  );
}
```

> Future improvement: convert program + batch to dropdowns backed by their own hooks. For now, free-text codes match how regulation+batch already work elsewhere in BOS.

**Step 4: Semester table**

```tsx
// app/(routes)/bos/course-scheme/_components/semester-table.tsx
'use client';

import { Plus, Trash2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRemoveMapping } from '@/hooks/bos/use-bos-course-scheme';
import { type BosCourseMappingDetailed, isMappingLocked } from '@/types/bos-courses';
import { toast } from 'sonner';

export function SemesterTable({
  semester, mappings, editMode, onAddToSemester,
}: {
  semester: string;
  mappings: BosCourseMappingDetailed[];
  editMode: boolean;
  onAddToSemester: () => void;
}) {
  const remove = useRemoveMapping();

  const totals = mappings.reduce(
    (acc, m) => {
      acc.credits += m.course.credit ?? 0;
      acc.hours += (m.course.theory_hours ?? 0) + (m.course.practical_hours ?? 0);
      acc.marks += m.course.total_max_mark ?? 0;
      return acc;
    },
    { credits: 0, hours: 0, marks: 0 },
  );

  return (
    <section className='space-y-2'>
      <h3 className='text-sm font-semibold uppercase tracking-wide'>Semester {semester}</h3>
      <div className='overflow-x-auto rounded-lg border'>
        <table className='w-full text-xs'>
          <thead className='bg-muted'>
            <tr>
              <th className='p-2 text-left'>Part</th>
              <th className='p-2 text-left'>Code</th>
              <th className='p-2 text-left'>Title</th>
              <th className='p-2 text-right'>Exam</th>
              <th className='p-2 text-right'>Credits</th>
              <th className='p-2 text-right'>L</th>
              <th className='p-2 text-right'>P</th>
              <th className='p-2 text-right'>CIA</th>
              <th className='p-2 text-right'>ESE</th>
              <th className='p-2 text-right'>Total</th>
              {editMode && <th className='p-2'></th>}
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => {
              const locked = isMappingLocked(m);
              return (
                <tr key={m.id} className={locked ? 'border-t bg-muted/40' : 'border-t'}>
                  <td className='p-2'>
                    {m.course.course_part_master ?? '-'}
                    {locked && <Lock className='inline ml-1 h-3 w-3 text-muted-foreground' />}
                  </td>
                  <td className='p-2 font-mono'>{m.course.course_code}</td>
                  <td className='p-2'>{m.course.course_name}</td>
                  <td className='p-2 text-right'>{m.course.exam_duration}</td>
                  <td className='p-2 text-right'>{m.course.credit?.toFixed(2)}</td>
                  <td className='p-2 text-right'>{m.course.theory_hours}</td>
                  <td className='p-2 text-right'>{m.course.practical_hours || '-'}</td>
                  <td className='p-2 text-right'>{m.course.internal_max_mark}</td>
                  <td className='p-2 text-right'>{m.course.external_max_mark}</td>
                  <td className='p-2 text-right font-semibold'>{m.course.total_max_mark}</td>
                  {editMode && (
                    <td className='p-2'>
                      {locked ? (
                        // Locked rows: no trash button, just an explanatory icon.
                        <span title='Locked — ratified mapping cannot be removed'>
                          <Lock className='h-3.5 w-3.5 text-muted-foreground' />
                        </span>
                      ) : (
                        <Button
                          variant='ghost' size='icon' className='h-7 w-7 text-red-600'
                          onClick={async () => {
                            if (!confirm(`Remove ${m.course.course_code} from semester ${semester}?`)) return;
                            try { await remove.mutateAsync(m.id); toast.success('Removed'); }
                            catch (e: any) {
                              toast.error(e.message?.includes('locked') ? 'This mapping is locked.' : e.message);
                            }
                          }}
                        >
                          <Trash2 className='h-3.5 w-3.5' />
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            <tr className='border-t bg-muted/30 font-semibold'>
              <td colSpan={4} className='p-2 text-right'>Totals</td>
              <td className='p-2 text-right'>{totals.credits.toFixed(2)}</td>
              <td colSpan={2} className='p-2 text-right'>{totals.hours} hrs</td>
              <td colSpan={2} className='p-2 text-right'></td>
              <td className='p-2 text-right'>{totals.marks}</td>
              {editMode && <td></td>}
            </tr>
          </tbody>
        </table>
      </div>
      {editMode && (
        <Button variant='outline' size='sm' onClick={onAddToSemester}>
          <Plus className='mr-2 h-4 w-4' /> Add course to Semester {semester}
        </Button>
      )}
    </section>
  );
}
```

**Step 5: Verify + commit**

```bash
npm run typecheck && npm run lint
git add app/\(routes\)/bos/course-scheme/{page.tsx,_components}
git commit -m "feat(bos): add course scheme page with semester-grouped view"
```

---

### Task 19: AddMappingDialog — search course master, set group/order, POST

**Files:**
- Create: `app/(routes)/bos/course-scheme/_components/add-mapping-dialog.tsx`

```tsx
// app/(routes)/bos/course-scheme/_components/add-mapping-dialog.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useBosCourses } from '@/hooks/bos/use-bos-courses';
import { useAddMapping } from '@/hooks/bos/use-bos-course-scheme';
import { COURSE_GROUP_VALUES } from '@/lib/services/bos/courses-schemas';
import { toast } from 'sonner';
import type { SchemeFilterState } from './scheme-filters';

export function AddMappingDialog({
  semester, context, onClose,
}: { semester: string; context: SchemeFilterState; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState<string>('');
  const [group, setGroup] = useState<string>('General');
  const [order, setOrder] = useState<number>(1);

  const { data: coursesResp } = useBosCourses({
    institution_id: context.institution_id,
    regulation_code: context.regulation_code,
    search: search || undefined,
    is_active: 'true',
    limit: 50,
  });
  const courses = coursesResp?.data ?? [];

  const add = useAddMapping();

  const submit = async () => {
    if (!courseId) return toast.error('Pick a course');
    const picked = courses.find((c) => c.id === courseId)!;
    try {
      await add.mutateAsync({
        institutions_id: picked.institutions_id,
        program_code: context.program_code,
        course_id: picked.id,
        course_code: picked.course_code,
        institution_code: picked.institution_code,
        regulation_code: context.regulation_code,
        batch_code: context.batch_code ?? null,
        course_group: group,
        course_order: order,
        semester_code: semester,
        is_active: true,
      });
      toast.success(`Added ${picked.course_code} to Semester ${semester}`);
      onClose();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-w-xl'>
        <DialogHeader><DialogTitle>Add course to Semester {semester}</DialogTitle></DialogHeader>

        <div className='space-y-3'>
          <div>
            <Label className='text-xs'>Search course master</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder='Code or name…' />
          </div>

          <div>
            <Label className='text-xs'>Course</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger><SelectValue placeholder='Pick…' /></SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.course_code} — {c.course_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div>
              <Label className='text-xs'>Group</Label>
              <Select value={group} onValueChange={setGroup}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COURSE_GROUP_VALUES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className='text-xs'>Display order</Label>
              <Input type='number' min={1} value={order} onChange={(e) => setOrder(Number(e.target.value))} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={add.isPending || !courseId}>
            {add.isPending ? 'Adding…' : 'Add to scheme'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Verify + commit**

```bash
npm run typecheck && npm run lint
git add app/\(routes\)/bos/course-scheme/_components/add-mapping-dialog.tsx
git commit -m "feat(bos): add dialog for inserting courses into a semester"
```

---

### Task 20: Final breadcrumb wiring + manual end-to-end test

**Files:**
- Modify: [app/(routes)/bos/layout.tsx](../../app/(routes)/bos/layout.tsx) `resolveSubLeaf`

**Step 1: Add scheme-specific labels** to the breadcrumb resolver:

```typescript
  if (tabHref === '/bos/course-scheme') {
    if (tail === '' || tail === '/') return null;
    return 'Manage Scheme';
  }
```

**Step 2: Run full gate**

```bash
npm run typecheck
npm run lint
npm run gen:routes
npm run check:reachability
npm run check:menus
```

**Step 3: Manual end-to-end test**

```bash
npm run dev
```

Walk through:
1. ✅ Visit `/bos/courses` — pick board → see (empty) table
2. ✅ Click **Template** → file downloads → open it, dropdowns appear in cols C, D, E
3. ✅ Click **+ New Course** → fill form → save → appears in list
4. ✅ Edit a course → change credits → save → updated value shows
5. ✅ Click **Import** → upload filled template → see inserted/updated/errors table
6. ✅ Visit `/bos/course-scheme` → pick board, type program code (e.g. `UCS`) → semesters render with totals
7. ✅ Click **Edit Mode** → row delete buttons + "Add course" buttons appear
8. ✅ Click **Add course to Semester 1** → dialog → search → pick → save → row appears in semester
9. ✅ Click delete on a row → confirm → row disappears (soft-deleted via `is_active=false`)
10. ✅ As a non-edit user, **Edit Mode** button is hidden
11. ✅ **Lock state — Courses tab:** find a course where `course_status='Locked'` → row shows **Locked** badge → row-actions menu hides Edit + Delete (returns `null` if no other actions). Visiting `/bos/courses/{lockedId}/edit` directly shows the "This course is Locked" warning instead of the form.
12. ✅ **Lock state — Course Scheme tab:** find a mapping where `mapping_status='Locked'` → in Edit Mode the row appears greyed-out, the Part column shows a small 🔒 icon, the trash button is replaced with a tooltipped lock icon.
13. ✅ **Server defense:** even if you bypass the UI and POST `/api/bos/courses-master/{lockedId}` directly, the server returns `423 Locked`. Same for `/api/bos/course-mapping/{lockedId}`.

**Step 4: Final commit**

```bash
git add app/\(routes\)/bos/layout.tsx
git commit -m "feat(bos): finalize breadcrumb wiring for course-scheme"
```

---

## Done — summary of artifacts

```
TYPES & SCHEMAS
  types/bos-courses.ts
  lib/services/bos/courses-schemas.ts

SERVER
  lib/utils/bos/bos-access.ts
  lib/services/coe/coe-rest-client.ts                      [modified: +put +delete]
  app/api/bos/courses-master/route.ts
  app/api/bos/courses-master/[id]/route.ts
  app/api/bos/courses-master/import/route.ts
  app/api/bos/course-mapping/route.ts
  app/api/bos/course-mapping/[id]/route.ts

HOOKS
  hooks/bos/use-bos-courses.ts
  hooks/bos/use-bos-course-scheme.ts

UI — Courses tab
  app/(routes)/bos/courses/page.tsx
  app/(routes)/bos/courses/new/page.tsx
  app/(routes)/bos/courses/[id]/edit/page.tsx
  app/(routes)/bos/courses/_components/courses-page-client.tsx
  app/(routes)/bos/courses/_components/board-context-bar.tsx
  app/(routes)/bos/courses/_components/courses-filters.tsx
  app/(routes)/bos/courses/_components/courses-data-table.tsx
  app/(routes)/bos/courses/_components/courses-columns.tsx
  app/(routes)/bos/courses/_components/courses-row-actions.tsx
  app/(routes)/bos/courses/_components/course-form.tsx
  app/(routes)/bos/courses/_components/download-template.ts
  app/(routes)/bos/courses/_components/import-courses-dialog.tsx

UI — Course Scheme tab
  app/(routes)/bos/course-scheme/page.tsx
  app/(routes)/bos/course-scheme/_components/scheme-page-client.tsx
  app/(routes)/bos/course-scheme/_components/scheme-filters.tsx
  app/(routes)/bos/course-scheme/_components/semester-table.tsx
  app/(routes)/bos/course-scheme/_components/add-mapping-dialog.tsx

NAV / DB
  app/(routes)/bos/layout.tsx                              [modified: +2 tabs]
  lib/sidebarMenuLink.ts                                   [modified: +2 entries]
  lib/navigation/route-manifest.generated.ts               [regenerated]
  scripts/check-permissions-catalog.mjs                    [modified]
  supabase/migrations/20260508000000_bos_courses_scheme_permissions.sql

PRE-REQUISITE FROM COE TEAM
  - API key in Developer Portal with permissions:
      courses:read,create,update,delete
      course-mapping:read,create,update,delete
  - Confirm bulk-create wrapping for /api/v1/courses (courses:[] vs records:[])
```

**Commit count:** ~16 (one per task). Each task is independently revertable.

**Risks / open items** to flag during execution:
1. The sidebar / permission catalog file shape may differ from the snippets above — adapt to whatever lives in [lib/sidebarMenuLink.ts](../../lib/sidebarMenuLink.ts) and [scripts/check-permissions-catalog.mjs](../../scripts/check-permissions-catalog.mjs).
2. COE's `POST /api/v1/courses` bulk wrapping (`courses: []` vs `records: []`) needs confirmation — the spec only documents `mappings: []` for course-mapping. If wrong, Task 8 returns 400 — fix the wrapping shape and re-run.
3. The `useBosBoards` hook may not exist yet — if so, mirror the pattern from `use-bos-meetings`.
4. `supabase` migration table name (`permissions_catalog`) may differ — locate via `grep -rn "create table.*permission" supabase/`.
5. **Lock-state field name not in the schema dump** the user shared. The plan assumes `courses.course_status: string` (with `'Locked'` as the sentinel) and `course_mapping.mapping_status: string`. If the actual COE columns are named differently (e.g. `lock_status`, `is_locked`, or stored as a `boolean`), update three places: the type fields in `types/bos-courses.ts`, the `isLocked()` / `isMappingLocked()` helpers, and the server-side `assertNotLocked` / `assertMappingNotLocked` checks. Everything else (UI hiding, error toasts, HTTP 423) is field-name-agnostic.
6. **Excel import on locked codes:** the bulk import endpoint will hit `course_code_key UNIQUE` if it tries to insert a code matching a locked existing row. Decide: (a) reject the row with a clear error, or (b) treat as upsert which COE will then 423 on. Current plan goes with (b) — failed rows surface in the import errors table with "Course is locked".
