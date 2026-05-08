'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { BosCourseMaster } from '@/types/bos-courses';
import { CoursesRowActions } from './courses-row-actions';

export const coursesColumns: ColumnDef<BosCourseMaster>[] = [
  {
    accessorKey: 'course_code',
    header: 'Code',
    cell: ({ row }) => <span className='font-mono text-xs'>{row.original.course_code}</span>,
  },
  { accessorKey: 'course_name', header: 'Name' },
  { accessorKey: 'course_part_master', header: 'Part' },
  {
    accessorKey: 'course_type',
    header: 'Type',
    cell: ({ row }) => row.original.course_type
      ? <Badge variant='outline'>{row.original.course_type}</Badge>
      : <span className='text-xs text-muted-foreground'>—</span>,
  },
  {
    accessorKey: 'credit',
    header: 'Credits',
    cell: ({ row }) => Number(row.original.credit ?? 0).toFixed(2),
  },
  {
    id: 'hours',
    header: 'L+P',
    cell: ({ row }) => `${row.original.theory_hours}+${row.original.practical_hours}`,
  },
  {
    id: 'marks',
    header: 'Marks',
    cell: ({ row }) =>
      `${row.original.internal_max_mark}/${row.original.external_max_mark}/${row.original.total_max_mark}`,
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      if (row.original.course_status === 'Locked') {
        return (
          <Badge variant='destructive' className='gap-1'>
            <Lock className='h-3 w-3' /> Locked
          </Badge>
        );
      }
      return row.original.status
        ? <Badge variant='default'>Active</Badge>
        : <Badge variant='secondary'>Inactive</Badge>;
    },
  },
  { id: 'actions', cell: ({ row }) => <CoursesRowActions course={row.original} /> },
];
