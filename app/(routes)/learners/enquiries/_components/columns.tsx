'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { format } from 'date-fns';
import type { LearnerProfile } from '@/types/learner-profile';
import { LifecycleStatusBadge } from '@/components/learners/lifecycle-status-badge';
import { DataTableRowActions } from './row-actions';

export const enquiryColumns: ColumnDef<LearnerProfile>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value: boolean) =>
          table.toggleAllPageRowsSelected(!!value)
        }
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 50,
    minSize: 50,
    maxSize: 50,
  },
  {
    accessorKey: 'application_id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Application ID" />
    ),
    cell: ({ row }) => {
      return (
        <div className="font-mono text-sm">
          {row.original.application_id || 'N/A'}
        </div>
      );
    },
    size: 120,
    minSize: 120,
    maxSize: 150,
  },
  {
    accessorKey: 'first_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => {
      const learner = row.original;
      const name = `${learner.first_name} ${learner.last_name || ''}`.trim();
      return (
        <Link
          href={`/learners/enquiries/${learner.id}`}
          className="font-medium text-primary hover:underline"
        >
          {name}
        </Link>
      );
    },
    size: 200,
    minSize: 150,
    maxSize: 250,
  },
  {
    accessorKey: 'student_mobile',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Mobile" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-sm">{row.original.student_mobile || 'N/A'}</div>
      );
    },
    size: 120,
  },
  {
    accessorKey: 'student_email',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-sm text-muted-foreground">
          {row.original.student_email || 'N/A'}
        </div>
      );
    },
    size: 200,
  },
  {
    accessorKey: 'program.program_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Program" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-sm">
          {row.original.program?.program_name || 'Not specified'}
        </div>
      );
    },
    size: 150,
  },
  {
    accessorKey: 'institution.name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Institution" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-sm">
          {row.original.institution?.name || 'N/A'}
        </div>
      );
    },
    size: 180,
  },
  {
    accessorKey: 'lifecycle_status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      return <LifecycleStatusBadge status={row.original.lifecycle_status} />;
    },
    size: 120,
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-sm text-muted-foreground">
          {format(new Date(row.original.created_at), 'MMM dd, yyyy')}
        </div>
      );
    },
    size: 120,
  },
  {
    id: 'actions',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Actions" />
    ),
    cell: ({ row }) => <DataTableRowActions row={row} />,
    size: 50,
    minSize: 50,
    maxSize: 50,
  },
];
