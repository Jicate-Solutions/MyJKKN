'use client';

/**
 * Advanced DataTable wrapper for the Salary Register.
 *
 * Rows are fetched ONCE by the page and passed in, so the summary card, the
 * filter counts and the table all read the same array — the pattern
 * salary-directory-data-table.tsx records, and for the same reason: two
 * independent sources for one list is how a card comes to advertise a total the
 * table cannot show.
 *
 * NO ROW SELECTION. Nothing here is a bulk operation — an adjustment is a
 * per-person decision with a reason — so the checkbox column is deliberately
 * absent and the export covers the filtered set rather than a selection.
 *
 * DataTable re-runs fetchDataFn whenever its identity changes, so `lines` and
 * `filters` in the deps are what make a filter change repaint the table.
 */

import { useCallback, useMemo } from 'react';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import type { ExportableData } from '@/components/data-table/utils/export-utils';
import { Badge } from '@/components/ui/badge';
import { EXCLUSION_LABELS } from '@/lib/services/hr/payroll/salary-register-service';
import type { HRSalaryRegisterLine } from '@/types/hr-payroll';

import {
  REGISTER_HIDDEN_COLUMNS,
  days,
  dmy,
  getRegisterColumns,
  money,
} from './register-columns';
import { matchesRegisterFilters, type RegisterFilterState } from './register-filters';

/**
 * Export keys are deliberately DISTINCT from the column ids. data-export.tsx
 * drops any export header whose name collides with a HIDDEN column id, and this
 * table hides seventeen columns by default — sharing the ids would empty most of
 * the spreadsheet for the reader who never opened the column menu.
 *
 * Order matches the workbook finance already receives, so a spot check against
 * the two lines up row for row.
 */
const EXPORT_COLUMNS: Array<{ key: string; label: string; width: number }> = [
  { key: 'sno', label: 'S.No', width: 7 },
  { key: 'emp_code', label: 'Employee Id', width: 14 },
  { key: 'emp_name', label: 'Employee Name', width: 28 },
  { key: 'role_title', label: 'Designation', width: 22 },
  { key: 'dept', label: 'Department', width: 22 },
  { key: 'doj', label: 'Date Of Join', width: 13 },
  { key: 'bank_ac', label: 'Bank Account', width: 20 },
  { key: 'state', label: 'Status', width: 30 },
  { key: 'd_working', label: 'Business Working Days', width: 12 },
  { key: 'd_paid_leave', label: 'Paid Leave', width: 11 },
  { key: 'd_unpaid_leave', label: 'Unpaid Leave', width: 12 },
  { key: 'd_on_duty', label: 'On Duty', width: 10 },
  { key: 'd_worked', label: 'Worked', width: 10 },
  { key: 'd_paid', label: 'Paid Days', width: 11 },
  { key: 'm_gross', label: 'Actual Gross', width: 14 },
  { key: 'm_basic', label: 'Basic Pay', width: 14 },
  { key: 'm_allowance', label: 'Allowance', width: 13 },
  { key: 'm_unpaid_ded', label: 'Unpaid Leave Deduction', width: 16 },
  { key: 'm_epf', label: 'EPF', width: 12 },
  { key: 'm_esi', label: 'ESI', width: 12 },
  { key: 'm_tds', label: 'TDS', width: 12 },
  { key: 'm_adjust', label: 'Adjustment', width: 13 },
  { key: 'm_earnings', label: 'Total Earnings', width: 15 },
  { key: 'm_deductions', label: 'Total Deductions', width: 15 },
  { key: 'm_net', label: 'Net Pay', width: 15 },
  { key: 'payer', label: 'Paid By', width: 28 },
  { key: 'note', label: 'Remarks', width: 30 },
];

/** A printed page fits far fewer columns than a sheet, so PDF gets a subset. */
const PDF_HEADERS = [
  'sno', 'emp_code', 'emp_name', 'role_title', 'payer', 'd_paid',
  'm_earnings', 'm_deductions', 'm_net', 'state',
];

interface Props {
  lines: HRSalaryRegisterLine[];
  filters: RegisterFilterState;
  canManage: boolean;
  isSuperseded: boolean;
  /** Where "View details" goes; the page owns the run id and the query string. */
  detailHref: (line: HRSalaryRegisterLine) => string;
  onAdjust: (line: HRSalaryRegisterLine) => void;
}

