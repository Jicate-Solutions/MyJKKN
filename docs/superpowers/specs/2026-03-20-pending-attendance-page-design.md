# Pending Attendance Page — Design Spec

**Date:** 2026-03-20
**Module:** Academic → Attendance
**Route:** `/academic/attendance/pending`
**Status:** Approved for implementation

---

## 1. Overview

A dedicated standalone page showing all unmarked (pending) attendance periods from a configurable date range up to today. Replaces the need for faculty and administrators to rely solely on the "Pending" tab in the attendance dashboard, which is scoped to today only.

### Goals
- Give faculty a full backlog view of periods they haven't marked, with academic year and timetable filters
- Give HOD/Principal a department or institution-wide pending overview
- Give Super Admin a cross-institution view with full hierarchy filters
- Surface overdue periods (past date, not marked) prominently

### Non-Goals
- Inline attendance marking (navigation to existing `/mark` page is sufficient)
- Real-time push notifications (Phase 2)
- PostgreSQL RPC optimization (Phase 2 — current in-memory approach is adequate with 30-day range cap)

---

## 2. Relationship to Existing Pages

| Page | Scope | Purpose |
|------|-------|---------|
| Dashboard → Pending tab | Today only | Quick "what do I need to mark right now" |
| **New: /pending** | Last 7 days default, configurable | Full backlog with date range, history, overdue view |
| Consolidation → Facilitators | Historical analysis | Who has been marking, performance trends |
| /mark | Single period | Actually marking student attendance |

The dashboard Pending tab is **not removed** — it is simplified to today-only with a "View Full Pending History →" link to the new page.

---

## 3. Role-Based Access

Reuses permission: `academic.attendance.dashboard.view`

| Role | Data Scope | Filters Available |
|------|-----------|-------------------|
| Super Admin | All institutions | Institution + full hierarchy + timetable + staff + date range |
| Principal / Admin | Own institution | Full hierarchy below institution + timetable + staff + date range |
| HOD | Own institution + own department only | Hierarchy below department + timetable + staff + date range |
| Faculty | Own timetable assignments only | Academic year + timetable + date range |

---

## 4. Page Layout

