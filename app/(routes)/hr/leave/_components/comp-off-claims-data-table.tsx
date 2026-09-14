'use client';

// Comp Off Claims — advanced DataTable wrapper (2026-09-11).
//
// Same shape as approvals-data-table.tsx: DataTable owns its own paging state
// and calls fetchDataFn directly, while the rows are already in React Query's
// cache, so fetchDataFn is a PURE in-memory filter/sort/pager over them.
// refetchKey carries a counter the parent bumps whenever the rows or filters
// change, so the table re-runs it.
//
// enableUrlState is OFF: the page already owns ?tab= for its sub-tabs, and the
// sibling tables would fight over shared page/search/sort keys.

import { useCallback, useMemo, type ReactNode } from 'react';
import { FileText } from 'lucide-react';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import {
  CompOffClaimRowActions,
  fmtClaimDate,
  getCompOffClaimColumns,
  type CompOffClaimActions,
} from './comp-off-claim-columns';
import {
  matchesCompOffClaimFilters,
  type CompOffClaimFilterState,
  type CompOffClaimTableRow,
} from './comp-off-claims-filters';

export interface CompOffToolbarSelection {
  selectedRows: CompOffClaimTableRow[];
  totalSelectedCount: number;
  resetSelection: () => void;
}

interface Props {
  rows: CompOffClaimTableRow[];
  filters: CompOffClaimFilterState;
  actions: CompOffClaimActions;
  refetchKey: number;
  toolbar: (sel: CompOffToolbarSelection) => ReactNode;
}

/** Numeric compare for number-ish values, string compare otherwise, nulls last. */
function compare(av: unknown, bv: unknown, dir: number): number {
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
  return String(av).localeCompare(String(bv)) * dir;
}

export function CompOffClaimsDataTable({ rows, filters, actions, refetchKey, toolbar }: Props) {
  const columns = useMemo(() => getCompOffClaimColumns(actions), [actions]);

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const filtered = rows.filter((r) =>
        matchesCompOffClaimFilters(r, filters, params.search ?? '', actions.today)
      );

      // Rows arrive worked_date ascending (oldest — closest to expiry — first).
      const sortBy = params.sort_by as keyof CompOffClaimTableRow | undefined;
      if (sortBy) {
        const dir = params.sort_order === 'asc' ? 1 : -1;
        filtered.sort((a, b) => compare(a[sortBy], b[sortBy], dir));
      }

      // Clamp: narrowing a filter while on page 3 must not strand a blank page.
      const limit = params.limit || 10;
      const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
      const page = Math.min(Math.max(1, params.page || 1), totalPages);
      const start = (page - 1) * limit;

      return {
        success: true,
        data: filtered.slice(start, start + limit),
        pagination: { page, limit, total_pages: totalPages, total_items: filtered.length },
      };
    },
    [rows, filters, actions.today]
  );

  // The only view under 768px, so it carries everything needed to decide.
  const renderMobileRow = useCallback(
    (r: CompOffClaimTableRow) => (
      <div className="space-y-1.5 rounded-md border p-3">
        <div className="flex items-start justify-between gap-2">
          <button type="button" className="min-w-0 text-left" onClick={() => actions.onView(r)}>
            <span className="block truncate text-sm font-medium">{r.employee_name}</span>
            <span className="block truncate font-mono text-xs text-muted-foreground">
              {r.employee_code ?? 'no staff ID'}
            </span>
          </button>
          <span className="shrink-0 text-xs text-muted-foreground">{r.status_label}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{r.institution_name ?? '—'}</p>
        <p className="text-sm">
          Worked {fmtClaimDate(r.worked_date)} · {r.location_label}
          {r.work_place ? ` — ${r.work_place}` : ''}
        </p>
        {r.biometric_label && <p className="text-xs">{r.biometric_label}</p>}
        <p className="text-xs text-muted-foreground">Expires {fmtClaimDate(r.expires_on)}</p>
        {(r.documents?.length ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => actions.onViewProof(r)}
            className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
          >
            <FileText className="h-3.5 w-3.5" />
            {r.documents.length > 1 ? `View ${r.documents.length} documents` : 'View proof'}
          </button>
        )}
        <CompOffClaimRowActions row={r} actions={actions} />
      </div>
    ),
    [actions]
  );

  return (
    <DataTable
      fetchDataFn={fetchData as never}
      getColumns={() => columns as never}
      renderMobileRow={renderMobileRow as never}
      renderToolbarContent={(props) =>
        toolbar({
          selectedRows: props.selectedRows as unknown as CompOffClaimTableRow[],
          totalSelectedCount: props.totalSelectedCount,
          resetSelection: props.resetSelection,
        })
      }
      idField="id"
      exportConfig={{
        entityName: 'hr-comp-off-claims',
        columnMapping: {
          employee_name: 'Team Member',
          employee_code: 'Staff ID',
          institution_name: 'Institution',
          worked_date: 'Worked Date',
          location_label: 'Location',
          work_place: 'Place of Work',
          biometric_label: 'Biometric',
          expires_on: 'Expires',
          credit_days: 'Days',
          status_label: 'Status',
          decided_at: 'Decided On',
          rejection_reason: 'Rejection Reason',
          notes: 'Notes',
        },
        columnWidths: [],
        headers: [],
      }}
      config={{
        enableUrlState: false,
        enableSearch: true,
        searchPlaceholder: 'Search name, staff ID, place or notes…',
        enableDateFilter: false,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        enableRowSelection: true,
        enableExport: true,
        columnResizingTableId: 'hr-comp-off-claims-v1',
      }}
      refetchKey={refetchKey}
    />
  );
}
