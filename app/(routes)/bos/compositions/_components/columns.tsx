'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { BosComposition } from '@/types/bos';
import { format } from 'date-fns';
import { DataTableRowActions } from './row-actions';

const baseColumns: ColumnDef<BosComposition>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label='Select all'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        aria-label='Select row'
      />
    ),
    size: 50,
    minSize: 50,
    maxSize: 50,
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'board',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Board' />,
    size: 220,
    cell: ({ row }) => {
      const comp = row.original;
      return (
        <div>
          <div className='font-medium'>{comp.board?.board_name ?? '—'}</div>
          {comp.board?.board_code && (
            <div className='text-xs text-muted-foreground'>{comp.board.board_code}</div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'composition_title',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Composition' />
    ),
    size: 220,
    cell: ({ row }) => (
      <div className='font-medium'>{row.getValue('composition_title')}</div>
    ),
  },
  {
    accessorKey: 'academic_year',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Academic Year' />
    ),
    size: 120,
    cell: ({ row }) => <div>{row.getValue('academic_year')}</div>,
  },
  {
    accessorKey: 'term_start_date',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Term' />,
    size: 190,
    cell: ({ row }) => {
      const comp = row.original;
      const start = comp.term_start_date
        ? format(new Date(comp.term_start_date), 'MMM yyyy')
        : '—';
      const end = comp.term_end_date
        ? format(new Date(comp.term_end_date), 'MMM yyyy')
        : '—';
      return (
        <div className='text-sm'>
          {start} – {end}
        </div>
      );
    },
  },
  {
    accessorKey: 'member_count',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Members' />,
    size: 90,
    cell: ({ row }) => (
      <div className='text-center font-medium'>
        {(row.getValue('member_count') as number) ?? 0}
      </div>
    ),
  },
  {
    accessorKey: 'is_active',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Status' />,
    size: 90,
    cell: ({ row }) => {
      const isActive = row.getValue('is_active') as boolean;
      return (
        <Badge variant={isActive ? 'default' : 'secondary'}>
          {isActive ? 'Active' : 'Inactive'}
        </Badge>
      );
    },
  },
];

const actionsColumn: ColumnDef<BosComposition> = {
  id: 'actions',
  header: 'Actions',
  cell: ({ row }) => <DataTableRowActions row={row} />,
  enableSorting: false,
  enableHiding: false,
  size: 60,
  minSize: 60,
  maxSize: 80,
};

export const getColumns = (permissions: {
  canEdit: boolean;
  canDelete: boolean;
}): ColumnDef<BosComposition>[] => {
  if (!permissions.canEdit && !permissions.canDelete) return baseColumns;
  return [...baseColumns, actionsColumn];
};

export const columns: ColumnDef<BosComposition>[] = [...baseColumns, actionsColumn];
