# HR Employee Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/hr/employees` into a read-only HR Employee Directory that lists all staff (currently 843) from the `staff` table, enriched with HR context where present, as a proper datatable with search/filters/export — fixing the `!inner` join that hides ~300 staff and finishing the stub detail page.

**Architecture:** Base every query on `staff` with a **LEFT** join to `hr_staff_details` (switched to INNER only when an HR-specific filter is active), server-side pagination, and the canonical `withAuth({ requirePermission: 'hr.employees.view' })` API gate. Reuse the existing seam (service → API → hook → page → detail) — no new tables, no migration.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict OFF), Supabase JS (RLS-scoped client via `withAuth`), TanStack Query v5, Shadcn UI, `ExportService` (xlsx).

## Global Constraints

- **No schema changes, no migration.** Permission keys `hr.employees.view` / `.export` already exist and are already granted to 63/75 roles — do **not** add a grant migration.
- **Strict mode is OFF; the build does not typecheck.** Verify every touched file with `mcp__ide__getDiagnostics` (seconds), never full `tsc`.
- **Supabase errors are plain objects** — surface with `getErrorMessage()` from `@/lib/utils`; `err instanceof Error` falls through.
- **`!inner` = INNER JOIN silently drops rows.** The whole point of this build is to use a LEFT join by default. Never reintroduce a default `!inner` on `hr_staff_details`.
- **Use `??` not `||`** for id/param fallbacks (`institutionId || ''` is a repo antipattern).
- **Read-only surface.** No create/edit/delete of staff from HR — that stays in `/staff/list`.
- **Branch:** all commits land on `feat/hr-employee-directory` (already created; spec already committed there). `main` is PR-protected — do not commit to it.
- **Verification reality:** there is no test runner. "Done" for a task = touched files pass `getDiagnostics` + the stated SQL/browser check observed.

---

### Task 1: Extend HR person types

**Files:**
- Modify: `types/hr.ts` (interface `HRPersonView` ~line 112-130; interface `HRPersonFilters` ~line 133-144)

**Interfaces:**
- Produces: `HRPersonView` with new fields `staff_code`, `department_name`, `institution_name`; `HRPersonFilters` with new fields `institution_id`, `exportAll`; new interface `HRPersonDetailView`.

- [ ] **Step 1: Add fields to `HRPersonView`**

In `types/hr.ts`, replace the `HRPersonView` interface body (currently ending at `staff_id?: string;`) with:

```ts
export interface HRPersonView {
  source: 'staff';
  // Stable id used for routing — always staff.id after consolidation
  id: string;
  hr_organization_id: string | null;
  organization_name: string | null;
  employment_type: HREmploymentType;
  employee_code: string | null;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  designation_name: string | null;
  cadre_name: string | null;
  department_id: string | null;
  department_name: string | null;
  institution_name: string | null;
  date_of_joining: string | null;
  is_active: boolean;
  staff_id?: string;
  // Human-facing staff code (staff.staff_id), distinct from the routing id.
  staff_code: string | null;
}
```

- [ ] **Step 2: Add `institution_id` + `exportAll` to `HRPersonFilters`**

Replace the `HRPersonFilters` interface with:

```ts
export interface HRPersonFilters {
  hr_organization_id?: string;
  employment_type?: HREmploymentType;
  cadre_id?: string;
  designation_id?: string;
  department_id?: string;
  institution_id?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
  // When true, the service returns ALL matching rows (no pagination) for export.
  exportAll?: boolean;
}
```

- [ ] **Step 3: Add `HRPersonDetailView`**

Immediately after the `HRPersonListResponse` interface, add:

```ts
// === Detail view for /hr/employees/[id] — names resolved, read-only ===
export interface HRPersonDetailView {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  staff_code: string | null;
  institution_name: string | null;
  department_name: string | null;
  date_of_joining: string | null;
  is_active: boolean;
  hr_employee_code: string | null;
  organization_name: string | null;
  designation_name: string | null;
  cadre_name: string | null;
  reports_to_name: string | null;
}
```

- [ ] **Step 4: Verify types compile**

Run `mcp__ide__getDiagnostics` on `types/hr.ts`.
Expected: no new errors in this file. (`HRPersonView.hr_organization_id` widening to `string | null` may surface errors in `employee-service.ts` — those are fixed in Task 2; do not "fix" them here.)

- [ ] **Step 5: Commit**

```bash
git add types/hr.ts
git commit -m "feat(hr): extend HR person types for all-staff directory + detail view"
```

---

### Task 2: Rewrite `HRPersonService.list` (staff-base LEFT join + server-side pagination)

**Files:**
- Modify: `lib/services/hr/employee-service.ts` (replace `list` method ~line 26-107; keep `getStaffDetails` / `getStaffMember`; add `getPersonDetail`)

