# Facilitator Attendance Report — Design Document

**Date:** 2026-03-06
**Module:** Academic > Attendance > Consolidation
**Status:** Approved — ready for implementation

---

## 1. Overview

A dedicated live dashboard page showing how many periods each facilitator has marked attendance for, with advanced visualization charts and department-level drilldown.

**Route:** `/attendance/consolidation/facilitators`

---

## 2. Design Decisions

| Question | Decision | Rationale |
|---|---|---|
| Core metric | Periods where `marked_by = staff_id` | Reliable, indexed column; no JSONB extraction needed |
| Architecture | Live page (not stored/generated report) | Faster UX, real-time filter interactions |
| Authorization | Custom permission via role assignment | Consistent with project permission system |
| Visualization | Full dashboard (table + 4 chart types) | Stakeholder requirement |

---

## 3. Permission

**Permission key:** `academic.attendance.facilitator-report.view`

Assigned manually via the role management UI. No code changes required to the role system — just register the key and assign to desired roles.

---

## 4. Data Layer

### 4.1 Supabase RPC Function

**Function:** `get_facilitator_attendance_stats`
**File:** `supabase/setup/02_functions.sql`

Parameters:
```
p_institution_id  UUID       -- required
p_date_from       DATE       -- required
p_date_to         DATE       -- required
p_department_id   UUID       -- optional filter
p_program_id      UUID       -- optional filter
p_semester_id     UUID       -- optional filter
p_facilitator_id  UUID       -- optional filter (single facilitator drilldown)
```

Returns JSONB with three keys:
- `summary` — institution-wide KPIs
- `facilitators` — per-facilitator stats with trend and daily data
- `department_breakdown` — aggregated by department for drilldown

### 4.2 Return Shape

```typescript
{
  summary: {
    total_facilitators: number,
    total_periods_marked: number,
    overall_marking_rate: number,   // percentage
    unmarked_periods: number
  },
  facilitators: [{
    staff_id, first_name, last_name,
    department_name, designation,
    periods_marked,                 // COUNT(student_attendance) WHERE marked_by = staff_id
    periods_scheduled,              // COUNT from timetable staff_ids[]
    marking_rate,                   // periods_marked / periods_scheduled * 100
    last_marked_at,
    trend_data: [{ week, count }],  // weekly for line chart
    daily_data: [{ date, count }]   // per-day for heatmap
  }],
  department_breakdown: [{
    department_id, department_name,
    facilitator_count, total_marked, avg_rate
  }]
}
```

### 4.3 SQL Files Updated
- `supabase/setup/02_functions.sql` — add RPC function
- `supabase/setup/03_policies.sql` — EXECUTE grant to `authenticated`
- `supabase/SQL_FILE_INDEX.md` — update index

### 4.4 TypeScript Types

Appended to `types/attendance.ts`:
```typescript
FacilitatorAttendanceStat
FacilitatorReportSummary
FacilitatorReportFilters
FacilitatorReportData
DepartmentBreakdown
```

---

## 5. Service Layer

**File:** `lib/services/academic/facilitator-attendance-service.ts`

Single static method:
```typescript
FacilitatorAttendanceService.getReport(institutionId, filters): Promise<FacilitatorReportData>
```

Calls the RPC function, throws on error.

---

## 6. React Query Hook

**File:** `hooks/academic/use-facilitator-attendance.ts`

```typescript
useFacilitatorAttendanceReport(institutionId, filters, enabled?)
```

- `queryKey`: `['facilitator-attendance-report', institutionId, filters]`
- `staleTime`: 5 minutes (live feel without hammering DB)
- `gcTime`: 10 minutes
- Auto-refetches when filters change

Filters default: current month date range, all departments/programs/semesters.

---

## 7. UI Structure

### 7.1 File Tree

```
app/(routes)/academic/attendance/consolidation/facilitators/
├── page.tsx
└── _components/
    ├── facilitator-filters.tsx
    ├── facilitator-summary-cards.tsx
    ├── facilitator-bar-chart.tsx
    ├── facilitator-pie-chart.tsx
    ├── facilitator-trend-chart.tsx
    ├── facilitator-heatmap.tsx
    ├── facilitator-data-table.tsx
    ├── facilitator-columns.tsx
    └── department-breakdown.tsx
```

### 7.2 Page Layout

**Desktop:** 2-column — sticky filter panel (left) + content area (right)
**Mobile:** Single column — filters in bottom sheet, charts stacked vertically, table as cards

