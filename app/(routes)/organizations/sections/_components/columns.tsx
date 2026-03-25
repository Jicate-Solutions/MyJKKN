'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { DataTableRowActions } from './row-actions';
import { Section } from '@/types/organizations';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export const columns: ColumnDef<Section>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='Select row'
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40,
    minSize: 40,
    maxSize: 40
  },
  {
    accessorKey: 'section_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Section Name' />
    ),
    cell: ({ row }) => {
      const section = row.original;
      return (
        <Link
          href={`/organizations/sections/${section.id}`}
          className='font-medium hover:text-primary hover:underline'
        >
          {section.section_name}
        </Link>
      );
    },
    size: 150,
    minSize: 120,
    maxSize: 200
  },
  {
    accessorKey: 'institution',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution' />
    ),
    cell: ({ row }) => {
      const section = row.original;
      return (
        <div className='flex flex-col'>
          <span className='font-medium'>
            {section.institution?.name || 'N/A'}
          </span>
          {section.institution?.counselling_code && (
            <span className='text-sm text-muted-foreground'>
              {section.institution.counselling_code}
            </span>
          )}
        </div>
      );
    },
    size: 200,
    minSize: 150,
    maxSize: 300
  },
  {
    accessorKey: 'program',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Program' />
    ),
    cell: ({ row }) => {
      const section = row.original;
      return section.program?.program_name || 'N/A';
    },
    size: 180,
    minSize: 150,
    maxSize: 250
  },
  {
    accessorKey: 'semester',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Semester' />
    ),
    cell: ({ row }) => {
      const section = row.original;
      return (
        <div className='flex flex-col'>
          <span className='text-sm font-medium'>
            {section.semester?.semester_name || 'N/A'}
          </span>
          {section.semester?.semester_code && (
            <span className='text-xs text-muted-foreground'>
              {section.semester.semester_code}
            </span>
          )}
        </div>
      );
    },
    size: 150,
    minSize: 120,
    maxSize: 200
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
    },
    size: 100,
    minSize: 80,
    maxSize: 120
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created At' />
    ),
    cell: ({ row }) => {
      const date = new Date(row.getValue('created_at'));
      return date.toLocaleDateString();
    },
    size: 120,
    minSize: 100,
    maxSize: 150
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => (
      <DataTableRowActions
        row={row}
        onEdit={(id) => {
          // Navigation will be handled in the DataTableRowActions component
        }}
        onDelete={(id) => {
          // Deletion will be handled in the DataTableRowActions component
        }}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 60,
    minSize: 60,
    maxSize: 80
  }
];