**Interfaces:**
- Consumes: `HRPersonFilters` (Task 1), `HRPersonListResponse`, `HRPersonDetailView` (Task 1).
- Produces: `HRPersonService.list(supabase, filters) → HRPersonListResponse` returning ALL staff by default; `HRPersonService.getPersonDetail(supabase, id) → HRPersonDetailView | null`.

- [ ] **Step 1: Replace the `list` method**

In `lib/services/hr/employee-service.ts`, replace the entire `static async list(...)` method with:

```ts
  static async list(
    supabase: SupabaseClient,
    filters: HRPersonFilters = {}
  ): Promise<HRPersonListResponse> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const {
      search, hr_organization_id, cadre_id, designation_id,
      department_id, institution_id, is_active,
    } = filters;

    // HR-specific filters require an hr_staff_details row to exist, so the embed
    // becomes an INNER join only when one is active. Default is a LEFT join so
    // ALL staff appear — including the ~300 with no hr_staff_details row.
    const hrFilterActive = Boolean(hr_organization_id || cadre_id || designation_id);
    const detailsJoin = hrFilterActive
      ? 'hr_staff_details!hr_staff_details_staff_id_fkey!inner'
      : 'hr_staff_details!hr_staff_details_staff_id_fkey';

    let q = supabase
      .from('staff')
      .select(
        `
          id, first_name, last_name, email, phone, staff_id, department_id,
          date_of_joining, is_active, institution_id,
          institution:institutions ( id, name ),
          department:departments ( id, department_name ),
          ${detailsJoin} (
            staff_id, hr_organization_id, designation_id, cadre_id, hr_employee_code,
            organization:hr_organization_id ( id, name ),
            designation:designation_id ( id, name ),
            cadre:cadre_id ( id, name )
          )
        `,
        { count: 'exact' }
      );

    if (institution_id) q = q.eq('institution_id', institution_id);
    if (department_id) q = q.eq('department_id', department_id);
    if (is_active !== undefined) q = q.eq('is_active', is_active);
    if (hr_organization_id) q = q.eq('hr_staff_details.hr_organization_id', hr_organization_id);
    if (cadre_id) q = q.eq('hr_staff_details.cadre_id', cadre_id);
    if (designation_id) q = q.eq('hr_staff_details.designation_id', designation_id);
    if (search) {
      const s = `%${search}%`;
      q = q.or(`first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},staff_id.ilike.${s}`);
    }

    q = q.order('first_name', { ascending: true });

    // Export mode returns every matching row (no pagination window).
    if (!filters.exportAll) {
      q = q.range(from, to);
    }

    const { data, error, count } = await q;
    if (error) throw error;

    const people: HRPersonView[] = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
      const rawDetails = row.hr_staff_details;
      const details = (Array.isArray(rawDetails) ? rawDetails[0] : rawDetails) as Record<string, unknown> | undefined;
      const institution = row.institution as { name?: string } | undefined;
      const department = row.department as { department_name?: string } | undefined;
      return {
        source: 'staff',
        id: row.id as string,
        staff_id: row.id as string,
        staff_code: (row.staff_id as string | null) ?? null,
        hr_organization_id: (details?.hr_organization_id as string | null) ?? null,
        organization_name: (details?.organization as { name?: string } | undefined)?.name ?? null,
        employment_type: 'full_time',
        employee_code: (details?.hr_employee_code as string | null) ?? (row.staff_id as string | null) ?? null,
        first_name: row.first_name as string,
        last_name: (row.last_name as string | null) ?? null,
        email: (row.email as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        designation_name: (details?.designation as { name?: string } | undefined)?.name ?? null,
        cadre_name: (details?.cadre as { name?: string } | undefined)?.name ?? null,
        department_id: (row.department_id as string | null) ?? null,
        department_name: department?.department_name ?? null,
        institution_name: institution?.name ?? null,
        date_of_joining: (row.date_of_joining as string | null) ?? null,
        is_active: (row.is_active as boolean | null) ?? true,
      };
    });

    const total = filters.exportAll ? people.length : (count ?? 0);

    return {
      data: people,
      metadata: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / (pageSize || 1))),
      },
    };
  }
```

- [ ] **Step 2: Add `getPersonDetail` method**

Immediately after `getStaffMember` (before the `HREmployeeService` re-export at the bottom), add:

