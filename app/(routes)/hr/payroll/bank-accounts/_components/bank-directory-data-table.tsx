'use client';

/**
 * Advanced DataTable wrapper for the bank-account directory.
 *
 * Rows are fetched ONCE by the page and passed in, so the cards, the filter
 * counts and the table all read the same array — the pattern
 * payer-directory-data-table.tsx records.
 *
 * THE EXPORT MASKS THE ACCOUNT NUMBER. Every other directory in this module
 * exports what it displays, and this one deliberately exports LESS than the
 * database holds: a spreadsheet of 754 full account numbers leaving the app is
 * the single worst outcome this screen could produce, and no reporting need
 * justifies it. The last four digits still identify a row for reconciliation.
 */

import { useCallback, useMemo } from 'react';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import type { ExportableData } from '@/components/data-table/utils/export-utils';
import { Badge } from '@/components/ui/badge';
import { isPayable, maskAccountNumber } from '@/lib/hr/payroll/bank-account-validation';
import type { StaffBankDirectoryRow } from '@/lib/services/hr/payroll/staff-bank-account-service';

import { getBankAccountColumns } from './bank-account-columns';
import { matchesBankFilters, type BankFilterState } from './bank-account-filters';

const EXPORT_COLUMNS: Array<{ key: string; label: string; width: number }> = [
  { key: 'employee', label: 'Employee', width: 28 },
  { key: 'code', label: 'Employee ID', width: 14 },
  { key: 'works_at', label: 'Works At', width: 32 },
  { key: 'holder', label: 'Account Holder', width: 28 },
  { key: 'account_masked', label: 'Account (last 4)', width: 16 },
  { key: 'ifsc', label: 'IFSC', width: 14 },
  { key: 'bank', label: 'Bank', width: 26 },
  { key: 'branch', label: 'Branch', width: 22 },
  { key: 'acct_type', label: 'Account Type', width: 14 },
  { key: 'state', label: 'State', width: 14 },
];

interface Props {
  rows: StaffBankDirectoryRow[];
  filters: BankFilterState;
  canManage: boolean;
  onEdit: (row: StaffBankDirectoryRow) => void;
  onViewHistory: (row: StaffBankDirectoryRow) => void;
  onToggleVerified: (row: StaffBankDirectoryRow) => void;
}

export function BankDirectoryDataTable({
  rows,
  filters,
  canManage,
  onEdit,
  onViewHistory,
  onToggleVerified,
}: Props) {
  const columns = useMemo(
    () => getBankAccountColumns({ onEdit, onViewHistory, onToggleVerified, canManage }),
    [canManage, onEdit, onToggleVerified, onViewHistory]
  );

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const term = (params.search ?? '').trim().toLowerCase();

      const filtered = rows.filter((r) => {
        if (!matchesBankFilters(r, filters)) return false;
        if (!term) return true;
        // The full account number is NOT searchable — only the last four. A
        // search box that matches a whole account number turns this page into a
        // lookup tool for numbers the searcher already has to know.
        const last4 = (r.account_number ?? '').slice(-4);
        return (
          r.person_name.toLowerCase().includes(term) ||
          (r.staff_code ?? '').toLowerCase().includes(term) ||
          r.works_at_name.toLowerCase().includes(term) ||
          (r.account_holder_name ?? '').toLowerCase().includes(term) ||
          (r.bank_name ?? '').toLowerCase().includes(term) ||
          (r.ifsc_code ?? '').toLowerCase().includes(term) ||
          last4 === term
        );
      });

      // 'created_at' is the DataTable's initial sortBy and matches no column
      // here, so it means "keep the RPC's order" — unrecorded first, then
      // unverified, which is the order the work needs doing in.
      const sortBy = params.sort_by;
      if (sortBy && sortBy !== 'created_at') {
        const dir = params.sort_order === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
          const av = a[sortBy as keyof StaffBankDirectoryRow];
          const bv = b[sortBy as keyof StaffBankDirectoryRow];
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return String(av).localeCompare(String(bv)) * dir;
        });
      }

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
    (r: StaffBankDirectoryRow) => (
      <button
        type='button'
        onClick={() => (canManage ? onEdit(r) : onViewHistory(r))}
        className='w-full space-y-2 rounded-md border p-3 text-left'
      >
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0'>
            <p className='truncate text-sm font-medium'>{r.person_name}</p>
            <p className='font-mono text-xs text-muted-foreground'>{r.staff_code ?? '—'}</p>
          </div>
          <span className='shrink-0 font-mono text-sm'>
            {r.account_id ? maskAccountNumber(r.account_number) : (
              <span className='text-xs italic text-muted-foreground'>Not set</span>
            )}
          </span>
        </div>
        <div className='flex flex-wrap gap-1'>
          {r.bank_name && <Badge variant='outline' className='font-normal'>{r.bank_name}</Badge>}
          {/* Mirrors the desktop State column: unpayable outranks unverified. */}
          {r.account_id && !isPayable(r) && (
            <Badge
              variant='outline'
              className='border-orange-300 font-normal text-orange-700 dark:border-orange-800 dark:text-orange-400'
            >
              No IFSC
            </Badge>
          )}
          {r.account_id && isPayable(r) && !r.verified_at && (
            <Badge
              variant='outline'
              className='border-amber-300 font-normal text-amber-700 dark:border-amber-800 dark:text-amber-400'
            >
              Unverified
            </Badge>
          )}
          {!r.is_active && <Badge variant='secondary' className='font-normal'>Relieved</Badge>}
        </div>
      </button>
    ),
    [canManage, onEdit, onViewHistory]
  );

  return (
    <DataTable
      fetchDataFn={fetchData as never}
      getColumns={() => columns as never}
      renderMobileRow={renderMobileRow as never}
      idField='staff_uuid'
      exportConfig={{
        entityName: 'employee-bank-accounts',
        columnMapping: Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.key, c.label])),
        columnWidths: EXPORT_COLUMNS.map((c) => ({ wch: c.width })),
        headers: EXPORT_COLUMNS.map((c) => c.key),
        transformFunction: (row: ExportableData) => {
          const r = row as unknown as StaffBankDirectoryRow;
          return {
            employee: r.person_name,
            code: r.staff_code ?? '',
            works_at: r.works_at_name,
            holder: r.account_holder_name ?? '',
            // Masked on purpose — see the file header.
            account_masked: r.account_id ? maskAccountNumber(r.account_number) : '',
            ifsc: r.ifsc_code ?? '',
            bank: r.bank_name ?? '',
            branch: r.branch_name ?? '',
            acct_type: r.account_type ?? '',
            state: !r.account_id ? 'No account' : r.verified_at ? 'Verified' : 'Unverified',
          };
        },
      }}
      config={{
        enableUrlState: true,
        enableSearch: true,
        searchPlaceholder: 'Search employee, ID, bank, IFSC or last 4 digits…',
        enableDateFilter: false,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        enableRowSelection: false,
        enableExport: true,
        columnResizingTableId: 'hr-payroll-bank-accounts',
      }}
    />
  );
}
