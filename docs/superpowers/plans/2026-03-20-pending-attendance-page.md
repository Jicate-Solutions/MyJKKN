# Pending Attendance Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `/academic/attendance/pending` page that shows faculty and admins all unmarked attendance periods from a configurable date range (default: last 7 days), with role-based filters, statistics cards, and navigation to the existing mark-attendance page.

**Architecture:** Extend the existing `getTodayPendingAttendance()` service method with 4 focused changes (weekend skip, off-days exclusion, timetable filter, enriched metadata), add a new React Query hook with correct defaults, and build new UI components that reuse existing dashboard patterns (collapsible filters, stat cards, data table columns).

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase, React Query (TanStack Query), shadcn/ui, Tailwind CSS, lucide-react

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `types/attendance-dashboard.ts` | Add `course_id` to `PendingAttendancePeriod`, `timetableId` to `DashboardFilters`, enriched metadata fields |
| Modify | `supabase/setup/01_tables.sql` | Add `institution_off_days` table + index |
| Modify | `supabase/setup/03_policies.sql` | Add RLS policies for `institution_off_days` |
| Modify | `lib/services/academic/attendance-dashboard-service.ts` | 4 changes: weekend skip, off-days, timetable filter, enriched metadata |
| New | `hooks/academic/use-pending-attendance-date-range.ts` | React Query hook for the new page with correct defaults |
| New | `hooks/academic/use-timetables-for-pending.ts` | Fetch timetable list scoped by institution/year/section/staff for filter dropdown |
| New | `app/(routes)/academic/attendance/pending/_components/pending-date-range-warning-banner.tsx` | Yellow warning banner shown when date range > 30 days |
| New | `app/(routes)/academic/attendance/pending/_components/pending-date-range-filters.tsx` | Full filter panel: date range + role-based hierarchy + timetable |
| New | `app/(routes)/academic/attendance/pending/_components/pending-stats-cards.tsx` | 6-card (admin) / 5-card (faculty) statistics grid |
| New | `app/(routes)/academic/attendance/pending/_components/pending-attendance-client.tsx` | Client component: state, filters, stats, table wired together |
| New | `app/(routes)/academic/attendance/pending/page.tsx` | Server component shell with breadcrumb, permission guard, ContentLayout |
| Modify | `lib/sidebarMenuLink.ts` | Add "Pending Attendance" submenu entry |
| Modify | `app/(routes)/academic/attendance/dashboard/_components/pending-attendance-tab.tsx` (or equivalent pending tab component) | Add "View Full Pending History →" link |

---

## Task 1: Type Foundation

**Files:**
- Modify: `types/attendance-dashboard.ts`

Read `types/attendance-dashboard.ts` first to see the exact current shape of `PendingAttendancePeriod`, `DashboardFilters`, and `PendingAttendanceResponse`.

- [ ] **Step 1: Add `course_id` to `PendingAttendancePeriod`**

Find the `PendingAttendancePeriod` interface. Add `course_id` immediately before `course_name`:

```typescript
course_id: string        // slot.course_id — retained for metadata aggregation
course_name: string
course_code?: string
```

- [ ] **Step 2: Add `timetableId` to `DashboardFilters`**

Find the `DashboardFilters` interface. Add after `staffId`:

```typescript
timetableId?: string     // server-side timetable filter for pending page
```

- [ ] **Step 3: Extend `PendingAttendanceResponse` metadata**

Find the `metadata` object inside `PendingAttendanceResponse`. Add after `totalPages`:

```typescript
overdueCount: number      // periods where attendance_date < today
todayCount: number        // periods where attendance_date === today
sectionsCount: number     // unique sections with pending periods
subjectsCount: number     // unique courses with pending periods
staffCount: number        // unique staff with pending periods
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd D:/Projects/MyJKKN && npx tsc --noEmit 2>&1 | head -30
```
Expected: zero new errors. If errors appear, they will point to callers that need the new `course_id` field — fix each caller by adding `course_id: slot.course_id` or `course_id: ''` as appropriate.

- [ ] **Step 5: Commit**

```bash
git add types/attendance-dashboard.ts
git commit -m "feat(pending-attendance): extend types with course_id, timetableId, enriched metadata"
```

---

## Task 2: Database Migration

**Files:**
- Modify: `supabase/setup/01_tables.sql`
- Modify: `supabase/setup/03_policies.sql`

- [ ] **Step 1: Add `institution_off_days` table to `01_tables.sql`**

Open `supabase/setup/01_tables.sql`. Scroll to the end of the attendance-related tables section. Add:

```sql
-- Updated: 2026-03-20 — Added institution_off_days for pending attendance weekend/holiday filtering
CREATE TABLE IF NOT EXISTS institution_off_days (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  off_date        DATE NOT NULL,
  reason          TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(institution_id, off_date)
);

CREATE INDEX IF NOT EXISTS idx_institution_off_days
  ON institution_off_days(institution_id, off_date);
```

- [ ] **Step 2: Add RLS policies to `03_policies.sql`**

Open `supabase/setup/03_policies.sql`. Add at the end of the attendance policies section:

```sql
-- institution_off_days policies (added 2026-03-20)
ALTER TABLE institution_off_days ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated users in the institution can read off days
-- Faculty need this to exclude holidays from their pending attendance view
CREATE POLICY "institution_off_days_select"
  ON institution_off_days FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- INSERT/UPDATE/DELETE: Institution admins and super_admin only
CREATE POLICY "institution_off_days_write"
  ON institution_off_days FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access
      WHERE user_id = auth.uid()
        AND institution_id = institution_off_days.institution_id
        AND access_type = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );
```

- [ ] **Step 3: Run the migration in Supabase**