```ts
  /**
   * Enriched, name-resolved detail for one staff member (read-only HR view).
   * Returns null when the staff row is not visible under RLS.
   */
  static async getPersonDetail(
    supabase: SupabaseClient,
    id: string
  ): Promise<import('@/types/hr').HRPersonDetailView | null> {
    const { data, error } = await supabase
      .from('staff')
      .select(`
        id, first_name, last_name, email, phone, staff_id, institution_id, department_id,
        date_of_joining, is_active,
        institution:institutions ( id, name ),
        department:departments ( id, department_name ),
        hr_staff_details!hr_staff_details_staff_id_fkey (
          hr_organization_id, designation_id, cadre_id, reports_to_staff_id, hr_employee_code,
          organization:hr_organization_id ( id, name ),
          designation:designation_id ( id, name ),
          cadre:cadre_id ( id, name )
        )
      `)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const row = data as Record<string, unknown>;
    const rawDetails = row.hr_staff_details;
    const d = (Array.isArray(rawDetails) ? rawDetails[0] : rawDetails) as Record<string, unknown> | undefined;

    // reports_to resolved with a separate query to avoid FK-embed ambiguity
    // (reports_to_staff_id also targets staff, which PostgREST can't
    // disambiguate against the base table without a named hint).
    let reports_to_name: string | null = null;
    const reportsToId = d?.reports_to_staff_id as string | null | undefined;
    if (reportsToId) {
      const { data: mgr } = await supabase
        .from('staff')
        .select('first_name, last_name')
        .eq('id', reportsToId)
        .maybeSingle();
      if (mgr) {
        reports_to_name = `${(mgr as any).first_name} ${(mgr as any).last_name ?? ''}`.trim();
      }
    }

    return {
      id: row.id as string,
      first_name: row.first_name as string,
      last_name: (row.last_name as string | null) ?? null,
      email: (row.email as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      staff_code: (row.staff_id as string | null) ?? null,
      institution_name: (row.institution as { name?: string } | undefined)?.name ?? null,
      department_name: (row.department as { department_name?: string } | undefined)?.department_name ?? null,
      date_of_joining: (row.date_of_joining as string | null) ?? null,
      is_active: (row.is_active as boolean | null) ?? true,
      hr_employee_code: (d?.hr_employee_code as string | null) ?? null,
      organization_name: (d?.organization as { name?: string } | undefined)?.name ?? null,
      designation_name: (d?.designation as { name?: string } | undefined)?.name ?? null,
      cadre_name: (d?.cadre as { name?: string } | undefined)?.name ?? null,
      reports_to_name,
    };
  }
```

- [ ] **Step 3: Verify service compiles**

Run `mcp__ide__getDiagnostics` on `lib/services/hr/employee-service.ts`.
Expected: no errors.

- [ ] **Step 4: Verify the LEFT join returns all staff (SQL proxy for the new query)**

Run via Supabase MCP `execute_sql`:

```sql
-- Mirrors the default (no-filter) list query: staff LEFT JOIN hr_staff_details.
select count(*) as rows_returned
from staff s
left join hr_staff_details d on d.staff_id = s.id;
```

Expected: `rows_returned = 843` (not 543). This confirms the LEFT join no longer drops the ~300 detail-less staff.

- [ ] **Step 5: Commit**

```bash
git add lib/services/hr/employee-service.ts
git commit -m "feat(hr): staff-base LEFT join + server-side pagination + getPersonDetail"
```

---

### Task 3: Migrate both API routes to `withAuth` (+ export gate)

**Files:**
- Modify (replace whole file): `app/api/hr/employees/route.ts`
- Modify (replace whole file): `app/api/hr/employees/[id]/route.ts`

**Interfaces:**
- Consumes: `HRPersonService.list` / `getPersonDetail` (Task 2), `withAuth` / `AuthContext` from `@/lib/auth/with-auth`.
- Produces: `GET /api/hr/employees` (gated `hr.employees.view`; `?export=1` additionally requires `hr.employees.export`); `GET /api/hr/employees/[id]` (gated `hr.employees.view`, returns `{ data: HRPersonDetailView }`).

- [ ] **Step 1: Replace `app/api/hr/employees/route.ts`**

```ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/auth/with-auth';
import { HRPersonService } from '@/lib/services/hr/employee-service';
import type { HRPersonFilters } from '@/types/hr';

export const GET = withAuth(
  async (request: NextRequest, auth: AuthContext) => {
    const url = new URL(request.url);
    const exportAll = url.searchParams.get('export') === '1';

    // Export additionally requires hr.employees.export (view alone isn't enough).
    if (exportAll) {
      const [{ data: isSA }, { data: isAdmin }, { data: canExport }] = await Promise.all([
        auth.supabase.rpc('is_super_admin'),
        auth.supabase.rpc('is_admin'),
        auth.supabase.rpc('user_has_permission', { permission_name: 'hr.employees.export' }),
      ]);
      if (!isSA && !isAdmin && !canExport) {
        return NextResponse.json(
          { error: 'Insufficient permission. Required: hr.employees.export' },
          { status: 403 }
        );
      }
    }

    const filters: HRPersonFilters = {
      hr_organization_id: url.searchParams.get('hr_organization_id') ?? undefined,
      cadre_id: url.searchParams.get('cadre_id') ?? undefined,
      designation_id: url.searchParams.get('designation_id') ?? undefined,
      department_id: url.searchParams.get('department_id') ?? undefined,
      institution_id: url.searchParams.get('institution_id') ?? undefined,
      is_active:
        url.searchParams.get('is_active') === 'false' ? false :
        url.searchParams.get('is_active') === 'true' ? true : undefined,
      search: url.searchParams.get('search') ?? undefined,
      page: url.searchParams.get('page') ? parseInt(url.searchParams.get('page')!, 10) : 1,
      pageSize: url.searchParams.get('pageSize') ? parseInt(url.searchParams.get('pageSize')!, 10) : 25,
      exportAll,
    };

    const result = await HRPersonService.list(auth.supabase, filters);
    return NextResponse.json(result);
  },
  { allowApiKey: false, requiredPermission: 'read', requirePermission: 'hr.employees.view' }
);

// POST removed — hr_employees table no longer exists. Employee creation goes
// through the staff module.
```

