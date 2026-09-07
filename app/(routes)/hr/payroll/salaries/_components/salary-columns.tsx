'use client';

/**
 * Column definitions for the employee-salary directory.
 *
 * THE ROWS ARE THE ROSTER, NOT THE SALARY TABLE. Most of them have no salary
 * recorded, so every money column has to render an explicit "Not set" rather
 * than a blank — a blank cell in a column of rupee figures reads as zero, and
 * zero is a different claim from "nobody has decided yet".
 *
 * EVERY COLUMN CARRIES AN EXPLICIT `size`. The DataTable renders cells as
 * `px-4 py-2 truncate max-w-0`, so a column that falls back to the 150px default
 * clips its content off the edge rather than wrapping — which is how an action
 * button in this codebase once became invisible instead of merely cramped.
 */

import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, PencilLine, History as HistoryIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { resolveTds } from '@/lib/hr/payroll/tds-slabs';
import type { HrTdsSlab } from '@/lib/services/hr/payroll/tds-slab-service';
import type { StaffSalaryDirectoryRow } from '@/lib/services/hr/payroll/staff-salary-service';

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/**
 * `effective_from` is a DATE, not a timestamptz — there is no zone to convert.
 * Parsed from its parts rather than through `new Date('2026-08-01')`, which
 * JavaScript reads as UTC midnight and renders as the 31st in IST.
 */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function NotSet() {
  return <span className='text-xs italic text-muted-foreground'>Not set</span>;
}

/**
 * One statutory contribution cell — THREE distinct states, not two.
 *
 *   no salary row at all  → "Not set", the queue this screen exists to work through
 *   salary but not eligible → an em dash: decided, and the answer is "does not apply"
 *   eligible                → the figure, ₹0 included
 *
 * Collapsing the middle case into a blank would read as zero, and zero here is a
 * claim about money the register will act on.
 */
function ContributionCell({
  row,
  kind,
}: {
  row: StaffSalaryDirectoryRow;
  kind: 'epf' | 'esi';
}) {
  if (!row.salary_id) return <span className='block text-right'><NotSet /></span>;

  const eligible = kind === 'epf' ? row.eligible_for_pf : row.eligible_for_esi;
  if (!eligible) {
    return <span className='block text-right text-sm text-muted-foreground'>—</span>;
  }

  const value = kind === 'epf' ? row.epf_amount : row.esi_amount;
  return (
    <span className='block text-right text-sm tabular-nums'>{INR.format(value ?? 0)}</span>
  );
}

export interface SalaryColumnActions {
  onEdit: (row: StaffSalaryDirectoryRow) => void;
  onViewHistory: (row: StaffSalaryDirectoryRow) => void;
  /** Whether the viewer holds hr.payroll.salary.manage. */
  canManage: boolean;
  /**
   * The bands in force. TDS is never stored against a person, so the column is
   * resolved per row from these — which is why editing a band updates every
   * row's tax without touching a single salary record.
   */
  tdsSlabs: HrTdsSlab[];
}

