# Class Incharges Module — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Class Incharges sub-module under Facilitators Management that lets admins assign multiple staff as class incharges to any section, navigated through the institution → degree → department → program → semester → section hierarchy.

**Architecture:** Single-page list of sections (filtered by cascading hierarchy dropdowns) with per-row assign/manage dialogs. Staff data sourced from the existing `staff` table. New `class_incharges` table stores assignments. Module lives at `/staff/class-incharges/`.

**Tech Stack:** Next.js 15 App Router, Supabase (RLS), TanStack React Query, shadcn/ui, TypeScript, Zod, Lucide icons.

**Design doc:** `docs/plans/2026-03-08-class-incharges-design.md`

---

## Task 1: Add `class_incharges` table to `supabase/setup/01_tables.sql`

**Files:**
- Modify: `supabase/setup/01_tables.sql` — insert after line 656 (end of `staff_plan_courses` table, before `SECTION 6: ATTENDANCE MANAGEMENT`)

**Step 1: Add the table definition**

Open `supabase/setup/01_tables.sql`. Find the comment `-- =====================================================` that precedes `SECTION 6: ATTENDANCE MANAGEMENT` (around line 658). Insert the following BEFORE that comment:

```sql
-- Class Incharges
-- Added: 2026-03-08 - Assigns one or more staff as class incharges per section
CREATE TABLE IF NOT EXISTS public.class_incharges (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID        NOT NULL REFERENCES public.institutions(id),
    section_id     UUID        NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
    staff_id       UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    is_active      BOOLEAN     NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     UUID        REFERENCES public.profiles(id),
    updated_by     UUID        REFERENCES public.profiles(id),
    CONSTRAINT class_incharges_unique_assignment UNIQUE (section_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_class_incharges_institution_id ON public.class_incharges(institution_id);
CREATE INDEX IF NOT EXISTS idx_class_incharges_section_id     ON public.class_incharges(section_id);
CREATE INDEX IF NOT EXISTS idx_class_incharges_staff_id       ON public.class_incharges(staff_id);

ALTER TABLE public.class_incharges ENABLE ROW LEVEL SECURITY;

```

**Step 2: Commit**

```bash
git add supabase/setup/01_tables.sql
git commit -m "feat(db): add class_incharges table with indexes and RLS enabled"
```

---

## Task 2: Add RLS policies to `supabase/setup/03_policies.sql`

**Files:**
- Modify: `supabase/setup/03_policies.sql` — append after the last `staff_plan_courses` policy block (around line 969)

**Step 1: Append the 4 RLS policies**

Find the end of the `staff_plan_courses` policy block in `03_policies.sql`. Append after it:

```sql
-- =============================================
-- CLASS_INCHARGES TABLE POLICIES
-- Added: 2026-03-08 - Class incharge assignments
-- =============================================

-- SELECT: Super admins see all; others see records from their institutions
CREATE POLICY "class_incharges_select_by_institution" ON public.class_incharges
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND is_super_admin = true
        )
        OR
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
            AND is_active = true
        )
    );

-- INSERT: Super admins or users with admin/write/full access
CREATE POLICY "class_incharges_insert_by_access_type" ON public.class_incharges
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND is_super_admin = true
        )
        OR
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'full')
            AND is_active = true
        )
    );

-- UPDATE: Super admins or users with admin/write/full access
CREATE POLICY "class_incharges_update_by_access_type" ON public.class_incharges
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND is_super_admin = true
        )
        OR
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'full')
            AND is_active = true
        )
    );

-- DELETE: Super admins or users with admin/full access only
CREATE POLICY "class_incharges_delete_by_admin_access" ON public.class_incharges
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND is_super_admin = true
        )
        OR
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'full')
            AND is_active = true
        )
    );
```

**Step 2: Commit**

```bash
git add supabase/setup/03_policies.sql
git commit -m "feat(db): add RLS policies for class_incharges table"
```

---

## Task 3: Apply migration to Supabase

**Step 1: Execute the table creation SQL via Supabase MCP**

