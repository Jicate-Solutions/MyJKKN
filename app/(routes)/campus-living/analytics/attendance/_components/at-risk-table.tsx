'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FilterX } from 'lucide-react';
import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { AttendanceAnalyticsService } from '@/lib/services/campus-living/attendance-analytics-service';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import type { AttendanceLearnerRow } from '@/types/campus-living/attendance-analytics';
import {
  getLearnerAttendanceColumns,
  LEARNER_EXPORT_HEADERS,
  LEARNER_EXPORT_MAPPING,
  LEARNER_EXPORT_WIDTHS,
  learnerExportTransform,
} from './learners-columns';

/** Radix Select forbids value="", so 'any' is the no-filter sentinel. */
const ANY = 'any';

const BAND_OPTIONS = [
  { value: ANY, label: 'Any rate', min: null, max: null },
  { value: 'lt25', label: 'Below 25%', min: null, max: 25 },
  { value: 'lt50', label: 'Below 50%', min: null, max: 50 },
  { value: 'lt75', label: 'Below 75%', min: null, max: 75 },
  { value: '25-50', label: '25–50%', min: 25, max: 50 },
  { value: '50-75', label: '50–75%', min: 50, max: 75 },
  { value: 'gte75', label: '75% and above', min: 75, max: null },
];

const STATUS_OPTIONS = [
  { value: ANY, label: 'Any status' },
  { value: 'absent', label: 'Has an absence' },
  { value: 'on_leave', label: 'Has approved leave' },
  { value: 'medical', label: 'Has a medical day' },
  { value: 'late_entry', label: 'Has a late entry' },
];

const RUN_OPTIONS = [
  { value: ANY, label: 'Any run' },
  { value: '3', label: '3+ consecutive' },
  { value: '5', label: '5+ consecutive' },
  { value: '10', label: '10+ consecutive' },
  { value: '20', label: '20+ consecutive' },
];

interface LearnerFilters {
  band: string;
  status: string;
  minRun: string;
  onlyOngoing: boolean;
  institutionId: string;
}

const EMPTY_FILTERS: LearnerFilters = {
  band: ANY,
  status: ANY,
  minRun: ANY,
  onlyOngoing: false,
  institutionId: ANY,
};

/**
 * Learner attendance table — the actionable end of the dashboard.
 *
 * Uses the shared DataTable, so paging, search, sorting, column visibility,
 * resizing and CSV/XLS/PDF export come from one place. Everything is
 * SERVER-side: fn_cl_attendance_learners does the filtering, sorting and
 * counting, so the browser never holds the whole roster.
 *
 * Filter wiring follows the hr/employees contract (data-table.tsx:562 — the
 * fetch effect depends on `fetchDataFn` and `refetchKey`). fetchDataFn is
 * useCallback'd over the filters so its identity changes, AND refetchKey is
 * bumped: either alone would work, both is what the repo's most robust example
 * does. There is deliberately no `key=` remount — that throws away sort, page
 * size and column widths on every filter change.
 */