Open the Supabase dashboard SQL editor and execute both SQL blocks above. Verify the table appears in Table Editor with zero rows and the index is created.

- [ ] **Step 4: Commit**

```bash
git add supabase/setup/01_tables.sql supabase/setup/03_policies.sql
git commit -m "feat(pending-attendance): add institution_off_days table with RLS policies"
```

---

## Task 3: Service Layer — 4 Changes

**Files:**
- Modify: `lib/services/academic/attendance-dashboard-service.ts`

Read the file first — specifically the `getTodayPendingAttendance` method (around line 448). Identify:
1. Where the dates array is generated (the `for` loop building date strings)
2. Where timetables are fetched from Supabase
3. Where pending periods are pushed to the result array
4. Where `metadata` is returned

- [ ] **Step 1: Change 1 — Weekend skip**

After the date array generation loop (the loop that pushes `d.toISOString().split('T')[0]` into `dates`), add:

```typescript
// Skip weekends — pending periods on Sat/Sun are not expected
const weekdayDates = dates.filter(date => {
  const day = new Date(date + 'T00:00:00').getDay()
  return day !== 0 && day !== 6  // 0 = Sunday, 6 = Saturday
})
```

Then replace all subsequent uses of `dates` with `weekdayDates` (or rename the variable). The `student_attendance` query that uses `.in('attendance_date', dates)` must use `weekdayDates` instead.

- [ ] **Step 2: Change 2 — Institution off days**

After the weekend filter (after `weekdayDates` is defined), add the off-days query. This goes BEFORE the main timetables fetch:

```typescript
// Exclude institution off days (holidays, exam days, etc.)
let effectiveDates = weekdayDates
if (effectiveInstitutionId) {
  const { data: offDays } = await this.supabase
    .from('institution_off_days')
    .select('off_date')
    .eq('institution_id', effectiveInstitutionId)
    .gte('off_date', queryStartDate)
    .lte('off_date', queryEndDate)

  if (offDays && offDays.length > 0) {
    const offDaySet = new Set(offDays.map((d: { off_date: string }) => d.off_date))
    effectiveDates = weekdayDates.filter(d => !offDaySet.has(d))
  }
}
```

Then replace all uses of `weekdayDates` (or `dates`) after this point with `effectiveDates`.

- [ ] **Step 3: Change 3 — Timetable ID filter**

After the timetables are fetched from Supabase and stored in `timetablesData`, add:

```typescript
// Apply timetable-specific filter if requested
if (filters.timetableId) {
  timetablesData = timetablesData.filter((t: any) => t.id === filters.timetableId)
}
```

- [ ] **Step 4: Change 4a — Add `course_id` to pending period construction**

In the section that constructs each pending period object (the object pushed into `pendingPeriods`), find where `course_name` is set and add `course_id` alongside it:

```typescript
course_id: slot.course_id || '',     // ADD THIS — retain for metadata aggregation
course_name: courseInfo?.course_name || slot.course_id || 'Unknown Course',
```

- [ ] **Step 5: Change 4b — Add aggregate counters**

Before the loop that pushes pending periods (the `pendingPeriods.push(period)` line), declare these sets and counters. **Do NOT redeclare `today`** — it is already declared earlier in the method. Only add the Sets and counters:

```typescript
const sectionSet = new Set<string>()
const courseSet  = new Set<string>()
const staffSet   = new Set<string>()
let overdueCount = 0
let todayCount   = 0
// Note: 'today' is already declared earlier in getTodayPendingAttendance — do not redeclare it
```

Immediately AFTER each `pendingPeriods.push(period)` call, add:

```typescript
sectionSet.add(period.section_id)
courseSet.add(period.course_id)
period.assigned_staff?.forEach((s: any) => staffSet.add(s.staff_id))
if (period.attendance_date < today) overdueCount++
if (period.attendance_date === today) todayCount++
```

- [ ] **Step 6: Change 4c — Return enriched metadata**

Find the `return` statement at the end of `getTodayPendingAttendance` that returns `{ data, metadata }`. Extend the `metadata` object:

```typescript
metadata: {
  total: totalCount,
  page: filters.page || 1,
  limit: pageLimit,
  totalPages: Math.ceil(totalCount / pageLimit),
  overdueCount,
  todayCount,
  sectionsCount: sectionSet.size,
  subjectsCount: courseSet.size,
  staffCount: staffSet.size,
}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd D:/Projects/MyJKKN && npx tsc --noEmit 2>&1 | head -30
```
Expected: zero new errors.

- [ ] **Step 8: Commit**

```bash
git add lib/services/academic/attendance-dashboard-service.ts
git commit -m "feat(pending-attendance): extend service with weekend skip, off-days, timetable filter, enriched metadata"
```

---

## Task 4: React Query Hook

**Files:**
- New: `hooks/academic/use-pending-attendance-date-range.ts`

Read `hooks/academic/use-attendance-dashboard.ts` first — specifically the `usePendingAttendance` hook (lines 73–116) to understand the exact pattern to follow.

- [ ] **Step 1: Create the hook file**

Create `hooks/academic/use-pending-attendance-date-range.ts`:

```typescript
// No 'use client' directive — hook files do not need it in Next.js App Router.
// Only component files (TSX with JSX) need 'use client'.
// Reference: existing hooks/academic/use-attendance-dashboard.ts has no such directive.

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AttendanceDashboardService } from '@/lib/services/academic/attendance-dashboard-service'
import type { DashboardFilters, PendingAttendanceResponse } from '@/types/attendance-dashboard'

function getTodayString(): string {
  return new Date().toISOString().split('T')[0]
}

function getSevenDaysAgoString(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().split('T')[0]
}

const DEFAULT_FILTERS: DashboardFilters = {
  startDate: getSevenDaysAgoString(),
  endDate: getTodayString(),
  sortBy: 'attendance_date',
  sortDirection: 'desc',
  page: 1,
  limit: 10,
}

export function usePendingAttendanceDateRange(
  userInstitutionId: string | undefined,
  isSuperAdmin: boolean
) {
  const [filters, setFilters] = useState<DashboardFilters>({
    ...DEFAULT_FILTERS,
    userInstitutionId,
  })

  const { data, isLoading, isError, refetch } = useQuery<PendingAttendanceResponse>({
    queryKey: ['pending-attendance-date-range', filters],
    queryFn: () => AttendanceDashboardService.getTodayPendingAttendance(filters),
    // Super Admin can load without an institution selected; others require institution
    enabled: isSuperAdmin ? true : !!userInstitutionId,
    staleTime: 2 * 60 * 1000,   // 2 minutes — same as usePendingAttendance
    refetchInterval: 2 * 60 * 1000,
  })

  const updateFilters = useCallback((updates: Partial<DashboardFilters>) => {
    setFilters(prev => ({ ...prev, ...updates, page: 1 }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters({
      ...DEFAULT_FILTERS,
      userInstitutionId,
    })
  }, [userInstitutionId])

  const setPage = useCallback((page: number) => {
    setFilters(prev => ({ ...prev, page }))
  }, [])

  const setPageSize = useCallback((limit: number) => {
    setFilters(prev => ({ ...prev, limit, page: 1 }))
  }, [])

  // Compute day difference for warning banner
  const dayRange = filters.startDate && filters.endDate
    ? Math.ceil(
        (new Date(filters.endDate).getTime() - new Date(filters.startDate).getTime())
        / (1000 * 60 * 60 * 24)
      )
    : 7

  return {
    data: data?.data ?? [],
    metadata: data?.metadata,
    filters,
    isLoading,
    isError,
    dayRange,
    showRangeWarning: dayRange > 30,
    updateFilters,
    resetFilters,
    setPage,
    setPageSize,
    refetch,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd D:/Projects/MyJKKN && npx tsc --noEmit 2>&1 | head -30
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/academic/use-pending-attendance-date-range.ts
git commit -m "feat(pending-attendance): add usePendingAttendanceDateRange hook with 7-day default"
```

---

## Task 5: Warning Banner Component

**Files:**
- New: `app/(routes)/academic/attendance/pending/_components/pending-date-range-warning-banner.tsx`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p "D:/Projects/MyJKKN/app/(routes)/academic/attendance/pending/_components"
```

- [ ] **Step 2: Create the warning banner**

Create `app/(routes)/academic/attendance/pending/_components/pending-date-range-warning-banner.tsx`:

```typescript
'use client'

import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface PendingDateRangeWarningBannerProps {
  dayRange: number
}