- [ ] **Step 2: Replace `app/api/hr/employees/[id]/route.ts`**

```ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/auth/with-auth';
import { HRPersonService } from '@/lib/services/hr/employee-service';

export const GET = withAuth(
  async (
    _request: NextRequest,
    auth: AuthContext,
    context?: { params?: Promise<Record<string, string>> }
  ) => {
    const params = context?.params ? await context.params : {};
    const id = params.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const person = await HRPersonService.getPersonDetail(auth.supabase, id);
    if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: person });
  },
  { allowApiKey: false, requiredPermission: 'read', requirePermission: 'hr.employees.view' }
);

// DELETE removed — staff deactivation goes through the staff module.
```

- [ ] **Step 3: Verify both routes compile**

Run `mcp__ide__getDiagnostics` on both `app/api/hr/employees/route.ts` and `app/api/hr/employees/[id]/route.ts`.
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/hr/employees/route.ts app/api/hr/employees/[id]/route.ts
git commit -m "feat(hr): gate employees API with withAuth + hr.employees.view/export"
```

---

### Task 4: Update hook — filters passthrough, export fetch, typed detail

**Files:**
- Modify: `hooks/hr/use-employees.ts`

**Interfaces:**
- Consumes: `HRPersonFilters`, `HRPersonListResponse`, `HRPersonView`, `HRPersonDetailView` (Task 1).
- Produces: `useHREmployees(filters)`; `useHREmployee(id) → HRPersonDetailView`; `fetchHREmployeesForExport(filters) → HRPersonView[]`.

- [ ] **Step 1: Replace the imports + list/detail hooks**

Replace the top of `hooks/hr/use-employees.ts` (the import line and `useHREmployees` + `useHREmployee`) with:

```ts
'use client';

/**
 * React Query hooks for the HR Employee Directory (all backed by the staff table).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  HRPersonFilters,
  HRPersonListResponse,
  HRPersonView,
  HRPersonDetailView,
} from '@/types/hr';

const BASE = '/api/hr/employees';

function buildQueryString(filters: HRPersonFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      params.set(k, String(v));
    }
  });
  return params.toString();
}

export function useHREmployees(filters: HRPersonFilters = {}, enabled = true) {
  return useQuery({
    queryKey: ['hr-people', filters],
    queryFn: async (): Promise<HRPersonListResponse> => {
      const qs = buildQueryString(filters);
      const res = await fetch(`${BASE}${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error(`HR people list failed: ${res.status}`);
      return res.json();
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useHREmployee(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['hr-person', 'staff', id],
    queryFn: async (): Promise<HRPersonDetailView> => {
      const res = await fetch(`${BASE}/${id}`);
      if (!res.ok) throw new Error(`HR person get failed: ${res.status}`);
      const json = await res.json();
      return json.data as HRPersonDetailView;
    },
    enabled: enabled && !!id,
  });
}

/**
 * Fetch ALL rows matching the current filters (no pagination) for export.
 * Requires the caller's role to hold hr.employees.export (enforced server-side).
 */
export async function fetchHREmployeesForExport(
  filters: HRPersonFilters
): Promise<HRPersonView[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && k !== 'page' && k !== 'pageSize') {
      params.set(k, String(v));
    }
  });
  params.set('export', '1');
  const res = await fetch(`${BASE}?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HR employees export failed: ${res.status}`);
  }
  const json = (await res.json()) as HRPersonListResponse;
  return json.data;
}
```

Keep the existing `useCreateHREmployee` and `useDeactivateHREmployee` exports below unchanged.

- [ ] **Step 2: Verify hook compiles**

Run `mcp__ide__getDiagnostics` on `hooks/hr/use-employees.ts`.
Expected: no errors. (Note: `useHREmployee` dropped its second `_source` arg — the detail page in Task 8 calls it with one arg, so they stay consistent.)

- [ ] **Step 3: Commit**

```bash
git add hooks/hr/use-employees.ts
git commit -m "feat(hr): employees hook — typed detail + export fetch helper"
```

---

### Task 5: Build the presentational components (filter bar + table)

**Files:**
- Create: `app/(routes)/hr/employees/_components/hr-employees-filters.tsx`
- Create: `app/(routes)/hr/employees/_components/hr-employees-table.tsx`

**Interfaces:**
- Consumes: `HRPersonView` (Task 1); `OrganizationService.getInstitutionNames`, `DepartmentService.getDepartmentsByInstitution` (existing services).
- Produces: `<HREmployeesFilters value onChange />`, `<HREmployeesTable rows />`, and the exported `HREmployeeFilterState` type used by the page (Task 6).

- [ ] **Step 1: Create the filter bar**

`app/(routes)/hr/employees/_components/hr-employees-filters.tsx`:

```tsx
'use client';