export function AtRiskTable({
  institutionId,
  from,
  to,
  blockId,
}: {
  institutionId: string | undefined;
  from: string;
  to: string;
  blockId: string | null;
}) {
  const [filters, setFilters] = useState<LearnerFilters>(EMPTY_FILTERS);
  const [refetchKey, setRefetchKey] = useState(0);
  const { institutions } = useInstitutionsWithAccess();

  const patch = useCallback((p: Partial<LearnerFilters>) => {
    setFilters((prev) => ({ ...prev, ...p }));
    setRefetchKey((k) => k + 1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setRefetchKey((k) => k + 1);
  }, []);

  const activeCount = useMemo(
    () =>
      (filters.band !== ANY ? 1 : 0) +
      (filters.status !== ANY ? 1 : 0) +
      (filters.minRun !== ANY ? 1 : 0) +
      (filters.onlyOngoing ? 1 : 0) +
      (filters.institutionId !== ANY ? 1 : 0),
    [filters],
  );

  const columns = useMemo(() => getLearnerAttendanceColumns(from, to), [from, to]);

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const band = BAND_OPTIONS.find((b) => b.value === filters.band);
      const limit = params.limit || 25;

      const rows = await AttendanceAnalyticsService.getLearners({
        from,
        to,
        blockId,
        institutionId: filters.institutionId === ANY ? null : filters.institutionId,
        search: params.search || null,
        minPct: band?.min ?? null,
        maxPct: band?.max ?? null,
        minAbsentRun: filters.minRun === ANY ? null : Number(filters.minRun),
        onlyOngoing: filters.onlyOngoing,
        status: filters.status === ANY ? null : filters.status,
        sortBy: params.sort_by || 'attendance_pct',
        sortOrder: (params.sort_order as 'asc' | 'desc') || 'asc',
        limit,
        offset: ((params.page || 1) - 1) * limit,
      });

      // total_count is a window count over the whole filtered set, repeated on
      // every row; an empty page legitimately means zero matches.
      const total = Number(rows[0]?.total_count ?? 0);

      return {
        success: true,
        data: rows,
        pagination: {
          page: params.page || 1,
          limit,
          total_pages: Math.max(1, Math.ceil(total / limit)),
          total_items: total,
        },
      };
    },
    // Identity changes with the page-level scope (from/to/block) as well as the
    // local filters, so changing the period or block refetches too.
    [from, to, blockId, filters],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Learners</CardTitle>
            <CardDescription>
              Lowest attendance first. Absence runs count consecutive{' '}
              <strong>marked</strong> days — a gap in marking does not break a run.
            </CardDescription>
          </div>
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <FilterX className="mr-2 h-4 w-4" />
              Clear
              <Badge variant="secondary" className="ml-2 px-1.5 py-0">
                {activeCount}
              </Badge>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters sit ABOVE the table, not in the toolbar: renderToolbarContent
            shares a cramped row with Export and column visibility, and every
            example in this repo that has more than one control puts them here. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Attendance rate</Label>
            <Select value={filters.band} onValueChange={(v) => patch({ band: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BAND_OPTIONS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Absence run</Label>
            <Select value={filters.minRun} onValueChange={(v) => patch({ minRun: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RUN_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status seen</Label>
            <Select value={filters.status} onValueChange={(v) => patch({ status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Institution</Label>
            <Select
              value={filters.institutionId}
              onValueChange={(v) => patch({ institutionId: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All institutions</SelectItem>
                {(institutions ?? []).map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
            <Label htmlFor="only-ongoing" className="cursor-pointer text-sm">
              Still absent now
            </Label>
            <Switch
              id="only-ongoing"
              checked={filters.onlyOngoing}
              onCheckedChange={(v) => patch({ onlyOngoing: v })}
            />
          </div>
        </div>

        <DataTable<AttendanceLearnerRow, unknown>
          fetchDataFn={fetchData as never}
          getColumns={() => columns as never}
          idField="learner_id"
          refetchKey={refetchKey}
          exportConfig={{
            entityName: 'hostel-attendance-learners',
            headers: [...LEARNER_EXPORT_HEADERS],
            columnMapping: LEARNER_EXPORT_MAPPING,
            columnWidths: LEARNER_EXPORT_WIDTHS,
            transformFunction: learnerExportTransform as never,
            pdf: {
              headers: [
                'learner_name', 'roll_no', 'block', 'room', 'rate_pct',
                'present_days', 'absent_days', 'longest_run', 'last_present',
              ],
              title: 'Hostel Attendance — Learners',
              orientation: 'landscape' as const,
            },
          }}
          config={{
            enableUrlState: true,
            enableSearch: true,
            searchPlaceholder: 'Search name, roll number or room…',
            // The period lives in the page's scope bar; a second date filter in
            // the toolbar would be a competing source of truth for the range.
            enableDateFilter: false,
            // Own filters above; the toolbar's per-column filters would be a
            // third way to narrow the same list.
            enableColumnFilters: false,
            enableColumnVisibility: true,
            enableColumnResizing: true,
            enableRowSelection: false, // read-only view
            enableExport: true,
            columnResizingTableId: 'cl-attendance-learners',
          }}
        />
      </CardContent>
    </Card>
  );
}
