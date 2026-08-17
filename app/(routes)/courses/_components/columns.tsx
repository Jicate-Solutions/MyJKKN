'use client';

// Course Events — column definitions for the /courses list table. Mirrors
// app/(routes)/events/_components/columns.tsx: DataTableColumnHeader for
// sortable headers, a Badge status pill, row actions in the last column.
//
// Sorting is disabled on 'institution' and 'dates' — neither is a real
// course_events column (institution comes from the joined institutions row,
// dates is a synthetic pair of start_date/end_date). Since CourseEventService
// forwards sort_by straight into a real `.order(column, …)` call (server-side
// pagination, unlike events' client-side sort), sorting by a column that
// doesn't exist on the table would 400 the query.

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import type { CourseEvent, CourseEventStatus } from '@/types/courses';
import { CourseEventsRowActions } from './row-actions';

/** Status is a CHECK constraint (types/courses.ts), not a Postgres enum — keep
 *  this in step with COURSE_EVENT_STATUSES. */
const STATUS_LABEL: Record<CourseEventStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_VARIANT: Record<CourseEventStatus, string> = {
  draft: 'border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300',
  published:
    'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400',
  completed: 'border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-400',
  cancelled: 'border-red-300 text-red-700 dark:border-red-800 dark:text-red-400',
};

/** Tolerant date render — mirrors events/_components/columns.tsx renderDate. */
const renderDate = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'd MMM yyyy');
};

export interface CourseEventColumnOptions {
  onDelete: (id: string) => void;
  /** Id of the row whose delete is in flight, so only that row shows a spinner. */
  deletingId: string | null;
}

export const getColumns = (options: CourseEventColumnOptions): ColumnDef<CourseEvent>[] => [
  {
    accessorKey: 'title',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Course" />,
    size: 260,
    cell: ({ row }) => (
      <div className="min-w-0">
        <Link
          href={`/courses/${row.original.id}`}
          className="block max-w-full truncate font-medium hover:underline"
        >
          {row.original.title}
        </Link>
        {row.original.code && (
          <span className="block max-w-full truncate text-xs text-muted-foreground">
            {row.original.code}
          </span>
        )}
      </div>
    ),
  },
  {
    id: 'institution',
    accessorFn: (row) => row.institution?.name ?? '',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
    size: 190,
    enableSorting: false,
    cell: ({ row }) => (
      <span className="block max-w-[180px] truncate text-sm text-muted-foreground">
        {row.original.institution?.name || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    size: 120,
    cell: ({ row }) => {
      const status = row.original.status as CourseEventStatus;
      return (
        <Badge
          variant="outline"
          className={`text-[10px] font-semibold ${STATUS_VARIANT[status] ?? ''}`}
        >
          {STATUS_LABEL[status] ?? status}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'mode',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Mode" />,
    size: 110,
    cell: ({ row }) => (
      <Badge variant="secondary" className="text-[10px] font-normal capitalize">
        {row.original.mode}
      </Badge>
    ),
  },
  {
    id: 'dates',
    accessorFn: (row) => row.start_date ?? '',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Start – End" />,
    size: 190,
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-sm">
        {renderDate(row.original.start_date)} – {renderDate(row.original.end_date)}
      </span>
    ),
  },
  {
    accessorKey: 'total_seats',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Seats" />,
    size: 90,
    cell: ({ row }) => (
      <span className="text-sm">{row.original.total_seats ?? 'Unlimited'}</span>
    ),
  },
  {
    id: 'actions',
    header: 'Actions',
    size: 60,
    minSize: 60,
    maxSize: 80,
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <CourseEventsRowActions
        courseEvent={row.original}
        onDelete={options.onDelete}
        isDeleting={options.deletingId === row.original.id}
      />
    ),
  },
];
