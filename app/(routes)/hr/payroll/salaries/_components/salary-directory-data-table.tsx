'use client';

/**
 * Advanced DataTable wrapper for the employee-salary directory.
 *
 * Rows are fetched ONCE by the page and passed in, so the summary cards, the
 * filter counts and the table all read the same array — the pattern
 * payer-directory-data-table.tsx records, and for the same reason: two
 * independent sources for one list is how a card comes to advertise a total the
 * table cannot show.
 *
 * NO BULK WRITE, NO BULK TEMPLATE (2026-09-30). The Director removed the salary
 * Excel import; every salary is created or edited one person at a time, and
 * only by the Director list (canEdit, asked of the database by the page). The
 * table's own read-only export stays.
 *
 * DataTable re-runs fetchDataFn whenever its identity changes, so `rows` and
 * `filters` in the deps are what make a filter change repaint the table.
 */

import { useCallback, useMemo } from 'react';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import type { ExportableData } from '@/components/data-table/utils/export-utils';
import { Badge } from '@/components/ui/badge';
import type { StaffSalaryDirectoryRow } from '@/lib/services/hr/payroll/staff-salary-service';

import { useTdsSlabs } from '@/hooks/hr/use-tds-slabs';
import { getSalaryColumns } from './salary-columns';
import { matchesSalaryFilters, type SalaryFilterState } from './salary-filters';

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/**
 * Export keys are deliberately DISTINCT from the column ids. data-export.tsx
 * drops any export header whose name collides with a HIDDEN column id, so a user
 * who hides "Annual" would otherwise lose it from the spreadsheet too.
 */
const EXPORT_COLUMNS: Array<{ key: string; label: string; width: number }> = [
  { key: 'employee', label: 'Employee', width: 28 },
  { key: 'code', label: 'Employee ID', width: 14 },
  { key: 'works_at', label: 'Works At', width: 32 },
  { key: 'paid_by', label: 'Paid By', width: 32 },
  { key: 'monthly', label: 'Monthly Gross', width: 16 },
  { key: 'annual', label: 'Annual Gross', width: 16 },
  { key: 'effective', label: 'Effective From', width: 16 },
  { key: 'eligibility', label: 'Eligibility', width: 30 },
  { key: 'salary_state', label: 'Salary Status', width: 16 },
  { key: 'employment', label: 'Employment', width: 14 },
];

interface Props {
  rows: StaffSalaryDirectoryRow[];
  filters: SalaryFilterState;
  /** On the Director list (asked of the database). Only they may change pay. */
  canEdit: boolean;
  onEdit: (row: StaffSalaryDirectoryRow) => void;
  onViewHistory: (row: StaffSalaryDirectoryRow) => void;
}

