'use client';

/**
 * Advanced DataTable wrapper for the payroll-organisation directory.
 *
 * The rows are fetched ONCE by the page (useStaffPayerDirectory) and passed in,
 * rather than re-fetched here: the page needs the same array to build the filter
 * options and the coverage cards, and a second call would mean two round trips
 * to the same SECURITY DEFINER RPC on every mount.
 *
 * Filtering, search, sorting and paging therefore all happen in memory. That is
 * appropriate at this size — 744 rows, and the RPC takes no arguments — but it
 * IS the reason this file owns the predicates. If the directory ever reaches a
 * few thousand rows, parameterise the RPC and page in the query instead.
 *
 * DataTable re-runs fetchDataFn whenever its identity changes (the fetch effect
 * lists it as a dependency), so the useCallback deps below are what makes a
 * filter change repaint the table. No refetchKey bridge is needed.
 */

import { useCallback, useMemo } from 'react';
import { Building2, Loader2 } from 'lucide-react';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import type { ExportableData } from '@/components/data-table/utils/export-utils';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  PayrollOrganization,
  StaffPayerRow,
} from '@/lib/services/hr/payroll/staff-payroll-service';

import { getPayerDirectoryColumns } from './payer-directory-columns';
import {
  matchesDirectoryFilters,
  type PayerDirectoryFilterState,
} from './payer-directory-filters';

interface PayerDirectoryDataTableProps {
  rows: StaffPayerRow[];
  filters: PayerDirectoryFilterState;
  organizations: PayrollOrganization[];
  canManage: boolean;
  savingStaffId: string | null;
  /** True while a bulk assign is in flight — disables the toolbar picker. */
  isBulkSaving: boolean;
  onAssign: (row: StaffPayerRow, hrOrganizationId: string) => void;
  onClear: (row: StaffPayerRow) => void;
  onBulkAssign: (
    staffIds: string[],
    hrOrganizationId: string,
    resetSelection: () => void
  ) => void;
}

/**
 * Export keys are deliberately DISTINCT from the table's column ids
 * (person_name, staff_code, …). data-export.tsx drops any export header whose
 * name collides with a HIDDEN column id; non-colliding keys are treated as new
 * columns and always emitted, so the export stays complete no matter what the
 * user has hidden.
 */
const EXPORT_COLUMNS: Array<{ key: string; label: string; width: number }> = [
  { key: 'team_member', label: 'Team Member', width: 28 },
  { key: 'code', label: 'Staff Code', width: 14 },
  { key: 'role', label: 'Role', width: 26 },
  { key: 'works_at', label: 'Works At', width: 34 },
  { key: 'payer', label: 'Paid By', width: 34 },
  { key: 'payer_status', label: 'Payer Status', width: 14 },
];