export function RegisterDataTable({
  lines,
  filters,
  canManage,
  isSuperseded,
  detailHref,
  onAdjust,
}: Props) {
  const columns = useMemo(
    () => getRegisterColumns({ detailHref, onAdjust, canManage, isSuperseded }),
    [canManage, detailHref, isSuperseded, onAdjust]
  );

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const term = (params.search ?? '').trim().toLowerCase();

      const filtered = lines.filter((l) => {
        if (!matchesRegisterFilters(l, filters)) return false;
        if (!term) return true;
        return (
          l.staff_name.toLowerCase().includes(term) ||
          (l.employee_code ?? '').toLowerCase().includes(term) ||
          (l.designation ?? '').toLowerCase().includes(term) ||
          (l.department_name ?? '').toLowerCase().includes(term) ||
          (l.paid_by_name ?? '').toLowerCase().includes(term)
        );
      });

      // 'created_at' is the DataTable's built-in initial sortBy and matches no
      // column here, so it means "keep the register's own order" — serial_no,
      // which is the order the workbook and the finance copy are both in.
      const sortBy = params.sort_by;
      if (sortBy && sortBy !== 'created_at') {
        const dir = params.sort_order === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
          const av = a[sortBy as keyof HRSalaryRegisterLine];
          const bv = b[sortBy as keyof HRSalaryRegisterLine];
          if (av == null && bv == null) return 0;
          // Nulls last regardless of direction: an unrecorded payer sorting into
          // the middle of a column reads as a data error.
          if (av == null) return 1;
          if (bv == null) return -1;
          // Amounts must compare numerically — localeCompare puts 7000 above
          // 70000, which on a net-pay column reads as corruption.
          if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
          return String(av).localeCompare(String(bv)) * dir;
        });
      }

      // Clamp rather than return an empty slice: narrowing the status filter
      // while on a later page would otherwise render a blank table whose only
      // way back is the pager.
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
    [filters, lines]
  );

  /** Every row matching the filters, for "export all pages". */
  const fetchAllItems = useCallback(
    async (params: DataFetchParams) => {
      const term = (params.search ?? '').trim().toLowerCase();
      return lines.filter((l) => {
        if (!matchesRegisterFilters(l, filters)) return false;
        if (!term) return true;
        return (
          l.staff_name.toLowerCase().includes(term) ||
          (l.employee_code ?? '').toLowerCase().includes(term) ||
          (l.designation ?? '').toLowerCase().includes(term) ||
          (l.department_name ?? '').toLowerCase().includes(term) ||
          (l.paid_by_name ?? '').toLowerCase().includes(term)
        );
      });
    },
    [filters, lines]
  );

  const renderMobileRow = useCallback(
    (l: HRSalaryRegisterLine) => (
      <div className="w-full space-y-2 rounded-md border p-3 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{l.staff_name}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {l.employee_code ?? '—'}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {l.is_included ? `₹${money(l.net_pay)}` : '—'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="font-normal">
            {days(l.paid_days)} paid days
          </Badge>
          {l.paid_by_name && (
            <Badge variant="outline" className="font-normal">{l.paid_by_name}</Badge>
          )}
          {!l.is_included && (
            <Badge
              variant="outline"
              className="border-amber-300 font-normal text-amber-700 dark:border-amber-800 dark:text-amber-400"
            >
              {l.exclusion_reason ? EXCLUSION_LABELS[l.exclusion_reason] : 'Excluded'}
            </Badge>
          )}
        </div>
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
      initialColumnVisibility={REGISTER_HIDDEN_COLUMNS}
      config={{ enableRowSelection: false }}
      exportConfig={{
        entityName: 'salary-register',
        columnMapping: Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.key, c.label])),
        columnWidths: EXPORT_COLUMNS.map((c) => ({ wch: c.width })),
        headers: EXPORT_COLUMNS.map((c) => c.key),
        pdf: { headers: PDF_HEADERS, orientation: 'landscape' },
        // Without this the sheet exports row[undefined] for every cell. Typed
        // against ExportableData because TData collapses to it once fetchDataFn
        // is cast — an interface has no implicit index signature.
        transformFunction: (row: ExportableData) => {
          const l = row as unknown as HRSalaryRegisterLine;
          // An excluded row has no figures. Blank, not 0 — a zero in a rupee
          // column is a claim, and the claim here is "we did not pay them".
          const m = (n: number) => (l.is_included ? n : '');
          return {
            sno: l.serial_no,
            emp_code: l.employee_code ?? '',
            emp_name: l.staff_name,
            role_title: l.designation ?? '',
            dept: l.department_name ?? '',
            doj: dmy(l.date_of_joining),
            bank_ac: l.bank_account_number ?? '',
            state: l.is_included
              ? 'Paid'
              : l.exclusion_reason
                ? EXCLUSION_LABELS[l.exclusion_reason]
                : 'Excluded',
            d_working: l.business_working_days,
            d_paid_leave: l.paid_leave_days,
            d_unpaid_leave: l.unpaid_leave_days,
            d_on_duty: l.on_duty_days,
            d_worked: l.worked_days,
            d_paid: l.paid_days,
            m_gross: m(l.actual_gross),
            m_basic: m(l.basic_pay),
            m_allowance: m(l.allowance),
            m_unpaid_ded: m(l.unpaid_leave_deduction),
            m_epf: m(l.epf_deduction),
            m_esi: m(l.esi_deduction),
            m_tds: m(l.tds_deduction),
            m_adjust: m(l.adjustment_amount),
            m_earnings: m(l.total_earnings),
            m_deductions: m(l.total_deductions),
            m_net: m(l.net_pay),
            payer: l.paid_by_name ?? '',
            note: l.remarks ?? '',
          };
        },
      }}
    />
  );
}
