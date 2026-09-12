'use client';

/**
 * Advanced DataTable for the register index.
 *
 * Runs are fetched ONCE by the page and passed in, so the header counts, the
 * filters and the table all read the same array — the pattern
 * salary-directory-data-table.tsx records, and for the same reason: two
 * independent sources for one list is how a heading comes to advertise a total
 * the table cannot show.
 *
 * NO ROW SELECTION. Nothing here is a bulk operation — generating is per
 * institution-month and exporting is per register — so the checkbox column is
 * deliberately absent.
 */

import { useCallback, useMemo } from 'react';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import type { ExportableData } from '@/components/data-table/utils/export-utils';
import { Badge } from '@/components/ui/badge';
import type { HRSalaryRegisterRun } from '@/types/hr-payroll';

import { MONTHS, getRunColumns, inr } from './run-columns';
import { matchesRunFilters, type RunFilterState } from './runs-filters';

/**
 * Export keys are deliberately DISTINCT from the column ids — data-export.tsx
 * drops any export header colliding with a HIDDEN column id, and a reader who
 * hides a column would otherwise lose it from the spreadsheet too.
 */
const EXPORT_COLUMNS: Array<{ key: string; label: string; width: number }> = [
  { key: 'org', label: 'Institution', width: 34 },
  { key: 'month_label', label: 'Month', width: 16 },
  { key: 'headcount', label: 'Staff', width: 9 },
  { key: 'paid', label: 'Paid', width: 9 },
  { key: 'not_paid', label: 'Excluded', width: 10 },
  { key: 'gross', label: 'Total Gross', width: 16 },
  { key: 'deductions', label: 'Total Deductions', width: 16 },
  { key: 'net', label: 'Net Payable', width: 16 },
  { key: 'basis', label: 'Day-rate Divisor', width: 14 },
  { key: 'made_at', label: 'Generated At', width: 20 },
  { key: 'run_state', label: 'Status', width: 13 },
];

interface Props {
  runs: HRSalaryRegisterRun[];
  filters: RunFilterState;
  orgNameById: Map<string, string>;
}

export function RunsDataTable({ runs, filters, orgNameById }: Props) {
  const columns = useMemo(() => getRunColumns({ orgNameById }), [orgNameById]);

  const nameOf = useCallback(
    (r: HRSalaryRegisterRun) => orgNameById.get(r.hr_organization_id) ?? r.hr_organization_id,
    [orgNameById]
  );

  const apply = useCallback(
    (params: DataFetchParams) => {
      const term = (params.search ?? '').trim().toLowerCase();
      return runs.filter((r) => {
        if (!matchesRunFilters(r, filters)) return false;
        if (!term) return true;
        const period = `${MONTHS[r.period_month - 1]} ${r.period_year}`.toLowerCase();
        return nameOf(r).toLowerCase().includes(term) || period.includes(term);
      });
    },
    [filters, nameOf, runs]
  );

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const filtered = apply(params);

      // 'created_at' is the DataTable's built-in initial sortBy and matches no
      // column here, so it means "keep the service's own order" — newest
      // period first, which is what someone opening this page is looking for.
      const sortBy = params.sort_by;
      if (sortBy && sortBy !== 'created_at') {
        const dir = params.sort_order === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
          // The two derived columns have no field of their own to read.
          if (sortBy === 'institution') return nameOf(a).localeCompare(nameOf(b)) * dir;
          if (sortBy === 'period') {
            return ((a.period_year * 100 + a.period_month) -
              (b.period_year * 100 + b.period_month)) * dir;
          }
          if (sortBy === 'state') {
            return String(a.superseded_at ?? '').localeCompare(String(b.superseded_at ?? '')) * dir;
          }
          const av = a[sortBy as keyof HRSalaryRegisterRun];
          const bv = b[sortBy as keyof HRSalaryRegisterRun];
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          // Totals must compare numerically — localeCompare puts 7,00,000 above
          // 70,00,000, which on a money column reads as corruption.
          if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
          return String(av).localeCompare(String(bv)) * dir;
        });
      }

      // Clamp rather than return an empty slice: narrowing a filter while on a
      // later page would otherwise render a blank table whose only way back is
      // the pager.
      const limit = params.limit || 10;
      const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
      const safePage = Math.min(Math.max(1, params.page || 1), totalPages);
      const start = (safePage - 1) * limit;

      return {
        success: true,
        data: filtered.slice(start, start + limit),
        pagination: {
          page: safePage,
          limit,
          total_pages: totalPages,
          total_items: filtered.length,
        },
      };
    },
    [apply, nameOf]
  );

  const fetchAllItems = useCallback(async (params: DataFetchParams) => apply(params), [apply]);

  const renderMobileRow = useCallback(
    (r: HRSalaryRegisterRun) => (
      <div className="w-full space-y-2 rounded-md border p-3 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{nameOf(r)}</p>
            <p className="text-xs text-muted-foreground">
              {MONTHS[r.period_month - 1]} {r.period_year}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{inr(r.total_net)}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="font-normal">{r.included_count} paid</Badge>
          {r.excluded_count > 0 && (
            <Badge
              variant="outline"
              className="border-amber-300 font-normal text-amber-700 dark:border-amber-800 dark:text-amber-400"
            >
              {r.excluded_count} excluded
            </Badge>
          )}
          {r.superseded_at && (
            <Badge variant="secondary" className="font-normal">Superseded</Badge>
          )}
        </div>
      </div>
    ),
    [nameOf]
  );

  return (
    <DataTable
      fetchDataFn={fetchData as never}
      fetchAllItemsFn={fetchAllItems as never}
      getColumns={() => columns as never}
      renderMobileRow={renderMobileRow as never}
      idField="id"
      config={{ enableRowSelection: false }}
      exportConfig={{
        entityName: 'salary-registers',
        columnMapping: Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.key, c.label])),
        columnWidths: EXPORT_COLUMNS.map((c) => ({ wch: c.width })),
        headers: EXPORT_COLUMNS.map((c) => c.key),
        pdf: { headers: EXPORT_COLUMNS.map((c) => c.key), orientation: 'landscape' },
        // Without this the sheet exports row[undefined] for every cell. Typed
        // against ExportableData because TData collapses to it once fetchDataFn
        // is cast — an interface has no implicit index signature.
        transformFunction: (row: ExportableData) => {
          const r = row as unknown as HRSalaryRegisterRun;
          return {
            org: orgNameById.get(r.hr_organization_id) ?? r.hr_organization_id,
            month_label: `${MONTHS[r.period_month - 1]} ${r.period_year}`,
            headcount: r.staff_total,
            paid: r.included_count,
            not_paid: r.excluded_count,
            gross: r.total_gross,
            deductions: r.total_deductions,
            net: r.total_net,
            basis: r.working_days_basis,
            made_at: r.generated_at ? new Date(r.generated_at).toLocaleString('en-IN') : '',
            run_state: r.superseded_at ? 'Superseded' : 'In force',
          };
        },
      }}
    />
  );
}
