'use client';

// "Granted & decided" as the shared advanced DataTable.
//
// The rows are NOT fetched here: the page already holds them in React Query
// (useAllLeaveEligibilities), so this adapts that array to the DataTable's
// fetchDataFn contract and filters, sorts and pages it in memory. Because
// fetchData is rebuilt whenever the rows or the filters change, the table
// re-runs it by itself — a decision, a withdrawal or a new grant refreshes the
// table through the normal query invalidation, with no refresh bridge.

import { useCallback, useMemo } from 'react';
import { format } from 'date-fns';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import { LEAVE_ELIGIBILITY_STATUS_LABELS } from '@/types/hr-leave-types';

import { getEligibilityColumns } from './eligibility-columns';
import type { EligibilityFilterState } from './eligibility-filters';
import { STATUS_TONE, fmtDateOnly, type EligibilityTableRow } from './eligibility-status';
import { filterEligibilityRows, pageOf, sortEligibilityRows } from './eligibility-logic';

interface Props {
  rows: EligibilityTableRow[];
  filters: EligibilityFilterState;
  onViewDocs: (row: EligibilityTableRow) => void;
  onWithdraw: (row: EligibilityTableRow) => void;
}

export function EligibilityDataTable({ rows, filters, onViewDocs, onWithdraw }: Props) {
  const columns = useMemo(
    () => getEligibilityColumns({ onViewDocs, onWithdraw }),
    [onViewDocs, onWithdraw],
  );

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const filtered = filterEligibilityRows(rows, filters, {
        search: params.search ?? '',
        fromDate: params.from_date ?? '',
        toDate: params.to_date ?? '',
      });
      const sorted = sortEligibilityRows(filtered, params.sort_by, params.sort_order);
      return { success: true, ...pageOf(sorted, params.page, params.limit) };
    },
    [rows, filters],
  );

  // Below md the table becomes cards, as on every other DataTable page.
  const renderMobileRow = useCallback(
    (r: EligibilityTableRow) => (
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{r.staff_name ?? '—'}</p>
            <p className="font-mono text-xs text-muted-foreground">{r.staff_code ?? ''}</p>
          </div>
          <Badge className={STATUS_TONE[r.status]} variant="secondary">
            {LEAVE_ELIGIBILITY_STATUS_LABELS[r.status]}
          </Badge>
        </div>
        <p className="text-sm">
          {r.leave_type_name?.trim() ?? '—'}
          {r.institution_name && (
            <span className="block truncate text-xs text-muted-foreground">{r.institution_name}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          Requested {format(new Date(r.created_at), 'dd MMM yyyy')}
          {r.valid_until ? ` · valid until ${fmtDateOnly(r.valid_until)}` : ' · no expiry'}
          {r.granted_directly ? ' · granted by HR' : ''}
        </p>
        <div className="flex gap-2">
          {r.documents.length > 0 && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => onViewDocs(r)}>
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              View{r.documents.length > 1 ? ` (${r.documents.length})` : ''}
            </Button>
          )}
          {r.status === 'approved' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onWithdraw(r)}
            >
              Withdraw
            </Button>
          )}
        </div>
      </div>
    ),
    [onViewDocs, onWithdraw],
  );

  return (
    <DataTable
      fetchDataFn={fetchData as never}
      getColumns={() => columns as never}
      renderMobileRow={renderMobileRow as never}
      idField="id"
      exportConfig={{
        entityName: 'hr-leave-eligibility',
        columnMapping: {
          staff_code: 'Code',
          staff_name: 'Team member',
          institution_name: 'Institution',
          leave_type_name: 'Leave type',
          status: 'Status',
          granted_directly: 'Granted by HR',
          created_at: 'Requested',
          decided_at: 'Decided',
          entitled_days: 'Days',
          valid_until: 'Valid until',
        },
        columnWidths: [],
        headers: [],
      }}
      config={{
        enableUrlState: true,
        enableSearch: true,
        searchPlaceholder: 'Search team member, code or leave type…',
        // Filters the REQUEST date (the "Requested" column).
        enableDateFilter: true,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        enableRowSelection: false,
        enableExport: true,
        columnResizingTableId: 'hr-leave-eligibility-table',
      }}
      // Filters live on the page, outside the table; a narrower set returns fewer
      // rows, so go back to page 1 when they change.
      pageResetKey={JSON.stringify(filters)}
    />
  );
}
