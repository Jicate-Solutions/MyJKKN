'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { ProfileChangeRequest } from '@/types/learner-profile-change';

/**
 * Format field name to human-readable label
 */
function formatFieldLabel(field: string): string {
  return field
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format date as relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

/**
 * Fields Summary Cell with Badge Display
 */
function FieldsSummaryCell({ fields }: { fields: string[] }) {
  const displayFields = fields.slice(0, 3);
  const remainingCount = fields.length - 3;

  return (
    <div className="flex flex-wrap gap-1">
      {displayFields.map((field) => (
        <Badge key={field} variant="outline" className="text-xs">
          {formatFieldLabel(field)}
        </Badge>
      ))}
      {remainingCount > 0 && (
        <Badge variant="secondary" className="text-xs">
          +{remainingCount} more
        </Badge>
      )}
    </div>
  );
}

export const changeRequestColumns: ColumnDef<ProfileChangeRequest>[] = [
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
    accessorKey: 'learner.roll_number',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Roll Number" />
    ),
    cell: ({ row }) => {
      return (
        <div className="font-mono text-sm font-medium">
          {row.original.learner?.roll_number || 'N/A'}
        </div>
      );
    },
    size: 120,
    minSize: 110,
    maxSize: 140,
  },
  // 3. Student Name
  {
    accessorKey: 'learner.first_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Student Name" />
    ),
    cell: ({ row }) => {
      const learner = row.original.learner;
      const name = learner
        ? `${learner.first_name} ${learner.last_name || ''}`.trim()
        : 'Unknown';
      const email = learner?.college_email;

      return (
        <div className="flex flex-col">
          <span className="font-medium text-primary">{name}</span>
          {email && (
            <span className="text-xs text-muted-foreground">{email}</span>
          )}
        </div>
      );
    },
    size: 200,
    minSize: 180,
    maxSize: 250,
  },
  // 4. Fields Changed
  {
    accessorKey: 'fields_summary',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fields Changed" />
    ),
    cell: ({ row }) => {
      const fields = row.original.fields_summary || [];
      return <FieldsSummaryCell fields={fields} />;
    },
    size: 250,
    minSize: 200,
    maxSize: 300,
  },
  // 5. Submitted
  {
    accessorKey: 'submitted_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Submitted" />
    ),
    cell: ({ row }) => {
      const submittedAt = row.original.submitted_at;
      return (
        <div className="text-sm text-muted-foreground">
          {formatRelativeTime(submittedAt)}
        </div>
      );
    },
    size: 120,
    minSize: 100,
    maxSize: 150,
  },
  // 6. Actions
  {
    id: 'actions',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Actions" />
    ),
    cell: ({ row }) => (
      <Button asChild size="sm" variant="outline">
        <Link href={`/learners/change-requests/${row.original.id}`}>
          Review
        </Link>
      </Button>
    ),
    size: 120,
    minSize: 100,
    maxSize: 140,
  },
];
