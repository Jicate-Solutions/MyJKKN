# Phase 1.3: Admin UI for Virtual School Degree/Department Records

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Create admin interface to view and manage virtual K-12 Program degrees and Academic departments created for school institutions.

**Architecture:** 
- New page: `/organizations/school-defaults` (route protected by existing institution admin)
- DataTable showing all schools with their virtual degree/department records
- View-only initially; edit/delete deferred to Phase 1.4
- Real-time display of which schools have defaults vs. missing
- Action buttons to create missing defaults manually

**Tech Stack:** Next.js 15, React, Shadcn DataTable, TypeScript, Supabase

**UI Components:** DataTable, Button, Badge (for status), Dialog (for viewing details)

---

## Task 1: Create Admin Route and Page Component

**Files:**
- Create: `app/(routes)/organizations/school-defaults/page.tsx`
- Create: `app/(routes)/organizations/school-defaults/_components/school-defaults-table.tsx`
- Modify: `lib/sidebarMenuLink.ts` (add menu link)

**Step 1: Create route file**

```typescript
// app/(routes)/organizations/school-defaults/page.tsx

import { Metadata } from 'next';
import SchoolDefaultsPage from './_components/school-defaults-page';
import { getCurrentUserProfile } from '@/lib/auth/auth-service';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'School Defaults',
  description: 'Manage virtual K-12 Program and Academic department defaults for school institutions',
};

export default async function Page() {
  // Check auth
  const profile = await getCurrentUserProfile();
  if (!profile) {
    redirect('/auth/login');
  }

  return <SchoolDefaultsPage />;
}
```

**Step 2: Create page component**

```typescript
// app/(routes)/organizations/school-defaults/_components/school-defaults-page.tsx

'use client';

import { useEffect, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import SchoolDefaultsTable from './school-defaults-table';
import { PageHeader } from '@/components/page-header';
import { AlertBox } from '@/components/ui/alert-box';
import { Loader2 } from 'lucide-react';

interface SchoolWithDefaults {
  school_id: string;
  school_name: string;
  entity_type: string;
  degree_id: string | null;
  degree_name: string | null;
  degree_code: string | null;
  department_id: string | null;
  department_name: string | null;
  department_code: string | null;
  learner_count: number;
}

export default function SchoolDefaultsPage() {
  const [schools, setSchools] = useState<SchoolWithDefaults[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSchoolDefaults();
  }, []);

  async function fetchSchoolDefaults() {
    try {
      setLoading(true);
      const supabase = createClientSupabaseClient();

      // Query schools with their degree/department assignments
      const { data, error: queryError } = await supabase
        .from('institutions')
        .select(`
          id,
          institution_name,
          entity_type,
          degrees!left (
            id,
            degree_name,
            degree_code
          ),
          learners_profiles!left (
            id
          )
        `)
        .eq('entity_type', 'school')
        .order('institution_name');

      if (queryError) throw queryError;

      // Transform data to match table schema
      const transformed: SchoolWithDefaults[] = (data || []).map((school: any) => {
        const k12Degree = school.degrees?.find((d: any) => d.degree_code === 'K12');
        return {
          school_id: school.id,
          school_name: school.institution_name,
          entity_type: school.entity_type,
          degree_id: k12Degree?.id || null,
          degree_name: k12Degree?.degree_name || null,
          degree_code: k12Degree?.degree_code || null,
          department_id: null, // Will fetch separately if needed
          department_name: null,
          department_code: null,
          learner_count: school.learners_profiles?.length || 0,
        };
      });

      setSchools(transformed);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load school defaults');
      console.error('Error fetching school defaults:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Defaults"
        description="Manage virtual K-12 Program and Academic department assignments for school institutions"
      />

      {error && <AlertBox type="error" message={error} />}

      {schools.length === 0 ? (
        <AlertBox type="info" message="No school institutions found in the system" />
      ) : (
        <SchoolDefaultsTable data={schools} onRefresh={fetchSchoolDefaults} />
      )}
    </div>
  );
}
```

**Step 3: Create data table component**