export function getSalaryColumns(
  actions: SalaryColumnActions
): ColumnDef<StaffSalaryDirectoryRow>[] {
  const columns: ColumnDef<StaffSalaryDirectoryRow>[] = [];

  // enableRowSelection only turns the machinery on; the checkbox column has to
  // be supplied here or the toolbar's bulk actions have nothing to select with.
  if (actions.canManage) {
    columns.push({
      id: 'select',
      size: 40,
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          // Spelled out as a ternary rather than the usual `a || (b && 'x')`.
          // strictNullChecks is off in this repo, so that expression widens to
          // `true | "" | "indeterminate"` and no longer satisfies CheckedState.
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(v === true)}
          aria-label='Select all on this page'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          aria-label='Select row'
        />
      ),
    });
  }

  columns.push(
    {
      accessorKey: 'person_name',
      size: 230,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Employee' />,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <button
            type='button'
            onClick={() => actions.onViewHistory(r)}
            className='min-w-0 text-left'
          >
            <span className='block truncate text-sm font-medium hover:underline'>
              {r.person_name}
            </span>
            <span className='block truncate font-mono text-xs text-muted-foreground'>
              {r.staff_code ?? '—'}
            </span>
          </button>
        );
      },
    },
    {
      accessorKey: 'works_at_name',
      size: 200,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Works at' />,
      cell: ({ row }) => (
        <span className='truncate text-sm'>{row.original.works_at_name}</span>
      ),
    },
    {
      accessorKey: 'payer_org_name',
      size: 200,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Paid by' />,
      cell: ({ row }) =>
        row.original.payer_org_name ? (
          <span className='truncate text-sm'>{row.original.payer_org_name}</span>
        ) : (
          // Not merely missing — it BLOCKS a salary, because the write requires a
          // payer. Flagged amber so it reads as an action, not an empty cell.
          <Badge
            variant='outline'
            className='border-amber-300 font-normal text-amber-700 dark:border-amber-800 dark:text-amber-400'
          >
            No payer
          </Badge>
        ),
    },
    {
      accessorKey: 'monthly_gross',
      size: 130,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Monthly' />,
      cell: ({ row }) =>
        row.original.monthly_gross === null ? (
          <span className='block text-right'><NotSet /></span>
        ) : (
          <span className='block text-right text-sm font-medium tabular-nums'>
            {INR.format(row.original.monthly_gross)}
          </span>
        ),
    },
    {
      accessorKey: 'annual_gross',
      size: 140,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Annual gross' />,
      cell: ({ row }) =>
        row.original.annual_gross === null ? (
          <span className='block text-right'><NotSet /></span>
        ) : (
          <span className='block text-right text-sm tabular-nums text-muted-foreground'>
            {INR.format(row.original.annual_gross)}
          </span>
        ),
    },
    
    {
      id: 'total_monthly',
      size: 130,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Total monthly' />,
      // Derived, so there is no accessorKey to sort on — the figure the person
      // is actually paid each month, gross plus allowance.
      accessorFn: (r) => (r.monthly_gross ?? 0) + (r.allowance_amount ?? 0),
      cell: ({ row }) => {
        const r = row.original;
        if (r.monthly_gross === null) return <span className='block text-right'><NotSet /></span>;
        return (
          <span className='block text-right text-sm font-medium tabular-nums'>
            {INR.format(r.monthly_gross + (r.allowance_amount ?? 0))}
          </span>
        );
      },
    },
   
    {
      id: 'status',
      size: 120,
      header: 'Status',
      cell: ({ row }) => {
        const r = row.original;
        if (!r.is_active) {
          return (
            <Badge
              variant='outline'
              className='border-amber-300 font-normal text-amber-700 dark:border-amber-800 dark:text-amber-400'
            >
              Relieved
            </Badge>
          );
        }
        return r.salary_id ? (
          <Badge variant='outline' className='font-normal'>Salaried</Badge>
        ) : (
          <Badge variant='secondary' className='font-normal'>Awaiting</Badge>
        );
      },
    },
    {
      id: 'actions',
      size: 70,
      header: 'Action',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const r = row.original;
        // A 32px trigger cannot outgrow its cell, which a right-aligned button
        // row can — that is why the actions are behind a dropdown here.
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' className='h-8 w-8'>
                <MoreHorizontal className='h-4 w-4' />
                <span className='sr-only'>Open actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {actions.canManage && (
                <DropdownMenuItem onClick={() => actions.onEdit(r)}>
                  <PencilLine className='mr-2 h-4 w-4' />
                  {r.salary_id ? 'Update salary' : 'Record salary'}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => actions.onViewHistory(r)}>
                <HistoryIcon className='mr-2 h-4 w-4' />
                Salary history
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }
  );

  return columns;
}
