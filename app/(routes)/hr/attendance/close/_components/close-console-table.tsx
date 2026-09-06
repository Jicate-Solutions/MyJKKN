'use client';

/**
 * The month-close console, on the shared advanced DataTable.
 *
 * DEFAULT ORDER IS THE WORKING ORDER, NOT ALPHABETICAL:
 *   Ready → Needs review → Closed → No data.
 * Ready is what you can act on now; Needs review is action needed elsewhere
 * before you can act; Closed is done; No data cannot be worked on at all, so it
 * goes last instead of cluttering the top. Sorting the status column by its
 * LABEL would put "Closed" above "Ready", which is exactly backwards — hence the
 * numeric rank in close-console-columns.tsx.
 *
 * Rows are fetched ONCE by the page and passed in, so the summary cards and the
 * table read the same array. Filtering, search and sorting therefore happen in
 * memory, which is right at nine rows and is the same shape
 * payer-directory-data-table.tsx uses.
 *
 * DataTable re-runs fetchDataFn whenever its identity changes, so `rows` and
 * `stateFilter` in the useCallback deps are what make a filter change repaint.
 */

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { CalendarCheck, ExternalLink, FileSpreadsheet, LockOpen } from 'lucide-react';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import type { ExportableData } from '@/components/data-table/utils/export-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AttendancePeriodConsoleRow } from '@/lib/services/hr/attendance/attendance-period-service';

import {
  APPROVAL_TABS,
  CLOSE_STATE_LABEL,
  CLOSE_STATE_RANK,
  closeStateOf,
  getCloseConsoleColumns,
  monthBounds,
  type CloseState,
} from './close-console-columns';

/**
 * Export keys are deliberately DISTINCT from the column ids. data-export.tsx
 * drops any export header whose name collides with a HIDDEN column id, so a
 * user who hides "Comp off" would otherwise lose it from the spreadsheet too.
 */
const EXPORT_COLUMNS: Array<{ key: string; label: string; width: number }> = [
  { key: 'college', label: 'Institution', width: 34 },
  { key: 'state', label: 'Status', width: 16 },
  { key: 'in_biometric', label: 'In Biometric', width: 14 },
  { key: 'active_staff', label: 'Active Staff', width: 14 },
  { key: 'coverage', label: 'Coverage %', width: 12 },
  { key: 'relieved', label: 'Relieved Counted', width: 18 },
  { key: 'records', label: 'Attendance Records', width: 18 },
  { key: 'p_leave', label: 'Pending Leave', width: 14 },
  { key: 'p_sto', label: 'Pending Short Time Off', width: 20 },
  { key: 'p_comp', label: 'Pending Comp Off', width: 16 },
  { key: 'a_total', label: 'Approved Requests', width: 18 },
  { key: 'unjudged', label: 'Unjudged Days', width: 14 },
  { key: 'closed_on', label: 'Closed On', width: 16 },
];

export type CloseStateFilter = 'all' | CloseState;

interface Props {
  rows: AttendancePeriodConsoleRow[];
  stateFilter: CloseStateFilter;
  year: number;
  month: number;
  canManage: boolean;
  isSuperAdmin: boolean;
  /** hr.payroll.register.view — shows the Salary register link on closed rows. */
  canViewRegister: boolean;
  busy: boolean;
  onClose: (row: AttendancePeriodConsoleRow) => void;
  onReopen: (row: AttendancePeriodConsoleRow) => void;
}

