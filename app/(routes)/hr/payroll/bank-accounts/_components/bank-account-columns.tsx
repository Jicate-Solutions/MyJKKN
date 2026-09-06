'use client';

/**
 * Column definitions for the employee bank-account directory.
 *
 * THE ACCOUNT NUMBER IS MASKED IN THE LIST. The RPC returns it in full because
 * the edit form needs it, but a table of 754 full account numbers is a
 * screenshot away from being a payroll leak — last four digits identify the row
 * to a human without reproducing the number.
 *
 * FOUR STATES, NOT TWO: none on file, incomplete (no IFSC, so unpayable),
 * recorded but never checked, and verified. The last two are the whole reason
 * `verified_at` exists — a wrong account number does not error, so "somebody
 * typed this" and "somebody checked this" have to look different. Incomplete
 * was added on 2026-09-02 when IFSC became optional: a row can now exist that
 * no transfer could ever route to, and that must not read as merely unverified.
 *
 * EVERY COLUMN CARRIES AN EXPLICIT `size`: DataTable renders cells as
 * `px-4 py-2 truncate max-w-0`, so a column left at the 150px default clips its
 * content off the edge instead of wrapping.
 */

import type { ColumnDef } from '@tanstack/react-table';
import {
  BadgeCheck,
  History as HistoryIcon,
  MoreHorizontal,
  PencilLine,
  ShieldQuestion,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { isPayable, maskAccountNumber } from '@/lib/hr/payroll/bank-account-validation';
import type { StaffBankDirectoryRow } from '@/lib/services/hr/payroll/staff-bank-account-service';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function NotSet() {
  return <span className='text-xs italic text-muted-foreground'>Not set</span>;
}

export interface BankColumnActions {
  onEdit: (row: StaffBankDirectoryRow) => void;
  onViewHistory: (row: StaffBankDirectoryRow) => void;
  onToggleVerified: (row: StaffBankDirectoryRow) => void;
  /** Whether the viewer holds hr.payroll.bank.manage. */
  canManage: boolean;
}

export function getBankAccountColumns(
  actions: BankColumnActions
): ColumnDef<StaffBankDirectoryRow>[] {
  return [
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
      size: 190,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Works at' />,
      cell: ({ row }) => <span className='truncate text-sm'>{row.original.works_at_name}</span>,
    },
    {
      accessorKey: 'account_holder_name',
      size: 200,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Account holder' />,
      cell: ({ row }) => {
        const r = row.original;
        if (!r.account_id) return <NotSet />;
        // Flagged when the bank's name differs from the HR record, because that
        // mismatch is what gets a transfer rejected.
        const differs =
          (r.account_holder_name ?? '').trim().toUpperCase() !==
          r.person_name.trim().toUpperCase();
        return (
          <span className='block truncate text-sm'>
            {r.account_holder_name}
            {differs && (
              <span className='ml-1 text-xs text-muted-foreground'>(differs)</span>
            )}
          </span>
        );
      },
    },
    {
      accessorKey: 'account_number',
      size: 140,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Account' />,
      cell: ({ row }) =>
        row.original.account_id ? (
          <span className='font-mono text-sm tabular-nums'>
            {maskAccountNumber(row.original.account_number)}
          </span>
        ) : (
          <NotSet />
        ),
    },
    {
      accessorKey: 'ifsc_code',
      size: 140,
      header: ({ column }) => <DataTableColumnHeader column={column} title='IFSC' />,
      cell: ({ row }) =>
        row.original.ifsc_code ? (
          <span className='font-mono text-sm'>{row.original.ifsc_code}</span>
        ) : (
          <NotSet />
        ),
    },
    {
      accessorKey: 'bank_name',
      size: 200,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Bank' />,
      cell: ({ row }) => {
        const r = row.original;
        if (!r.bank_name) return <NotSet />;
        return (
          <span className='block truncate text-sm'>
            {r.bank_name}
            {r.branch_name && (
              <span className='block truncate text-xs text-muted-foreground'>
                {r.branch_name}
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: 'state',
      size: 140,
      header: 'State',
      cell: ({ row }) => {
        const r = row.original;
        if (!r.account_id) {
          return <Badge variant='secondary' className='font-normal'>No account</Badge>;
        }
        // Ranked ahead of Unverified: an account nobody can pay into is a bigger
        // problem than one nobody has checked, and saying "Unverified" here would
        // imply the only thing missing is a passbook comparison.
        if (!isPayable(r)) {
          return (
            <Badge
              variant='outline'
              className='border-orange-300 font-normal text-orange-700 dark:border-orange-800 dark:text-orange-400'
            >
              Incomplete — no IFSC
            </Badge>
          );
        }
        if (!r.verified_at) {
          return (
            <Badge
              variant='outline'
              className='border-amber-300 font-normal text-amber-700 dark:border-amber-800 dark:text-amber-400'
            >
              Unverified
            </Badge>
          );
        }
        return (
          <Badge
            variant='outline'
            className='border-emerald-300 font-normal text-emerald-700 dark:border-emerald-800 dark:text-emerald-400'
          >
            Verified {formatDate(r.verified_at)}
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      size: 70,
      header: '',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const r = row.original;
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
                  {r.account_id ? 'Replace account' : 'Record account'}
                </DropdownMenuItem>
              )}
              {actions.canManage && r.account_id && (
                <DropdownMenuItem onClick={() => actions.onToggleVerified(r)}>
                  {r.verified_at ? (
                    <>
                      <ShieldQuestion className='mr-2 h-4 w-4' />
                      Mark unverified
                    </>
                  ) : (
                    <>
                      <BadgeCheck className='mr-2 h-4 w-4' />
                      Mark verified
                    </>
                  )}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => actions.onViewHistory(r)}>
                <HistoryIcon className='mr-2 h-4 w-4' />
                Account history
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
