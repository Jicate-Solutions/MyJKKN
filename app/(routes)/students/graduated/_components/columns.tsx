'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';

import { Student } from '@/types/student';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { GraduatedRowActions } from './row-actions';

// Status labels with colors for graduated/exited
const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  graduated: { label: 'Graduated', variant: 'default' },
  exited: { label: 'Exited', variant: 'destructive' },
  active: { label: 'Active', variant: 'outline' },
  inactive: { label: 'Inactive', variant: 'secondary' },
  pending: { label: 'Pending', variant: 'secondary' }
};

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
    cell: ({ row }) => row.original.roll_number || 'N/A',
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
      <DataTableColumnHeader column={column} title='Last Semester' />
    ),
    cell: ({ row }) => {
      return row.original.semester?.semester_name || 'N/A';
    }
  },
  {
    accessorKey: 'section.section_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Last Section' />
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
      const statusInfo = STATUS_LABELS[status] || { label: status, variant: 'secondary' as const };
      return (
        <Badge variant={statusInfo.variant}>
          {statusInfo.label}
        </Badge>
      );
    }
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <GraduatedRowActions row={row} />,
    enableSorting: false,
    enableHiding: false,
    size: 100
  }
];
