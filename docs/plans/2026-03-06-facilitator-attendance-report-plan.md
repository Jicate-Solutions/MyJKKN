# Facilitator Attendance Report — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a live dashboard page at `/attendance/consolidation/facilitators` showing how many periods each facilitator has marked attendance for, with bar/line/pie charts and a calendar heatmap.

**Architecture:** Single Supabase RPC aggregates all data server-side; one React Query hook feeds all charts and table client-side; no stored report generation — pure live query with 5-minute cache.

**Tech Stack:** Next.js 15 App Router, Supabase RPC, TanStack React Query, recharts + shadcn ChartContainer, TanStack Table, date-fns, Tailwind CSS, PermissionGuard.

**Design doc:** `docs/plans/2026-03-06-facilitator-attendance-report-design.md`

---

## Task 1: Supabase RPC Function

**Files:**
- Modify: `supabase/setup/02_functions.sql` (append at end)
- Modify: `supabase/setup/03_policies.sql` (append at end)
- Modify: `supabase/SQL_FILE_INDEX.md` (update entry)

**Step 1: Append the RPC function to `supabase/setup/02_functions.sql`**

Add at the very end of the file:

```sql
-- ============================================================
-- Updated: 2026-03-06 - Add facilitator attendance stats RPC
-- Purpose: Aggregates periods marked per facilitator for live dashboard
-- ============================================================
CREATE OR REPLACE FUNCTION get_facilitator_attendance_stats(
  p_institution_id  UUID,
  p_date_from       DATE,
  p_date_to         DATE,
  p_department_id   UUID DEFAULT NULL,
  p_program_id      UUID DEFAULT NULL,
  p_semester_id     UUID DEFAULT NULL,
  p_facilitator_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH attendance_counts AS (
    -- Count periods marked per staff member within date range
    SELECT
      sa.marked_by,
      COUNT(*)                 AS periods_marked,
      MAX(sa.attendance_date)  AS last_marked_at
    FROM student_attendance sa
    WHERE sa.institution_id = p_institution_id
      AND sa.attendance_date BETWEEN p_date_from AND p_date_to
      AND (p_facilitator_id IS NULL OR sa.marked_by = p_facilitator_id)
    GROUP BY sa.marked_by
  ),
  staff_stats AS (
    -- Join counts with staff + department info; filter by department/program if provided
    SELECT
      s.id                              AS staff_id,
      s.first_name,
      s.last_name,
      COALESCE(s.designation, '')       AS designation,
      COALESCE(d.name, 'Unknown')       AS department_name,
      s.department_id,
      COALESCE(ac.periods_marked, 0)    AS periods_marked,
      ac.last_marked_at
    FROM staff s
    LEFT JOIN departments d ON s.department_id = d.id
    INNER JOIN attendance_counts ac ON s.id = ac.marked_by
    WHERE s.institution_id = p_institution_id
      AND s.is_active = true
      AND (p_department_id IS NULL OR s.department_id = p_department_id)
  ),
  weekly_counts AS (
    -- Weekly aggregates per staff (for line trend chart)
    SELECT
      sa.marked_by,
      date_trunc('week', sa.attendance_date)::DATE AS week_start,
      COUNT(*)                                      AS week_count
    FROM student_attendance sa
    WHERE sa.institution_id = p_institution_id
      AND sa.attendance_date BETWEEN p_date_from AND p_date_to
      AND (p_facilitator_id IS NULL OR sa.marked_by = p_facilitator_id)
    GROUP BY sa.marked_by, date_trunc('week', sa.attendance_date)
  ),
  daily_counts AS (
    -- Daily aggregates per staff (for calendar heatmap)
    SELECT
      sa.marked_by,
      sa.attendance_date,
      COUNT(*) AS day_count
    FROM student_attendance sa
    WHERE sa.institution_id = p_institution_id
      AND sa.attendance_date BETWEEN p_date_from AND p_date_to
      AND (p_facilitator_id IS NULL OR sa.marked_by = p_facilitator_id)
    GROUP BY sa.marked_by, sa.attendance_date
  ),
  aggregated AS (
    SELECT
      jsonb_build_object(
        'summary', jsonb_build_object(
          'total_facilitators',          COUNT(*)::INT,
          'total_periods_marked',        SUM(ss.periods_marked)::INT,
          'avg_periods_per_facilitator', ROUND(AVG(ss.periods_marked), 1)
        ),
        'facilitators', jsonb_agg(
          jsonb_build_object(
            'staff_id',       ss.staff_id,
            'first_name',     ss.first_name,
            'last_name',      ss.last_name,
            'designation',    ss.designation,
            'department_name', ss.department_name,
            'department_id',  ss.department_id,
            'periods_marked', ss.periods_marked,
            'last_marked_at', ss.last_marked_at,
            'trend_data', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object('week', wc.week_start, 'count', wc.week_count)
                ORDER BY wc.week_start
              )
              FROM weekly_counts wc
              WHERE wc.marked_by = ss.staff_id
            ), '[]'::JSONB),
            'daily_data', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object('date', dc.attendance_date, 'count', dc.day_count)
                ORDER BY dc.attendance_date
              )
              FROM daily_counts dc
              WHERE dc.marked_by = ss.staff_id
            ), '[]'::JSONB)
          )
          ORDER BY ss.periods_marked DESC
        ),
        'department_breakdown', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'department_id',    dept_grp.department_id,
              'department_name',  dept_grp.department_name,
              'facilitator_count', dept_grp.fac_count,
              'total_marked',     dept_grp.total,
              'avg_rate',         dept_grp.avg_rate
            )
            ORDER BY dept_grp.total DESC
          ), '[]'::JSONB)
          FROM (
            SELECT
              ss2.department_id,
              ss2.department_name,
              COUNT(*)::INT                         AS fac_count,
              SUM(ss2.periods_marked)::INT          AS total,
              ROUND(AVG(ss2.periods_marked), 1)     AS avg_rate
            FROM staff_stats ss2
            GROUP BY ss2.department_id, ss2.department_name
          ) dept_grp
        )
      ) AS result
    FROM staff_stats ss
  )
  SELECT result INTO v_result FROM aggregated;

  RETURN COALESCE(v_result, jsonb_build_object(
    'summary', jsonb_build_object(
      'total_facilitators', 0,
      'total_periods_marked', 0,
      'avg_periods_per_facilitator', 0
    ),
    'facilitators', '[]'::JSONB,
    'department_breakdown', '[]'::JSONB
  ));
END;
$$;
```

