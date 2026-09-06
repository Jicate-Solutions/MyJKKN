'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { format } from 'date-fns';
import type { AdmissionYear } from '@/types/admission';
import { DataTableRowActions } from './row-actions';

export const columns: ColumnDef<AdmissionYear>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
      />
    ),
    size: 50,
    minSize: 50,
    maxSize: 50,
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='Select row'
      />
    ),
    enableSorting: false,
    enableHiding: false
  },
  {
    accessorKey: 'admission_year_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Admission Year' />
    ),
    cell: ({ row }) => {
      const ay = row.original;
      return (
        <div className='flex items-center gap-2'>
          <Link
            href={`/admission/settings/years/${ay.id}`}
            className='font-medium text-primary hover:underline'
          >
            {ay.admission_year_name}
          </Link>
          {ay.is_current && (
            <Badge variant='outline' className='border-primary text-primary'>
              Current
            </Badge>
          )}
        </div>
      );
    }
  },
  {
    id: 'institution',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution' />
    ),
    size: 260,
    cell: ({ row }) => row.original.institution?.name ?? 'N/A'
  },
  {
    accessorKey: 'year',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Year' />
    ),
    cell: ({ row }) => row.getValue('year')
  },
  {
    accessorKey: 'is_active',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ row }) => {
      const isActive = row.getValue('is_active') as boolean;
      return (
        <Badge variant={isActive ? 'default' : 'secondary'}>
          {isActive ? 'Active' : 'Inactive'}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created At' />
    ),
    cell: ({ row }) => {
      const date = row.getValue('created_at') as string;
      return date ? format(new Date(date), 'dd MMM yyyy') : 'N/A';
    }
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => (
      <DataTableRowActions
        row={row}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 60,
    minSize: 60,
    maxSize: 80
  }
];