Use the Supabase MCP `execute_sql` tool to run:

```sql
-- Create class_incharges table
CREATE TABLE IF NOT EXISTS public.class_incharges (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID        NOT NULL REFERENCES public.institutions(id),
    section_id     UUID        NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
    staff_id       UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    is_active      BOOLEAN     NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     UUID        REFERENCES public.profiles(id),
    updated_by     UUID        REFERENCES public.profiles(id),
    CONSTRAINT class_incharges_unique_assignment UNIQUE (section_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_class_incharges_institution_id ON public.class_incharges(institution_id);
CREATE INDEX IF NOT EXISTS idx_class_incharges_section_id     ON public.class_incharges(section_id);
CREATE INDEX IF NOT EXISTS idx_class_incharges_staff_id       ON public.class_incharges(staff_id);

ALTER TABLE public.class_incharges ENABLE ROW LEVEL SECURITY;
```

**Step 2: Execute RLS policies via Supabase MCP**

Run (4 policy statements from Task 2) via `execute_sql`.

**Step 3: Verify table exists**

Run this verification query via Supabase MCP:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'class_incharges'
ORDER BY ordinal_position;
```

Expected: 10 rows (id, institution_id, section_id, staff_id, is_active, created_at, updated_at, created_by, updated_by + constraint).

---

## Task 4: Add TypeScript types to `types/staff.ts`

**Files:**
- Modify: `types/staff.ts` — append at the end of the file

**Step 1: Append the types**

```typescript
// =============================================
// CLASS INCHARGES TYPES
// Added: 2026-03-08
// =============================================

export interface ClassInchargeStaff {
  id: string;
  first_name: string;
  last_name: string;
  designation: string;
  profile_picture: string | null;
}

export interface ClassIncharge {
  id: string;
  institution_id: string;
  section_id: string;
  staff_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  // Relations (populated via Supabase select joins)
  staff?: ClassInchargeStaff;
}

export interface SectionWithIncharges {
  id: string;
  section_name: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_id: string;
  is_active: boolean;
  // Joined relations
  degree?: { id: string; degree_name: string };
  department?: { id: string; department_name: string };
  program?: { id: string; program_name: string };
  semester?: { id: string; semester_name: string; semester_code: string };
  // Embedded incharges
  class_incharges?: ClassIncharge[];
}

export interface ClassInchargeFilters {
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}

export interface AssignInchargeDto {
  institution_id: string;
  section_id: string;
  staff_id: string;
}