```
┌─────────────────────────────────────────────────────────┐
│  Breadcrumb: Academic / Attendance / Pending Attendance  │
│  Header: "Pending Attendance"                           │
│  Subtitle: "Unmarked periods across selected date range" │
├─────────────────────────────────────────────────────────┤
│  Statistics Cards (6 cards for admin, 5 for faculty)    │
├─────────────────────────────────────────────────────────┤
│  [!] Warning banner (shown when range > 30 days)        │
├─────────────────────────────────────────────────────────┤
│  Collapsible Filter Card                                │
│  ├── Date range (From / To) + quick buttons             │
│  ├── Hierarchy filters (role-dependent)                 │
│  └── Active filter badges below card                   │
├─────────────────────────────────────────────────────────┤
│  Data Table (pending periods, paginated)                │
│  └── Row action: Mark Attendance → /mark page           │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Filter System

### Date Range
- **Default:** Last 7 days (`today - 7` to `today`)
- **Quick buttons:** "Today", "Last 7 Days" (default), custom date picker
- **Future dates:** Disabled
- **Warning:** Yellow banner (`pending-date-range-warning-banner.tsx`) when range > 30 days — *"Showing more than 30 days may be slow for large institutions. Consider narrowing your filters."*
- **Weekend handling:** Saturdays and Sundays automatically excluded from results (no toggle needed)
- **Off days:** Institution off days (from `institution_off_days` table) excluded silently from results

### Filter Layout by Role

**Super Admin:**
```
Row 1: [Date From] [Date To]       [Institution]    [Academic Year]
Row 2: [Degree]    [Department]    [Program]        [Semester]    [Section]
Row 3: [Timetable] [Staff]
```

**HOD / Principal / Admin:**
```
Row 1: [Date From] [Date To]       [Academic Year]
Row 2: [Degree]    [Department*]   [Program]        [Semester]    [Section]
Row 3: [Timetable] [Staff]
```
*Department pre-filled and locked for HOD

**Faculty:**
```
Row 1: [Date From] [Date To]       [Academic Year]
Row 2: [Timetable] (scoped to faculty's own assignments only)
```

### Timetable Filter — Server-Side Behaviour
The `timetableId` filter is added to `DashboardFilters` and applied in the service. When set:
- The service filters timetables to only the selected `timetable_id` before iterating slots
- Faculty timetable dropdown shows only timetables where they appear as `primary_staff_id` or in `staff_ids[]`, grouped by academic year name
- Admin/HOD timetable dropdown shows all timetables matching currently selected hierarchy filters

### Cascade Logic
Changing a parent filter clears all children downstream:
```
Institution → Academic Year → Degree → Department → Program → Semester → Section → Timetable
```

### Active Filter Badges
Displayed below the filter card as dismissable badges with "Reset All" button.

---

## 6. Statistics Cards

**Admin/HOD/Super Admin:** 6 cards — `grid-cols-2 md:grid-cols-3 lg:grid-cols-6`
**Faculty:** 5 cards — `grid-cols-2 md:grid-cols-3 lg:grid-cols-5`

Values derived from service metadata — no extra API call.

| # | Label | Icon | Color | Value | Shown To |
|---|-------|------|-------|-------|---------|
| 1 | Total Pending | `CalendarX` | blue/default | Total pending periods in range | All |
| 2 | Overdue | `AlertTriangle` | destructive/red | Periods with `date < today` | Admin/HOD/Super Admin only |
| 3 | Due Today | `Clock` | warning/yellow | Periods with `date === today` | All |
| 4 | Sections Affected | `GraduationCap` | secondary | Unique section count | All |
| 5 | Subjects Affected | `BookOpen` | secondary | Unique course count | All |
| 6 | Staff With Pending | `Users` | secondary | Unique staff count | Admin/HOD/Super Admin only |

For **faculty role**: cards 2 (Overdue) and 6 (Staff With Pending) are replaced by a single **"Date Range"** card showing the active filter period (e.g., "14 Mar – 20 Mar"). Grid becomes `lg:grid-cols-5`.

---

## 7. Data Table

### Column Implementation Note
The new page **reuses and extends** the existing `pending-attendance-columns.tsx` from the dashboard. The existing column file combines Institution+Degree into one column and Department+Semester+Section into another. The new page adapts this same pattern — no new column definitions from scratch. Column visibility flags are passed as props matching the existing `canViewAllInstitutions` / `canViewInstitution` pattern.

### Columns

| Column | Width | Visible To | Content |
|--------|-------|-----------|---------|
| Select checkbox | 40px | All | Multi-row selection |
| Date | 140px | All | Date (DD MMM YYYY) + day name |
| Period & Time | 180px | All | Period name + time range |
| Course | 200px | All | Course name + code badge |
| Institution & Degree | 220px | Super Admin only | 2-line stacked (existing combined column) |
| Degree | 160px | Non-super-admin Admin/HOD | Degree name (existing pattern) |
| Dept / Sem / Section | 250px | All | 2-line stacked (existing combined column) |
| Academic Year | 130px | All | Academic year name |
| Timetable | 160px | Admin / HOD / Super Admin | Timetable name |
| Assigned Staff | 200px | Admin / HOD / Super Admin | Primary staff + overflow badge + tooltip |
| Status | 110px | All | `Overdue` (red) or `Pending` (yellow) badge |
| Actions | 60px | All | Dropdown menu |

### Status Badge Logic
```typescript
date < today   → "Overdue"  (destructive badge)
date === today → "Pending"  (warning badge)
```

### Sorting
Default: `sortBy: 'attendance_date'`, `sortDirection: 'desc'` (most overdue first).
The new hook must explicitly set these defaults — do NOT inherit from `useAttendanceDashboard` which defaults to `sortBy: 'period_name', sortDirection: 'asc'`.

Also sortable by: Period, Course, Academic Year.

### Pagination
10 / 25 / 50 rows per page. Existing `DataTable` + `Pagination` components.

### Row Actions (per-row dropdown — all roles)
```
✏  Mark Attendance   → /academic/attendance/mark?periodId=...&timetableId=...&date=...&...
👁  View Timetable    → timetable detail page
📩  Send Reminder    → (Admin/HOD only in dropdown; hidden for faculty)
```
Per-row "Send Reminder" is kept, scoped to Admin/HOD only. URL params for Mark Attendance match the existing dashboard pending tab navigation pattern exactly.

### Bulk Action Bar (Admin / HOD only)
Appears when ≥1 row selected. Faculty do not see this bar.
```
[N periods selected]  [Send Reminder to Staff]  [Clear Selection]
```
Both per-row and bulk "Send Reminder" are stubbed for Phase 1 — show success toast only. Phase 2 wires to notification system.

### Empty States
- No pending periods: Green checkmark card — *"All caught up! No pending attendance for the selected range."*
- Filters too narrow: *"No results match your filters. Try adjusting the date range or filters."*
- Loading: Skeleton rows (existing `LoadingSkeleton` component)
- Error: Alert with retry button

---

## 8. Service Layer Changes

### File: `lib/services/academic/attendance-dashboard-service.ts`

Four focused changes to the existing `getTodayPendingAttendance()` method:

#### Change 1 — Weekend Skip
```typescript
const dates = generatedDates.filter(date => {
  const day = new Date(date + 'T00:00:00').getDay()
  return day !== 0 && day !== 6  // exclude Sunday (0) and Saturday (6)
})
```

#### Change 2 — Institution Off Days
```typescript
const { data: offDays } = await supabase
  .from('institution_off_days')
  .select('off_date')
  .eq('institution_id', effectiveInstitutionId)
  .gte('off_date', queryStartDate)
  .lte('off_date', queryEndDate)

const offDaySet = new Set(offDays?.map(d => d.off_date) ?? [])
const filteredDates = dates.filter(d => !offDaySet.has(d))
```
Note: If `effectiveInstitutionId` is null (Super Admin with no institution selected), skip the off-days query and use all filtered dates.

#### Change 3 — Timetable ID Filter
```typescript
// Add to DashboardFilters type:
timetableId?: string

// In service, after fetching timetables:
if (filters.timetableId) {
  timetablesData = timetablesData.filter(t => t.id === filters.timetableId)
}
```

#### Change 4 — Enriched Metadata + `course_id` in `PendingAttendancePeriod`
Add `course_id` to `PendingAttendancePeriod` (it is already available as `slot.course_id` during construction — it was previously discarded after name resolution):

```typescript
// In PendingAttendancePeriod type — add:
course_id: string   // NEW — slot.course_id, retained alongside course_name

// In service pending-period construction — add:
course_id: slot.course_id,

// Aggregate counters during the pending push loop:
const sectionSet = new Set<string>()
const courseSet  = new Set<string>()
const staffSet   = new Set<string>()
let overdueCount = 0
let todayCount   = 0

sectionSet.add(period.section_id)
courseSet.add(period.course_id)
period.assigned_staff.forEach(s => staffSet.add(s.staff_id))
if (period.attendance_date < today) overdueCount++
if (period.attendance_date === today) todayCount++

// Return in metadata:
metadata: {
  total, page, limit, totalPages,
  overdueCount,
  todayCount,
  sectionsCount: sectionSet.size,
  subjectsCount: courseSet.size,
  staffCount:    staffSet.size,
}
```

### Type Changes: `types/attendance-dashboard.ts`

```typescript
// 1. Add course_id to PendingAttendancePeriod:
export interface PendingAttendancePeriod {
  // ... existing fields ...
  course_id: string        // NEW
  course_name: string
  course_code?: string
  // ... rest of existing fields ...
}

// 2. Add timetableId to DashboardFilters:
export interface DashboardFilters {
  // ... existing fields ...
  timetableId?: string     // NEW — server-side timetable filter
}

// 3. Extend PendingAttendanceResponse metadata:
metadata: {
  total: number
  page: number
  limit: number
  totalPages: number
  overdueCount: number      // NEW
  todayCount: number        // NEW
  sectionsCount: number     // NEW
  subjectsCount: number     // NEW
  staffCount: number        // NEW
}
```

### Hook: `hooks/academic/use-pending-attendance-date-range.ts`
Wraps `getTodayPendingAttendance` with extended `DashboardFilters`. Key differences from `useAttendanceDashboard`:
- Default filter state: `{ startDate: today-7, endDate: today, sortBy: 'attendance_date', sortDirection: 'desc' }`
- `enabled` condition: always `true` for Super Admin (no institution required to load page); `!!userInstitutionId` for other roles
- React Query key includes full filter object for proper cache invalidation

---

## 9. Database Migration

### Table (add to `supabase/setup/01_tables.sql`)

```sql
-- Updated: 2026-03-20 — Added institution_off_days for pending attendance filtering
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

### RLS Policies (add to `supabase/setup/03_policies.sql`)

```sql
-- SELECT: All authenticated users may read off days for their own institution
-- (faculty need this to exclude off days from their pending periods view)
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

---

## 10. Navigation

### `lib/sidebarMenuLink.ts`
Add entry to Attendance group, between Dashboard and Attendance (mark page):
```typescript
{
  label: "Pending Attendance",
  href: "/academic/attendance/pending",
  icon: CalendarX,
  permission: "academic.attendance.dashboard.view",
}
```

### Dashboard Pending Tab
Add "View Full Pending History →" link at the bottom of the pending tab, pointing to `/academic/attendance/pending`.

---

## 11. Files Touched

| Action | File |
|--------|------|
| New | `app/(routes)/academic/attendance/pending/page.tsx` |
| New | `app/(routes)/academic/attendance/pending/_components/pending-attendance-client.tsx` |
| New | `app/(routes)/academic/attendance/pending/_components/pending-date-range-filters.tsx` |
| New | `app/(routes)/academic/attendance/pending/_components/pending-date-range-warning-banner.tsx` |
| New | `hooks/academic/use-pending-attendance-date-range.ts` |
| Modify | `lib/services/academic/attendance-dashboard-service.ts` (4 focused changes) |
| Modify | `lib/sidebarMenuLink.ts` (1 entry) |
| Modify | `app/(routes)/academic/attendance/dashboard/_components/` (pending tab — add "View all" link) |
| Modify | `supabase/setup/01_tables.sql` (`institution_off_days` table) |
| Modify | `supabase/setup/03_policies.sql` (RLS for `institution_off_days`) |
| Modify | `types/attendance-dashboard.ts` (`course_id`, `timetableId`, enriched metadata) |

---

## 12. Out of Scope (Phase 2)

- PostgreSQL RPC function to push JSONB parsing to database
- Real-time notification/reminder system wiring
- Institution off-days management UI (admins manage via Supabase dashboard for now)
- Cancelled period status tracking in `timetable_data`
- Substitute/cover tracking in `student_attendance`
