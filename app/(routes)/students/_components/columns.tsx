'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';

import { Student } from '@/types/student';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { DataTableRowActions } from './row-actions';

export const columns: ColumnDef<Student>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value: boolean) =>
          table.toggleAllPageRowsSelected(!!value)
        }
        aria-label='Select all'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label='Select row'
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 50,
    minSize: 50,
    maxSize: 50
  },
  {
    accessorKey: 'roll_number',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Roll Number' />
    ),
    size: 60,
    minSize: 60,
    maxSize: 60
  },
  {
    accessorKey: 'first_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Name' />
    ),
    cell: ({ row }) => {
      const student = row.original;
      const name = `${student.first_name} ${student.last_name || ''}`.trim();
      return (
        <Link
          href={`/students/${student.id}`}
          className='font-medium text-primary hover:underline'
        >
          {name}
        </Link>
      );
    }
  },
  {
    accessorKey: 'program.program_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Program' />
    ),
    cell: ({ row }) => {
      return row.original.program?.program_name || 'N/A';
    }
  },
  {
    accessorKey: 'semester.semester_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Semester' />
    ),
    cell: ({ row }) => {
      return row.original.semester?.semester_name || 'N/A';
    }
  },
  {
    accessorKey: 'section.section_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Section' />
    ),
    cell: ({ row }) => {
      return row.original.section?.section_name || 'N/A';
    }
  },
  {
    accessorKey: 'academic_year.academic_year_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Academic Year' />
    ),
    cell: ({ row }) => {
      return row.original.academic_year?.academic_year_name || 'N/A';
    }
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      return (
        <Badge variant={status === 'active' ? 'default' : 'secondary'}>
          {status?.charAt(0).toUpperCase() + status?.slice(1)}
        </Badge>
      );
    }
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <DataTableRowActions row={row} />,
    enableSorting: false,
    enableHiding: false,
    size: 100
  }
];