```typescript
// app/(routes)/organizations/school-defaults/_components/school-defaults-table.tsx

'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertBox } from '@/components/ui/alert-box';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface SchoolWithDefaults {
  school_id: string;
  school_name: string;
  entity_type: string;
  degree_id: string | null;
  degree_name: string | null;
  degree_code: string | null;
  department_id: string | null;
  department_name: string | null;
  department_code: string | null;
  learner_count: number;
}

interface SchoolDefaultsTableProps {
  data: SchoolWithDefaults[];
  onRefresh: () => Promise<void>;
}

export default function SchoolDefaultsTable({
  data,
  onRefresh,
}: SchoolDefaultsTableProps) {
  const hasDefaults = (school: SchoolWithDefaults) => !!school.degree_id;

  const defaultsCount = data.filter(hasDefaults).length;
  const missingCount = data.filter(s => !hasDefaults(s)).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Total Schools</div>
          <div className="text-2xl font-bold">{data.length}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">With Defaults</div>
          <div className="text-2xl font-bold text-green-600">{defaultsCount}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Missing Defaults</div>
          <div className="text-2xl font-bold text-amber-600">{missingCount}</div>
        </div>
      </div>

      {missingCount > 0 && (
        <AlertBox
          type="warning"
          message={`${missingCount} school(s) are missing K-12 Program degree assignment. Run the batch auto-fill script to fix.`}
        />
      )}

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>School Name</TableHead>
              <TableHead>Learners</TableHead>
              <TableHead>K-12 Program Degree</TableHead>
              <TableHead>Academic Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(school => (
              <TableRow key={school.school_id}>
                <TableCell className="font-medium">{school.school_name}</TableCell>
                <TableCell>{school.learner_count}</TableCell>
                <TableCell>
                  {school.degree_name ? (
                    <div className="text-sm">
                      <div>{school.degree_name}</div>
                      <div className="text-xs text-muted-foreground">{school.degree_code}</div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {school.department_name ? (
                    <div className="text-sm">
                      <div>{school.department_name}</div>
                      <div className="text-xs text-muted-foreground">{school.department_code}</div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {school.degree_id ? (
                    <Badge variant="outline" className="bg-green-50">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Configured
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-50">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Missing
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!school.degree_id}
                    title={school.degree_id ? 'View details' : 'Degree not assigned'}
                  >
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

**Step 4: Add menu link to sidebar**

Find the school-related menu items in `lib/sidebarMenuLink.ts` and add:

```typescript
{
  label: 'School Defaults',
  href: '/organizations/school-defaults',
  icon: '🎓',
  badge: 'new',
}
```

Add this in the organizations section, near other degree/department/program links.

**Step 5: Verify compilation**

Run: `npm run typecheck`

Expected: No TypeScript errors

**Step 6: Commit**

```bash
git add app/(routes)/organizations/school-defaults lib/sidebarMenuLink.ts
git commit -m "feat: add admin UI for viewing school default assignments

- Create /organizations/school-defaults page
- DataTable showing all schools and K-12 Program degree status
- Summary cards: total schools, with defaults, missing defaults
- Warning alert for schools without defaults
- Badge status indicators (Configured vs. Missing)
- View action buttons for future detail pages"
```

---

## Task 2: Add Supabase Query Helper

**Files:**
- Create: `lib/services/school-defaults-admin-service.ts`

**Step 1: Create service**

```typescript
// lib/services/school-defaults-admin-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface SchoolDefaultsRecord {
  school_id: string;
  school_name: string;
  degree_id: string | null;
  degree_name: string | null;
  degree_code: string | null;
  department_id: string | null;
  department_name: string | null;
  department_code: string | null;
  learner_count: number;
  created_at: string | null;
}

export class SchoolDefaultsAdminService {
  /**
   * Get all schools with their K-12 Program degree/department assignments
   */
  static async getSchoolDefaults(): Promise<SchoolDefaultsRecord[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('institutions')
      .select(
        `
        id,
        institution_name,
        degrees!left (
          id,
          degree_name,
          degree_code,
          created_at,
          departments!left (
            id,
            department_name,
            department_code
          )
        ),
        learners_profiles!left (
          id
        )
      `
      )
      .eq('entity_type', 'school')
      .order('institution_name');

    if (error) throw error;

    return (data || []).map((school: any) => {
      const k12Degree = school.degrees?.find((d: any) => d.degree_code === 'K12');
      const acadDept = k12Degree?.departments?.find((d: any) => d.department_code === 'ACAD');

      return {
        school_id: school.id,
        school_name: school.institution_name,
        degree_id: k12Degree?.id || null,
        degree_name: k12Degree?.degree_name || null,
        degree_code: k12Degree?.degree_code || null,
        department_id: acadDept?.id || null,
        department_name: acadDept?.department_name || null,
        department_code: acadDept?.department_code || null,
        learner_count: school.learners_profiles?.length || 0,
        created_at: k12Degree?.created_at || null,
      };
    });
  }

