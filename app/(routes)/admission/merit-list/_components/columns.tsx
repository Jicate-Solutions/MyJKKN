'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Crown, Medal } from 'lucide-react';

export interface MeritListCandidate {
  id: string;
  name: string;
  program: string;
  category: string;
  academicScore: number;
  entranceScore: number;
  interviewScore: number;
  gdScore: number;
  extracurricularScore: number;
  totalScore: number;
  rank: number;
  status: string;
  email: string;
  phone: string;
  listId?: string;
}

export const MERIT_STATUS_OPTIONS = [
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'pending', label: 'Pending' },
];

export const CATEGORY_OPTIONS = [
  { value: 'General', label: 'General' },
  { value: 'OBC', label: 'OBC' },
  { value: 'SC', label: 'SC' },
  { value: 'ST', label: 'ST' },
  { value: 'EWS', label: 'EWS' },
  { value: 'Minority', label: 'Minority' },
];

export function getMeritStatusColor(status: string): string {
  const colors: Record<string, string> = {
    shortlisted: 'bg-green-100 text-green-800',
    waitlisted: 'bg-yellow-100 text-yellow-800',
    rejected: 'bg-red-100 text-red-800',
    pending: 'bg-gray-100 text-gray-800',
  };
  return colors[status] ?? 'bg-gray-100 text-gray-800';
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="flex items-center gap-1 font-bold text-yellow-600">
        <Crown className="h-4 w-4" />
        {rank}
      </span>
    );
  if (rank <= 3)
    return (
      <span className="flex items-center gap-1 font-semibold text-slate-500">
        <Medal className="h-4 w-4" />
        {rank}
      </span>
    );
  return <span className="font-medium tabular-nums">{rank}</span>;
}

export const columns: ColumnDef<MeritListCandidate>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'rank',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Rank" />
    ),
    cell: ({ row }) => <RankBadge rank={row.getValue('rank')} />,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Candidate" />
    ),
    cell: ({ row }) => {
      const email = row.original.email;
      return (
        <div className="flex flex-col">
          <span className="font-medium">{row.getValue('name')}</span>
          <span className="text-xs text-muted-foreground">{email}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'program',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Program" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.getValue('program')}</span>
    ),
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: 'category',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Category" />
    ),
    cell: ({ row }) => {
      const cat: string = row.getValue('category');
      const label =
        CATEGORY_OPTIONS.find((o) => o.value === cat)?.label ?? cat;
      return <Badge variant="outline">{label}</Badge>;
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: 'totalScore',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Total Score" />
    ),
    cell: ({ row }) => {
      const score: number = row.getValue('totalScore');
      return (
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress value={score} className="h-2 flex-1" />
          <span className="tabular-nums text-sm font-medium w-10 text-right">
            {score.toFixed(1)}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: 'academicScore',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Academic" />
    ),
    cell: ({ row }) => (
      <span className="tabular-nums text-sm">
        {(row.getValue('academicScore') as number).toFixed(1)}
      </span>
    ),
  },
  {
    accessorKey: 'entranceScore',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Entrance" />
    ),
    cell: ({ row }) => (
      <span className="tabular-nums text-sm">
        {(row.getValue('entranceScore') as number).toFixed(1)}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status: string = row.getValue('status');
      const label =
        MERIT_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
      return (
        <Badge className={getMeritStatusColor(status)}>{label}</Badge>
      );
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
];