**Step 2: Append the EXECUTE policy to `supabase/setup/03_policies.sql`**

```sql
-- Updated: 2026-03-06 - Grant execute on facilitator attendance stats RPC
GRANT EXECUTE ON FUNCTION get_facilitator_attendance_stats(UUID, DATE, DATE, UUID, UUID, UUID, UUID)
  TO authenticated;
```

**Step 3: Test the function in Supabase SQL Editor**

Run this test query (replace UUIDs with real values from your institution):
```sql
SELECT get_facilitator_attendance_stats(
  'your-institution-uuid'::UUID,
  '2026-01-01'::DATE,
  '2026-03-06'::DATE,
  NULL, NULL, NULL, NULL
);
```

Expected: JSONB with `summary`, `facilitators` array, `department_breakdown` array. If `facilitators` is an empty array, verify `student_attendance.marked_by` values match `staff.id` values.

**Step 4: Update `supabase/SQL_FILE_INDEX.md`**

Add under the `02_functions.sql` section:
```
- get_facilitator_attendance_stats(p_institution_id, p_date_from, p_date_to, p_department_id?, p_program_id?, p_semester_id?, p_facilitator_id?) → JSONB
  Added: 2026-03-06 | Aggregates periods marked per facilitator for live dashboard
```

**Step 5: Commit**

```bash
git add supabase/setup/02_functions.sql supabase/setup/03_policies.sql supabase/SQL_FILE_INDEX.md
git commit -m "feat(attendance): add get_facilitator_attendance_stats RPC function"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `types/attendance.ts` (append at end)

**Step 1: Append to `types/attendance.ts`**

```typescript
// ============================================================
// Facilitator Attendance Report Types
// Added: 2026-03-06
// ============================================================

export interface FacilitatorTrendPoint {
  week: string; // ISO date string (week start)
  count: number;
}

export interface FacilitatorDailyPoint {
  date: string; // ISO date string YYYY-MM-DD
  count: number;
}

export interface FacilitatorAttendanceStat {
  staffId: string;
  firstName: string;
  lastName: string;
  designation: string;
  departmentName: string;
  departmentId: string;
  periodsMarked: number;
  lastMarkedAt: string | null;
  trendData: FacilitatorTrendPoint[];
  dailyData: FacilitatorDailyPoint[];
}

export interface FacilitatorReportSummary {
  totalFacilitators: number;
  totalPeriodsMarked: number;
  avgPeriodsPerFacilitator: number;
}

export interface FacilitatorDepartmentBreakdown {
  departmentId: string;
  departmentName: string;
  facilitatorCount: number;
  totalMarked: number;
  avgRate: number;
}

export interface FacilitatorReportFilters {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  departmentId?: string;
  programId?: string;
  semesterId?: string;
  facilitatorId?: string;
}

export interface FacilitatorReportData {
  summary: FacilitatorReportSummary;
  facilitators: FacilitatorAttendanceStat[];
  departmentBreakdown: FacilitatorDepartmentBreakdown[];
}

// Raw shape returned from RPC (snake_case) — mapped in service layer
export interface FacilitatorReportRaw {
  summary: {
    total_facilitators: number;
    total_periods_marked: number;
    avg_periods_per_facilitator: number;
  };
  facilitators: Array<{
    staff_id: string;
    first_name: string;
    last_name: string;
    designation: string;
    department_name: string;
    department_id: string;
    periods_marked: number;
    last_marked_at: string | null;
    trend_data: Array<{ week: string; count: number }>;
    daily_data: Array<{ date: string; count: number }>;
  }>;
  department_breakdown: Array<{
    department_id: string;
    department_name: string;
    facilitator_count: number;
    total_marked: number;
    avg_rate: number;
  }>;
}
```

**Step 2: Commit**

```bash
git add types/attendance.ts
git commit -m "feat(attendance): add facilitator report TypeScript types"
```

---

## Task 3: Service Layer

**Files:**
- Create: `lib/services/academic/facilitator-attendance-service.ts`

**Step 1: Create the service file**

```typescript
// lib/services/academic/facilitator-attendance-service.ts
// Created: 2026-03-06

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  FacilitatorReportFilters,
  FacilitatorReportData,
  FacilitatorReportRaw,
} from '@/types/attendance';

