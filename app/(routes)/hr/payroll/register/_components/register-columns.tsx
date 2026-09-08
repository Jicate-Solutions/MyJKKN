'use client';

/**
 * Column definitions for the Salary Register.
 *
 * TWENTY-SIX COLUMNS DO NOT FIT A LAPTOP, which is what the hand-rolled table
 * this replaces proved — it carried `min-w-[2060px]` and scrolled sideways on
 * every screen. Identity, day totals and net pay are visible; the rest ship
 * hidden and are one click away in the column menu (see REGISTER_HIDDEN_COLUMNS
 * below, handed to the DataTable as its initial visibility).
 *
 * EVERY COLUMN CARRIES AN EXPLICIT `size`. The DataTable renders cells as
 * `px-4 py-2 truncate max-w-0`, so a column that falls back to the 150px default
 * clips its content off the edge rather than wrapping.
 *
 * INCLUDED AND EXCLUDED ROWS SHARE THIS TABLE. Excluded people work at this
 * institution but produced no payable row; they are the work list, and dropping
 * them would make "who did we not pay, and why" unanswerable from the screen
 * that decided it. The Status column carries the reason, and the money columns
 * render an em dash for them rather than a zero — zero is a different claim.
 */

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal, PencilLine } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { EXCLUSION_LABELS } from '@/lib/services/hr/payroll/salary-register-service';
import type { HRSalaryRegisterLine } from '@/types/hr-payroll';

/** Indian grouping, no currency symbol — the column header already says money. */
export const money = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 22 stays "22"; 1.5 stays "1.5". Half-days are real and must not round away. */
export const days = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * `date_of_joining` is a DATE, not a timestamptz — there is no zone to convert.
 * Split rather than parsed through `new Date('2026-08-01')`, which JavaScript
 * reads as UTC midnight and renders as the 31st in IST.
 */
export const dmy = (iso: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
};

/**
 * Hidden on first load. Passed to the DataTable as `initialColumnVisibility`,
 * after which the choice lives in the URL and belongs to the reader.
 */
export const REGISTER_HIDDEN_COLUMNS: Record<string, boolean> = {
  department_name: false,
  date_of_joining: false,
  bank_account_number: false,
  business_working_days: false,
  paid_leave_days: false,
  unpaid_leave_days: false,
  on_duty_days: false,
  worked_days: false,
  actual_gross: false,
  basic_pay: false,
  allowance: false,
  unpaid_leave_deduction: false,
  epf_deduction: false,
  esi_deduction: false,
  tds_deduction: false,
  adjustment_amount: false,
  remarks: false,
};

/** Right-aligned money. An excluded row has no figures, so it gets an em dash. */
function Money({ value, included, bold }: { value: number; included: boolean; bold?: boolean }) {
  if (!included) return <span className="block text-right text-sm text-muted-foreground">—</span>;
  return (
    <span className={`block text-right text-sm tabular-nums${bold ? ' font-semibold' : ''}`}>
      {money(value)}
    </span>
  );
}

/** A money column that means "nothing here" when zero — EPF for the exempt, say. */
function OptionalMoney({ value, included }: { value: number; included: boolean }) {
  if (!included || value === 0) {
    return <span className="block text-right text-sm text-muted-foreground">—</span>;
  }
  return <span className="block text-right text-sm tabular-nums">{money(value)}</span>;
}

function Days({ value }: { value: number }) {
  return <span className="block text-center text-sm tabular-nums">{days(value)}</span>;
}

export interface RegisterColumnActions {
  /** Where "View details" goes. Built by the caller, which knows the run id. */
  detailHref: (line: HRSalaryRegisterLine) => string;
  onAdjust: (line: HRSalaryRegisterLine) => void;
  /** Whether the viewer holds hr.payroll.register.manage. */
  canManage: boolean;
  /** A superseded run is history; its figures must not be edited. */
  isSuperseded: boolean;
}