### 7.3 Component Responsibilities

| Component | Responsibility |
|---|---|
| `page.tsx` | PermissionGuard, data fetch, loading/error states, prop distribution |
| `facilitator-filters.tsx` | Date range + cascading dropdowns (Dept→Program→Semester) + facilitator search |
| `facilitator-summary-cards.tsx` | 4 KPI cards: Total Facilitators, Periods Marked, Marking Rate %, Unmarked |
| `facilitator-bar-chart.tsx` | Horizontal grouped bar: scheduled vs marked per facilitator (top 20) |
| `facilitator-pie-chart.tsx` | Donut chart: institution-wide marked vs unmarked with center % label |
| `facilitator-trend-chart.tsx` | Line chart: weekly marking trend (max 6 series or institution avg) |
| `facilitator-heatmap.tsx` | Calendar heatmap: CSS grid, date × facilitator, intensity = periods count |
| `facilitator-data-table.tsx` | Sortable table with expandable rows showing per-facilitator trend + daily data |
| `facilitator-columns.tsx` | TanStack ColumnDef: Name, Dept, Designation, Marked, Scheduled, Rate%, Last Marked, Status |
| `department-breakdown.tsx` | Drilldown cards: dept name, facilitator count, total marked, avg rate |

### 7.4 Status Badge System (reuses existing colors)

| Rate | Badge | Color |
|---|---|---|
| ≥ 90% | Excellent | Green |
| ≥ 75% | Good | Blue |
| ≥ 60% | Fair | Yellow |
| < 60% | Needs Attention | Red |

---

## 8. Charts Detail

All charts use **recharts** (v2.15.4) with **shadcn `ChartContainer`** wrapper — already used in `attendance/dashboard/`.

### Chart 1 — Horizontal Bar (Periods Per Facilitator)
- Layout: vertical (names on Y-axis)
- Data: top 20 facilitators by `periodsMarked`
- Two bars per facilitator: scheduled (blue) + marked (green)
- Tooltip shows exact counts

### Chart 2 — Donut (Marked vs Unmarked)
- Institution-wide totals
- Center label: overall marking rate %
- Two segments: marked (green) + unmarked (red)

### Chart 3 — Line Trend (Weekly Activity)
- X-axis: week labels within date range
- Y-axis: period count
- Series: up to 6 facilitators (top 6 by count if unfiltered) OR institution average
- `type="monotone"` curve

### Chart 4 — Calendar Heatmap
- Implementation: CSS grid (not recharts — simpler, more performant, easier responsive)
- X-axis: dates in range
- Y-axis: top 20 facilitators
- Cell color: white (0 periods) → light green (1-2) → dark green (3+)
- Hover tooltip: exact count + facilitator name
- Mobile: horizontally scrollable, shows last 30 days regardless of date range selection

---

## 9. Navigation Entry Point

Add a **"Facilitator Report"** button/card to:
`app/(routes)/academic/attendance/consolidation/page.tsx`

Links to `/attendance/consolidation/facilitators`.
Visible only to users with `academic.attendance.facilitator-report.view` permission.

---

## 10. Known Limitations (Documented)

1. **Substitute scenario:** If Faculty A marks attendance on behalf of Faculty B (absent), the period credits Faculty A. This is inherent to using `marked_by` as the metric. No substitute-tracking table exists in the current schema.
2. **Chart readability cap:** Bar chart and heatmap show top 20 facilitators maximum. The data table shows all.
3. **Line chart series cap:** Maximum 6 facilitator lines on trend chart. Beyond that, only institution average is shown.
4. **JSONB `periods_scheduled`:** Counting scheduled periods requires JSONB extraction from `timetables.timetable_data` — this is used for the marking rate calculation but may have edge cases with older timetable formats. The primary metric (`periods_marked`) is not affected.

---

## 11. Files Modified / Created

### New Files
- `app/(routes)/academic/attendance/consolidation/facilitators/page.tsx`
- `app/(routes)/academic/attendance/consolidation/facilitators/_components/` (9 components)
- `lib/services/academic/facilitator-attendance-service.ts`
- `hooks/academic/use-facilitator-attendance.ts`

### Modified Files
- `supabase/setup/02_functions.sql` — add RPC
- `supabase/setup/03_policies.sql` — add EXECUTE policy
- `supabase/SQL_FILE_INDEX.md` — update index
- `types/attendance.ts` — append new types
- `app/(routes)/academic/attendance/consolidation/page.tsx` — add navigation entry
