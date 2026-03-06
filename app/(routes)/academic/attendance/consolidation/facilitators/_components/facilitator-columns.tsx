'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FacilitatorAttendanceStat } from '@/types/attendance';

function getStatusBadge(periodsMarked: number) {
  if (periodsMarked >= 30)
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Excellent</Badge>;
  if (periodsMarked >= 20)
    return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">Good</Badge>;
  if (periodsMarked >= 10)
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
    accessorKey: 'periodsMarked',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Periods Marked <ArrowUpDown className="ml-2 h-3 w-3" />
      </Button>
    ),
    cell: ({ getValue }) => (
      <span className="font-semibold text-green-700 dark:text-green-400">
        {getValue<number>()}
      </span>
    ),
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
    cell: ({ row }) => getStatusBadge(row.original.periodsMarked),
  },
];