export function SalaryDirectoryDataTable({
  rows,
  filters,
  canEdit,
  onEdit,
  onViewHistory,
}: Props) {
  // The bands drive the derived TDS column. Fetched here rather than threaded
  // down from the page because the columns are the only consumer, and the query
  // is shared through React Query anyway — the dialog reads the same cache.
  const { data: tdsSlabs } = useTdsSlabs();

  const columns = useMemo(
    () => getSalaryColumns({ onEdit, onViewHistory, canEdit, tdsSlabs: tdsSlabs ?? [] }),
    [canEdit, onEdit, onViewHistory, tdsSlabs]
  );

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const term = (params.search ?? '').trim().toLowerCase();

      const filtered = rows.filter((r) => {
        if (!matchesSalaryFilters(r, filters)) return false;
        if (!term) return true;
        return (
          r.person_name.toLowerCase().includes(term) ||
          (r.staff_code ?? '').toLowerCase().includes(term) ||
          (r.role_title ?? '').toLowerCase().includes(term) ||
          r.works_at_name.toLowerCase().includes(term) ||
          (r.payer_org_name ?? '').toLowerCase().includes(term)
        );
      });

      // 'created_at' is the DataTable's built-in initial sortBy and matches no
      // column here, so it means "keep the RPC's own order" — which puts the
      // people awaiting a salary first, the whole point of the screen.
      const sortBy = params.sort_by;
      if (sortBy && sortBy !== 'created_at') {
        const dir = params.sort_order === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
          const av = a[sortBy as keyof StaffSalaryDirectoryRow];
          const bv = b[sortBy as keyof StaffSalaryDirectoryRow];
          // Nulls last regardless of direction: an unset salary sorting into the
          // middle of the money column reads as a data error.
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          // Amounts must compare numerically — localeCompare puts 7000 above
          // 70000, which on a salary column reads as corruption.
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
    [filters, rows]
  );

  const renderMobileRow = useCallback(
    (r: StaffSalaryDirectoryRow) => (
      <button
        type='button'
        onClick={() => (canEdit ? onEdit(r) : onViewHistory(r))}
        className='w-full space-y-2 rounded-md border p-3 text-left'
      >
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0'>
            <p className='truncate text-sm font-medium'>{r.person_name}</p>
            <p className='font-mono text-xs text-muted-foreground'>{r.staff_code ?? '—'}</p>
          </div>
          <span className='shrink-0 text-sm font-semibold tabular-nums'>
            {r.monthly_gross === null
              ? <span className='text-xs italic font-normal text-muted-foreground'>Not set</span>
              : INR.format(r.monthly_gross)}
          </span>
        </div>
        <div className='flex flex-wrap gap-1'>
          <Badge variant='outline' className='font-normal'>{r.works_at_name}</Badge>
          {!r.payer_org_id && (
            <Badge
              variant='outline'
              className='border-amber-300 font-normal text-amber-700 dark:border-amber-800 dark:text-amber-400'
            >
              No payer
            </Badge>
          )}
          {!r.is_active && (
            <Badge variant='secondary' className='font-normal'>Relieved</Badge>
          )}
        </div>
      </button>
    ),
    [canEdit, onEdit, onViewHistory]
  );

  return (
    <DataTable
      fetchDataFn={fetchData as never}
      getColumns={() => columns as never}
      renderMobileRow={renderMobileRow as never}
      idField='staff_uuid'
      exportConfig={{
        entityName: 'employee-salaries',
        columnMapping: Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.key, c.label])),
        columnWidths: EXPORT_COLUMNS.map((c) => ({ wch: c.width })),
        headers: EXPORT_COLUMNS.map((c) => c.key),
        // Without this the sheet exports row[undefined] for every cell. Typed
        // against ExportableData because TData collapses to it once fetchDataFn
        // is cast — an interface has no implicit index signature.
        transformFunction: (row: ExportableData) => {
          const r = row as unknown as StaffSalaryDirectoryRow;
          const on: string[] = [];
          if (r.salary_id) {
            if (r.eligible_for_pf) on.push('PF');
            if (r.eligible_for_insurance) on.push('Insurance');
            if (r.eligible_for_gratuity) on.push('Gratuity');
            if (r.eligible_for_etf) on.push('ETF');
            if (r.exempt_edli) on.push('EDLI exempt');
          }
          return {
            employee: r.person_name,
            code: r.staff_code ?? '',
            works_at: r.works_at_name,
            paid_by: r.payer_org_name ?? '',
            monthly: r.monthly_gross ?? '',
            annual: r.annual_gross ?? '',
            effective: r.effective_from ?? '',
            eligibility: on.join(', '),
            salary_state: r.salary_id ? 'Recorded' : 'Awaiting',
            employment: r.is_active ? 'Active' : 'Relieved',
          };
        },
      }}
      config={{
        enableUrlState: true,
        enableSearch: true,
        searchPlaceholder: 'Search employee, ID, designation, location or payer…',
        enableDateFilter: false,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        enableRowSelection: false,
        enableExport: true,
        columnResizingTableId: 'hr-payroll-employee-salaries',
      }}
    />
  );
}
