'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { BosCourseMaster } from '@/types/bos-courses';
import { CoursesRowActions, CoursesPdfDownloadButton } from './courses-row-actions';

export function createCoursesColumns(
  institutionName?: string,
  opts?: {
    /** Hide the Part column — institutions that don't use the TN
     *  arts-college tiers (see institutionSkipsPartLevel, e.g. CET). */
    hidePart?: boolean;
    /** Show an Academic Year column — year-based models (Pharm.D/AHS) locate a
     *  course by year, not semester tiers. Per-row (a COP list mixes B.Pharm
     *  semester courses with Pharm.D year courses), so it renders "—" when absent. */
    showAcademicYear?: boolean;
  },
): ColumnDef<BosCourseMaster>[] {
  return [
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
      const r = row.original as BosCourseMaster & { course_title?: string; name?: string; display_name?: string };
      return r.course_name || r.course_title || r.name || r.display_name || '—';
    },
  },
  ...(opts?.hidePart
    ? []
    : [{ accessorKey: 'course_part_master', header: 'Part' } as ColumnDef<BosCourseMaster>]),
  ...(opts?.showAcademicYear
    ? [{
        id: 'academic_year',
        header: 'Year',
        cell: ({ row }: { row: { original: BosCourseMaster } }) => {
          // academic_year is a COE field pending the COP hand-off; tolerate absence.
          const y = (row.original as BosCourseMaster & { academic_year?: number | null }).academic_year;
          return y ? String(y) : <span className='text-xs text-muted-foreground'>—</span>;
        },
      } as ColumnDef<BosCourseMaster>]
    : []),
  {
    accessorKey: 'course_type',
    header: 'Type',
    cell: ({ row }) => {
      // Prefer COE-computed course_type_code (e.g., "Core-I"). For legacy rows
      // where COE hasn't backfilled the trigger yet, compose from parts; finally
      // fall back to plain course_type so we never render empty for an old row.
      const r = row.original;
      const composite =
        r.course_type_code
        ?? (r.course_type && r.course_level ? `${r.course_type}-${r.course_level}` : null)
        ?? r.course_type;
      return composite
        ? <Badge variant='outline'>{composite}</Badge>
        : <span className='text-xs text-muted-foreground'>—</span>;
    },
  },
  {
    accessorKey: 'credit',
    header: 'Credits',
    cell: ({ row }) => {
      // COE may return the field as 'credits' (plural) — fall back to it.
      const v = row.original.credit ?? row.original.credits;
      const n = Number(v);
      if (v === null || v === undefined || isNaN(n) || n === 0) {
        return <span className='text-xs text-muted-foreground'>—</span>;
      }
      return n % 1 === 0 ? String(n) : n.toFixed(2);
    },
  },
  {
    id: 'hours',
    header: 'L+T+P',
    cell: ({ row }) => {
      // Coerce explicitly — COE occasionally returns hours as strings.
      const t = Number(row.original.theory_hours ?? 0);
      const tut = Number(row.original.tutorial_hours ?? 0);
      const p = Number(row.original.practical_hours ?? 0);
      const tSafe = isNaN(t) ? 0 : t;
      const tutSafe = isNaN(tut) ? 0 : tut;
      const pSafe = isNaN(p) ? 0 : p;
      if (tSafe === 0 && tutSafe === 0 && pSafe === 0) return <span className='text-xs text-muted-foreground'>—</span>;
      return `${tSafe}+${tutSafe}+${pSafe}`;
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
      if (row.original.course_status?.toLowerCase() === 'locked') {
        return (
          <Badge variant='destructive' className='gap-1'>
            <Lock className='h-3 w-3' /> Locked
          </Badge>
        );
      }
      const active = row.original.is_active ?? row.original.status;
      return active
        ? <Badge variant='default'>Active</Badge>
        : <Badge variant='secondary'>Inactive</Badge>;
    },
  },
  {
    id: 'actions',
    header: () => <span className='sr-only'>Actions</span>,
    cell: ({ row }) => (
      <div className='flex items-center gap-1'>
        <CoursesPdfDownloadButton course={row.original} institutionName={institutionName} />
        <CoursesRowActions course={row.original} institutionName={institutionName} />
      </div>
    ),
  },
  ]
}