export class FacilitatorAttendanceService {
  static async getReport(
    institutionId: string,
    filters: FacilitatorReportFilters
  ): Promise<FacilitatorReportData> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase.rpc(
      'get_facilitator_attendance_stats',
      {
        p_institution_id:  institutionId,
        p_date_from:       filters.dateFrom,
        p_date_to:         filters.dateTo,
        p_department_id:   filters.departmentId   ?? null,
        p_program_id:      filters.programId      ?? null,
        p_semester_id:     filters.semesterId     ?? null,
        p_facilitator_id:  filters.facilitatorId  ?? null,
      }
    );

    if (error) throw new Error(error.message);

    const raw = data as FacilitatorReportRaw;

    // Map snake_case RPC response to camelCase TS types
    return {
      summary: {
        totalFacilitators:        raw.summary.total_facilitators,
        totalPeriodsMarked:       raw.summary.total_periods_marked,
        avgPeriodsPerFacilitator: raw.summary.avg_periods_per_facilitator,
      },
      facilitators: (raw.facilitators ?? []).map((f) => ({
        staffId:        f.staff_id,
        firstName:      f.first_name,
        lastName:       f.last_name,
        designation:    f.designation,
        departmentName: f.department_name,
        departmentId:   f.department_id,
        periodsMarked:  f.periods_marked,
        lastMarkedAt:   f.last_marked_at,
        trendData:      (f.trend_data ?? []).map((t) => ({
          week:  t.week,
          count: t.count,
        })),
        dailyData: (f.daily_data ?? []).map((d) => ({
          date:  d.date,
          count: d.count,
        })),
      })),
      departmentBreakdown: (raw.department_breakdown ?? []).map((d) => ({
        departmentId:    d.department_id,
        departmentName:  d.department_name,
        facilitatorCount: d.facilitator_count,
        totalMarked:     d.total_marked,
        avgRate:         d.avg_rate,
      })),
    };
  }
}
```

**Step 2: Verify `createClientSupabaseClient` import path**

Check that this import exists and works:
```bash
grep -r "createClientSupabaseClient" lib/supabase/ --include="*.ts" -l
```
Expected: finds a file like `lib/supabase/client.ts`. If the function name differs, adjust the import in the service.

**Step 3: Commit**

```bash
git add lib/services/academic/facilitator-attendance-service.ts
git commit -m "feat(attendance): add FacilitatorAttendanceService"
```

---

## Task 4: React Query Hook

**Files:**
- Create: `hooks/academic/use-facilitator-attendance.ts`

**Step 1: Create the hook file**

```typescript
// hooks/academic/use-facilitator-attendance.ts
// Created: 2026-03-06

import { useQuery } from '@tanstack/react-query';
import { FacilitatorAttendanceService } from '@/lib/services/academic/facilitator-attendance-service';
import type { FacilitatorReportFilters } from '@/types/attendance';

const QUERY_KEYS = {
  all: ['facilitator-attendance-report'] as const,
  report: (institutionId: string, filters: FacilitatorReportFilters) =>
    [...QUERY_KEYS.all, institutionId, filters] as const,
};

export function useFacilitatorAttendanceReport(
  institutionId: string | null | undefined,
  filters: FacilitatorReportFilters,
  enabled = true
) {
  return useQuery({
    queryKey: QUERY_KEYS.report(institutionId ?? '', filters),
    queryFn: () =>
      FacilitatorAttendanceService.getReport(institutionId!, filters),
    enabled: enabled && !!institutionId,
    staleTime: 5 * 60 * 1000,  // 5 minutes — live feel without hammering DB
    gcTime: 10 * 60 * 1000,
  });
}
```

**Step 2: Commit**

```bash
git add hooks/academic/use-facilitator-attendance.ts
git commit -m "feat(attendance): add useFacilitatorAttendanceReport hook"
```

---

## Task 5: Summary Cards Component

**Files:**
- Create: `app/(routes)/academic/attendance/consolidation/facilitators/_components/facilitator-summary-cards.tsx`

**Step 1: Create the component**

```tsx
// facilitator-summary-cards.tsx
'use client';