export function PendingDateRangeWarningBanner({ dayRange }: PendingDateRangeWarningBannerProps) {
  if (dayRange <= 30) return null

  return (
    <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800">
      <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
      <AlertDescription className="text-yellow-800 dark:text-yellow-300">
        Showing <strong>{dayRange} days</strong> of data. Large date ranges may be slow for institutions with many timetables. Consider narrowing your filters.
      </AlertDescription>
    </Alert>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/academic/attendance/pending/_components/pending-date-range-warning-banner.tsx"
git commit -m "feat(pending-attendance): add date range warning banner component"
```

---

## Task 6: Statistics Cards Component

**Files:**
- New: `app/(routes)/academic/attendance/pending/_components/pending-stats-cards.tsx`

Read `app/(routes)/academic/attendance/dashboard/_components/pending-statistics-cards.tsx` to understand the exact `StatCard` pattern used there. Mirror it precisely.

- [ ] **Step 1: Create the stats cards component**

Create `app/(routes)/academic/attendance/pending/_components/pending-stats-cards.tsx`:

```typescript
'use client'

import { CalendarX, AlertTriangle, Clock, GraduationCap, BookOpen, Users, CalendarRange } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface PendingStatsCardsProps {
  metadata: {
    total: number
    overdueCount: number
    todayCount: number
    sectionsCount: number
    subjectsCount: number
    staffCount: number
  } | undefined
  isFaculty: boolean
  dateRangeLabel?: string   // e.g. "14 Mar – 20 Mar" — shown for faculty instead of overdue/staff cards
  isLoading?: boolean
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  colorClass,
  isLoading,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  subtitle: string
  colorClass: string
  isLoading?: boolean
}) {
  return (
    <Card className={`${colorClass} border`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {isLoading ? (
              <div className="h-8 w-16 animate-pulse rounded bg-muted mt-1" />
            ) : (
              <p className="text-2xl font-bold">{value}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <Icon className="h-8 w-8 text-muted-foreground/50" />
        </div>
      </CardContent>
    </Card>
  )
}

export function PendingStatsCards({
  metadata,
  isFaculty,
  dateRangeLabel,
  isLoading,
}: PendingStatsCardsProps) {
  const gridClass = isFaculty
    ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4'
    : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4'

  return (
    <div className={gridClass}>
      <StatCard
        icon={CalendarX}
        label="Total Pending"
        value={metadata?.total ?? 0}
        subtitle="In selected range"
        colorClass="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
        isLoading={isLoading}
      />

      {!isFaculty && (
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={metadata?.overdueCount ?? 0}
          subtitle="Not marked on time"
          colorClass="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
          isLoading={isLoading}
        />
      )}

      <StatCard
        icon={Clock}
        label="Due Today"
        value={metadata?.todayCount ?? 0}
        subtitle="Mark before day ends"
        colorClass="bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800"
        isLoading={isLoading}
      />

      <StatCard
        icon={GraduationCap}
        label="Sections Affected"
        value={metadata?.sectionsCount ?? 0}
        subtitle="With pending periods"
        colorClass=""
        isLoading={isLoading}
      />

      <StatCard
        icon={BookOpen}
        label="Subjects Affected"
        value={metadata?.subjectsCount ?? 0}
        subtitle="Courses pending"
        colorClass=""
        isLoading={isLoading}
      />

      {isFaculty ? (
        <StatCard
          icon={CalendarRange}
          label="Date Range"
          value={dateRangeLabel ?? '—'}
          subtitle="Active filter period"
          colorClass=""
          isLoading={isLoading}
        />
      ) : (
        <StatCard
          icon={Users}
          label="Staff With Pending"
          value={metadata?.staffCount ?? 0}
          subtitle="Facilitators pending"
          colorClass=""
          isLoading={isLoading}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(routes)/academic/attendance/pending/_components/pending-stats-cards.tsx"
git commit -m "feat(pending-attendance): add statistics cards component"
```

---

## Task 7: Date Range Filter Component

**Files:**
- New: `app/(routes)/academic/attendance/pending/_components/pending-date-range-filters.tsx`

Read `app/(routes)/academic/attendance/dashboard/_components/pending-attendance-hierarchy-filters.tsx` in full — the new component follows the same collapsible Card pattern, same cascade logic, same active-filter-count badge. The difference is: date range pickers replace the single date picker, and a timetable selector is added at the end.

- [ ] **Step 1: Create the filter component**

Create `app/(routes)/academic/attendance/pending/_components/pending-date-range-filters.tsx`.

The component structure mirrors `pending-attendance-hierarchy-filters.tsx` exactly. Key differences:

1. **Props** — accepts `startDate`/`endDate` instead of `attendanceDate`, plus `timetableId` and `onTimetableChange`
2. **Date inputs** — two `<Input type="date" />` fields ("From" and "To") instead of one calendar popover
3. **Quick buttons** — "Today" and "Last 7 Days" buttons that set the date range
4. **Timetable selector** — a `<Select>` at the end of Row 3, populated by timetables filtered by current hierarchy selection (for admin/HOD) or by faculty assignments (for faculty)
5. **Active filter count** — counts all non-default active filters including timetable

```typescript
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, RotateCcw, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DashboardFilters } from '@/types/attendance-dashboard'

// Re-use the same hierarchy data hooks used in the dashboard filter
import { useInstitutionsWithAccess } from '@/hooks/use-institutions-with-access'
import { useDegrees } from '@/hooks/use-degrees'
import { useDepartments } from '@/hooks/use-departments'
import { usePrograms } from '@/hooks/use-programs'
import { useSemesters } from '@/hooks/use-semesters'
import { useSections } from '@/hooks/use-sections'
import { useAcademicYears } from '@/hooks/use-academic-years'

interface PendingDateRangeFiltersProps {
  filters: DashboardFilters
  onFiltersChange: (updates: Partial<DashboardFilters>) => void
  onReset: () => void
  isSuperAdmin: boolean
  isHOD: boolean
  isFaculty: boolean
  lockedInstitutionId?: string
  lockedDepartmentId?: string
  // Timetables list for dropdown (fetched by parent or here)
  timetables?: Array<{ id: string; timetable_name: string; academic_year_name?: string }>
}

function getTodayString() {
  return new Date().toISOString().split('T')[0]
}

function getSevenDaysAgoString() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().split('T')[0]
}

export function PendingDateRangeFilters({
  filters,
  onFiltersChange,
  onReset,
  isSuperAdmin,
  isHOD,
  isFaculty,
  lockedInstitutionId,
  lockedDepartmentId,
  timetables = [],
}: PendingDateRangeFiltersProps) {
  const [isOpen, setIsOpen] = useState(true)

  const today = getTodayString()
  const effectiveInstitutionId = lockedInstitutionId || filters.institutionId

  // Hierarchy data hooks
  const { institutions } = useInstitutionsWithAccess()
  const { degrees } = useDegrees(effectiveInstitutionId)
  const { departments } = useDepartments(effectiveInstitutionId, filters.degreeId)
  const { programs } = usePrograms(effectiveInstitutionId, filters.degreeId, filters.departmentId)
  const { semesters } = useSemesters(effectiveInstitutionId, filters.degreeId, filters.departmentId, filters.programId)
  const { sections } = useSections(effectiveInstitutionId, filters.degreeId, filters.departmentId, filters.programId, filters.semesterId)
  const { academicYears } = useAcademicYears(effectiveInstitutionId)

  // Count active filters (exclude institution for non-super-admin, exclude defaults)
  const activeCount = [
    isSuperAdmin && filters.institutionId,
    filters.academicYearId,
    filters.degreeId,
    filters.departmentId,
    filters.programId,
    filters.semesterId,
    filters.sectionId,
    filters.timetableId,
    !isFaculty && filters.staffId,
  ].filter(Boolean).length

  function handleParentChange(field: keyof DashboardFilters, value: string | undefined) {
    // Clear all children downstream when parent changes
    const clearMap: Record<string, (keyof DashboardFilters)[]> = {
      institutionId: ['academicYearId', 'degreeId', 'departmentId', 'programId', 'semesterId', 'sectionId', 'timetableId'],
      academicYearId: ['degreeId', 'departmentId', 'programId', 'semesterId', 'sectionId', 'timetableId'],
      degreeId: ['departmentId', 'programId', 'semesterId', 'sectionId', 'timetableId'],
      departmentId: ['programId', 'semesterId', 'sectionId', 'timetableId'],
      programId: ['semesterId', 'sectionId', 'timetableId'],
      semesterId: ['sectionId', 'timetableId'],
      sectionId: ['timetableId'],
    }
    const clears = clearMap[field] ?? []
    const updates: Partial<DashboardFilters> = { [field]: value || undefined }
    clears.forEach(k => { updates[k] = undefined })
    onFiltersChange(updates)
  }

  return (
    <Card>
      <CardHeader className="pb-0">
        <button
          type="button"
          onClick={() => setIsOpen(v => !v)}
          className="flex w-full items-center justify-between py-2"
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filter Criteria</span>
            {activeCount > 0 && (
              <Badge variant="secondary" className="text-xs">{activeCount} active</Badge>
            )}
          </div>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </CardHeader>

      {isOpen && (
        <CardContent className="pt-4 space-y-4">
          {/* Row 1: Date range + Institution (admin) + Academic Year */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                value={filters.startDate ?? getSevenDaysAgoString()}
                max={filters.endDate ?? today}
                onChange={e => onFiltersChange({ startDate: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                value={filters.endDate ?? today}
                max={today}
                min={filters.startDate}
                onChange={e => onFiltersChange({ endDate: e.target.value })}
              />
            </div>

            {isSuperAdmin && (
              <div className="space-y-1">
                <Label className="text-xs">Institution</Label>
                <Select
                  value={filters.institutionId ?? ''}
                  onValueChange={v => handleParentChange('institutionId', v || undefined)}
                >
                  <SelectTrigger><SelectValue placeholder="All institutions" /></SelectTrigger>
                  <SelectContent>
                    {institutions?.map(i => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Academic Year</Label>
              <Select
                value={filters.academicYearId ?? ''}
                onValueChange={v => handleParentChange('academicYearId', v || undefined)}
                disabled={!effectiveInstitutionId && !isSuperAdmin}
              >
                <SelectTrigger><SelectValue placeholder="All years" /></SelectTrigger>
                <SelectContent>
                  {academicYears?.map(y => (
                    <SelectItem key={y.id} value={y.id}>{y.academic_year_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quick date buttons */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onFiltersChange({ startDate: today, endDate: today })}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onFiltersChange({ startDate: getSevenDaysAgoString(), endDate: today })}
            >
              Last 7 Days
            </Button>
          </div>

          {/* Row 2: Hierarchy filters (hidden for faculty) */}
          {!isFaculty && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Degree</Label>
                <Select
                  value={filters.degreeId ?? ''}
                  onValueChange={v => handleParentChange('degreeId', v || undefined)}
                  disabled={!effectiveInstitutionId}
                >
                  <SelectTrigger><SelectValue placeholder="All degrees" /></SelectTrigger>
                  <SelectContent>
                    {degrees?.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.degree_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Department</Label>
                <Select
                  value={filters.departmentId ?? (lockedDepartmentId ?? '')}
                  onValueChange={v => handleParentChange('departmentId', v || undefined)}
                  disabled={isHOD || !filters.degreeId}
                >
                  <SelectTrigger><SelectValue placeholder={isHOD ? 'Your department' : 'All departments'} /></SelectTrigger>
                  <SelectContent>
                    {departments?.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.department_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Program</Label>
                <Select
                  value={filters.programId ?? ''}
                  onValueChange={v => handleParentChange('programId', v || undefined)}
                  disabled={!filters.departmentId && !lockedDepartmentId}
                >
                  <SelectTrigger><SelectValue placeholder="All programs" /></SelectTrigger>
                  <SelectContent>
                    {programs?.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Semester</Label>
                <Select
                  value={filters.semesterId ?? ''}
                  onValueChange={v => handleParentChange('semesterId', v || undefined)}
                  disabled={!filters.programId}
                >
                  <SelectTrigger><SelectValue placeholder="All semesters" /></SelectTrigger>
                  <SelectContent>
                    {semesters?.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.semester_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Section</Label>
                <Select
                  value={filters.sectionId ?? ''}
                  onValueChange={v => handleParentChange('sectionId', v || undefined)}
                  disabled={!filters.semesterId}
                >
                  <SelectTrigger><SelectValue placeholder="All sections" /></SelectTrigger>
                  <SelectContent>
                    {sections?.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.section_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Row 3: Timetable (all roles) + Staff (admin/HOD only) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Timetable</Label>
              <Select
                value={filters.timetableId ?? ''}
                onValueChange={v => onFiltersChange({ timetableId: v || undefined })}
              >
                <SelectTrigger><SelectValue placeholder="All timetables" /></SelectTrigger>
                <SelectContent>
                  {timetables.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.timetable_name}
                      {t.academic_year_name && (
                        <span className="text-muted-foreground ml-1">({t.academic_year_name})</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isFaculty && (
              <div className="space-y-1">
                <Label className="text-xs">Staff / Facilitator</Label>
                <Select
                  value={filters.staffId ?? ''}
                  onValueChange={v => onFiltersChange({ staffId: v || undefined })}
                >
                  <SelectTrigger><SelectValue placeholder="All staff" /></SelectTrigger>
                  <SelectContent>
                    {/* Staff list populated from timetables data in parent */}
                    <SelectItem value="">All staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Reset */}
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={onReset} className="gap-1">
              <RotateCcw className="h-3 w-3" />
              Reset All
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
```

> **Note to implementor:** The `timetables` prop is fetched in the parent `pending-attendance-client.tsx`. For faculty, query timetables where `staff_ids` contains the faculty's staff ID. For admin/HOD, query timetables filtered by current institution + academic year selection. Use a simple Supabase query with `.select('id, timetable_name, academic_years(academic_year_name)')`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd D:/Projects/MyJKKN && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/academic/attendance/pending/_components/pending-date-range-filters.tsx"
git commit -m "feat(pending-attendance): add date range filter component with hierarchy cascade"
```

---

## Task 8: Main Client Component

**Files:**
- New: `app/(routes)/academic/attendance/pending/_components/pending-attendance-client.tsx`

Read `app/(routes)/academic/attendance/dashboard/_components/pending-attendance-tab.tsx` (or the pending tab content file) to understand how the existing columns, table, and mark-attendance navigation are wired. The new client component follows the same pattern.

- [ ] **Step 0: Read the existing columns file before writing the client component**

Open `app/(routes)/academic/attendance/dashboard/_components/pending-attendance-columns.tsx` and note:
- The **exact export name** of the columns factory function (it is `createColumns`, not `getPendingAttendanceColumns`)
- The **exact argument signature** — `createColumns(canViewAllInstitutions, onSendReminder, onMarkAttendance)` — three positional arguments, not a props object
- The **exact URL** used when navigating to mark attendance — copy it character-for-character; it routes to `/academic/attendance/mark` (not `/academic/attendance`)

Use what you find. If the signature differs from what is shown below, adapt accordingly.

- [ ] **Step 1: Create the client component**

Create `app/(routes)/academic/attendance/pending/_components/pending-attendance-client.tsx`:

```typescript
'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2 } from 'lucide-react'

import { usePendingAttendanceDateRange } from '@/hooks/academic/use-pending-attendance-date-range'
import { usePermissions } from '@/hooks/use-permissions'

import { PendingStatsCards } from './pending-stats-cards'
import { PendingDateRangeFilters } from './pending-date-range-filters'
import { PendingDateRangeWarningBanner } from './pending-date-range-warning-banner'

// IMPORTANT: The actual export is `createColumns` — verify the exact name and signature
// by reading pending-attendance-columns.tsx before using it here.
import { createColumns } from '@/app/(routes)/academic/attendance/dashboard/_components/pending-attendance-columns'
import { DataTable } from '@/components/data-table/data-table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { PendingAttendancePeriod } from '@/types/attendance-dashboard'

interface PendingAttendanceClientProps {
  userInstitutionId: string | undefined
  isSuperAdmin: boolean
  isHOD: boolean
  isFaculty: boolean
  lockedDepartmentId?: string
  staffId?: string   // for faculty — used to scope timetable list
}

export function PendingAttendanceClient({
  userInstitutionId,
  isSuperAdmin,
  isHOD,
  isFaculty,
  lockedDepartmentId,
  staffId,
}: PendingAttendanceClientProps) {
  const router = useRouter()
  const { canAccess } = usePermissions()
  const canSendReminders = canAccess('academic.attendance', 'manage') && !isFaculty

  const {
    data,
    metadata,
    filters,
    isLoading,
    isError,
    dayRange,
    showRangeWarning,
    updateFilters,
    resetFilters,
    setPage,
    setPageSize,
    refetch,
  } = usePendingAttendanceDateRange(userInstitutionId, isSuperAdmin)

  // Build mark-attendance URL — routes to /academic/attendance/mark (not /academic/attendance)
  // Copy the exact URLSearchParams keys from the dashboard pending tab's mark navigation
  function handleMarkAttendance(period: PendingAttendancePeriod) {
    const params = new URLSearchParams({
      periodId: period.period_id,
      timetableId: period.timetable_id,
      sectionId: period.section_id,
      date: period.attendance_date,
      periodName: period.period_name,
      courseName: period.course_name,
      startTime: period.start_time,
      endTime: period.end_time,
    })
    router.push(`/academic/attendance/mark?${params.toString()}`)
  }

  function handleSendReminder(period: PendingAttendancePeriod) {
    // Phase 1 stub — Phase 2 wires to notification service
    toast.success(`Reminder sent to ${period.primary_staff_name}`)
  }

  function handleBulkReminder(selected: PendingAttendancePeriod[]) {
    const staffNames = [...new Set(selected.map(p => p.primary_staff_name))].join(', ')
    toast.success(`Reminders sent to: ${staffNames}`)
  }

  // IMPORTANT: Use the actual export name and positional argument signature from
  // pending-attendance-columns.tsx (verified in Step 0 above).
  // The signature is: createColumns(canViewAllInstitutions, onSendReminder, onMarkAttendance)
  const columns = useMemo(() =>
    createColumns(
      isSuperAdmin,                  // canViewAllInstitutions
      canSendReminders ? handleSendReminder : undefined,
      handleMarkAttendance,
    ),
    [isSuperAdmin, canSendReminders]
  )

  // Date range label for faculty card
  const dateRangeLabel = filters.startDate && filters.endDate
    ? `${new Date(filters.startDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(filters.endDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : '—'

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <PendingStatsCards
        metadata={metadata}
        isFaculty={isFaculty}
        dateRangeLabel={dateRangeLabel}
        isLoading={isLoading}
      />

      {/* Range warning */}
      <PendingDateRangeWarningBanner dayRange={dayRange} />

      {/* Filters */}
      <PendingDateRangeFilters
        filters={filters}
        onFiltersChange={updateFilters}
        onReset={resetFilters}
        isSuperAdmin={isSuperAdmin}
        isHOD={isHOD}
        isFaculty={isFaculty}
        lockedInstitutionId={!isSuperAdmin ? userInstitutionId : undefined}
        lockedDepartmentId={lockedDepartmentId}
        timetables={[]}  // TODO: wire timetable list query here
      />

      {/* Error state */}
      {isError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            Failed to load pending attendance.
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {!isLoading && !isError && data.length === 0 && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-lg font-semibold text-green-700 dark:text-green-400">All caught up!</p>
            <p className="text-sm text-muted-foreground">No pending attendance for the selected range.</p>
          </CardContent>
        </Card>
      )}

      {/* Data table */}
      {(isLoading || data.length > 0) && (
        <DataTable
          columns={columns}
          data={data}
          isLoading={isLoading}
          pagination={{
            page: filters.page ?? 1,
            pageSize: filters.limit ?? 10,
            total: metadata?.total ?? 0,
            onPageChange: setPage,
            onPageSizeChange: setPageSize,
          }}
          bulkActions={canSendReminders ? [
            {
              label: 'Send Reminder to Staff',
              onClick: handleBulkReminder,
            }
          ] : undefined}
        />
      )}
    </div>
  )
}
```

> **Note to implementor:** The `getPendingAttendanceColumns` function may not yet accept `onMarkAttendance`/`onSendReminder` as constructor props in the existing dashboard. Check the actual signature in `pending-attendance-columns.tsx` and adapt the call to match — pass callbacks in whatever way the existing columns file expects them (likely via column meta or a closure pattern).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd D:/Projects/MyJKKN && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/academic/attendance/pending/_components/pending-attendance-client.tsx"
git commit -m "feat(pending-attendance): add main client component wiring hook, filters, table"
```

---

## Task 8b: Timetable List Hook (Required for Filter Dropdown)

**Files:**
- New: `hooks/academic/use-timetables-for-pending.ts`

The filter component's timetable dropdown receives a `timetables` prop. Without this hook the dropdown is always empty — the filter is broken for all roles. This task wires the real data.

- [ ] **Step 1: Create the hook**

Create `hooks/academic/use-timetables-for-pending.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { createClientSupabaseClient } from '@/lib/supabase/client'

interface TimetableOption {
  id: string
  timetable_name: string
  academic_year_name?: string
}

interface UseTimetablesForPendingParams {
  institutionId?: string
  academicYearId?: string
  sectionId?: string
  staffId?: string        // when provided, filters to timetables where this staff is assigned
  enabled?: boolean
}

export function useTimetablesForPending({
  institutionId,
  academicYearId,
  sectionId,
  staffId,
  enabled = true,
}: UseTimetablesForPendingParams) {
  const supabase = createClientSupabaseClient()

  return useQuery<TimetableOption[]>({
    queryKey: ['timetables-for-pending', institutionId, academicYearId, sectionId, staffId],
    queryFn: async () => {
      let query = supabase
        .from('timetables')
        .select(`
          id,
          timetable_name,
          timetable_data,
          staff_ids,
          academic_years(academic_year_name)
        `)
        .eq('is_active', true)

      if (institutionId) query = query.eq('institution_id', institutionId)
      if (academicYearId) query = query.eq('academic_year_id', academicYearId)
      if (sectionId) query = query.eq('section_id', sectionId)

      const { data, error } = await query.order('timetable_name')
      if (error) throw error

      let timetables = data ?? []

      // For faculty: filter to timetables where their staffId appears in timetable_data
      // The timetable_data JSONB contains staff_ids arrays per slot — use a simpler check:
      // query timetable_slot_continuity table for the staff's timetable assignments
      if (staffId) {
        // Use the existing slot continuity table which tracks staff-timetable assignments
        const { data: slots } = await supabase
          .from('timetable_slot_continuity')
          .select('timetable_id')
          .eq('staff_id', staffId)

        const assignedTimetableIds = new Set(slots?.map(s => s.timetable_id) ?? [])
        timetables = timetables.filter(t => assignedTimetableIds.has(t.id))
      }

      return timetables.map(t => ({
        id: t.id,
        timetable_name: t.timetable_name,
        academic_year_name: (t.academic_years as any)?.academic_year_name,
      }))
    },
    enabled: enabled && (!!institutionId || !!staffId),
    staleTime: 5 * 60 * 1000,
  })
}
```

- [ ] **Step 2: Wire the hook into `pending-attendance-client.tsx`**

In `pending-attendance-client.tsx`, add the hook call and pass its result to the filter:

```typescript
import { useTimetablesForPending } from '@/hooks/academic/use-timetables-for-pending'

// Inside PendingAttendanceClient, after the usePendingAttendanceDateRange call:
const { data: timetableOptions = [] } = useTimetablesForPending({
  institutionId: isSuperAdmin ? filters.institutionId : userInstitutionId,
  academicYearId: filters.academicYearId,
  sectionId: filters.sectionId,
  staffId: isFaculty ? staffId : undefined,
  enabled: isSuperAdmin ? true : !!userInstitutionId,
})

// Then update the PendingDateRangeFilters usage — replace timetables={[]} with:
// timetables={timetableOptions}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd D:/Projects/MyJKKN && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add hooks/academic/use-timetables-for-pending.ts \
  "app/(routes)/academic/attendance/pending/_components/pending-attendance-client.tsx"
git commit -m "feat(pending-attendance): add timetable list hook and wire filter dropdown"
```

---

## Task 9: Page Shell

**Files:**
- New: `app/(routes)/academic/attendance/pending/page.tsx`

Read `app/(routes)/academic/attendance/dashboard/page.tsx` for the exact pattern of: ContentLayout, Breadcrumb, PermissionGuard, auth extraction, and role detection.

- [ ] **Step 1: Create the page**

Create `app/(routes)/academic/attendance/pending/page.tsx`:

```typescript
import { ContentLayout } from '@/components/admin-panel/content-layout'
import { PermissionGuard } from '@/components/permission-guard'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PendingAttendanceClient } from './_components/pending-attendance-client'

export default async function PendingAttendancePage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch profile for role and institution — same pattern as dashboard page
  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select('role, institution_id, department_id')
        .eq('id', user.id)
        .single()
    : { data: null }

  const isSuperAdmin = profile?.role === 'super_admin'
  const isHOD = profile?.role === 'hod'
  const isFaculty = profile?.role === 'faculty'
  const userInstitutionId = profile?.institution_id ?? undefined
  const lockedDepartmentId = isHOD ? (profile?.department_id ?? undefined) : undefined

  // Resolve staff ID for faculty (needed for timetable scoping)
  let staffId: string | undefined
  if (isFaculty && user) {
    const { data: staffRow } = await supabase
      .from('staff')
      .select('id')
      .eq('institution_email', user.email)
      .single()
    staffId = staffRow?.id
  }

  return (
    <PermissionGuard module="academic.attendance" action="dashboard.view">
      <ContentLayout title="Pending Attendance">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/academic">Academic</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/academic/attendance/dashboard">Attendance</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Pending Attendance</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mt-6 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Pending Attendance</h1>
          <p className="text-muted-foreground text-sm">
            Unmarked periods across your selected date range
          </p>
        </div>

        <div className="mt-6">
          <PendingAttendanceClient
            userInstitutionId={userInstitutionId}
            isSuperAdmin={isSuperAdmin}
            isHOD={isHOD}
            isFaculty={isFaculty}
            lockedDepartmentId={lockedDepartmentId}
            staffId={staffId}
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles and dev server starts without errors**

```bash
cd D:/Projects/MyJKKN && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/academic/attendance/pending/page.tsx"
git commit -m "feat(pending-attendance): add page shell with server-side auth and role detection"
```

---

## Task 10: Navigation + Dashboard Link

**Files:**
- Modify: `lib/sidebarMenuLink.ts`
- Modify: Dashboard pending tab component (find the file containing the pending tab, likely inside `app/(routes)/academic/attendance/dashboard/_components/`)

- [ ] **Step 1: Add sidebar entry**

Open `lib/sidebarMenuLink.ts`. Find the attendance submenus array (around line 717). Add the new entry **between** "Attendance Dashboard" and "Mark Attendance":

```typescript
{
  href: '/academic/attendance/pending',
  label: 'Pending Attendance',
  active: pathname.startsWith('/academic/attendance/pending')
},
```

**Note:** There is no separate permissions map in `sidebarMenuLink.ts` — access is controlled by the `PermissionGuard` component in the page itself (already added in Task 9). No further changes to `sidebarMenuLink.ts` are needed beyond the submenu entry above.

- [ ] **Step 2: Add "View Full Pending History" link to dashboard pending tab**

Find the file that renders the pending attendance tab content in the dashboard (likely `pending-attendance-tab.tsx` or similar inside `app/(routes)/academic/attendance/dashboard/_components/`). At the bottom of the component, before the closing JSX, add:

```typescript
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

// At the bottom of the tab content:
<div className="flex justify-end mt-2">
  <Link
    href="/academic/attendance/pending"
    className="flex items-center gap-1 text-sm text-primary hover:underline"
  >
    View Full Pending History
    <ArrowRight className="h-3 w-3" />
  </Link>
</div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd D:/Projects/MyJKKN && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add lib/sidebarMenuLink.ts
git add "app/(routes)/academic/attendance/dashboard/_components/"
git commit -m "feat(pending-attendance): add sidebar nav entry and dashboard View All link"
```

---

## Task 11: Manual Verification Checklist

Start the dev server: `npm run dev`

Navigate to `http://localhost:3000/academic/attendance/pending`

- [ ] **As Super Admin:**
  - [ ] Page loads without errors
  - [ ] 6 stats cards visible
  - [ ] Filter panel shows Institution dropdown
  - [ ] Default date range is last 7 days
  - [ ] Data table loads pending periods
  - [ ] "Mark Attendance" row action navigates to `/academic/attendance` with correct URL params
  - [ ] Selecting >30 day range shows yellow warning banner
  - [ ] Weekends are absent from the Date column values
  - [ ] Empty state shows green "All caught up!" card when no results

- [ ] **As Faculty:**
  - [ ] Page loads
  - [ ] 5 stats cards visible (no Overdue or Staff With Pending cards)
  - [ ] Date Range card shows active filter period
  - [ ] Filter panel shows only Date Range + Academic Year + Timetable
  - [ ] No hierarchy (Degree/Dept/Program) filters visible
  - [ ] Only own timetable's periods appear in table
  - [ ] No "Send Reminder" in row actions dropdown

- [ ] **As HOD:**
  - [ ] Department filter is pre-filled and locked
  - [ ] Only department's sections appear in results
  - [ ] "Send Reminder" visible in row actions and bulk bar

- [ ] **Sidebar:**
  - [ ] "Pending Attendance" entry appears in sidebar under Attendance group
  - [ ] Active state highlights correctly when on the pending page

- [ ] **Dashboard:**
  - [ ] "View Full Pending History →" link appears at bottom of dashboard Pending tab
  - [ ] Clicking it navigates to `/academic/attendance/pending`

- [ ] **Final commit**

```bash
git add -A
git commit -m "feat(pending-attendance): complete implementation - standalone pending attendance page"
```

---

## Appendix: Key Patterns Reference

**Service method:** `lib/services/academic/attendance-dashboard-service.ts` → `getTodayPendingAttendance()`

**Existing hook to reference:** `hooks/academic/use-attendance-dashboard.ts` → `usePendingAttendance` (lines 73–116)

**Existing columns to reuse:** `app/(routes)/academic/attendance/dashboard/_components/pending-attendance-columns.tsx`

**Existing filter to reference:** `app/(routes)/academic/attendance/dashboard/_components/pending-attendance-hierarchy-filters.tsx`

**Existing stats cards to reference:** `app/(routes)/academic/attendance/dashboard/_components/pending-statistics-cards.tsx`

**Mark attendance URL params pattern:** Match exactly what the dashboard pending tab uses when calling `router.push` for mark attendance navigation.
