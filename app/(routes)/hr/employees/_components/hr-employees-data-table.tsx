'use client';

// HR Employee Directory — advanced DataTable wrapper (2026-08-28).
//
// WHAT THIS REPLACED. The directory rendered a hand-written <table>: no
// sorting, no column visibility, no resizing, no per-page control, and a
// Previous/Next pair as its only navigation. Export was a separate button
// beside the heading that duplicated the row mapping.
//
// SERVER-SIDE, NOT AN IN-MEMORY PAGER. Unlike the leave approvals table (which
// pages an array React Query already holds), /api/hr/employees is genuinely
// paginated and search is applied in the service layer, so fetchDataFn calls
// the route on every page/search change and returns the server's own counts.
//
// The external filter bar keeps Institution / Department / Status because they
// are cascading selects the toolbar has no equivalent for; SEARCH was removed
// from it, because the DataTable ships its own and two search boxes over one
// list is a trap. Changing a filter remounts nothing — it flows in through
// `filters` and bumps refetchKey, which is the documented way to make the
// table re-run fetchDataFn.

import { useCallback, useMemo } from 'react';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import {
  fetchHREmployeesForExport,
  fetchHREmployeesPage,
} from '@/hooks/hr/use-employees';
import type { HRPersonFilters, HRPersonView } from '@/types/hr';

import { getHREmployeeColumns } from './hr-employee-columns';

/** Institution / Department / Status — everything the toolbar does not own. */
export interface HREmployeeTableFilters {
  institution_id?: string;
  department_id?: string;
  is_active?: boolean;
}

export function HREmployeesDataTable({
  filters,
  refetchKey,
}: {
  filters: HREmployeeTableFilters;
  /** Bumped by the page when a filter changes, so the table refetches. */
  refetchKey: number;
}) {
  const columns = useMemo(() => getHREmployeeColumns(), []);

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const query: HRPersonFilters = {
        ...filters,
        search: params.search || undefined,
        page: params.page || 1,
        pageSize: params.limit || 25,
      };

      const res = await fetchHREmployeesPage(query);

      return {
        success: true,
        data: res.data,
        pagination: {
          page: res.metadata.page,
          // The route names it pageSize; DataFetchResult names it limit. The
          // `as never` cast on fetchDataFn means TypeScript will NOT catch a
          // mismatch here — it has to be read off HRPersonListResponse.
          limit: res.metadata.pageSize,
          total_pages: res.metadata.totalPages,
          total_items: res.metadata.total,
        },
      };
    },
    [filters]
  );

  /**
   * Export pulls EVERY matching row, not the visible page. The route's
   * `export=1` mode is permission-gated server-side on hr.employees.export, so
   * a viewer without it gets a 403 here rather than a silently short file.
   */
  const fetchAllItems = useCallback(
    (params: DataFetchParams) =>
      // fetchHREmployeesForExport, NOT a page fetch with exportAll: the route
      // switches on `export=1` in the query string and ignores the filter
      // object's exportAll, so building the request by hand here would have
      // silently exported page one.
      fetchHREmployeesForExport({
        ...filters,
        search: params.search || undefined,
      }),
    [filters]
  );

  // A ten-column table is unreadable under 768px; the card keeps the fields
  // someone actually scans for on a phone.
  const renderMobileRow = useCallback(
    (r: HRPersonView) => (
      <div className="space-y-1 rounded-md border p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium">
            {`${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Unnamed'}
          </span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {r.employee_code ?? '—'}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{r.institution_name ?? '—'}</p>
        <p className="truncate text-xs text-muted-foreground">{r.email ?? '—'}</p>
      </div>
    ),
    []
  );

  return (
    <DataTable
      fetchDataFn={fetchData as never}
      fetchAllItemsFn={fetchAllItems as never}
      getColumns={() => columns as never}
      renderMobileRow={renderMobileRow as never}
      idField="id"
      exportConfig={{
        entityName: 'hr-employees',
        columnMapping: {
          employee_code: 'Employee Code',
          first_name: 'First Name',
          last_name: 'Last Name',
          email: 'Email',
          phone: 'Phone',
          designation_name: 'Designation',
          cadre_name: 'Cadre',
          role_names: 'Role',
          biometric_code: 'Biometric Code',
          biometric_machine_name: 'Biometric Machine',
          organization_name: 'HR Organization',
          institution_name: 'Work Institution',
          department_name: 'Department',
          is_active: 'Active',
        },
        columnWidths: [],
        headers: [],
      }}
      config={{
        enableUrlState: true,
        enableSearch: true,
        searchPlaceholder: 'Search name, code or email…',
        enableDateFilter: false,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        // Read-only directory: there is no bulk action to select rows FOR.
        enableRowSelection: false,
        enableExport: true,
        columnResizingTableId: 'hr-employees-table',
      }}
      refetchKey={refetchKey}
    />
  );
}