export function getRegisterColumns(
  actions: RegisterColumnActions
): ColumnDef<HRSalaryRegisterLine>[] {
  return [
    {
      accessorKey: 'serial_no',
      size: 64,
      header: ({ column }) => <DataTableColumnHeader column={column} title="S.No" />,
      cell: ({ row }) => (
        <span className="block text-center text-sm tabular-nums text-muted-foreground">
          {row.original.serial_no}
        </span>
      ),
    },
    {
      accessorKey: 'employee_code',
      size: 120,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Employee ID" />,
      cell: ({ row }) => (
        <span className="truncate font-mono text-xs">{row.original.employee_code ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'staff_name',
      size: 220,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
      cell: ({ row }) => (
        <Link
          href={actions.detailHref(row.original)}
          className="block truncate text-sm font-medium hover:underline"
        >
          {row.original.staff_name}
        </Link>
      ),
    },
    {
      accessorKey: 'designation',
      size: 170,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Designation" />,
      cell: ({ row }) => (
        <span className="truncate text-sm text-muted-foreground">
          {row.original.designation ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'department_name',
      size: 170,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />,
      cell: ({ row }) => (
        <span className="truncate text-sm text-muted-foreground">
          {row.original.department_name ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'date_of_joining',
      size: 120,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date of join" />,
      cell: ({ row }) => (
        <span className="truncate text-sm">{dmy(row.original.date_of_joining)}</span>
      ),
    },
    {
      accessorKey: 'bank_account_number',
      size: 160,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bank account" />,
      cell: ({ row }) =>
        row.original.bank_account_number ? (
          <span className="truncate font-mono text-xs">{row.original.bank_account_number}</span>
        ) : (
          // Not merely missing: nobody can be paid without it.
          <span className="truncate text-xs text-amber-600 dark:text-amber-500">
            not recorded
          </span>
        ),
    },
    {
      accessorKey: 'paid_by_name',
      size: 200,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Paid by" />,
      cell: ({ row }) =>
        row.original.paid_by_name ? (
          <span className="truncate text-sm">{row.original.paid_by_name}</span>
        ) : (
          // A real answer, not an error: 105 active staff have no payer recorded
          // and are still paid. The register groups by WORK location.
          <span className="truncate text-xs text-amber-600 dark:text-amber-500">
            not recorded
          </span>
        ),
    },
    {
      id: 'status',
      accessorFn: (l) => (l.is_included ? 'Paid' : 'Excluded'),
      size: 190,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const l = row.original;
        if (l.is_included) {
          return <Badge variant="secondary" className="font-normal">Paid</Badge>;
        }
        return (
          <Badge
            variant="outline"
            className="truncate border-amber-300 font-normal text-amber-700 dark:border-amber-800 dark:text-amber-400"
            title={l.exclusion_reason ? EXCLUSION_LABELS[l.exclusion_reason] : 'Unknown'}
          >
            {l.exclusion_reason ? EXCLUSION_LABELS[l.exclusion_reason] : 'Unknown'}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'business_working_days',
      size: 110,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Working days" />,
      cell: ({ row }) => <Days value={row.original.business_working_days} />,
    },
    {
      accessorKey: 'paid_leave_days',
      size: 100,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Paid leave" />,
      cell: ({ row }) => <Days value={row.original.paid_leave_days} />,
    },
    {
      accessorKey: 'unpaid_leave_days',
      size: 110,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Unpaid leave" />,
      cell: ({ row }) =>
        row.original.unpaid_leave_days > 0 ? (
          // The one day count that costs money, so it is the one worth spotting.
          <span className="block text-center text-sm font-medium tabular-nums text-destructive">
            {days(row.original.unpaid_leave_days)}
          </span>
        ) : (
          <span className="block text-center text-sm tabular-nums">0</span>
        ),
    },
    {
      accessorKey: 'on_duty_days',
      size: 95,
      header: ({ column }) => <DataTableColumnHeader column={column} title="On duty" />,
      cell: ({ row }) => <Days value={row.original.on_duty_days} />,
    },
    {
      accessorKey: 'worked_days',
      size: 95,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Worked" />,
      cell: ({ row }) => <Days value={row.original.worked_days} />,
    },
    {
      accessorKey: 'paid_days',
      size: 100,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Paid days" />,
      cell: ({ row }) => (
        <span className="block text-center text-sm font-medium tabular-nums">
          {days(row.original.paid_days)}
        </span>
      ),
    },
    {
      accessorKey: 'actual_gross',
      size: 120,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Actual gross" />,
      cell: ({ row }) => (
        <Money value={row.original.actual_gross} included={row.original.is_included} />
      ),
    },
    {
      accessorKey: 'basic_pay',
      size: 120,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Basic pay" />,
      cell: ({ row }) => (
        <Money value={row.original.basic_pay} included={row.original.is_included} />
      ),
    },
    {
      accessorKey: 'allowance',
      size: 115,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Allowance" />,
      cell: ({ row }) => (
        <OptionalMoney value={row.original.allowance} included={row.original.is_included} />
      ),
    },
    {
      accessorKey: 'unpaid_leave_deduction',
      size: 130,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Unpaid leave ₹" />,
      cell: ({ row }) => (
        <OptionalMoney
          value={row.original.unpaid_leave_deduction}
          included={row.original.is_included}
        />
      ),
    },
    {
      accessorKey: 'epf_deduction',
      size: 105,
      header: ({ column }) => <DataTableColumnHeader column={column} title="EPF" />,
      cell: ({ row }) => (
        <OptionalMoney value={row.original.epf_deduction} included={row.original.is_included} />
      ),
    },
    {
      accessorKey: 'esi_deduction',
      size: 105,
      header: ({ column }) => <DataTableColumnHeader column={column} title="ESI" />,
      cell: ({ row }) => (
        <OptionalMoney value={row.original.esi_deduction} included={row.original.is_included} />
      ),
    },
    {
      accessorKey: 'tds_deduction',
      size: 105,
      header: ({ column }) => <DataTableColumnHeader column={column} title="TDS" />,
      cell: ({ row }) => (
        <OptionalMoney value={row.original.tds_deduction} included={row.original.is_included} />
      ),
    },
    {
      accessorKey: 'adjustment_amount',
      size: 120,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Adjustment" />,
      cell: ({ row }) =>
        row.original.adjustment_amount === 0 ? (
          <span className="block text-right text-sm text-muted-foreground">—</span>
        ) : (
          <span className="block text-right text-sm tabular-nums">
            {money(row.original.adjustment_amount)}
          </span>
        ),
    },
    {
      accessorKey: 'total_earnings',
      size: 125,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Earnings" />,
      cell: ({ row }) => (
        <Money value={row.original.total_earnings} included={row.original.is_included} />
      ),
    },
    {
      accessorKey: 'total_deductions',
      size: 130,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Deductions" />,
      cell: ({ row }) => (
        <Money value={row.original.total_deductions} included={row.original.is_included} />
      ),
    },
    {
      accessorKey: 'net_pay',
      size: 125,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Net pay" />,
      cell: ({ row }) => (
        <Money value={row.original.net_pay} included={row.original.is_included} bold />
      ),
    },
    {
      accessorKey: 'remarks',
      size: 220,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Remarks" />,
      cell: ({ row }) => (
        <span className="truncate text-xs text-muted-foreground">
          {row.original.remarks ?? '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      size: 70,
      header: 'Action',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const l = row.original;
        // A 32px trigger cannot outgrow its cell, which a right-aligned button
        // row can — that is why the actions sit behind a dropdown.
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={actions.detailHref(l)}>
                  <Eye className="mr-2 h-4 w-4" />
                  View details
                </Link>
              </DropdownMenuItem>
              {/* Adjusting a superseded run would edit history. The route
                  handler refuses it too; this only keeps the menu honest. */}
              {actions.canManage && !actions.isSuperseded && l.is_included && (
                <DropdownMenuItem onClick={() => actions.onAdjust(l)}>
                  <PencilLine className="mr-2 h-4 w-4" />
                  Adjust
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