import { Users, BookOpen, TrendingUp, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { FacilitatorReportSummary } from '@/types/attendance';

interface Props {
  summary: FacilitatorReportSummary;
}

export function FacilitatorSummaryCards({ summary }: Props) {
  const cards = [
    {
      title: 'Total Facilitators',
      value: summary.totalFacilitators,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      title: 'Periods Marked',
      value: summary.totalPeriodsMarked,
      icon: BookOpen,
      color: 'text-green-600',
      bg: 'bg-green-50 dark:bg-green-950',
    },
    {
      title: 'Avg Periods / Facilitator',
      value: summary.avgPeriodsPerFacilitator,
      icon: TrendingUp,
      color: 'text-purple-600',
      bg: 'bg-purple-50 dark:bg-purple-950',
    },
    {
      title: 'Departments Active',
      value: '—',  // filled by parent if needed; placeholder
      icon: AlertCircle,
      color: 'text-orange-600',
      bg: 'bg-orange-50 dark:bg-orange-950',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="flex items-center gap-4 p-6">
            <div className={`rounded-full p-3 ${card.bg}`}>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{card.title}</p>
              <p className="text-2xl font-bold">{card.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

> Note: The 4th card "Departments Active" — pass `departmentBreakdown.length` from the page as a prop if you want it live. For now it shows `—` as a placeholder you can wire up.

**Step 2: Update the component to accept `departmentCount` prop**

Replace the 4th card value:
```tsx
// Add to Props interface:
interface Props {
  summary: FacilitatorReportSummary;
  departmentCount: number;
}

// Replace the 4th card value:
{ title: 'Departments Active', value: departmentCount, ... }
```

---

## Task 6: Filters Component

**Files:**
- Create: `app/(routes)/academic/attendance/consolidation/facilitators/_components/facilitator-filters.tsx`

**Step 1: Create the filters component**

```tsx
// facilitator-filters.tsx
'use client';

import { format } from 'date-fns';
import { CalendarIcon, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { FacilitatorReportFilters } from '@/types/attendance';

interface Department { id: string; name: string; }

interface Props {
  filters: FacilitatorReportFilters;
  departments: Department[];
  onFiltersChange: (filters: FacilitatorReportFilters) => void;
  onFacilitatorSearch: (query: string) => void;
  facilitatorSearchQuery: string;
}

export function FacilitatorFilters({
  filters,
  departments,
  onFiltersChange,
  onFacilitatorSearch,
  facilitatorSearchQuery,
}: Props) {
  const setFilter = <K extends keyof FacilitatorReportFilters>(
    key: K,
    value: FacilitatorReportFilters[K]
  ) => onFiltersChange({ ...filters, [key]: value });

  return (
    <div className="space-y-4">
      {/* Date Range */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Date Range
        </Label>
        <div className="flex flex-col gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start text-left font-normal w-full">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.dateFrom ? format(new Date(filters.dateFrom), 'MMM d, yyyy') : 'Start date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dateFrom ? new Date(filters.dateFrom) : undefined}
                onSelect={(d) => d && setFilter('dateFrom', format(d, 'yyyy-MM-dd'))}
                disabled={(d) => d > new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start text-left font-normal w-full">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.dateTo ? format(new Date(filters.dateTo), 'MMM d, yyyy') : 'End date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dateTo ? new Date(filters.dateTo) : undefined}
                onSelect={(d) => d && setFilter('dateTo', format(d, 'yyyy-MM-dd'))}
                disabled={(d) => d > new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Department */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Department
        </Label>
        <Select
          value={filters.departmentId ?? 'all'}
          onValueChange={(v) => setFilter('departmentId', v === 'all' ? undefined : v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Facilitator search (client-side filter of table) */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Search Facilitator
        </Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Name or designation..."
            value={facilitatorSearchQuery}
            onChange={(e) => onFacilitatorSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
    </div>
  );
}
```

---

## Task 7: Bar Chart Component

**Files:**
- Create: `app/(routes)/academic/attendance/consolidation/facilitators/_components/facilitator-bar-chart.tsx`

**Step 1: Create the component**

```tsx
// facilitator-bar-chart.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
} from 'recharts';
import type { FacilitatorAttendanceStat } from '@/types/attendance';

interface Props {
  facilitators: FacilitatorAttendanceStat[];
}

const chartConfig = {
  periodsMarked: { label: 'Periods Marked', color: 'hsl(var(--chart-1))' },
};

export function FacilitatorBarChart({ facilitators }: Props) {
  // Top 20 by periods marked
  const data = facilitators.slice(0, 20).map((f) => ({
    name: `${f.firstName} ${f.lastName}`,
    periodsMarked: f.periodsMarked,
  }));

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Periods Marked per Facilitator</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No data for selected filters
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Periods Marked per Facilitator</CardTitle>
        <p className="text-xs text-muted-foreground">Top {data.length} facilitators</p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis
              dataKey="name"
              type="category"
              width={120}
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="periodsMarked" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={`hsl(${142 + i * 3}, 60%, ${45 + (i % 3) * 5}%)`}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
```

---

## Task 8: Pie Chart Component

**Files:**
- Create: `app/(routes)/academic/attendance/consolidation/facilitators/_components/facilitator-pie-chart.tsx`

**Step 1: Create the component**

```tsx
// facilitator-pie-chart.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { PieChart, Pie, Cell } from 'recharts';
import type { FacilitatorDepartmentBreakdown } from '@/types/attendance';

interface Props {
  departmentBreakdown: FacilitatorDepartmentBreakdown[];
}

const COLORS = [
  'hsl(142, 60%, 45%)',
  'hsl(210, 70%, 55%)',
  'hsl(260, 60%, 55%)',
  'hsl(35, 80%, 55%)',
  'hsl(0, 65%, 55%)',
  'hsl(180, 55%, 45%)',
];

export function FacilitatorPieChart({ departmentBreakdown }: Props) {
  const data = departmentBreakdown.map((d) => ({
    name: d.departmentName,
    value: d.totalMarked,
  }));

  const chartConfig = Object.fromEntries(
    data.map((d, i) => [
      d.name,
      { label: d.name, color: COLORS[i % COLORS.length] },
    ])
  );

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Periods by Department</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No data for selected filters
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Periods by Department</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
            <ChartLegend content={<ChartLegendContent nameKey="name" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
```

---

## Task 9: Trend Line Chart Component

**Files:**
- Create: `app/(routes)/academic/attendance/consolidation/facilitators/_components/facilitator-trend-chart.tsx`

**Step 1: Create the component**

```tsx
// facilitator-trend-chart.tsx
'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { FacilitatorAttendanceStat } from '@/types/attendance';

interface Props {
  facilitators: FacilitatorAttendanceStat[];
}

const LINE_COLORS = [
  'hsl(142, 60%, 45%)',
  'hsl(210, 70%, 55%)',
  'hsl(260, 60%, 55%)',
  'hsl(35, 80%, 55%)',
  'hsl(0, 65%, 55%)',
  'hsl(180, 55%, 45%)',
];

export function FacilitatorTrendChart({ facilitators }: Props) {
  // Show top 6 facilitators by total periods
  const topFacilitators = facilitators.slice(0, 6);

  const { chartData, chartConfig } = useMemo(() => {
    // Collect all unique week labels
    const allWeeks = new Set<string>();
    topFacilitators.forEach((f) =>
      f.trendData.forEach((t) => allWeeks.add(t.week))
    );
    const sortedWeeks = Array.from(allWeeks).sort();

    // Build row per week
    const rows = sortedWeeks.map((week) => {
      const row: Record<string, string | number> = {
        week: format(new Date(week), 'MMM d'),
      };
      topFacilitators.forEach((f) => {
        const key = `${f.firstName} ${f.lastName}`;
        const point = f.trendData.find((t) => t.week === week);
        row[key] = point?.count ?? 0;
      });
      return row;
    });

    const config = Object.fromEntries(
      topFacilitators.map((f, i) => [
        `${f.firstName} ${f.lastName}`,
        {
          label: `${f.firstName} ${f.lastName}`,
          color: LINE_COLORS[i],
        },
      ])
    );

    return { chartData: rows, chartConfig: config };
  }, [topFacilitators]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Weekly Marking Trend</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No trend data for selected filters
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Weekly Marking Trend</CardTitle>
        <p className="text-xs text-muted-foreground">
          Top {topFacilitators.length} facilitators by period count
        </p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {topFacilitators.map((f, i) => (
              <Line
                key={f.staffId}
                type="monotone"
                dataKey={`${f.firstName} ${f.lastName}`}
                stroke={LINE_COLORS[i]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
```

---

## Task 10: Calendar Heatmap Component

**Files:**
- Create: `app/(routes)/academic/attendance/consolidation/facilitators/_components/facilitator-heatmap.tsx`

**Step 1: Create the component (CSS grid approach — no recharts)**

```tsx
// facilitator-heatmap.tsx
'use client';

import { useMemo } from 'react';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { FacilitatorAttendanceStat } from '@/types/attendance';

interface Props {
  facilitators: FacilitatorAttendanceStat[];
  dateFrom: string;
  dateTo: string;
}

function getHeatColor(count: number): string {
  if (count === 0) return 'bg-muted';
  if (count === 1) return 'bg-green-200 dark:bg-green-900';
  if (count === 2) return 'bg-green-400 dark:bg-green-700';
  return 'bg-green-600 dark:bg-green-500';
}

export function FacilitatorHeatmap({ facilitators, dateFrom, dateTo }: Props) {
  // Show top 15 facilitators
  const topFacilitators = facilitators.slice(0, 15);

  const dates = useMemo(() => {
    try {
      return eachDayOfInterval({
        start: parseISO(dateFrom),
        end: parseISO(dateTo),
      });
    } catch {
      return [];
    }
  }, [dateFrom, dateTo]);

  // Build lookup: staffId → date → count
  const lookup = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    topFacilitators.forEach((f) => {
      const dayMap = new Map<string, number>();
      f.dailyData.forEach((d) => dayMap.set(d.date, d.count));
      map.set(f.staffId, dayMap);
    });
    return map;
  }, [topFacilitators]);

  if (topFacilitators.length === 0 || dates.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Period Marking Heatmap</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No data for selected filters
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Period Marking Heatmap</CardTitle>
        <p className="text-xs text-muted-foreground">
          Periods marked per day — top {topFacilitators.length} facilitators
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <TooltipProvider delayDuration={100}>
            <div className="min-w-max">
              {/* Date header row */}
              <div className="flex gap-0.5 mb-1 ml-32">
                {dates.map((date) => (
                  <div
                    key={date.toISOString()}
                    className="w-4 text-center text-[9px] text-muted-foreground"
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 40 }}
                  >
                    {format(date, 'd')}
                  </div>
                ))}
              </div>

              {/* Facilitator rows */}
              {topFacilitators.map((f) => (
                <div key={f.staffId} className="flex items-center gap-0.5 mb-0.5">
                  {/* Name label */}
                  <div className="w-32 text-xs text-right pr-2 text-muted-foreground truncate">
                    {f.firstName} {f.lastName}
                  </div>
                  {/* Day cells */}
                  {dates.map((date) => {
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const count = lookup.get(f.staffId)?.get(dateStr) ?? 0;
                    return (
                      <Tooltip key={dateStr}>
                        <TooltipTrigger asChild>
                          <div
                            className={`w-4 h-4 rounded-sm cursor-default ${getHeatColor(count)}`}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <p>{f.firstName} {f.lastName}</p>
                          <p>{format(date, 'MMM d, yyyy')}: <strong>{count} periods</strong></p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              ))}

              {/* Legend */}
              <div className="flex items-center gap-1 mt-3 ml-32">
                <span className="text-xs text-muted-foreground">Less</span>
                {[0, 1, 2, 3].map((v) => (
                  <div key={v} className={`w-4 h-4 rounded-sm ${getHeatColor(v)}`} />
                ))}
                <span className="text-xs text-muted-foreground">More</span>
              </div>
            </div>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## Task 11: Table Columns

**Files:**
- Create: `app/(routes)/academic/attendance/consolidation/facilitators/_components/facilitator-columns.tsx`

**Step 1: Create the columns file**

```tsx
// facilitator-columns.tsx
'use client';

import { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FacilitatorAttendanceStat } from '@/types/attendance';

function getStatusBadge(periodsMarked: number) {
  if (periodsMarked >= 30) return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Excellent</Badge>;
  if (periodsMarked >= 20) return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">Good</Badge>;
  if (periodsMarked >= 10) return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">Fair</Badge>;
  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">Low</Badge>;
}

export const getFacilitatorColumns = (): ColumnDef<FacilitatorAttendanceStat>[] => [
  {
    accessorKey: 'firstName',
    header: 'Facilitator',
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.firstName} {row.original.lastName}</p>
        <p className="text-xs text-muted-foreground">{row.original.designation}</p>
      </div>
    ),
  },
  {
    accessorKey: 'departmentName',
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        Department <ArrowUpDown className="ml-2 h-3 w-3" />
      </Button>
    ),
  },
  {
    accessorKey: 'periodsMarked',
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        Periods Marked <ArrowUpDown className="ml-2 h-3 w-3" />
      </Button>
    ),
    cell: ({ getValue }) => (
      <span className="font-semibold text-green-700 dark:text-green-400">
        {getValue<number>()}
      </span>
    ),
  },
  {
    accessorKey: 'lastMarkedAt',
    header: 'Last Marked',
    cell: ({ getValue }) => {
      const v = getValue<string | null>();
      return v ? (
        <span className="text-sm">{format(new Date(v), 'MMM d, yyyy')}</span>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      );
    },
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => getStatusBadge(row.original.periodsMarked),
  },
];
```

---

## Task 12: Data Table Component

**Files:**
- Create: `app/(routes)/academic/attendance/consolidation/facilitators/_components/facilitator-data-table.tsx`

**Step 1: Create the data table**

```tsx
// facilitator-data-table.tsx
'use client';

import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getExpandedRowModel,
  flexRender,
  type SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getFacilitatorColumns } from './facilitator-columns';
