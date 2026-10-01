'use client';

/**
 * Columns for the imported-biometric-months table.
 * Created: 2026-09-19.
 *
 * Split out of biometric-purge-panel.tsx when that panel moved from a
 * hand-rolled <table> to the shared DataTable, which takes its columns as a
 * factory rather than as markup.
 *
 * EVERY ROW IS A MONTH OF ATTENDANCE SOMEBODY MIGHT DELETE. Six machines mean
 * six near-identical rows per month, all reading "<college> · July 2026", so
 * the columns exist to make one row distinguishable from its neighbours: the
 * machine code under the name, the count of OTHER colleges the machine
 * recorded, how many exceptions are still open, and whether a human has already
 * corrected days inside it. The delete action is deliberately per-row and
 * single — there is no tick box and no bulk purge, because the realistic
 * mistake here is deleting the wrong college, not deleting one by accident.
 */

import type { ColumnDef } from '@tanstack/react-table';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { biometricMonthLabel, type BiometricImportBatch } from '@/types/hr-biometric';

/**
 * BiometricImportBatch is keyed on (machine, month) and carries no id of its
 * own, but DataTable needs a single `idField` for selection and row keys.
 */
export interface BiometricBatchRow extends BiometricImportBatch {
  id: string;
}

export const biometricBatchRowId = (b: BiometricImportBatch): string =>
  `${b.machine_institution_id}|${b.month_start}`;

const int = (n: number) => n.toLocaleString('en-IN');

export function getBiometricBatchColumns(
  onDelete: (row: BiometricBatchRow) => void,
): ColumnDef<BiometricBatchRow, unknown>[] {
  return [
    {
      accessorKey: 'machine_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Machine institution' />,
      size: 220,
      cell: ({ row }) => (
        <div>
          <span className='block'>{row.original.machine_name ?? 'Unknown institution'}</span>
          {row.original.machine_code && (
            <span className='block font-mono text-xs text-muted-foreground'>
              {row.original.machine_code}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'month_start',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Month' />,
      size: 130,
      cell: ({ row }) => biometricMonthLabel(row.original.month_start),
    },
    {
      accessorKey: 'record_count',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Day records' />,
      size: 120,
      cell: ({ row }) => (
        <span className='block text-right tabular-nums'>{int(row.original.record_count)}</span>
      ),
    },
    {
      accessorKey: 'staff_count',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Team members' />,
      size: 140,
      cell: ({ row }) => (
        <span className='block text-right tabular-nums'>
          {row.original.staff_count}
          {/* One machine routinely records people from several colleges, which
              is exactly what makes a wrong delete expensive. */}
          {row.original.staff_institution_count > 1 && (
            <span className='block text-xs text-amber-700 dark:text-amber-400'>
              across {row.original.staff_institution_count} colleges
            </span>
          )}
        </span>
      ),
    },
   
    {
      accessorKey: 'last_imported_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Last imported' />,
      size: 170,
      cell: ({ row }) => (
        <span className='text-xs text-muted-foreground'>
          {row.original.last_imported_at
            ? new Date(row.original.last_imported_at).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })
            : '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      size: 110,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className='text-right'>
          <Button
            variant='ghost'
            size='sm'
            className='text-destructive hover:bg-destructive/10 hover:text-destructive'
            onClick={() => onDelete(row.original)}
          >
            <Trash2 className='mr-1.5 h-4 w-4' />
            Delete
          </Button>
        </div>
      ),
    },
  ];
}
