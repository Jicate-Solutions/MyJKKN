'use client';

import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { BosCourseSyllabus } from '@/types/bos';
import { DataTableRowActions } from './row-actions';

export const columns: ColumnDef<BosCourseSyllabus>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <input
        type='checkbox'
        checked={table.getIsAllRowsSelected()}
        onChange={(e) => table.toggleAllRowsSelected(e.target.checked)}
        aria-label='Select all'
        className='cursor-pointer'
      />
    ),
    cell: ({ row }) => (
      <input
        type='checkbox'
        checked={row.getIsSelected()}
        onChange={(e) => row.toggleSelected(e.target.checked)}
        aria-label='Select row'
        className='cursor-pointer'
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 50,
  },
  {
    accessorKey: 'course_code',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Course Code' />,
    cell: ({ row }) => (
      <Link
        href={`/bos/syllabi/${row.original.id}/edit`}
        className='font-mono font-semibold text-blue-600 hover:underline'
      >
        {row.original.course_code}
      </Link>
    ),
    size: 120,
  },
  {
    accessorKey: 'course_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Course Name' />,
    cell: ({ row }) => <span className='max-w-xs truncate'>{row.original.course_name}</span>,
    size: 250,
  },
  {
    accessorKey: 'stream',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Stream' />,
    cell: ({ row }) => (
      row.original.stream ? (
        <Badge variant='outline'>{row.original.stream}</Badge>
      ) : (
        <span className='text-gray-400'>-</span>
      )
    ),
    size: 120,
  },
  {
    accessorKey: 'course_credits',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Credits' />,
    cell: ({ row }) => row.original.course_credits || '-',
    size: 80,
  },
  {
    accessorKey: 'version_number',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Version' />,
    cell: ({ row }) => (
      <Badge variant={row.original.is_latest ? 'default' : 'secondary'}>
        v{row.original.version_number}
      </Badge>
    ),
    size: 100,
  },
  {
    accessorKey: 'is_latest',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Status' />,
    cell: ({ row }) => {
      if (row.original.is_archived) {
        return <Badge variant='destructive'>Archived</Badge>;
      }
      if (row.original.is_latest) {
        return <Badge variant='default'>Active</Badge>;
      }
      return <Badge variant='secondary'>Previous</Badge>;
    },
    size: 100,
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <DataTableRowActions row={row} />,
    enableSorting: false,
    enableHiding: false,
    size: 100,
  },
];

export function getColumns({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) {
  return columns.map((col) => {
    if (col.id === 'actions' && (!canEdit && !canDelete)) {
      return { ...col, enableHiding: true };
    }
    return col;
  });
}