export interface SectionWithInchargesResponse {
  data: SectionWithIncharges[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

**Step 2: Commit**

```bash
git add types/staff.ts
git commit -m "feat(types): add ClassIncharge and SectionWithIncharges types"
```

---

## Task 5: Create `ClassInchargeService` at `lib/services/staff/class-incharge-service.ts`

**Files:**
- Create: `lib/services/staff/class-incharge-service.ts`

**Step 1: Create the service file**

```typescript
// lib/services/staff/class-incharge-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  ClassIncharge,
  ClassInchargeFilters,
  AssignInchargeDto,
  SectionWithIncharges,
  SectionWithInchargesResponse,
} from '@/types/staff';

export class ClassInchargeService {
  private static supabase = createClientSupabaseClient();

  /**
   * Fetch sections with their class incharges embedded.
   * Uses sections as the primary table so sections with no incharges still appear.
   */
  static async getSectionsWithIncharges(
    filters: ClassInchargeFilters = {}
  ): Promise<SectionWithInchargesResponse> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const offset = (page - 1) * limit;

      let query = this.supabase
        .from('sections')
        .select(
          `
          id,
          section_name,
          institution_id,
          degree_id,
          department_id,
          program_id,
          semester_id,
          is_active,
          degree:degrees(id, degree_name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters(id, semester_name, semester_code),
          class_incharges(
            id,
            staff_id,
            section_id,
            institution_id,
            is_active,
            created_at,
            updated_at,
            staff:staff(id, first_name, last_name, designation, profile_picture)
          )
        `,
          { count: 'estimated' }
        )
        .eq('is_active', true);

      // Apply institution filter first (reduces dataset, improves RLS performance)
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }
      if (filters.degree_id) {
        query = query.eq('degree_id', filters.degree_id);
      }
      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }
      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }
      if (filters.semester_id) {
        query = query.eq('semester_id', filters.semester_id);
      }
      if (filters.section_id) {
        query = query.eq('id', filters.section_id);
      }

      query = query
        .order('section_name', { ascending: true })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      const total = count || 0;

      return {
        data: (data as SectionWithIncharges[]) || [],
        metadata: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('[class-incharge-service] Error fetching sections with incharges:', error);
      throw error;
    }
  }

  /**
   * Fetch all class incharges for a specific section (used in the manage dialog).
   */
  static async getInchargesBySection(sectionId: string): Promise<ClassIncharge[]> {
    try {
      const { data, error } = await this.supabase
        .from('class_incharges')
        .select(
          `
          id,
          staff_id,
          section_id,
          institution_id,
          is_active,
          created_at,
          updated_at,
          staff:staff(id, first_name, last_name, designation, profile_picture)
        `
        )
        .eq('section_id', sectionId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data as ClassIncharge[]) || [];
    } catch (error) {
      console.error('[class-incharge-service] Error fetching incharges by section:', error);
      throw error;
    }
  }

  /**
   * Assign a staff member as class incharge for a section.
   */
  static async assignIncharge(dto: AssignInchargeDto): Promise<ClassIncharge> {
    try {
      const { data, error } = await this.supabase
        .from('class_incharges')
        .insert({
          institution_id: dto.institution_id,
          section_id: dto.section_id,
          staff_id: dto.staff_id,
          is_active: true,
        })
        .select(
          `
          id,
          staff_id,
          section_id,
          institution_id,
          is_active,
          created_at,
          updated_at,
          staff:staff(id, first_name, last_name, designation, profile_picture)
        `
        )
        .single();

      if (error) {
        // Unique constraint violation — staff already assigned to this section
        if (error.code === '23505') {
          throw new Error('This staff member is already assigned as class incharge for this section.');
        }
        throw error;
      }

      return data as ClassIncharge;
    } catch (error) {
      console.error('[class-incharge-service] Error assigning incharge:', error);
      throw error;
    }
  }

  /**
   * Remove a class incharge assignment by its ID.
   */
  static async removeIncharge(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('class_incharges')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('[class-incharge-service] Error removing incharge:', error);
      throw error;
    }
  }
}
```

**Step 2: Commit**

```bash
git add lib/services/staff/class-incharge-service.ts
git commit -m "feat(service): add ClassInchargeService with CRUD operations"
```

---

## Task 6: Create React Query hooks at `hooks/staff/use-class-incharges.ts`

**Files:**
- Create: `hooks/staff/use-class-incharges.ts`

**Step 1: Create the hooks file**

```typescript
// hooks/staff/use-class-incharges.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClassInchargeFilters, AssignInchargeDto } from '@/types/staff';
import { ClassInchargeService } from '@/lib/services/staff/class-incharge-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// Query key factory
export const classInchargeKeys = {
  all: ['class-incharges'] as const,
  lists: () => [...classInchargeKeys.all, 'list'] as const,
  list: (filters: ClassInchargeFilters) => [...classInchargeKeys.lists(), filters] as const,
  bySection: (sectionId: string) =>
    [...classInchargeKeys.all, 'by-section', sectionId] as const,
};

/**
 * Fetch paginated sections with their embedded class incharges.
 * Requires institution_id to be set before enabling.
 */
export function useClassIncharges(filters: ClassInchargeFilters = {}) {
  return useQuery({
    queryKey: classInchargeKeys.list(filters),
    queryFn: () => ClassInchargeService.getSectionsWithIncharges(filters),
    enabled: !!filters.institution_id,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch all incharges for a specific section (used inside the manage dialog).
 */
export function useInchargesBySection(sectionId: string | null) {
  return useQuery({
    queryKey: classInchargeKeys.bySection(sectionId || ''),
    queryFn: () => ClassInchargeService.getInchargesBySection(sectionId!),
    enabled: !!sectionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Assign a staff member as class incharge.
 * Invalidates the list and the specific section's incharges after success.
 */
export function useAssignIncharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: AssignInchargeDto) => ClassInchargeService.assignIncharge(dto),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: classInchargeKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: classInchargeKeys.bySection(variables.section_id),
      });
    },
  });
}

/**
 * Remove a class incharge assignment.
 * Requires sectionId to invalidate the section-specific cache after deletion.
 */
export function useRemoveIncharge(sectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ClassInchargeService.removeIncharge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: classInchargeKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: classInchargeKeys.bySection(sectionId),
      });
    },
  });
}
```

**Step 2: Commit**

```bash
git add hooks/staff/use-class-incharges.ts
git commit -m "feat(hooks): add React Query hooks for class incharges"
```

---

## Task 7: Add sidebar menu entry in `lib/sidebarMenuLink.ts`

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

**Step 1: Add the menu item**

Find the `'Facilitators Management'` group (around line 1002). It currently has 3 items (dashboard, category, list). Add a 4th item for Class Incharges:

```typescript
// Find this block:
        {
          href: '/staff/list',
          label: 'Facilitators List',
          active: pathname === '/staff/list',
          icon: Users,
          submenus: []
        }
// Add AFTER it (before the closing `]` of menus):
        ,
        {
          href: '/staff/class-incharges',
          label: 'Class Incharges',
          active: pathname.startsWith('/staff/class-incharges'),
          icon: UserCheck,
          submenus: []
        }
```

Note: `UserCheck` is already imported at line 48 — no new import needed.

**Step 2: Commit**

```bash
git add lib/sidebarMenuLink.ts
git commit -m "feat(nav): add Class Incharges entry to Facilitators Management sidebar"
```

---

## Task 8: Create the main page at `app/(routes)/staff/class-incharges/page.tsx`

**Files:**
- Create: `app/(routes)/staff/class-incharges/page.tsx`

**Step 1: Create the page**

```tsx
// app/(routes)/staff/class-incharges/page.tsx

import { Metadata } from 'next';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ClassInchargesPageClient } from './_components/class-incharges-page-client';

export const metadata: Metadata = {
  title: 'Class Incharges',
  description: 'Assign and manage class incharges for sections',
};

export default function ClassInchargesPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/staff/list">Facilitators</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Class Incharges</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <ClassInchargesPageClient />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/(routes)/staff/class-incharges/page.tsx
git commit -m "feat(page): add Class Incharges route and page"
```

---

## Task 9: Create `_components/class-incharges-page-client.tsx`

**Files:**
- Create: `app/(routes)/staff/class-incharges/_components/class-incharges-page-client.tsx`

**Step 1: Create the client wrapper**

```tsx
// app/(routes)/staff/class-incharges/_components/class-incharges-page-client.tsx

'use client';

import { useState } from 'react';
import { ClassInchargeFilters } from '@/types/staff';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { ClassInchargesFilters } from './class-incharges-filters';
import { ClassInchargesList } from './class-incharges-list';

export function ClassInchargesPageClient() {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();

  const [filters, setFilters] = useState<ClassInchargeFilters>({
    institution_id: isSuperAdmin ? undefined : profile?.institution_id ?? undefined,
    page: 1,
    limit: 20,
  });

  function handleFiltersChange(updated: Partial<ClassInchargeFilters>) {
    setFilters((prev) => ({ ...prev, ...updated, page: 1 }));
  }

  function handlePageChange(page: number) {
    setFilters((prev) => ({ ...prev, page }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Class Incharges</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Assign and manage class incharges for sections
          </p>
        </div>
      </div>

      <ClassInchargesFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      <ClassInchargesList
        filters={filters}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
```

---

## Task 10: Create `_components/class-incharges-filters.tsx`

**Files:**
- Create: `app/(routes)/staff/class-incharges/_components/class-incharges-filters.tsx`

**Step 1: Create the cascading filters component**

```tsx
// app/(routes)/staff/class-incharges/_components/class-incharges-filters.tsx

'use client';

import { useEffect } from 'react';
import { ClassInchargeFilters } from '@/types/staff';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RotateCcw } from 'lucide-react';

interface Props {
  filters: ClassInchargeFilters;
  onFiltersChange: (updated: Partial<ClassInchargeFilters>) => void;
}

export function ClassInchargesFilters({ filters, onFiltersChange }: Props) {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();

  const { data: institutionsData } = useInstitutionsWithAccess();
  const institutions = institutionsData?.data || [];

  const { data: degreesData } = useDegrees({
    institution_id: filters.institution_id,
    isActive: true,
  });
  const degrees = degreesData?.data || [];

  const { data: departmentsData } = useDepartments({
    institution_id: filters.institution_id,
    degree_id: filters.degree_id,
    isActive: true,
  });
  const departments = departmentsData?.data || [];

  const { data: programsData } = usePrograms({
    institution_id: filters.institution_id,
    degree_id: filters.degree_id,
    department_id: filters.department_id,
    isActive: true,
  });
  const programs = programsData?.data || [];

  const { data: semestersData } = useSemesters({
    institution_id: filters.institution_id,
    degree_id: filters.degree_id,
    department_id: filters.department_id,
    program_id: filters.program_id,
    isActive: true,
  });
  const semesters = semestersData?.data || [];

  const { data: sectionsData } = useSections({
    institution_id: filters.institution_id,
    degree_id: filters.degree_id,
    department_id: filters.department_id,
    program_id: filters.program_id,
    semester_id: filters.semester_id,
    isActive: true,
    limit: 200,
  });
  const sections = sectionsData?.data || [];

  // Auto-select institution for non-super-admin users
  useEffect(() => {
    if (!isSuperAdmin && profile?.institution_id && !filters.institution_id) {
      onFiltersChange({ institution_id: profile.institution_id });
    }
  }, [profile, isSuperAdmin]);

  function handleReset() {
    onFiltersChange({
      institution_id: isSuperAdmin ? undefined : profile?.institution_id ?? undefined,
      degree_id: undefined,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined,
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Institution — only shown to super admins */}
          {isSuperAdmin && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Institution</Label>
              <Select
                value={filters.institution_id || ''}
                onValueChange={(v) =>
                  onFiltersChange({
                    institution_id: v || undefined,
                    degree_id: undefined,
                    department_id: undefined,
                    program_id: undefined,
                    semester_id: undefined,
                    section_id: undefined,
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All institutions" />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Degree */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Degree</Label>
            <Select
              value={filters.degree_id || ''}
              disabled={!filters.institution_id}
              onValueChange={(v) =>
                onFiltersChange({
                  degree_id: v || undefined,
                  department_id: undefined,
                  program_id: undefined,
                  semester_id: undefined,
                  section_id: undefined,
                })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All degrees" />
              </SelectTrigger>
              <SelectContent>
                {degrees.map((deg) => (
                  <SelectItem key={deg.id} value={deg.id}>
                    {deg.degree_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Department */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Department</Label>
            <Select
              value={filters.department_id || ''}
              disabled={!filters.degree_id}
              onValueChange={(v) =>
                onFiltersChange({
                  department_id: v || undefined,
                  program_id: undefined,
                  semester_id: undefined,
                  section_id: undefined,
                })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.department_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Program */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Program</Label>
            <Select
              value={filters.program_id || ''}
              disabled={!filters.department_id}
              onValueChange={(v) =>
                onFiltersChange({
                  program_id: v || undefined,
                  semester_id: undefined,
                  section_id: undefined,
                })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All programs" />
              </SelectTrigger>
              <SelectContent>
                {programs.map((prog) => (
                  <SelectItem key={prog.id} value={prog.id}>
                    {prog.program_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Semester */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Semester</Label>
            <Select
              value={filters.semester_id || ''}
              disabled={!filters.program_id}
              onValueChange={(v) =>
                onFiltersChange({
                  semester_id: v || undefined,
                  section_id: undefined,
                })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All semesters" />
              </SelectTrigger>
              <SelectContent>
                {semesters.map((sem) => (
                  <SelectItem key={sem.id} value={sem.id}>
                    {sem.semester_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Section */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Section</Label>
            <Select
              value={filters.section_id || ''}
              disabled={!filters.semester_id}
              onValueChange={(v) =>
                onFiltersChange({ section_id: v || undefined })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All sections" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((sec) => (
                  <SelectItem key={sec.id} value={sec.id}>
                    {sec.section_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## Task 11: Create column definitions at `_components/class-incharge-columns.tsx`

**Files:**
- Create: `app/(routes)/staff/class-incharges/_components/class-incharge-columns.tsx`

**Step 1: Create column definitions**

```tsx
// app/(routes)/staff/class-incharges/_components/class-incharge-columns.tsx

'use client';

import { ColumnDef } from '@tanstack/react-table';
import { SectionWithIncharges, ClassIncharge } from '@/types/staff';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { UserCheck, UserPlus } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ColumnActions {
  onManage: (section: SectionWithIncharges) => void;
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName[0]}${lastName[0]}`.toUpperCase();
}

function InchargeAvatars({ incharges }: { incharges: ClassIncharge[] }) {
  if (!incharges || incharges.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const visibleCount = 3;
  const visible = incharges.slice(0, visibleCount);
  const overflow = incharges.length - visibleCount;

  return (
    <div className="flex items-center gap-1">
      <div className="flex -space-x-2">
        {visible.map((ic) => (
          <TooltipProvider key={ic.id}>
            <Tooltip>
              <TooltipTrigger>
                <Avatar className="h-7 w-7 border-2 border-background">
                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                    {ic.staff
                      ? getInitials(ic.staff.first_name, ic.staff.last_name)
                      : '?'}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {ic.staff
                    ? `${ic.staff.first_name} ${ic.staff.last_name}`
                    : 'Unknown'}
                </p>
                {ic.staff?.designation && (
                  <p className="text-xs text-muted-foreground">
                    {ic.staff.designation}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
      {overflow > 0 && (
        <Badge variant="secondary" className="text-xs h-6 px-1.5">
          +{overflow}
        </Badge>
      )}
    </div>
  );
}

export function getClassInchargeColumns(
  actions: ColumnActions
): ColumnDef<SectionWithIncharges>[] {
  return [
    {
      accessorKey: 'section_name',
      header: 'Section',
      cell: ({ row }) => (
        <span className="font-medium">{row.original.section_name}</span>
      ),
    },
    {
      id: 'semester',
      header: 'Semester',
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.semester?.semester_name ?? '—'}
        </span>
      ),
    },
    {
      id: 'program',
      header: 'Program',
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.program?.program_name ?? '—'}
        </span>
      ),
    },
    {
      id: 'department',
      header: 'Department',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.department?.department_name ?? '—'}
        </span>
      ),
    },
    {
      id: 'incharges',
      header: 'Incharges',
      cell: ({ row }) => (
        <InchargeAvatars incharges={row.original.class_incharges || []} />
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const hasIncharges =
          row.original.class_incharges && row.original.class_incharges.length > 0;
        return (
          <Button
            variant={hasIncharges ? 'outline' : 'default'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => actions.onManage(row.original)}
          >
            {hasIncharges ? (
              <>
                <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                Manage
              </>
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                Assign
              </>
            )}
          </Button>
        );
      },
    },
  ];
}
```

---

## Task 12: Create `_components/class-incharges-list.tsx`

**Files:**
- Create: `app/(routes)/staff/class-incharges/_components/class-incharges-list.tsx`

**Step 1: Create the data table component**

```tsx
// app/(routes)/staff/class-incharges/_components/class-incharges-list.tsx

'use client';

import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import { ClassInchargeFilters, SectionWithIncharges } from '@/types/staff';
import { useClassIncharges } from '@/hooks/staff/use-class-incharges';
import { getClassInchargeColumns } from './class-incharge-columns';
import { AssignInchargeDialog } from './assign-incharge-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronLeft, ChevronRight, UserX } from 'lucide-react';

interface Props {
  filters: ClassInchargeFilters;
  onPageChange: (page: number) => void;
}

export function ClassInchargesList({ filters, onPageChange }: Props) {
  const [selectedSection, setSelectedSection] =
    useState<SectionWithIncharges | null>(null);

  const { data, isLoading, error } = useClassIncharges(filters);
  const sections = data?.data || [];
  const metadata = data?.metadata;

  const columns = getClassInchargeColumns({
    onManage: (section) => setSelectedSection(section),
  });

  const table = useReactTable({
    data: sections,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (!filters.institution_id) {
    return (
      <Alert>
        <AlertDescription>
          Select an institution to view class incharges.
        </AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load sections. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id} className="text-xs font-medium">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center"
                >
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <UserX className="h-8 w-8" />
                    <p className="text-sm">No sections found</p>
                    <p className="text-xs">
                      Adjust the filters to see sections
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/40">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {metadata && metadata.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {sections.length} of {metadata.total} sections
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={metadata.page <= 1}
              onClick={() => onPageChange(metadata.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              {metadata.page} / {metadata.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={metadata.page >= metadata.totalPages}
              onClick={() => onPageChange(metadata.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Assign/Manage Dialog */}
      {selectedSection && (
        <AssignInchargeDialog
          section={selectedSection}
          open={!!selectedSection}
          onOpenChange={(open) => {
            if (!open) setSelectedSection(null);
          }}
        />
      )}
    </>
  );
}
```

---

## Task 13: Create `_components/assign-incharge-dialog.tsx`

**Files:**
- Create: `app/(routes)/staff/class-incharges/_components/assign-incharge-dialog.tsx`

**Step 1: Create the dialog component**

```tsx
// app/(routes)/staff/class-incharges/_components/assign-incharge-dialog.tsx

'use client';

import { useState } from 'react';
import { SectionWithIncharges } from '@/types/staff';
import { useInchargesBySection, useAssignIncharge, useRemoveIncharge } from '@/hooks/staff/use-class-incharges';
import { useStaffForSelection } from '@/hooks/staff/use-staff';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { X, Plus, Loader2 } from 'lucide-react';

interface Props {
  section: SectionWithIncharges;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getInitials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

export function AssignInchargeDialog({ section, open, onOpenChange }: Props) {
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');

  const { data: incharges = [], isLoading: inchargesLoading } =
    useInchargesBySection(section.id);

  const { data: staffList = [], isLoading: staffLoading } = useStaffForSelection({
    institution_id: section.institution_id,
    isActive: true,
  });

  const assignMutation = useAssignIncharge();
  const removeMutation = useRemoveIncharge(section.id);

  // Exclude already-assigned staff from the dropdown
  const assignedStaffIds = new Set(incharges.map((ic) => ic.staff_id));
  const availableStaff = staffList.filter((s) => !assignedStaffIds.has(s.id));

  async function handleAssign() {
    if (!selectedStaffId) return;
    try {
      await assignMutation.mutateAsync({
        institution_id: section.institution_id,
        section_id: section.id,
        staff_id: selectedStaffId,
      });
      setSelectedStaffId('');
      toast.success('Class incharge assigned successfully');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to assign incharge');
    }
  }

  async function handleRemove(id: string, name: string) {
    try {
      await removeMutation.mutateAsync(id);
      toast.success(`${name} removed as class incharge`);
    } catch {
      toast.error('Failed to remove incharge');
    }
  }

  const hierarchyLabel = [
    section.degree?.degree_name,
    section.department?.department_name,
    section.semester?.semester_name,
  ]
    .filter(Boolean)
    .join(' › ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Manage Class Incharges — {section.section_name}
          </DialogTitle>
          {hierarchyLabel && (
            <DialogDescription>{hierarchyLabel}</DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-5 pt-2">
          {/* Currently Assigned */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">Currently Assigned</Label>
            {inchargesLoading ? (
              <p className="text-xs text-muted-foreground">Loading...</p>
            ) : incharges.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No incharges assigned yet
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {incharges.map((ic) => {
                  const name = ic.staff
                    ? `${ic.staff.first_name} ${ic.staff.last_name}`
                    : 'Unknown';
                  return (
                    <Badge
                      key={ic.id}
                      variant="secondary"
                      className="flex items-center gap-1.5 pl-1 pr-2 py-1 h-auto"
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[9px]">
                          {ic.staff
                            ? getInitials(
                                ic.staff.first_name,
                                ic.staff.last_name
                              )
                            : '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs">{name}</span>
                      <button
                        className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                        disabled={removeMutation.isPending}
                        onClick={() => handleRemove(ic.id, name)}
                        aria-label={`Remove ${name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add New Incharge */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">Add Incharge</Label>
            <div className="flex gap-2">
              <Select
                value={selectedStaffId}
                onValueChange={setSelectedStaffId}
                disabled={staffLoading || availableStaff.length === 0}
              >
                <SelectTrigger className="flex-1 h-9 text-sm">
                  <SelectValue
                    placeholder={
                      availableStaff.length === 0
                        ? 'All staff already assigned'
                        : 'Search staff by name...'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableStaff.map((staff) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      <span>
                        {staff.first_name} {staff.last_name}
                      </span>
                      {staff.staff_id && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          ({staff.staff_id})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!selectedStaffId || assignMutation.isPending}
                onClick={handleAssign}
                className="h-9"
              >
                {assignMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit all remaining component files**

```bash
git add app/(routes)/staff/class-incharges/
git commit -m "feat(ui): add Class Incharges page, filters, list, and assign dialog"
```

---

## Task 14: Verify end-to-end

**Step 1: Start the dev server**

```bash
npm run dev
```

**Step 2: Navigate to `/staff/class-incharges`**

Expected:
- Page loads with breadcrumb "Home > Facilitators > Class Incharges"
- "Class Incharges" entry visible in sidebar under Facilitators Management
- Filters card shows Institution dropdown (super admin) or auto-selected institution
- Alert shown: "Select an institution to view class incharges"

**Step 3: Apply filters and verify sections load**

- Select institution → degree → department → program → semester
- Expected: data table shows sections with `—` in Incharges column and "Assign" button

**Step 4: Assign a staff member**

- Click "Assign" on any section
- Dialog opens with section name and hierarchy label
- Select a staff member from dropdown
- Click "Add"
- Expected: staff appears as badge, section row shows avatar + "Manage" button

**Step 5: Remove an incharge**

- Click "Manage" on a section with incharges
- Click the × on an incharge badge
- Expected: badge disappears, section row updates

**Step 6: Verify duplicate prevention**

- Try assigning the same staff member twice to the same section
- Expected: toast shows "This staff member is already assigned as class incharge for this section."

**Step 7: Final commit**

```bash
git add .
git commit -m "feat(class-incharges): complete Class Incharges module implementation"
```

---

## Summary of Files Changed

| Action | File |
|--------|------|
| Modify | `supabase/setup/01_tables.sql` |
| Modify | `supabase/setup/03_policies.sql` |
| Modify | `types/staff.ts` |
| Modify | `lib/sidebarMenuLink.ts` |
| Create | `lib/services/staff/class-incharge-service.ts` |
| Create | `hooks/staff/use-class-incharges.ts` |
| Create | `app/(routes)/staff/class-incharges/page.tsx` |
| Create | `app/(routes)/staff/class-incharges/_components/class-incharges-page-client.tsx` |
| Create | `app/(routes)/staff/class-incharges/_components/class-incharges-filters.tsx` |
| Create | `app/(routes)/staff/class-incharges/_components/class-incharge-columns.tsx` |
| Create | `app/(routes)/staff/class-incharges/_components/class-incharges-list.tsx` |
| Create | `app/(routes)/staff/class-incharges/_components/assign-incharge-dialog.tsx` |