export function PayerDirectoryDataTable({
  rows,
  filters,
  organizations,
  canManage,
  savingStaffId,
  isBulkSaving,
  onAssign,
  onClear,
  onBulkAssign,
}: PayerDirectoryDataTableProps) {
  const columns = useMemo(
    () =>
      getPayerDirectoryColumns({
        organizations,
        canManage,
        savingStaffId,
        onAssign,
        onClear,
      }),
    [organizations, canManage, savingStaffId, onAssign, onClear]
  );

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const term = (params.search ?? '').trim().toLowerCase();

      // matchesDirectoryFilters is shared with the filter bar's option counts.
      // They used to carry separate copies of this predicate, which is how the
      // "Works at" dropdown came to advertise a count the table could not
      // deliver. One definition, so they cannot disagree again.
      const filtered = rows.filter((r) => {
        if (!matchesDirectoryFilters(r, filters)) return false;
        if (!term) return true;
        return (
          r.person_name?.toLowerCase().includes(term) ||
          r.staff_code?.toLowerCase().includes(term) ||
          r.role_title?.toLowerCase().includes(term) ||
          r.works_at_name?.toLowerCase().includes(term) ||
          r.payer_org_name?.toLowerCase().includes(term)
        );
      });

      // The RPC's own ORDER BY puts unassigned first, then institution,
      // designation, name. 'created_at' is the DataTable's built-in initial
      // sortBy and matches no column here, so it means "keep the server order".
      const sortBy = params.sort_by;
      if (sortBy && sortBy !== 'created_at') {
        const dir = params.sort_order === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
          const av = a[sortBy as keyof StaffPayerRow];
          const bv = b[sortBy as keyof StaffPayerRow];
          // Nulls last regardless of direction — an unassigned row sorting into
          // the middle of the payer column reads as a data error.
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return String(av).localeCompare(String(bv)) * dir;
        });
      }

      // Clamp rather than return an empty slice: narrowing a filter while on
      // page 30 would otherwise render a blank table whose only way back is the
      // pager. Clamping shows the last real page instead.
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

  // A seven-column table is unreadable under 768 px; the card layout keeps the
  // picker as the primary action.
  const renderMobileRow = useCallback(
    (r: StaffPayerRow) => (
      <div className='space-y-2 rounded-md border p-3'>
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0'>
            <p className='truncate text-sm font-medium'>{r.person_name || '—'}</p>
            <p className='font-mono text-xs text-muted-foreground'>
              {r.staff_code || '—'}
            </p>
          </div>
          {r.payer_org_id ? (
            <Badge variant='outline' className='shrink-0 font-normal'>
              Recorded
            </Badge>
          ) : (
            <Badge
              variant='outline'
              className='shrink-0 border-amber-300 font-normal text-amber-700 dark:border-amber-800 dark:text-amber-400'
            >
              Awaiting
            </Badge>
          )}
        </div>
        <div className='flex flex-wrap gap-1'>
          {r.role_title && (
            <Badge variant='secondary' className='font-normal'>
              {r.role_title}
            </Badge>
          )}
          <Badge variant='outline' className='font-normal'>
            Works at {r.works_at_name}
          </Badge>
        </div>
        {canManage ? (
          <Select
            value={r.payer_org_id ?? undefined}
            disabled={savingStaffId === r.staff_uuid}
            onValueChange={(v) => onAssign(r, v)}
          >
            <SelectTrigger className='h-8'>
              <SelectValue placeholder='Not recorded — choose…' />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className='text-xs text-muted-foreground'>
            Paid by {r.payer_org_name ?? 'nobody yet'}
          </p>
        )}
      </div>
    ),
    [canManage, organizations, savingStaffId, onAssign]
  );

  /**
   * Bulk assign. The outstanding rows are dominated by groups who share a payer
   * by construction — 30 bus drivers, 16 hostel scavengers — so filtering to a
   * role, selecting the page and picking one organisation is the whole job.
   *
   * It works on already-assigned rows too: the upsert updates rather than
   * inserts, which is how a whole cohort gets MOVED to a different payer.
   */
  const renderToolbarContent = useCallback(
    ({
      allSelectedIds,
      totalSelectedCount,
      resetSelection,
    }: {
      selectedRows: StaffPayerRow[];
      allSelectedIds: (string | number)[];
      totalSelectedCount: number;
      resetSelection: () => void;
    }) => {
      if (!canManage || totalSelectedCount === 0) return null;

      return (
        <div className='flex items-center gap-2'>
          <span className='hidden text-sm text-muted-foreground sm:inline'>
            {totalSelectedCount} selected
          </span>
          <Select
            disabled={isBulkSaving}
            onValueChange={(v) =>
              onBulkAssign(allSelectedIds.map(String), v, resetSelection)
            }
          >
            <SelectTrigger className='h-8 w-56'>
              {isBulkSaving ? (
                <span className='flex items-center gap-2'>
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                  Recording…
                </span>
              ) : (
                <span className='flex items-center gap-2'>
                  <Building2 className='h-3.5 w-3.5' />
                  <SelectValue placeholder='Set payer for selected…' />
                </span>
              )}
            </SelectTrigger>
            <SelectContent>
              {organizations.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    },
    [canManage, isBulkSaving, organizations, onBulkAssign]
  );

  return (
    <DataTable
      fetchDataFn={fetchData as never}
      getColumns={() => columns as never}
      renderMobileRow={renderMobileRow as never}
      renderToolbarContent={renderToolbarContent as never}
      idField='staff_uuid'
      exportConfig={{
        entityName: 'payroll-organisation',
        columnMapping: Object.fromEntries(
          EXPORT_COLUMNS.map((c) => [c.key, c.label])
        ),
        columnWidths: EXPORT_COLUMNS.map((c) => ({ wch: c.width })),
        headers: EXPORT_COLUMNS.map((c) => c.key),
        // Without this the sheet exports row[undefined] for every cell.
        //
        // Typed against ExportableData, not StaffPayerRow: TData collapses to
        // ExportableData because fetchDataFn is cast (an interface has no
        // implicit index signature and so can never satisfy Record<string, …>),
        // so the row is narrowed here instead of in the signature.
        transformFunction: (row: ExportableData) => {
          const r = row as unknown as StaffPayerRow;
          return {
            team_member: r.person_name ?? '',
            code: r.staff_code ?? '',
            role: r.role_title ?? '',
            works_at: r.works_at_name ?? '',
            payer: r.payer_org_name ?? '',
            payer_status: r.payer_org_id ? 'Recorded' : 'Awaiting',
          };
        },
      }}
      config={{
        enableUrlState: true,
        enableSearch: true,
        searchPlaceholder: 'Search name, code, role, work location or payer…',
        enableDateFilter: false,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        enableRowSelection: canManage,
        enableExport: true,
        columnResizingTableId: 'hr-payroll-organisation-directory',
      }}
    />
  );
}
