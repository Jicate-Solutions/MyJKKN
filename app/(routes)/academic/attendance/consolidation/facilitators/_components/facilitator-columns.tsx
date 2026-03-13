'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FacilitatorAttendanceStat } from '@/types/attendance';

function getRateBadge(rate: number) {
  if (rate >= 80)
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Excellent</Badge>;
  if (rate >= 60)
    return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">Good</Badge>;
  if (rate >= 40)
    return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">Fair</Badge>;
  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">Low</Badge>;
}

export const getFacilitatorColumns = (): ColumnDef<FacilitatorAttendanceStat>[] => [
  {
    accessorKey: 'firstName',
    header: 'Facilitator',
    cell: ({ row }) => (
      <div>
        <p className="font-medium">
          {row.original.firstName} {row.original.lastName}
        </p>
        <p className="text-xs text-muted-foreground">{row.original.designation}</p>
      </div>
    ),
  },
  {
    accessorKey: 'departmentName',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Department <ArrowUpDown className="ml-2 h-3 w-3" />
      </Button>
    ),
  },
  {
    id: 'timetables',
    header: 'Timetable(s)',
    cell: ({ row }) => {
      const assignments = row.original.timetableAssignments ?? [];
      if (assignments.length === 0) {
        return <span className="text-muted-foreground text-sm">—</span>;
      }
      if (assignments.length === 1) {
        return (
          <span className="text-sm font-medium truncate max-w-[180px] block" title={assignments[0].timetableName}>
            {assignments[0].timetableName}
          </span>
        );
      }
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate max-w-[140px]" title={assignments[0].timetableName}>
            {assignments[0].timetableName}
          </span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
            +{assignments.length - 1}
          </Badge>
        </div>
      );
    },
  },
  {
    accessorKey: 'periodsAssigned',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Assigned <ArrowUpDown className="ml-2 h-3 w-3" />
      </Button>
    ),
    cell: ({ getValue }) => (
      <span className="font-semibold text-indigo-700 dark:text-indigo-400">
        {getValue<number>()}
      </span>
    ),
  },
  {
    accessorKey: 'periodsMarked',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Marked <ArrowUpDown className="ml-2 h-3 w-3" />
      </Button>
    ),
    cell: ({ getValue }) => (
      <span className="font-semibold text-green-700 dark:text-green-400">
        {getValue<number>()}
      </span>
    ),
  },
  {
    accessorKey: 'periodsPending',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Pending <ArrowUpDown className="ml-2 h-3 w-3" />
      </Button>
    ),
    cell: ({ getValue }) => {
      const v = getValue<number>();
      return (
        <span className={`font-semibold ${v > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
          {v}
        </span>
      );
    },
  },
  {
    accessorKey: 'markingRate',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Rate % <ArrowUpDown className="ml-2 h-3 w-3" />
      </Button>
    ),
    cell: ({ getValue }) => {
      const v = Number(getValue<number>() ?? 0);
      const color =
        v >= 80 ? 'text-green-700 dark:text-green-400' :
        v >= 60 ? 'text-blue-700 dark:text-blue-400' :
        v >= 40 ? 'text-yellow-700 dark:text-yellow-400' :
        'text-red-600 dark:text-red-400';
      return <span className={`font-semibold ${color}`}>{v.toFixed(1)}%</span>;
    },
  },
  {
    accessorKey: 'lastMarkedAt',
    header: 'Last Marked',
    cell: ({ getValue }) => {
      const v = getValue<string | null>();
      return v ? (
        <span className="text-sm">{format(new Date(v), 'MMM d, yyyy')}</span>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      );
    },
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => getRateBadge(row.original.markingRate),
  },
];
