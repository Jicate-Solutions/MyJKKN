'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import type { LearnerProfile } from '@/types/learner-profile';
import { LifecycleStatusBadge } from '@/components/learners/lifecycle-status-badge';
import { DataTableRowActions } from './row-actions';

/**
 * College Email Cell with Copy Button
 */
function CollegeEmailCell({ email }: { email: string | null | undefined }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!email) return;

    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      toast.success('Email copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy email');
    }
  };

  if (!email) {
    return <div className="text-sm text-muted-foreground">N/A</div>;
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 flex-shrink-0"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
      <span className="text-sm">{email}</span>
    </div>
  );
}

export const alumniColumns: ColumnDef<LearnerProfile>[] = [
  // 1. Select Checkbox
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
    enableResizing: false,
    size: 70,
    minSize: 70,
    maxSize: 70,
  },
  // 2. Roll Number
  {
    accessorKey: 'roll_number',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Roll Number" />
    ),
    cell: ({ row }) => {
      return (
        <div className="font-mono text-sm font-medium">
          {row.original.roll_number || 'N/A'}
        </div>
      );
    },
    size: 120,
    minSize: 110,
    maxSize: 140,
  },
  // 3. Learner Name
  {
    accessorKey: 'first_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Learner Name" />
    ),
    cell: ({ row }) => {
      const learner = row.original;
      const name = `${learner.first_name} ${learner.last_name || ''}`.trim();
      return (
        <Link
          href={`/learners/alumni/${learner.id}`}
          className="font-medium text-primary hover:underline"
        >
          {name}
        </Link>
      );
    },
    size: 180,
    minSize: 150,
    maxSize: 220,
  },
  // 4. College Email (with copy icon)
  {
    accessorKey: 'college_email',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="College Email" />
    ),
    cell: ({ row }) => {
      return <CollegeEmailCell email={row.original.college_email} />;
    },
    size: 280,
    minSize: 250,
    maxSize: 320,
  },
  // 5. Institution
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
    size: 200,
    minSize: 180,
    maxSize: 250,
  },
  // 6. Program
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
    size: 100,
    minSize: 80,
    maxSize: 120,
  },
  // 7. Semester
  {
    accessorKey: 'semester.semester_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Semester" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-sm">
          {row.original.semester?.semester_name || 'N/A'}
        </div>
      );
    },
    size: 110,
    minSize: 90,
    maxSize: 130,
  },
  // 8. Section
  {
    accessorKey: 'section.section_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Section" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-sm">
          {row.original.section?.section_name || 'N/A'}
        </div>
      );
    },
    size: 90,
    minSize: 70,
    maxSize: 110,
  },
  // 9. Status
  {
    accessorKey: 'lifecycle_status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      return <LifecycleStatusBadge status={row.original.lifecycle_status} />;
    },
    size: 130,
    minSize: 120,
    maxSize: 150,
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  // 10. Actions
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