export function CloseConsoleTable({
  rows, stateFilter, year, month, canManage, isSuperAdmin, canViewRegister, busy, onClose, onReopen,
}: Props) {
  const columns = useMemo(
    () => getCloseConsoleColumns({ year, month, canManage, isSuperAdmin, canViewRegister, busy, onClose, onReopen }),
    [busy, canManage, canViewRegister, isSuperAdmin, month, onClose, onReopen, year]
  );

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const term = (params.search ?? '').trim().toLowerCase();

      const filtered = rows.filter((r) => {
        if (stateFilter !== 'all' && closeStateOf(r) !== stateFilter) return false;
        if (!term) return true;
        return r.institution_name.toLowerCase().includes(term);
      });

      const sortBy = params.sort_by;
      if (sortBy && sortBy !== 'created_at') {
        const dir = params.sort_order === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
          const av = sortBy === 'state' ? CLOSE_STATE_RANK[closeStateOf(a)] : a[sortBy as keyof AttendancePeriodConsoleRow];
          const bv = sortBy === 'state' ? CLOSE_STATE_RANK[closeStateOf(b)] : b[sortBy as keyof AttendancePeriodConsoleRow];
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          // Counts must compare numerically — localeCompare puts 9 above 51.
          if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
          return String(av).localeCompare(String(bv)) * dir;
        });
      } else {
        // 'created_at' is the DataTable's built-in initial sortBy and matches no
        // column here, so it means "use the default order" — which for this
        // screen is the working order, then name.
        filtered.sort(
          (a, b) =>
            CLOSE_STATE_RANK[closeStateOf(a)] - CLOSE_STATE_RANK[closeStateOf(b)] ||
            a.institution_name.localeCompare(b.institution_name)
        );
      }

      // Clamp rather than return an empty slice: narrowing a filter while on a
      // later page would otherwise render a blank table.
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
    [rows, stateFilter]
  );

  const renderMobileRow = useCallback(
    (r: AttendancePeriodConsoleRow) => {
      const state = closeStateOf(r);
      const { from, to } = monthBounds(year, month);
      const href = (tab: string) =>
        `/hr/leave/approvals?tab=${tab}&institution=${r.institution_id}&from=${from}&to=${to}`;

      return (
        <div className='space-y-2 rounded-md border p-3'>
          <div className='flex items-start justify-between gap-2'>
            <span className='min-w-0 flex-1 text-sm font-medium'>{r.institution_name}</span>
            <Badge
              variant={state === 'nodata' ? 'secondary' : 'outline'}
              className='shrink-0 font-normal'
            >
              {CLOSE_STATE_LABEL[state]}
            </Badge>
          </div>
          <p className='text-xs text-muted-foreground'>
            {r.staff_with_records} of {r.active_staff} staff in biometric ·{' '}
            {r.record_count.toLocaleString('en-IN')} records
            {r.unprocessed_days > 0 && ` · ${r.unprocessed_days} unjudged`}
          </p>

          {state !== 'nodata' && (
            <dl className='grid grid-cols-3 gap-2 text-xs'>
              {([
                ['Leave', r.pending_leave, APPROVAL_TABS.leave],
                ['Short time off', r.pending_short_time_off, APPROVAL_TABS.sto],
                ['Comp off', r.pending_comp_off, APPROVAL_TABS.comp],
              ] as const).map(([label, count, tab]) => (
                <div key={label} className='rounded-md border p-2'>
                  <dt className='text-[11px] text-muted-foreground'>{label}</dt>
                  <dd className='mt-0.5'>
                    {count === 0 ? (
                      <span className='tabular-nums text-muted-foreground'>0</span>
                    ) : (
                      <Link
                        href={href(tab)}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='inline-flex items-center gap-1 font-medium tabular-nums text-amber-700 dark:text-amber-400'
                      >
                        {count}
                        <ExternalLink className='h-3 w-3 opacity-60' />
                      </Link>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <div className='flex flex-wrap gap-2 pt-1'>
            {state === 'closed'
              ? (
                  <>
                    {/* Closing exists so payroll can read the month — carry the
                        institution and month into the register rather than
                        making someone re-pick both. */}
                    {canViewRegister && (
                      <Button asChild variant='outline' size='sm' className='h-8'>
                        <Link
                          href={`/hr/payroll/register?institution=${r.institution_id}&year=${year}&month=${month}`}
                        >
                          <FileSpreadsheet className='mr-1.5 h-3.5 w-3.5' />
                          Salary register
                        </Link>
                      </Button>
                    )}
                    {isSuperAdmin && (
                      <Button variant='outline' size='sm' className='h-8' onClick={() => onReopen(r)}>
                        <LockOpen className='mr-1.5 h-3.5 w-3.5' />
                        Reopen
                      </Button>
                    )}
                  </>
                )
              : canManage && (
                  <Button
                    size='sm'
                    className='h-8'
                    disabled={state !== 'ready' || busy}
                    onClick={() => onClose(r)}
                  >
                    <CalendarCheck className='mr-1.5 h-3.5 w-3.5' />
                    Close month
                  </Button>
                )}
          </div>
          {state === 'review' && (
            <p className='text-[11px] text-muted-foreground'>
              Decide all {r.pending_total} request(s) before this month can be closed.
            </p>
          )}
        </div>
      );
    },
    [busy, canManage, canViewRegister, isSuperAdmin, month, onClose, onReopen, year]
  );

  return (
    <DataTable
      fetchDataFn={fetchData as never}
      getColumns={() => columns as never}
      renderMobileRow={renderMobileRow as never}
      idField='institution_id'
      exportConfig={{
        entityName: `attendance-month-close-${year}-${String(month).padStart(2, '0')}`,
        columnMapping: Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.key, c.label])),
        columnWidths: EXPORT_COLUMNS.map((c) => ({ wch: c.width })),
        headers: EXPORT_COLUMNS.map((c) => c.key),
        // Without this the sheet exports row[undefined] for every cell. Typed
        // against ExportableData because TData collapses to it once fetchDataFn
        // is cast — an interface has no implicit index signature.
        transformFunction: (row: ExportableData) => {
          const r = row as unknown as AttendancePeriodConsoleRow;
          return {
            college: r.institution_name,
            state: CLOSE_STATE_LABEL[closeStateOf(r)],
            in_biometric: r.staff_with_records,
            active_staff: r.active_staff,
            coverage: r.active_staff > 0
              ? Math.round((r.staff_with_records / r.active_staff) * 100)
              : '',
            relieved: r.relieved_with_records,
            records: r.record_count,
            p_leave: r.pending_leave,
            p_sto: r.pending_short_time_off,
            p_comp: r.pending_comp_off,
            a_total: r.approved_leave + r.approved_short_time_off + r.approved_comp_off,
            unjudged: r.unprocessed_days,
            closed_on: r.locked_at ? r.locked_at.slice(0, 10) : '',
          };
        },
      }}
      config={{
        enableUrlState: true,
        enableSearch: true,
        searchPlaceholder: 'Search institution…',
        enableDateFilter: false,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        // No bulk action exists: closing is per institution, and each one has a
        // different set of blockers.
        enableRowSelection: false,
        enableExport: true,
        columnResizingTableId: 'hr-attendance-month-close',
      }}
    />
  );
}