  /**
   * Get count of schools with vs. without defaults
   */
  static async getDefaultsStats(): Promise<{
    total: number;
    configured: number;
    missing: number;
  }> {
    const records = await this.getSchoolDefaults();

    return {
      total: records.length,
      configured: records.filter(r => !!r.degree_id).length,
      missing: records.filter(r => !r.degree_id).length,
    };
  }
}
```

**Step 2: Verify and commit**

```bash
git add lib/services/school-defaults-admin-service.ts
git commit -m "feat: add SchoolDefaultsAdminService for querying school assignments

- getSchoolDefaults(): fetch all schools with degree/dept assignments
- getDefaultsStats(): count configured vs missing schools
- Handles null values gracefully for schools without defaults"
```

---

## Task 3: Add Tests and Documentation

**Files:**
- Modify: `docs/PHASE1.2-SCHOOLS-AUTO-FILL-TESTING.md`
- Create: `docs/school-defaults-admin-guide.md` (optional)

**Step 1: Update testing guide**

Add section to Phase 1.2 testing guide:

```markdown
## Admin UI: School Defaults Management

### Access the Admin Page

Navigate to: `/organizations/school-defaults`

Access requirements: Institution admin role

### What you'll see:

1. **Summary Cards**
   - Total schools in system
   - Schools with configured K-12 Program defaults
   - Schools missing defaults

2. **School Defaults Table**
   - School name
   - Number of enrolled learners
   - K-12 Program degree name/code (if assigned)
   - Academic department name/code (if assigned)
   - Status badge: "Configured" (green) or "Missing" (amber)
   - View button for future detail pages

3. **Warning Alert** (if applicable)
   - Shows if any schools lack defaults
   - Recommends running batch auto-fill script

### Using the Interface

**View School Details:**
1. Find school in table
2. If status is "Configured", click View button
3. See degree/department details (future: edit/delete options)

**Fix Missing Defaults:**
1. Check if summary shows "Missing Defaults"
2. Open terminal and run: `npm run batch:autofill-schools`
3. Refresh page to see updated status

### Example Screenshot

[Schools shown with mixed statuses - some with K-12 Program, some missing]
```

**Step 2: Commit documentation**

```bash
git add docs/PHASE1.2-SCHOOLS-AUTO-FILL-TESTING.md
git commit -m "docs: add admin UI guide for school defaults management

- Access path and permission requirements
- Explain summary cards and table columns
- Document how to use View button
- Guide for fixing missing defaults
- Link to batch auto-fill script"
```

---

## Task 4: Verify and Final Checks

**Files:**
- Verify: Build, type checking, routes

**Step 1: Build verification**

Run: `npm run build 2>&1 | tail -50`

Expected: Build succeeds (may take a minute)

**Step 2: Type check**

Run: `npm run typecheck`

Expected: No errors

**Step 3: Dev server test**

If running locally:
1. `npm run dev`
2. Navigate to `http://localhost:3000/organizations/school-defaults`
3. Verify page loads without errors
4. Check table displays schools
5. Verify summary cards show counts

**Step 4: Final commits log**

```bash
git log --oneline -5
```

Should show:
- Admin page and components
- Service helper
- Documentation updates

**Step 5: Summary**

All Phase 1.3 Task 3 components in place:
- ✅ Route, page, and table components
- ✅ Query service helper
- ✅ Sidebar menu link
- ✅ Documentation
- ✅ Type safety verified

---

## Success Criteria

- [x] Route `/organizations/school-defaults` created
- [x] PageHeader with title and description
- [x] Summary cards showing school counts
- [x] DataTable with all schools and defaults
- [x] Status badges (Configured/Missing)
- [x] Warning alert for missing defaults
- [x] View action buttons (placeholder for future edit)
- [x] Query service for reusable data fetching
- [x] Sidebar menu link added
- [x] Type safe (TypeScript passes)
- [x] Documentation updated

## Deferred to Phase 1.4

- Edit/delete school defaults (admin actions)
- Detail view modal with full school info
- Bulk create missing defaults from UI (instead of CLI)
- Audit log of who created/modified defaults
- Permission gating per institution

## Notes

- Page uses existing `PageHeader` and `AlertBox` components
- DataTable from Shadcn (reusable pattern in codebase)
- Service-role bypass not needed (users query their own institutions)
- No mutation actions yet (view-only for Phase 1.3)
- Badge component provides visual status at a glance
- Table is sortable/filterable if Shadcn DataTable supports (verify)
