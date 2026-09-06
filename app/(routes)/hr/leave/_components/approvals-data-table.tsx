'use client';

// HR Leave Approvals — advanced DataTable wrapper (2026-08-20).
//
// The queue was a plain RequestTable: no sorting, no column visibility, no
// export, no pagination, and — because the REST route defaulted to pageSize 50
// and the page never overrode it — no way to reach rows 51..446 at all.
//
// DataTable does NOT read through React Query; it owns its own state and calls
// fetchDataFn directly. The rows are already in the page's React Query cache
// (one hr_leave_approval_queue() call feeds both tabs, the tab counts and the
// filter options), so fetchDataFn here is a PURE in-memory pager over that
// array rather than a second fetch. refetchKey carries the query's
// dataUpdatedAt so a refetch or a post-decision invalidate re-runs it.
//
// enableUrlState is OFF, deliberately. This page already owns ?tab= for its
// sub-tabs, and two tables alternating behind one URL would fight over the
// shared page/search/sort keys — switching tabs would restore the other tab's
// page number.

import { useCallback, useMemo, type ReactNode } from 'react';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import type { PeriodRange } from './period-filter';
import {
  getLeaveApprovalColumns,
  getShortTimeOffColumns,
  hoursFor,
  type ApprovalColumnActions,
} from './approval-queue-columns';
import { ApprovalRowActions } from './approval-row-actions';
import type { HRLeaveApprovalQueueRow } from '@/types/hr';

export interface ApprovalFilterState {
  /** 'any' or an institutions.id. */
  institutionId: string;
  /** 'any' or an hr_leave_types.id. */
  leaveTypeId: string;
  /** 'open' = pending + escalated (the default work queue); 'any' = everything
   *  the RPC returned, decided history included. */
  status:
    | 'open'
    | 'any'
    | 'pending'
    | 'escalated'
    | 'approved'
    | 'rejected'
    | 'withdrawn'
    | 'cancelled';
  /** Only rows whose CURRENT step routes to me. */
  mineOnly: boolean;
  emergencyOnly: boolean;
  period: PeriodRange;
}

export const emptyApprovalFilters = (period: PeriodRange): ApprovalFilterState => ({
  institutionId: 'any',
  leaveTypeId: 'any',
  status: 'open',
  mineOnly: false,
  emergencyOnly: false,
  period,
});

export function approvalFiltersActive(f: ApprovalFilterState): boolean {
  return (
    f.institutionId !== 'any' ||
    f.leaveTypeId !== 'any' ||
    f.status !== 'open' ||
    f.mineOnly ||
    f.emergencyOnly ||
    f.period.preset !== 'all'
  );
}