import { useEffect, useState, memo } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';

export interface HREmployeeFilterState {
  search: string;
  institution_id?: string;
  department_id?: string;
  is_active?: boolean;
}

interface Props {
  value: HREmployeeFilterState;
  onChange: (patch: Partial<HREmployeeFilterState>) => void;
}

const HREmployeesFiltersComponent = ({ value, onChange }: Props) => {
  const [institutions, setInstitutions] = useState<Array<{ id: string; name: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; department_name: string }>>([]);

  useEffect(() => {
    OrganizationService.getInstitutionNames(true, undefined, 'all')
      .then(setInstitutions)
      .catch((e) => console.error('[hr-employees-filters] institutions load failed', e));
  }, []);

  useEffect(() => {
    if (value.institution_id) {
      DepartmentService.getDepartmentsByInstitution(value.institution_id)
        .then(setDepartments)
        .catch((e) => console.error('[hr-employees-filters] departments load failed', e));
    } else {
      setDepartments([]);
    }
  }, [value.institution_id]);

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Input
        placeholder="Search name / code / email"
        value={value.search}
        onChange={(e) => onChange({ search: e.target.value })}
      />

      <Select
        value={value.institution_id ?? 'all'}
        onValueChange={(v) =>
          onChange({ institution_id: v === 'all' ? undefined : v, department_id: undefined })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="Institution" />
        </SelectTrigger>
        <SelectContent className="max-h-60 overflow-y-auto">
          <SelectItem value="all">All Institutions</SelectItem>
          {institutions.map((inst) => (
            <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.department_id ?? 'all'}
        onValueChange={(v) => onChange({ department_id: v === 'all' ? undefined : v })}
        disabled={!value.institution_id}
      >
        <SelectTrigger>
          <SelectValue placeholder="Department" />
        </SelectTrigger>
        <SelectContent className="max-h-60 overflow-y-auto">
          <SelectItem value="all">All Departments</SelectItem>
          {departments.map((dept) => (
            <SelectItem key={dept.id} value={dept.id}>{dept.department_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.is_active === true ? 'active' : value.is_active === false ? 'inactive' : 'all'}
        onValueChange={(v) =>
          onChange({ is_active: v === 'active' ? true : v === 'inactive' ? false : undefined })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export const HREmployeesFilters = memo(HREmployeesFiltersComponent);
```

- [ ] **Step 2: Create the table**

`app/(routes)/hr/employees/_components/hr-employees-table.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { HRPersonView } from '@/types/hr';

interface Props {
  rows: HRPersonView[];
}

export function HREmployeesTable({ rows }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr className="text-left text-muted-foreground">
            <th className="py-2 pr-3">Code</th>
            <th className="py-2 pr-3">Name</th>
            <th className="py-2 pr-3">Email</th>
            <th className="py-2 pr-3">Phone</th>
            <th className="py-2 pr-3">Designation</th>
            <th className="py-2 pr-3">Cadre</th>
            <th className="py-2 pr-3">Organization</th>
            <th className="py-2 pr-3">Institution</th>
            <th className="py-2 pr-3">Department</th>
            <th className="py-2 pr-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((emp) => (
            <tr key={emp.id} className="border-b hover:bg-muted/40">
              <td className="py-2 pr-3 font-mono text-xs">
                <Link href={`/hr/employees/${emp.id}`} className="underline-offset-2 hover:underline">
                  {emp.employee_code ?? '—'}
                </Link>
              </td>
              <td className="py-2 pr-3">
                <Link href={`/hr/employees/${emp.id}`} className="hover:underline">
                  {emp.first_name} {emp.last_name ?? ''}
                </Link>
              </td>
              <td className="py-2 pr-3">{emp.email ?? '—'}</td>
              <td className="py-2 pr-3">{emp.phone ?? '—'}</td>
              <td className="py-2 pr-3">{emp.designation_name ?? '—'}</td>
              <td className="py-2 pr-3">{emp.cadre_name ?? '—'}</td>
              <td className="py-2 pr-3">{emp.organization_name ?? '—'}</td>
              <td className="py-2 pr-3">{emp.institution_name ?? '—'}</td>
              <td className="py-2 pr-3">{emp.department_name ?? '—'}</td>
              <td className="py-2 pr-3">
                {emp.is_active ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Active</Badge>
                ) : (
                  <Badge variant="outline" className="bg-gray-50 text-gray-600">Inactive</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Verify components compile**

Run `mcp__ide__getDiagnostics` on both new files.
Expected: no errors. (If `OrganizationService.getInstitutionNames` / `DepartmentService.getDepartmentsByInstitution` signatures differ, match the exact usage in `app/(routes)/staff/list/_components/staff-filters.tsx` — they are copied from there.)

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/hr/employees/_components/hr-employees-filters.tsx" "app/(routes)/hr/employees/_components/hr-employees-table.tsx"
git commit -m "feat(hr): employee directory filter bar + table components"
```

---

### Task 6: Rewrite the list page (gate + filters + table + export)

**Files:**
- Modify (replace whole file): `app/(routes)/hr/employees/page.tsx`

**Interfaces:**
- Consumes: `useHREmployees`, `fetchHREmployeesForExport` (Task 4); `HREmployeesFilters`, `HREmployeeFilterState`, `HREmployeesTable` (Task 5); `usePermissions` (existing); `ExportService` (existing).

- [ ] **Step 1: Replace `app/(routes)/hr/employees/page.tsx`**

```tsx
'use client';

/**
 * HR Employee Directory — read-only view of ALL staff (staff table), enriched
 * with HR context where present. Fixes the prior !inner join that hid staff
 * without an hr_staff_details row. Gated by hr.employees.view.
 */

import Link from 'next/link';
import { useState, useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BeatLoader } from 'react-spinners';
import { UsersRound, AlertCircle, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useHREmployees, fetchHREmployeesForExport } from '@/hooks/hr/use-employees';
import { ExportService } from '@/lib/services/export-service';
import { getErrorMessage } from '@/lib/utils';
import {
  HREmployeesFilters,
  type HREmployeeFilterState,
} from './_components/hr-employees-filters';
import { HREmployeesTable } from './_components/hr-employees-table';
import type { HRPersonView } from '@/types/hr';

const PAGE_SIZE = 25;

const EXPORT_HEADERS: Record<string, string> = {
  employee_code: 'Employee Code',
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  phone: 'Phone',
  designation_name: 'Designation',
  cadre_name: 'Cadre',
  organization_name: 'Organization',
  institution_name: 'Institution',
  department_name: 'Department',
  is_active: 'Active',
};

export default function HREmployeeDirectoryPage() {
  const { isLoading: permsLoading, isSuperAdmin, canAccess } = usePermissions();
  const [filterState, setFilterState] = useState<HREmployeeFilterState>({ search: '', is_active: true });
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const canView = isSuperAdmin || canAccess('hr.employees', 'view');
  const canExport = isSuperAdmin || canAccess('hr.employees', 'export');

  const apiFilters = {
    search: filterState.search || undefined,
    institution_id: filterState.institution_id,
    department_id: filterState.department_id,
    is_active: filterState.is_active,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading, error } = useHREmployees(apiFilters, !permsLoading && canView);

  const handleFilterChange = useCallback((patch: Partial<HREmployeeFilterState>) => {
    setFilterState((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const rows: HRPersonView[] = await fetchHREmployeesForExport({
        search: filterState.search || undefined,
        institution_id: filterState.institution_id,
        department_id: filterState.department_id,
        is_active: filterState.is_active,
      });
      const flat = rows.map((r) => ({
        employee_code: r.employee_code ?? '',
        first_name: r.first_name,
        last_name: r.last_name ?? '',
        email: r.email ?? '',
        phone: r.phone ?? '',
        designation_name: r.designation_name ?? '',
        cadre_name: r.cadre_name ?? '',
        organization_name: r.organization_name ?? '',
        institution_name: r.institution_name ?? '',
        department_name: r.department_name ?? '',
        is_active: r.is_active ? 'Yes' : 'No',
      }));
      ExportService.exportToExcel(flat, EXPORT_HEADERS as any, 'hr-employees', 'Employees');
      toast.success(`Exported ${flat.length} employees`);
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [filterState]);

  if (permsLoading) {
    return (
      <ContentLayout title="HR — Employees">
        <div className="flex justify-center py-16"><BeatLoader color="#3b82f6" /></div>
      </ContentLayout>
    );
  }

  if (!canView) {
    return (
      <ContentLayout title="HR — Employees">
        <Alert variant="destructive" className="mt-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You don&apos;t have permission to view the employee directory.</AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="HR — Employees">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Employees</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <UsersRound className="h-6 w-6" />
              Employee Directory
            </h1>
            <p className="text-sm text-muted-foreground">
              All staff across the HR module
              {data ? ` — ${data.metadata.total} total` : ' — loading...'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canExport && (
              <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
                <Download className="mr-2 h-4 w-4" />
                {exporting ? 'Exporting…' : 'Export'}
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/staff/list">Full Staff Management</Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <HREmployeesFilters value={filterState} onChange={handleFilterChange} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Employees</CardTitle></CardHeader>
          <CardContent>
            {isLoading && <div className="flex justify-center py-8"><BeatLoader color="#3b82f6" /></div>}
            {error && (
              <div className="flex items-center gap-2 text-red-600 py-4">
                <AlertCircle className="h-4 w-4" />
                <span>Failed to load: {getErrorMessage(error)}</span>
              </div>
            )}
            {data && data.data.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <UsersRound className="h-10 w-10 mx-auto opacity-40 mb-3" />
                <p className="font-medium">No employees match these filters.</p>
              </div>
            )}
            {data && data.data.length > 0 && <HREmployeesTable rows={data.data} />}

            {data && data.metadata.totalPages > 1 && (
              <div className="flex justify-between items-center pt-4">
                <span className="text-xs text-muted-foreground">
                  Page {data.metadata.page} of {data.metadata.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= data.metadata.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
```

- [ ] **Step 2: Verify page compiles**

Run `mcp__ide__getDiagnostics` on `app/(routes)/hr/employees/page.tsx`.
Expected: no errors. If `getErrorMessage` is not exported from `@/lib/utils`, confirm its export path (`grep "export function getErrorMessage" lib/utils*`) and adjust the import.

- [ ] **Step 3: Browser check**

Start dev server (`npm run dev`), log in as **super admin**, open `/hr/employees`.
Expected: header shows **"— 843 total"** (or 740 with the default Active filter), the table renders with all 10 columns, institution/department/status filters narrow results, and **Export** downloads an `.xlsx`. Then repeat as a **non-super HR role** that holds `hr.employees.view`: directory renders (RLS may scope rows); a role without the key sees **Access Denied**.

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/hr/employees/page.tsx"
git commit -m "feat(hr): employee directory page — all staff, filters, export, gate"
```

---

### Task 7: Rewrite the detail page (resolved names + cross-links)

**Files:**
- Modify (replace whole file): `app/(routes)/hr/employees/[id]/page.tsx`

**Interfaces:**
- Consumes: `useHREmployee` (Task 4, returns `HRPersonDetailView`).

- [ ] **Step 1: Replace `app/(routes)/hr/employees/[id]/page.tsx`**

```tsx
'use client';

/**
 * HR Employee Detail — read-only, name-resolved view of one staff member from
 * the HR perspective, with cross-links into the staff record and HR modules.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BeatLoader } from 'react-spinners';
import { AlertCircle } from 'lucide-react';
import { useHREmployee } from '@/hooks/hr/use-employees';
import { getErrorMessage } from '@/lib/utils';

export default function HREmployeeDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : undefined;
  const { data, isLoading, error } = useHREmployee(id);

  return (
    <ContentLayout title="HR — Employee Detail">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr/employees">Employees</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Detail</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 max-w-3xl space-y-4">
        {isLoading && <div className="flex justify-center py-8"><BeatLoader color="#3b82f6" /></div>}
        {error && (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load: {getErrorMessage(error)}</span>
          </div>
        )}
        {data && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{data.first_name} {data.last_name ?? ''}</span>
                  <Badge variant="outline">{data.hr_employee_code ?? data.staff_code ?? 'Staff'}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <dt className="text-muted-foreground">Staff Code</dt>
                  <dd className="font-mono">{data.staff_code ?? '—'}</dd>
                  <dt className="text-muted-foreground">HR Employee Code</dt>
                  <dd className="font-mono">{data.hr_employee_code ?? '—'}</dd>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd>{data.email ?? '—'}</dd>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{data.phone ?? '—'}</dd>
                  <dt className="text-muted-foreground">Institution</dt>
                  <dd>{data.institution_name ?? '—'}</dd>
                  <dt className="text-muted-foreground">Department</dt>
                  <dd>{data.department_name ?? '—'}</dd>
                  <dt className="text-muted-foreground">Organization</dt>
                  <dd>{data.organization_name ?? '—'}</dd>
                  <dt className="text-muted-foreground">Designation</dt>
                  <dd>{data.designation_name ?? '—'}</dd>
                  <dt className="text-muted-foreground">Cadre</dt>
                  <dd>{data.cadre_name ?? '—'}</dd>
                  <dt className="text-muted-foreground">Reports To</dt>
                  <dd>{data.reports_to_name ?? '—'}</dd>
                  <dt className="text-muted-foreground">Date of Joining</dt>
                  <dd>{data.date_of_joining ?? '—'}</dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    {data.is_active
                      ? <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Active</Badge>
                      : <Badge variant="outline" className="bg-gray-50 text-gray-600">Inactive</Badge>}
                  </dd>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Related</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/staff/list/${data.id}`}>Full staff record</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/hr/leave">Leave workflow</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/hr/documents/verify">Documents</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/hr/admin/payroll/periods">Payroll</Link>
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
```

- [ ] **Step 2: Verify detail page compiles**

Run `mcp__ide__getDiagnostics` on `app/(routes)/hr/employees/[id]/page.tsx`.
Expected: no errors.

- [ ] **Step 3: Browser check**

Open `/hr/employees`, click any employee. Expected: detail shows **resolved names** (not UUIDs), and the Related card links resolve. Confirm with a detail-less staff member (one of the ~300): HR-context fields show "—" but core fields (name/email/institution) render.

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/hr/employees/[id]/page.tsx"
git commit -m "feat(hr): employee detail page — resolved names + cross-links"
```

---

### Task 8: Fix labels + reachability gate

**Files:**
- Modify: `lib/sidebarMenuLink.ts:1988` (`label: 'Non-Staff Workforce'`)
- Modify: `app/(routes)/staff/list/page.tsx:238` (cross-link description)

**Interfaces:** none (copy/nav only).

- [ ] **Step 1: Relabel the sidebar entry**

In `lib/sidebarMenuLink.ts` (~line 1988), change:

```ts
            { href: '/hr/employees', label: 'Non-Staff Workforce', active: pathname.startsWith('/hr/employees') },
```

to:

```ts
            { href: '/hr/employees', label: 'Employees', active: pathname.startsWith('/hr/employees') },
```

- [ ] **Step 2: Fix the staff-list cross-link description**

In `app/(routes)/staff/list/page.tsx` (~line 235-239), replace the paragraph:

```tsx
                  <p className='text-muted-foreground'>
                    Full-time JKKN staff — teaching, facilitators, and
                    non-teaching. Guests, vendors, TAs, and volunteers live
                    in the <Link href='/hr/employees' className='underline'>HR Non-Staff Workforce</Link> page.
                  </p>
```

with:

```tsx
                  <p className='text-muted-foreground'>
                    Full-time JKKN staff — teaching, facilitators, and
                    non-teaching. The HR module&apos;s read-only{' '}
                    <Link href='/hr/employees' className='underline'>Employee Directory</Link>{' '}
                    shows all staff with HR context.
                  </p>
```

- [ ] **Step 3: Verify + run the sidebar gate**

Run `mcp__ide__getDiagnostics` on both files (expect no errors), then:

```bash
npm run check:sidebar
```

Expected: passes. (No routes were added or removed — only a label changed — so reachability/audit-coverage gates are unaffected.)

- [ ] **Step 4: Commit**

```bash
git add lib/sidebarMenuLink.ts "app/(routes)/staff/list/page.tsx"
git commit -m "fix(hr): relabel workforce -> Employees; correct staff-list cross-link copy"
```

---

## Self-Review

**1. Spec coverage** (each spec section → task):
- §4.1 data path (staff base, LEFT/conditional-inner, server-side pagination, extra joins) → **Task 2**.
- §4.2 API (withAuth `hr.employees.view`, `institution_id`, `?export=1` + `hr.employees.export`) → **Task 3**.
- §4.3 types + hook (`institution_name`/`department_name`/`staff_code`, `institution_id`; export helper) → **Tasks 1, 4**.
- §4.4 page UI (datatable, 10 columns, filters, export, page-level gate, relabel) → **Tasks 5, 6, 8**.
- §4.5 detail page (resolved names, cross-links) → **Task 7**.
- §4.6 permissions (reuse keys; grants verified as already present — no migration) → **Global Constraints + Task 3**.
- §6 verification (843/740, `check:sidebar`, browser as super + non-super) → per-task Steps + **Task 6/8**.
- §7 non-goals (onboarding handoff, staff CRUD, full 360) → excluded from all tasks. ✅ No gaps.

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N" — every code step contains full code. ✅

**3. Type consistency:** `HRPersonView` fields (`staff_code`, `department_name`, `institution_name`, `hr_organization_id: string | null`) defined in Task 1, produced in Task 2, consumed in Tasks 5/6. `HRPersonDetailView` defined Task 1, produced Task 2, returned by `useHREmployee` Task 4, consumed Task 7. `fetchHREmployeesForExport` defined Task 4, consumed Task 6. `HREmployeeFilterState` defined Task 5, consumed Task 6. `useHREmployee(id)` single-arg — page (Task 7) matches. ✅

## Open decisions resolved during planning
1. **Table component:** purpose-built (`HREmployeesTable`), not the generic `components/data-table` — avoids its permission-module coupling for a simple read-only surface (§4.4 fallback taken).
2. **Detail cross-links:** shipped now, but pointed at **real existing routes** (`/staff/list/[id]`, `/hr/leave`, `/hr/documents/verify`, `/hr/admin/payroll/periods`) rather than fabricated `?staff=` deep-filter params that those pages don't support.
3. **Grant migration:** **not needed** — 63/75 roles already carry `hr.employees.view` + `.export`.
