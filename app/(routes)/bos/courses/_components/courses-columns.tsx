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
  {
    id: 'name',
    header: 'Name',
    // Tolerant lookup — COE may surface the field as course_name, name,
    // or display_name depending on the response shape.
    cell: ({ row }) => {
      const r = row.original as BosCourseMaster & { name?: string; display_name?: string };
      return r.course_name || r.name || r.display_name || '—';
    },
  },
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
    cell: ({ row }) => {
      // Hide zero/null credits — show '—' so the column reads cleanly.
      const v = row.original.credit;
      if (v === null || v === undefined || Number(v) === 0) {
        return <span className='text-xs text-muted-foreground'>—</span>;
      }
      return Number(v).toFixed(2);
    },
  },
  {
    id: 'hours',
    header: 'L+P',
    cell: ({ row }) => {
      const t = row.original.theory_hours ?? 0;
      const p = row.original.practical_hours ?? 0;
      if (t === 0 && p === 0) return <span className='text-xs text-muted-foreground'>—</span>;
      return `${t}+${p}`;
    },
  },
  {
    id: 'marks',
    header: 'Marks',
    cell: ({ row }) => {
      const i = row.original.internal_max_mark ?? 0;
      const e = row.original.external_max_mark ?? 0;
      const t = row.original.total_max_mark ?? 0;
      if (i === 0 && e === 0 && t === 0) return <span className='text-xs text-muted-foreground'>—</span>;
      return `${i}/${e}/${t}`;
    },
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