/** Every field the toolbar search box looks at. */
function haystack(r: HRLeaveApprovalQueueRow): string {
  return [
    r.staff_name,
    r.staff_code,
    r.leave_type_name,
    r.leave_type_code,
    r.institution_name,
    r.reason,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function matchesApprovalFilters(
  r: HRLeaveApprovalQueueRow,
  f: ApprovalFilterState,
  search: string
): boolean {
  // NOT date-filtered unless asked. An approval queue must show everything
  // awaiting a decision; a "This Month" default would hide a request dated next
  // month from its approver entirely.
  if (f.period.preset !== 'all' && !(r.start_date <= f.period.to && r.end_date >= f.period.from)) {
    return false;
  }
  if (f.institutionId !== 'any' && r.institution_id !== f.institutionId) return false;
  if (f.leaveTypeId !== 'any' && r.leave_type_id !== f.leaveTypeId) return false;
  if (f.status === 'open') {
    if (r.status !== 'pending' && r.status !== 'escalated') return false;
  } else if (f.status !== 'any' && r.status !== f.status) {
    return false;
  }
  if (f.mineOnly && !r.waiting_on_me) return false;
  if (f.emergencyOnly && !r.is_emergency) return false;

  const q = search.trim().toLowerCase();
  if (q && !haystack(r).includes(q)) return false;
  return true;
}

interface Props {
  /** Already narrowed to one request_category by the page. */
  rows: HRLeaveApprovalQueueRow[];
  variant: 'leave' | 'short';
  filters: ApprovalFilterState;
  actions: ApprovalColumnActions;
  /** The React Query dataUpdatedAt, so a refetch re-runs fetchDataFn. */
  refetchKey: number;
  /**
   * Advanced filter controls, rendered into the DataTable toolbar. A function
   * rather than a node so the page can put a bulk-approve button beside the
   * filters using the table's own selection state.
   */
  toolbar: (sel: ToolbarSelection) => ReactNode;
}

export interface ToolbarSelection {
  selectedRows: HRLeaveApprovalQueueRow[];
  totalSelectedCount: number;
  resetSelection: () => void;
}

export function ApprovalsDataTable({
  rows, variant, filters, actions, refetchKey, toolbar,
}: Props) {
  const columns = useMemo(
    () => (variant === 'short' ? getShortTimeOffColumns(actions) : getLeaveApprovalColumns(actions)),
    [variant, actions]
  );

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const filtered = rows.filter((r) => matchesApprovalFilters(r, filters, params.search ?? ''));

      // The RPC already returns created_at DESC; a header click overrides it.
      const sortBy = params.sort_by;
      if (sortBy && sortBy !== 'created_at') {
        const dir = params.sort_order === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
          const av = sortBy === 'hours' ? hoursFor(a) : a[sortBy as keyof HRLeaveApprovalQueueRow];
          const bv = sortBy === 'hours' ? hoursFor(b) : b[sortBy as keyof HRLeaveApprovalQueueRow];
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          // total_days arrives as a numeric string; compare it as a number so
          // "10.00" does not sort before "2.00".
          const an = Number(av);
          const bn = Number(bv);
          if (Number.isFinite(an) && Number.isFinite(bn) && typeof av !== 'boolean') {
            return (an - bn) * dir;
          }
          return String(av).localeCompare(String(bv)) * dir;
        });
      }

      // Clamp rather than return an empty slice: narrowing a filter while on
      // page 3 would otherwise render a blank table with no way back.
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
    [rows, filters]
  );

  // A nine-column table is unusable under 768 px; the card keeps every field an
  // approver needs to decide without opening anything.
  const renderMobileRow = useCallback(
    (r: HRLeaveApprovalQueueRow) => (
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {r.staff_name ?? 'Unknown staff'}
            </span>
            <span className="block truncate font-mono text-xs text-muted-foreground">
              {r.staff_code ?? 'no staff ID'}
            </span>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{r.status}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{r.institution_name ?? '—'}</p>
        <p className="text-sm">{r.leave_type_name ?? '—'}</p>
        <p className="text-xs text-muted-foreground">
          {variant === 'short'
            ? `${r.start_date} · ${(r.start_time ?? '').slice(0, 5)}–${(r.end_time ?? '').slice(0, 5)}`
            : `${r.start_date} → ${r.end_date}`}
        </p>
        {r.reason && <p className="text-xs text-muted-foreground">{r.reason}</p>}
        <div className="flex justify-end">
          {/* Same menu as the table, so a decision goes through one code path
              on every breakpoint. */}
          <ApprovalRowActions row={r} handlers={actions} />
        </div>
      </div>
    ),
    [variant, actions]
  );

  return (
    <DataTable
      fetchDataFn={fetchData as never}
      getColumns={() => columns as never}
      renderMobileRow={renderMobileRow as never}
      renderToolbarContent={(props) =>
        toolbar({
          // DataTable types its rows as ExportableData; the rows it hands back
          // are the ones fetchDataFn returned, so this narrows rather than casts
          // across unrelated shapes.
          selectedRows: props.selectedRows as unknown as HRLeaveApprovalQueueRow[],
          totalSelectedCount: props.totalSelectedCount,
          resetSelection: props.resetSelection,
        })
      }
      idField="id"
      exportConfig={{
        entityName: variant === 'short' ? 'hr-short-time-off-approvals' : 'hr-leave-approvals',
        columnMapping: {
          staff_name: 'Staff Member',
          staff_code: 'Staff ID',
          institution_name: 'Institution',
          leave_type_name: variant === 'short' ? 'Type' : 'Leave',
          start_date: variant === 'short' ? 'Date' : 'Start Date',
          end_date: 'End Date',
          start_time: 'From',
          end_time: 'To',
          total_days: 'Total Days',
          duration_type: 'Duration',
          reason: 'Reason',
          status: 'Status',
        },
        columnWidths: [],
        headers: [],
      }}
      config={{
        enableUrlState: false,
        enableSearch: true,
        searchPlaceholder: 'Search name, staff ID, type or reason…',
        enableDateFilter: false,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        // Bulk approve needs it. The checkbox column is added by the DataTable
        // itself, so no column definition changes.
        enableRowSelection: true,
        enableExport: true,
        // Widths persist in localStorage under this id. The -v2 suffix retires
        // anything stored while the actions column was still 150px wide and
        // clipping the Approve button.
        columnResizingTableId:
          variant === 'short' ? 'hr-short-time-off-approvals-v2' : 'hr-leave-approvals-v2',
      }}
      refetchKey={refetchKey}
    />
  );
}