import type { FacilitatorAttendanceStat } from '@/types/attendance';
import { FacilitatorTrendChart } from './facilitator-trend-chart';

interface Props {
  facilitators: FacilitatorAttendanceStat[];
  globalFilter: string;
}

export function FacilitatorDataTable({ facilitators, globalFilter }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'periodsMarked', desc: true },
  ]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const columns = getFacilitatorColumns();

  const table = useReactTable({
    data: facilitators,
    columns,
    state: { sorting, globalFilter, expanded },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Facilitator Details ({table.getFilteredRowModel().rows.length} records)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  <TableHead className="w-8" />
                  {hg.headers.map((h) => (
                    <TableHead key={h.id}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <>
                  <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => row.toggleExpanded()}
                      >
                        {row.getIsExpanded()
                          ? <ChevronDown className="h-3 w-3" />
                          : <ChevronRight className="h-3 w-3" />}
                      </Button>
                    </TableCell>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() && (
                    <TableRow key={`${row.id}-expanded`}>
                      <TableCell colSpan={columns.length + 1} className="bg-muted/30 p-4">
                        <div className="max-w-2xl">
                          <FacilitatorTrendChart facilitators={[row.original]} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
              {table.getRowModel().rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="text-center py-8 text-muted-foreground">
                    No facilitators found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## Task 13: Department Breakdown Component

**Files:**
- Create: `app/(routes)/academic/attendance/consolidation/facilitators/_components/department-breakdown.tsx`

**Step 1: Create the component**

```tsx
// department-breakdown.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { FacilitatorDepartmentBreakdown } from '@/types/attendance';

interface Props {
  breakdown: FacilitatorDepartmentBreakdown[];
}

export function DepartmentBreakdown({ breakdown }: Props) {
  const maxMarked = Math.max(...breakdown.map((d) => d.totalMarked), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Department Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {breakdown.map((dept) => (
          <div key={dept.departmentId} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium truncate max-w-[60%]">{dept.departmentName}</span>
              <span className="text-muted-foreground text-xs">
                {dept.facilitatorCount} staff · {dept.totalMarked} periods
              </span>
            </div>
            <Progress
              value={(dept.totalMarked / maxMarked) * 100}
              className="h-2"
            />
          </div>
        ))}
        {breakdown.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No department data available
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## Task 14: Main Page

**Files:**
- Create: `app/(routes)/academic/attendance/consolidation/facilitators/page.tsx`

**Step 1: Create the page**

```tsx
// page.tsx
'use client';

import { useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { useFacilitatorAttendanceReport } from '@/hooks/academic/use-facilitator-attendance';
import { useDepartments } from '@/hooks/organization/use-departments'; // adjust import if hook name differs
import type { FacilitatorReportFilters } from '@/types/attendance';

import { FacilitatorFilters } from './_components/facilitator-filters';
import { FacilitatorSummaryCards } from './_components/facilitator-summary-cards';
import { FacilitatorBarChart } from './_components/facilitator-bar-chart';
import { FacilitatorPieChart } from './_components/facilitator-pie-chart';
import { FacilitatorTrendChart } from './_components/facilitator-trend-chart';
import { FacilitatorHeatmap } from './_components/facilitator-heatmap';
import { FacilitatorDataTable } from './_components/facilitator-data-table';
import { DepartmentBreakdown } from './_components/department-breakdown';

const today = format(new Date(), 'yyyy-MM-dd');
const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');

export default function FacilitatorAttendancePage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;

  const [filters, setFilters] = useState<FacilitatorReportFilters>({
    dateFrom: monthStart,
    dateTo: today,
  });
  const [facilitatorSearch, setFacilitatorSearch] = useState('');

  const { data, isLoading, error } = useFacilitatorAttendanceReport(
    institutionId,
    filters
  );

  // Fetch departments for filter dropdown
  // Replace with whatever hook your project uses for departments
  const { departments = [] } = useDepartments(institutionId ?? '');

  const breadcrumb = (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbLink asChild><Link href="/academic/attendance">Attendance</Link></BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbLink asChild><Link href="/academic/attendance/consolidation">Consolidation</Link></BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbPage>Facilitator Report</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );

  if (isLoading) {
    return (
      <ContentLayout title="Facilitator Attendance Report">
        {breadcrumb}
        <div className="mt-6"><LoadingSkeleton /></div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="Facilitator Attendance Report">
        {breadcrumb}
        <div className="mt-6 text-center text-destructive text-sm">
          Failed to load report. Please try again.
        </div>
      </ContentLayout>
    );
  }

  const summary = data?.summary ?? { totalFacilitators: 0, totalPeriodsMarked: 0, avgPeriodsPerFacilitator: 0 };
  const facilitators = data?.facilitators ?? [];
  const departmentBreakdown = data?.departmentBreakdown ?? [];

  return (
    <PermissionGuard module="academic.attendance.facilitator-report" action="view">
      <ContentLayout title="Facilitator Attendance Report">
        {breadcrumb}

        <div className="mt-6 flex flex-col lg:flex-row gap-6">
          {/* Left: Sticky Filters */}
          <aside className="lg:w-64 shrink-0">
            <div className="lg:sticky lg:top-6 space-y-6">
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold mb-4">Filters</h3>
                <FacilitatorFilters
                  filters={filters}
                  departments={departments}
                  onFiltersChange={setFilters}
                  onFacilitatorSearch={setFacilitatorSearch}
                  facilitatorSearchQuery={facilitatorSearch}
                />
              </div>
              <DepartmentBreakdown breakdown={departmentBreakdown} />
            </div>
          </aside>

          {/* Right: Content */}
          <div className="flex-1 space-y-6 min-w-0">
            {/* Page header */}
            <div>
              <h1 className="text-2xl font-bold">Facilitator Attendance Report</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Periods marked by each facilitator within the selected date range
              </p>
            </div>

            {/* Summary KPIs */}
            <FacilitatorSummaryCards
              summary={summary}
              departmentCount={departmentBreakdown.length}
            />

            {/* Charts row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FacilitatorBarChart facilitators={facilitators} />
              <FacilitatorPieChart departmentBreakdown={departmentBreakdown} />
            </div>

            {/* Trend chart */}
            <FacilitatorTrendChart facilitators={facilitators} />

            {/* Heatmap */}
            <FacilitatorHeatmap
              facilitators={facilitators}
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
            />

            {/* Data table */}
            <FacilitatorDataTable
              facilitators={facilitators}
              globalFilter={facilitatorSearch}
            />
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
```

**Step 2: Find the correct departments hook import**

```bash
grep -r "useDepartments\|useInstitutionDepartments" hooks/ --include="*.ts" -l
```

Replace the `useDepartments` import with whatever hook your project uses. Check its signature and adjust accordingly.

**Step 3: Commit all component files**

```bash
git add app/(routes)/academic/attendance/consolidation/facilitators/
git commit -m "feat(attendance): add facilitator attendance report page and components"
```

---

## Task 15: Add Navigation Entry to Consolidation Hub

**Files:**
- Modify: `app/(routes)/academic/attendance/consolidation/page.tsx`

**Step 1: Read the current file** — already done above (line 196-245 shows the `space-y-6` div with Info Card + ReportsDataTable).

**Step 2: Add the Facilitator Report Card after the Info Card (around line 245)**

Find this block in `consolidation/page.tsx`:
```tsx
{/* Reports Data Table */}
<ReportsDataTable
```

Add a new card above it:
```tsx
{/* Facilitator Report Link */}
<Card className="border-dashed hover:border-solid hover:bg-muted/30 transition-all cursor-pointer">
  <Link href="/academic/attendance/consolidation/facilitators">
    <CardHeader>
      <div className="flex items-center gap-3">
        <div className="rounded-full p-2 bg-blue-50 dark:bg-blue-950">
          <Users className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <CardTitle className="text-base">Facilitator Attendance Report</CardTitle>
          <CardDescription>
            View periods marked by each facilitator with charts and heatmap
          </CardDescription>
        </div>
      </div>
    </CardHeader>
  </Link>
</Card>

{/* Reports Data Table */}
```

**Step 3: Add the `Users` import** — add to the existing lucide-react import at the top:
```tsx
import { Building2, Users } from 'lucide-react';
```

Also add `CardDescription` to the Card imports if not already imported:
```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
```

**Step 4: Commit**

```bash
git add app/(routes)/academic/attendance/consolidation/page.tsx
git commit -m "feat(attendance): add facilitator report link to consolidation hub"
```

---

## Task 16: Verify Department Hook & Wire Final Details

**Step 1: Find which departments hook to use**

```bash
grep -r "departments" hooks/organization/ --include="*.ts" -l
```

Open the relevant file and check its export name and expected parameters. Update `page.tsx` import accordingly.

**Step 2: Browser test the page**

1. Navigate to `/academic/attendance/consolidation`
2. Verify the Facilitator Report card appears
3. Click it → should load `/academic/attendance/consolidation/facilitators`
4. Check the permission guard works (try with a role that has `academic.attendance.facilitator-report.view` and without)
5. Verify filters update charts on change
6. Expand a table row → mini trend chart appears
7. Test mobile layout (DevTools → responsive mode, 375px width)

**Step 3: Check for console errors**

Open browser DevTools console. Look for:
- TypeScript errors (chart dataKey mismatches)
- "Cannot read properties of undefined" (null safety on `data?.facilitators`)
- Recharts warnings about chart dimensions (wrap in `ResponsiveContainer` if needed)

**Step 4: Final commit if any small fixes needed**

```bash
git add -p  # stage only your fixes
git commit -m "fix(attendance): resolve facilitator report wiring issues"
```

---

## Implementation Checklist

| Task | File(s) | Status |
|---|---|---|
| 1. RPC function | `supabase/setup/02_functions.sql`, `03_policies.sql` | ☐ |
| 2. TS types | `types/attendance.ts` | ☐ |
| 3. Service | `lib/services/academic/facilitator-attendance-service.ts` | ☐ |
| 4. Hook | `hooks/academic/use-facilitator-attendance.ts` | ☐ |
| 5. Summary cards | `…/facilitators/_components/facilitator-summary-cards.tsx` | ☐ |
| 6. Filters | `…/facilitators/_components/facilitator-filters.tsx` | ☐ |
| 7. Bar chart | `…/facilitators/_components/facilitator-bar-chart.tsx` | ☐ |
| 8. Pie chart | `…/facilitators/_components/facilitator-pie-chart.tsx` | ☐ |
| 9. Trend chart | `…/facilitators/_components/facilitator-trend-chart.tsx` | ☐ |
| 10. Heatmap | `…/facilitators/_components/facilitator-heatmap.tsx` | ☐ |
| 11. Columns | `…/facilitators/_components/facilitator-columns.tsx` | ☐ |
| 12. Data table | `…/facilitators/_components/facilitator-data-table.tsx` | ☐ |
| 13. Dept breakdown | `…/facilitators/_components/department-breakdown.tsx` | ☐ |
| 14. Main page | `…/facilitators/page.tsx` | ☐ |
| 15. Nav entry | `consolidation/page.tsx` | ☐ |
| 16. Verify & fix | Browser testing + hook wiring | ☐ |

---

## Known Issues to Watch For

1. **`useDepartments` hook** — the hook name in your project may differ. Check `hooks/organization/` before Task 14.
2. **`createClientSupabaseClient` path** — verify in `lib/supabase/client.ts`. If the function name is different, update the service import.
3. **Heatmap date range limit** — for date ranges > 60 days, the heatmap becomes very wide. Consider capping at 60 days or adding a "last 30 days" quick-select in the filters.
4. **RPC null safety** — if `student_attendance.marked_by` values don't match any `staff.id` (e.g., admin users who aren't in the `staff` table), those records won't appear. This is by design — only staff-table members are shown.
5. **ChartContainer height** — if charts render as 0px height, ensure the parent has a defined height. Add `className="h-[300px]"` directly on `ChartContainer` if needed.
